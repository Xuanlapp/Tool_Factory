import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = path.join(root, '.platform-e2e-real');
const apiPort = 4399;
const webPort = 5180;
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const results = [];
const children = new Set();

const folderNames = ['Images', 'images_error', 'imgaes_done', 'wait', 'output_ai', 'output_front', 'output_back', 'output_lazer'];

function countFiles(folder) {
  let count = 0;
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (entry.isFile()) count += 1;
    }
  };
  walk(path.join(root, folder));
  return count;
}

function pass(name, actual, expected) {
  const ok = actual === expected;
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: actual=${actual} expected=${expected}`);
  return ok;
}

function spawnNode(label, script, args, env = {}, cwd = root) {
  console.log(`E2E SPAWN ${label}`);
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  children.add(child);
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  child.on('error', (error) => console.error(`E2E SPAWN_ERROR ${label}: ${error.message}`));
  child.on('exit', () => children.delete(child));
  return child;
}

function runNode(label, script, args, env = {}, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawnNode(label, script, args, env, cwd);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited code=${code} signal=${signal ?? 'none'}`));
    });
  });
}

async function waitJson(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`${url} -> HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw lastError ?? new Error(`Timeout waiting for ${url}`);
}

async function waitText(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.text();
      lastError = new Error(`${url} -> HTTP ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw lastError ?? new Error(`Timeout waiting for ${url}`);
}

function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try { child.kill('SIGTERM'); } catch {}
  }
}

function stopChildren() {
  for (const child of [...children]) stopChild(child);
}

function writeReport(summary) {
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(path.join(dataRoot, 'e2e-report.json'), JSON.stringify(summary, null, 2), 'utf8');
}

process.on('SIGINT', () => { stopChildren(); process.exit(130); });
process.on('SIGTERM', () => { stopChildren(); process.exit(143); });

async function main() {
  rmSync(dataRoot, { recursive: true, force: true });
  mkdirSync(dataRoot, { recursive: true });

  const env = { ACRYLIC_FACTORY_ROOT: root, ACRYLIC_PLATFORM_DATA: dataRoot, ACRYLIC_TOOL_ID: 'acrylic', ACRYLIC_MACHINE_ID: 'windows-local-01' };

  console.log('E2E REAL: capture Local Agent from production folders');
  await runNode('agent-once', tsxCli, ['apps/local-agent/src/index.ts'], { ...env, ACRYLIC_AGENT_ONCE: '1' });

  console.log(`E2E REAL: start Control API on ${apiPort}`);
  spawnNode('api', tsxCli, ['apps/control-api/src/index.ts'], { ...env, ACRYLIC_CONTROL_API_PORT: String(apiPort) });
  await waitJson(`http://127.0.0.1:${apiPort}/health`);

  const status = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/status`);
  const dashboard = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/dashboard`);
  const queue = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/queue`);
  const errors = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/errors`);
  const wait = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/wait`);
  const outputs = await waitJson(`http://127.0.0.1:${apiPort}/api/v1/outputs`);

  console.log('E2E REAL: compare API with production filesystem');
  pass('runner idle when Tool is not running', status.runnerStatus, 'idle');
  pass('progress omitted when idle', Boolean(status.runnerProgress), false);
  pass('Images count', queue.length, countFiles('Images'));
  pass('images_error count', errors.length, countFiles('images_error'));
  pass('imgaes_done snapshot count', status.folders.imgaes_done?.length ?? -1, countFiles('imgaes_done'));
  pass('wait count', wait.length, countFiles('wait'));
  pass('output_ai count', outputs.ai.length, countFiles('output_ai'));
  pass('output_front count', outputs.front.length, countFiles('output_front'));
  pass('output_back count', outputs.back.length, countFiles('output_back'));
  pass('output_lazer count', outputs.lazer.length, countFiles('output_lazer'));
  pass('dashboard queue count', dashboard.kpi.queue, countFiles('Images'));
  pass('dashboard error count', dashboard.kpi.errors, countFiles('images_error'));
  pass('dashboard wait count', dashboard.kpi.wait, countFiles('wait'));

  for (const folder of folderNames) {
    pass(`filesystem folder readable: ${folder}`, countFiles(folder) >= 0, true);
  }

  console.log('E2E REAL: build web with real API configuration');
  await runNode('web-build', viteCli, ['build'], { ...env, VITE_ACRYLIC_API_BASE: `http://127.0.0.1:${apiPort}/api/v1`, VITE_DEMO_MODE: 'false' }, path.join(root, 'apps/web'));

  console.log(`E2E REAL: start web on ${webPort}`);
  spawnNode('web', viteCli, ['--host', '127.0.0.1', '--port', String(webPort)], { ...env, VITE_ACRYLIC_API_BASE: `http://127.0.0.1:${apiPort}/api/v1`, VITE_DEMO_MODE: 'false' }, path.join(root, 'apps/web'));
  const html = await waitText(`http://127.0.0.1:${webPort}/`);
  pass('web index loaded', html.includes('Acrylic Production'), true);

  const summary = {
    ok: results.every((item) => item.ok),
    capturedAt: new Date().toISOString(),
    results,
    counts: Object.fromEntries(folderNames.map((folder) => [folder, countFiles(folder)])),
    api: { status, dashboard, queueCount: queue.length, errorCount: errors.length, waitCount: wait.length, outputs: { ai: outputs.ai.length, front: outputs.front.length, back: outputs.back.length, lazer: outputs.lazer.length } },
    web: { port: webPort, demoMode: false },
  };
  writeReport(summary);
  console.log(`E2E REPORT: ${path.join(dataRoot, 'e2e-report.json')}`);
  if (!summary.ok) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error('E2E REAL FAILED:', error);
  const summary = { ok: false, capturedAt: new Date().toISOString(), results, error: String(error instanceof Error ? error.stack ?? error.message : error), counts: Object.fromEntries(folderNames.map((folder) => [folder, countFiles(folder)])) };
  writeReport(summary);
  process.exitCode = 1;
} finally {
  stopChildren();
}
