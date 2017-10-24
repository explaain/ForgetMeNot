/*! js-cookie v2.1.4 | MIT */

!function(a){var b=!1;if("function"==typeof define&&define.amd&&(define(a),b=!0),"object"==typeof exports&&(module.exports=a(),b=!0),!b){var c=window.Cookies,d=window.Cookies=a();d.noConflict=function(){return window.Cookies=c,d}}}(function(){function a(){for(var a=0,b={};a<arguments.length;a++){var c=arguments[a];for(var d in c)b[d]=c[d]}return b}function b(c){function d(b,e,f){var g;if("undefined"!=typeof document){if(arguments.length>1){if(f=a({path:"/"},d.defaults,f),"number"==typeof f.expires){var h=new Date;h.setMilliseconds(h.getMilliseconds()+864e5*f.expires),f.expires=h}f.expires=f.expires?f.expires.toUTCString():"";try{g=JSON.stringify(e),/^[\{\[]/.test(g)&&(e=g)}catch(p){}e=c.write?c.write(e,b):encodeURIComponent(e+"").replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g,decodeURIComponent),b=encodeURIComponent(b+""),b=b.replace(/%(23|24|26|2B|5E|60|7C)/g,decodeURIComponent),b=b.replace(/[\(\)]/g,escape);var i="";for(var j in f)f[j]&&(i+="; "+j,!0!==f[j]&&(i+="="+f[j]));return document.cookie=b+"="+e+i}b||(g={});for(var k=document.cookie?document.cookie.split("; "):[],l=0;l<k.length;l++){var m=k[l].split("="),n=m.slice(1).join("=");'"'===n.charAt(0)&&(n=n.slice(1,-1));try{var o=m[0].replace(/(%[0-9A-Z]{2})+/g,decodeURIComponent);if(n=c.read?c.read(n,o):c(n,o)||n.replace(/(%[0-9A-Z]{2})+/g,decodeURIComponent),this.json)try{n=JSON.parse(n)}catch(p){}if(b===o){g=n;break}b||(g[o]=n)}catch(p){}}return g}}return d.set=d,d.get=function(a){return d.call(d,a)},d.getJSON=function(){return d.apply({json:!0},[].slice.call(arguments))},d.defaults={},d.remove=function(b,c){d(b,"",a(c,{expires:-1}))},d.withConverter=b,d}return b(function(){})});

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
  pushEnabled: Boolean(Cookies.get('forgetmenot-push-token')),
  pushToken: Cookies.get('forgetmenot-push-token')
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
      Cookies.set('forgetmenot-push-token', currentToken);
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

// Display notifications when the browser is active (user is clicked on)
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
