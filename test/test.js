const Q = require("q");
const assert = require('assert');

const api = require('../app/controller/api');
const chatbot = require('../app/controller/chatbot');
// var properties = require('../app/config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});


const temporaryMemories = []

const sendApiRequest = function(sender, message, results, done) {
  logger.log(results)
  const data = {
    sender: sender,
    text: message,
  }
  api.acceptRequest(data)
  .then(function(body) {
    results.body = body
    logger.log(results)
    done()
    if (body.requestData.intent == 'storeMemory' || body.requestData.intent == 'setTask.URL' || body.requestData.intent == 'setTask.dateTime') {
      temporaryMemories.push(body.memories[0].objectID)
    }
  }).catch(function(e) {
    logger.error(e);
    done(e)
  })
}


const sendApiDeleteRequest = function(sender, objectID, results, done) {
  api.deleteMemories(sender, objectID)
  .then(function(body) {
    results.body = body
    logger.log(results)
    done()
  }).catch(function(e) {
    logger.error(e);
    done(e)
  })
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
    const expectedReturn = "This is your cat ⬇️"
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

    after(function() {

    })
  });




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
    chatbot.handleMessage(data)
    .then(function(body) {
      results.body = body
      done()
      if (body.requestData.intent == 'storeMemory' || body.requestData.intent == 'setTask.URL' || body.requestData.intent == 'setTask.dateTime') {
        logger.trace(body.memories[0].objectID)
        temporaryMemories.push(body.memories[0].objectID)
      }
    }).catch(function(e) {
      logger.error(e);
      done(e)
    })
  }




  describe('Chatbot', function() {
    const shortMessage = "Test Message"
    describe('Sending the chatbot1 short message "' + shortMessage + '"', function() {
      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, shortMessage, results, done)
      })

      it('should be interpreted as a "query"', function(done) {
        assert(results.body.requestData.metadata.intentName == 'query' || results.body.requestData.metadata.intentName == 'Default Fallback Intent')
        done()
      })
      it('should bring back a result with a "sentence" parameter', function(done) {
        assert(results.body.memories[0].sentence)
        done()
      })
    })

    const message1 = "This is my cat"
    describe('Sending the message "' + message1 + '"', function() {
      const expectedIntent = "storeMemory"
      const expectedReturn = "This is your cat ⬇️"

      const results = {};
      before(function(done) {
        sendChatbotRequest(sender, message1, results, done)
      });

      it('should be interpreted as a ' + expectedIntent, function(done) {
        assert.equal(results.body.requestData.metadata.intentName, expectedIntent)
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
        const expectedDateTimeNum = 1505404800000

        const results = {};
        before(function(done) {
          sendChatbotRequest(sender, message2, results, done)
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
        const expectedDateTimeNum = 1505491200000

        const results = {};
        before(function(done) {
          sendChatbotRequest(sender, message3, results, done)
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
        const expectedDateTimeNum = 1505491200000

        const results = {};
        before(function(done) {
          sendChatbotRequest(sender, message4, results, done)
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
          sendChatbotRequest(sender, message5, results, done)
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
