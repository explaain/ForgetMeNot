// refactored webhook code
var apiController = require('../controller/messageHandler');

var express = require('express');
var router = express.Router();

router.get('/', apiController.tokenVerification);
//router.post('/', apiController.createGetStarted); -- this method is no longer needed (i think)
router.post('/', apiController.handleMessage);

module.exports = router;
