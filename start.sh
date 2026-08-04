#!/bin/bash
# ZEUS-MD — launcher for Pterodactyl / Render / Railway / Koyeb / VPS

echo "╔══════════════════════════════════════╗"
echo "║        ZEUS-MD Bot Launcher          ║"
echo "╚══════════════════════════════════════╝"
echo "Node: $(node -v)"
echo "NPM : $(npm -v)"

# ─── Install dependencies on first run only ───
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install --no-audit --no-fund || { echo "❌ npm install failed"; exit 1; }
else
  echo "✅ Dependencies already installed."
fi

# ─── First-run pairing notice ───
if [ ! -d "sessions" ] || [ -z "$(ls -A sessions 2>/dev/null)" ]; then
  echo ""
  echo "⚠️  No WhatsApp session found."
  echo "   • Console hosts (Pterodactyl/VPS/Termux): the bot will ASK for your number,"
  echo "     then print a PAIRING CODE. Type the number in the console."
  echo "   • No-console hosts (Render/Railway/Koyeb): set PHONE_NUMBER first."
  echo ""
fi

# ─── Start ───
exec node index.js
