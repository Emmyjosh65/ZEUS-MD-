import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

class CommandLoader {
  constructor() {
    this.commands = new Map();
    this.config = null;
    this.watcher = null;
  }

  async init(config) {
    this.config = config;
    return this.load();
  }

  /** Load all command files. A broken plugin is skipped — never stops the bot. */
  async load() {
    const files = fs
      .readdirSync(COMMANDS_DIR)
      .filter((f) => f.endsWith('.js') && f !== 'handler.js');

    const next = new Map();
    let ok = 0;
    let fail = 0;

    for (const f of files) {
      try {
        const url = `${pathToFileURL(path.join(COMMANDS_DIR, f)).href}?t=${Date.now()}`;
        const mod = await import(url);
        const defs = Array.isArray(mod.default) ? mod.default : [mod.default];
        for (const cmd of defs) {
          if (!cmd || typeof cmd.run !== 'function' || !cmd.name) {
            throw new Error(`${f}: missing "name" or "run"`);
          }
          next.set(cmd.name, cmd);
          (cmd.aliases || []).forEach((a) => next.set(a, cmd));
          ok++;
        }
      } catch (e) {
        fail++;
        console.error(`⚠️ Failed to load ${f}: ${e.message}`);
      }
    }

    this.commands = next;
    console.log(`📦 Loaded ${ok} commands | Failed ${fail}`);
    return { ok, fail };
  }

  /** Hot reload: watch command files and re-import on change (no bot restart). */
  watch() {
    if (!this.config?.hotReload) return;
    try {
      this.watcher = fs.watch(COMMANDS_DIR, async (_evt, filename) => {
        if (!filename?.endsWith('.js') || filename === 'handler.js') return;
        console.log(`🔄 Hot reload: ${filename} changed. Reloading commands...`);
        await this.load();
      });
    } catch (e) {
      console.warn('⚠️ Hot reload unavailable:', e.message);
    }
  }

  stop() {
    try { this.watcher?.close(); } catch {}
    this.watcher = null;
  }

  /** Route a command with owner-only enforcement + per-command error isolation. */
  async dispatch(sock, ctx) {
    const cmd = this.commands.get(ctx.command);
    if (!cmd) return false;

    if (cmd.ownerOnly && !ctx.isOwner) {
      await sock
        .sendMessage(ctx.from, { text: '❌ This command is restricted to the bot owner.' }, { quoted: ctx.msg })
        .catch(() => {});
      return true;
    }

    try {
      await cmd.run(sock, ctx);
    } catch (e) {
      console.error(`❌ Command "${ctx.command}" error:`, e?.stack || e?.message);
      await sock
        .sendMessage(ctx.from, { text: '⚠️ An error occurred while running that command.' }, { quoted: ctx.msg })
        .catch(() => {});
    }
    return true;
  }
}

export const commandLoader = new CommandLoader();
