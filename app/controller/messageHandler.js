process.env.TZ = 'Europe/London' // Forces the timezone to be London

const api = require('../controller/api');

const request = require('request');
const properties = require('../config/properties.js');
const schedule = require('node-schedule');
const chrono = require('chrono-node')
const crypto = require("crypto");
const Q = require("q");
const emoji = require('moji-translate');
const Randoms = require('../controller/cannedResponses.js')


const tracer = require('tracer')
const logger = tracer.colorConsole();
// tracer.setLevel('error');

//API.ai setup
const apiai = require('apiai');
const apiaiApp = apiai("bdeba24b4bcf40feb24a1b8c1f86f3f3");

// Algolia setup
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(properties.algolia_index);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);

const C = {}; // C is for Context



var getContext = function(sender, context) {
	try {
		return C[sender][context];
	} catch(e) {
		return null; //Probaby not safe!
	}
}
var setContext = function(sender, context, value) {
	try {
		if (!C[sender])
			C[sender] = {}
		C[sender][context] = value;
	} catch(e) {
		//Probaby not safe!
	}
}
var increaseContext = function(sender, context) {
	setContext(sender, context, getContext(sender, context)+1)
}


var requestPromise = function(params) {
	var d = Q.defer();
	request(params, function (error, response) {
		if (error) {
			d.reject(error)
		} else {
			d.resolve(response)
		}
	});
	return d.promise
}



// check token for connecting to facebook webhook
exports.tokenVerification = function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === properties.facebook_challenge) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);
  }
}


var setupGetStartedButton = function() {
	const d = Q.defer();
	// Check whether button exists
	const check = {
    uri: properties.facebook_profile_endpoint,
    qs: {
			fields: 'get_started',
			access_token: (process.env.FACEBOOK_TOKEN || properties.facebook_token)
		},
    method: 'GET'
  };

	// request(check, function (error, response, body) {
	// 	if (error) {
	// 		console.log(error);
	// 		d.reject(error)
	// 	} else {
	// 		console.log(body);
	// 		d.resolve(response, body)
	// 	}
	// });

	requestPromise(check)
	.then(function(response) {
		const body = response.body;
    if (response.statusCode == 200 && (!body.data || body.data.length == 0)) {
			const create = {
		    uri: properties.facebook_profile_endpoint,
		    qs: {
					access_token: (process.env.FACEBOOK_TOKEN || properties.facebook_token)
				},
		    method: 'POST',
				json: {
				  "get_started": {
				    "payload": properties.facebook_get_started_payload
					}
			  }
		  };
			return requestPromise(create)
    } else {
			throw new Error("Unable to read get started code.");
    }
	}).then(function(response) {
    d.resolve()
  }).catch(function(e) {
		console.error("Unable to proceed", e);
		d.reject(error)
	})
	return d.promise
}

setupGetStartedButton().done()

/* Get user information */
exports.fbInformation = function() {

}


