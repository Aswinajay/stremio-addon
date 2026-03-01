# 🎬 Render Torrent Stream (Nitro) — v3.0.0

Stream movies & TV series from **30+ massive torrent sources** with **Nitro Speed Boost**. This addon provides the fastest possible streaming by spoofing high-end torrent clients and optimizing peer discovery.

## 🚀 Nitro Speed Boost (v3.0.0)
- 🕵️ **Client Spoofing**: Identifies as **qBittorrent 4.4.2** to get prioritized by high-speed seeders and seedboxes.
- ⚡ **Ultra-Connectivity**: Increased to **50 concurrent connections** for lightning-fast swarm entry.
- 📡 **High-Performance Trackers**: Injected a massive curated list of "Nitro" trackers for < 3s metadata discovery.
- 🥇 **4K/1080p Priority**: Resolution-leading labels strictly pinned to the top.

## ## How It Works

```
Stremio Player  ←──  HTTP Stream  ←──  Render.com Server  ←──  30+ Torrent Trackers
```

## 🚀 Powerful Features

- 🎬 **Aggregated Power**: Combination of Official Torrentio mirrors, YTS, Bitsearch, TPB, SolidTorrents, and MediaFusion (Indian content).
- � **Anime Support**: Direct Nyaa.si RSS scraping for the highest quality anime releases.
- ⚡ **Buffer-Free Engine**: Optimized with the `torrent-stream` engine, tuned for Render's 512MB RAM limits.
- 🔄 **Mirror Rotation**: Automated fallback for blocked tracker APIs (TPB, SolidTorrents).
- 📱 **Universal Seeking**: Full HTTP Range support for instant scrubbing on Android, iOS, and Desktop.

## ## Deploy to Render.com

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "feat: v2.9.1 - Quality Priority & Live Monitor"
git remote add origin https://github.com/YOUR_USERNAME/stremio-addon.git
git push -u origin main
```

### 2. Deploy on Render

1. Go to [render.com](https://render.com/) and sign up (free)
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Use the following settings (auto-detected):
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. Wait for the build to complete. Your URL will look like: `https://stremio-addon-xxxx.onrender.com`

### 3. Install in Stremio

1. Open **Stremio**
2. Go to **Addons** → **Paste your URL** (must end in `/manifest.json`)
3. Click **Install**
4. Look for the resolution-leading streams (e.g., `🖥️ 4K | WEB-DL`) in your list.

## 📊 Monitoring & Status

Visit your addon's URL with `/dashboard` appended (e.g., `https://my-addon.onrender.com/dashboard`) to see:
- Real-time download speeds.
- Number of active peers.
- Number of people currently "riding" (streaming) from your server.

## ⚠️ Free Plan Limits & Tuning

| Tuning | Value |
|----------|-------|
| MAX_ENGINES | 3 (Concurrent Movies) |
| IDLE_TIMEOUT | 10 Minutes (Resets on play) |
| CONNS_LIMIT | 30 (Optimized for Render CPU) |
| RAM_LIMIT | 512 MB (Stays well under) |

## License
MIT
