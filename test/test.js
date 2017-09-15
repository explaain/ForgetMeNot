const Q = require("q");
const assert = require('assert');

const api = require('../app/controller/api');
const chatbot = require('../app/controller/chatbot');
// var properties = require('../app/config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});


const temporaryMemories = []

const sendRequest = function(apiFunction, data, results, done) {
  const d = Q.defer()
  logger.log(results)
  apiFunction(data)
  .then(function(body) {
    results.body = body
    if (done) {
      done()
    }
    if (body.requestData.generalIntent == 'write' && body.requestData.intent != 'deleteMemory') {
      temporaryMemories.push(body.memories[0].objectID)
    }
    d.resolve()
  }).catch(function(e) {
    logger.error(e);
    if (done) done(e)
    d.reject()
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





describe('Bulk', function() {
  const sender = 1627888800569309;
  describe('API', function() {
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
      const message2 = "Remind me at 5pm to feed the cat"
      describe('Sending the message "' + message2 + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505491200000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message2, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
          logger.trace(results.body.memories[0])
          assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
          done()
        })
      })

      const message3 = "Remind me at 5pm tomorrow to feed the cat"
      describe('Sending the message "' + message3 + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505577600000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message3, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
          logger.trace(results.body.memories[0])
          assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
          done()
        })
      })

      const message4 = "Remind me tomorrow at 5pm to feed the cat"
      describe('Sending the message "' + message4 + '"', function() {
        const expectedIntent = "setTask.dateTime"
        const expectedDateTimeNum = 1505577600000

        const results = {};
        before(function(done) {
          sendApiRequest(sender, message4, results, done)
        });

        it('should be interpreted as a ' + expectedIntent, function(done) {
          assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
          done()
        })
        it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
          logger.trace(results.body.memories[0])
          assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
          done()
        })
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
    const shortMessage = "Test Message"
    describe('Sending the chatbot1 short message "' + shortMessage + '"', function() {
      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, shortMessage, results, done)
      })

      it('should return a message', function(done) {
        assert(results.body.messageData.message.text)
        done()
      })
      it('should bring back more quick reply options', function(done) {
        assert(results.body.messageData.message.quick_replies && results.body.messageData.message.quick_replies.length)
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
        assert(results.body.messageData.message.text.indexOf(expectedFragment) > -1)
        done()
      })
    })

    // describe('Date/Time-based Reminders', function() {
    //   const message2 = "Remind me at 5pm to feed the cat"
    //   describe('Sending the message "' + message2 + '"', function() {
    //     const expectedIntent = "setTask.dateTime"
    //     const expectedDateTimeNum = 1505448000000
    //
    //     const results = {};
    //     before(function(done) {
    //       sendChatbotRequest(sender, message2, results, done)
    //     });
    //
    //     it('should be interpreted as a ' + expectedIntent, function(done) {
    //       assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
    //       done()
    //     })
    //     it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
    //       logger.trace(results.body.memories[0])
    //       assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
    //       done()
    //     })
    //   })
    //
    //   const message3 = "Remind me at 5pm tomorrow to feed the cat"
    //   describe('Sending the message "' + message3 + '"', function() {
    //     const expectedIntent = "setTask.dateTime"
    //     const expectedDateTimeNum = 1505491200000
    //
    //     const results = {};
    //     before(function(done) {
    //       sendChatbotRequest(sender, message3, results, done)
    //     });
    //
    //     it('should be interpreted as a ' + expectedIntent, function(done) {
    //       assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
    //       done()
    //     })
    //     it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
    //       logger.trace(results.body.memories[0])
    //       assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
    //       done()
    //     })
    //   })
    //
    //   const message4 = "Remind me tomorrow at 5pm to feed the cat"
    //   describe('Sending the message "' + message4 + '"', function() {
    //     const expectedIntent = "setTask.dateTime"
    //     const expectedDateTimeNum = 1505491200000
    //
    //     const results = {};
    //     before(function(done) {
    //       sendChatbotRequest(sender, message4, results, done)
    //     });
    //
    //     it('should be interpreted as a ' + expectedIntent, function(done) {
    //       assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
    //       done()
    //     })
    //     it('should bring back a result with the "triggerDateTime" parameter "' + expectedDateTimeNum + '"', function(done) {
    //       logger.trace(results.body.memories[0])
    //       assert.equal(results.body.memories[0].triggerDateTime.getTime(), expectedDateTimeNum)
    //       done()
    //     })
    //   })
    // })
    //
    //
    //
    // describe('URL-based Reminders', function() {
    //   const message5 = "Remind me to buy cat food next time I'm on Tesco.com"
    //   describe('Sending the message "' + message5 + '"', function() {
    //     const expectedIntent = "setTask.URL"
    //     const expectedUrl = 'Tesco.com'
    //
    //     const results = {};
    //     before(function(done) {
    //       sendChatbotRequest(sender, message5, results, done)
    //     });
    //
    //     it('should be interpreted as a ' + expectedIntent, function(done) {
    //       assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
    //       done()
    //     })
    //     it('should bring back a result with the "triggerUrl" parameter "' + expectedUrl + '"', function(done) {
    //       assert.equal(results.body.memories[0].triggerUrl, expectedUrl)
    //       done()
    //     })
    //   })
    // })





    describe('Messages with Quick Replies', function() {
      const message1 = "What does my cat look like?"
      const code1 = "USER_FEEDBACK_MIDDLE"
      describe('Sending the message "' + message1 + '", followed by the quick reply "' + code1 + '"', function() {
        const expectedIntent = "setTask.URL"
        const expectedUrl = 'Tesco.com'

        const results = {};
        before(function(done) {
          sendChatbotRequest(sender, message1, results)
          .then(function() {
            sendChatbotQuickReply(sender, code1, results, done)
          })
        });

        it('should ask what it should have done', function(done) {
          assert.equal(results.body.messageData.message.text, 'Whoops - was there something you would have preferred me to do?')
          done()
        })
        it('should bring back more quick reply options', function(done) {
          assert(results.body.messageData.message.quick_replies && results.body.messageData.message.quick_replies.length)
          done()
        })
        // it('should bring back a result with the "triggerUrl" parameter "' + expectedUrl + '"', function(done) {
        //   assert.equal(results.body.memories[0].triggerUrl, expectedUrl)
        //   done()
        // })
      })
    })
  });

  after(function() {
    describe('Clearup', function() {
      describe('Deleting all memories just created', function() {
        logger.trace(temporaryMemories)
        temporaryMemories.forEach(function(objectID, i) {
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
        })
      })
    })
  })
});
