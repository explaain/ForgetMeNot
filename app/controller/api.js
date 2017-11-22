//TODO: Remove temporary bits on lines 367, 497, 516
//TODO: check that scheduled reminders include attachments
//TODO: intent 'nextResult'
//TODO: timezones
//TODO: reminders when clocks differ between devices
//TODO: remove scheduled reminders when the memory is deleted
//TODO: handle API.ai error
//TODO: delete Cloudinary images when deleting memories
//TODO: account for API.ai grabbing both trigger-time and trigger-date
//TODO: return 400 etc errors when API receives invalid request (currently just breaks and eventually times out)



const request = require('request');
const Q = require("q");
const emoji = require('moji-translate');
const schedule = require('node-schedule');
const chrono = require('chrono-node')
const Sherlock = require('sherlockjs');
const crypto = require("crypto");
const axios = require("axios");



//
// const data = {
//   uid: 'GCyraAQwx2XsYeKYuYb01dU0SrF3',
//   organisationID: 'explaain',
//   objectID: 'abc',
//   content: {
//     description: 'Here\'s an updated card...!'
//   },
//   userID: '5Jp1wfbyPXdb3IuYUuFl',
//   teamID: 'gqLdFXQ4Z9SAHfjd6IXX'
// }
// console.log('💎  Here\'s the data:', data);
// axios({
//   method: 'post',
//   url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/saveCard',
//   data: data
// }).then(function(response) {
//   console.log('📪  The response data!', response.data);
// }).catch(function(e) {
//   console.log('📛  Error!', e);
// })


// const data = {
//   uid: 'GCyraAQwx2XsYeKYuYb01dU0SrF3',
//   organisationID: 'explaain',
//   userID: '2lal5bFVYIhc7bOFfBne',
//   teamID: 'gqLdFXQ4Z9SAHfjd6IXX',
//   role: 'manager'
// }
// console.log('💎  Here\'s the data:', data);
// axios({
//   method: 'post',
//   url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/changeUserTeamRole',
//   data: data
// }).then(function(response) {
//   console.log('📪  The response data!', response.data);
// }).catch(function(e) {
//   console.log('📛  Error!', e);
// })

// const data = {
//   organisationID: 'explaain',
//   cardIDs: [
//     '631322580',
//     '6iwfx12bVygBOD4orrbF',
//     'abc',
//   ],
//   userID: 'vZweCaZEWlZPx0gpQn2b1B7DFAZ2_'
// }
// console.log('💎  Here\'s the data:', data);
// axios({
//   method: 'post',
//   url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/getCards',
//   data: data
// }).then(function(response) {
//   console.log('📪  The response data!', response.data);
// }).catch(function(e) {
//   console.log('📛  Error!', e);
// })




const properties = require('../config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});
// tracer.setLevel('warn');

// Firebase setup
const FirebaseAdmin = require("firebase-admin")

// Algolia setup
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(process.env.ALGOLIA_INDEX);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);

// Cloudinary setup
const cloudinary = require('cloudinary');
cloudinary.config({
  cloud_name: 'forgetmenot',
  api_key: '645698655223266',
  api_secret: 'j2beHW2GZSpQ_zq_8bkmnWgW95k'
});

// grab the Mixpanel factory
var Mixpanel = require('mixpanel');
// create an instance of the mixpanel client
var mixpanel = Mixpanel.init('e3b4939c1ae819d65712679199dfce7e');
// // initialize mixpanel client configured to communicate over https
// var mixpanel = Mixpanel.init('6fd9434dba686db2d1ab66b4462a3a67', {
//     protocol: 'https'
// });
const track = function (name, data) {
  return new Promise(function(resolve, reject) {
    console.log('👣  Tracking ' + name + ' event:', data)
    mixpanel.track(name, data)
    .then(res => {
      console.log(res)
      resolve(res)
    }).catch(e => {
      console.log(e)
      reject(e)
    })
  })
}


//
// const data = {
//   uid: 'GCyraAQwx2XsYeKYuYb01dU0SrF3',
//   organisationID: 'explaain',
//   objectID: 'abcde',
//   content: {
//     description: 'Here\'s an updated card...!'
//   },
//   userID: '5Jp1wfbyPXdb3IuYUuFl',
//   teamID: 'gqLdFXQ4Z9SAHfjd6IXX'
// }
// AlgoliaClient.initIndex('Savvy').addObject(data, function(err, content) {
//   if (err) {
//     const e = { code: 500, message: '📛 🔁  Failed to sync with Algolia! (Update)' }
//     console.log('📛 Error!', e.status, ':', e.message)
//   } else {
//     console.log('🔁  Synced with Algolia (Update)')
//   }
// })



const rescheduleAllReminders = function() {
	logger.trace(rescheduleAllReminders)
	const searchParams = {
		query: '',
		filters: 'intent: setTask.dateTime AND triggerDateTimeNumeric > ' + ((new Date()).getTime())
	};
	searchDb(AlgoliaIndex, searchParams)
	.then(function(content) {
		const reminders = content.hits
    logger.trace('--- Reminders Rescheduled: ---\n\n')
		reminders.forEach(function(r) {
			scheduleReminder(r);
      logger.trace(r.actionSentence, ' (' + r.triggerDateTime + ')')
		})
	}).catch(function(e) {
		logger.error(e);
	});
}

