import { spawn } from 'node:child_process';

const services = [
  { name: 'agent', color: '\x1b[32m', args: ['--workspace', '@acrylic/local-agent', 'run', 'dev'] },
  { name: 'api', color: '\x1b[36m', args: ['--workspace', '@acrylic/control-api', 'run', 'dev'] },
  { name: 'web', color: '\x1b[35m', args: ['--workspace', '@acrylic/web', 'run', 'dev'] },
];

const reset = '\x1b[0m';
const processes = new Set();
let shuttingDown = false;

function prefixLines(service, chunk, isError = false) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const prefix = `${service.color}[${service.name}]${reset}`;
    (isError ? process.stderr : process.stdout).write(`${prefix} ${line}\n`);
  }
}

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write('\nStopping Acrylic platform services...\n');
  for (const child of processes) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 1200).unref();
}

for (const service of services) {
  const child = spawn('npm.cmd', service.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  processes.add(child);
  child.stdout.on('data', (chunk) => prefixLines(service, chunk));
  child.stderr.on('data', (chunk) => prefixLines(service, chunk, true));
  child.on('exit', (code, signal) => {
    processes.delete(child);
    if (!shuttingDown) {
      process.stderr.write(`${service.color}[${service.name}]${reset} exited with ${signal ?? code}\n`);
      stopAll(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
process.on('uncaughtException', (error) => {
  console.error(error);
  stopAll(1);
});

process.stdout.write('Acrylic platform started in one terminal. Open http://127.0.0.1:5173/\nPress Ctrl+C to stop all services.\n');
