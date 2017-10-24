var notifications = require('../controller/notifications.js');
var express = require('express');
var request = require('request');
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var router = express.Router();

router.post('/subscribe', jsonParser, (req,res) => {
  if(!req.body || !req.body.userID || !req.body.notificationType || !req.body.PushSubscription) {
    return res.status(400).json({error:
      { id: 'bad-subscribe-data', message: 'Required subscription info missing'}
    })
  } else { console.log("Good data") }
  notifications.subscribe(req.body)
  .catch((e)=> res.status(500).json({error:{ id: 'bad-subscribe-response', message: e.message}}))
  .then((user) => {
    res.status(200).json(user).send();
  })
});

router.delete('/unsubscribe/:userID/:routeID', jsonParser, (req,res) => {
  notifications.unsubscribe(req.params.userID, req.params.routeID)
  .catch((e)=> res.status(500).json({error:{ id: 'bad-subscribe-response', message: e.message}}))
  .then((routes) => {
    res.status(200).json(routes).send();
  })
});

router.post('/send', jsonParser, (req,res) => {
  if(!req.body || !req.body.recipientID || !req.body.type || !req.body.payload) {
    return res.status(400).json({error:
      { id: 'bad-notify-data', message: 'Required subscription info missing'}
    })
  } else { console.log("Good data") }
  notifications.notify(req.body)
  .catch((e)=> res.status(500).json({error:{ id: 'bad-notify-response', message: e.message}}))
  .then(notificationReport => {
    res.status(200).json(notificationReport).send();
  })
});

module.exports = router;
