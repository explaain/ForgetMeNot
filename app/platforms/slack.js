const chatbotController = require('../controller/chatbot');

const request = require('request');
const properties = require('../config/properties.js');
const schedule = require('node-schedule');
const chrono = require('chrono-node')
const crypto = require("crypto");
const Q = require("q");
const SlackBot = require('slackbots');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'log'});
// tracer.setLevel('error');

// Slackbot DOCS: https://api.slack.com/bot-users

/*

	1. Setting up back-n-forth comms

	* The primary way bot users interact with people on a given workspace is by connecting to the Real Time Messaging API (RTM API for short) and opening up a websocket connection with Slack.
	** DOCS: https://api.slack.com/rtm

	* (The Events API is an alternative way to receive and respond to events as a bot user contained within a Slack App. Instead of connecting over a websocket, you subscribe to specific events and messages and Slack sends them to your server.)

*/

/*

	2. Sending messages to individuals

	* chat.postEphemeral method allows a bot user to post a complex message visible only to a specific user and context.
	** DOCS: https://api.slack.com/methods/chat.postEphemeral

	* The bot user can also use the Web API to add emoji reactions to messages, upload files, pin and star messages, and generally behave like any other user on the workspace.

*/

/*

	3. Channel-wide comms

	* Web API method chat.postMessage. Set as_user to true to send messages as your bot with its username and profile image.

*/

// Dev
initateSlackBot({
	bot_access_token: "xoxb-248382524992-erAIp1lU41jRmlS4fuxWHXwW",
	bot_user_id: "U7AB8FEV6"
});

exports.oauth = function(req, res) {
	// Lifted from https://api.slack.com/tutorials/tunneling-with-ngrok

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

								/*
								TODO: Render a 'success' page
									* that tells people how to user ForgetMeNot
									* button to redirect them to channel

								TODO: Store `body`
									* Stash channel as a user (ish)
									* Stash webhook and access_token

								{
								    "access_token": "xoxp-XXXXXXXX-XXXXXXXX-XXXXX",
								    "scope": "incoming-webhook,commands,bot",
								    "team_name": "Team Installing Your Hook",
								    "team_id": "XXXXXXXXXX",
								    "incoming_webhook": {
								        "url": "https://hooks.slack.com/TXXXXX/BXXXXX/XXXXXXXXXX",
								        "channel": "#channel-it-will-post-to",
								        "configuration_url": "https://teamname.slack.com/services/BXXXXX"
								    },
								    "bot":{
								        "bot_user_id":"UTTTTTTTTTTR",
								        "bot_access_token":"xoxb-XXXXXXXXXXXX-TTTTTTTTTTTTTT"
								    }
								}
								*/
            }
        })
    }
}

var bot;

// For recognising bot-emitted user responses as userId
// Generated at page end, @method quickreply
var aliasDirectory = {
	/* name = userId */
}

function initateSlackBot(botKeychain) {
	logger.trace(initateSlackBot);

	// create a bot
	bot = new SlackBot({
	    token: botKeychain.bot_access_token
	});

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
		logger.log("Slack event:", message)

		// For now, just listen to direct addresses
		// TODO: In private messages, no address should be necessary
		var formsOfAddress = new RegExp(`^@?forgetmenot,?\s*|^<@?${botKeychain.bot_user_id}>,?\s*`,'i');
		if((message.type === "message" && formsOfAddress.test(message.text)) || message.bot_id) {
			var payload = message;
			// Remove reference to @forgetmenot
			payload.text = payload.text.replace(formsOfAddress, '')

			if(payload.subtype == 'bot_message') {
				console.log("Bot message, check for alias.");
				if(aliasDirectory[payload.username] !== undefined) {
					console.log("Bot alias:", payload.username, aliasDirectory[payload.username])
					payload.user = aliasDirectory[payload.username] // Bot posted on behalf of this user
				} else {
					console.log("No such alias. Ignoring this msg.")
					return false; // Gendit bot post, ABORT
				}
			}
			console.log("Handing this bad boy off to 😈 CHATBOT")

			// Should send data to Chatbot and return messages for emitting
			// TODO: Also support postEphemeral(id, user, text, params)
			handleMessage(
				payload,
				(response, options) => bot.postMessage(message.channel, response.message.text, options)
			)
		}
	})

	// Listen for aggressive webhooks from API
	chatbotController.acceptClientMessageFunction(
		receiveMessagesToSend,
		(response, options) => {
			bot.postMessage(response.recipient.id, response.message.text, options)
		}
	)
}

