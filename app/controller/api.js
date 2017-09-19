//TODO: intent 'nextResult'
//TODO: reminders that are too soon
//TODO: reminders when clocks differ between devices
//TODO: timezones
//TODO: reminders push back 9pm to 9am instead of 9pm the next day
//TODO: dateTime extractor libraries


const request = require('request');
const Q = require("q");
const emoji = require('moji-translate');
const schedule = require('node-schedule');
const chrono = require('chrono-node')
const Sherlock = require('sherlockjs');

const properties = require('../config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});
// tracer.setLevel('warn');

// Algolia setup
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(properties.algolia_index);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);

// Cloudinary setup
const cloudinary = require('cloudinary');
cloudinary.config({
  cloud_name: 'forgetmenot',
  api_key: '645698655223266',
  api_secret: 'j2beHW2GZSpQ_zq_8bkmnWgW95k'
});


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


exports.deleteMemories = function(sender, objectID) {
  logger.trace('deleteMemories');
	const d = Q.defer()
	deleteFromDb(sender, objectID)
	.then(function(result) {
		d.resolve(result)
	}).catch(function(e) {
    logger.error(e);
		d.reject(e)
	})
  return d.promise
}


exports.acceptRequest = function(requestData) {
  logger.trace('acceptRequest');
	const d = Q.defer()
  processNLP(requestData.sender, requestData.text, requestData.contexts)
	.then(function(nlpData) {
    requestData = combineObjects(requestData, nlpData)
		return routeByIntent(requestData)
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

const routeByIntent = function(requestData) {
	logger.trace(routeByIntent)
	const d = Q.defer()
  var memory = {}
  if (requestData.intent == 'setTask') requestData.intent = 'setTask.dateTime' //temporary
  requestData.generalIntent = getGeneralIntent(requestData.intent)
  if (requestData.generalIntent == 'write') {
    memory = getWrittenMemory(requestData)
    logger.log(memory)
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

	logger.log(memory)
	switch(requestData.intent) {
		case "nextResult":
			tryAnotherMemory(sender);
			break;

		case "storeMemory":
			storeMemory(memory)
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
				memory.triggerURL = urlMemory.entities['trigger-website'] || urlMemory.entities['trigger-url'];
        if (!memory.triggerURL && requestData.intent == 'provideURL') {
          memory.triggerURL = urlMemory.entities['website'] || urlMemory.entities['url']
        }
				if (memory.triggerURL) {
					memory.triggerURL = memory.triggerURL[0]
					memory.actionSentence = getActionSentence(memory.sentence, memory.context)
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
        var dateTimeOriginal = dateTimeMemory.entities['trigger-time'] || dateTimeMemory.entities['trigger-date'] || dateTimeMemory.entities['trigger-date-time'];
        if (!dateTimeOriginal && requestData.intent == 'provideDateTime') {
          dateTimeOriginal = dateTimeMemory.entities['time'] || dateTimeMemory.entities['date'] || dateTimeMemory.entities['date-time'];
        }
				memory.reminderRecipient = requestData.sender;
				if (dateTimeOriginal) {
					memory.actionSentence = getActionSentence(memory.sentence, memory.context)
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
		const messageToApiai = text.substring(0, 256).replace(/\'/g, '\\\''); // Only sends API.AI the first 256 characters as it can't hanlogger.tracee more than that
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
				d.resolve(result)
			} else {
				logger.error(error);
				d.reject(error)
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
const storeMemory = function(memory) {
	logger.trace(storeMemory);
	const d = Q.defer()
	try {
    saveMemory(memory.sender, memory)
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




const saveMemory = function(sender, m) {
	logger.trace()
	const d = Q.defer()
	m.hasAttachments = !!(m.attachments) /* @TODO: investigate whether brackets are needed */
	fetchUserData(sender)
	.then(function(content) {
		m.userID = content ? content.uploadTo || sender : sender;
		const searchParams = {
			query: m.sentence.substring(0, 500), // Only sends Algolia the first 511 characters as it can't hanlogger.tracee more than that
			filters: 'userID: ' + m.userID,
			getRankingInfo: true
		};
		return searchDb(AlgoliaIndex, searchParams)
	// }).then(function() {
	// 	return m.hasAttachments ? sendAttachmentUpload(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
}).then(function(results) {
		if (m.hasAttachments && results[0] && results[0].value.attachment_id) m.attachments[0].attachment_id = results[0].value.attachment_id;
		return m.hasAttachments && m.attachments[0].type=="image" ? backupAttachment(sender, m.attachments[0].type, m.attachments[0].url) : Q.fcall(function() {return null});
	}).then(function(url) {
		if (m.hasAttachments && url) m.attachments[0].url = url;
		if (m.objectID) {
			return updateDb(sender, m)
		} else {
			return saveToDb(sender, m)
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

const searchDb = function(index, params) {
	logger.trace(searchDb)
	const d = Q.defer();
	index.search(params, function searchDone(err, content) { /* @TODO: investigate whether function name is needed */
		if (err) {
      logger.error(err);
			d.reject(err)
		} else {
			logger.log(content.hits.map(function(hit) { return hit.sentence.substring(0,100) }));
			fetchListItemCards(content.hits)
			.then(function() {
        logger.trace()
				d.resolve(content);
			})
		}
	});
	return d.promise;
}

const saveToDb = function(sender, memory) {
  logger.trace(saveToDb)
	const d = Q.defer();
	memory.dateCreated = Date.now();
	AlgoliaIndex.addObject(memory, function(err, content){
		if (err) {
			// sendTextMessage(id, "I couldn't remember that");
      logger.error(err);
			d.reject(err);
		} else {
			logger.trace('User memory created successfully!');
			memory.objectID = content.objectID
			d.resolve(memory);
		}
	});
	return d.promise;
}
const updateDb = function(sender, memory) {
	logger.trace(updateDb)
	const d = Q.defer();
	memory.dateUpdated = Date.now();
	AlgoliaIndex.saveObject(memory, function(err, content){
		if (err) {
			logger.error(err);
			d.reject(err);
		} else {
			logger.trace('User memory updated successfully!');
			d.resolve(memory);
		}
	});
	return d.promise;
}
const deleteFromDb = function(sender, objectID) {
	logger.trace(deleteFromDb)
	const d = Q.defer();
	AlgoliaIndex.deleteObject(objectID, function(err, content){
		if (err) {
			// sendTextMessage(id, "I couldn't do that");
			logger.error(err);
			d.reject(err);
		} else {
			logger.trace('User memory deleted successfully!');
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
      logger.error(e)
			d.reject(404)
		})
	}
	return d.promise
}
const fetchUserDataFromDb = function(userID) {
	logger.trace(fetchUserDataFromDb)
	return getDbObject(AlgoliaUsersIndex, userID)
}

const createUserAccount = function(userData) {
	logger.trace(createUserAccount)
	const d = Q.defer()

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
	getLocalUser(userData.objectID).userData = userData;
	AlgoliaUsersIndex.addObject(userData, function(e, content) {
		if (e) {
			logger.error(e);
			d.resolve(e)
		} else {
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
  const dateTimeNum = Sherlock.parse(memory.sentence).startDate.getTime()
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



const getActionSentence = function(sentence, context) {
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

  // Trying out replacing all the above with Sherlock
  const text = Sherlock.parse(sentence).eventTitle
	return getEmojis(sentence) + ' ' + sentence;
}

function rewriteSentence(sentence) { // Currently very primitive!
	logger.trace(rewriteSentence);
	sentence = sentence.trim().replace(/’/g, '\'');
  const remove = [
    /^Remember that /i,
    /^Remember /i,
		/^Remind me to /i,
    /^Remind me /i,
    /^Please /i,
		/ please\.^/i,
    / please^/i,

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
	logger.trace(extractAllContext);
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
  var memory = extractAllContext(requestData.parameters);
  memory.intent = requestData.intent;
  memory.sender = requestData.sender;
  memory.sentence = rewriteSentence(requestData.resolvedQuery);
  memory.attachments = requestData.attachments;
  if (requestData.objectID) memory.objectID = requestData.objectID;
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
