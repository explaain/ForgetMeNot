var notify = require('../controller/notifications.js').notify;
var express = require('express');
var request = require('request');
var router = express.Router();

// Dev route
router.post('/subscribe', (req,res) => notify(req.body));
router.post('/send', (req,res) => notify(req.body));

module.exports = router;
