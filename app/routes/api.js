// refactored webhook code
const apiController = require('../controller/api');

var express = require('express');
var router = express.Router();

// router.get('/', apiController.tokenVerification);
router.post('/memories', function(req, res) {
  const data = res.body;
  data.statedData = {
    allInOne: true,
    intent: 'storeMemory',
  }
  if (req.body.objectID) data.statedData.objectID = req.body.objectID;
  apiController.acceptRequest(data)
  .then(function(results) {
		res.status(200).send(result);
	}).catch(function(e) {
		res.status(e.code).send(data)
	});
});
router.delete('/memories', function(req, res) {
	const sender = req.query.sender;
	const objectID = req.query.objectID;
	apiController.deleteMemories(sender, objectID)
	.then(function(result) {
		res.status(200).send(result);
	}).catch(function(e) {
		res.sendStatus(400);
	})
});
router.get('/memories', function(req, res) {
  res.status(200).send('Hi there')
});

module.exports = router;
