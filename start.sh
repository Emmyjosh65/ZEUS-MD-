#!/bin/bash

echo "╔══════════════════════════════════════╗"
echo "║     ZEUS-MD - Pterodactyl Launcher   ║"
echo "╚══════════════════════════════════════╝"

# ─── Install dependencies on first run ───
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install --omit=dev || { echo "❌ npm install failed"; exit 1; }
fi

# ─── Validate required config ───
if [ -z "$OWNER_NUMBER" ]; then
  echo "❌ ERROR: OWNER_NUMBER environment variable is not set."
  echo "📌 Add it in Pterodactyl → Startup, or in your .env file."
  echo "   Format: country code + number, no + or spaces (e.g., 2349066760078)"
  exit 1
fi

# ─── First run: request PHONE_NUMBER for pairing ───
if [ ! -d "sessions" ] || [ -z "$(ls -A sessions 2>/dev/null)" ]; then
  if [ -z "$PHONE_NUMBER" ]; then
    echo "⚠️  No session found and PHONE_NUMBER is not set."
    echo "📌 Set PHONE_NUMBER (e.g., 2349066760078) to get a pairing code."
    echo "   OR leave it empty on a terminal (VPS/Termux) for an interactive prompt."
  else
    echo "📱 PHONE_NUMBER set. Starting bot to request pairing code..."
  fi
fi

# ─── Start ───
node index.js