var clientMessageFunction;
exports.acceptClientMessageFunction = function(messageFunction) {
	clientMessageFunction = messageFunction
}

// For sending standalone messages
const sendClientMessage = function(data) {
	const d = Q.defer()
	if (clientMessageFunction) {
		clientMessageFunction(data)
		.then(function(res) {
			d.resolve(res)
		}).catch(function(e) {
			logger.error(e)
			d.reject(e)
		})
	} else {
		const e = 'No clientMessageFunction defined'
		logger.error(e)
		d.reject(e)
	}
	return d.promise
}


exports.deleteMemories = function(sender, organisationID, objectID) {
  logger.trace('deleteMemories');
	const d = Q.defer()
	deleteFromDb(sender, organisationID, objectID)
	.then(function(result) {
		d.resolve(result)
	}).catch(function(e) {
    logger.error(e);
		d.reject(e)
	})
  return d.promise
}


exports.acceptRequest = function(req) {
  logger.trace('acceptRequest');
	const d = Q.defer()
  logger.info(req)
  if (!req.content) req.content = { description: req.description || req.text || req.sentence }
  if (!req.sender) req.sender = req.user ? req.user.uid : req.userID
  authenticateSender(req.user)
  .then(res => { return checkPermissions(req.organisationID, req.user) })
  .then(res => { return processNLP(req.sender, req.content.description, req.contexts) })
  .then(function(nlpData) {
    req = combineObjects(req, nlpData)
		return routeByIntent(req)
	}).then(function(result) {
    logger.trace()
    if (!result.statusCode) result.statusCode = 200 //temp
		d.resolve(result)
	}).catch(function(e) {
		logger.error(e);
		d.reject(e)
	});
	return d.promise
}


exports.getUserData = function(req) {
  logger.trace('getUserData');
	const d = Q.defer()
  logger.info(req)
  authenticateSender(req.user)
  .then(res => { return checkPermissions(req.organisationID, req.user) })
  .then(res => { return getUserData(req.organisationID, req.user) })
	.then(function(result) {
    logger.trace()
    if (!result.statusCode) result.statusCode = 200 //temp
		d.resolve(result)
	}).catch(function(e) {
		logger.error(e);
		d.reject(e)
	});
	return d.promise
}


exports.getUserTeamDetails = function(req) {
  try {
    logger.trace('getUserData');
    const d = Q.defer()
    logger.info(req)
    authenticateSender(req.user)
    // .then(res => { return checkPermissions(req.organisationID, req.user) })
    .then(res => { return getUserTeamDetails(req.organisationID, req.user) })
    .then(function(result) {
      logger.trace()
      if (!result.statusCode) result.statusCode = 200 //temp
      d.resolve(result)
    }).catch(function(e) {
      logger.error(e);
      d.reject(e)
    });
    return d.promise
  } catch (e) {
    console.log(e)
  }
}

exports.addUserToOrganisation = function(req) {
  logger.trace('getUserData');
	const d = Q.defer()
  logger.info(req)
  authenticateSender(req.user)
  // .then(res => { return checkPermissions(req.organisationID, req.user) })
  .then(res => { return addUserToOrganisation(req.organisationID, req.user, req.verifiedEmails) })
	.then(function(result) {
    logger.trace()
    if (!result.statusCode) result.statusCode = 200 //temp
		d.resolve(result)
	}).catch(function(e) {
		logger.error(e);
		d.reject(e)
	});
	return d.promise
}

exports.fetchMixpanelData = function(data) {
  const start = data.start,
        end = data.end,
        event = data.event,
        properties = data.properties,
        limit = data.limit,
        organisationID = data.organisationID
  const queryUrl = 'https://4911948a523883a90eba70f3a70d578b@mixpanel.com/api/2.0/segmentation?from_date='+start+'&to_date='+end+'&event='+event + '&where=(properties["organisationID"] == "' + organisationID + '")' + (properties && properties.length ? '&on=properties["'+properties.join('","')+'"]' : '') + (limit ? '&limit=' + limit : '')
  console.log(queryUrl)
  return new Promise((resolve, reject) => {
    axios.get(queryUrl)
    .then(function(response) {
      // console.log(response.data);
      console.log(response.data.data);
      resolve(response.data.data)
    })
    .catch(function(error) {
      console.log(error);
      reject(error)
    })
  })
}

const authenticateSender = function(user) {
  return new Promise((resolve, reject) => {
    FirebaseAdmin.auth().verifyIdToken(user.idToken)
    .then(function(decodedToken) {
      var uid = decodedToken.uid;
      if (user.uid == uid) {
        logger.info('🔑👤  User Authentication Succcessful!')
        resolve()
      } else {
        const e = { statusCode: 400, message: '❌ 🔑  User UID doesn\'t match accessToken' }
        logger.error(e.message)
        reject(e)
      }
    }).catch(function(error) {
      logger.error(error)
      const e = { statusCode: 400, message: '❌ 🔑  User authentication failed: ' }
      logger.error(e.message)
      reject(e)
    })
  })
}

const checkPermissions = function(organisationID, user) {
  return new Promise((resolve, reject) => {
    const data = {
      organisationID: organisationID,
      userID: user.uid
    }
    axios({
      method: 'post',
      url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/checkPermissions',
      data: data
    }).then(function(response) {
      logger.info('🔑🖇  User Permissions Check Succcessful!')
      // console.log('📪  The response data!', response.data)
      resolve()
    }).catch(function(error) {
      logger.error(error)
      const e = { statusCode: 400, message: '❌ 🔑  User permission checking failed' }
      logger.error(e.message)
      reject(e)
    })
  })
}

