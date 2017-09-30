const chatbotController = require('../controller/chatbot');

const request = require('request');
const properties = require('../config/properties.js');
const schedule = require('node-schedule');
const chrono = require('chrono-node')
const crypto = require("crypto");
const Q = require("q");
const SlackBot = require('slackbots');
const RtmClient = require('@slack/client').RtmClient;

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'log'});
// tracer.setLevel('error');

// Dev bootstrap
initateSlackBot({
	bot_access_token: "xoxb-248382524992-erAIp1lU41jRmlS4fuxWHXwW",
	bot_user_id: "U7AB8FEV6"
});

exports.oauth = function(req, res) {
	// When a user authorizes an app, a code query parameter is passed on the oAuth endpoint. If that code is not there, we respond with an error message
  if (!req.query.code) {
      res.status(500);
      res.send({"Error": "Looks like we're not getting code."});
      console.log("Looks like we're not getting code.");
  } else {
    // If it's there...

    // We'll do a GET call to Slack's `oauth.access` endpoint, passing our app's client ID, client secret, and the code we just got as query parameters.
    request({
      url: 'https://slack.com/api/oauth.access', //URL to hit
      qs: {code: req.query.code, client_id: properties.slack_client_id, client_secret: properties.slack_client_secret}, //Query string data
      method: 'GET', //Specify the method
    }, function (error, response, body) {
      if (error) {
        console.log(error);
      } else {
				var slackKeychain = JSON.parse(body)
				console.log("🤓 Bot was authorised", slackKeychain)
        res.json(slackKeychain);

				// TODO: Store this token in an encrypted DB so we can bootstrap bots after server restart
				initateSlackBot(slackKeychain.bot)
      }
    })
  }
}

var bot;
var botKeychain;

function initateSlackBot(thisBotKeychain) {
	botKeychain = thisBotKeychain

	logger.trace(initateSlackBot);

	// create a bot
	bot = new SlackBot({
	   token: thisBotKeychain.bot_access_token
	});
	rtm = new RtmClient(thisBotKeychain.bot_access_token);
	rtm.start();

	logger.log('New Slackbot connecting.')

	bot.on('open', () => logger.log("Slackbot opened websocket."))
	bot.on('errror', () => logger.log("Slackbot 👺 ERR'D OUT while connecting."))
	bot.on('close', () => logger.log("Slackbot 👺 CLOSED a websocket."))

	bot.on('start', () => {
		logger.log('Slackbot has 🙏 connected.')

		// TODO: Remove after debug
    bot.postMessageToChannel('bot-testing', `*I'm your personal mind-palace. Invite me to this channel and ask me to remember things :)*`, {
        icon_emoji: ':sparkles:'
    });
	});

	bot.on('message', (message) => {
		// logger.log("Slack event:", message)

		// Only listen for text messages... for now.
		if(message.type !== "message") return false;

		// * Transform the message so the bot replies to the right user/channel etc.
		// * Get rid of unwanted addressing (e.g. @forgetmenot)
		message = transformMessage(message);

		// Gendit bot post, ABORT
		if(!message.usable) return false;
		console.log("😈 CHATBOT listens to:", message)

		// Should send data to Chatbot and return messages for emitting
		// TODO: Support postEphemeral(id, user, text, params) for slash commands
		rtm.sendTyping(message.channel)
		handleMessage(message, emitter({recipient:message.channel}))
	})
}

/**
 * Posts messages flexibly. Pass this on to the Chatbot API workflow
 * @param {String} config.recipient required
 * @param {String} [config.action] optional, defaults to 'postMessage'
*/
function emitter(config = {}) { return ({
	// Fill recipient before send
	recipient: config.recipient || null,
	emit: (recipient, text, options) => bot.postMessage(recipient, text, options)
})}

chatbotController.acceptClientMessageFunction((response, emitter) => {
	const d = Q.defer()
	handleResponseGroup(emitter(), response)
	.then((res) => {
		d.resolve(res)
	}).catch((e) => {
		logger.error(e)
		d.reject(e)
	})
	return d.promise
})

function scopeMessage(message) {
	switch (message.channel.charAt(0)) {
		// it's a public channel
		case "C":
			message.channelType = "C";
			message.sender = message.channel; // Address the channel/group, not the user.
			message.formsOfAddress = new RegExp(`^<?@?(forgetmenot|${botKeychain.bot_user_id})>?[,\s ]*`,'i');
			break;
		// it's either a private channel or multi-person DM
		case "G":
			message.channelType = "G";
			message.sender = message.channel; // Address the channel/group, not the user.
			message.formsOfAddress = new RegExp(`^<?@?(forgetmenot|${botKeychain.bot_user_id})>?[,\s ]*`,'i');
			break;
		// it's a DM with the user
		case "D":
			message.channelType = "D";
			message.sender = message.user;
			message.formsOfAddress = new RegExp(``,'i'); // listen to all messages
			break;
	}

	return message;
}

function transformMessage(message) {
	// DMs have a slightly different format.
	if(message.message) Object.assign(message, message.message)

	message = scopeMessage(message);

	// Respond only when the bot's involved
	// But not if it's the bot posting.
	if((message.text && !message.formsOfAddress.test(message.text)) || message.bot_id) return false;

	console.log("🔧🔧⚙️🔬 Transforming an API-able message: ", message)

	// Approve it for API sending
	message.usable = true;

	// Remove reference to @forgetmenot
	if(message.text) message.text = message.text.replace(message.formsOfAddress, '')

	return message;
}