/* Recieve request */
exports.handleMessage = function(req, res) {
	console.log('handleMessage');
	try {
		req.body.entry[0].messaging.forEach(function(event) {
			sender = event.sender.id;
			if (!C[sender]) C[sender] = {
				lastResults: [],
				consecutiveFails: 0,
				totalFailCount: 0
			}
			setContext(sender, 'failing', false);
			try {
				postback = null;
				postback = event.postback.payload;
			} catch (err) {}
			if (postback == 'GET_STARTED_PAYLOAD') {
				sendSenderAction(sender, 'typing_on');
				firstMessage(sender);
			} else if (event.message) {
				console.log("Dealing with message");
				if (event.message.quick_reply) {
					console.log('marking seen');
					sendSenderAction(sender, 'mark_seen');
					switch (event.message.quick_reply.payload) {
						case "USER_FEEDBACK_MIDDLE":
							if (getContext(sender, 'lastAction').intent == 'storeMemory' || getContext(sender, 'lastAction').intent == 'query')
							sendCorrectionMessage(sender);
							break;

						case "USER_FEEDBACK_BOTTOM":
							if (getContext(sender, 'lastAction').intent == 'storeMemory' || getContext(sender, 'lastAction').intent == 'query')
							sendCorrectionMessage(sender);
							break;

						case "CORRECTION_QUERY":
							deleteFromDb(sender, getContext(sender, 'lastAction').objectID)
							.then(function() {
								return intentConfidence(sender, getContext(sender, 'lastAction').sentence, {intent: 'query'})
							}).then(function(memory) {
								getContext(sender, 'lastAction') = memory;
							})
							break;

						case "CORRECTION_STORE":
							intentConfidence(sender, text, {intent: 'storeMemory'})
							.then(function(memory) {
								getContext(sender, 'lastAction') = memory;
								sendResponseMessage(sender, memory)
							})
							break;

						case "CORRECTION_QUERY_DIFFERENT":
							intentConfidence(sender, text, {hitNum: getContext(sender, 'lastAction').hitNum+1})
							.then(function(memory) {
								getContext(sender, 'lastAction') = memory;
							})
							break;

						case "CORRECTION_ADD_ATTACHMENT":
							const updatedMemory = getContext(sender, 'lastAction')
							updatedMemory.attachments = [getContext(sender, 'holdingAttachment')];
							saveMemory(sender, updatedMemory)
							.then(function(memory) {
								if (getContext(sender, 'holdingAttachment')) setContext(sender, 'holdingAttachment', null);
								getContext(sender, 'lastAction') = memory;
								sendResponseMessage(sender, memory)
							}).catch(function(e) {
								console.log(e);
							});
							break;

						case "CORRECTION_CAROUSEL":
							tryCarousel(sender, getContext(sender, 'lastAction').sentence)
							.then(function() {

							}).catch(function(e) {
								giveUp(sender);
							})
							break;

						case "CORRECTION_GET_DATETIME":
							sendTextMessage(sender, "Sure thing - when shall I remind you?", 0, []);
							// setContext(sender, 'apiaiContext', 'provideDateTime')
							break;

						case "CORRECTION_GET_URL":
							sendTextMessage(sender, "Sure thing - what's the url?", 0, []);
							// setContext(sender, 'apiaiContext', 'provideURL')
							break;

						case "PREPARE_ATTACHMENT":
							sendTextMessage(sender, "Sure thing - type your message below and I'll attach it...", 0, []);
							break;

						default:
							break;
					}
				}	else if ((text = event.message.text)) {
					sendSenderAction(sender, 'typing_on'); // Ideally this would happen after checking we actually want to respond
					// Handle a text message from this sender
					switch(text) {
						case "test":
							sendTextMessage(sender, "Test reply!");
							break;
						case "begin":
							firstMessage(sender);
							break;
						case "account":
							fetchUserData(sender);
							break;
						case "location":
							setTimeZone(sender)
							break;
						case "subscribe":
							subscribeUser(sender)
							break;
						case "unsubscribe":
							unsubscribeUser(sender)
							break;
						case "subscribestatus":
							subscribeStatus(sender)
							break;
						case "test memory":
							newTimeBasedMemory(sender)
							break;
						case "set timezone":
							setLocation(sender)
							break;
						case "whats my time zone":
							userLocation(sender)
							break;
						case "test this":
							updateUserLocation(sender, "Bristol")
							break;
						default: {
							intentConfidence(sender, text)
							.then(function(memory) {
								setContext(sender, 'lastAction', memory)
								if (memory.intent == 'storeMemory' || (memory.intent == 'setTask.URL' && memory.triggerUrl) || (memory.intent == 'setTask.dateTime' && memory.triggerDateTime)) {
									sendResponseMessage(sender, memory)
								}
							}).catch(function(e) {
								console.log(e);
								tryCarousel(sender, message)
								.then(function() {

								}).catch(function(e) {
									giveUp(sender);
								})
							})
						}
					}
					setContext(sender, 'expectingAttachment', null);
				} else if ((attachments = event.message.attachments)) {
					const type = attachments[0].type;
					const url = (type=='fallback') ? attachments[0].url : attachments[0].payload.url;
					setContext(sender, 'holdingAttachment', {
						type: type,
						url: url,
						userID: sender
					});
          const quickReplies = [
            ["⤴️ Previous", "CORRECTION_ADD_ATTACHMENT"],
            ["⤵️ Next", "PREPARE_ATTACHMENT"],
          ];
					sendTextMessage(sender, "Did you want me to add this " + type + " to the previous message or the next one?", 0, quickReplies)
				}
			}
		});
	} catch(e) {
		console.log('-- Error processing the webhook! --')
		console.log(e)
	}
	res.sendStatus(200);
}