const getUserData = function(organisationID, user) {
  return new Promise((resolve, reject) => {
    const data = {
      organisationID: organisationID,
      userID: user.uid
    }
    axios({
      method: 'post',
      url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/getUserData',
      data: data
    }).then(function(response) {
      logger.info('👤  User Data Received!', response.data)
      track('User data fetched', {
        organisationID: organisationID,
        userID: user.uid
      })
      resolve(response.data)
    }).catch(function(error) {
      logger.error(error)
      const e = { statusCode: 400, message: '❌ 🔑  User data retrieval failed' }
      logger.error(e.message)
      reject(e)
    })
  })
}

const getUserTeamDetails = function(organisationID, user) {
  return new Promise((resolve, reject) => {
    const data = {
      organisationID: organisationID,
      userID: user.uid
    }
    axios({
      method: 'post',
      url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/getUserTeamDetails',
      data: data
    }).then(function(response) {
      logger.info('👤  User\'s Team Details Received!', response.data)
      resolve(response.data)
    }).catch(function(error) {
      logger.error(error)
      const e = { statusCode: 400, message: '❌ 🔑  User team details retrieval failed' }
      logger.error(e.message)
      reject(e)
    })
  })
}

const addUserToOrganisation = function(organisationID, user, verifiedEmails) {
  return new Promise((resolve, reject) => {
    const data = {
      organisationID: organisationID,
      userID: user.uid,
      verifiedEmails: verifiedEmails
    }
    axios({
      method: 'post',
      url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/addUserToOrganisation',
      data: data
    }).then(function(response) {
      logger.info('👤  User Joined and User Data Received!', response.data)
      track('User joined', {
        organisationID: organisationID,
        userID: user.uid
      })
      resolve(response.data)
    }).catch(function(error) {
      logger.error(error)
      const e = { statusCode: 400, message: '❌ 🔑  User joining and getting data failed' }
      logger.error(e.message)
      reject(e)
    })
  })
}

