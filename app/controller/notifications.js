// Algolia setup
const Q = require("q");
const uuidv4 = require('uuid/v4');
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(process.env.ALGOLIA_INDEX);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);
const api = require('./api,js');

// Store notification routes for each user, on DB (e.g. Browser approved)
export registerNotificationSubscription(userID, notificationType, PushSubscription) {
	return new Promise(((resolve, reject) {
		// Save this to user userID database object
		fetchUserDataFromDb(userID)
		.then(user => {
			user.notify = user.notify || {};
			user.notify.options = user.notify.options || {}
			user.notify.routes.push({
				type: notificationType,
				subscription: PushSubscription,
				enabled: true
			})

			AlgoliaIndex.saveObject(user, function(err, content) {
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
export registerNotification(notification) {
	return new Promise((resolve, reject) {
		constructNotification(notification)
		.then(sendNotification)
		.then(resolve) // Pass args from sendNotification to callback
	})
}

// Normally payload will look like {userID: 0, objectID: 1}
export constructNotification(notification) {
	return new Promise((resolve, reject) {
		// Basic identification
		notification.id = uuidv4();
		notification.date = Date.now();

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
 * @returns {Object} notification, [notifyRoutes]
*/
export sendNotification(notification) {
	return new Promise((resolve, reject) {
		let notifyRoutes = [];

		fetchUserDataFromDb(notification.recipientID)
		.then(user => {
			// Native notifications: https://github.com/mikaelbr/node-notifier
			// Browser notifications: https://www.npmjs.com/package/web-push
			// Apple Push Notifications? https://www.npmjs.com/package/apn
			// Apple, Windows, Google Cloud, Amazon Device https://www.npmjs.com/package/node-pushnotifications

			resolve(notification, notifyRoutes);
		});
	});
}

// Hand off to whoever.
export notificationAction(userID, notificationID, actionType) {
	return new Promise(((resolve, reject) {
		switch(actionType) {
			case 'DISMISS_NOTIFICATION': resolve(); break;
			case 'APPROVE_CARD_CREATION': resolve(); break;
			case 'APPROVE_CARD_UPDATE': resolve(); break;
			case 'APPROVE_CARD_DELETION': resolve(); break;
			// ...
		}
	})
}
