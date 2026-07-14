#!/bin/bash

echo "╔══════════════════════════════════════╗"
echo "║     ZEUS-MD - Pterodactyl Launcher   ║"
echo "╚══════════════════════════════════════╝"

# Check if sessions exist already
if [ -d "sessions" ] && [ "$(ls -A sessions 2>/dev/null)" ]; then
    echo "✅ Existing session found. Starting bot..."
    node index.js
    exit $?
fi

# No sessions - check for PHONE_NUMBER
if [ -z "$PHONE_NUMBER" ]; then
    echo "❌ ERROR: No WhatsApp session found."
    echo "❌ ERROR: PHONE_NUMBER environment variable is not set."
    echo ""
    echo "📌 SETUP INSTRUCTIONS:"
    echo "   1. Go to your Pterodactyl server → Startup tab"
    echo "   2. Add a Variable:"
    echo "      - Variable Name: PHONE_NUMBER"
    echo "      - Default Value: 2349066760078"
    echo "      - (your number, country code first, no + or spaces)"
    echo "      - User can view: Yes"
    echo "      - User can edit: Yes"
    echo "   3. Restart the server"
    echo "   4. Check the Console tab for the pairing code"
    echo ""
    exit 1
fi

echo "📱 PHONE_NUMBER set to: $PHONE_NUMBER"
echo "🚀 Starting bot to request pairing code..."
node index.js
