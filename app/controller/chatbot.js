process.env.TZ = 'Europe/London' // Forces the timezone to be London

const api = require('../controller/api');

const request = require('request');
const properties = require('../config/properties.js');
const schedule = require('node-schedule');
const crypto = require("crypto");
const Q = require("q");
const emoji = require('moji-translate');
const Randoms = require('../controller/cannedResponses.js')


const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'error'});
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




/* Get user information */
exports.fbInformation = function() {

}


/* Recieve request */
exports.handleMessage = function(body) {
	logger.trace('handleMessage')
	const d = Q.defer()
	try {
		body.entry[0].messaging.forEach(function(event) {
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
			logger.trace()
			if (postback == 'GET_STARTED_PAYLOAD') {
				sendSenderAction(sender, 'typing_on');
				firstMessage(sender);
				logger.trace()
			} else if (event.message) {
				logger.trace(event.message)
				if (event.message.quick_reply) {
					sendSenderAction(sender, 'mark_seen');
					return handleQuickReplies(event.message.quick_reply)
				}	else if ((text = event.message.text)) {
					logger.trace(text)
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
							logger.trace()
							var result = {}
							intentConfidence(sender, text)
							.then(function(res) {
								result = res
								logger.log(res)
								setContext(sender, 'lastAction', result.memories[0])
								if (result.requestData.intent == 'storeMemory' || (result.requestData.intent == 'setTask.URL' && result.requestData.triggerUrl) || (result.requestData.intent == 'setTask.dateTime' && result.requestData.triggerDateTime)) {
									return sendResponseMessage(sender, result.memories[0])
								}
							}).then(function() {
								d.resolve(result)
							}).catch(function(e) {
								logger.error(e);
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
		logger.trace('-- Error processing the webhook! --')
		logger.trace(e)
		d.reject(e)
	}
	return d.promise
}

// not sure if this method is needed any longer as get started seems to work
/*exports.createGetStarted = function(req, res) {
  logger.trace("did this even work or get called?");
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

const handleQuickReplies = function(quickReply) {
	logger.trace(handleQuickReplies)
	const d = Q.defer()
	switch (quickReply.payload) {
		case "USER_FEEDBACK_MIDDLE":
			if (getContext(sender, 'lastAction').intent == 'storeMemory' || getContext(sender, 'lastAction').intent == 'query')
			return sendCorrectionMessage(sender);
			break;

		case "USER_FEEDBACK_BOTTOM":
			if (getContext(sender, 'lastAction').intent == 'storeMemory' || getContext(sender, 'lastAction').intent == 'query')
			return sendCorrectionMessage(sender);
			break;

		case "CORRECTION_QUERY":
			deleteFromDb(sender, getContext(sender, 'lastAction').objectID)
			.then(function() {
				return intentConfidence(sender, getContext(sender, 'lastAction').sentence, {intent: 'query'})
			}).then(function(memory) {
				getContext(sender, 'lastAction') = memory;
				d.resolve(memory)
			})
			break;

		case "CORRECTION_STORE":
			intentConfidence(sender, text, {intent: 'storeMemory'})
			.then(function(memory) {
				getContext(sender, 'lastAction') = memory;
				sendResponseMessage(sender, memory)
				d.resolve(memory)
			})
			break;

		case "CORRECTION_QUERY_DIFFERENT":
			intentConfidence(sender, text, {hitNum: getContext(sender, 'lastAction').hitNum+1})
			.then(function(memory) {
				getContext(sender, 'lastAction') = memory;
				d.resolve(memory)
			})
			break;

		case "CORRECTION_ADD_ATTACHMENT":
			const updatedMemory = getContext(sender, 'lastAction')
			updatedMemory.attachments = [getContext(sender, 'holdingAttachment')];
			saveMemory(sender, updatedMemory)
			.then(function(memory) {
				if (getContext(sender, 'holdingAttachment')) setContext(sender, 'holdingAttachment', null);
				getContext(sender, 'lastAction') = memory;
				return sendResponseMessage(sender, memory)
			}).catch(function(e) {
				logger.trace(e);
				d.reject(e)
			});
			break;

		case "CORRECTION_CAROUSEL":
			tryCarousel(sender, getContext(sender, 'lastAction').sentence)
			.then(function() {
				d.resolve(memory)
			}).catch(function(e) {
				return giveUp(sender);
			})
			break;

		case "CORRECTION_GET_DATETIME":
			return sendTextMessage(sender, "Sure thing - when shall I remind you?", 0, []);
			// setContext(sender, 'apiaiContext', 'provideDateTime')
			break;

		case "CORRECTION_GET_URL":
			return sendTextMessage(sender, "Sure thing - what's the url?", 0, []);
			// setContext(sender, 'apiaiContext', 'provideURL')
			break;

		case "PREPARE_ATTACHMENT":
			return sendTextMessage(sender, "Sure thing - type your message below and I'll attach it...", 0, []);
			break;

		default:
			d.reject()
			break;
	}
	return d.promise
}

function giveUp(sender) {
	logger.trace(giveUp)
	sendGenericMessage(sender, 'dunno', getContext(sender, 'consecutiveFails'));
}

function sendGenericMessage(recipientId, type, optionalCounter) {
	const d = Q.defer()
	logger.trace(sendGenericMessage);
  // Bot didnt know what to do with message from user
	if (!Randoms.texts[type])
		type = 'dunno';
	if (type == 'dunno') {
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
  d.resolve(messageData);

	// now won't do this yet

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
				d.resolve(messageData2);
			}
		}
	} catch(e) {
		logger.trace(e);
	}

	return d.promise
}

/* function sends message back to user */

function sendSenderAction(recipientId, sender_action) {
	logger.trace(sendSenderAction);
	const d = Q.defer()
  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: sender_action
  };
  d.resolve(messageData);
	return d.promise
}
function sendTextMessage(recipientId, messageText, quickReplies) {
	logger.trace(sendTextMessage);
	const d = Q.defer()
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
  d.resolve(messageData)
	return d.promise
}
function sendCarouselMessage(recipientId, elements, delay, quickReplies) {
	logger.trace(sendCarouselMessage);
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
  return d.resolve(messageData)
}
function sendAttachmentMessage(recipientId, attachment, delay, quickReplies) {
	logger.trace(sendAttachmentMessage);
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
  return d.resolve(messageData);
}
function sendCorrectionMessage(recipientId) {
	logger.trace(sendAttachmentMessage);
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
  return d.resolve(messageData);
}
function sendAttachmentUpload(recipientId, attachmentType, attachmentUrl) {
	logger.trace(sendAttachmentUpload);
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
	// This won't work as trying to resolve with more than one argument
  return d.resolve(messageData, 0, properties.facebook_message_attachments_endpoint); /* @TODO: will this work? */
}

function firstMessage(recipientId) {
	logger.trace(firstMessage);
	const d = Q.defer()
	setContext(sender, 'onboarding', true);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Hello there!"
    }
  };
  d.resolve(messageData);
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
	return d.promise
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
	logger.trace(fetchUserDataFromFacebook);
	const d = Q.defer()
	logger.trace(properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token));
  request({
    uri: properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token),
    method: "GET"
  }, function (error, response, body) {
		if (error) {
			logger.trace(error);
			d.resolve(error)
		} else {
			logger.trace(body);
			d.resolve(JSON.parse(body))
		}
	});
	return d.promise
}



function intentConfidence(sender, message, statedData) {
	logger.trace(intentConfidence);
	const d = Q.defer()
	var result = {}

	logger.trace({sender: sender, text: message, statedData: statedData})
  api.acceptRequest({sender: sender, text: message, statedData: statedData})
  .then(function(res) {
    logger.log(res);
		result = res
    switch (result.statusCode) {
      case 200:
				logger.trace()
        switch (result.requestData.intent) {
          case 'query':
            setContext(sender, 'lastResults', result.memories)
            setContext(sender, 'lastResultTried', 0)
						logger.trace()
            return sendResult(sender, result.memories[0])
            break;
          default:
						break;
        }
        break;

      case 412:
        switch (res.requestData.intent) {
          case 'setTask.URL':
            setContext(sender, 'lastAction', memory);
            var quickReplies = [
              ["🖥 URL", "CORRECTION_GET_URL"],
              ["📂 Just store", "CORRECTION_STORE"],
            ];
            return sendTextMessage(sender, "Just to check - did you want me to remind you when you go to a certain URL, or just store this memory for later?", 0, quickReplies)
            break;

          case 'setTask.dateTime':
            setContext(sender, 'lastAction', memory);
            var quickReplies = [
              ["⏱ Date/time", "CORRECTION_GET_DATETIME"],
              ["📂 Just store", "CORRECTION_STORE"],
            ];
            return sendTextMessage(sender, "Just to check - did you want me to remind you at a certain date or time, or just store this memory for later?", 0, quickReplies)
						break;

          default:
						break;
        }
        break;
      default:
				break;
    }
  }).then(function() {
		logger.log(result)
		d.resolve(result)
  }).catch(function(e) {
    logger.error(e);
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
	logger.trace(sendResponseMessage);
	logger.log(m)
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
			logger.trace('rejecting carousel');
			d.reject();
		}
	}).catch(function(e) {
		logger.trace(e);
		d.reject(e)
	})
	return d.promise
}
// -------------------------------------------- //





