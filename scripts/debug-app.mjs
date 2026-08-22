import { spawn } from 'node:child_process';

const root = process.cwd();
const webUrl = process.env.ACRYLIC_WEB_URL ?? 'http://127.0.0.1:5173';
const commandShell = process.platform === 'win32' ? (process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe') : 'npm';
const webArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npm --workspace @acrylic/web run dev -- --host 127.0.0.1 --port 5173']
  : ['--workspace', '@acrylic/web', 'run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'];

const web = spawn(commandShell, webArgs, { cwd: root, stdio: 'inherit', windowsHide: true });
let desktop = null;
let closed = false;

function stop(code = 0) {
  if (closed) return;
  closed = true;
  if (desktop?.pid) desktop.kill();
  if (web.pid) web.kill();
  process.exitCode = code;
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
web.on('exit', (code) => { if (!closed) stop(code ?? 1); });

async function waitForWeb() {
  const started = Date.now();
  while (Date.now() - started < 30_000) {
    try {
      const response = await fetch(webUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Không thể khởi động web tại ${webUrl}.`);
}

try {
  await waitForWeb();
  const desktopArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm --workspace @acrylic/desktop run start']
    : ['--workspace', '@acrylic/desktop', 'run', 'start'];
  desktop = spawn(commandShell, desktopArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ACRYLIC_WEB_URL: webUrl, ACRYLIC_DEBUG: '1' },
    windowsHide: false,
  });
  desktop.on('exit', (code) => stop(code ?? 0));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stop(1);
}
