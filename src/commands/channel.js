import config from '../../config.js';

const CHANNEL_CMD = {
  name: 'channel',
  aliases: ['chan', 'newsletter', 'joinchannel'],
  async run(sock, ctx) {
    const { from, msg } = ctx;
    const link = config.channelLink || 'Not configured yet.';
    await sock.sendMessage(from, {
      text: `📢 *${config.botName} Official Channel*\n\n📡 *ZEUS TIER'S* on WhatsApp:\n${link}\n\n👑 Join for updates, giveaways & more!`,
    }, { quoted: msg });
  },
};

export default CHANNEL_CMD;
