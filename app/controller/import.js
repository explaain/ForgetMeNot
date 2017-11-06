// const request = require('request');
// const Q = require("q");
// const path = require('path')
// const extract = require('pdf-text-extract')
//
// const properties = require('../config/properties.js');
//
// const tracer = require('tracer')
// const logger = tracer.colorConsole({level: 'info'});
// // tracer.setLevel('warn');
//
//
// exports.acceptRequest = function(requestData) {
//   logger.trace();
// 	const d = Q.defer()
//
//   const filePath = path.join(__dirname, 'test/data/multipage.pdf')
//
//   extract(filePath, { splitPages: false }, function (err, text) {
//     if (err) {
//       console.dir(err)
//       d.reject(err)
//       return
//     }
//     console.dir(text)
//     d.resolve(text)
//   })
// 	return d.promise
// }
function doImport(){

  var fs = require('fs');
  var readline = require('readline');
  var google = require('googleapis');
  var googleAuth = require('google-auth-library');

  var SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly'];
  var TOKEN_DIR = (process.env.HOME || process.env.HOMEPATH) + '/.credentials/';
  var TOKEN_PATH = TOKEN_DIR + 'drive-nodejs-quickstart.json';

  fs.readFile(__dirname + '/driveApiKey.json', function processClientSecrets(err, content) {
    if (err) {
      console.log('Error loading client secret file: ' + err);
      return;
    }
    console.log(TOKEN_DIR)
    authorize(JSON.parse(content), importFiles);
  });

  function authorize(credentials, callback) {
    var clientSecret = credentials.web.client_secret;
    var clientId = credentials.web.client_id;
    var redirectUrl = credentials.web.redirect_uris[0];
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, function(err, token) {
      if (err) {
        getNewToken(oauth2Client, callback);
      } else {
        oauth2Client.credentials = JSON.parse(token);
        callback(oauth2Client);
      }
    });
  }

  function getNewToken(oauth2Client, callback) {
    var authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES
    });
    console.log('Authorize this app by visiting this url: ', authUrl);
    var rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question('Enter the code from that page here: ', function(code) {
      rl.close();
      oauth2Client.getToken(code, function(err, token) {
        if (err) {
          console.log('Error while trying to retrieve access token', err);
          return;
        }
        oauth2Client.credentials = token;
        storeToken(token);
        callback(oauth2Client);
      });
    });
  }
  function storeToken(token) {
    try {
      fs.mkdirSync(TOKEN_DIR);
    } catch (err) {
      if (err.code != 'EEXIST') {
        throw err;
      }
    }
    fs.writeFile(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to ' + TOKEN_PATH);
  }

  function importFiles(auth) {
    var service = google.drive('v3');
    service.files.list({
      auth: auth,
      pageSize: 10,
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
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          console.log('Imported file: ', file.name);
        }
      }
    });
  }
  console.log('imported')
}

doImport();
