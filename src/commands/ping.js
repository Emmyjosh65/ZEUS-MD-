const PING_CMD = {
  name: 'ping',
  aliases: ['p', 'speed'],
  async run(sock, ctx) {
    const { from, msg } = ctx;
    const start = Date.now();
    await sock.sendMessage(from, { text: '🏓 Pong!' }, { quoted: msg });
    await sock.sendMessage(from, { text: `⚡ Response time: ${Date.now() - start}ms` }, { quoted: msg });
  },
};

export default PING_CMD;
