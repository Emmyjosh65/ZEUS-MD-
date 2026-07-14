import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, 'sessions');

if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
    },
    browser: ['ZEUS-MD', 'Chrome', '120.0.0'],
    markOnlineOnConnect: true,
  });

  // ─── PAIRING CODE ───
  if (!sock.authState.creds.registered) {
    console.log('⚡ No session found. Requesting pairing code...\n');
    const phoneNumber = await new Promise((resolve) => {
      rl.question('📱 Enter your WhatsApp number (country code, no +, no spaces): ', resolve);
    });
    rl.close();

    try {
      const code = await sock.requestPairingCode(phoneNumber.trim());
      console.log(`\n🔐 ─── YOUR PAIRING CODE ───`);
      console.log(`   ${code}`);
      console.log(`───────────────────────────\n`);
      console.log('📲 Open WhatsApp on your phone');
      console.log('⚙️ Settings → Linked Devices → Link with Phone Number');
      console.log(`⌨️ Enter the code above\n`);
    } catch (err) {
      console.error('❌ Pairing failed:', err.message);
      process.exit(1);
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
