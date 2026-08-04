import config from '../../config.js';

export function formatNumber(number) {
  return String(number || '').replace(/[^\d]/g, '');
}

export function isOwner(senderNumber) {
  return formatNumber(senderNumber) === formatNumber(config.ownerNumber);
}

export function getTimestamp() {
  return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Extract readable text from any Baileys message type (malformed-safe). */
export function extractText(msg) {
  try {
    const m = msg?.message || {};
    return (
      m.conversation ||
      m.extendedTextMessage?.text ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.buttonsResponseMessage?.selectedButtonId ||
      m.listResponseMessage?.singleSelectReply?.selectedRowId ||
      ''
    ).trim();
  } catch {
    return '';
  }
}