function receiveMessagesToSend(response, emitter) {
	const d = Q.defer()
	handleResponseGroup(response)
	.then(function(res) {
		d.resolve(res)
	}).catch(function(e) {
		logger.error(e)
		d.reject(e)
	})
	return d.promise
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
		// TODO: Setup buttons
		// bot.postMessage
		emitter(thisResponse, params)
		.then(x => {
			// TODO: Slackbot should stop typing
			d.resolve("200 Emitted response",x)
		})
		.catch(err => d.reject("ERROR Emitted response",err))
	}, delay);
	return d.promise;
}

exports.quickreply = function(req, res) {
	res.status(200).send();

	logger.trace(exports.quickreply);

	var reaction = JSON.parse(req.body.payload);
	// logger.log(reaction);

	// So Chatbot still recognises bot-originated message as a user message
	aliasDirectory[reaction.user.name] = reaction.user.id

	// Post on behalf of the user
	bot.postMessageToChannel(
		reaction.channel.name,
		reaction.actions[0].value,
		{
			as_user: false,
			username: reaction.user.name
		}
	).then(()=>{
		// Remove buttons
		bot.updateMessage(
			reaction.channel.id,
			reaction.message_ts,
			reaction.original_message.text,
			JSON.stringify({attachments:[{actions:"nothing"}]})
		)
		var noBtnMessage = reaction.original_message
		noBtnMessage.attachments = null
		request({
			method: "POST",
			url: reaction.response_url,
			body: noBtnMessage,
			headers: {
				Authorization: reaction.token,
		   'contentType': 'application/json',
			}
		})
		.then((r)=>logger.log("Updated msg",r))
		.catch(e=>logger.log(e))
	})
	.catch(e=>logger.log(e))

	// Post as user
	// req.body.payload
	/* {
  "actions": [
    {
      "name": "recommend",
      "value": "yes",
      "type": "button"
    }
  ],
  "callback_id": "comic_1234_xyz",
  "team": {
    "id": "T47563693",
    "domain": "watermelonsugar"
  },
  "channel": {
    "id": "C065W1189",
    "name": "forgotten-works"
  },
  "user": {
    "id": "U045VRZFT",
    "name": "brautigan"
  },
  "action_ts": "1458170917.164398",
  "message_ts": "1458170866.000004",
  "attachment_id": "1",
  "token": "xAB3yVzGS4BQ3O9FACTa8Ho4",
  "original_message": {"text":"New comic book alert!","attachments":[{"title":"The Further Adventures of Slackbot","fields":[{"title":"Volume","value":"1","short":true},{"title":"Issue","value":"3","short":true}],"author_name":"Stanford S. Strickland","author_icon":"https://api.slack.comhttps://a.slack-edge.com/bfaba/img/api/homepage_custom_integrations-2x.png","image_url":"http://i.imgur.com/OJkaVOI.jpg?1"},{"title":"Synopsis","text":"After @episod pushed exciting changes to a devious new branch back in Issue 1, Slackbot notifies @don about an unexpected deploy..."},{"fallback":"Would you recommend it to customers?","title":"Would you recommend it to customers?","callback_id":"comic_1234_xyz","color":"#3AA3E3","attachment_type":"default","actions":[{"name":"recommend","text":"Recommend","type":"button","value":"recommend"},{"name":"no","text":"No","type":"button","value":"bad"}]}]},
  "response_url": "https://hooks.slack.com/actions/T47563693/6204672533/x7ZLaiVMoECAW50Gw1ZYAXEM",
  "trigger_id": "13345224609.738474920.8088930838d88f008e0"
	} */
}

exports.dropdown = function() {
	//
}