const routeByIntent = function(requestData) {
	logger.trace(routeByIntent)
	const d = Q.defer()
  var memory = {}
  if (requestData.intent == 'setTask') requestData.intent = 'setTask.dateTime' //temporary
  requestData.generalIntent = getGeneralIntent(requestData.intent)
  if (requestData.generalIntent == 'write') {
    memory = getWrittenMemory(requestData)
    // logger.info(memory)
  }
  if (requestData.lastAction) var lastActionMemory = getWrittenMemory(requestData.lastAction.requestData);
  // if (requestData.intent == 'provideURL') requestData.intent = 'setTask.URL'
  // if (requestData.intent == 'provideDateTime') requestData.intent = 'setTask.dateTime'
  const data = {requestData: requestData, memories: [memory]}
	try {
	} catch(e) {
		//This should start figuring out the intent instead of giving up!
		logger.error(e);
		d.reject(e)
	}

	switch(requestData.intent) {
		case "nextResult":
			tryAnotherMemory(sender);
			break;

		case "storeMemory":
      // logger.info(memory)
			storeMemory(memory, requestData)
			.then(function() {
				d.resolve(data)
			}).catch(function(e) {
				logger.error(e);
				d.reject(e)
			})
			break;

		case "query":
			try {
				recallMemory(requestData)
				.then(function(memories) {
					logger.log(memories)
          if (memories.length == 0)
            logger.trace(404, 'No results found')
          data.memories = memories;
					d.resolve(data)
				}).catch(function(e) {
          logger.error(e);
          d.reject(e)
				})
			} catch (e) {
				logger.error(e);
				d.reject(e)
			}
			break;

		case "provideURL":
		case "setTask.URL":
			try {
        memory = lastActionMemory || memory
        memory.intent = 'setTask.URL'
        const urlMemory = getWrittenMemory(requestData)
				memory.reminderRecipient = requestData.sender;
				if (!memory.triggerURL) memory.triggerURL = urlMemory.entities['trigger-website'] || urlMemory.entities['trigger-url'];
        if (!memory.triggerURL && requestData.intent == 'provideURL') {
          memory.triggerURL = urlMemory.entities['website'] || urlMemory.entities['url']
        }
				if (memory.triggerURL) {
					if (Array.isArray(memory.triggerURL)) memory.triggerURL = memory.triggerURL[0]
					memory.actionSentence = getActionSentence2(memory.content.description, memory.context)
          logger.info(memory.actionSentence)
          data.memories = [memory]
					storeMemory(memory)
					.then(function() {
						d.resolve(data)
					}).catch(function(e) {
						logger.error(e);
						d.reject(e)
					})
				} else {
					logger.trace(412, 'No URL specified');
          data.statusCode = 412
					d.resolve(data)
				}
			} catch(e) {
				logger.error(e);
				d.reject(e)
			}
			break;

		case "provideDateTime":
		case "setTask.dateTime":
			try {
        memory = lastActionMemory || memory
        memory.intent = 'setTask.dateTime'
        const dateTimeMemory = getWrittenMemory(requestData)
        // if (requestData.lastAction) {
        //   memory = requestData.lastAction.memories[0]
        // }
        var dateTimeOriginal = dateTimeMemory.entities['trigger-time'] || dateTimeMemory.entities['trigger-date'] || dateTimeMemory.entities['trigger-date-time'] || dateTimeMemory.entities['action-time'] || dateTimeMemory.entities['action-date'] || dateTimeMemory.entities['action-date-time']
        if (!dateTimeOriginal && requestData.intent == 'provideDateTime') {
          dateTimeOriginal = dateTimeMemory.entities['time'] || dateTimeMemory.entities['date'] || dateTimeMemory.entities['date-time'];
        }
				memory.reminderRecipient = requestData.sender;
				if (dateTimeOriginal) {
          // memory.actionSentence = getActionSentence(memory.sentence, memory.context)
          const actionText = rewriteSentence(memory.content.description, true)
          memory.actionSentence = getEmojis(actionText) + ' ' + actionText;
          memory.triggerDateTimeNumeric = getDateTimeNum(dateTimeOriginal, dateTimeMemory)
    			memory.triggerDateTime = new Date(memory.triggerDateTimeNumeric);
          data.memories = [memory]
					storeMemory(memory)
					.then(function() {
						scheduleReminder(memory);
						d.resolve(data)
					}).catch(function(e) {
						logger.error(e);
						d.reject(e)
					})
				} else {
					logger.trace(412, 'No date/time specified');
          data.statusCode = 412
					d.resolve(data)
				}
			} catch(e) {
				logger.error(e);
				d.reject(e)
			}
			break;

		// case "provideDateTime":
		// 	var dateTimeOriginal = memory.entities.time || memory.entities.date || memory.entities['date-time'];
		// 	memory.triggerDateTimeNumeric = getDateTimeNum(dateTimeOriginal, memory)
		// 	memory.triggerDateTime = new Date(memory.triggerDateTimeNumeric);
		// 	try {
		// 		// memory.intent = getContext(sender, 'lastAction').intent;
		// 		// memory.context = getContext(sender, 'lastAction').context;
		// 		// memory.entities = getContext(sender, 'lastAction').entities;
		// 		// memory.sentence = getContext(sender, 'lastAction').sentence;
		// 		memory.actionSentence = getActionSentence(memory.sentence, memory.context)
		// 		schedule.scheduleJob(memory.triggerDateTime, function(){
		// 			sendTextMessage(sender, '🔔 Reminder! ' + memory.actionSentence)
		// 			logger.log('Reminder!', memory.actionSentence);
		// 		});
		// 		d.resolve(data)
		// 	} catch(e) {
		// 		logger.error(e);
		// 		d.reject(e)
		// 	}
		// 	break;

		// case "provideURL":
		// 	try {
		// 		memory.triggerURL = memory.entities['url'] || memory.entities['website'];
		// 		memory.triggerURL = memory.triggerURL[0]
		// 		// memory.intent = getContext(sender, 'lastAction').intent;
		// 		// memory.context = getContext(sender, 'lastAction').context;
		// 		// memory.entities = getContext(sender, 'lastAction').entities;
		// 		// memory.sentence = getContext(sender, 'lastAction').sentence;
		// 		memory.actionSentence = getActionSentence(memory.sentence, memory.context)
		// 	} catch(e) {
		// 		logger.error(e);
		// 		d.reject(e)
		// 	}
		// 	storeMemory(memory)
		// 	.then(function() {
		// 		d.resolve(data)
		// 	}).catch(function(e) {
		// 		logger.error(e);
		// 		d.reject(e)
		// 	})
		// 	break;

		default:
			if (requestData.intent && requestData.intent != 'Default Fallback Intent') {
				// sendGenericMessage(sender, memory.intent, getContext(sender, 'consecutiveFails') );
        d.resolve({requestData: requestData})
			} else {
				recallMemory(requestData)
				.then(function(memories) {
					logger.log(memories)
					data.memories = memories;
					d.resolve(data)
				}).catch(function(e) {
					logger.error(e);
					d.reject(e)
				})
			}
			break;
	}
	return d.promise
}


const processNLP = function(sender, text, contexts) {
	logger.trace()
	const d = Q.defer()
  logger.log(text)
	try {
		const messageToApiai = text.substring(0, 256).replace(/\'/g, '\\\'').replace(/([\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF])/g, '').replace(/\/|\*/gi,''); // Only sends API.AI the first 256 characters as it can't hanlogger.tracee more than that
		const headers = {
			'Content-Type': 'application/json; charset=utf-8',
			'Authorization': 'Bearer bdeba24b4bcf40feb24a1b8c1f86f3f3'
		};
		const dataString = JSON.stringify({
      query: messageToApiai,
      timezone: 'GMT+1',
      lang: 'en',
      sessionId: sender,
      contexts: contexts
    })
		const options = {
			url: 'https://api.api.ai/v1/query?v=20150910',
			method: 'POST',
			headers: headers,
			body: dataString
		};
		function callback(error, response, body) {
			if (!error && response.statusCode == 200) {
        const result = JSON.parse(body).result
        result.intent = result.metadata.intentName
        result.resolvedQuery = text //Should actually just not rely on resolvedQuery later on
				d.resolve(result)
			} else {
        logger.error(response && response.statusCode);
        logger.error(error);
        // d.reject(error)
        // Need to handle this properly
        result = {
          intent: 'storeMemory',
          resolvedQuery: text,
        }
        d.resolve(result)
			}
		}
		request(options, callback);
	} catch(e) {
		logger.error(e);
		d.reject(e)
	}
	return d.promise
}



