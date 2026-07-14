import config from '../../config.js';
import { loadPremiumDB, savePremiumDB, isPremium } from '../lib/database.js';

export async function premium(sock, msg, args, from, senderNumber) {
  const db = loadPremiumDB();

  if (!args.length) {
    let text = `💎 *${config.botName} PREMIUM*\n\n`;
    text += `🔑 *Code:* ${config.premiumCode}\n\n`;
    text += `*How to activate:*\n${config.prefix}prem ${config.premiumCode}\n\n`;
    text += `*Premium Features:*\n`;
    config.premiumFeatures.forEach(f => { text += `✅ ${f}\n`; });
    text += `\n👑 Contact: wa.me/${config.ownerNumber}`;
    return sock.sendMessage(from, { text }, { quoted: msg });
  }

  const code = args[0];

  if (code === config.premiumCode) {
    if (isPremium(senderNumber)) {
      return sock.sendMessage(from, {
        text: `✅ You already have PREMIUM access!\n${config.prefix}menu to see your features.`,
      }, { quoted: msg });
    }

    db.premiumUsers = db.premiumUsers || {};
    db.premiumUsers[senderNumber] = true;
    db.premiumExpiry = db.premiumExpiry || {};
    db.premiumExpiry[senderNumber] = Date.now() + 365 * 24 * 60 * 60 * 1000;
    savePremiumDB(db);

    return sock.sendMessage(from, {
      text: `🎉 *CONGRATULATIONS!*\n\n✅ You are now *PREMIUM*!\n\n💎 *Your Benefits:*\n${config.premiumFeatures.map(f => `✅ ${f}`).join('\n')}\n\n👑 Owner: wa.me/${config.ownerNumber}\n\n${config.prefix}menu to see all commands.`,
    }, { quoted: msg });
  }

  return sock.sendMessage(from, {
    text: `❌ Invalid code.\n\n🔑 Correct: ${config.premiumCode}\n👑 Owner: wa.me/${config.ownerNumber}`,
  }, { quoted: msg });
}
