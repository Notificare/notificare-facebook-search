// # Example servicecentral worker
var ServiceCentral = require('servicecentral'),
	status = true;

// Start a new service for our namespace
var service = new ServiceCentral.Service('facebook-search');

// ## Event handler for work to do
// This will receive:
//
// - The name of the application, can be used in notifications
// - The application object this work is for
// - The token to use for accessing API methods
// - The work itself
// - A callback(err, result) to call when done
service.on('work', function(name, config, delegate, done) {
	console.log('Doing work for %s', name);
	// Do some work, call done(err, result) when done
	if (config && config.search) {
		var url = "https://graph.facebook.com/search?q=" + encodeURIComponent(config.search);
		// Check if we have a previous run
		delegate.retrieveState(function(err, result) {
			if (err) {
				done(err);
			} else {
				// If so, only retrieve new entries
				if (result) {
					url += "&since=" + Math.floor(result.time.getTime()/1000);
				}
				if (config.limit) {
					url += "&limit=" + encodeURIComponent(config.limit);
				} else {
					url += "&limit=25";
				}
				// Fetch entries that match the search
				console.log('Fetching %s', url);
				service.fetch({url: url, json: true, headers: {'accept-language':config.language || 'en_US'}}, function(err, res, body) {
					if (err) {
						done(err);
					} else {
						// If there's data
						if (body.data) {
							console.log('Got %s new status updates', body.data.length);
							var length = 0,
								successFul = 0;
							// Wait for all entries to be stored and notified
							function ready(success) {
								length++;
								successFul++;
								if (length == body.data.length) {
									// if this was the last entry
									if (successFul == length) {
										delegate.storeState({}, function(err, result) {
											if (err) {
												done(err);
											} else {
												done(null, {result: 'run completed'});
											}
										});
									} else {
										done('run did not complete successfully');
									}
								}
							}
							body.data.forEach(function(entry) {
								var time = new Date(entry.created_time);
								if (time.valueOf() === NaN) {
									time = Date.now();
								}
								delegate.storeData(time, entry, false, function(err, result) {
									if (err) {
										done(err);
									} else {
										var notification = {
											type: 'action',
											message: name + ' Status Update',
											userInfo: {
												fullMessage: entry.message || entry.description,
												targets: delegate.callbackTargetsGenerator({
													id: result._id
												}, [{
													id: 'show',
													action: 'Show in feed',
													message: false
												}, {
													id: 'hide',
													action: 'Hide from feed',
													message: false
												}])
											}
										};
										delegate.sendNotification(notification, function(err, result) {
											if (err) {
												ready(false);
											} else {
												ready(true);
											}
										});
									}
								});
							});
						}
					}
				});
			}
		});
	}
});

//## Event handler for status requests
// If we are launched with status=0, return an error, otherwise ok
service.on('status', function(done) {
	if (status) {
		done(null, {status: 'ok'});
	} else {
		done(null, {status: 'error'});		
	}
});

//## Event handler for callback POSTs.
// Update a data entry to be in- or excluded from the feed 
service.on('callback', function(action, userInfo, payload, delegate, done) {
	console.log('Handling callback action %s', action);
	// Handle callback from App / Dashboard, call done(err, result) when done
	if (userInfo && userInfo.id && action) {
		delegate.updateData(userInfo.id, (action == 'show'), function(err, result) {
			if (err) {
				done(err);
			} else {
				if (action == 'show') {
					done(null, {message:"Added to feed"});
				} else {
					done(null, {message:"Removed from feed"});
				}
			}
		});
	} else {
		done('missing info');
	}
});

//## Event handler for feed requests
// Respond with the stored data
service.on('feed', function(query, delegate, done) {
	delegate.retrieveData(function(err, data) {
		if (err) {
			done(err);
		} else {
			done(null, {data: data});
		}
	});
});

//## Event handler for webhook requests
// Respond by sending a notification with the message in the payload
service.on('webhook', function(query, body, delegate, done) {
	var notification = {
		type: 'alert',
		message: 'Facebook Search hook called',
		userInfo: {
			fullMessage: 'Facebook Search hook called: ' + body.message
		}
	};
	delegate.sendNotification(notification, function(err, result) {
		if (err) {
			done(err);
		} else {
			done(null, {result: 'sent'});
		}
	});
});

service.listen();
