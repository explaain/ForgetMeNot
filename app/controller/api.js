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

const crypto = require("crypto");

// user information global variable
var first_name = "";
var id = "";

const Context = {};

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

/* Get user information */
exports.fbInformation = function() {

}

/* Recieve request */
exports.handleMessage = function(req, res) {
	try {
		messaging_events = req.body.entry[0].messaging;
		postback = null;
		for (i = 0; i < messaging_events.length; i++) {
			event = req.body.entry[0].messaging[i];
			console.log(JSON.stringify(event));
			sender = event.sender.id;
			if (!Context[sender]) Context[sender] = {
				lastResults: []
			}
			sendSenderAction(sender, 'typing_on');
			try {
				postback = event.postback.payload;
			} catch (err) {}
			if (postback == 'first_connection') {
				fetchFacebookData(sender);
				firstMessage(sender);
			} else {
				console.log(JSON.stringify(event.message));
				if (event.message) {
					if (event.message.text) {
						text = event.message.text;
						// Handle a text message from this sender
						switch(text) {
							case "begin":
							firstMessage(sender);
							break;
							case "account":
							fetchFacebookData(sender);
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
								//witResponse(sender, text);
							}
						}
					}
					if (event.message.attachments) {
						const attachmentType = event.message.attachments[0].type;
						const attachmentUrl = attachmentType=='fallback' ? event.message.attachments[0].url : event.message.attachments[0].payload.url;

						if (Context[sender].expectingAttachment) {
							Context[sender].expectingAttachment.attachments = [
								{
									type: attachmentType,
									url: attachmentUrl
								}
							];
							saveMemory(Context[sender].expectingAttachment.userID, Context[sender].expectingAttachment.context, Context[sender].expectingAttachment.sentence, Context[sender].expectingAttachment.attachments);
							delete Context[sender].expectingAttachment;
						} else {
							Context[sender].holdingAttachment = {
								userID: sender,
								type: attachmentType,
								url: attachmentUrl
							};
							sendSenderAction(sender, 'typing_off');
						}
						console.log('expectingAttachment: ', expectingAttachment);
						console.log('holdingAttachment: ', holdingAttachment);
					} else {
						delete Context[sender].expectingAttachment;
					}
				}
			}
		}
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
  callSendAPI(data);
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

/* being able to send the message */
function callSendAPI(messageData, alternativeEndpoint) {
  request({
    uri: (alternativeEndpoint || properties.facebook_message_endpoint),
    qs: { access_token: (process.env.FACEBOOK_TOKEN || properties.facebook_token) },
    method: 'POST',
    json: messageData
  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;
      console.log("Successfully sent message with id %s to recipient %s",
      messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      //console.error(response);
      console.error(error);
    }
  });
}

function receivedMessage(event) {
  // Putting a stub for now, we'll expand it in the following steps
  console.log("Message data: ", event.message);
}

function sendGenericMessage(recipientId, type) {
  // Bot didnt know what to do with message from user
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: Randoms.texts[type][Math.floor(Math.random() * Randoms.texts[type].length)]
    }
  };
  callSendAPI(messageData);

  var messageData2 = {
    recipient: {
      id: recipientId
    },
    message: {
			attachment: {
	      type: "image",
	      payload: {
	        url: Randoms.gifs[type][Math.floor(Math.random() * Randoms.gifs[type].length)]
	      }
	    }
    }
  };
	callSendAPI(messageData2);
}

/* function sends message back to user */
function sendSenderAction(recipientId, sender_action) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: sender_action
  };
  callSendAPI(messageData);
}
function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };
  callSendAPI(messageData);
}
function sendAttachmentMessage(recipientId, attachmentType, attachmentUrl) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
			attachment: {
	      type: attachmentType,
	      payload: {
	        url: attachmentUrl
	      }
	    }
    }
  };
  callSendAPI(messageData);
}
function sendAttachmentUpload(recipientId, attachmentType, attachmentUrl) {
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
  callSendAPI(messageData, properties.facebook_message_attachments_endpoint);
}

function firstMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Hello there!"
    }
  };
  callSendAPI(messageData);
	setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
	setTimeout(function() {
		sendTextMessage(recipientId, "Nice to meet you. I'm ForgetMeNot🤖, your helpful friend with (if I say so myself) a pretty darn good memory! 😇");
		setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
		setTimeout(function() {
			sendTextMessage(recipientId, "Ask me to remember things and I'll do just that. Then later you can ask me about them and I'll remind you! 😍");
			setTimeout(function() {sendSenderAction(sender, 'typing_on');}, 500);
			setTimeout(function() {
				sendTextMessage(recipientId, "Here are a few ideas for things you can ask me to remember right now: \n\n1. What your cousin's new baby is called 👼 \n2. What wine you had that you really liked 🍷 \n3. Your National Insurance number 💳");
			}, 6000);
		}, 4000);
	}, 1000);
}