// not sure if this method is needed any longer as get started seems to work
/*exports.createGetStarted = function(req, res) {
  console.log("did this even work or get called?");
  var data = {
    setting_type: "call_to_actions",
    thread_state: "new_thread",
    call_to_actions:[{
      payload:"first connection"
    }]
  };
  prepareAndSendMessages(data);
}

curl -X POST -H "Content-Type: application/json" -d '{
   "setting_type":"call_to_actions",
   "thread_state":"new_thread",
   "call_to_actions":[
     {
       "payload":"first_connection"
     }
   ]
 }' "https://graph.facebook.com/v2.6/me/thread_settings?access_token=EAASK9LRTpCQBAGuZBYYhyJZBA9ZBfxZAX8X431tDkpZCEJzFu1JjrAANKEAD4kq86kAxVdsEIPNc0BHlLHo0wCh9vZAQO6qCSTGAvZA33Wwq8mrDcZCF6J41Lu7KVIA9pSIcQAS3ZCAW5nruqj9BDH8h7PKenNJ0x3a29lv6VTWcszwZDZD"

*/

function prepareAndSendMessages(messageData, delay, endpoint) {
	console.log(prepareAndSendMessages);
	if (messageData.json) console.log(messageData.json.message);
	const d = Q.defer();
	const textArray = (messageData.message && messageData.message.text) ? longMessageToArrayOfMessages(messageData.message.text, 640) : [false];
	const messageDataArray = textArray.map(function(text) {
		const data = JSON.parse(JSON.stringify(messageData));
		if (text) data.message.text = text;
		return data;
	});
	Q.allSettled(
		messageDataArray.map(function(message, i, array) {
			return sendMessageAfterDelay(message, delay + i*2000, endpoint);
		})
	).then(function(results) {
		d.resolve(results)
	});
	return d.promise;
}

function sendMessageAfterDelay(message, delay, endpoint) {
	console.log(sendMessageAfterDelay);
	const d = Q.defer();
	if (!message.sender_action && delay > 0) sendSenderAction(sender, 'typing_on');
	setTimeout(function() {
		callSendAPI(message, endpoint)
		.then(function(body) {
			d.resolve(body)
		}).catch(function(err) {
			d.reject(err)
		});
	}, delay);
	return d.promise;
}

/* being able to send the message */
var callSendAPI = function(messageData, endpoint) {
	const d = Q.defer();
	if (messageData.message && !getContext(messageData.recipient.id, 'failing')) {
		setContext(messageData.recipient.id, 'consecutiveFails', 0)
	}
	const requestData = {
    uri: (endpoint || properties.facebook_message_endpoint),
    qs: { access_token: (process.env.FACEBOOK_TOKEN || properties.facebook_token) },
    method: 'POST',
    json: messageData
  };
  request(requestData, function (error, response, body) {
    if (!error && response.statusCode == 200) {
			if (body.recipient_id) {
				console.log("Successfully sent message with id %s to recipient %s", body.message_id, body.recipient_id);
			} else if (body.attachment_id) {
				console.log("Successfully saved attachment");
			}
			d.resolve(body);
    } else {
      console.error("Unable to send message.", error);
			d.reject(error);
    }
  });
	return d.promise;
}

function giveUp(sender) {
	sendGenericMessage(sender, 'dunno', getContext(sender, 'consecutiveFails'));
}

function sendGenericMessage(recipientId, type, optionalCounter) {
	console.log(sendGenericMessage);
  // Bot didnt know what to do with message from user
	if (!Randoms.texts[type])
		type = 'dunno';
	if (type == 'dunno') {
		console.log(giveUp);
		setContext(sender, 'failing', true)
		increaseContext(sender, 'totalFailCount')
		if (getContext(sender, 'consecutiveFails') < 4) increaseContext(sender, 'consecutiveFails');
	}
	const text = (typeof optionalCounter!=undefined && Array.isArray(Randoms.texts[type][0])) ? Randoms.texts[type][optionalCounter] : Randoms.texts[type];
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text[Math.floor(Math.random() * text.length)]
    }
  };
  prepareAndSendMessages(messageData);

	try {
		if (Randoms.gifs[type] && Math.floor(Math.random()*5)==0) { // (C[recipientId].totalFailCount < 5 || Math.floor(Math.random()*(C[recipientId].totalFailCount/4))==0 )) {
			const gif = optionalCounter ? Randoms.gifs[type][optionalCounter] : Randoms.gifs[type];
			if (gif) {
				var messageData2 = {
					recipient: {
						id: recipientId
					},
					message: {
						attachment: {
							type: "image",
							payload: {
								url: gif[Math.floor(Math.random() * gif.length)]
							}
						}
					}
				};
				prepareAndSendMessages(messageData2);
			}
		}
	} catch(e) {
		console.log(e);
	}

}

