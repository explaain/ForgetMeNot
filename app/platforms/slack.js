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

// For recognising bot-emitted user responses as userId
// Generated at page end, @method quickreply
// TODO: Ensure this is scoped to specific workspaces / team lists
var aliasDirectory = {
	/* username = userId */
}

function initateSlackBot(botKeychain) {
	logger.trace(initateSlackBot);

	// create a bot
	bot = new SlackBot({
	    token: botKeychain.bot_access_token
	});
	rtm = new RtmClient(botKeychain.bot_access_token);
	rtm.start();

	logger.log('New Slackbot connecting.')

	bot.on('open', () => logger.log("Slackbot opened websocket.",...arguments))
	bot.on('errror', () => logger.log("Slackbot 👺 ERR'D OUT while connecting.",...arguments))
	bot.on('close', () => logger.log("Slackbot 👺 CLOSED a websocket.",...arguments))

	bot.on('start', () => {
		logger.log('Slackbot has 🙏 connected.',...arguments)

		// TODO: Remove after debug
    bot.postMessageToChannel('bot-testing', `*I'm your personal mind-palace. Invite me to this channel and ask me to remember things :)*`, {
        icon_emoji: ':sparkles:'
    });
	});

	bot.on('message', (message) => {
		// logger.log("Slack event:", message)

		// Only listen for text messages... for now.
		if(message.type !== "message") return false;

		switch (message.channel.charAt(0)) {
			// it's a public channel
			case "C":
			// it's either a private channel or multi-person DM
			case "G":
				var formsOfAddress = new RegExp(`^<?@?(forgetmenot|${botKeychain.bot_user_id})>?[,\s ]*`,'i');
				break;
			// it's a DM with the user
			case "D":
				var formsOfAddress = new RegExp(``,'i'); // listen to all messages
		}

		// Respond only when the bot's involved
		if(!formsOfAddress.test(message.text) && !message.bot_id) return false;

		// Check for bot-as-user messages
		if(message.subtype == 'bot_message' || message.bot_id) {
			// console.log("Bot message, check for alias.");
			if(aliasDirectory[message.username] !== undefined) {
				console.log("😈 Bot speaking on behalf of:", message.username, aliasDirectory[message.username])
				message.user = aliasDirectory[message.username] // Bot posted on behalf of this user
			} else {
				// console.log("No such alias. Ignoring this msg.")
				return false; // Gendit bot post, ABORT
			}
		}

		// Remove reference to @forgetmenot
		message.text = message.text.replace(formsOfAddress, '')
		message.text = message.text.trim();

		console.log("😈 CHATBOT listens to:", message)

		// Should send data to Chatbot and return messages for emitting
		// TODO: Support postEphemeral(id, user, text, params) for slash commands
		rtm.sendTyping(message.channel)
		handleMessage(message, emmiter({recipient:message.channel}))
	})

	/**
	 * Posts messages flexibly. Pass this on to the Chatbot API workflow
	 * @param {String} config.recipient required
	 * @param {String} [config.action] optional, defaults to 'postMessage'
	*/
	function emmiter(config) {
		return ({
			// Fill recipient before send
			recipient: config.recipient,
			emit: (recipient, response, options) => bot[config.action || 'postMessage'](recipient, response.message.text, options)
		})
	}

	// Listen for aggressive webhooks from API
	chatbotController.acceptClientMessageFunction((response, emitter) => {
		const d = Q.defer()
		handleResponseGroup(emmiter({recipient: null}), response)
		.then((res) => {
			d.resolve(res)
		}).catch((e) => {
			logger.error(e)
			d.reject(e)
		})
		return d.promise
	})
}

function handleMessage(payload, emitter) {
	// Transform into Facebook format.
	var payloadFormatted = { entry: [ { messaging: [ {
		sender: { id: payload.user },
		message: { text: payload.text }
	} ] } ] }

  logger.trace()
  // logger.log(req)
  chatbotController.handleMessage(payloadFormatted)
  .then(function(apiResult) {
    logger.log(JSON.stringify(apiResult, null, 2))
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
      promises.push(prepareAndSendResponses(emitter, singleResponse.data, singleResponse.delay || 0))
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

function prepareAndSendResponses(emitter, responseData, delay) {
	logger.trace(prepareAndSendResponses);
	if (responseData.json) console.log(responseData.json.message); // ???
	const d = Q.defer();
	const responseDataArray = (responseData.message && responseData.message.text) ? [responseData] : [false];
  if (responseData.message.attachment) {
    const attachmentResponseData = JSON.parse(JSON.stringify(responseData))
    delete attachmentResponseData.message.text
    responseDataArray.push(attachmentResponseData)
  }
  logger.trace()
	Q.allSettled(
		responseDataArray.map(function(thisResponse, i, array) {
      if (thisResponse.message.attachment) i = Math.max(i-1, 0) // Stop attachements from delaying before sending
			return sendResponseAfterDelay(emitter, thisResponse, delay + i*2000);
		})
	).then(function(results) {
		logger.log(results)
		d.resolve(results)
	}).catch(function(e) {
    logger.error(e)
    d.reject(e)
  })
	return d.promise;
}

function sendResponseAfterDelay(emitter, thisResponse, delay) {
	logger.trace(sendResponseAfterDelay);
	const d = Q.defer();
	// TODO: Slackbot should start 'typing'
	var params = {}
	if(thisResponse.message.quick_replies && thisResponse.message.quick_replies.length > 0) {
		params.attachments = [
			{
				"text": "Quick-reply",
				"fallback": "Oops, you can't quick-reply",
				"callback_id": thisResponse.recipient.id,
	      "color": "#FED33C",
        "attachment_type": "default",
				"actions": []
      }
		];

		thisResponse.message.quick_replies.forEach(reply => {
			params.attachments[0].actions.push({
				"type": "button",
				"name": "quickreply",
				"text": reply.title,
				"value": reply.title
			})
		})
	}
	// if (!thisResponse.sender_action) sendSenderAction(thisResponse.recipient.id, 'typing_on');
	setTimeout(function() {
		console.log("I'm about to echo ==>", thisResponse.message.text)
		if(params.attachments) console.log("Buttons should attach", params.attachments[0].actions)

		// For push-reminders and other messages with no Slack-side designated recipient
		emitter.recipient = emitter.recipient || thisResponse.recipient.id;

		emitter.emit(emitter.recipient, thisResponse, params)
		.then(x => {
			// TODO: Slackbot should stop typing
			d.resolve("200 Emitted response",x)
		})
		.catch(err => d.reject("ERROR Emitted response",err))
	}, delay);
	return d.promise;
}

exports.quickreply = function(req, res) {
	logger.trace(exports.quickreply);

	var reaction = JSON.parse(req.body.payload);
	logger.log("Quick reply pressed", reaction);

	// So Chatbot still recognises bot-originated message as a user message
	aliasDirectory[reaction.user.name] = reaction.user.id

	// Post on behalf of the user
	bot.postMessage(
		reaction.channel.id,
		reaction.actions[0].value, {
			as_user: false,
			username: reaction.user.name
		}
	).then(()=>{
		// Remove buttons
		var noBtnMessage = reaction.original_message
		noBtnMessage.attachments = {}
		noBtnMessage.ts = reaction.message_ts;
		noBtnMessage.channel = reaction.channel.id;

		res.json(noBtnMessage);
	})
	.catch(e=>logger.log(e))
}

exports.dropdown = function() {
	//
}
