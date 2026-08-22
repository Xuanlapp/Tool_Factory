import { execFileSync } from 'node:child_process';

const ports = process.argv.slice(2).map(Number).filter(Boolean);
const targetPorts = ports.length ? ports : [4320, 5173];
const currentPid = process.pid;

function listListeningPids(port) {
  const output = execFileSync('netstat.exe', ['-ano', '-p', 'tcp'], { encoding: 'utf8' });
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const normalized = line.trim().replace(/\s+/g, ' ');
    if (!normalized.startsWith('TCP ')) continue;
    const parts = normalized.split(' ');
    const localAddress = parts[1] ?? '';
    const state = parts[3] ?? '';
    const pid = Number(parts[4]);
    if (!Number.isFinite(pid) || pid === currentPid) continue;
    if (state !== 'LISTENING') continue;
    if (localAddress.endsWith(`:${port}`)) pids.add(pid);
  }
  return [...pids];
}

for (const port of targetPorts) {
  const pids = listListeningPids(port);
  if (!pids.length) {
    console.log(`[dev:preflight] port ${port} is free`);
    continue;
  }
  for (const pid of pids) {
    try {
      execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      console.log(`[dev:preflight] stopped stale process PID ${pid} on port ${port}`);
    } catch (error) {
      console.warn(`[dev:preflight] could not stop PID ${pid} on port ${port}: ${error.message}`);
    }
  }
}
