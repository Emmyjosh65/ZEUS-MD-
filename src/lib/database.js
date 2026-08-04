import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to ROOT/data/premium.json
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'premium.json');

let cache = null;

export function getDB() {
  if (cache) return cache;
  try {
    if (fs.existsSync(DB_PATH)) {
      cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('⚠️ DB load error:', e.message);
  }
  cache = { premiumUsers: {}, premiumExpiry: {}, chatbotUsers: {}, ...(cache || {}) };
  return cache;
}

export function saveDB(db = cache) {
  cache = db || cache;
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    return true;
  } catch (e) {
    console.error('⚠️ DB save error:', e.message);
    return false;
  }
}

export function isPremium(senderNumber) {
  const db = getDB();
  if (!db.premiumUsers?.[senderNumber]) return false;
  if (db.premiumExpiry?.[senderNumber] && Date.now() > db.premiumExpiry[senderNumber]) {
    delete db.premiumUsers[senderNumber];
    delete db.premiumExpiry[senderNumber];
    saveDB(db);
    return false;
  }
  return true;
}
