var express = require('express');
var router = express.Router();
var gdriveImporter = require('../controller/gdriveImport');
var confluenceImporter = require('../controller/confluenceImport');

router.get('/update', function(req, res){
  gdriveImporter.updateSourceFiles();
  confluenceImporter.updateSourceFiles();
  res.redirect('/');
});

router.get('/add-gdrive', function(req, res){
  res.redirect(gdriveImporter.getCode());
});

router.get('/gdrive-token', function(req, res){
  gdriveImporter.exchangeToken(req.query.code);
  res.redirect('/');
})

router.get('/add-confluence', function(req, res){
  res.render('add-confluence.html', { title: 'Express' });
})

router.get('/save-confluence', function(req, res){
  console.log(req.query)
  confluenceImporter.saveConfluenceDetails(req.query);
  confluenceImporter.updateSourceFiles();
  res.redirect('/');
})

module.exports = router;