/* function sends message back to user */

function sendSenderAction(recipientId, sender_action) {
	console.log(sendSenderAction);
  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: sender_action
  };
  prepareAndSendMessages(messageData);
}
function sendTextMessage(recipientId, messageText, delay, quickReplies) {
	console.log(sendTextMessage);
	// messageText = messageText.replace(/"/g, '\"').replace(/'/g, '\'').replace(/\//g, '\/').replace(/‘/g, '\‘');
	messageText = messageText.replace(/"/g, '\"').replace(/'/g, '\'').replace(/\//g, '\/').replace(/‘/g, '\‘').replace(/’/g, '\’').replace(/’/g, '\’');
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
	messageData.message.quick_replies = getQuickReplies(quickReplies, !quickReplies || quickReplies.length)
  return prepareAndSendMessages(messageData, delay)
}
function sendCarouselMessage(recipientId, elements, delay, quickReplies) {
	console.log(sendCarouselMessage);
	// messageText = messageText.replace(/"/g, '\"').replace(/'/g, '\'').replace(/\//g, '\/').replace(/‘/g, '\‘');
	// messageText = messageText.replace(/"/g, '\"').replace(/'/g, '\'').replace(/\//g, '\/').replace(/‘/g, '\‘').replace(/’/g, '\’').replace(/’/g, '\’');
  var messageData = {
    recipient: {
      id: recipientId
    },
		message: {
			attachment: {
				type: 'template',
				payload: {
					template_type: 'generic',
					elements: elements
				}
			}
		}
  };
	messageData.message.quick_replies = getQuickReplies(quickReplies, !quickReplies || quickReplies.length)
  return prepareAndSendMessages(messageData, delay)
}
function sendAttachmentMessage(recipientId, attachment, delay, quickReplies) {
	console.log(sendAttachmentMessage);
	const messageAttachment = attachment.attachment_id ? {
		type: attachment.type,
		payload: {
			attachment_id: attachment.attachment_id
		}
	} : {
		type: attachment.type,
		payload: {
			url: attachment.url
		}
	}
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
			attachment: messageAttachment
    }
  };
	messageData.message.quick_replies = getQuickReplies(quickReplies, !quickReplies || quickReplies.length)
  return prepareAndSendMessages(messageData);
}
function sendCorrectionMessage(recipientId) {
	console.log(sendAttachmentMessage);
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
			text: "Whoops - was there something you would have preferred me to do?"
    }
  };
	switch (getContext(sender, 'lastAction').intent) {
		case 'storeMemory':
			var quickReplies = [
				["💭 Recall a memory", "CORRECTION_QUERY"]
			]
			messageData.message.quick_replies = getQuickReplies(quickReplies)
			break;
		case 'query':
			var quickReplies = [
				["🔀 Recall a different memory", "CORRECTION_QUERY_DIFFERENT"],
				["👨‍👩‍👧‍👦 Show me all related memories", "CORRECTION_CAROUSEL"],
				["💬 Store this memory", "CORRECTION_STORE"],
			]
			messageData.message.quick_replies = getQuickReplies(quickReplies)
			if (getContext(sender, 'lastAction').failed) {
				messageData.message.quick_replies = [messageData.message.quick_replies[2]]
			}
			break;
	}
  return prepareAndSendMessages(messageData);
}
function sendAttachmentUpload(recipientId, attachmentType, attachmentUrl) {
	console.log(sendAttachmentUpload);
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
			attachment: {
	      type: attachmentType,
	      payload: {
	        url: attachmentUrl,
					'is_reusable': true
	      }
	    }
    }
  };
  return prepareAndSendMessages(messageData, 0, properties.facebook_message_attachments_endpoint); /* @TODO: will this work? */
}

