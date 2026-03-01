const axios = require('axios');
axios.get('https://torrentio.strem.fun/stream/movie/tt1375666.json', { timeout: 10000 })
    .then(r => console.log(r.data.streams.length))
    .catch(e => console.error(e.message));
