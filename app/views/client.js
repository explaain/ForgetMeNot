// Initialize Firebase
var config = {
  apiKey: "AIzaSyCNBORD9FVS3JPtBmg6DEnUewb_3imJsbI",
  authDomain: "forgetmenot-55f96.firebaseapp.com",
  databaseURL: "https://forgetmenot-55f96.firebaseio.com",
  projectId: "forgetmenot-55f96",
  storageBucket: "forgetmenot-55f96.appspot.com",
  messagingSenderId: "877912675687"
};
firebase.initializeApp(config);

// Setup messaging
const messaging = firebase.messaging();
var appState = {
  userID: 1627888800569309, // Demo
  userManagerID: 1627888800569309, // Demo
  pushEnabled: false,
  pushToken: null
}

new Vue({
  el: '#vue-app',
  data: () => appState
})

function requestPermission() {
  messaging.requestPermission()
  .then(function() {
    console.log('Notification permission granted.');
    establishServerLink();
  })
  .catch(function(err) {
    console.log('Unable to get permission to notify.', err);
  });
}

function establishServerLink() {
  // Get Instance ID token. Initially this makes a network call, once retrieved
  // subsequent calls to getToken will return from cache.
  messaging.getToken()
  .then(function(currentToken) {
    if (currentToken) {
      sendTokenToServer(currentToken);
    } else {
      // Show permission request.
      console.log('No Instance ID token available. Request permission to generate one.');
      // Show permission UI.
      appState.pushToken = null;
    }
  })
  .catch(function(err) {
    console.log('An error occurred while retrieving token. ', err);
    appState.pushToken = null;
  });

  // Callback fired if Instance ID token is updated.
  messaging.onTokenRefresh(function() {
    messaging.getToken()
    .then(function(refreshedToken) {
      console.log('Token refreshed.');
      // Indicate that the new Instance ID token has not yet been sent to the app server.
      appState.pushToken = null;
      // Send Instance ID token to app server.
      sendTokenToServer(refreshedToken);
    })
    .catch(function(err) {
      console.log('Unable to retrieve refreshed token ', err);
    });
  });
}

function sendTokenToServer(currentToken) {
  fetch('/notify/subscribe', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      userID: appState.userID, // Hardcoded
      notificationType: 'browser',
      PushSubscription: currentToken
    }),
  })
  .then(x => x.json())
  .then(x => {
    console.log(JSON.stringify(x))
    if(!x.error) {
      console.log("Server response!");
      appState.pushToken = currentToken;
      appState.pushEnabled = true;
    }
  })
}

//# Just for demo #//
// More likely, you will just call
//    notifications.notify({recipientID, type, payload})
// from the server
function notify() {
  fetch('/notify/send', {
    method: 'POST',
    headers: {
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
    	"recipientID": appState.userManagerID,
    	"type": "CARD_UPDATED",
    	"payload": {
    		"objectID": 619948630,
    		"userID": appState.userID
    	}
    })
  })
  .then(x => x.json())
  .then(x => console.log(JSON.stringify(x)))
}

messaging.onMessage(function(notification) {
  console.log('[firebase-messaging-sw.js] Received background message ', notification);
  // Customize notification here
  const notificationTitle = notification.data.title;
  const notificationOptions = {
    body: notification.data.message,
    icon: 'logo.png'
  };

  new Notification(notificationTitle,notificationOptions);
});
