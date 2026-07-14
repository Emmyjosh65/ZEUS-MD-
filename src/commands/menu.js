import config from '../../config.js';

export async function menu(sock, msg, from, sender, senderNumber, isPremiumUser) {
  const prefix = config.prefix;

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
${prefix}premium — Premium info / redeem
${prefix}prem <code> — Redeem premium code

━━━━━━━━━━━━━━━
💎 *PREMIUM FEATURES* ${isPremiumUser ? '✅' : '🔒'}
━━━━━━━━━━━━━━━
${isPremiumUser ? '✅' : '🔒'} ${prefix}chatbot on — AI Chatbot (Groq)
${isPremiumUser ? '✅' : '🔒'} ${prefix}chatbot off — Disable chatbot
`;

  config.premiumFeatures.forEach(f => {
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
⚡ ${config.botName} v2.0 • Groq AI
━━━━━━━━━━━━━━━`;

  await sock.sendMessage(from, {
    text: menuText,
    mentions: [sender],
  }, { quoted: msg });
}
