import config from '../../config.js';

export function formatNumber(number) {
  return number.replace(/[^0-9]/g, '');
}

export function isOwner(senderNumber) {
  return senderNumber === config.ownerNumber.replace(/[^0-9]/g, '');
}

export function getTimestamp() {
  return new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
