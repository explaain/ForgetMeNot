var fs = require('fs');
var Confluence = require('../controller/confluenceApi');

updateSourceFiles = function() {

  fs.readFile('app/controller/confluenceToken.json', function(err, content) {
    if (err) {
      // This would be if unable to retrieve from firebase, n/a
      console.log('Error loading client secret file: ' + err);
      return;
    }
    var confluence = new Confluence(JSON.parse(content));
    confluence.getSiteContent("savvyfolder", function(err, data) {
      var files = data.results;
      if (files.length == 0) {
        console.log('No files found.');
      } else {
        console.log("Importing Confluence files ...")
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          // here would be a function like createAndUpdateCards(file);
          console.log('Imported file: ', file.title);
        }
      }
      console.log(files.length + ' Confluence files imported')
    });
  });
}

saveConfluenceDetails = function(details){
  fs.writeFile('app/controller/confluenceToken.json', JSON.stringify(details), function(err){
    if (err) {
      res.status(500).jsonp({ error: 'Failed to write file' });
    }
    console.log('Token stored to firebase: confluence');
  })
};

exports.updateSourceFiles = updateSourceFiles;
exports.saveConfluenceDetails = saveConfluenceDetails;
