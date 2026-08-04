import config from '../../config.js';
import { getDB, saveDB, isPremium } from '../lib/database.js';

const CHATBOT_CMD = {
  name: 'chatbot',
  aliases: ['ai', 'zara'],
  async run(sock, ctx) {
    const { from, msg, args, senderNumber } = ctx;
    const db = getDB();

    if (!args.length || !['on', 'off'].includes(args[0].toLowerCase())) {
      return sock.sendMessage(from, {
        text: `🤖 *${config.chatbotName} Chatbot*\n\nUsage:\n${config.prefix}chatbot on — Enable Groq AI chatbot\n${config.prefix}chatbot off — Disable chatbot\n\n⚠️ *PREMIUM FEATURE*`,
      }, { quoted: msg });
    }

    const action = args[0].toLowerCase();

    if (action === 'on') {
      if (!isPremium(senderNumber)) {
        return sock.sendMessage(from, {
          text: `⚠️ *PREMIUM FEATURE*\n\nThe ${config.chatbotName} Chatbot (powered by Groq) is *PREMIUM ONLY*.\n\n💎 Get premium:\n${config.prefix}prem ${config.premiumCode}\n👑 wa.me/${config.ownerNumber}`,
        }, { quoted: msg });
      }
      if (!config.groqApiKey) {
        return sock.sendMessage(from, {
          text: `⚠️ Groq API key is not set. Contact the owner to enable the chatbot.`,
        }, { quoted: msg });
      }

      db.chatbotUsers = db.chatbotUsers || {};
      db.chatbotUsers[senderNumber] = true;
      saveDB(db);

      return sock.sendMessage(from, {
        text: `🤖 *${config.chatbotName} Activated!*\n\n✅ Groq AI Chatbot is now ON.\n\nSimply send any message and ${config.chatbotName} (powered by Llama 3.3) will reply!\n\n💎 Premium feature active.`,
      }, { quoted: msg });
    }

    if (action === 'off') {
      db.chatbotUsers = db.chatbotUsers || {};
      delete db.chatbotUsers[senderNumber];
      saveDB(db);

      return sock.sendMessage(from, {
        text: `🤖 *${config.chatbotName} Deactivated*\n\n✅ Chatbot is OFF.\n\nType ${config.prefix}chatbot on to re-enable.`,
      }, { quoted: msg });
    }
  },
};

export default CHATBOT_CMD;
