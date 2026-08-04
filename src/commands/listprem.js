import config from '../../config.js';
import { getDB } from '../lib/database.js';

const LISTPREM_CMD = {
  name: 'listprem',
  aliases: ['premlist'],
  ownerOnly: true,
  async run(sock, ctx) {
    const { from, msg } = ctx;
    const db = getDB();
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
  },
};

export default LISTPREM_CMD;
