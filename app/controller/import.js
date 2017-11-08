var google = require('googleapis');
var googleAuth = require('google-auth-library');
var fs = require('fs')
// needs firebase function like getCredentials();
var credentials = {
  client_id: '704974264220-r3j760e70qgsea3r143apoc4o6nt5ha2.apps.googleusercontent.com',
  project_id: 'savvy-96d8b',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://accounts.google.com/o/oauth2/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_secret: 'lGE5esfXpdB6y7KkVNUezfas',
  redirect_uris: ['http://localhost:3000/authorisations/token']
}
var clientSecret = credentials.client_secret;
var clientId = credentials.client_id;
var redirectUrl = credentials.redirect_uris[0];

function updateSourceFiles(token){

  // will need firebase function like getSavedToken(source), reading from json file temporarily
  fs.readFile('app/controller/driveToken.json', function processClientSecrets(err, content) {
    if (err) {
      // This would be if unable to retrieve from firebase, n/a
      console.log('Error loading client secret file: ' + err);
      return;
    }
    authorize(JSON.parse(content), importFiles);
  });

  function authorize(token, callback) {
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
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
        //needs some error trap here for failed access
        return;
      }
      var files = response.files;
      if (files.length == 0) {
        console.log('No files found.');
      } else {
        console.log("Importing files ...")
        for (var i = 0; i < files.length; i++) {
          var file = files[i];
          // here would be a function like createAndUpdateCards(file);
          console.log('Imported file: ', file.name);
        }
      }
      console.log('Files imported')
    });
  }
}

function getCode() {
  var auth = new googleAuth();
  var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
  var authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
    prompt: "consent"
  });
  console.log(authUrl)
  return authUrl;
}

function exchangeToken(code){

  getToken(code, updateSourceFiles);

  function getToken(code, callback){
    var auth = new googleAuth();
    var oauth2Client = new auth.OAuth2(clientId, clientSecret, redirectUrl);
    oauth2Client.getToken(code, function(err, token) {
      if (err) {
        console.log('Error while trying to retrieve access token', err);
        //needs some error trap here for failed access
        return;
      }
      oauth2Client.credentials = token;
      // needs firebase function like saveToken(source, token), saving to local json temporarily
      fs.writeFile('app/controller/driveToken.json', JSON.stringify(token), function(err){
        if (err) {
          res.status(500).jsonp({ error: 'Failed to write file' });
        }
      console.log('Token stored to firebase:' + token.token_type);
      callback(token);
    })
    });
  };
};

exports.updateSourceFiles = updateSourceFiles;
exports.getCode = getCode;
exports.exchangeToken = exchangeToken;
