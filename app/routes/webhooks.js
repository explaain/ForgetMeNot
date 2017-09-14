// refactored webhook code
var messengerController = require('../platforms/messenger');

var express = require('express');
var router = express.Router();

router.get('/', messengerController.tokenVerification);
//router.post('/', apiController.createGetStarted); -- this method is no longer needed (i think)
router.post('/', messengerController.handleMessage);

module.exports = router;
