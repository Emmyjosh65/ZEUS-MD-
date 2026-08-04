import config from '../../config.js';
import { isPremium } from '../lib/database.js';

const MENU_CMD = {
  name: 'menu',
  aliases: ['help', 'commands'],
  async run(sock, ctx) {
    const { from, msg, sender } = ctx;
    const prefix = config.prefix;
    const isPremiumUser = isPremium(ctx.senderNumber);

    let menuText = `╔══════════════════╗
║   *${config.botName}*   ║
╚══════════════════╝

👋 Hello!
📅 ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

━━━━━━━━━━━━━━━
📂 *FREE COMMANDS*
━━━━━━━━━━━━━━━
${prefix}menu — Show this menu
${prefix}info — Bot information
${prefix}ping — Check bot speed
${prefix}owner — Contact owner
${prefix}channel — Official channel link
${prefix}premium — Premium info / redeem
${prefix}prem ${config.premiumCode} — Redeem premium code

━━━━━━━━━━━━━━━
💎 *PREMIUM FEATURES* ${isPremiumUser ? '✅' : '🔒'}
━━━━━━━━━━━━━━━
${isPremiumUser ? '✅' : '🔒'} ${prefix}chatbot on — AI Chatbot (Groq)
${isPremiumUser ? '✅' : '🔒'} ${prefix}chatbot off — Disable chatbot
`;

    config.premiumFeatures.forEach((f) => {
      menuText += `${isPremiumUser ? '✅' : '🔒'} ${f}\n`;
    });

    if (!isPremiumUser) {
      menuText += `\n━━━━━━━━━━━━━━━
⬆️ *UPGRADE TO PREMIUM*
━━━━━━━━━━━━━━━
${prefix}prem ${config.premiumCode}
👑 Owner: wa.me/${config.ownerNumber}
`;
    }

    menuText += `\n━━━━━━━━━━━━━━━
⚡ ${config.botName} v${config.version} • Groq AI
📢 Channel: ${config.channelLink}
━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { text: menuText, mentions: [sender] }, { quoted: msg });
  },
};

export default MENU_CMD;
