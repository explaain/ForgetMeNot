/* @TODO: See whether we can just return promises directly in functions */

var request = require('request');
var properties = require('../config/properties.js');
var schedule = require('node-schedule');
var googleMapsClient = require('../api_clients/googleMapsClient.js');
var Wit = require('node-wit').Wit;
//var interactive = require('node-wit').interactive;

// models for users and the memories/reminders they submit
var user = require('../model/user');
var timeMemory = require('../model/timeBasedMemory');
var keyValue = require('../model/rememberKeyValue');

// Algolia setup
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{
	protocol: 'https:'
});
const AlgoliaIndex = AlgoliaClient.initIndex(properties.algolia_index);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);

const cloudinary = require('cloudinary');
cloudinary.config({
  cloud_name: 'forgetmenot',
  api_key: '645698655223266',
  api_secret: 'j2beHW2GZSpQ_zq_8bkmnWgW95k'
});

const crypto = require("crypto");
const Q = require("q");

// user information global variable
var first_name = "";
var id = "";

const C = {}; // C is for Context
C.consecutiveWitErrorCount = 0;



var getContext = function(sender, context) {
	try {
		return C[sender][context];
	} catch(e) {
		return null; //Probaby not safe!
	}
}
var setContext = function(sender, context, value) {
	try {
		C[sender][context] = value;
	} catch(e) {
		//Probaby not safe!
	}
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



// Wit AI
var witClient = new Wit({
  accessToken: properties.wit_ai_server_access,
  actions: {
    send(request, response) {
      return new Promise(function(resolve, reject) {
        const {sessionId, context, entities} = request;
        const {text, quickreplies} = response;
        console.log('user said...', request.text);
        console.log('sending...', JSON.stringify(response.text));
        console.log('quick response...', JSON.stringify(response.quickreplies));
        sendTextMessage(sessionId, response.text);
        return resolve();
      });
    },
    setLocationWit({sessionId, context, entities}) {
      console.log(`Wit extracted ${JSON.stringify(entities)}`);
      setLocation();
      return Promise.resolve(context);
    },
    userLocationWit({sessionId, context, text, entities}) {
      userLocation(sessionId);
      console.log(`Session ${sessionId} received ${text}`);
      console.log(`Wit extracted ${JSON.stringify(entities)}`);
      return Promise.resolve(context);
    }
  },
});

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
		console.log(body);
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
		console.log(response.body);
  }).catch(function(e) {
		console.error("Unable to proceed", e);
		d.reject(error);
	});
	return d.promise
}

setupGetStartedButton();

/* Get user information */
exports.fbInformation = function() {

}

