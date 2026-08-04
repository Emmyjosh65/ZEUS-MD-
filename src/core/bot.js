import fs from 'fs';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import config from '../../config.js';
import { ensureSessionDir, quarantineCorruptSession, clearSessions } from './session.js';
import { askPhoneNumber, isValidPhone, printPairingCode, printQR } from './pairing.js';
import { banner, getStats, startStats, stopStats } from './logger.js';
import { commandLoader } from './loader.js';

const logger = pino({ level: 'silent' }); // silences Baileys internal noise

// ─── Pairing tuning (community-verified values) ───
const PAIRING_DELAY_MS = 10000;        // wait 10s after 'connecting' before requesting code
const PAIRING_REFRESH_MS = 60000;      // refresh code every 60s if still unlinked
const MAX_PAIRING_REFRESHES = 3;       // max 3 refreshes, then go quiet (rate-limit safety)
const PAIRING_QUIET_MS = 600000;       // 10 min quiet before another attempt
const OPEN_WATCHDOG_MS = 45000;        // force reconnect if not open within 45s
const RECONNECT_BASE_DELAY = 1000;     // exponential backoff: 1s, 2s, 4s... capped at 30s
const RECONNECT_MAX_DELAY = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BotController {
  constructor() {
    this.sock = null;
    this.baileysVersion = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = MAX_RECONNECT_ATTEMPTS;
    this.reconnectTimer = null;
    this.connectionStartedAt = null;
    this.pairingCode = null;
    this.state = null;
    this.channelJoined = false;
    this.pairingMode = false;
    this.onlineShown = false;
    this.lastPairingRequestAt = 0;
    this._lastPairingPhone = '';
    this._firstRunAnnounced = false;
    this._pairingRefreshTimer = null;
    this._registrationWatcher = null;
    this._openWatchdog = null;
    this._connecting = false;
    this._pairingRequested = false;
    this._pairingRefreshes = 0;
    this._phone = null;
    this._closed = false;
  }

  // ───────────────────────── INIT ─────────────────────────
  async init() {
    const { version } = await fetchLatestBaileysVersion();
    this.baileysVersion = version;
    banner(config, { baileys: version });

    // Session folder: create if missing, delete if it's a file, clean corrupt JSON
    ensureSessionDir(config.sessionDir);
    quarantineCorruptSession(config.sessionDir);

    // Load commands (a broken plugin is skipped — bot keeps running)
    await commandLoader.init(config);
    commandLoader.watch();
    startStats();

    // Detect if we already have a saved session
    let hasSession = false;
    try { hasSession = fs.readdirSync(config.sessionDir).length > 0; } catch { hasSession = false; }
    this.pairingMode = !hasSession;
    if (this.pairingMode) {
      console.log('🔐 No saved session found — pairing mode enabled.');
    } else {
      console.log('💾 Saved session found — skipping pairing.');
    }

    await this.connect();
  }

  // ───────────────────────── CONNECT ─────────────────────────
  async connect() {
    if (this._closed) return;
    if (this._connecting) {
      console.warn('⚠️ connect() called while already connecting — ignoring duplicate socket.');
      return;
    }
    this._connecting = true;

    // Kill any stale socket first → no duplicate sockets
    if (this.sock) {
      try { this.sock.end(undefined); } catch {}
      this.sock = null;
    }

    try {
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
      const { version } = await fetchLatestBaileysVersion();
      this.baileysVersion = version;
      this.state = state;

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        browser: config.browser,
        syncFullHistory: false,          // lower RAM + faster startup
        markOnlineOnConnect: false,      // less presence spam, lower CPU
      });
      this._connecting = false;
      this.connectionStartedAt = Date.now();

      // ── Save credentials on every update (never lose session) ──
      this.sock.ev.on('creds.update', saveCreds);

      // ── Connection state machine ──
      this.sock.ev.on('connection.update', (update) => this._onConnectionUpdate(update));

      // ── Incoming messages ──
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        try { await this._handleMessages({ messages }); } catch (e) {
          console.error('⚠️ messages.upsert handler error:', e?.stack || e?.message);
        }
      });
    } catch (e) {
      this._connecting = false;
      console.error('⚠️ connect() error:', e?.stack || e?.message);
      this._scheduleReconnect();
    }
  }

  // ───────────────────────── CONNECTION UPDATE ─────────────────────────
  _onConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) printQR(qr);

    if (connection === 'connecting') {
      this.connected = false;
      console.log('🔄 Connecting to WhatsApp...');
      // Watchdog: if we never reach 'open', force a reconnect
      clearTimeout(this._openWatchdog);
      this._openWatchdog = setTimeout(() => {
        if (!this.connected && !this._closed) {
          console.warn('⚠️ Open watchdog: still not connected, forcing reconnect...');
          try { this.sock?.end(new Error('watchdog timeout')); } catch {}
        }
      }, OPEN_WATCHDOG_MS);

      // First-run pairing: ask for number, then request the code
      if (this.pairingMode && !this._pairingRequested) {
        this._pairingRequested = true;
        this._schedulePairing();
      }
    } else if (connection === 'open') {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.pairingMode = false;
      this._pairingRequested = false;
      clearTimeout(this._openWatchdog);
      this._stopPairingTimers();
      this._startRegistrationWatcher();
      this._printOnlineStatus();
      this._joinChannel();
    } else if (connection === 'close') {
      this.connected = false;
      this._handleConnectionClose(lastDisconnect);
    }
  }

  // ───────────────────────── PAIRING ─────────────────────────
  async _schedulePairing() {
    try {
      let phone = config.phoneNumber;
      if (!phone) {
        console.log('\n🔐 No session found — let\'s link your WhatsApp.');
        console.log('📱 Enter your number in INTERNATIONAL format (digits only, no + or spaces).');
        phone = await askPhoneNumber();
        if (!phone) {
          console.log('⚠️ No input received. Make sure you type the number in the console,');
          console.log('   or set PHONE_NUMBER in .env (for hosts without a console).');
          console.log('📌 Example: 2349066760078');
          phone = await askPhoneNumber(300000);
          if (!phone) {
            console.error('❌ Pairing cancelled (no number provided). Will retry in 60s...');
            setTimeout(() => { this._pairingRequested = false; this.connect(); }, 60000);
            return;
          }
        }
      }

      if (!isValidPhone(phone)) {
        console.error(`❌ Invalid phone number: "${phone}" — must be 7–15 digits.`);
        this._pairingRequested = false;
        this._scheduleReconnect(5000);
        return;
      }

      this._phone = phone;
      this._lastPairingPhone = phone;
      this._pairingRefreshes = 0;
      console.log(`📱 Pairing requested for +${phone} — waiting for the socket to be ready...`);

      // Wait until the socket is in 'connecting' state before requesting the code
      await sleep(PAIRING_DELAY_MS);
      if (this.connected || this._closed || !this.sock) return;

      await this._requestPairingCode(phone);
    } catch (e) {
      console.error('⚠️ Pairing flow error:', e?.stack || e?.message);
      this._pairingRequested = false;
    }
  }

  async _requestPairingCode(phone) {
    if (this.connected || this._closed || !this.sock) return;
    if (this._pairingRefreshes > MAX_PAIRING_REFRESHES) {
      // WhatsApp rate-limits pairing requests — go quiet, keep socket alive
      console.log(`⏸️  Pairing quiet period (${PAIRING_QUIET_MS / 60000} min) — the code above is still valid.`);
      return;
    }
    try {
      const code = await this.sock.requestPairingCode(phone);
      this.pairingCode = code;
      this.lastPairingRequestAt = Date.now();
      this._pairingRefreshes++;
      printPairingCode(code);
      // WhatsApp sends the "Link a device" notification to the phone automatically

      // Refresh the code periodically if still not linked
      clearTimeout(this._pairingRefreshTimer);
      this._pairingRefreshTimer = setTimeout(() => {
        this._pairingRefreshTimer = null;
        if (!this.connected && this.pairingMode && !this._closed) {
          this._requestPairingCode(phone);
        }
      }, PAIRING_REFRESH_MS);
    } catch (e) {
      console.warn('⚠️ Pairing code request failed:', e?.message);
      this._pairingRequested = false;
      this._scheduleReconnect(5000);
    }
  }

  _stopPairingTimers() {
    clearTimeout(this._pairingRefreshTimer);
    this._pairingRefreshTimer = null;
  }

  _startRegistrationWatcher() {
    this._stopRegistrationWatcher();
    this._registrationWatcher = (update) => {
      if (update.registered === true) {
        this.pairingMode = false;
        this._stopPairingTimers();
      }
    };
    try { this.sock?.ev?.on('creds.update', this._registrationWatcher); } catch {}
  }

  _stopRegistrationWatcher() {
    if (this._registrationWatcher && this.sock?.ev) {
      try { this.sock.ev.off('creds.update', this._registrationWatcher); } catch {}
    }
    this._registrationWatcher = null;
  }

  // ───────────────────────── DISCONNECT / RECONNECT ─────────────────────────
  _handleConnectionClose(lastDisconnect) {
    this.connected = false;
    const error = lastDisconnect?.error;
    const statusCode = error?.output?.statusCode;
    const isLoggedOut = error instanceof Boom && statusCode === DisconnectReason.loggedOut;

    if (isLoggedOut) {
      console.log('🚪 Logged out of WhatsApp — clearing session and requesting a new pairing.');
      clearSessions(config.sessionDir);
      this.pairingMode = true;
      this._pairingRequested = false;
      this._phone = null;
      this.onlineShown = false;
      this.channelJoined = false;
      this._scheduleReconnect(1000);
      return;
    }

    const reason = statusCode ?? error?.message ?? 'unknown';
    console.log(`🔌 Disconnected: ${reason}`);

    if (statusCode === DisconnectReason.badSession) {
      console.log('🧹 Corrupted session detected — removing only the broken files.');
      quarantineCorruptSession(config.sessionDir);
    }

    this._scheduleReconnect();
  }

  _scheduleReconnect(delayOverride) {
    if (this._closed) return;
    clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('🛑 Max reconnect attempts reached — resting 60s, then retrying fresh.');
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => this.connect(), 60000);
      return;
    }

    const delay = delayOverride ?? Math.min(
      RECONNECT_MAX_DELAY,
      RECONNECT_BASE_DELAY * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts++;
    console.log(`🔄 Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // ───────────────────────── CHANNEL AUTO-JOIN ─────────────────────────
  async _joinChannel() {
    const code = config.channelInviteCode;
    if (!code || this.channelJoined || !this.sock) return;
    this.channelJoined = true;
    try {
      const meta = await this.sock.newsletterMetadata('invite', code);
      const jid = meta?.id || meta?.jid;
      if (!jid) throw new Error('channel invite code could not be resolved');
      await this.sock.newsletterFollow(jid);
      console.log(`📣 Auto-joined channel: ${meta?.name || config.channelLink}`);
    } catch (e) {
      console.warn(`⚠️ Could not auto-join channel (${e?.message || e}). The bot continues normally.`);
      this.channelJoined = false;
    }
  }

  // ───────────────────────── ONLINE STATUS ─────────────────────────
  _printOnlineStatus() {
    if (this.onlineShown) return;
    this.onlineShown = true;
    const s = getStats();
    console.log('\n╔══════════════════════════════════╗');
    console.log('║      ✅ ZEUS-MD IS ONLINE        ║');
    console.log('╚══════════════════════════════════╝');
    console.log(`📱 Connected Number : ${this.sock?.user?.id?.split(':')[0] || 'Unknown'}`);
    console.log(`👑 Owner            : wa.me/${config.ownerNumber} (${config.ownerName})`);
    console.log(`⚙️  Commands Loaded  : ${commandLoader.commands.size}`);
    console.log(`📦 Plugins Loaded   : ${commandLoader.commands.size}`);
    console.log(`🤖 Chatbot Status   : ${config.groqApiKey ? 'ACTIVE' : 'DISABLED (no GROQ_API_KEY)'}`);
    console.log(`💎 Premium Status   : ${config.premiumCode ? 'ENABLED' : 'DISABLED'}`);
    console.log(`📢 Channel          : ${config.channelLink}`);
    console.log(`🗄️  Database Status  : ${config.sessionDir}`);
    console.log(`📊 RAM ${s.ram} | Heap ${s.heap} | CPU Load ${s.cpu} | Uptime ${s.uptime}`);
    console.log('');
  }

  // ───────────────────────── MESSAGE HANDLING ─────────────────────────
  async _handleMessages({ messages }) {
    if (!Array.isArray(messages) || !this.sock) return;
    for (const msg of messages) {
      try {
        await this._processMessage(msg);
      } catch (e) {
        console.error('⚠️ Message processing error:', e?.stack || e?.message);
      }
    }
  }

  async _processMessage(msg) {
    if (!msg?.message || msg.key?.fromMe || !msg.key?.remoteJid) return;

    const { extractText } = await import('../lib/utils.js');
    const text = extractText(msg);
    if (!text) return;

    const from = msg.key.remoteJid;
    const sender = msg.key.participant || from;
    const isGroup = from.endsWith('@g.us');
    const senderNumber = String(sender).replace(/[^\d]/g, '').slice(0, 15);
    const isOwner = senderNumber === config.ownerNumber;
    const prefix = config.prefix;

    const { isPremium } = await import('../lib/database.js');
    const { getChatbotReply } = await import('../lib/ai.js');

    // Chatbot: replies to plain messages when enabled (premium-gated)
    if (!text.startsWith(prefix)) {
      const db = (await import('../lib/database.js')).getDB();
      if (db.chatbotUsers?.[senderNumber] === true) {
        if (!isPremium(senderNumber)) {
          delete db.chatbotUsers[senderNumber];
          (await import('../lib/database.js')).saveDB(db);
          await this.sock.sendMessage(from, {
            text: `🤖 *${config.chatbotName} Chatbot*\n\n⚠️ This feature is *PREMIUM ONLY*.\n\n💎 Get premium: ${prefix}prem ${config.premiumCode}\n👑 Contact: wa.me/${config.ownerNumber}`,
          }, { quoted: msg });
          return;
        }
        try {
          await this.sock.sendPresenceUpdate('composing', from);
          const reply = await getChatbotReply(text, senderNumber);
          await this.sock.sendMessage(from, { text: `🤖 *${config.chatbotName}:*\n\n${reply}` }, { quoted: msg });
        } catch (e) {
          console.error('⚠️ Chatbot error:', e?.message);
        }
        return;
      }
    }

    if (!text.startsWith(prefix)) return;

    const args = text.slice(prefix.length).trim().split(/ +/);
    const command = args.shift()?.toLowerCase();
    if (!command) return;

    // Special commands handled natively (premium redeem + chatbot toggle)
    if (command === 'chatbot' || command === 'prem' || command === 'premium') {
      const handled = await this._handleSpecialCommands(command, args, msg, from, senderNumber, isOwner);
      if (handled) return;
    }

    const ctx = {
      sock: this.sock,
      msg,
      from,
      sender,
      senderNumber,
      isGroup,
      isOwner,
      args,
      command,
      prefix,
      text,
    };

    const dispatched = await commandLoader.dispatch(this.sock, ctx);
    if (!dispatched) {
      await this.sock.sendMessage(from, {
        text: `❌ Unknown command: ${prefix}${command}\n\nType ${prefix}menu to see available commands.`,
      }, { quoted: msg }).catch(() => {});
    }
  }

  async _handleSpecialCommands(command, args, msg, from, senderNumber, isOwner) {
    if (command === 'prem' || command === 'premium') {
      const { premium } = await import('../commands/premium.js');
      try { await premium(this.sock, msg, args, from, senderNumber); } catch (e) {
        console.error('❌ premium error:', e?.message);
      }
      return true;
    }
    if (command === 'chatbot') {
      const { chatbot } = await import('../commands/chatbot.js');
      try { await chatbot(this.sock, msg, args, from, senderNumber); } catch (e) {
        console.error('❌ chatbot error:', e?.message);
      }
      return true;
    }
    return false;
  }

  // ───────────────────────── SHUTDOWN ─────────────────────────
  shutdown(sig) {
    if (this._closed) return;
    this._closed = true;
    console.log(`\n🛑 Received ${sig}. Shutting down gracefully...`);
    this._stopRegistrationWatcher();
    this._stopPairingTimers();
    clearTimeout(this._openWatchdog);
    clearTimeout(this.reconnectTimer);
    stopStats();
    commandLoader.stop();
    try { this.sock?.end(undefined); } catch {}
    process.exit(0);
  }
}

export const botController = new BotController();