function fetchFacebookData(recipientId) {
  console.log("inside the request");
	console.log(properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token));
  request({
    uri: properties.facebook_user_endpoint + recipientId + "?fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + (process.env.FACEBOOK_TOKEN || properties.facebook_token),
    method: "GET"
  }, function (error, response, body) {
		console.log(body);
		createUserAccount(JSON.parse(body));
	});
  console.log("out of the request");
}


// ------------Wit Code Below--------------- //
// fetch wits response
function witResponse(recipientId, message) {
  witClient.runActions(recipientId, message, {})
  .then((data) => {
    //console.log(JSON.stringify(data));
  })
  .catch(console.error);
}

// check wit.ai's confidence for the intent
function intentConfidence(sender, message) {
  var intent = null;
	const messageToWit = message.substring(0, 256); // Only sends Wit the first 256 characters as it can't handle more than that
  witClient.message(messageToWit, {})
  .then((data) => {
    console.log('Wit response: ', JSON.stringify(data) + "\n");
    try {
      intent = JSON.stringify(data.entities.intent[0].value);
      intent = intent.replace(/"/g, '');
      var confidence = JSON.stringify(data.entities.intent[0].confidence);
    } catch(err) {
      console.log("no intent - send generic fail message");
      sendGenericMessage(sender, 'dunno');
    }
    console.log("Confidence score " + confidence);

		expectAttachment = data.entities.expectAttachment ? JSON.stringify(data.entities.expectAttachment[0].value) : null;
		console.log(expectAttachment);
		const context = extractAllContext(data.entities);
		console.log(context);

    if (intent != null) {
      switch(intent) {
				case "greeting":
					sendGenericMessage(sender, 'greeting');
					break;
				case "thanks":
					sendGenericMessage(sender, 'thanks');
					break;
				case "humour":
					sendGenericMessage(sender, 'humour');
					break;
				case "bye":
					sendGenericMessage(sender, 'bye');
					break;
				case "pleasure":
					sendGenericMessage(sender, 'pleasure');
					break;
				case "dissatisfaction":
					sendGenericMessage(sender, 'dissatisfaction');
					break;
				case "nextResult":
					tryAnotherMemory(sender);
					break;
        case "storeMemory":
					console.log('storeMemory');
          try {
            var sentence = rewriteSentence(data._text);
            console.log(context, sentence);
            if (context != null && sentence != null) {
							if (expectAttachment) {
								sentence+=" ⬇️";
								if (Context[sender].holdingAttachment) {
									saveMemory(sender, context, sentence, [Context[sender].holdingAttachment]);
									delete Context[sender].holdingAttachment;
								} else {
									Context[sender].expectingAttachment = {userID: sender, context: context, sentence: sentence};
									sendSenderAction(sender, 'typing_off');
								}
							} else {
								console.log("Trying to process reminder \n");
								saveMemory(sender, context, sentence); // New Context-Sentence method
								delete Context[sender].holdingAttachment;
							}
            } else {
              console.log("I'm sorry but this couldn't be processed. \n");
            }
          } catch (err) {
            sendGenericMessage(sender, 'dunno');
          }
          break;

        case "recall":
          console.log("this is a recall");
          try {
            console.log(context);
            if (context != null) {
              recallMemory(sender, context);
            } else {
              console.log("I'm sorry but this couldn't be processed. \n");
            }
          } catch (err) {
            sendGenericMessage(sender, 'dunno');
          }
          break;

				case "setTask":
					sendTextMessage(sender, "Sorry, I'm afraid I don't do reminders or carry out tasks just yet!");
					sendAttachmentMessage(sender, 'image', "https://media.giphy.com/media/RddAJiGxTPQFa/giphy.gif");
					break;

        default:
					sendGenericMessage(sender, 'dunno');
          // witResponse(sender, text);
          break;

      }
    }
  }).catch(console.error);
}
// -------------------------------------------- //

// ------------User Code Below---------------- //
/* Save a user to the database */
function subscribeUser(id) {
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
	AlgoliaUsersIndex.addObject(userData, function(err, content) {});
}
// -------------------------------------------- //


// -----------User Memory Code Below--------------- //
function newTimeBasedMemory(id) {
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
function saveMemory(sender, context, sentence, attachments) {
  //Should first check whether a record with this Context-Value-Sentence combination already exists


	AlgoliaUsersIndex.getObject(sender, ['uploadTo'], function(err, content) {
		console.log('content');
		console.log(content);
		const uploadTo = content ? content.uploadTo || sender : sender;

	  const memory = {userID: uploadTo, context: context, sentence: sentence, attachments: attachments, hasAttachments: !!(attachments)};
		//Check whether it looks too similar to an existing one (for now using whatever memory bank you're uploading to)
		AlgoliaIndex.search({
			query: sentence,
			filters: 'userID: ' + uploadTo
		},
		function searchDone(err, content) {
			if (err) {
				console.log(err);
			}



			AlgoliaIndex.addObject(memory, function(err, content){
				if (err) {
					sendTextMessage(id, "I couldn't remember that");
				} else {
					console.log('User memory successfully!');
					sendTextMessage(sender, "I've now remembered that for you! " + sentence);

					if (attachments) {
						setTimeout(function() {
							sendAttachmentMessage(sender, attachments[0].type, attachments[0].url)
						}, 500)
					}
				}
			});
		});
  });
}
function recallMemory(sender, context, attachments) {
  console.log('Searching Algolia.....');
	const searchTerm = context.map(function(e){return e.value}).join(' ');
	console.log('searchTerm: ', searchTerm);
	AlgoliaUsersIndex.getObject(sender, ['readAccess'], function(err, content) {
		console.log('content');
		console.log(content);
		const readAccessList = content.readAccess || [];
		const userIdFilterString = 'userID: ' + sender + readAccessList.map(function(id) {
			return ' OR userID: ' + id
		}).join('');
		console.log(userIdFilterString);
		AlgoliaIndex.search({
			query: searchTerm,
			filters: userIdFilterString
			// filters: 'sentence: "This is your pal."'
			// filters: 'hasAttachments: true'
			// filters: (attachments ? 'hasAttachments: true' : '')
		},
		function searchDone(err, content) { // Middle parameter may not be necessary
			if (err) {
				console.log(err);
			}

			console.log(JSON.stringify(content));

			if (content.hits.length) {
				Context[sender].lastResults = content.hits;
				Context[sender].lastResultTried = 0;
				// console.log('Context[sender].lastResults:');
				// console.log(Context[sender].lastResults);
				// console.log('Context[sender].lastResultTried:');
				// console.log(Context[sender].lastResultTried);
				memory = content.hits[0]; // Assumes first result is only option
				sendResult(sender, memory);
			} else {
				sendTextMessage(sender, "Sorry, I can't remember anything similar to that!")
			}
		});
	});
}

function sendResult(sender, memory) {
	var returnValue = memory.sentence;
	returnValue = returnValue.replace(/"/g, ''); // Unsure whether this is necessary
	if (memory.attachments) {
		if (~[".","!","?",";"].indexOf(returnValue[returnValue.length-1])) returnValue = returnValue.substring(0, returnValue.length - 1);;
		returnValue+=" ⬇️";
		setTimeout(function() {
			sendAttachmentMessage(sender, memory.attachments[0].type, memory.attachments[0].url)
		}, 500)
	}
	sendTextMessage(sender, returnValue);
}

function tryAnotherMemory(sender) {
	const memory = Context[sender].lastResults[Context[sender].lastResultTried+1];
	sendResult(sender, memory);
	Context[sender].lastResultTried++;
}
// -------------------------------------------- //





// -----------Google API Code Below--------------- //
/* query geolocation */
function setTimeZone(sender) {
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
  const remember = [
    /^Remember that/,
		/^remember that/,
    /^Remember/,
    /^remember/,
    /^Remind me/,
    /^remind me/,
  ];
	remember.forEach(function(r) {
		sentence = sentence.replace(r, '');
	});
  const my = [
    'My ',
    'my '
  ];
  my.forEach(function(m) {
    sentence = sentence.replace(m, 'your ');
  });
  sentence = sentence.trim();
	sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1)
  if (~[".","!","?",";"].indexOf(sentence[sentence.length-1])) sentence = sentence.substring(0, sentence.length - 1);
  return sentence;
}


function extractAllContext(e) {
	const entities = e; // Hopefully this avoids deleting/editing things in the original entities object outside this function!
	var contextArray = [];
	if (entities.intent) delete entities.intent;
	const names1 = Object.keys(entities);
	names1.forEach(function(name1) {
		entities[name1].forEach(function(entity) {
			if (entity.entities) {
				const names2 = Object.keys(entity.entities);
				names2.forEach(function(name2) {
					contextArray = contextArray.concat(entity.entities[name2])
				});
				delete entity.entities;
			}
			contextArray.push(entity);
		})
	})
	return contextArray;
}

Randoms = {
	texts: {},
	gifs: {}
};

Randoms.texts.dunno = [
	"I'm sorry I didn't quite understand that, I'm still learning though!"
]
Randoms.gifs.dunno = [
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
