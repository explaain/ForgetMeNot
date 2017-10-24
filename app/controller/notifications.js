require('dotenv').config();
// Misc
const tracer = require('tracer')
const logger = tracer.colorConsole({level: 'info'});
// DB
const properties = require('../config/properties.js');
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(process.env.ALGOLIA_INDEX);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);
// Algolia setup
const uuidv4 = require('uuid/v4');
const ForgetMeNotAPI = require('./api');

// Notifications config
// firebase-adminsdk-q1d7p@forgetmenot-55f96.iam.gserviceaccount.com
var FirebaseAdmin = require("firebase-admin");
var serviceAccount = require("./firebaseKey.json"); // Secret file
FirebaseAdmin.initializeApp({
  credential: FirebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://forgetmenot-55f96.firebaseio.com"
});

// Email config
// const functions = require('firebase-functions');
const nodemailer = require('nodemailer');
// READ CONFIGURATION: https://github.com/firebase/functions-samples/tree/master/quickstarts/email-users#setting-up-the-sample
// Configure the email transport using the default SMTP transport and a GMail account.
// For Gmail, enable these:
// 1. https://www.google.com/settings/security/lesssecureapps
// 2. https://accounts.google.com/DisplayUnlockCaptcha
// For other types of transports such as Sendgrid see https://nodemailer.com/transports/
// TODO: Configure the `gmail.email` and `gmail.password` Google Cloud environment variables.
const gmailEmail = encodeURIComponent(process.env.gmailAddress);
const gmailPassword = encodeURIComponent(process.env.gmailPassword);
const mailTransport = nodemailer.createTransport(`smtps://${gmailEmail}:${gmailPassword}@smtp.gmail.com`);


// Store notification routes for each user, on DB (e.g. Browser approved)
exports.subscribe = ({userID, notificationType, PushSubscription}) => {
  return new Promise((resolve, reject) => {
    // Save this to user userID database object

    ForgetMeNotAPI.getDbObject(AlgoliaUsersIndex, userID)
    .then(user => {
      user.notify = user.notify || { options: {}, routes: []};

      var existingSubscription = user.notify.routes.find(r => r.type === notificationType);

      if(!existingSubscription) {
        user.notify.routes.push({
          type: notificationType,
          subscription: PushSubscription,
          enabled: true
        });
      } else {
        // Updated token or whatever
        existingSubscription.subscription = PushSubscription;
      }

      AlgoliaUsersIndex.saveObject(user, (err, content) => {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          logger.trace('✅ User push notify settings saved!');
          resolve(user);
        }
      });
    });
  });
}

/**
 * @param {Object} notification { recipientID, type, payload }
 * @param {Number} notification.recipientID
 * @param {String} notification.type
 * @param {Object} notification.payload

  {
  	"recipientID": 1,
  	"type": "CARD_UPDATED",
  	"payload": {
  		"objectID": 1,
  		"userID": 2
  	}
  }
*/
exports.notify = ({recipientID, type, payload}) => {
  return new Promise((resolve, reject) => {
    constructNotification(type, payload)
    .catch(reject)
    .then((notification) => notifyUser(recipientID, notification))
    .catch(reject)
    .then(resolve) // Pass args from sendNotification to callback
  })
}

// Normally payload will look like {userID: 0, objectID: 1}
function constructNotification(type, payload) {
  return new Promise((resolve, reject) => {
    // Basic identification
    let notification = {
      id: uuidv4(),
      date: Date.now().toString()
    }

    // Acquire data to flesh out the notification message
    Promise.all([
      ForgetMeNotAPI.getDbObject(AlgoliaUsersIndex, Number(payload.userID)),
      ForgetMeNotAPI.getDbObject(AlgoliaIndex, Number(payload.objectID))
    ])
    .catch((err) => { logger.error(err); reject(err) })
    .then(([user, card]) => {
      console.log("✅ Pulled USER DATA:", user.objectID);
      console.log("✅ Pulled CARD DATA:", card.objectID);
      console.log(type);

      switch(type) {

        case 'CARD_UPDATED':
          notification.type = type; // For notification icons etc.
          notification.title = 'Card update request';
          notification.message = `${user.first_name} wants to update a card: ${card.sentence}`;
          resolve(notification);
          break;

        // ...

      }
    })
  })
}

/**
 * @returns {Promise}
 * @return {1:Object} notification
 * @return {2:Array} [notifyRoutes]
*/
function notifyUser(recipientID, notification) {
  console.log("✅ \n\nThe notification", notification,"\n\n\n");

  return new Promise((resolve, reject) => {
    ForgetMeNotAPI.getDbObject(AlgoliaUsersIndex, recipientID)
    .then(user => {
      if(!user.notify || !user.notify.routes || user.notify.routes.length === 0) {
        logger.erro("No available notify routes for recipient", user.first_name, recipientID);
        return reject("No available routes");
      }

      let notificationQuests = [];

      user.notify.routes.filter(r => r.enabled).forEach(route => {
        console.log("➡️ Attempting notification via: ",route)
        notificationQuests.push(pushNotification(user, route, notification));
      });

      Promise.all(notificationQuests)
      .then((routes) => resolve(notification, routes))
      .catch(reject);

    });
  });
}

function pushNotification(user, route, notification) {
  return new Promise((resolve, reject) => {
    switch(route.type) {

      // READ: Firebase handling for multiple devices: https://firebase.google.com/docs/cloud-messaging/admin/send-messages

      case 'browser':
        FirebaseAdmin.messaging().sendToDevice(route.subscription, { data: notification })
          .then(function(response) {
            resolve('browser');
          })
          .catch(function(error) {
            console.log("Error sending notification via Firebase", error);
            reject(error);
          });
        break;

      case 'email':
        mailTransport.sendMail({
          from: `ForgetMeNot <noreply@forgetmenot.io>`,
          to: route.subscription,
          subject: `ForgetMeNot notification: ${notification.title}`,
          text: `
            Hey ${user.first_name || ''}!

            ${notification.message}.

            Cheers,
            Team ForgetMeNot

            (This was an automated email.)
          `
        }).then(() => {
          console.log('Email notification sent to', route.subscription);
        });
        break;

      // case 'native': // Native notifications: https://github.com/mikaelbr/node-notifier
      //   resolve('native');
      //   break;
      // Apple Push Notifications? https://www.npmjs.com/package/apn
      // Apple, Windows, Google Cloud, Amazon Device https://www.npmjs.com/package/node-pushnotifications
    }
  })
}

// Hand off to whoever.
function notificationAction(userID, notificationID, actionType) {
  return new Promise((resolve, reject) => {
    switch(actionType) {
      case 'DISMISS_NOTIFICATION': resolve(); break;
      case 'APPROVE_CARD_CREATION': resolve(); break;
      case 'APPROVE_CARD_UPDATE': resolve(); break;
      case 'APPROVE_CARD_DELETION': resolve(); break;
      // ...
    }
  })
}
