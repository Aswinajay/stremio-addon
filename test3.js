const { addonInterface } = require('./addon');
addonInterface.request('catalog', {type: 'movie', id: 'top'}).then(console.log).catch(console.error);
