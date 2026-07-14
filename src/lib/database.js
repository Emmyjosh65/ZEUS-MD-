import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'premium.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadPremiumDB() {
  ensureDir();
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) { console.error('⚠️ DB load error:', e.message); }
  return { premiumUsers: {}, premiumExpiry: {}, chatbotUsers: {} };
}

export function savePremiumDB(db) {
  ensureDir();
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
  catch (e) { console.error('⚠️ DB save error:', e.message); }
}

export function isPremium(senderNumber) {
  const db = loadPremiumDB();
  if (!db.premiumUsers?.[senderNumber]) return false;
  if (db.premiumExpiry?.[senderNumber] && Date.now() > db.premiumExpiry[senderNumber]) {
    delete db.premiumUsers[senderNumber];
    delete db.premiumExpiry[senderNumber];
    savePremiumDB(db);
    return false;
  }
  return true;
}
