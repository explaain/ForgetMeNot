function updateSourceFiles(){

  var google = require('googleapis');
  var googleAuth = require('google-auth-library');

  authorize(importFiles);

  function authorize(callback) {
    // real credentials to be extracted from firebase
    var credentials = {
      client_id: '704974264220-r3j760e70qgsea3r143apoc4o6nt5ha2.apps.googleusercontent.com',
      project_id: 'savvy-96d8b',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://accounts.google.com/o/oauth2/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_secret: 'lGE5esfXpdB6y7KkVNUezfas',
      redirect_uris: [ 'http://localhost:3000', 'https://savvy.eu.ngrok.io' ]
    }
    var clientSecret = credentials.client_secret;
    var clientId = credentials.client_id;
    var redirectUrl = credentials.redirect_uris[0];
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

updateSourceFiles();