const recallMemory = function(requestData) {
	logger.trace(recallMemory)
	const d = Q.defer()
	const searchTerm = requestData.resolvedQuery;// memory.context.map(function(e){return e.value}).join(' ');
	fetchUserData(requestData.sender)
	.then(function(content) {
		const readAccessList = content.readAccess || [];
    /* Temporarily allowing everything to search ACME userID */ readAccessList[readAccessList.length] = '101118387301286232222'
		const userIdFilterString = 'userID: ' + requestData.sender + readAccessList.map(function(id) {return ' OR userID: '+id}).join('');
		const searchParams = {
			query: searchTerm.substring(0, 500), // Only sends Algolia the first 511 characters as it can't hanlogger.tracee more than that
			filters: userIdFilterString,
      hitsPerPage: 10,
			// filters: (attachments ? 'hasAttachments: true' : '')
		};
		return searchDb(AlgoliaIndex, searchParams)
	}).then(function(content) {
		if (!content.hits.length) {
      logger.trace('No results found')
    }
    d.resolve(content.hits)
    //  else {
			// d.reject(404);
			// tryCarousel(sender, memory.sentence)
			// .then(function() {
			// 	return Q.fcall(function() {return null});
			// }).catch(function(e) {
			// 	memory.failed = true;
			// 	return sendTextMessage(sender, "Sorry, I can't remember anything" + ((hitNum && hitNum > 0) ? " else" : "") + " similar to that!")
			// })
		// }
	// }).then(function() {
	// 	return getContext(sender, 'onboarding') ? sendTextMessage(sender, "Actually you now have two powers! With me, you also get the power of Unlimited Memory 😎😇🔮", 1500, true) : Q.fcall(function() {return null});
	// }).then(function() {
	// 	return getContext(sender, 'onboarding') ? sendTextMessage(sender, "Now feel free to remember anything below - text, images, video links you name it...", 1500, true) : Q.fcall(function() {return null});
	// }).then(function() {
	// 	setContext(sender, 'onboarding', false)
	// 	d.resolve()
	}).catch(function(err) {
		logger.error(err);
		d.reject(err)
	});
	return d.promise
}



// Seems like this function is no longer necessary?
const storeMemory = function(memory, requestData) {
	logger.trace(storeMemory)
	logger.trace(memory)
	logger.trace(requestData)
	const d = Q.defer()
	try {
    console.log(requestData);
    saveMemory(memory.sender, memory, requestData)
    .then(function(memory) {
      d.resolve(memory);
    }).catch(function(e) {
      logger.error(e);
      d.reject(e);
    });
	} catch (e) {
		logger.error(e);
		giveUp(sender);
	}
	return d.promise
}




