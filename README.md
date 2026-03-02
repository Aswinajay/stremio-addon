# 🎬 Torrent to weblink — v3.5.31
[![Status](https://img.shields.io/badge/Status-Healthy-brightgreen?style=for-the-badge)](https://stremio-addon-lg01.onrender.com/health)
[![Version](https://img.shields.io/badge/Version-3.5.31-blue?style=for-the-badge)](https://github.com/Aswinajay/stremio-addon)
[![Platform](https://img.shields.io/badge/Host-Render.com-black?style=for-the-badge)](https://render.com)

A high-performance Stremio addon engineered for **survival on free-tier cloud hosting**. Built with an intelligent resource controller to provide buffer-free streaming without hitting memory limits.

---

## 🚀 The Hydra Brain (Resource Management)
Unlike standard addons, **Torrent to weblink** features a sophisticated "Hydra Brain" controller that prevents server restarts on Render's 512MB RAM limit.

### 🧠 Intelligent Tiered Scaling
The system monitors RAM usage and velocity in real-time, automatically shifting between performance modes:
- **⚡ HIGH Mode** (<100MB): Full speed, max peers for instant playback.
- **⚖️ BALANCED Mode**: Optimized peer counts for multi-user stability.
- **🚨 EMERGENCY Mode** (>185MB): Immediate peer pruning down to **1 seeder** to guarantee server survival.

### 📈 Predictive RAM Guard
The brain doesn't just react — it **predicts**. It tracks the velocity (MB/s) of memory growth and throttles connections *before* the limit is reached, ensuring 100% uptime.

---

## 🔥 Key Features

| Feature | Description |
| :--- | :--- |
| **📡 40+ Sources** | Aggregated results from TPB, YTS, Torrentio, Comet, and more. |
| **📉 Smart Throttling** | Dynamically adjusts peer limits (1 to 80) based on server health. |
| **🌊 Scraper Waves** | Tiered search execution with GC cooling to prevent RAM spikes. |
| **🛡️ Seed Protection** | Never prunes high-value seeders (>0.2 MB/s), even under pressure. |
| **🧹 Auto-Cleanup** | Engines are destroyed 45s after a stream is closed to free memory. |
| **📊 Dashboard** | Real-time monitoring of active engines, speeds, and RAM. |

---

## 🛠️ Quick Start

### 1. Install to Stremio
1. Copy this URL: `https://stremio-addon-lg01.onrender.com/manifest.json`
2. Open **Stremio** → **Addons** → **Add External Addon**
3. Paste the URL and click **Install**.

### 2. Deploy Your Own
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com)
1. Fork this repository.
2. Create a new **Web Service** on Render.
3. Connect your fork.
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node server.js`

---

## 📊 Monitoring
Check the health and performance of your addon anytime:
- **Dashboard**: [stremio-addon-lg01.onrender.com/dashboard](https://stremio-addon-lg01.onrender.com/dashboard)
- **Health JSON**: [stremio-addon-lg01.onrender.com/health](https://stremio-addon-lg01.onrender.com/health)

---

## ☕ Support My Work
If this addon has made your streaming experience better, consider supporting the development!

<a href="https://www.buymeacoffee.com/withaswin" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

---

## 📜 License
This project is licensed under the MIT License - see the LICENSE file for details.