function sendResult(sender, memory, confirmation) {
	const d = Q.defer()
	logger.trace(sendResult);
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
	sendTextMessage(sender, sentence, 0, !!memory.attachments)
	.then(function() {
	// 	return memory.attachments ? sendAttachmentMessage(sender, memory.attachments[0]) : Q.fcall(function() {return null});
	// }).then(function() {
		logger.log(memory)
		d.resolve(memory)
	}).catch(function(e) {
		logger.error(e);
		d.reject(e)
	});
	return d.promise
}

function tryAnotherMemory(sender) {
	logger.trace(tryAnotherMemory);
	const memory = getContext(sender, 'lastResults')[getContext(sender, 'lastResultTried')+1];
	sendResult(sender, memory);
	increaseContext(sender, 'lastResultTried');
}
// -------------------------------------------- //






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

const getEmojis = function(text, entities, max, strict) {
	if (strict) {
		const words = entities['noun'] || entities['action-noun'] || entities['verb'] || entities['action-verb']
		if (words) text = words.join(' ')
	}

	return (emoji.translate(text, true).substring(0, 2) || '✅')
}



exports.setContext = setContext;
exports.getContext = getContext;











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
	logger.trace(subscribeUser);
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
        logger.trace('User saved successfully!');
        sendTextMessage(newUser.fb_id, "You've been subscribed!")
      }
  });
}

