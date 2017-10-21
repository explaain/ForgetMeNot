var notify = require('../controller/notifications.js').notify;
var express = require('express');
var request = require('request');
var router = express.Router();

// Dev route
router.post('/subscribe', (req,res) => {
  notify(req.body)
  .then((notification, pushRoutes) => {
    res.status(200)
  })
});

router.post('/send', (req,res) => {
  notify(req.body)
  .then((notification, pushRoutes) => {
    res.json({
      notification,
      pushRoutes
    })
  })
});

module.exports = router;
