import config from '../../config.js';

const OWNER_CMD = {
  name: 'owner',
  aliases: ['contact', 'creator'],
  async run(sock, ctx) {
    const { from, msg } = ctx;
    await sock.sendMessage(from, {
      text: `👑 *${config.botName} Owner*\n\nName: ${config.ownerName}\nWhatsApp: wa.me/${config.ownerNumber}\n\n💎 *Get Premium:*\n${config.prefix}prem ${config.premiumCode}\nOr contact the owner directly.`,
    }, { quoted: msg });
  },
};

export default OWNER_CMD;