function firstMessage(recipientId) {
	console.log(firstMessage);
	setContext(sender, 'onboarding', true);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Hello there!"
    }
  };
  prepareAndSendMessages(messageData);
	setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
	setTimeout(function() {
		sendTextMessage(recipientId, "Nice to meet you. I'm ForgetMeNot, your helpful friend with (if I say so myself) a pretty darn good memory! 😇", 0, []);
		setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
		setTimeout(function() {
			sendTextMessage(recipientId, "Ask me to remember things and I'll do just that. Then later you can ask me about them and I'll remind you! 😍", 0, []);
			setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
			setTimeout(function() {
				sendTextMessage(recipientId, "To get started, let's try an example. Try typing the following: \n\nMy secret superpower is invisibility", 0, []);
			}, 6000);
		}, 4000);
	}, 1000);
}


const getQuickReplies = function(quickReplies, useDefaults) {
	if (!quickReplies && useDefaults) {
		quickReplies = [
			["😍", "USER_FEEDBACK_TOP"],
			["✏️", "USER_FEEDBACK_MIDDLE"],
			["😔", "USER_FEEDBACK_BOTTOM"],
		]
	}
	return quickReplies.map(function(r) {
		return {
			content_type: "text",
			title: r[0],
			payload: r[1]
		}
	})
}

function fetchUserDataFromFacebook(recipientId) {
	console.log(fetchUserDataFromFacebook);
	const d = Q.defer()
	console.log(properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token));
  request({
    uri: properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token),
    method: "GET"
  }, function (error, response, body) {
		if (error) {
			console.log(error);
			d.resolve(error)
		} else {
			console.log(body);
			d.resolve(JSON.parse(body))
		}
	});
	return d.promise
}



function intentConfidence(sender, message, statedData) {
	console.log(intentConfidence);
	const d = Q.defer()

  api.acceptRequest({sender: sender, message: message, statedData: statedData})
  .then(function(req, res) {
    console.log('res.body');
    console.log(res.body);
    console.log(res.statusCode);
    switch (res.statusCode) {
      case 200:
        switch (res.body.intent) {
          case 'query':
            setContext(sender, 'lastResults', content.hits)
            setContext(sender, 'lastResultTried', 0)
            return sendResult(sender, res.body);
            break;
          default:

        }
        d.resolve(res.body)
        break;

      case 412:
        switch (res.body.intent) {
          case 'setTask.URL':
            setContext(sender, 'lastAction', memory);
            var quickReplies = [
              ["🖥 URL", "CORRECTION_GET_URL"],
              ["📂 Just store", "CORRECTION_STORE"],
            ];
            sendTextMessage(sender, "Just to check - did you want me to remind you when you go to a certain URL, or just store this memory for later?", 0, quickReplies)
            d.resolve(memory);
            break;

          case 'setTask.dateTime':
            setContext(sender, 'lastAction', memory);
            var quickReplies = [
              ["⏱ Date/time", "CORRECTION_GET_DATETIME"],
              ["📂 Just store", "CORRECTION_STORE"],
            ];
            sendTextMessage(sender, "Just to check - did you want me to remind you at a certain date or time, or just store this memory for later?", 0, quickReplies)
            // .then() ???
            d.resolve(memory);

          default:

        }
        break;
      default:

    }
  }).catch(function(e) {
    console.log(e);
    tryCarousel(sender, message)
  })


  // request('/api', function (error, response, body) {
  //   if (error) {
  //   } else {
  //   }
  // });

	return d.promise
}

const sendResponseMessage = function(sender, m) {
	console.log(sendResponseMessage);
	const d = Q.defer()
	switch (m.intent) {
		case 'storeMemory':
			m.confirmationSentence = "I've now remembered that for you! " + m.sentence;
			break;

		case 'setTask.URL':
			m.confirmationSentence = "I've now set that reminder for you! 🔔 \n\n"
															+ m.actionSentence + '\n'
															+ '🖥 ' + m.triggerUrl;
			break;

		case 'setTask.dateTime':
			m.confirmationSentence = "I've now set that reminder for you! 🕓 \n\n"
			 												+ m.actionSentence + '\n'
															+ '🗓 ' + m.triggerDateTime.toDateString() + '\n'
															+ '⏱ ' + m.triggerDateTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'} )

			break;

		default:

	}
	sendResult(sender, m, true)
	.then(function() {
		return getContext(sender, 'onboarding') ? sendTextMessage(sender, "Now try typing: \n\nWhat\'s my secret superpower?", 1500, []) : Q.fcall(function() {return null});
	}).then(function() {
		d.resolve();
	}).catch(function(e) {
		d.reject(e);
	})
	return d.promise;
}


