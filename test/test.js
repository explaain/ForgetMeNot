const assert = require('assert');
const api = require('../app/controller/api');
// var properties = require('../app/config/properties.js');

const C = [];
C[1627888800569309] = {
  failing: false,
  consecutiveFails: 0
}

describe('Sending', function() {
  describe('User sends memory', function() {
    it('should return...', function(done) {
      const messageData = {
        recipient: {
          id: 1627888800569309
        },
        message: {
          text: "Test Message"
        }
      };
      api.callSendAPI(messageData)
      .then(function(body) {
        assert.equal(body.recipientId, messageData.recipient.id)
        done()
      })
    });
  });
  // describe('callSendAPI()', function() {
  //   it('should return...', function(done) {
  //     const messageData = {
  //       recipient: {
  //         id: 1627888800569309
  //       },
  //       message: {
  //         text: "Test Message"
  //       }
  //     };
  //     api.callSendAPI(messageData)
  //     .then(function(body) {
  //       assert.equal(body.recipientId, messageData.recipient.id)
  //       done()
  //     })
  //   });
  // });
});
