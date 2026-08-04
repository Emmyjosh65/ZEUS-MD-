# 🤖 ZEUS-MD — Multi-Device WhatsApp Bot

Production-ready WhatsApp MD bot powered by **Baileys** + **Groq AI** (Llama 3.3).

## ✨ Features
- 🔐 Modern pairing system (code + QR fallback)
- 📢 **Auto-joins the ZEUS TIER'S channel right after pairing**
- ♻️ Auto-reconnect manager (exponential backoff, no duplicate sockets)
- 📦 Auto command loader with hot reload
- 💎 Premium system (owner-managed users + redeem code)
- 🤖 AI chatbot (premium feature, Groq Llama 3.3)
- 🛡️ Crash-proof error handling
- 📊 Live stats console (RAM / CPU / uptime)

## 🚀 Quick Start

### 1. Requirements
- Node.js **20+**
- WhatsApp account (secondary device)

### 2. Install & configure
```bash
git clone https://github.com/Emmyjosh65/ZEUS-MD-.git
cd ZEUS-MD-
npm install
cp .env.example .env
# edit .env — OWNER_NUMBER is already set to 2349066760078 (ZEUS)
