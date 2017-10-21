// DB
const properties = require('../config/properties.js');
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(process.env.ALGOLIA_INDEX);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);
// Algolia setup
const Q = require("q");
const uuidv4 = require('uuid/v4');
const api = require('./api');

// Store notification routes for each user, on DB (e.g. Browser approved)
exports.registerNotificationSubscription = (userID, notificationType, PushSubscription) => {
  return new Promise((resolve, reject) => {
    // Save this to user userID database object
    fetchUserDataFromDb(userID)
    .then(user => {
      user.notify = user.notify || {};
      user.notify.options = user.notify.options || {};
      user.notify.routes.push({
        type: notificationType,
        subscription: PushSubscription,
        enabled: true
      });

      AlgoliaIndex.saveObject(user, (err, content) => {
        if (err) {
          logger.error(err);
          reject(err);
        } else {
          logger.trace('User push notify settings saved!');
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
*/
exports.notify = (recipientID, type, payload) => {
  return new Promise((resolve, reject) => {
    constructNotification(type, payload)
    .then((notification) => notifyUser(recipientID, notification))
    .then(resolve) // Pass args from sendNotification to callback
  })
}

// Normally payload will look like {userID: 0, objectID: 1}
function constructNotification(type, payload) {
  return new Promise((resolve, reject) => {
    // Basic identification
    let notification = {
      id: uuidv4(),
      date: Date.now()
    }

    // Acquire data to flesh out the notification message
    const q = Q.defer();
    q.all([
      fetchUserDataFromDb(userID),
      getDbObject(AlgoliaIndex, payload.objectID)
    ])
    .catch((e) => { logger.error(e); reject(e) })
    .then((user, card) => {
      switch(type) {

        case 'CARD_UPDATED':
          notification.title = 'Card update request';
          notification.message = `${user.name} wants to edit the card ${card.title}`;
          resolve(notification);
          break;

        case 'CARD_DELETED':
          notification.title = 'Card deletion request';
          notification.message = `${user.name} wants to bin the card ${card.title}`;
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
  return new Promise((resolve, reject) => {
    fetchUserDataFromDb(recipientID)
    .then(user => {

      let notificationQuests = [];

      user.notify.routes.filter(r => r.enabled).forEach(route => {
        notificationQuests.push(pushNotification(route, notification));
      });

      Q.all(notificationQuests)
      .then((...routes) => resolve(notification, [...routes]))
      .catch(reject);

    });
  });
}

function pushNotification(route, notification) {
  return new Promise((resolve, reject) => {
    switch(route.type) {
      case 'browser': // Browser notifications: https://www.npmjs.com/package/web-push
        resolve('browser');
        break;
      case 'native': // Native notifications: https://github.com/mikaelbr/node-notifier
        resolve('native');
        break;
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
