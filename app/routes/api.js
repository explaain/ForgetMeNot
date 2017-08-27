// refactored webhook code
var apiController = require('../controller/api');

var express = require('express');
var router = express.Router();

// router.get('/', apiController.tokenVerification);
router.post('/memories', apiController.storeMemories);
router.delete('/memories', apiController.deleteMemories);
router.get('/memories', function(req, res) {
  res.status(200).send('Hi there')
});

module.exports = router;
