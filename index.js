import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// ─── PTERODACTYL KEEP-ALIVE HTTP SERVER ───
const PORT = process.env.PORT || 2091;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ZEUS-MD Bot is running\n');
}).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// ─── BOT LOGGER ───
const logger = pino({ level: 'silent' });

async function startBot() {
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`\n╔══════════════════════════════════╗`);
  console.log(`║     🤖 ${config.botName} v2.0       ║`);
  console.log(`╚══════════════════════════════════╝`);
  console.log(`📱 Baileys v${version.join('.')} | Latest: ${isLatest}`);
  console.log(`👑 Owner: ${config.ownerName} (${config.ownerNumber})`);
  console.log(`🤖 AI: Groq ${config.groqModel}\n`);

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['ZEUS-MD', 'Chrome', '120.0.0'],
    markOnlineOnConnect: true,
  });

  // ─── PAIRING CODE (NON-INTERACTIVE FOR PTERODACTYL) ───
  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.PHONE_NUMBER;

    if (!phoneNumber) {
      console.log('❌ ERROR: No WhatsApp session found and PHONE_NUMBER env variable is not set.');
      console.log('📌 Go to Pterodactyl → Startup → Add PHONE_NUMBER variable with your number.');
      console.log('📌 Format: country code + number, no + or spaces (e.g., 2349066760078)');
      // Keep trying every 30 seconds in case the env gets set later
      setTimeout(startBot, 30000);
      return;
    }

    try {
      console.log(`⚡ No session found. Requesting pairing code for ${phoneNumber}...`);
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`\n🔐 ─── YOUR PAIRING CODE ───`);
      console.log(`   ${code}`);
      console.log(`───────────────────────────\n`);
      console.log('📲 Open WhatsApp on your phone');
      console.log('⚙️ Settings → Linked Devices → Link with Phone Number');
      console.log(`⌨️ Enter the code above\n`);
      console.log('⏳ Waiting 2 minutes for you to pair...');

      // Wait 2 minutes for pairing, then reconnect logic takes over
      await new Promise(resolve => setTimeout(resolve, 120000));
    } catch (err) {
      console.error('❌ Pairing failed:', err.message);
      console.log('🔄 Retrying in 15 seconds...');
      setTimeout(startBot, 15000);
      return;
    }
  }

  // ─── CONNECTION HANDLER ───
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
      console.log(`🔌 Disconnected: ${reason || 'unknown'}`);
      if (reason === DisconnectReason.loggedOut) {
        console.log('❌ Logged out. Delete sessions/ folder and restart.');
        // Delete session so it re-requests pairing on next start
        try {
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSION_DIR, { recursive: true });
          console.log('🧹 Sessions cleared. Will request new pairing on restart.');
        } catch (e) {
          console.error('Failed to clear sessions:', e.message);
        }
        process.exit(1);
      } else {
        console.log('🔄 Reconnecting in 5 seconds...');
        setTimeout(startBot, 5000);
      }
    }
    if (connection === 'open') {
      console.log('\n✅ ─── ZEUS-MD IS ONLINE ───');
      console.log(`📱 Connected as: ${sock.user?.name || sock.user?.id || 'Unknown'}`);
      console.log(`👑 Owner: wa.me/${config.ownerNumber}`);
      console.log(`💎 Premium: .prem ${config.premiumCode}`);
      console.log(`🤖 Chatbot: .chatbot on (Premium only)\n`);
    }
  });

  // ─── MESSAGE HANDLER ───
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const text = msg.message.conversation ||
                   msg.message.extendedTextMessage?.text ||
                   '';
      const from = msg.key.remoteJid;
      const sender = msg.key.participant || from;
      const isGroup = from.endsWith('@g.us');
      const senderNumber = sender.replace(/[^0-9]/g, '').slice(0, 15);

      if (!text) continue;

      const { handleCommand } = await import('./src/commands/handler.js');
      await handleCommand(sock, msg, text, from, sender, senderNumber, isGroup);
    }
  });

  return sock;
}

startBot().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
