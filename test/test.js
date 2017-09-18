//TODO: delete Cloudinary images saved during tests
//TODO: find better loggin system
//TODO: + easy way to get logs before any error

const Q = require("q");
const assert = require('assert');

const api = require('../app/controller/api');
const chatbot = require('../app/controller/chatbot');
const properties = require('../app/config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});

// Algolia setup
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(properties.algolia_index);

const temporaryMemories = []

const sendRequest = function(apiFunction, data, results, done) {
  const d = Q.defer()
  logger.log(results)
  apiFunction(data)
  .then(function(body) {
    body = JSON.parse(JSON.stringify(body))
    if (results) results.body = body
    if (done) {
      done()
    }
    if (body.requestData.generalIntent == 'write' && body.requestData.intent != 'deleteMemory') {
      temporaryMemories.push(body.memories[0].objectID)
    }
    d.resolve(body)
  }).catch(function(e) {
    if (e == 412) {
      logger.trace(e)
      done()
    } else {
      logger.error(e);
      if (done) done(e)
      d.reject(e)
    }
  })
  return d.promise
}

const sendApiRequest = function(sender, message, results, done) {
  const data = {
    sender: sender,
    text: message,
  }
  const apiFunction = api.acceptRequest
  return sendRequest(apiFunction, data, results, done)
}


const sendApiDeleteRequest = function(sender, objectID, results, done) {
  api.deleteMemories(sender, objectID)
  .then(function(body) {
    results.body = body
    logger.log(results)
    if (done) done()
  }).catch(function(e) {
    logger.error(e);
    if (done) done(e)
  })
}


  const sendChatbotRequest = function(sender, message, results, done) {
    const data = {
      entry: [
        {
          messaging: [
            {
              sender: {
                id: sender
              },
              message: {
                text: message
              },
            }
          ]
        }
      ]
    }
    const apiFunction = chatbot.handleMessage
    return sendRequest(apiFunction, data, results, done)
  }


const sendChatbotQuickReply = function(sender, code, results, done) {
  const data = {
    entry: [
      {
        messaging: [
          {
            sender: {
              id: sender
            },
            message: {
              quick_reply: {
                payload: code
              }
            },
          }
        ]
      }
    ]
  }
  const apiFunction = chatbot.handleMessage
  return sendRequest(apiFunction, data, results, done)
}

const sendChatbotPostback = function(sender, code, results, done) {
  const data = {
    entry: [
      {
        messaging: [
          {
            sender: {
              id: sender
            },
            postback: {
              payload: code
            }
          }
        ]
      }
    ]
  }
  const apiFunction = chatbot.handleMessage
  return sendRequest(apiFunction, data, results, done)
}

const sendChatbotAttachments = function(sender, code, results, done) {
  const data = {
    entry: [
      {
        messaging: [
          {
            sender: {
              id: sender
            },
            message: {
              attachments: [
                {
                  type: 'image',
                  payload: {
                    url: 'https://unsplash.it/200/300/?random'
                  }
                }
              ]
            },
          }
        ]
      }
    ]
  }
  const apiFunction = chatbot.handleMessage
  return sendRequest(apiFunction, data, results, done)
}






const checkMemoryExistence = function(objectID) {
  const d = Q.defer()
  AlgoliaIndex.getObject(objectID, function searchDone(err, content) {
    if (err && err.statusCode == 404) {
		  d.resolve(false)
    } else { // This isn't quite right
      logger.error(err)
      d.reject(err)
    }
	});
  return d.promise
}



describe('Bulk', function() {
  this.timeout(10000);
  const sender = 1627888800569309;

  describe('API', function() {

    const unlikelyQuery = "What is Lorem ipsum dolor sit amet, consectetur adipiscing elit?"
    describe('Sending the unlikely query "' + unlikelyQuery + '" which won\'t bring back any results', function() {
      const results = {};
      before(function(done) {
        sendApiRequest(sender, unlikelyQuery, results, done)
      })

      it('should be interpreted as a "query" or "Default Fallback Intent"', function(done) {
        assert(results.body.requestData.metadata.intentName == 'query' || results.body.requestData.metadata.intentName == 'Default Fallback Intent')
        done()
      })
      it('should bring back no results', function(done) {
        assert.equal(results.body.memories.length, 0)
        done()
      })
    })

    const shortMessage = "Test Message"
    describe('Sending the short message "' + shortMessage + '"', function() {
      const results = {};
      before(function(done) {
        sendApiRequest(sender, shortMessage, results, done)
      })

      it('should be interpreted as a "query" or "Default Fallback Intent"', function(done) {
        assert(results.body.requestData.metadata.intentName == 'query' || results.body.requestData.metadata.intentName == 'Default Fallback Intent')
        done()
      })
      it('should bring back a result with a "sentence" parameter', function(done) {
        assert(results.body.memories[0].sentence)
        done()
      })
    })

    const message = "This is my cat"
    const expectedReturn = "This is your cat"
    describe('Sending the message "' + message + '"', function() {
      const results = {};
      before(function(done) {
        sendApiRequest(sender, message, results, done)
      });

      it('should be interpreted as a "storeMemory"', function(done) {
        assert.equal(results.body.requestData.metadata.intentName, 'storeMemory')
        done()
      })
      it('should bring back a result with the "sentence" parameter "' + expectedReturn + '"', function(done) {
        assert.equal(results.body.memories[0].sentence, expectedReturn)
        done()
      })
    })

    describe('Date/Time-based Reminders', function() {

      const message2 = "Remind me to feed the cat in 5 mins"
      describe('Sending the message "' + message2 + '"', function() {
        const expectedIntent = "setTask.dateTime"

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message2, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with a "triggerDateTime" parameter', function(done) {
          logger.trace(results.body.memories[0])
          assert(results.body.memories[0].triggerDateTime)
          done()
        })
        it('should have triggerDateTime set as...')
      })

      const message2a = "Remind me at 5pm to feed the cat"
      describe('Sending the message "' + message2a + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505620800000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message2a, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"'
          // , function(done) {
          //   logger.trace(results.body.memories[0])
          //   assert.equal(new Date(results.body.memories[0].triggerDateTime).getTime(), expectedDateTimeNum)
          //   done()
          // }
        )
      })

      const message3 = "Remind me at 5pm tomorrow to feed the cat"
      describe('Sending the message "' + message3 + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505664000000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message3, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"'
          // , function(done) {
          //   logger.trace(results.body.memories[0])
          //   assert.equal(new Date(results.body.memories[0].triggerDateTime).getTime(), expectedDateTimeNum)
          //   done()
          // }
        )
      })

      const message4 = "Remind me tomorrow at 5pm to feed the cat"
      describe('Sending the message "' + message4 + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505664000000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message4, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"'
          // , function(done) {
          //   logger.trace(results.body.memories[0])
          //   assert.equal(new Date(results.body.memories[0].triggerDateTime).getTime(), expectedDateTimeNum)
          //   done()
          // }
        )
      })
    })



    describe('URL-based Reminders', function() {
      const message5 = "Remind me to buy cat food next time I'm on Tesco.com"
      describe('Sending the message "' + message5 + '"', function() {
        const expectedIntent = "setTask.URL"
        const expectedUrl = 'Tesco.com'

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message5, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerUrl" parameter "' + expectedUrl + '"', function(done) {
          assert.equal(results.body.memories[0].triggerUrl, expectedUrl)
          done()
        })
      })
    })


    after(function() {

    })
  });







  describe('Chatbot', function() {

    const unlikelyQuery = "What is Lorem ipsum dolor sit amet, consectetur adipiscing elit?"
    describe('Sending the unlikely query "' + unlikelyQuery + '" which won\'t bring back any results', function() {
      const expectedFragment = 'Sorry I couldn\'t find any memories related to that!'

      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, unlikelyQuery, results, done)
      })

      it('should be interpreted as a "query" or "Default Fallback Intent"', function(done) {
        assert(results.body.requestData.metadata.intentName == 'query' || results.body.requestData.metadata.intentName == 'Default Fallback Intent')
        done()
      })
      it('should bring back no results', function(done) {
        assert.equal(results.body.memories.length, 0)
        done()
      })
      it('should bring back a message saying it couldn\'t find anything', function(done) {
        assert(results.body.messageData[0].data.message.text.indexOf(expectedFragment) > -1)
        done()
      })
    })

    const greeting = "Hello"
    describe('Sending the greeting "' + greeting + '"', function() {
      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, greeting, results, done)
      })

      it('should be interpreted as a "greeting"', function(done) {
        assert(results.body.requestData.metadata.intentName == 'greeting')
        done()
      })
      it('should return a message', function(done) {
        assert(results.body.messageData[0].data.message.text)
        done()
      })
    })

    const shortMessage = "Test Message"
    describe('Sending the chatbot1 short message "' + shortMessage + '"', function() {
      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, shortMessage, results, done)
      })

      it('should return a message', function(done) {
        assert(results.body.messageData[0].data.message.text)
        done()
      })
      it('should bring back more quick reply options', function(done) {
        assert(results.body.messageData[0].data.message.quick_replies && results.body.messageData[0].data.message.quick_replies.length)
        done()
      })
    })

    const message1 = "This is my cat"
    describe('Sending the message "' + message1 + '"', function() {
      const expectedFragment = "I've now remembered that for you!"

      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, message1, results, done)
      });

      it('should be say it\s remembered it for you', function(done) {
        assert(results.body.messageData[0].data.message.text.indexOf(expectedFragment) > -1)
        done()
      })
    })

    const message2 = "Remind me to feed the cat in 5 mins"
    describe('Sending the message "' + message2 + '"', function() {
      const expectedIntent = "setTask.dateTime"
      const expectedFragment = "I've now set that reminder for you!"

      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, message2, results, done)
      });

      it('should be interpreted as a ' + expectedIntent, function(done) {
        assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
        done()
      })
      it('should bring back a result with a "triggerDateTime" parameter', function(done) {
        logger.trace(results.body.memories[0])
        assert(results.body.memories[0].triggerDateTime)
        done()
      })
      it('should be say it\'s set that reminder for you', function(done) {
        assert(results.body.messageData[0].data.message.text.indexOf(expectedFragment) > -1)
        done()
      })
    })




    describe('Message sequences', function() {
      const message1 = "What is my name?"
      const code1 = "USER_FEEDBACK_MIDDLE"
      describe('Recall different memories, change to storeMemory, add attachment, change back and then request Carousel', function() {
        var resultList = []
        describe('!...Sending the message "' + message1 + '", followed by the quick reply "' + code1 + '"', function() {

          before(function() {
            const d = Q.defer()
            sendChatbotRequest(sender, message1)
            .then(function(res) {
              resultList.push(res)
              sendChatbotQuickReply(sender, code1)
              .then(function(res1) {
                resultList.push(res1)
                d.resolve()
              }).catch(function(e) {
                d.reject(e)
              })
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should ask what it should have done', function(done) {
            assert.equal(resultList[1].messageData[0].data.message.text, 'Whoops - was there something you would have preferred me to do?')
            done()
          })
          it('should bring back more quick reply options', function(done) {
            assert(resultList[1].messageData[0].data.message.quick_replies && resultList[1].messageData[0].data.message.quick_replies.length)
            done()
          })
        })

        const code2 = "CORRECTION_QUERY_DIFFERENT"
        describe('!...followed by the quick reply "' + code2 + '"', function() {

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code2)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should bring back a different result from the previous one', function(done) {
            assert.notEqual(resultList[0].messageData[0].data.message.text, resultList[2].messageData[0].data.message.text)
            done()
          })
        })

        const code3 = "CORRECTION_QUERY_TO_STORE"
        describe('...followed by the quick reply "' + code1 + '", then the quick reply "' + code3 + '"', function() {
          const expectedFragment = "I've now remembered that for you!"

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code1)
            .then(function(res) {
              resultList.push(res)
              sendChatbotQuickReply(sender, code3)
              .then(function(res1) {
                resultList.push(res1)
                d.resolve()
              }).catch(function(e) {
                d.reject(e)
              })
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should be say it\s remembered it for you', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.text.indexOf(expectedFragment) > -1)
            done()
          })
        })

        const attachment1 = 'https://unsplash.it/200/300/?random'
        describe('...followed by the attachment "' + attachment1 + '"', function() {
          // const expectedFragment = "I've now remembered that for you!"

          before(function() {
            const d = Q.defer()
            sendChatbotAttachments(sender, attachment1, 'image')
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should bring back more quick reply options', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.quick_replies && resultList[resultList.length-1].messageData[0].data.message.quick_replies.length)
            done()
          })
          it('...which are not the default quick reply options')
        })

        const code5 = "CORRECTION_ADD_ATTACHMENT"
        describe('...followed by the quick reply "' + code5 + '"', function() {
          // const expectedFragment = "I've now remembered that for you!"

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code5)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should add an attachment to the memory', function(done) {
            assert(resultList[resultList.length-1].memories[0].attachments && resultList[resultList.length-1].memories[0].attachments.length)
            done()
          })
          it('should backup the attachment to Cloudinary')
        })

        const code1b = "USER_FEEDBACK_BOTTOM"
        const code6 = "CORRECTION_STORE_TO_QUERY"
        describe('...followed by the quick reply "' + code1b + '", then the quick reply "' + code6 + '"', function() {
          // const expectedFragment = "I've now remembered that for you!"

          before(function() {
            const d = Q.defer()
            setTimeout(function() {
              sendChatbotQuickReply(sender, code1b)
              .then(function(res) {
                resultList.push(res)
                sendChatbotQuickReply(sender, code6)
                .then(function(res1) {
                  resultList.push(res1)
                  d.resolve()
                }).catch(function(e) {
                  d.reject(e)
                })
              }).catch(function(e) {
                d.reject(e)
              })
            },5000)
            return d.promise
          });

          it('should delete the memory just stored'
            // , function(done) {
            //   checkMemoryExistence(resultList[resultList.length-1].memories[0].objectID)
            //   .then(function(result) {
            //     assert(!result)
            //     done()
            //   })
            // }
          )
          it('should be interpreted as a "query" or "Default Fallback Intent"', function(done) {
            assert(resultList[resultList.length-1].requestData.metadata.intentName == 'query' || resultList[resultList.length-1].requestData.metadata.intentName == 'Default Fallback Intent')
            done()
          })
        })

        const code7 = "CORRECTION_CAROUSEL"
        var specificMemory;
        describe('!...followed by the quick reply "' + code1 + '", then the quick reply "' + code7 + '"', function() {

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code1b)
            .then(function(res) {
              resultList.push(res)
              sendChatbotQuickReply(sender, code7)
              .then(function(res1) {
                resultList.push(res1)
                d.resolve()
              }).catch(function(e) {
                d.reject(e)
              })
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should show a carousel', function(done) {
            try {
              specificMemory = resultList[resultList.length-1].messageData[0].data.message.attachment.payload.elements[2].sentence
            } catch(e) {

            }
            assert(resultList[resultList.length-1].messageData[0].data.message && resultList[resultList.length-1].messageData[0].data.message.attachment && resultList[resultList.length-1].messageData[0].data.message.attachment.payload && resultList[resultList.length-1].messageData[0].data.message.attachment.payload.elements)
            done()
          })
        })

        const code8 = "REQUEST_SPECIFIC_MEMORY-data-2"
        describe('!...followed by a postback with payload "' + code8 + '"', function() {

          before(function() {
            const d = Q.defer()
            sendChatbotPostback(sender, code8)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should show the 3rd specific memory', function(done) {
            assert.equal(resultList[resultList.length-1].messageData[0].data.message && resultList[resultList.length-1].messageData[0].data.message.attachment && resultList[resultList.length-1].messageData[0].data.message.attachment.payload && resultList[resultList.length-1].messageData[0].data.message.attachment.payload.elements && resultList[resultList.length-1].messageData[0].data.message.attachment.payload.elements[0] && resultList[resultList.length-1].messageData[0].data.message.attachment.payload.elements[0].title, specificMemory)
            done()
          })
        })
      })


      describe('Send an attachment, hold it and then create the memory to add it to', function() {
        var resultList = []

        const attachment1 = 'https://unsplash.it/200/300/?random'
        describe('Send the attachment "' + attachment1 + '"', function() {

          before(function() {
            const d = Q.defer()
            sendChatbotAttachments(sender, attachment1, 'image')
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should bring back quick reply options', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.quick_replies && resultList[resultList.length-1].messageData[0].data.message.quick_replies.length)
            done()
          })
        })

        const code1 = "PREPARE_ATTACHMENT"
        describe('...followed by the quick reply "' + code1 + '"', function() {
          const expectedFragment = "Sure thing - type your message below and I'll attach it..."

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code1)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should be say type your message below', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.text.indexOf(expectedFragment) > -1)
            done()
          })
        })

        const message1 = "This is my favourite random photo of all time"
        describe('...followed by the message "' + message1 + '"', function() {
          const expectedFragment1 = "I've now remembered that for you!"
          const expectedFragment2 = "favourite random photo"

          before(function() {
            const d = Q.defer()
            sendChatbotRequest(sender, message1)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('memory should have the message included', function(done) {
            assert(resultList[resultList.length-1].memories[0].sentence.indexOf(expectedFragment2) > -1)
            done()
          })
          it('memory should have an attachment included', function(done) {
            assert(resultList[resultList.length-1].memories[0].attachments && resultList[resultList.length-1].memories[0].attachments.length)
            done()
          })
          it('message should be say it\s remembered it for you', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.text.indexOf(expectedFragment1) > -1)
            done()
          })
          it('message should have the message included', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.text.indexOf(expectedFragment2) > -1)
            done()
          })
          it('message should have an attachment included', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.attachment && resultList[resultList.length-1].messageData[0].data.message.attachment.payload)
            done()
          })
        })
      })

      describe('Send dateTime reminder without the dateTime details, then confirm dateTime and then reply with details', function() {
        var resultList = []

        const message1 = "Remind me to feed the cat"
        describe('Sending the message "' + message1 + '"', function() {
          const expectedIntent = "setTask.dateTime"

          before(function() {
            const d = Q.defer()
            sendChatbotRequest(sender, message1)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should be interpreted as a ' + expectedIntent, function(done) {
            assert.equal(resultList[resultList.length-1].requestData.metadata.intentName, expectedIntent)
            done()
          })
          it('should bring back quick reply options', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.quick_replies && resultList[resultList.length-1].messageData[0].data.message.quick_replies.length)
            done()
          })
          it('should bring back quick reply options that are different from the default ones')
        })

        const code1 = "CORRECTION_GET_DATETIME"
        describe('...followed by the quick reply "' + code1 + '"', function() {
          const expectedFragment = "Sure thing - when shall I remind you?"

          before(function() {
            const d = Q.defer()
            sendChatbotQuickReply(sender, code1)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should ask when to remind you', function(done) {
            assert(resultList[resultList.length-1].messageData[0].data.message.text.indexOf(expectedFragment) > -1)
            done()
          })
        })

        const message2 = "tomorrow at 5pm"
        describe('Sending the message "' + message2 + '"', function() {
          const expectedIntent = "provideDateTime"
          const expectedDateTimeNum = 1505664000000

          before(function() {
            const d = Q.defer()
            sendChatbotRequest(sender, message2)
            .then(function(res) {
              resultList.push(res)
              d.resolve()
            }).catch(function(e) {
              d.reject(e)
            })
            return d.promise
          });

          it('should be interpreted as a ' + expectedIntent
            , function(done) {
              assert.equal(resultList[resultList.length-1].requestData.metadata.intentName, expectedIntent)
              done()
            }
          )
          it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"'
            // , function(done) {
            //   logger.trace(results.body.memories[0])
            //   assert.equal(new Date(results.body.memories[0].triggerDateTime).getTime(), expectedDateTimeNum)
            //   done()
            // }
          )
        })
      })
    })
  });

  describe('Messenger', function() {
    describe('Say hello', function() {
      it('should return a greeting')
    })
    describe('Request a memory', function() {
      it('should return the memory')
    })
    describe('Request a long memory', function() {
      it('should return the memory in multiple parts')
    })
    describe('Request a memory with an attachment', function() {
      it('should return the memory plus attachment in multiple parts')
    })
    describe('Store a memory', function() {
      it('should store the memory')
      it('should return the memory')
    })
    describe('Store a long memory', function() {
      it('should store the memory')
      it('should return the memory in multiple parts')
    })
    describe('Store a memory with an attachment', function() {
      it('should store the memory plus attachment')
      it('should return the memory plus attachment in multiple parts')
    })
    describe('Set a dateTime reminder', function() {
      it('should store the memory')
      it('should set the reminder')
      it('should somehow ping the reminder back???')
    })
    describe('Set a URL-based reminder', function() {
      it('should store the memory')
    })
  })

  after(function() {
    describe('Clearup', function() {
      describe('Deleting all memories just created', function() {
        logger.trace(temporaryMemories)
        temporaryMemories.forEach(function(objectID, i) {
          if (objectID) {
            describe('Deleting memory #' + i, function() {
              const results = {};
              before(function(done) {
                sendApiDeleteRequest(sender, objectID, results, done)
              });

              it('should be successfully deleted', function(done) {
                logger.trace(results)
                assert(results)
                done()
              })
            })
          }
        })
      })
    })
  })
});