const tryCarousel = function(sender, message, cards) {
	const d = Q.defer()
	searchDb(AlgoliaIndex,
		{
			query: message,
			filters: 'userID: ' + sender,
			hitsPerPage: 10
		}
	).then(function(content) {
		if (content.hits.length) {
			const elements = content.hits.map(function(card) {
				return {
					title: card.sentence,
					subtitle: ' ',
					image_url: card.hasAttachments && card.attachments[0].url.indexOf('cloudinary') > -1 ? card.attachments[0].url : 'http://res.cloudinary.com/forgetmenot/image/upload/v1504715822/carousel_sezreg.png'
				}
			})
			sendCarouselMessage(sender, elements, 0, [])
			.then(function() {
				d.resolve()
			})
		} else {
			console.log('rejecting carousel');
			d.reject();
		}
	}).catch(function(e) {
		console.log(e);
		d.reject(e)
	})
	return d.promise
}
// -------------------------------------------- //





function sendResult(sender, memory, confirmation) {
	const d = Q.defer()
	console.log(sendResult);
	var sentence = confirmation ? memory.confirmationSentence : memory.sentence;
	if (memory.listItems) {
		sentence += '\n\n' + memory.listItems.map(function(key) {
			const card = memory.listCards[key]
			const text = card.sentence
			return getEmojis(text, card.entities, 1, true) + ' ' + text
		}).join('\n')
	}
	if (memory.attachments) {
		if (~[".","!","?",";"].indexOf(sentence[sentence.length-1])) sentence = sentence.substring(0, sentence.length - 1);;
		sentence+=" ⬇️";
	}
	return sendTextMessage(sender, sentence, 0, !!memory.attachments)
	.then(function() {
		console.log('memory.attachments');
		console.log(memory.attachments);
		return memory.attachments ? sendAttachmentMessage(sender, memory.attachments[0]) : Q.fcall(function() {return null});
	}).then(function() {
		d.resolve()
	}).catch(function(err) {
		console.log(err);
		d.reject(err)
	});
	return d.promise
}

function tryAnotherMemory(sender) {
	console.log(tryAnotherMemory);
	const memory = getContext(sender, 'lastResults')[getContext(sender, 'lastResultTried')+1];
	sendResult(sender, memory);
	increaseContext(sender, 'lastResultTried');
}
// -------------------------------------------- //






function longMessageToArrayOfMessages(message, limit) { // limit is in characters
	console.log(longMessageToArrayOfMessages);
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
	console.log(splitChunk);
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

const getEmojis = function(text, entities, max, strict) {
	if (strict) {
		const words = entities['noun'] || entities['action-noun'] || entities['verb'] || entities['action-verb']
		if (words) text = words.join(' ')
	}

	return (emoji.translate(text, true).substring(0, 2) || '✅')
}



exports.setContext = setContext;
exports.getContext = getContext;
exports.callSendAPI = callSendAPI;












// --- Not current in use ---
const googleMapsClient = require('../api_clients/googleMapsClient.js');
// models for users and the memories/reminders they submit
const user = require('../model/user');
const timeMemory = require('../model/timeBasedMemory');
const keyValue = require('../model/rememberKeyValue');
// user information global variable
var first_name = "";
var id = "";






/* Save a user to the database */
function subscribeUser(id) {
	console.log(subscribeUser);
  var newUser = new user({
    fb_id: id,
    location: "placeholder"
  });
  user.findOneAndUpdate(
    {fb_id: newUser.fb_id},
    {fb_id: newUser.fb_id, location: newUser.location},
    {upsert:true}, function(err, user) {
      if (err) {
        sendTextMessage(id, "There was error subscribing you");
      } else {
        console.log('User saved successfully!');
        sendTextMessage(newUser.fb_id, "You've been subscribed!")
      }
  });
}

/* remove user from database */
function unsubscribeUser(id) {
	console.log(unsubscribeUser);
  // built in remove method to remove user from db
  user.findOneAndRemove({fb_id: id}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There was an error unsubscribing you");
    } else {
      console.log("User successfully deleted");
      sendTextMessage(id, "You've unsubscribed");
    }
  });
}

/* subscribed status */
function subscribeStatus(id) {
	console.log(subscribeStatus);
  user.findOne({fb_id: id}, function(err, user) {
    subscribeStatus = false;
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        subscribeStatus = true;
      }
      sendTextMessage(id, "Your status is " + subscribeStatus);
    }
  });
}

