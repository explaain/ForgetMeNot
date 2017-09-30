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

function initateSlackBot(botKeychain) {
	// create a bot
	bot = new SlackBot({
	    token: botKeychain.bot_access_token
	});

	console.log('New Slackbot connecting.')

	bot.on('open', () => console.log("Slackbot opened websocket.",...arguments))
	bot.on('errror', () => console.log("Slackbot 👺 ERR'D OUT while connecting.",...arguments))
	bot.on('close', () => console.log("Slackbot 👺 CLOSED a websocket.",...arguments))

	bot.on('start', () => {
		console.log('Slackbot has 🙏 connected.',...arguments)

    bot.postMessageToChannel('bot-testing', `*I'm your personal mind-palace. Invite me to this channel and ask me to remember things :)*`, {
        icon_emoji: ':sparkles:'
    });
	});

	bot.on('message', (message) => {
		console.log("Slack event:", message)

		// For now, just listen to direct addresses
		// TODO: In private messages, no address should be necessary
		var formsOfAddress = new RegExp(`^@?forgetmenot|^<@?${botKeychain.bot_user_id}>`,'i');
		if(message.type === "message" && formsOfAddress.test(message.text)) {
			console.log("Handing this bad boy off to 😈 CHATBOT")
			var payload = message;

			// Remove reference to @forgetmenot
			payload.text = payload.text.replace(/@?forgetmenot,?[\s]*/i,'');


			// Should send data to Chatbot and return messages for emitting
			// TODO: Also support postEphemeral(id, user, text, params)
			handleMessage(
				message,
				(response, options = {}) => bot.postMessage(message.channel, response, options)
			)
		}
	})
}

// If we want to use the Event API instead...
exports.handleEvent = function(req, res) {
	console.log("New Slack event:",req.body)
	// return res.send(req.body.challenge); // Should only be needed once, to confirm URL
}

handleMessage = function(message, emitter) {
	// Transform into Facebook format.
	var payload = { entry: [ { messaging: [ {
		sender: { id: message.user },
		message: { text: message.text }
	} ] } ] }

  logger.trace()
  // logger.log(req)
  chatbotController.handleMessage(payload)
  .then(function(apiResult) {
		// Message formatting DOCS: https://api.slack.com/docs/messages
    logger.log(apiResult)
    logger.log(JSON.stringify(apiResult, null, 2))
    return handleMessageGroup(emitter, apiResult)
  })
	.catch(function(e) {
    logger.error(e);
  })
}

const handleMessageGroup = function(emitter, result) {
  const d = Q.defer();
  const promises = []
  if (result && result.messageData) {
    result.messageData.forEach(function(singleMessage) {
      promises.push(prepareAndSendMessages(emitter, singleMessage.data, singleMessage.delay || 0))
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

function prepareAndSendMessages(emitter, messageData, delay) {
	logger.trace(prepareAndSendMessages);
	if (messageData.json) console.log(messageData.json.message); // ???
	const d = Q.defer();
	const textArray = (messageData.message && messageData.message.text) ? longMessageToArrayOfMessages(messageData.message.text, 640) : [false];
	const messageDataArray = textArray.map(function(text) {
		const data = JSON.parse(JSON.stringify(messageData));
    delete data.message.attachment
		if (text) data.message.text = text;
		return data;
	});
  if (messageData.message.attachment) {
    const attachmentMessageData = JSON.parse(JSON.stringify(messageData))
    delete attachmentMessageData.message.text
    messageDataArray.push(attachmentMessageData)
  }
  logger.trace()
	Q.allSettled(
		messageDataArray.map(function(message, i, array) {
      if (message.message.attachment) i = Math.max(i-1, 0) // Stop attachements from delaying before sending
			return sendMessageAfterDelay(emitter, message, delay + i*2000);
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

function longMessageToArrayOfMessages(message, limit) { // limit is in characters
	logger.trace(longMessageToArrayOfMessages);
	var counter = 0;
	var messageArray = [];
	while (message.length > limit && counter < 30) { // Once confident this loop won't be infinite we can remove the counter
		const split = splitChunk(message, limit);
		messageArray.push(split[0]);
		message = split[1];
		counter++;
	}
	messageArray.push(message);
	return messageArray;
}

function splitChunk(message, limit) {
	logger.trace(splitChunk);
	var shortened = message.substring(0, limit)
	if (shortened.indexOf("\n") > -1) shortened = shortened.substring(0, shortened.lastIndexOf("\n"));
	else if (shortened.indexOf(". ") > -1) shortened = shortened.substring(0, shortened.lastIndexOf(". ")+1);
	else if (shortened.indexOf(": ") > -1) shortened = shortened.substring(0, shortened.lastIndexOf(": ")+1);
	else if (shortened.indexOf("; ") > -1) shortened = shortened.substring(0, shortened.lastIndexOf("; ")+1);
	else if (shortened.indexOf(", ") > -1) shortened = shortened.substring(0, shortened.lastIndexOf(", ")+1);
	else if (shortened.indexOf(" ") > -1) shortened = shortened.substring(0, shortened.lastIndexOf(" "));
	var remaining = message.substring(shortened.length, message.length);
	shortened = shortened.trim().replace(/^\s+|\s+$/g, '').trim();
	remaining = remaining.trim().replace(/^\s+|\s+$/g, '').trim();
	return [shortened, remaining];
}

function sendMessageAfterDelay(emitter, message, delay) {
	logger.trace(sendMessageAfterDelay);
	const d = Q.defer();
	var params = {}
	if(message.quick_replies && message.quick_replies.length > 0) {
		params.attachments = [
			{
        "attachment_type": "default",
        "actions": []
      }
		]

		message.quick_replies.forEach(reply => {
			params.attachments.push({
				"type": "button",
				"name": reply.title,
				"text": reply.title,
				"value": reply.payload
			})
		})
	}
	// if (!message.sender_action) sendSenderAction(message.recipient.id, 'typing_on');
	setTimeout(function() {
		emitter(message.text, params)
		.then(x => d.resolve(x))
		.catch(x => d.reject(err))
	}, delay);
	return d.promise;
}

// function sendSenderAction(recipientId, sender_action) {
// 	logger.trace(sendSenderAction);
// 	const d = Q.defer()
//   var messageData = {
//     recipient: {
//       id: recipientId
//     },
//     sender_action: sender_action
//   };
// 	callSendAPI(messageData, properties.facebook_message_endpoint)
// 	.then(function(body) {
// 		d.resolve(body)
// 	}).catch(function(err) {
//     logger.error(err)
// 		d.reject(err)
// 	});
// 	return d.promise
// }
