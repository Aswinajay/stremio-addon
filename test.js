const { addonInterface } = require('./addon');
addonInterface.streams.request({type: 'movie', id: 'tt0111161'}).then(console.log).catch(console.error);
