import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const specPath = process.argv[2];
if (!specPath) process.exit(2);
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const writeResult = (status, exitCode, message) => writeFileSync(spec.resultPath, JSON.stringify({ status, exitCode, message, endedAt: new Date().toISOString() }), 'utf8');
function repairMojibake(value) {
  const text = String(value);
  if (!/[ÂÃÆáàảãạằắẳẵặầấẩẫậèéẻẽẹìíỉĩịòóỏõọùúủũụỳýỷỹỵĐđ]/.test(text)) return text;
  try {
    const cp1252 = new Map([[0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]]);
    const bytes = [];
    for (const character of text) {
      const code = character.codePointAt(0) ?? 0;
      if (code <= 0xff) bytes.push(code);
      else if (cp1252.has(code)) bytes.push(cp1252.get(code));
      else return text;
    }
    const repaired = Buffer.from(bytes).toString('utf8');
    return repaired.includes('�') ? text : repaired;
  } catch {
    return text;
  }
}
const log = (value) => appendFileSync(spec.logPath, repairMojibake(value), 'utf8');

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