/* remove user from database */
function unsubscribeUser(id) {
	logger.trace(unsubscribeUser);
  // built in remove method to remove user from db
  user.findOneAndRemove({fb_id: id}, function(err, user) {
    if (err) {
      sendTextMessage(id, "There was an error unsubscribing you");
    } else {
      logger.trace("User successfully deleted");
      sendTextMessage(id, "You've unsubscribed");
    }
  });
}

/* subscribed status */
function subscribeStatus(id) {
	logger.trace(subscribeStatus);
  user.findOne({fb_id: id}, function(err, user) {
    subscribeStatus = false;
    if (err) {
      logger.trace(err);
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
	logger.trace(userLocation);
  user.findOne({fb_id: id}, function(err, user) {
    location = "";
    if (err) {
      logger.trace(err);
    } else {
      if (user != null) {
        location = user.location;
        logger.trace(location);
        sendTextMessage(id, "We currently have your location set to " + location);
      }
    }
  });
}

function updateUserLocation(id, newLocation) {
	logger.trace(updateUserLocation);
  user.findOneAndUpdate({fb_id: id}, {location: newLocation}, function(err, user) {
    if (err) {
      logger.trace(err);
    } else {
      if (user != null) {
        location = user.location;
        logger.trace(location);
        sendTextMessage(id, "Your location has been updated to " + newLocation);
      }
    }
  });
}




// -----------User Memory Code Below--------------- //
function newTimeBasedMemory(id) {
	logger.trace(newTimeBasedMemory);
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
        logger.trace('User memory successfully!');
        sendTextMessage(newTimeMemory.fb_id, "I've now remembered that for you")
      }
  });
}

function returnTimeMemory(id) {
	logger.trace(returnTimeMemory);
  timeMemory.findOne({fb_id: id}, function(err, memory) {
    if (err) {
      logger.trace(err);
    } else {
      if (memory != null) {
        subject = memory.subject;
        value = memory.value;
        logger.trace(subject + " " + value);
        sendTextMessage(id, "Your " + subject + " password is " + value);
      }
    }
  });
}
// -------------------------------------------- //

// -----------User Key Value Reminder Code Below--------------- //
function newKeyValue(id, subject, value) {
	logger.trace(newKeyValue);
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
        logger.trace('User memory successfully!');
        sendTextMessage(amendKeyValue.fb_id, "I've now remembered that for you, if you want to recall it just ask \"whats my " + amendKeyValue.subject.replace(/"/g, '') + "?\"");
      }
  });
}

function returnKeyValue(id, subject) {
	logger.trace(returnKeyValue);
  keyValue.find({fb_id: id, subject: subject}, function(err, memory) {
    if (err) {
      logger.trace(err);
    } else {
      if (memory != null) {
        logger.trace(memory + "\n");
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
	logger.trace(setTimeZone);
  // Fetch timezone from lat & long.
  googleMapsClient.timezone({
      location: [-33.8571965, 151.2151398],
      timestamp: 1331766000,
      language: 'en'
    }, function(err, response) {
      if (!err) {
          sendTextMessage(sender, "From what you've told me I think you're based in " + response.json.timeZoneId + " am I right?");
        logger.trace(response);
      }
    });
}

/* set the location for a user */
function setLocation(sender) {
	logger.trace(setLocation);
  var count = 0;
  // Fetch location
  googleMapsClient.geocode({
      address: 'Sydney Opera House'
  }, function(err, response) {
    if (!err) {
      var coordinates = response.json.results[0].geometry.location;
      var lat = coordinates.lat;
      var lng = coordinates.lng;
      logger.trace(coordinates);
      return coordinates;
      //sendTextMessage(sender, "I think I found your location " + lat + " " + lng);
      //sendTextMessage(sender, "done that for you");
    }
  });
}
// -------------------------------------------- //
