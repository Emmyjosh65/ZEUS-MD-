import 'dotenv/config';
import http from 'http';
import config from './config.js';

// ─── Health check server (keeps Pterodactyl/Render/Railway happy) ───
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ZEUS-MD Bot is running\n');
}).listen(config.port, () => {
  console.log(`🌐 Health check server listening on port ${config.port}`);
});

// ─── Start the bot ───
import('./src/core/bot.js')
  .then(({ botController }) => botController.init())
  .catch((err) => {
    console.error('❌ Fatal startup error:', err?.stack || err);
    process.exit(1);
  });
