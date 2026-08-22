import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const specPath = process.argv[2];
if (!specPath) process.exit(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const writeResult = (status, exitCode, message) => writeFileSync(spec.resultPath, JSON.stringify({ status, exitCode, message, endedAt: new Date().toISOString() }), 'utf8');
const log = (value) => appendFileSync(spec.logPath, String(value), 'utf8');

try {
  const child = spawn(spec.executable, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env ?? {}) },
    windowsHide: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.on('error', (error) => {
    log(`\nRunner lỗi: ${error.message}\n`);
    writeResult('error', null, error.message);
    process.exitCode = 1;
  });
  child.on('close', (code) => {
    log(`\n[RUNNER_DONE] kind=${spec.kind} exit=${code ?? 'UNKNOWN'}\n`);
    writeResult(code === 0 ? 'completed' : 'error', code, '');
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(`\nRunner lỗi: ${message}\n`);
  writeResult('error', null, message);
  process.exitCode = 1;
}

