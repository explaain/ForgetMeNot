function doImport(){

  var fs = require('fs');
  var readline = require('readline');
  var google = require('googleapis');
  var googleAuth = require('google-auth-library');

  var SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
  var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + '/.credentials/';
  var TOKEN_PATH = TOKEN_DIR + 'drive-nodejs-quickstart.json';

  fs.readFile(__dirname + '/driveApiKey.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    authorize(JSON.parse(content), importFiles);
  });

  function authorize(credentials, callback) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    // real token to be extracted from firebase
    var token = {
      access_token: 'ya29.Glv8BHDz3qdkIRc2wp9ymzMF6jKsZbkpXj9o3RYCQUhIkeWpxLiozd259ndJ1fYxs3htWLdMqpOkmBHfYyFV-4UaejxQ5b5_GTbHcw2TAtbn7GXJMwfjj09Q03Ew',
      refresh_token: '1/FMh-eGsrnO4S5vgsZ3ayxq9S3AhHBJcIXe7lchx0rbY',
      token_type: 'Bearer',
      expiry_date: 1509985260609
    }
    oauth2Client.credentials = token;
    callback(oauth2Client);
  }

  function importFiles(auth) {
    var service = google.drive('v3');
    service.files.list({
      auth: auth,
      fields: "nextPageToken, files(id, name)"
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        return;
      }
      var files = response.files;
      if (files.length == 0) {
        console.log('No files found.');
      } else {
        console.log("Importing files ...")
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          // here would be a function like createCards(file);
          console.log('Imported file: ', file.name);
        }
      }
        console.log('Files imported')
    });
  }

}

doImport();
