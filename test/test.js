const assert = require('assert');
const api = require('../app/controller/api');
const messageHandler = require('../app/controller/messageHandler');
// var properties = require('../app/config/properties.js');

const tracer = require('tracer')
const logger = tracer.colorConsole();
// tracer.setLevel('error');

const C = [];
C[1627888800569309] = {
  failing: false,
  consecutiveFails: 0
}

const sendRequest = function(sender, message, results, done) {
  const data = {
    sender: sender,
    text: message,
  }
  api.acceptRequest(data)
  .then(function(body) {
    results.body = body
    done()
  }).catch(function(e) {
    logger.error(e);
    done(e)
  })
}



const sender = 1627888800569309;
describe('API', function() {
  const shortMessage = "Test Message"
  describe('Sending the short message "' + shortMessage + '"', function() {
    const results = {};
    before(function(done) {
      sendRequest(sender, shortMessage, results, done)
    })

    it('should be interpreted as a "query"', function(done) {
      assert.equal(results.body.requestData.metadata.intentName, 'query')
      done()
    })
    it('should bring back a result with a "sentence" parameter', function(done) {
      assert(results.body.memory.sentence)
      done()
    })
  })

  const message = "This is my cat"
  const expectedReturn = "This is your cat ⬇️"
  describe('Sending the message "' + message + '"', function() {
    const results = {};
    before(function(done) {
      sendRequest(sender, message, results, done)
    });

    it('should be interpreted as a "storeMemory"', function(done) {
      assert.equal(results.body.requestData.metadata.intentName, 'storeMemory')
      done()
    })
    it('should bring back a result with the "sentence" parameter "' + expectedReturn + '"', function(done) {
      assert.equal(results.body.memory.sentence, expectedReturn)
      done()
    })
  })
});
