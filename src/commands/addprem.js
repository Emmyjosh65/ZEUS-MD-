import config from '../../config.js';
import { getDB, saveDB } from '../lib/database.js';

const ADDPREM_CMD = {
  name: 'addprem',
  aliases: ['giveprem'],
  ownerOnly: true,
  async run(sock, ctx) {
    const { from, msg, args } = ctx;
    const target = args[0]?.replace(/[^\d]/g, '');
    if (!target || target.length < 5) {
      return sock.sendMessage(from, {
        text: `❌ Usage: ${config.prefix}addprem <number>\nExample: ${config.prefix}addprem 2348123456789`,
      }, { quoted: msg });
    }

    const db = getDB();
    db.premiumUsers = db.premiumUsers || {};
    db.premiumExpiry = db.premiumExpiry || {};
    db.premiumUsers[target] = true;
    db.premiumExpiry[target] = Date.now() + 30 * 24 * 60 * 60 * 1000;
    saveDB(db);

    return sock.sendMessage(from, { text: `✅ *${target}* is now PREMIUM (30 days)!` }, { quoted: msg });
  },
};

export default ADDPREM_CMD;
