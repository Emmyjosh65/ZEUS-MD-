import config from '../../config.js';
import { isPremium, loadPremiumDB, savePremiumDB } from '../lib/database.js';
import { getChatbotReply } from '../lib/ai.js';

const PREFIX = config.prefix;

export async function handleCommand(sock, msg, text, from, sender, senderNumber, isGroup) {
  const args = text.slice(1).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  const db = loadPremiumDB();

  // ─── CHATBOT AUTO-REPLY (Premium only) ───
  if (!text.startsWith(PREFIX)) {
    const chatMode = db.chatbotUsers || {};
    if (chatMode[senderNumber] === true) {
      if (!isPremium(senderNumber)) {
        // Auto-remove non-premium from chatbot
        delete db.chatbotUsers[senderNumber];
        savePremiumDB(db);
        await sock.sendMessage(from, {
          text: `🤖 *${config.chatbotName} Chatbot*\n\n⚠️ This feature is *PREMIUM ONLY*.\n\n💎 Get premium:\n${config.prefix}prem ${config.premiumCode}\n👑 Or contact: wa.me/${config.ownerNumber}`,
        }, { quoted: msg });
        return;
      }
      // Premium user — Groq AI reply
      await sock.sendPresenceUpdate('composing', from);
      const reply = await getChatbotReply(text, senderNumber);
      await sock.sendMessage(from, {
        text: `🤖 *${config.chatbotName}:*\n\n${reply}`,
      }, { quoted: msg });
      return;
    }
  }

  if (!text.startsWith(PREFIX)) return;

  // ─── MENU ───
  if (command === 'menu') {
    const { menu } = await import('./menu.js');
    return menu(sock, msg, from, sender, senderNumber, isPremium(senderNumber));
  }

  // ─── PREMIUM ───
  if (command === 'prem' || command === 'premium') {
    const { premium } = await import('./premium.js');
    return premium(sock, msg, args, from, senderNumber);
  }

  // ─── CHATBOT ───
  if (command === 'chatbot') {
    const { chatbot } = await import('./chatbot.js');
    return chatbot(sock, msg, args, from, senderNumber);
  }

  // ─── OWNER ───
  if (command === 'owner') {
    await sock.sendMessage(from, {
      text: `👑 *${config.botName} Owner*\n\nName: ${config.ownerName}\nWhatsApp: wa.me/${config.ownerNumber}\n\n💎 *Get Premium:*\n${config.prefix}prem ${config.premiumCode}\nOr contact the owner directly.`,
    }, { quoted: msg });
    return;
  }

  // ─── ADD PREMIUM (Owner only) ───
  if (command === 'addprem') {
    if (senderNumber !== config.ownerNumber.replace(/[^0-9]/g, '')) {
      return sock.sendMessage(from, { text: '❌ Only the owner can use this command.' }, { quoted: msg });
    }
    const target = args[0]?.replace(/[^0-9]/g, '');
    if (!target || target.length < 5) {
      return sock.sendMessage(from, { text: '❌ Usage: .addprem <number>\nExample: .addprem 2348123456789' }, { quoted: msg });
    }
    db.premiumUsers = db.premiumUsers || {};
    db.premiumUsers[target] = true;
    db.premiumExpiry = db.premiumExpiry || {};
    db.premiumExpiry[target] = Date.now() + 30 * 24 * 60 * 60 * 1000;
    savePremiumDB(db);
    return sock.sendMessage(from, { text: `✅ *${target}* is now PREMIUM (30 days)!` }, { quoted: msg });
  }

  // ─── REMOVE PREMIUM (Owner only) ───
  if (command === 'delprem' || command === 'removeprem') {
    if (senderNumber !== config.ownerNumber.replace(/[^0-9]/g, '')) {
      return sock.sendMessage(from, { text: '❌ Only the owner can use this command.' }, { quoted: msg });
    }
    const target = args[0]?.replace(/[^0-9]/g, '');
    if (!target || target.length < 5) {
      return sock.sendMessage(from, { text: '❌ Usage: .delprem <number>' }, { quoted: msg });
    }
    delete (db.premiumUsers || {})[target];
    delete (db.premiumExpiry || {})[target];
    savePremiumDB(db);
    return sock.sendMessage(from, { text: `✅ Removed *${target}* from premium.` }, { quoted: msg });
  }

  // ─── LIST PREMIUM (Owner only) ───
  if (command === 'listprem') {
    if (senderNumber !== config.ownerNumber.replace(/[^0-9]/g, '')) {
      return sock.sendMessage(from, { text: '❌ Only the owner can use this command.' }, { quoted: msg });
    }
    const users = Object.keys(db.premiumUsers || {});
    if (users.length === 0) {
      return sock.sendMessage(from, { text: '📋 No premium users yet.' }, { quoted: msg });
    }
    let list = '👑 *Premium Users*\n\n';
    users.forEach((u, i) => {
      const expiry = db.premiumExpiry?.[u] ? new Date(db.premiumExpiry[u]).toLocaleDateString() : 'Lifetime';
      list += `${i + 1}. wa.me/${u} — Exp: ${expiry}\n`;
    });
    return sock.sendMessage(from, { text: list }, { quoted: msg });
  }

  // ─── INFO ───
  if (command === 'info') {
    await sock.sendMessage(from, {
      text: `🤖 *${config.botName}*\n\nVersion: 2.0.0\nOwner: ${config.ownerName}\nAI: Groq ${config.groqModel}\nPremium: .prem ${config.premiumCode}\n\n⚡ Powered by Baileys MD + Groq`,
    }, { quoted: msg });
    return;
  }

  // ─── PING ───
  if (command === 'ping') {
    const start = Date.now();
    await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg });
    const end = Date.now();
    await sock.sendMessage(from, { text: `⚡ Response time: ${end - start}ms` }, { quoted: msg });
    return;
  }

  // ─── UNKNOWN COMMAND ───
  if (text.startsWith(PREFIX) && command) {
    await sock.sendMessage(from, {
      text: `❌ Unknown command: ${PREFIX}${command}\n\nType ${PREFIX}menu to see available commands.`,
    }, { quoted: msg });
  }
}
