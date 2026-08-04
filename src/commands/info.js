import config from '../../config.js';

const INFO_CMD = {
  name: 'info',
  aliases: ['stats', 'status'],
  async run(sock, ctx) {
    const { from, msg } = ctx;
    await sock.sendMessage(from, {
      text: `🤖 *${config.botName}*\n\nVersion: ${config.version}\nOwner: ${config.ownerName}\nAI: Groq ${config.groqModel}\nPremium: ${config.prefix}prem ${config.premiumCode}\n\n⚡ Powered by Baileys MD + Groq`,
    }, { quoted: msg });
  },
};

export default INFO_CMD;