/* Recieve request */
exports.handleMessage = function(req, res) {
	console.log('handleMessage');
	try {
		messaging_events = req.body.entry[0].messaging;
		postback = null;
		messaging_events.forEach(function(event) {
			sender = event.sender.id;
			if (!C[sender]) C[sender] = {
				lastResults: [],
				consecutiveFails: 0,
				totalFailCount: 0
			}
			C[sender].failing = false;
			try {
				postback = event.postback.payload;
			} catch (err) {}
			if (postback == 'GET_STARTED_PAYLOAD') {
				sendSenderAction(sender, 'typing_on'); // Ideally this would happen after checking we actually want to respond
				firstMessage(sender);
			} else if (event.message && !event.message.quick_reply) {
				console.log("Dealing with message");
				if (event.message.quick_reply) {
					console.log('marking seen');
					sendSenderAction(sender, 'mark_seen');
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
							intentConfidence(sender, text);
						}
					}
					delete C[sender].expectingAttachment;
				} else if ((attachments = event.message.attachments)) {
					const type = attachments[0].type;
					const url = (type=='fallback') ? attachments[0].url : attachments[0].payload.url;
					const attachment = {
						type: type,
						url: url
					}
					var memory;
					if ((memory = C[sender].expectingAttachment)) {
						sendSenderAction(sender, 'typing_on'); // Ideally this would happen after checking we actually want to respond
						memory.attachments = [attachment];
						saveMemory(sender, memory);
						delete C[sender].expectingAttachment; // Could this be delete memory?
					} else {
						C[sender].holdingAttachment = attachment;
						C[sender].holdingAttachment.userID = sender;
						console.log('--- Now holding attachment: ---');
						console.log(C[sender].holdingAttachment);
						// sendSenderAction(sender, 'typing_off');
					}
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
	const d = Q.defer();
	console.log(prepareAndSendMessages);
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
	console.log('\n\n');
	console.log('--- Sending Message to Facebook ---');
	console.log(requestData);
	console.log('\n\n');
	console.log(JSON.stringify(requestData));
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

function receivedMessage(event) {
	console.log(receivedMessage);
  // Putting a stub for now, we'll expand it in the following steps
  console.log("Message data: ", event.message);
}

function giveUp(sender) {
	console.log(giveUp);
	C[sender].failing = true;
	C[sender].totalFailCount++;
	console.log('C[sender].totalFailCount');
	console.log(C[sender].totalFailCount);
	if (C[sender].consecutiveFails < 4) C[sender].consecutiveFails++;
	sendGenericMessage(sender, 'dunno', C[sender].consecutiveFails);
}

function sendGenericMessage(recipientId, type, optionalCounter) {
	console.log(sendGenericMessage);
  // Bot didnt know what to do with message from user
	const text = optionalCounter ? Randoms.texts[type][optionalCounter] : Randoms.texts[type];
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: text[Math.floor(Math.random() * text.length)]
    }
  };
  prepareAndSendMessages(messageData);

	if (Randoms.gifs[type] && Math.floor(Math.random()*5)==0) { // (C[recipientId].totalFailCount < 5 || Math.floor(Math.random()*(C[recipientId].totalFailCount/4))==0 )) {
		const gif = optionalCounter ? Randoms.gifs[type][optionalCounter] : Randoms.gifs[type];
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
function sendTextMessage(recipientId, messageText, delay, noReaction) {
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
	if (!noReaction) {
		messageData.message.quick_replies = [
      {
        content_type: "text",
        title: "😍",
        payload: "DEVELOPER_DEFINED_PAYLOAD_1"
      },
      {
        content_type: "text",
        title: "😐",
        payload: "DEVELOPER_DEFINED_PAYLOAD_2"
      },
      {
        content_type: "text",
        title: "😔",
        payload: "DEVELOPER_DEFINED_PAYLOAD_3"
      }
		];
	}
  return prepareAndSendMessages(messageData, delay)
}
function sendAttachmentMessage(recipientId, attachment, delay, noReaction) {
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
	if (!noReaction) {
		messageData.message.quick_replies = [
      {
        content_type: "text",
        title: "😍",
        payload: "DEVELOPER_DEFINED_PAYLOAD_1"
      },
      {
        content_type: "text",
        title: "😐",
        payload: "DEVELOPER_DEFINED_PAYLOAD_2"
      },
      {
        content_type: "text",
        title: "😔",
        payload: "DEVELOPER_DEFINED_PAYLOAD_3"
      }
		];
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
	C[sender].onboarding = true;

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
		sendTextMessage(recipientId, "Nice to meet you. I'm ForgetMeNot, your helpful friend with (if I say so myself) a pretty darn good memory! 😇", 0, true);
		setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
		setTimeout(function() {
			sendTextMessage(recipientId, "Ask me to remember things and I'll do just that. Then later you can ask me about them and I'll remind you! 😍", 0, true);
			setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
			setTimeout(function() {
				sendTextMessage(recipientId, "To get started, let's try an example. Try typing the following: \n\nMy secret superpower is invisibility", 0, true);
			}, 6000);
		}, 4000);
	}, 1000);
}

// Needs error handling
function backupAttachment(recipientId, attachmentType, attachmentUrl) {
	console.log(backupAttachment);
	const d = Q.defer()
	cloudinary.uploader.upload(attachmentUrl, function(result) {
	  console.log(result)
		d.resolve(result.url)
	});
	return d.promise
}

const fetchUserData = function(userID, forceRefresh) {
	console.log(fetchUserData);
	const d = Q.defer()
	if (!forceRefresh && C[userID] && (userData = C[userID].userData)) {
		console.log('Already got user data stored:');
		console.log(userData);
		d.resolve(userData)
	} else {
		fetchUserDataFromDb(userID)
		.then(function(userData) {
			console.log('User data fetched from Db:');
			console.log(userData);
			if (forceRefresh) {
				d.reject('Forcing Refresh')
			} else {
				d.resolve(userData)
			}
		}).catch(function(e) {
			console.log(e);
			fetchUserDataFromFacebook(userID)
			.then(function(userData) {
				return createUserAccount(userData)
			}).then(function(userData) {
				console.log('User data fetched from Facebook:');
				console.log(userData);
				d.resolve(userData)
			}).catch(function(err) {
				console.log(err);
				d.reject(err)
			})
		})
	}
	return d.promise
}

const fetchUserDataFromDb = function(userID) {
	console.log(fetchUserDataFromDb);
	return getDbObject(AlgoliaUsersIndex, userID)
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


// ------------Wit Code Below--------------- //
// fetch wits response
function witResponse(recipientId, message) {
	console.log(witResponse);
  witClient.runActions(recipientId, message, {})
  .then((data) => {
    //console.log(JSON.stringify(data));
  }).catch(function(err) {
		console.log(err);
	}).done();
}

function intentConfidence(sender, message) {
	console.log(intentConfidence);
	console.log('message');
	console.log(message);
	const messageToWit = message.substring(0, 256); // Only sends Wit the first 256 characters as it can't handle more than that
  witClient.message(messageToWit, {})
  .then((data) => {
		console.log('Wit success!');
		C.consecutiveWitErrorCount = 0;
		console.log('\n\n');
		console.log('--- Entities From wit ---');
		console.log(data);
		console.log('\n\n');
		console.log(JSON.stringify(data));
    try {
      var intent = JSON.stringify(data.entities.intent[0].value).replace(/"/g, '');
    } catch(err) {
      console.log("no intent - send generic fail message");
			giveUp(sender);
    }
		//Is the next line still needed?
		const expectAttachment = data.entities.expectAttachment ? JSON.stringify(data.entities.expectAttachment[0].value) : null;
		const allowAttachment = !!data.entities.allowAttachment;
		const memory = extractAllContext(data.entities);
		memory.sender = sender;
    if (intent) {
      switch(intent) {
				case "nextResult":
					tryAnotherMemory(sender);
					break;
        case "storeMemory":
          try {
            memory.sentence = rewriteSentence(message);
						if (expectAttachment || allowAttachment) {
							memory.sentence+=" ⬇️";
							if (C[sender].holdingAttachment) {
								memory.attachments = [C[sender].holdingAttachment];
								saveMemory(sender, memory);
								delete C[sender].holdingAttachment;
							} else {
								C[sender].expectingAttachment = memory;
								sendSenderAction(sender, 'typing_off');
							}
						} else {
							console.log("Trying to process reminder \n");
							saveMemory(sender, memory); // New Context-Sentence method
							delete C[sender].holdingAttachment;
						}
          } catch (err) {
						console.log(err);
            giveUp(sender);
          }
          break;

        case "query":
          console.log("this is a query");
          try {
            recallMemory(sender, memory.context);
          } catch (err) {
						console.log(err);
            giveUp(sender);
          }
          break;

				case "setTask": // Need to convert this to Random Text/GIFs
					sendTextMessage(sender, "Sorry, I'm afraid I don't do reminders or carry out tasks just yet!");
					sendAttachmentMessage(sender, {type: 'image', url: "https://media.giphy.com/media/RddAJiGxTPQFa/giphy.gif"});
					break;

        default:
					sendGenericMessage(sender, intent);
          break;

      }
    }
  }).catch(function(err) {
		console.log(err);
		if (C.consecutiveWitErrorCount < 5) {
			console.log(2);
			setTimeout(function() {
				C.consecutiveWitErrorCount++;
				console.log('Assuming Wit error - trying again in 5 seconds (attempt #' + C.consecutiveWitErrorCount + ' of 5) ...');
				intentConfidence(sender, message)
			}, 5000)
		} else {
			console.log('Giving up');
			sendTextMessage(sender, 'Sorry, something went wrong - can you try again?')
		}
	});
}
// -------------------------------------------- //

// ------------User Code Below---------------- //
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

function createUserAccount(userData) {
	const d = Q.defer()
	console.log(createUserAccount);

	// Generate the value to be used for the Secure API key
	const searchOnlyApiKey = userData.id + '_' + crypto.randomBytes(12).toString('hex');

	// Generate Secure API token using this value
	const params = {
		filters: 'userID:' + userData.id + ' OR public = true',
		restrictIndices: properties.algolia_index,
		userToken: userData.id
	};
	var publicKey = AlgoliaClient.generateSecuredApiKey(searchOnlyApiKey, params);

	// Save userData to 'users' Algolia index
	userData.objectID = userData.id;
	userData.searchOnlyApiKey = searchOnlyApiKey;
	delete userData.id;
	//Save it to current memory
	C[userData.objectID].userData = userData;
	AlgoliaUsersIndex.addObject(userData, function(err, content) {
		if (err) {
			console.log(err);
			d.resolve(err)
		} else {
			console.log(content);
			d.resolve(content)
		}
	});
	return d.promise
}
// -------------------------------------------- //


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



// ----------Context-Value-Sentence Method------------- //
function saveMemory(sender, m) {
	console.log(saveMemory);
	m.hasAttachments = !!(m.attachments) /* @TODO: investigate whether brackets are needed */
	return fetchUserData(sender)
	.then(function(content) {
		m.userID = content ? content.uploadTo || sender : sender;
		const searchParams = {
			query: m.sentence.substring(0, 500), // Only sends Algolia the first 511 characters as it can't handle more than that
			filters: 'userID: ' + m.userID,
			getRankingInfo: true
		};
		return searchDb(AlgoliaIndex, searchParams)
	}).then(function() {
		return m.hasAttachments ? sendAttachmentUpload(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
	}).then(function(results) {
		if (m.hasAttachments && results[0].value.attachment_id) m.attachments[0].attachment_id = results[0].value.attachment_id;
		return m.hasAttachments && m.attachments[0].type=="image" ? backupAttachment(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
	}).then(function(url) {
		if (m.hasAttachments && url) m.attachments[0].url = url;
		return saveToDb(sender, m)
	}).then(function() {
		m.sentence = "I've now remembered that for you! " + m.sentence;
		return sendResult(sender, m)
	}).then(function() {
		return C[sender].onboarding ? sendTextMessage(sender, "Now try typing: \n\nWhat\'s my secret superpower?", 1500, true) : Q.fcall(function() {return null});
	}).catch(function(err) {
		console.log(err);
	}).done(); /* @TODO: investigate whether done is appropriate here */
}

// NO LONGER NEEDED?
function conditionalPromise(condition, promise, optionalValue) {
	console.log(conditionalPromise);
	if (condition) {
		return promise
	} else {
		return Q.fcall(function() {return optionalValue})
	}
}

function getDbObject(index, objectID, returnArray) {
	console.log(getDbObject);
	const d = Q.defer();
	index.getObject(objectID, returnArray, function(err, content) {
		if (err) {
			d.reject(err)
		} else {
			d.resolve(content);
		}
	});
	return d.promise;
}

function searchDb(index, params) {
	console.log(searchDb);
	const d = Q.defer();
	console.log('\n\n');
	console.log('--- Algolia Search Parameters ---');
	console.log(params);
	console.log('\n\n');
	console.log(JSON.stringify(params));
	index.search(params, function searchDone(err, content) { /* @TODO: investigate whether function name is needed */
		if (err) {
			d.reject(err)
		} else {
		console.log('\n\n');
			console.log('--- Algolia Search Hits ---');
			console.log(content.hits.map(function(hit) {
				return hit.sentence
			}));
			console.log('\n\n');
			// console.log(JSON.stringify(content.hits));
			d.resolve(content);
		}
	});
	return d.promise;
}

function saveToDb(sender, memory) {
	console.log(saveToDb);
	const d = Q.defer();
	memory.dateCreated = Date.now();
	AlgoliaIndex.addObject(memory, function(err, content){
		if (err) {
			sendTextMessage(id, "I couldn't remember that");
			d.reject();
		} else {
			console.log('User memory saved successfully!');
			d.resolve();
		}
	});
	return d.promise;
}


function recallMemory(sender, context, attachments) {
	console.log(recallMemory);
	const searchTerm = context.map(function(e){return e.value}).join(' ');
	//@TODO: Add in check and create new user if none there
	return fetchUserData(sender)
	.then(function(content) {
		const readAccessList = content.readAccess || [];
		const userIdFilterString = 'userID: ' + sender + readAccessList.map(function(id) {return ' OR userID: '+id}).join('');
		const searchParams = {
			query: searchTerm.substring(0, 500), // Only sends Algolia the first 511 characters as it can't handle more than that
			filters: userIdFilterString
			// filters: (attachments ? 'hasAttachments: true' : '')
		};
		return searchDb(AlgoliaIndex, searchParams)
	}).then(function(content) {
		if (content.hits.length) {
			C[sender].lastResults = content.hits;
			C[sender].lastResultTried = 0;
			return sendResult(sender, content.hits[0]);
		} else {
			return sendTextMessage(sender, "Sorry, I can't remember anything similar to that!")
		}
	}).then(function() {
		return C[sender].onboarding ? sendTextMessage(sender, "Actually you now have two powers! With me, you also get the power of Unlimited Memory 😎😇🔮", 1500, true) : Q.fcall(function() {return null});
	}).then(function() {
		return C[sender].onboarding ? sendTextMessage(sender, "Now feel free to remember anything below - text, images, video links you name it...", 1500, true) : Q.fcall(function() {return null});
	}).then(function() {
		C[sender].onboarding = false;
		Q.fcall(function() {return null});
	}).catch(function(err) {
		console.log(err);
	}).done();
}

function sendResult(sender, memory) {
	console.log(sendResult);
	var sentence = memory.sentence;
	if (memory.attachments) {
		if (~[".","!","?",";"].indexOf(sentence[sentence.length-1])) sentence = sentence.substring(0, sentence.length - 1);;
		sentence+=" ⬇️";
	}
	return sendTextMessage(sender, sentence, 0, !!memory.attachments)
	.then(function() {
		console.log('memory.attachments');
		console.log(memory.attachments);
		return memory.attachments ? sendAttachmentMessage(sender, memory.attachments[0]) : Q.fcall(function() {return null});
	})
	.catch(function(err) {
		console.log(err);
	}).done();
}

function tryAnotherMemory(sender) {
	console.log(tryAnotherMemory);
	const memory = C[sender].lastResults[C[sender].lastResultTried+1];
	sendResult(sender, memory);
	C[sender].lastResultTried++;
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



function rewriteSentence(sentence) { // Currently very primitive!
	console.log(rewriteSentence);
	sentence = sentence.trim();
  const remove = [
    /^Remember that/i,
    /^Remember/i,
    /^Remind me/i,
    /^Please/i,
		/please\.^/i,
    /please^/i,

  ];
	remove.forEach(function(r) {
		sentence = sentence.replace(r, '');
	});
  const replace = [
    [/\bme\b/i, 'you'],
    [/\bmy\b/i, 'your'],
    [/\bI\'m\b/i, 'you\'re'],
    [/\bIm\b/i, 'you\'re'],
    [/\bI am\b/i, 'you are'],
    [/\bI\b/i, 'you'],
  ];
  replace.forEach(function(r) {
    sentence = sentence.replace(r[0], r[1]);
  });
  sentence = sentence.trim();
	sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1)
  if (~[".","!","?",";"].indexOf(sentence[sentence.length-1])) sentence = sentence.substring(0, sentence.length - 1);
  return sentence;
}

/* Now returns both context and all the other bits (except intent) */
function extractAllContext(e) {
	console.log(extractAllContext);
	const entities = JSON.parse(JSON.stringify(e)); // Hopefully this avoids deleting/editing things in the original entities object outside this function!
	const finalEntities = {
		context: []
	};
	if (entities.intent) delete entities.intent;
	const names1 = Object.keys(entities);
	const nonContext = [
		'act',
		'assignment',
		'security',
		'expectAttachment',
		'questionType',
		'unimportant',
	];
	names1.forEach(function(name1) {
		if (nonContext.indexOf(name1) == -1) { // Only proceeds for context-like entities
			entities[name1].forEach(function(entity) {
				if (entity.entities) {
					const names2 = Object.keys(entity.entities);
					names2.forEach(function(name2) {
						finalEntities.context = finalEntities.context.concat(entity.entities[name2])
					});
					delete entity.entities;
				}
				finalEntities.context.push(entity);
			})
		} else {
			finalEntities[name1] = entities[name1]
		}
	})

	console.log('\n\n');
	console.log('--- Entities Now Prepared ---');
	console.log(finalEntities);
	console.log('\n\n');
	console.log(JSON.stringify(finalEntities));
	return finalEntities;
}

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


exports.setContext = setContext;
exports.getContext = getContext;
exports.callSendAPI = callSendAPI;





Randoms = {
	texts: {},
	gifs: {}
};

Randoms.texts.dunno = [];
Randoms.gifs.dunno = [];
Randoms.texts.dunno[1] = [
	"I'm sorry I didn't quite understand that, I'm still learning though!"
]
Randoms.gifs.dunno[1] = [
	'https://media.giphy.com/media/fKk2I5iiWGN0I/giphy.gif',
	'https://media.giphy.com/media/y65VoOlimZaus/giphy.gif',
	'https://media.giphy.com/media/Q3cRXFWYEBtzW/giphy.gif',
	'https://media.giphy.com/media/zqTa7p7qvyfbW/giphy.gif',
	'https://media.giphy.com/media/xUPGcovyHtUZ6ldnlC/giphy.gif',
	'https://media.giphy.com/media/l3vRiGJzSIg7OoiWI/giphy.gif',
	'https://media.giphy.com/media/zqF12WgFHJevu/giphy.gif',
	'https://media.giphy.com/media/PFAAoSsNrAObu/giphy.gif',
	'https://media.giphy.com/media/bkKvvzE9PEcTK/giphy.gif',
	'https://media.giphy.com/media/14tvbepZ8vhU40/giphy.gif',
	'https://media.giphy.com/media/G5X63GrrLjjVK/giphy.gif',
	'https://media.giphy.com/media/K6VhXtbgCXqQU/giphy.gif',
	'https://media.giphy.com/media/3ornjSL2sBcPflIDiU/giphy.gif',
	'https://media.giphy.com/media/FxEwsOF1D79za/giphy.gif',
	'https://media.giphy.com/media/8GclDP2l4qbx6/giphy.gif'
];
Randoms.texts.dunno[2] = [
	"Still don't understand, sorry! 😳"
]
Randoms.texts.dunno[3] = [
	"Three fails in a row, how embarrassing! 🤒"
]
Randoms.texts.dunno[4] = [
	"Still confused - I think I'm just going to give up...."
]

Randoms.texts.greeting = [
	'Hello there!',
	'Nice to see you',
	'Hi 😊',
	'Hello and welcome 🙂'
];
Randoms.gifs.greeting = [
	'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif',
	'https://media.giphy.com/media/mW05nwEyXLP0Y/giphy.gif',
	'https://media.giphy.com/media/3o7TKA2a0EX25VqbMk/giphy.gif',
	'https://media.giphy.com/media/pcwaLYOQb3xN6/giphy.gif'
];

Randoms.texts.thanks = [
	'You\'re welcome!',
	'No problem 🙂',
	'No problem!',
	'Happy to help 🙂'
];
Randoms.gifs.thanks = [
	'https://media.giphy.com/media/3o85xwxr06YNoFdSbm/giphy.gif',
	'https://media.giphy.com/media/3ohfFviABAlNf3OfOE/giphy.gif',
	'https://media.giphy.com/media/l41lZxzroU33typuU/giphy.gif',
	'https://media.giphy.com/media/k39w535jFPYrK/giphy.gif'
];

Randoms.texts.bye = [
	'Bye for now!',
	'Cheerio! ',
	'Chat again soon!',
];
Randoms.gifs.bye = [
	'https://media.giphy.com/media/l0IydZclkNcC6NZa8/giphy.gif',
	'https://media.giphy.com/media/3ohfFviABAlNf3OfOE/giphy.gif',
	'https://media.giphy.com/media/TUJyGPCtQ7ZUk/giphy.gif',
];

Randoms.texts.humour = [
	'haha, that was funny!',
	'too funny 😂',
	'Now that was funny!',
];
Randoms.gifs.humour = [
	'https://media.giphy.com/media/3oEjHAUOqG3lSS0f1C/giphy.gif',
	'https://media.giphy.com/media/CoDp6NnSmItoY/giphy.gif',
	'https://media.giphy.com/media/3NtY188QaxDdC/giphy.gif',
];

Randoms.texts.pleasure = [
	'Pretty cool, huh 😎',
	'We make a great team!',
	'Right back at ya 🙌',
];
Randoms.gifs.pleasure = [
	'https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif',
  'https://media.giphy.com/media/JVdF14CQQH7gs/giphy.gif',
  'https://media.giphy.com/media/IxKt9HOM1mI80/giphy.gif',
];

Randoms.texts.dissatisfaction = [
	'Oh no, I\'m sorry, let\'s try again 🙏',
  'Oops, sorry about that',
  'Sorry for messing up, can we try again?',
];
Randoms.gifs.dissatisfaction = [
	'https://media.giphy.com/media/gnJgBlPgHtcnS/giphy.gif',
  'https://media.giphy.com/media/26AHLspJScv2J6P0k/giphy.gif',
  'https://media.giphy.com/media/4TELhlB0hYTC/giphy.gif',
];

Randoms.texts.affirmation = [
	'Cool!',
];

Randoms.texts.helpRequest = [
	'Request for help noted! We\'ll get someone to look at your request as soon as we can.',
];