function handleMessage(message, emitter) {
	try {
		rtm.sendTyping(emitter.recipient);
	} catch(e) {}

	// Transform into Facebook format.
	var messageFormatted = { entry: [ { messaging: [ {
		sender: { id: message.channel },
		message: { }
	} ] } ] }

	if(message.text) {
		messageFormatted.entry[0].messaging[0].message.text = message.text;
	} else
	if(message.quick_reply) {
		messageFormatted.entry[0].messaging[0].message.quick_reply = {
			payload: message.quick_reply
		}
	} else
	if(message.file) {
		messageFormatted.entry[0].messaging[0].message.attachment = {
			attachment_id: message.file.id,
			type: message.file.filetype,
			payload: {
				url: message.file.permalink,
				'is_reusable': true
			}
		}
	}

	logger.log("TO API==>", JSON.stringify(messageFormatted, null, 2))

  logger.trace()
  // logger.log(req)
  chatbotController.handleMessage(messageFormatted)
  .then(function(apiResult) {
    logger.log("FROM API==>", apiResult && apiResult.messageData ? JSON.stringify(apiResult.messageData, null, 2) : "No response text.")
		// Message formatting DOCS: https://api.slack.com/docs/messages
    return handleResponseGroup(emitter, apiResult)
  })
	.catch(function(e) {
    logger.error(e);
  })
}

function handleResponseGroup(emitter, response) {
  const d = Q.defer();
  const promises = []
  if (response && response.messageData) {
    response.messageData.forEach(function(singleResponse) {
      promises.push(sendResponseAfterDelay(emitter, singleResponse.data, (singleResponse.delay || 0) * 1000))
    })
  }
  Q.allSettled(promises)
  .then(function() {
    d.resolve()
  }).catch(function(e) {
    logger.error(e)
    d.reject(e)
  })
  return d.promise;
}

function sendResponseAfterDelay(emitter, thisResponse, delay) {
	logger.trace(sendResponseAfterDelay);
	const d = Q.defer();

	// For push-reminders and other messages with no Slack-side designated recipient
	emitter.recipient = emitter.recipient || thisResponse.recipient.id;
	// rtm.sendTyping(emitter.recipient)

	logger.log("Build response with =>", thisResponse);

	var params = {
		attachments: []
	}

	if(thisResponse.message.attachment) {
		params.attachments.push({
	    "attachments": [{
        "fallback": "Here's a list of related memories.",
        "footer": "Related reminders"
      }]
		})

		thisResponse.message.attachment.payload.elements.forEach(memory => {
			var memoryAttachment = {
        "fallback": "Inspect memory",
        "color": "#FED33C",
				"callback_id": emitter.recipient, // Specify who the bot is going to speak on behalf of, and where.
        "title": memory.title,
				"text": "",
				"thumb_url": memory.image_url,
				"actions": []
      }

			// Seems these haven't been implemented in Chatbot.js yet
			memory.buttons.forEach(button => {
				memoryAttachment.actions.push({
					"type": "button",
					"name": button.payload,
					"text": button.title,
					"value": button.title
				})
			})

			params.attachments.push(memoryAttachment)
		})
	}

	if(thisResponse.message.quick_replies && thisResponse.message.quick_replies.length > 0) {
		params.attachments.push({
			"footer": "Quick actions",
			"fallback": "Oops, you can't quick-reply",
			"callback_id": emitter.recipient, // Specify who the bot is going to speak on behalf of, and where.
      "color": "#FED33C",
      "attachment_type": "default",
			"actions": []
    })

		thisResponse.message.quick_replies.forEach(reply => {
			params.attachments[params.attachments.length-1].actions.push({
				"type": "button",
				"name": reply.payload,
				"text": reply.title,
				"value": reply.title
			})
		})
	}
	// if (!thisResponse.sender_action) sendSenderAction(thisResponse.recipient.id, 'typing_on');
	setTimeout(function() {
		// if(params.attachments) console.log("Buttons should attach", params.attachments[0].actions)
		emitter.emit(emitter.recipient, thisResponse.message.text, params)
		.then(x => {
			d.resolve("200 Emitted response",x)
		})
		.catch(err => d.reject("ERROR Emitted response",err))
	}, delay);
	return d.promise;
}

// For webhooks
exports.quickreply = function(req, res) {
	logger.trace(exports.quickreply);

	var reaction = JSON.parse(req.body.payload);

	logger.log("Quick reply pressed", reaction);

	// Define this specific message sender as part of the conversational chain
	// Even if the bot itself is speaking on behalf of the user
	// var alias = `On behalf of ${reaction.channel.id.charAt(0) === 'D' ? reaction.user.name : "#"+reaction.channel.name}`
	var alias = `${reaction.user.name} via ForgetMeNot` // Maybe say when you're reacting for the group?
	// console.log("Bot posting as", alias, aliasDirectory[alias]);

	// 1. Remove the UI buttons
	var noBtnMessage = reaction.original_message
	noBtnMessage.attachments = {}
	noBtnMessage.ts = reaction.message_ts;
	noBtnMessage.channel = reaction.channel.id;

	res.json(noBtnMessage);

	// 2. Post reply to slack on behalf of user
	emitter().emit(
		// reaction.channel.id.charAt(0) === 'D' ? reaction.user.id : reaction.channel.id, // Identify by user OR by group
		// Actually, previous line should be resolved by callback_id specified in the initial message
		reaction.callback_id,
		reaction.actions[0].value,
		{
			as_user: false,
			username: alias
		}
	).then(() => {
		// 3. Post the payload to the API on behalf of user
		handleMessage({
				channel: reaction.callback_id, // converts to sender at handleMessage()
				quick_reply: reaction.actions[0].name // the payload string
			},
			emitter({recipient: reaction.callback_id})
		)
	}).catch((e)=>logger.log(e))
}

exports.dropdown = function() {
	//
}
