import config from '../../config.js';
import { commandLoader } from '../core/loader.js';

export const PREFIX = config.prefix;

/**
 * Legacy-compatible dispatcher used by external plugins that call handleCommand().
 * Delegates everything to the central command loader.
 */
export async function handleCommand(sock, msg, text, from, sender, senderNumber, isGroup) {
  if (!text?.startsWith(config.prefix)) return;

  const args = text.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();
  if (!command) return;

  const isOwner = senderNumber === config.ownerNumber;

  const ctx = {
    sock,
    msg,
    from,
    sender,
    senderNumber,
    isGroup,
    isOwner,
    args,
    command,
    prefix: config.prefix,
    text,
  };

  const dispatched = await commandLoader.dispatch(sock, ctx);
  if (!dispatched) {
    await sock.sendMessage(from, {
      text: `❌ Unknown command: ${config.prefix}${command}\n\nType ${config.prefix}menu to see available commands.`,
    }, { quoted: msg }).catch(() => {});
  }
}
