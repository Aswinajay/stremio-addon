# 🎬 Torrent to weblink — The Ultimate Stremio Addon

[![Status](https://img.shields.io/badge/Status-Healthy-brightgreen?style=for-the-badge)](https://stremio.eletroclay.com/health)
[![Version](https://img.shields.io/badge/Version-3.5.31-blue?style=for-the-badge)](https://github.com/Aswinajay/stremio-addon)
[![Platform](https://img.shields.io/badge/Host-Render.com-black?style=for-the-badge)](https://render.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.style=for-the-badge)](https://opensource.org/licenses/MIT)

**Torrent to weblink** is a high-performance, self-hosted **Stremio addon** specifically engineered for flawless streaming on free-tier cloud platforms like **Render.com, Railway, and Heroku (512MB RAM limits)**. 

By utilizing an advanced, predictive RAM controller, this addon streams **4K HDR Movies and TV Series** from **40+ aggregated torrent sources** without ever crashing, buffering, or hitting Memory Limit (OOM) restarts.

---

## 🚀 The "Hydra Brain": Advanced Resource Management

Most Stremio torrent addons crash on free hosting because torrenting consumes massive amounts of RAM. **Torrent to weblink** introduces the **Hydra Brain**, a specialized controller that guarantees 100% uptime:

### 🧠 Predictive RAM Guard & Tiered Scaling
The system continuously monitors your server's RAM usage and **growth velocity (MB/s)**. It predicts memory spikes before they happen and automatically shifts the server into 7 dynamic performance modes:
- ⚡ **HIGH Mode (<100MB RAM)**: 60+ connections per engine for instant, maximum-speed playback.
- ⚖️ **BALANCED / MEDIUM Modes**: Dynamically throttles active peer limits to stabilize memory across multiple users.
- 🚨 **EMERGENCY Mode (>185MB RAM)**: Instantly prunes slow peers down to **1 seeder** per engine, ensuring server survival during heavy loads.

### ⚖️ Weighted Per-Engine Budget
Instead of splitting peers evenly, the addon analyzes active streaming speeds. **Fast, active streams get a much larger share of the peer budget**, while idle or background engines receive minimal resources.

### 🛡️ High-Value Seed Protection
Even when the server enters EMERGENCY mode, **Torrent to weblink NEVER disconnects fast seeders (>0.2 MB/s)**. It sacrifices slow or dead peers first, maintaining smooth playback over heavy buffering.

### 📡 Smart Peer Recovery
When RAM recovers and stabilizes, the addon implements a 30-second cooldown before triggering a **DHT & Tracker Re-announce**, actively inviting new peers to reconnect and restore peak download speeds.

---

## 🔥 Unmatched Streaming Features

- **🌐 40+ Aggregated Scrapers**: Fetches results in real-time from top-tier sources including **The Pirate Bay (TPB), YTS, Torrentio, Comet, MediaFusion, Nyaa, and Jackettio**.
- **🌊 Smart Scraper Waves**: Scrapers execute in 3 timed waves with automated Garbage Collection (GC) pauses. This prevents the server memory spikes normally caused by bulk API requests.
- **🧬 Advanced Torrent Merging**: If multiple scrapers find the exact same file (matching hash), the addon **fuses them into a single result**, combining source tags and prioritizing the highest seeder count.
- **� No Arbitrary Limits**: Watch as many concurrent movies as you want. There are no artificial "Max 3 Streams" limits—engine capacity is 100% dynamic and based solely on available RAM.
- **🧹 45-Second Auto-Cleanup**: If you close the Stremio player, the active torrent engine is forcefully terminated 45 seconds later, instantly flushing the RAM cache for the next viewer.

---

## 🛠️ How To Deploy Your Own (Free)

Deploying your own private Stremio server takes less than 2 minutes.

### Method 1: Deploy to Render.com (Recommended)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)
1. Fork or clone this repository to your GitHub account.
2. Sign up at [Render.com](https://render.com/).
3. Click **New** → **Web Service** → Connect your GitHub repository.
4. Settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. Click **Deploy Web Service** and wait for it to go live.

### Method 2: Local / VPS Hosting
```bash
git clone https://github.com/Aswinajay/stremio-addon.git
cd stremio-addon
npm install
npm start
# Server will run on http://localhost:10000
```

---

## 🔌 Quick Install (Use the Live Server)

Don't want to deploy your own? You can use my public, maintained instance of **Torrent to weblink** right now:

1. Open Stremio.
2. Go to **Addons** → **Add External Addon**.
3. Paste: `https://stremio.eletroclay.com/manifest.json`
4. Click **Install**.

---

## 🔌 How to Install Your Own Deploy

1. Copy your deployed server URL (e.g., `https://stremio.eletroclay.com`).
2. Open the **Stremio App**.
3. Go to the **Addons** section.
4. Click on the search bar / **Add external addon**.
5. Paste your URL, ensure it ends with `/manifest.json` (e.g., `https://stremio.eletroclay.com/manifest.json`).
6. Click **Install**. You are ready to stream!

---

## 📊 Real-Time Server Monitoring

**Torrent to weblink** comes with built-in endpoints so you can monitor your server's health and the Hydra Brain's decisions:
- **Graphical Dashboard**: Navigate to `/dashboard` on your deployed URL to see a live visual feed of Active Engines, Download Speeds, RAM fluctuations, and Dynamic Modes.
- **Health JSON API**: Navigate to `/health` to output raw server metrics, uptime, and peer allocations.

---

## ☕ Support the Development

Building and maintaining high-performance bypasses for free-tier constraints takes a lot of time and coffee. If this addon improved your streaming experience and saved you money on Debrid services, please consider supporting the developer!

<a href="https://www.buymeacoffee.com/withaswin" target="_blank">
  <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;">
</a>

---

## 📜 License
This project is open-source software licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.