const saveMemory = function(sender, m, requestData) {
	logger.trace()
	const d = Q.defer()
	m.hasAttachments = !!(m.attachments) /* @TODO: investigate whether brackets are needed */
  // logger.info(m)
  var author
  const memoryExists = !!m.objectID
  fetchUserData(sender)
  .then(function(res) {
    author = res
  //   return memoryExists ? getDbObject(AlgoliaIndex, m.objectID) : Q.fcall(function() {return null})
  // }).then(function(existingCard) {
		m.userID = author ? author.uploadTo || sender : sender;
  //   // if (author.teams) {
  //   //   if (!memoryExists) {
  //   //     m.teams = author.teams.map(function(team) {
  //   //       return team.teamID
  //   //     })
  //   //   } else {
  //   //     if (author.teams.filter(function(team) { return team.role == 'manager'}).length == 0 ) {
  //   //       m.pending = [m.content]
  //   //       m.content = existingCard ? existingCard.content : {}
  //   //     }
  //   //   }
  //   // }
  //   m.expiryDate = new Date().setMonth(new Date().getMonth() + 3)

	// 	const searchParams = {
	// 		query: m.content.description.substring(0, 500), // Only sends Algolia the first 511 characters as it can't hanlogger.tracee more than that
	// 		filters: 'userID: ' + m.userID,
	// 		getRankingInfo: true
	// 	};
	// 	return searchDb(AlgoliaIndex, searchParams)
	// // }).then(function() {
	// // 	return m.hasAttachments ? sendAttachmentUpload(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
  // }).then(function(results) {
	// 	if (m.hasAttachments && results[0] && results[0].value.attachment_id) m.attachments[0].attachment_id = results[0].value.attachment_id;
		return m.hasAttachments && m.attachments[0].type=="image" ? backupAttachment(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
	}).then(function(url) {
		if (m.hasAttachments && url) m.attachments[0].url = url;
		if (memoryExists) {
      // logger.info(m)
			return updateDb(sender, m, requestData)
		} else {
			return saveToDb(sender, m, requestData)
		}
	}).then(function(m) {
		d.resolve(m)
	}).catch(function(e) {
		logger.error(e);
		d.reject(e)
	});
	return d.promise;
}

const getDbObject = function(index, objectID, returnArray) {
	logger.trace()
	const d = Q.defer();
	index.getObject(objectID, returnArray, function(err, content) {
		if (err) {
      logger.error(err);
			d.reject(err)
		} else {
			d.resolve(content);
		}
	});
	return d.promise;
}
exports.getDbObject = getDbObject;

const searchDb = function(index, params, userID) {
	logger.trace()
	const d = Q.defer();
	index.search(params, function searchDone(err, content) { /* @TODO: investigate whether function name is needed */
		if (err) {
      logger.error(err);
			d.reject(err)
		} else {
			fetchListItemCards(content.hits)
			.then(function() {
        logger.trace()
				d.resolve(content);
			})
		}
	});
	return d.promise;
}

const saveToDb = function(sender, memory, requestData) {
  /* Temporarily replacing all Slack userIDs with ACME userID */ if(memory.userID.length < 10) memory.userID = '101118387301286232222'
  logger.trace()
	const d = Q.defer();
	memory.dateCreated = Date.now()
  memory.dateUpdated = Date.now()
	// AlgoliaIndex.addObject(memory, function(err, content){
	// 	if (err) {
	// 		// sendTextMessage(id, "I couldn't remember that");
  //     logger.error(err);
	// 		d.reject(err);
	// 	} else {
	// 		logger.trace('User memory created successfully!');
	// 		memory.objectID = content.objectID
	// 		d.resolve(memory);
	// 	}
	// });

  const data = {
    organisationID: requestData.organisationID,
    objectID: memory.objectID || null,
    content: memory.content,
    userID: requestData.user.uid
  }
  console.log('💎  Here\'s the data:', data)
  axios({
    method: 'post',
    url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/saveCard',
    data: data
  }).then(function(response) {
    console.log('📪  The response data!', response.data)
    memory.objectID = response.data.objectID
    data.objectID = memory.objectID
    track('Card Created', {
      organisationID: data.organisationID,
      userID: data.userID,
      card: data
    })
    d.resolve()
  }).catch(function(e) {
    console.log('📛  Error!', e);
    d.reject()
  })
	return d.promise;
}
const updateDb = function(sender, memory, requestData) {
  /* Temporarily replacing all Slack userIDs with ACME userID */ if(memory.userID.length < 10) memory.userID = '101118387301286232222'
	logger.trace()
	const d = Q.defer();
	memory.dateUpdated = Date.now()
	// AlgoliaIndex.saveObject(memory, function(err, content){
	// 	if (err) {
	// 		logger.error(err);
	// 		d.reject(err);
	// 	} else {
	// 		logger.trace('User memory updated successfully!');
	// 		d.resolve(memory);
	// 	}
	// });

  console.log(requestData);
  const data = {
    organisationID: requestData.organisationID,
    objectID: memory.objectID || null,
    content: memory.content,
    userID: requestData.user.uid
  }
  console.log('💎  Here\'s the data:', data)
  axios({
    method: 'post',
    url: 'https://us-central1-savvy-96d8b.cloudfunctions.net/saveCard',
    data: data
  }).then(function(response) {
    console.log('📪  The response data!', response.data);
    track('Card Updated', {
      organisationID: data.organisationID,
      userID: data.userID,
      card: data
    })
    d.resolve()
  }).catch(function(e) {
    console.log('📛  Error!', e);
    d.reject()
  })
	return d.promise;
}
const deleteFromDb = function(sender, organisationID, objectID) {
  // IS THIS SECURE? DOES IT DIFFERENTIATE BY SENDER????
	logger.trace()
	const d = Q.defer();
	AlgoliaIndex.deleteObject(objectID, function(err, content){
		if (err) {
			// sendTextMessage(id, "I couldn't do that");
			logger.error(err);
			d.reject(err);
		} else {
			logger.trace('User memory deleted successfully!');
      track('Card Deleted', {
        organisationID: organisationID,
        userID: sender,
        objectID: objectID
      })
			d.resolve();
		}
	});
	return d.promise;
}


const getLocalUser = function(userID) {
	if (!global.users)
		global.users = {}
	if (!global.users[userID])
		global.users[userID] = {}
	return global.users[userID]
}

const fetchUserData = function(userID, forceRefresh) {
	logger.trace(fetchUserData)
	const d = Q.defer()
	if (!forceRefresh && (userData = getLocalUser(userID).userData)) {
		d.resolve(userData)
	} else {
		fetchUserDataFromDb(userID)
		.then(function(userData) {
			d.resolve(userData)
		}).catch(function(e) {
      logger.info('hello')
      logger.info(e.statusCode)
      if (e.statusCode == 404 || e.statusCode == '404') {
        logger.info('yoyo')
        createUserAccount({objectID: userID})
        .then(function(userData) {
          d.resolve(userData)
        }).catch(function(e) {
          logger.error(e)
          d.reject(e)
        })
      } else {
        logger.error(e)
        d.reject(e)
      }
		})
	}
	return d.promise
}

const fetchUserDataFromDb = function(userID) {
	logger.trace()
	return getDbObject(AlgoliaUsersIndex, userID)
}
exports.fetchUserDataFromDb = fetchUserDataFromDb;

const createUserAccount = function(userData) {
	logger.trace()
	const d = Q.defer()

  try {

    userData.dateCreated = new Date()
  	// Generate the value to be used for the Secure API key
  	const searchOnlyApiKey = userData.objectID + '_' + crypto.randomBytes(12).toString('hex');

    logger.info()
  	// Generate Secure API token using this value
  	const params = {
  		filters: 'userID:' + userData.objectID + ' OR public = true',
  		restrictIndices: process.env.ALGOLIA_INDEX,
  		userToken: userData.objectID
  	};
  	var publicKey = AlgoliaClient.generateSecuredApiKey(searchOnlyApiKey, params);
    logger.info()
  	// Save userData to 'users' Algolia index
  	userData.searchOnlyApiKey = searchOnlyApiKey;

    logger.info()
  	//Save it to current memory
  	getLocalUser(userData.objectID).userData = userData;
    logger.info()
  } catch(e) {
    logger.error(e)
  }
	AlgoliaUsersIndex.addObject(userData, function(e, content) {
		if (e) {
			logger.error(e);
			d.resolve(e)
		} else {
      logger.info(content)
			d.resolve(content)
		}
	});
	return d.promise
}



const getDateTimeNum = function(dateTimeOriginal, memory) {
	// logger.trace(getDateTimeNum)
	// dateTime = dateTimeOriginal[0]
	// dateTime = chrono.parseDate(dateTime) || dateTime;
	// var dateTimeNum = dateTime.getTime();
	// if (!memory.entities['trigger-time'] && !memory.entities['trigger-date'] && dateTimeOriginal.toString().length > 16)
  //   dateTimeNum = dateTimeNum - 3600000
	// if (dateTimeNum < new Date().getTime() && dateTimeNum+43200000 > new Date().getTime())
  //   dateTimeNum += 43200000;
	// else if (dateTimeNum < new Date().getTime() && dateTimeNum+86400000 > new Date().getTime())
  //   dateTimeNum += 86400000;

  // Trying out replacing all the above with Sherlock

  var sherlockTime = Sherlock.parse(memory.content.description).startDate
  if (!sherlockTime.hasMeridian && sherlockTime.getHours() > 12) {
    sherlockAmTime = new Date(sherlockTime - 43200000)
    if (sherlockAmTime.getHours() > 7 && sherlockAmTime > new Date()) {
      logger.info('Resetting to AM')
      sherlockTime = sherlockAmTime
    }
  }

  var apiTime = new Date(dateTimeOriginal[0]).getTime() || new Date(dateTimeOriginal[0].split('/')[0]).getTime()
  if (!apiTime) {
    const d = dateTimeOriginal[0].split(':')
    apiTime = new Date().setHours(d[0], d[1], d[2])
  }
  apiTime = new Date(apiTime)
  // logger.info(apiTime)
  // logger.info(sherlockTime)
  // logger.info(apiTime.getTime())
  // logger.info(sherlockTime.getTime())
  var diff = sherlockTime - apiTime + 3600000
  var myTest = diff < 2000
  // if (myTest)
  //   logger.warn(myTest)
  // else
  //   logger.info(myTest)

  const dateTimeNum = sherlockTime.getTime()
	return dateTimeNum
}



const backupAttachment = function(recipientId, attachmentType, attachmentURL) {
	logger.trace(backupAttachment)
	const d = Q.defer()
	cloudinary.uploader.upload(attachmentURL, function(result, error) {
		if (error) {
      logger.error(error);
			d.reject(error)
		} else {
			d.resolve(result.url)
		}
	});
	return d.promise
}


const scheduleReminder = function(memory) {
	logger.trace(scheduleReminder)
	schedule.scheduleJob(memory.triggerDateTime, function(){
    delete memory.resultSentence
    const data = {
      statusCode: 200,
      requestData: {
        sender: memory.reminderRecipient || memory.userID,
        intent: 'reminder.dateTime'
      },
      memories: [
        memory
      ]
    }
    sendClientMessage(data)
		logger.trace('Reminder!', memory.actionSentence);
	});
}



const fetchListItemCards = function(cards) {
	logger.trace(fetchListItemCards)
  const d = Q.defer()
  const self = this
  const promises = []
  cards.forEach(function(card) {
    if (card.listItems) {
      card.listCards = {}
      card.listItems.forEach(function(key) {
        const p = Q.defer()
        getDbObject(AlgoliaIndex, key)
        .then(function(content) {
          card.listCards[key] = content;
          p.resolve(content);
        }).catch(function(e) {
          logger.error(e);
          p.reject(e)
        })
        promises.push(p.promise)
      })
    }
  })
  Q.allSettled(promises)
  .then(function(results) {
    logger.trace(results)
    d.resolve(results);
  }).catch(function(e) {
    logger.error(e);
    d.reject(e)
  })
  return d.promise
}


const getActionSentence2 = function(sentence, context, reminder) {
  logger.info(sentence)
  const splitSecond = [
    'need to',
    'emind you to',
    'emind you'
  ]
  const splitFirst = [
    'when you',
    'next time'
  ]
  var text = sentence
  splitSecond.forEach(function(phrase) {
    if (sentence.indexOf(phrase) > -1 && text == sentence)
      text = sentence.split(phrase)[1]
  })
  var text1 = text
  splitFirst.forEach(function(phrase) {
    if (text.indexOf(phrase) > -1 && text1 == text)
      text1 = text.split(phrase)[0]
  })
  text1 = rewriteSentence(text1, reminder)
  return getEmojis(text1) + ' ' + text1;
}


const getActionSentence = function(sentence, context, reminder) {
	// logger.trace(getActionSentence)
	// const actionContext = [];
	// context.forEach(function(c) {
	// 	if (c.type.indexOf('action-') > -1) {
	// 		actionContext.push(c.value);
	// 	}
	// })
	// const start = Math.min.apply(null, actionContext.map(function(a) {
	// 	return sentence.toLowerCase().indexOf(a.toLowerCase())
	// }).filter(function(b) {
	// 	return b > -1
	// }))
	// const end = Math.max.apply(null, actionContext.map(function(a) {
	// 	return sentence.toLowerCase().indexOf(a.toLowerCase()) + a.length
	// }).filter(function(b) {
	// 	return b > -1
	// }))
	// const text = rewriteSentence(sentence.substring(start, end+1))
	const text = rewriteSentence(sentence, reminder)
  return getEmojis(sentence) + ' ' + sentence;

  // Trying out replacing all the above with Sherlock
  // const text = rewriteSentence(Sherlock.parse(sentence).eventTitle)
  // const actionSentence = getEmojis(text) + ' ' + text;
	// return actionSentence
}

function rewriteSentence(originalSentence, reminder) { // Currently very primitive!
	logger.trace(rewriteSentence);
  var sentence = JSON.parse(JSON.stringify(originalSentence))
	sentence = sentence.trim().replace(/’/g, '\'');
  // const remove1 = [
  //   /^Remember that /i,
  //   /^Remember /i,
	// 	/^Remind me to /i,
  //   /^Remind me /i,
	// 	/^I need to /i,
  //   /^I should /i,
  // ]
  if (reminder) {
    const remove1 = [
      ["remember that ", /remember that /i],
      ["remember to ", /remember to /i],
      ["remember ", /remember /i],
      ["remind you to ", /remind you to /i],
      ["remind you ", /remind you /i],
      ["you need to ", /you need to /i],
      ["you should ", /you should /i],
    ]
    const remove2 = [
      /^Please /i,
      / please\.^/i,
      / please^/i,
    ];
    remove1.forEach(function(r) {
      const pos = sentence.toLowerCase().indexOf(r[0])
      if (pos > -1) {
        if (pos > 4) {
          sentence = sentence.substring(pos+r[0].length, sentence.length)
        }
        else {
          sentence = sentence.replace(r[1], ' ')
          sentence = reminder ? (Sherlock.parse(sentence).eventTitle || sentence) : sentence
        }
      }
    });
    const origPos = originalSentence.indexOf(sentence)
    if (origPos > 15) {
      sentence = originalSentence.substring(origPos, originalSentence.length)
    }
    remove2.forEach(function(r) {
      sentence = sentence.replace(r, '');
    });
  }
  var sentenceE = encodeURIComponent(sentence)
  const replaceE = [
    ["I%5C'm", 'you\'re'],
    ["i%5C'm", 'you\'re'],
  ];
  replaceE.forEach(function(r) {
    sentenceE = sentenceE.replace(r[0], r[1]);
  });
  sentence = decodeURIComponent(sentenceE)

  const replace = [
    [/\bI\'m\b/i, 'you\'re'],
    [/\bIm\b/i, 'you\'re'],
    [/\bI am\b/i, 'you are'],
    [/\bme\b/i, 'you'],
    [/\bmy\b/i, 'your'],
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
	logger.trace();
	const entities = JSON.parse(JSON.stringify(e)); // Hopefully this avoids deleting/editing things in the original entities object outside this function!
		const finalEntities = {
		context: [],
		entities: {}
	};
		// if (entities.intent) delete entities.intent;
	const names = Object.keys(entities);
	names.forEach(function(name) {
		if (entities[name] && entities[name].length) {
			if (!Array.isArray(entities[name])) entities[name] = [entities[name]];
			finalEntities.entities[name] = entities[name];
			entities[name].forEach(function(value) {
				finalEntities.context.push({
					type: name,
					value: value
				})
			});
		}
	});
	return finalEntities;
}

const getWrittenMemory = function(requestData) {
  var memory = requestData.parameters ? extractAllContext(requestData.parameters) : {}
  // logger.info('❇️ ❇️ ❇️ ' + requestData.intent)
  memory.intent = requestData.intent;
  memory.sender = requestData.sender;
  memory.content = requestData.content || {
    description: rewriteSentence(requestData.resolvedQuery),
    listItems: requestData.listItems,
  }
  memory.sentence = memory.content.description // Temporary until we update chrome extension
  memory.extractedFrom = requestData.extractedFrom
  memory.attachments = requestData.attachments;
  memory.triggerURL = requestData.triggerURL;
  if (requestData.objectID) memory.objectID = requestData.objectID;
  // logger.info(memory);
  return memory
}


const getEmojis = function(text, entities, max, strict) {
	if (strict) {
		const words = entities['noun'] || entities['action-noun'] || entities['verb'] || entities['action-verb']
		if (words) text = words.join(' ')
	}

	return (emoji.translate(text.replace(/[0-9]/g, ''), true).substring(0, 2) || '✅')
}


const combineObjects = function(a, b) {
  // a's properties have priority over b's
  Object.keys(a).forEach(function(key) {
    b[key] = a[key]
  })
  return b
}

const getGeneralIntent = function(intent) {
  // What about no intent?
  // 'provideDateTime', 'provideURL' shouldn't really be automatically 'write'
  if (['storeMemory', 'setTask', 'setTask.dateTime', 'setTask.URL', 'deleteMemory', 'provideDateTime', 'provideURL'].indexOf(intent) > -1) {
    return 'write'
  } else if (['query']) {
    return 'read'
  } else {
    return 'other'
  }
}

rescheduleAllReminders();
