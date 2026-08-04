import readline from 'readline';
import qrcode from 'qrcode-terminal';

export function sanitizePhone(input = '') {
  return String(input).replace(/[^\d]/g, '');
}

export function isValidPhone(phone = '') {
  return /^\d{7,15}$/.test(phone);
}

/** Interactive prompt (TTY only: VPS/Termux/Windows). Loops until valid. */
export function askPhoneNumber() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = () => {
      rl.question('📱 Enter WhatsApp number (international format, no +/spaces, e.g. 2349066760078): ', (answer) => {
        const phone = sanitizePhone(answer);
        if (isValidPhone(phone)) {
          rl.close();
          return resolve(phone);
        }
        console.log('❌ Invalid number. Use country code + number, digits only (7–15 digits).');
        ask();
      });
    };
    ask();
  });
}

export function printPairingCode(code = '') {
  const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
  console.log('\n┌──────────────────────────────┐');
  console.log('│        PAIRING CODE         │');
  console.log('└──────────────────────────────┘');
  console.log(`\n        ${pretty}\n`);
  console.log('📲 Open WhatsApp on your phone');
  console.log('⚙️  Settings → Linked Devices');
  console.log('🔗 Link with Phone Number');
  console.log('⌨️  Enter the pairing code shown above');
}

export function printQR(qr) {
  qrcode.generate(qr, { small: true });
  console.log('\n📲 Scan the QR above with WhatsApp → Linked Devices → Link a Device');
}
