# 🎬 Render Torrent Stream — Stremio Addon

Stream movies & TV series from torrents **without buffering** using Render.com's free plan as a proxy server.

## How It Works

```
Stremio Player  ←──  HTTP Stream  ←──  Render.com Server  ←──  BitTorrent Swarm
```

Instead of Stremio downloading torrents directly (which causes buffering on slow connections), this addon routes the torrent traffic through Render.com's high-speed servers and delivers a smooth HTTP video stream to your player.

## Features

- 🎥 **Movies & TV Series** — Full support for both types via IMDB IDs
- ⚡ **Buffer-free streaming** — Render downloads the torrent, you get a direct HTTP stream
- 🔍 **Massive torrent coverage** — Powered by Torrentio (aggregates YTS, 1337x, RARBG, and more)
- 📱 **Seeking support** — Full HTTP Range request support for scrubbing through videos
- 🧠 **Memory-safe** — Max 3 concurrent torrents with LRU eviction, stays under 512MB RAM
- 🆓 **100% free** — Runs on Render.com's free tier

## Deploy to Render.com

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/stremio-addon.git
git push -u origin main
```

### 2. Deploy on Render

1. Go to [render.com](https://render.com/) and sign up (free)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Render will auto-detect the `render.yaml` config:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. Click **Create Web Service**
6. Wait for the build to complete (~2 minutes)
7. Your addon URL will be: `https://your-service-name.onrender.com`

### 3. Install in Stremio

1. Open **Stremio** app (desktop or mobile)
2. Go to **⚙️ Settings** → **Addons**
3. In the search/URL bar, paste:
   ```
   https://your-service-name.onrender.com/manifest.json
   ```
4. Click **Install**
5. Done! Search for any movie or series and look for "🖥️ Render Proxy" streams

## Local Development

```bash
# Install dependencies
npm install

# Start the server
npm start

# Test the manifest
curl http://localhost:3000/manifest.json

# Test movie streams (Inception)
curl http://localhost:3000/stream/movie/tt1375666.json

# Test series streams (Game of Thrones S01E01)
curl http://localhost:3000/stream/series/tt0944947:1:1.json

# Health check
curl http://localhost:3000/health
```

## ⚠️ Render Free Plan Limits

| Resource | Limit |
|----------|-------|
| RAM | 512 MB |
| CPU | 0.1 vCPU |
| Bandwidth | 100 GB/month |
| Instance Hours | 750 hrs/month |
| Idle Timeout | 15 min (spins down) |
| Cold Start | ~50 seconds |

> **Tip**: The server spins down after 15 minutes of no requests. The first request after idle will take ~50 seconds. After that, it's fast.

## License

MIT
