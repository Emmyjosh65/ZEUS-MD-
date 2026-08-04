import fs from 'fs';
import path from 'path';

/** Create sessions/ folder. If it exists as a FILE, delete it and make a folder. */
export function ensureSessionDir(dir) {
  if (fs.existsSync(dir)) {
    const st = fs.statSync(dir);
    if (st.isDirectory()) return;
    console.warn('⚠️ "sessions" is a file. Removing and creating a folder...');
    fs.rmSync(dir, { force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

/** Remove ONLY corrupted JSON session files; leave valid ones untouched. Returns count removed. */
export function quarantineCorruptSession(dir) {
  let removed = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      try {
        JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch {
        console.warn(`🧹 Removing corrupted session file: ${f}`);
        fs.rmSync(p, { force: true });
        removed++;
      }
    }
  } catch { /* dir may not exist yet */ }
  return removed;
}

/** Wipe all sessions (logout / corruption) and recreate empty folder. */
export function clearSessions(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(dir, { recursive: true });
}
