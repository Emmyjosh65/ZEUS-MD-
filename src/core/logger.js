import os from 'os';

const startTime = Date.now();
let statsTimer = null;

export function banner(config, extra = {}) {
  const line = '═'.repeat(44);
  console.log(`\n${line}`);
  console.log(`  🤖  ${config.botName}   v${config.version}`);
  console.log(line);
  console.log(`  Baileys  : ${extra.baileys || 'unknown'}`);
  console.log(`  Node     : ${process.version}`);
  console.log(`  Platform : ${process.platform} ${os.arch()}`);
  console.log(`  Owner    : ${config.ownerName} (wa.me/${config.ownerNumber})`);
  console.log(`  Session  : ${config.sessionDir}`);
  console.log(`${line}\n`);
}

export function getStats() {
  const mem = process.memoryUsage();
  const s = Math.floor((Date.now() - startTime) / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return {
    ram: `${(mem.rss / 1024 / 1024).toFixed(1)} MB`,
    heap: `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
    cpu: os.loadavg()[0].toFixed(2),
    uptime: `${hh}:${mm}:${ss}`,
  };
}

export function printStats() {
  const s = getStats();
  console.log('┌──────────── SYSTEM ────────────┐');
  console.log(`│ RAM     : ${s.ram.padEnd(22)}│`);
  console.log(`│ Heap    : ${s.heap.padEnd(22)}│`);
  console.log(`│ CPU Ld  : ${s.cpu.padEnd(22)}│`);
  console.log(`│ Uptime  : ${s.uptime.padEnd(22)}│`);
  console.log('└────────────────────────────────┘');
}

export function startStats() {
  if (statsTimer) return;
  statsTimer = setInterval(() => {
    const s = getStats();
    console.log(`📊 RAM ${s.ram} | Heap ${s.heap} | CPU Load ${s.cpu} | Uptime ${s.uptime}`);
  }, 30000);
  statsTimer.unref?.();
}

export function stopStats() {
  clearInterval(statsTimer);
  statsTimer = null;
}