/* find the users location from the db */
function userLocation(id) {
	console.log(userLocation);
  user.findOne({fb_id: id}, function(err, user) {
    location = "";
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        location = user.location;
        console.log(location);
        sendTextMessage(id, "We currently have your location set to " + location);
      }
    }
  });
}

function updateUserLocation(id, newLocation) {
	console.log(updateUserLocation);
  user.findOneAndUpdate({fb_id: id}, {location: newLocation}, function(err, user) {
    if (err) {
      console.log(err);
    } else {
      if (user != null) {
        location = user.location;
        console.log(location);
        sendTextMessage(id, "Your location has been updated to " + newLocation);
      }
    }
  });
}




// -----------User Memory Code Below--------------- //
function newTimeBasedMemory(id) {
	console.log(newTimeBasedMemory);
  var newTimeMemory = new timeMemory({
    fb_id: id,
    subject: "WiFi",
    value: "wifipassword"
  });
  timeMemory.findOneAndUpdate(
    {fb_id: newTimeMemory.fb_id},
    {fb_id: newTimeMemory.fb_id, subject: newTimeMemory.subject, value: newTimeMemory.value},
    {upsert:true}, function(err, user) {
      if (err) {
        sendTextMessage(id, "I couldn't remember that");
      } else {
        console.log('User memory successfully!');
        sendTextMessage(newTimeMemory.fb_id, "I've now remembered that for you")
      }
  });
}

function returnTimeMemory(id) {
	console.log(returnTimeMemory);
  timeMemory.findOne({fb_id: id}, function(err, memory) {
    if (err) {
      console.log(err);
    } else {
      if (memory != null) {
        subject = memory.subject;
        value = memory.value;
        console.log(subject + " " + value);
        sendTextMessage(id, "Your " + subject + " password is " + value);
      }
    }
  });
}
// -------------------------------------------- //

// -----------User Key Value Reminder Code Below--------------- //
function newKeyValue(id, subject, value) {
	console.log(newKeyValue);
  var amendKeyValue = new keyValue({
    fb_id: id,
    subject: subject,
    value: value
  });
  keyValue.findOneAndUpdate(
    {fb_id: amendKeyValue.fb_id, subject: amendKeyValue.subject},
    {fb_id: amendKeyValue.fb_id, subject: amendKeyValue.subject, value: amendKeyValue.value},
    {upsert:true}, function(err, user) {
      if (err) {
        sendTextMessage(id, "I couldn't remember that");
      } else {
        console.log('User memory successfully!');
        sendTextMessage(amendKeyValue.fb_id, "I've now remembered that for you, if you want to recall it just ask \"whats my " + amendKeyValue.subject.replace(/"/g, '') + "?\"");
      }
  });
}

function returnKeyValue(id, subject) {
	console.log(returnKeyValue);
  keyValue.find({fb_id: id, subject: subject}, function(err, memory) {
    if (err) {
      console.log(err);
    } else {
      if (memory != null) {
        console.log(memory + "\n");
        var returnValue = memory[0].value;
        returnValue = returnValue.replace(/"/g, '');
        sendTextMessage(id, returnValue);
      }
    }
  });
}
// -------------------------------------------- //




// -----------Google API Code Below--------------- //
/* query geolocation */
function setTimeZone(sender) {
	console.log(setTimeZone);
  // Fetch timezone from lat & long.
  googleMapsClient.timezone({
      location: [-33.8571965, 151.2151398],
      timestamp: 1331766000,
      language: 'en'
    }, function(err, response) {
      if (!err) {
          sendTextMessage(sender, "From what you've told me I think you're based in " + response.json.timeZoneId + " am I right?");
        console.log(response);
      }
    });
}

/* set the location for a user */
function setLocation(sender) {
	console.log(setLocation);
  var count = 0;
  // Fetch location
  googleMapsClient.geocode({
      address: 'Sydney Opera House'
  }, function(err, response) {
    if (!err) {
      var coordinates = response.json.results[0].geometry.location;
      var lat = coordinates.lat;
      var lng = coordinates.lng;
      console.log(coordinates);
      return coordinates;
      //sendTextMessage(sender, "I think I found your location " + lat + " " + lng);
      //sendTextMessage(sender, "done that for you");
    }
  });
}
// -------------------------------------------- //
