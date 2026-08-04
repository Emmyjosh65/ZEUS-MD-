import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));

const clean = (v) => String(v ?? '').trim();
const digits = (v) => clean(v).replace(/[^\d]/g, '');

const config = {
  botName: clean(process.env.BOT_NAME) || 'ZEUS-MD',
  version: pkg.version,
  ownerName: clean(process.env.OWNER_NAME) || 'ZEUS',
  ownerNumber: digits(process.env.OWNER_NUMBER || '2349066760078'),
  premiumCode: clean(process.env.PREMIUM_CODE) || '200709',
  chatbotName: clean(process.env.CHATBOT_NAME) || 'ZARA',
  groqApiKey: clean(process.env.GROQ_API_KEY),
  groqModel: clean(process.env.GROQ_MODEL) || 'llama-3.3-70b-versatile',
  prefix: clean(process.env.PREFIX) || '.',
  phoneNumber: digits(process.env.PHONE_NUMBER),
  port: parseInt(process.env.PORT || '2091', 10),
  hotReload: process.env.HOT_RELOAD !== 'false',
  sessionDir: path.join(__dirname, 'sessions'),

  premiumFeatures: [
    '🤖 AI Chatbot (powered by Groq LLama 3.3)',
    '🚫 Anti-link protection',
    '🎨 Custom sticker maker',
    '📥 All downloaders (YT, IG, TikTok)',
    '📊 XP & Level system',
    '🛡️ Group anti-features',
    '⚡ Faster command processing',
    '🔓 Unlimited command usage per day',
    '👑 Priority support from owner',
    '🎁 Exclusive premium group access',
  ],

  freeFeatures: [
    '📝 Basic commands (menu, info)',
    '👋 Welcome messages',
    '🔍 Search tools',
    '🎭 Fun commands',
    '📢 Broadcast (group only)',
    '📊 Group stats',
  ],
};

// ─── Validation (clear messages, fail fast only on hard requirements) ───
const problems = [];
if (!config.ownerNumber) problems.push('❌ OWNER_NUMBER is missing or invalid (digits only).');
if (Number.isNaN(config.port)) problems.push('❌ PORT must be a number.');
if (config.prefix.length !== 1) problems.push('❌ PREFIX must be a single character.');
if (problems.length) {
  console.error('\n'.repeat(2));
  problems.forEach((p) => console.error(p));
  console.error('\n📌 Copy .env.example to .env and set the required values, then restart.\n');
  process.exit(1);
}
if (!config.groqApiKey) {
  console.warn('⚠️  GROQ_API_KEY not set — chatbot will reply with a setup notice (bot still works).');
}

export default config;
