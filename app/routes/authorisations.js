var express = require('express');
var router = express.Router();
var importer = require('../controller/import');

router.get('/update', function(req, res){
  importer.updateSourceFiles();
  res.redirect('/');
});

router.get('/add', function(req, res){
  res.redirect(importer.getCode());
});

router.get('/token', function(req, res){
  importer.exchangeToken(req.query.code);
  res.redirect('/');
})
module.exports = router;
