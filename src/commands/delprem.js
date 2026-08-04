import config from '../../config.js';
import { getDB, saveDB } from '../lib/database.js';

const DELPREM_CMD = {
  name: 'delprem',
  aliases: ['removeprem'],
  ownerOnly: true,
  async run(sock, ctx) {
    const { from, msg, args } = ctx;
    const target = args[0]?.replace(/[^\d]/g, '');
    if (!target || target.length < 5) {
      return sock.sendMessage(from, {
        text: `❌ Usage: ${config.prefix}delprem <number>\nExample: ${config.prefix}delprem 2348123456789`,
      }, { quoted: msg });
    }

    const db = getDB();
    delete (db.premiumUsers || {})[target];
    delete (db.premiumExpiry || {})[target];
    saveDB(db);

    return sock.sendMessage(from, {
      text: `✅ Removed *${target}* from premium.`,
    }, { quoted: msg });
  },
};

export default DELPREM_CMD;
