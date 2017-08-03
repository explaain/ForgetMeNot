
var request = require('request');
var properties = require('../config/properties.js');
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

// user information global variable
var first_name = "";
var id = "";

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
  messaging_events = req.body.entry[0].messaging;
  postback = null;
  for (i = 0; i < messaging_events.length; i++) {
		event = req.body.entry[0].messaging[i];
		sender = event.sender.id;
    try {
      postback = event.postback.payload;
    } catch (err) {}
    if (postback == 'first_connection') {
      fetchFacebookData(sender);
      firstMessage(sender);
    } else {
      if (event.message && event.message.text) {
  		  	text = event.message.text;
  		  	// Handle a text message from this sender
          switch(text) {
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
      }
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
function callSendAPI(messageData) {
  request({
    uri: properties.facebook_message_endpoint,
    qs: { access_token: properties.facebook_token },
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

function sendGenericMessage(recipientId) {
  // Bot didnt know what to do with message from user
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "I'm sorry I didn't quite understand that, I'm still learning though!"
    }
  };
  callSendAPI(messageData);
}

/* function sends message back to user */
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

function firstMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "Hello there"
    }
  };
  callSendAPI(messageData);
}

function fetchFacebookData(recipientId) {
  console.log("inside the request");
  request({
    uri: properties.facebook_user_endpoint + recipientId + "fields=first_name,last_name,profile_pic,locale,timezone,gender&access_token=" + properties.facebook_token,
    method: "POST",
    json: {

    }
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
  witClient.message(message, {})
  .then((data) => {
    console.log('Wit response: ', JSON.stringify(data) + "\n");
    try {
      intent = JSON.stringify(data.entities.intent[0].value);
      intent = intent.replace(/"/g, '');
      var confidence = JSON.stringify(data.entities.intent[0].confidence);
    } catch(err) {
      console.log("no intent - send generic fail message");
      sendGenericMessage(sender);
    }
    console.log("Confidence score " + confidence);

    if (intent != null) {
      switch(intent) {
        case "storeMemory":
          console.log(data);
          try {
            // Eventually we should save confidence levels to Algolia too
            const context = data.entities.context.map(function(context) {
              return context.value;
            })
            const sentence = rewriteSentence(data._text);
            console.log(context, sentence);
            if (context != null && sentence != null) {
              console.log("Trying to process reminder \n");
              saveMemory(sender, context, sentence); // New Context-Sentence method
            } else {
              console.log("I'm sorry but this couldn't be processed. \n");
            }
          } catch (err) {
            sendGenericMessage(sender);
          }
          break;

        case "recall":
          console.log("this is a recall");
          try {
            const context = data.entities.context.map(function(context) {
              return context.value;
            })
            console.log(context);
            if (context != null) {
              recallMemory(sender, context);
            } else {
              console.log("I'm sorry but this couldn't be processed. \n");
            }
          } catch (err) {
            sendGenericMessage(sender);
          }
          break;

        default:
          witResponse(sender, text);
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
function saveMemory(sender, context, sentence) {
  //Should first check whether a record with this Context-Value-Sentence combination already exists

  const memory = {sender: sender, context: context, sentence: sentence};
  AlgoliaIndex.addObject(memory, function(err, content){
    if (err) {
      sendTextMessage(id, "I couldn't remember that");
    } else {
      console.log('User memory successfully!');
      sendTextMessage(sender, "I've now remembered that for you! " + sentence);
    }
  });
}
function recallMemory(sender, context) {
  console.log('Searching Algolia.....');
  AlgoliaIndex.search(context.join(' '), {}, function searchDone(err, content) { // Middle parameter may not be necessary
		if (err) {
      console.log(err);
		}

    if (content.hits.length) {
      memory = content.hits[0]; // Assumes first result is only option
      console.log(memory + "\n");
      var returnValue = memory.sentence;
      returnValue = returnValue.replace(/"/g, ''); // Unsure whether this is necessary
      sendTextMessage(sender, returnValue);
    } else {
			sendTextMessage(sender, "Sorry, I can't remember anything similar to that!")
		}
	});
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
    'Remember',
    'remember',
    'Remind me',
    'remind me'
  ];
  const my = [
    'My ',
    'my '
  ];
  remember.forEach(function(r) {
    sentence = sentence.replace(r, '');
  });
  my.forEach(function(m) {
    sentence = sentence.replace(m, 'Your ');
  });
  sentence = sentence.trim();
  if(!~[".","!","?",";"].indexOf(sentence[sentence.length-1])) sentence+=".";
  return sentence;
}
