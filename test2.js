const { addonInterface } = require('./addon');
addonInterface.catalog.request({type: 'movie', id: 'top'}).then(console.log).catch(console.error);
