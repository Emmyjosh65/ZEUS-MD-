import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import config from '../../config.js';
import { ensureSessionDir, quarantineCorruptSession, clearSessions } from './session.js';
import { askPhoneNumber, isValidPhone, printPairingCode, printQR } from './pairing.js';
import { banner, getStats, startStats, stopStats } from './logger.js';
import { commandLoader } from './loader.js';

const logger = pino({ level: 'silent' });
const PAIRING_COOLDOWN_MS = 60000;   // min time between pairing code requests
const PAIRING_REFRESH_MS = 90000;    // auto-issue a fresh code if still not linked
const PAIRING_DELAY_MS = 5000;       // let the socket fully establish before requesting
const OPEN_WATCHDOG_MS = 45000;      // registered sessions: force-restart if 'open' never fires
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class BotController {
  constructor() {
    this.sock = null;
    this.baileysVersion = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
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
    this._closed = false;
  }

  async init() {
    ensureSessionDir(config.sessionDir);
    const quarantined = quarantineCorruptSession(config.sessionDir);
    if (quarantined > 0) console.log(`🧹 Removed ${quarantined} corrupted session file(s).`);

    const { version, isLatest } = await fetchLatestBaileysVersion();
    this.baileysVersion = version.join('.');

    await commandLoader.init(config);
    commandLoader.watch();

    banner(config, { baileys: `${this.baileysVersion}${isLatest ? '' : ' (update available)'}` });
    startStats();

    this._attachProcessHandlers();
    return this.connect();
  }

  _attachProcessHandlers() {
    process.on('unhandledRejection', (reason) => {
      console.error('⚠️ Unhandled rejection:', reason instanceof Error ? reason.stack : reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('⚠️ Uncaught exception:', err.stack || err);
    });
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.on(sig, () => this.shutdown(sig));
    }
  }

  _attachSocketListeners(sock) {
    sock.ev.on('creds.update', () => {
      try { this.saveCreds?.(); } catch (e) { console.error('⚠️ creds.update error:', e.message); }
    });

    sock.ev.on('connection.update', (update) => this._handleConnectionUpdate(update));
    sock.ev.on('messages.upsert', (data) => this._handleMessages(data));
  }

  async connect() {
    if (this._closed) return;
    if (this.sock) {
      // Prevent duplicate sockets: tear down the old one first
      try { this.sock.end(undefined); } catch {}
      this.sock = null;
    }

    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    this.state = state;
    this.saveCreds = saveCreds;
    this.connected = false;
    this.onlineShown = false;

    console.log(`🔌 Connecting (attempt ${this.reconnectAttempts + 1})...`);

    const sock = makeWASocket({
      version: this.baileysVersion ? this.baileysVersion.split('.').map(Number) : undefined,
      logger,
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      browser: [config.botName, 'Chrome', '120.0.0'],
      markOnlineOnConnect: true,
      syncFullHistory: false,
    });

    this.sock = sock;
    this._attachSocketListeners(sock);

    // QR fallback (used only when there's no PHONE_NUMBER at all)
    sock.ev.on('qr', (qr) => printQR(qr));

    if (!state.creds.registered) {
      this.pairingMode = Boolean(config.phoneNumber || process.stdin.isTTY);
      this._firstRunAnnounced = false;
    }

    // Watchdog: for an ALREADY REGISTERED session, 'open' must arrive soon.
    // A brand-new session never fires 'open' (it waits on QR/pairing), so skip it.
    clearTimeout(this._openWatchdog);
    if (state.creds.registered) {
      this._openWatchdog = setTimeout(() => {
        if (this._closed || this.connected || !this.sock) return;
        console.warn('⏰ Socket stuck (no open after 45s). Restarting connection...');
        try { this.sock?.end(new Error('connect watchdog timeout')); } catch {}
      }, OPEN_WATCHDOG_MS);
    }

    return sock;
  }

  async _handlePairingTrigger() {
    if (this._closed || !this.sock || this.state?.creds?.registered) return;
    if (!this.pairingMode) return; // QR-only mode

    if (!this._firstRunAnnounced) {
      console.log('📱 No saved session found.');
      this._firstRunAnnounced = true;
    }

    const phone = this._lastPairingPhone || config.phoneNumber;
    if (!phone) return;

    if (!isValidPhone(phone)) {
      console.error(`❌ Invalid phone number: "${phone}". Expected 7–15 digits, country code first, no +/spaces.`);
      return;
    }
    this._lastPairingPhone = phone;

    // Cooldown: stop the request-spam loop
    const sinceLast = Date.now() - this.lastPairingRequestAt;
    if (sinceLast < PAIRING_COOLDOWN_MS) return;

    // Give the socket a moment to fully establish — requesting too early
    // causes Baileys "Connection Closed" (428) errors
    this.lastPairingRequestAt = Date.now();
    await sleep(PAIRING_DELAY_MS);
    if (this._closed || this.state?.creds?.registered || !this.sock) return;

    try {
      console.log(`⚡ Requesting pairing code for ${phone}...`);
      const code = await this.sock.requestPairingCode(phone);
      this.pairingCode = code;
      printPairingCode(code);
      console.log('⏳ Waiting for you to link the device...');
      this._startRegistrationWatcher();
    } catch (e) {
      console.error('❌ Pairing request failed:', e?.message || e);
      // The close handler reconnects; the cooldown prevents an instant retry loop.
    }
  }

  _startRegistrationWatcher() {
    this._stopRegistrationWatcher();
    this._registrationWatcher = setInterval(() => {
      if (this._closed) { this._stopRegistrationWatcher(); return; }
      if (this.state?.creds?.registered) {
        this._stopRegistrationWatcher();
        clearTimeout(this._pairingRefreshTimer);
        console.log('✅ Device linked successfully!');
        this._printOnlineStatus();
        this._joinChannel();
      }
    }, 5000);

    // Auto-refresh: if still unlinked, issue a fresh code (old one likely expired)
    this._pairingRefreshTimer = setTimeout(() => this._refreshPairingCode(), PAIRING_REFRESH_MS);
  }

  _stopRegistrationWatcher() {
    clearInterval(this._registrationWatcher);
    this._registrationWatcher = null;
  }

  async _refreshPairingCode() {
    if (this._closed || this.state?.creds?.registered || !this.sock) return;
    const phone = this._lastPairingPhone || config.phoneNumber;
    if (!phone) return;
    console.log('🔁 No link detected yet — previous code may have expired. Requesting a fresh one...');
    try {
      const code = await this.sock.requestPairingCode(phone);
      this.lastPairingRequestAt = Date.now();
      this.pairingCode = code;
      printPairingCode(code);
      this._startRegistrationWatcher();
    } catch (e) {
      console.error('❌ Pairing refresh failed:', e?.message || e);
      this._pairingRefreshTimer = setTimeout(() => this._refreshPairingCode(), PAIRING_REFRESH_MS);
    }
  }

  _handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;

    // 🔑 KEY FIX: Baileys never emits 'open' for a new device — the pairing
    // code must be requested during the 'connecting'/QR phase instead.
    if (connection === 'connecting' && !this.state?.creds?.registered) {
      this._handlePairingTrigger();
    }

    if (connection === 'open') {
      clearTimeout(this._openWatchdog);
      this.connected = true;
      this.connectionStartedAt = Date.now();
      this.reconnectAttempts = 0;
      this.pairingCode = null;

      if (!this.state?.creds?.registered) {
        // Fallback for Baileys builds that do fire 'open' before pairing
        if (this.pairingMode) this._handlePairingTrigger();
        return;
      }

      this._printOnlineStatus();
      this._joinChannel();
      return;
    }

    if (connection === 'close') {
      clearTimeout(this._openWatchdog);
      this.connected = false;
      this.onlineShown = false;
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || `status ${code}`;
      const wasRegistered = this.state?.creds?.registered === true;

      // ─── REAL logout — only possible if we had a working session ───
      if (code === DisconnectReason.loggedOut && wasRegistered) {
        console.warn('❌ Logged out of WhatsApp.');
        this._stopRegistrationWatcher();
        clearSessions(config.sessionDir);
        console.log('🧹 Session cleared. Restarting to request a new pairing code...');
        this.sock?.end(undefined);
        this.sock = null;
        this.reconnectAttempts = 0;
        this.channelJoined = false;
        this._firstRunAnnounced = false;
        setTimeout(() => this.connect(), 3000);
        return;
      }

      // ─── 401 during pairing is NOT a logout — never wipe the session folder ───
      if (code === DisconnectReason.loggedOut) {
        console.log('🔌 Connection closed during pairing (not a logout). Reconnecting...');
        this._scheduleReconnect();
        return;
      }

      if (code === DisconnectReason.restartRequired || code === DisconnectReason.connectionReplaced) {
        console.log('🔄 Restart required by WhatsApp. Reconnecting...');
        this.reconnectAttempts = 0;
        this._scheduleReconnect(1000);
        return;
      }

      if (code === DisconnectReason.connectionClosed || code === DisconnectReason.connectionLost) {
        console.log('🔌 Connection lost. Reconnecting...');
      } else {
        console.log(`🔌 Disconnected (${reason}).`);
      }

      this._scheduleReconnect();
    }
  }

  _scheduleReconnect(delayOverride) {
    if (this._closed || this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnect attempts reached. Waiting 5 minutes before retrying...');
      this.reconnectAttempts = 0;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 300000);
      return;
    }

    const delay = delayOverride ?? Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    console.log(`🔄 Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

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
      this.channelJoined = false; // retry on next connection open
    }
  }

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

    // Chatbot auto-reply for premium users (non-command messages)
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

    // Chatbot toggle commands handled before generic dispatch
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

  shutdown(sig) {
    if (this._closed) return;
    this._closed = true;
    console.log(`\n🛑 Received ${sig}. Shutting down gracefully...`);
    this._stopRegistrationWatcher();
    clearTimeout(this._pairingRefreshTimer);
    clearTimeout(this._openWatchdog);
    stopStats();
    commandLoader.stop();
    clearTimeout(this.reconnectTimer);
    try { this.sock?.end(undefined); } catch {}
    process.exit(0);
  }
}

export const botController = new BotController();
