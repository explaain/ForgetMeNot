// Algolia setup
const Q = require("q");
const AlgoliaSearch = require('algoliasearch');
const AlgoliaClient = AlgoliaSearch(properties.algolia_app_id, properties.algolia_api_key,{ protocol: 'https:' });
const AlgoliaIndex = AlgoliaClient.initIndex(process.env.ALGOLIA_INDEX);
const AlgoliaUsersIndex = AlgoliaClient.initIndex(properties.algolia_users_index);
const api = require('./api,js');

// Store notification routes for each user, on DB (e.g. Browser approved)
export registerNotificationSubscription(userID, notificationType, PushSubscription) {
	return new Promise(resolve, reject) {
		// Save this to user userID database object
		fetchUserDataFromDb(userID)
		.then(user => {
			user.pushSubscriptions = user.pushSubscriptions || [];

			user.pushSubscriptions.push({
				type: notificationType,
				subscription: PushSubscription,
				seen: false, // Can be greyed out?
				dismissed: false, // Can be hidden?
				date: Date.now()
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

export registerNotification(type, payload, callback) {
	return new Promise(resolve, reject) {
		constructNotification(type, payload)
		.then(sendNotification)
		resolve(callback);
	}
}

// Normally payload will look like {userID: 0, objectID: 1}
export constructNotification(type, payload) {
	return new Promise(resolve, reject) {
		let notification = {
			title,
			message,
			date: Date.now()
		}

		switch(type) {
			case 'CARD_UPDATED':
				const q = Q.defer()
				q.all([
					fetchUserDataFromDb(userID)
					getDbObject(AlgoliaIndex, payload.objectID)
				])
				.then(function(user, card) {
					notification.title = 'Card updated';
					notification.message = `${user.name} edited the card ${card.title}`;
					resolve(notification);
				}).catch(function(e) { logger.error(e); reject(e) })
				break;
		}
	})
}

export sendNotification(userID, notification, options) {
	return new Promise(resolve, reject) {
		let platformsArray = [];

		// Native notifications: https://github.com/mikaelbr/node-notifier
		// Browser notifications: https://www.npmjs.com/package/web-push
		// Apple Push Notifications? https://www.npmjs.com/package/apn
		// Apple, Windows, Google Cloud, Amazon Device https://www.npmjs.com/package/node-pushnotifications

		resolve(platformsArray)
	}
}

// Other notification actions? Native mac allows text response in-notification. notificationAction(notificationID, userID, actionType, payload)
export dissmissNotification(notificationID) {

}
