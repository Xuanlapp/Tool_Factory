import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

type FileEntry = { path: string; relativePath: string; name: string; sizeBytes: number; modifiedAt: string; errorMeta?: Record<string, unknown>; waitManifest?: Record<string, unknown> };
type RunnerStatus = 'idle' | 'running' | 'error';
type ToolCommand = 'start' | 'error' | 'check';
type ExportAssetKind = 'front' | 'back' | 'lazer';
type RunKind = 'tool' | 'export' | 'setup';
type ToolStep = { index: number; total: number; step: string; fileName: string; status: 'running' | 'success' | 'error'; message: string };
type ToolRun = { id: string; kind: RunKind; runnerPid?: number; logPath?: string; resultPath?: string; logOffset?: number; command: ToolCommand; status: RunnerStatus | 'completed'; startedAt: string; endedAt?: string; exitCode?: number | null; logs: string[]; steps?: ToolStep[]; currentStep?: ToolStep | null; lastLogAt?: string; stopping?: boolean; exportAssets?: ExportAssetKind[]; outputAiRelativePath?: string };
type FolderHealth = { reachable: boolean; network: boolean; mappedDrive?: string; uncResolved?: boolean; warning?: string };
type NormalizedFolderPath = { inputPath: string; normalizedPath: string; network: boolean; mappedDrive?: string; uncResolved: boolean; warning?: string };
type Snapshot = {
  toolId: string;
  machineId: string;
  capturedAt: string;
  runnerStatus: RunnerStatus;
  illustratorConnected: false;
  folders: Record<string, FileEntry[]>;
  folderPaths: Record<string, string>;
  folderHealth: Record<string, FolderHealth>;
  folderPathWarnings: Record<string, string>;
  runnerProgress?: { imageBaseName: string; index: number; total: number };
};

const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT ?? 'D:/FFACTORY/Arcylic';
const appRoot = process.env.ACRYLIC_APP_ROOT ?? factoryRoot;
const currentSetupVersion = '2026-08-22.1';
const toolDir = path.join(appRoot, 'Tool');
const toolStatePath = path.join(factoryRoot, '.runtime', 'tool-ui-state.json');
const operationRuntimeDir = path.join(factoryRoot, '.runtime', 'operations');
const operationRunnerPath = path.join(appRoot, 'scripts', 'tool-operation-runner.mjs');
const folderSettingsPath = path.join(factoryRoot, '.runtime', 'folder-settings.json');
const defaultFolderPaths: Record<string, string> = {
  Images: path.join(factoryRoot, 'Images'),
  images_error: path.join(factoryRoot, 'images_error'),
  images_processed: path.join(factoryRoot, 'images_processed'),
  imgaes_done: path.join(factoryRoot, 'imgaes_done'),
  wait: path.join(factoryRoot, 'wait'),
  output_ai: path.join(factoryRoot, 'output_ai'),
  output_front: path.join(factoryRoot, 'output_front'),
  output_back: path.join(factoryRoot, 'output_back'),
  output_lazer: path.join(factoryRoot, 'output_lazer'),
  template: path.join(factoryRoot, 'template'),
};
function loadFolderPaths(): Record<string, string> { try { const saved = JSON.parse(readFileSync(folderSettingsPath, 'utf8')) as Record<string, string>; return { ...defaultFolderPaths, ...saved }; } catch { return { ...defaultFolderPaths }; } }
function saveFolderPaths(next: Record<string, string>) { mkdirSync(path.dirname(folderSettingsPath), { recursive: true }); writeFileSync(folderSettingsPath, JSON.stringify(next, null, 2), 'utf8'); }
function isUncPath(value: string) { return /^\\\\[^\\]+\\[^\\]+/.test(value.trim()); }
function mappedDriveOf(value: string) { return value.trim().match(/^([A-Za-z]:)(?:[\\/]|$)/)?.[1].toUpperCase(); }
function normalizePathSlashes(value: string) { return value.trim().replace(/[\\/]+/g, path.sep); }
function resolveMappedDriveRemote(localDrive: string): string | null {
  if (process.platform !== 'win32') return null;
  const drive = localDrive.toUpperCase();
  try {
    const ps = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `(Get-SmbMapping -LocalPath '${drive}' -ErrorAction SilentlyContinue).RemotePath`], { encoding: 'utf8', windowsHide: true });
    const output = String(ps.stdout ?? '').trim().split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (output?.startsWith('\\')) return output.replace(/[\\/]+$/, '');
  } catch {}
  try {
    const cmd = spawnSync(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', `net use ${drive}`], { encoding: 'utf8', windowsHide: true });
    const output = `${cmd.stdout ?? ''}\n${cmd.stderr ?? ''}`;
    const remoteLine = output.split(/\r?\n/).find((line) => /Remote name/i.test(line) || /Tên từ xa/i.test(line));
    const remote = remoteLine?.match(/\\\\\S+/)?.[0];
    if (remote) return remote.replace(/[\\/]+$/, '');
  } catch {}
  try {
    const letter = drive.slice(0, 1);
    const reg = spawnSync(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', `reg query HKCU\\Network\\${letter} /v RemotePath`], { encoding: 'utf8', windowsHide: true });
    const remote = String(reg.stdout ?? '').match(/RemotePath\s+REG_SZ\s+(\\\\\S+)/i)?.[1];
    if (remote) return remote.replace(/[\\/]+$/, '');
  } catch {}
  return null;
}
function normalizeFolderPath(inputPath: string): NormalizedFolderPath {
  const trimmed = inputPath.trim();
  if (!trimmed) return { inputPath, normalizedPath: trimmed, network: false, uncResolved: false, warning: 'Đường dẫn thư mục đang trống.' };
  if (isUncPath(trimmed)) return { inputPath, normalizedPath: trimmed, network: true, uncResolved: true };
  const mappedDrive = mappedDriveOf(trimmed);
  if (!mappedDrive) return { inputPath, normalizedPath: normalizePathSlashes(trimmed), network: false, uncResolved: false };
  const remote = resolveMappedDriveRemote(mappedDrive);
  if (!remote) return { inputPath, normalizedPath: normalizePathSlashes(trimmed), network: true, mappedDrive, uncResolved: false, warning: `Ổ mạng ${mappedDrive} chưa kết nối hoặc chưa đọc được mapping NAS. Hãy kiểm tra kết nối NAS và Windows Credential Manager.` };
  const rest = trimmed.slice(mappedDrive.length).replace(/^[\\/]+/, '');
  return { inputPath, normalizedPath: rest ? path.win32.join(remote, rest) : remote, network: true, mappedDrive, uncResolved: true };
}
function canAccessFolder(folder: string): FolderHealth {
  const normalized = normalizeFolderPath(folder);
  const target = normalized.normalizedPath || folder;
  try {
    mkdirSync(target, { recursive: true });
    fs.accessSync(target, fs.constants.R_OK);
    return { reachable: true, network: normalized.network, mappedDrive: normalized.mappedDrive, uncResolved: normalized.uncResolved, warning: normalized.warning };
  } catch (error) {
    const message = normalized.warning ?? `Không đọc được thư mục: ${error instanceof Error ? error.message : 'không rõ lỗi'}`;
    return { reachable: false, network: normalized.network || isUncPath(target), mappedDrive: normalized.mappedDrive, uncResolved: normalized.uncResolved, warning: message };
  }
}
function normalizeSavedFolderPaths(paths: Record<string, string>) {
  const normalizedPaths = { ...paths };
  const warnings: Record<string, string> = {};
  let changed = false;
  for (const [key, value] of Object.entries(paths)) {
    const normalized = normalizeFolderPath(value);
    if (normalized.warning) warnings[key] = normalized.warning;
    if (normalized.uncResolved && normalized.normalizedPath && normalized.normalizedPath !== value) { normalizedPaths[key] = normalized.normalizedPath; changed = true; }
  }
  return { normalizedPaths, warnings, changed };
}
const initialFolderNormalization = normalizeSavedFolderPaths(loadFolderPaths());
let folderPaths = initialFolderNormalization.normalizedPaths;
let folderPathWarnings: Record<string, string> = initialFolderNormalization.warnings;
if (initialFolderNormalization.changed) saveFolderPaths(folderPaths);

let activeChild: ChildProcess | null = null;
let activeRun: ToolRun | null = null;
const toolEventClients = new Set<import('node:http').ServerResponse>();
const logLimit = 2000;

function moveFolderContents(fromDir: string, toDir: string) {
  mkdirSync(toDir, { recursive: true });
  if (!existsSync(fromDir)) return;
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const source = path.join(fromDir, entry.name);
    const target = path.join(toDir, entry.name);
    if (entry.isDirectory()) { moveFolderContents(source, target); try { fs.rmSync(source, { recursive: true, force: true }); } catch {} continue; }
    try { renameSync(source, target); } catch { fs.copyFileSync(source, target); fs.rmSync(source, { force: true }); }
  }
}

function resolveFileInside(root: string, relativePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(resolvedRoot, relativePath);
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(resolvedRoot + path.sep)) throw new Error('ÄÆ°á»ng dáº«n file khÃ´ng há»£p lá»‡.');
  return resolvedFile;
}

function moveErrorToProcessed(relativePath: string) {
  const sourceRoot = folderPaths.images_error;
  const targetRoot = folderPaths.images_processed;
  const source = resolveFileInside(sourceRoot, relativePath);
  if (!existsSync(source) || !fs.statSync(source).isFile()) throw new Error('KhÃ´ng tÃ¬m tháº¥y áº£nh lá»—i cáº§n xá»­ lÃ½.');
  const target = resolveFileInside(targetRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  let finalTarget = target;
  if (existsSync(finalTarget)) {
    const extension = path.extname(target);
    const baseName = target.slice(0, -extension.length);
    let duplicateIndex = 2;
    while (existsSync(`${baseName}_dup${duplicateIndex}${extension}`)) duplicateIndex += 1;
    finalTarget = `${baseName}_dup${duplicateIndex}${extension}`;
  }
  try { renameSync(source, finalTarget); } catch { fs.copyFileSync(source, finalTarget); fs.rmSync(source, { force: true }); }

  const sourceMetadataPath = path.join(sourceRoot, '.error-metadata.json');
  const targetMetadataPath = path.join(targetRoot, '.error-metadata.json');
  try {
    const sourceMetadata = JSON.parse(readFileSync(sourceMetadataPath, 'utf8')) as Record<string, Record<string, unknown>>;
    const metadata = sourceMetadata[path.basename(relativePath)];
    if (metadata) {
      let targetMetadata: Record<string, Record<string, unknown>> = {};
      try { targetMetadata = JSON.parse(readFileSync(targetMetadataPath, 'utf8')) as Record<string, Record<string, unknown>>; } catch {}
      targetMetadata[path.basename(finalTarget)] = { ...metadata, processedAt: new Date().toISOString() };
      writeFileSync(targetMetadataPath, JSON.stringify(targetMetadata, null, 2), 'utf8');
      delete sourceMetadata[path.basename(relativePath)];
      writeFileSync(sourceMetadataPath, JSON.stringify(sourceMetadata, null, 2), 'utf8');
    }
  } catch {}

  cachedSnapshot = null;
  cacheExpiresAt = 0;
  return path.relative(targetRoot, finalTarget);
}

function persistToolState() {
  try {
    mkdirSync(path.dirname(toolStatePath), { recursive: true });
    writeFileSync(toolStatePath, JSON.stringify({ run: activeRun }, null, 2), 'utf8');
  } catch {}
}

function restoreToolState() {
  try {
    if (!existsSync(toolStatePath)) return;
    const saved = JSON.parse(readFileSync(toolStatePath, 'utf8')) as { run?: ToolRun | null };
    if (!saved.run) return;
    activeRun = saved.run;
    if (!activeRun.kind) activeRun.kind = 'tool';
    if (activeRun.status === 'running') {
      activeRun.logs.push('App server ?? kh?i ??ng l?i; ?ang k?t n?i l?i ti?n tr?nh n?n...');
      activeRun.lastLogAt = new Date().toISOString();
    }
  } catch {}
}

restoreToolState();

function broadcastToolStatus() {
  persistToolState();
  const payload = `event: tool\ndata: ${JSON.stringify(toolStatus())}\n\n`;
  for (const client of toolEventClients) client.write(payload);
}

function appendLog(text: string) {
  if (!activeRun) return;
  for (const line of text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!line) continue;
    if (activeRun.stopping && /^\[\d+\/\d+\]\s+/.test(line)) continue;
    activeRun.logs.push(line);
    activeRun.lastLogAt = new Date().toISOString();
  }
  if (activeRun.logs.length > logLimit) activeRun.logs.splice(0, activeRun.logs.length - logLimit);
  broadcastToolStatus();
}

function parseToolSteps(logs: string[], runStatus: ToolRun['status'] = 'running'): ToolStep[] {
  const steps: ToolStep[] = [];
  for (const line of logs) {
    const match = line.match(/^\[(\d+)\/(\d+)\]\s+([A-Z_]+):\s+(.+?)(?:\s+\((.+)\))?$/);
    if (!match) continue;
    const step = match[3];
    steps.push({ index: Number(match[1]), total: Number(match[2]), step, fileName: match[4], status: runStatus === 'completed' ? 'success' : runStatus === 'error' ? 'error' : 'running', message: match[5] ?? line });
  }
  const recent = steps.slice(-120);
  const last = recent.at(-1);
  if (last && runStatus === 'running' && !last.step.includes('READY') && !last.step.includes('TRUE') && !last.step.includes('DONE') && !last.step.includes('ERROR') && !last.step.includes('FALSE')) last.status = 'running';
  return recent;
}

function enrichRun(run: ToolRun | null) {
  if (!run) return null;
  const steps = parseToolSteps(run.logs, run.status);
  const currentStep = steps.at(-1) ?? null;
  run.steps = steps;
  run.currentStep = currentStep;
  return run;
}

function killProcessTree(child: ChildProcess | null, pid?: number) {
  const targetPid = child?.pid ?? pid;
  if (!targetPid) return;
  if (process.platform === 'win32') {
    spawn(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${targetPid} /t /f & taskkill /im Illustrator.exe /t /f`], { windowsHide: true, stdio: 'ignore' });
  } else {
    if (child) child.kill('SIGTERM'); else { try { process.kill(targetPid, 'SIGTERM'); } catch {} }
  }
}

function stopTool() {
  if (activeRun) activeRun.stopping = true;
  killProcessTree(activeChild, activeRun?.runnerPid);
  activeChild = null;
  if (activeRun?.status === 'running') { activeRun.status = 'error'; activeRun.endedAt = new Date().toISOString(); activeRun.logs.push('ÄÃ£ dá»«ng Tool theo yÃªu cáº§u.'); }
  broadcastToolStatus();
  void snapshot(true);
  return toolStatus();
}

function resetTool() {
  killProcessTree(activeChild, activeRun?.runnerPid);
  activeChild = null;
  activeRun = null;
  persistToolState();
  void snapshot(true);
  return toolStatus();
}

function toolStatus() {
  return { running: activeRun?.status === 'running', run: enrichRun(activeRun) };
}

function inferOutputAiRelativePath(fileName: string) {
  const match = path.basename(fileName).match(/^Acrylic_(\d{1,2})_(\d{1,2})_(\d{2})_\d+\.ai$/i);
  if (!match) return null;
  const [, day, month, year] = match;
  const normalizedDay = String(Number(day));
  const normalizedMonth = String(Number(month));
  return path.join(`thang${normalizedMonth}`, `${normalizedDay}-${normalizedMonth}-${year}`, path.basename(fileName));
}

function resolveOutputAiPath(relativePath: string) {
  const root = path.resolve(folderPaths.output_ai);
  const target = path.resolve(root, relativePath);
  const rootLower = root.toLowerCase();
  if (!target.toLowerCase().startsWith(rootLower + path.sep) && target.toLowerCase() !== rootLower) throw new Error('INVALID_OUTPUT_AI_PATH');
  if (existsSync(target)) return target;

  const inferredRelativePath = inferOutputAiRelativePath(relativePath);
  if (inferredRelativePath) {
    const inferredPath = path.resolve(root, inferredRelativePath);
    if (existsSync(inferredPath)) return inferredPath;
    throw new Error('KhÃ´ng tÃ¬m tháº¥y file AI theo ngÃ y trong output_ai: ' + inferredRelativePath);
  }

  throw new Error('KhÃ´ng tÃ¬m tháº¥y file AI trong output_ai: ' + relativePath);
}
function processExists(pid?: number) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

let operationMonitor: NodeJS.Timeout | null = null;

function syncPersistentOperation() {
  if (!activeRun || activeRun.status !== 'running') return;
  if (activeRun.logPath && existsSync(activeRun.logPath)) {
    try {
      const text = readFileSync(activeRun.logPath, 'utf8');
      const offset = activeRun.logOffset ?? 0;
      if (text.length > offset) {
        activeRun.logOffset = text.length;
        appendLog(text.slice(offset));
      }
    } catch {}
  }
  if (activeRun.resultPath && existsSync(activeRun.resultPath)) {
    try {
      const result = JSON.parse(readFileSync(activeRun.resultPath, 'utf8')) as { status: 'completed' | 'error'; exitCode?: number | null; endedAt?: string; message?: string };
      activeRun.status = result.status;
      activeRun.exitCode = result.exitCode;
      activeRun.logs.push(result.status === 'completed' ? 'Export hoÃ n táº¥t thÃ nh cÃ´ng.' : `Export tháº¥t báº¡i \(mÃ£ ${result.exitCode ?? 'khÃ´ng xÃ¡c Ä‘á»‹nh'}).`);
      activeRun.endedAt = result.endedAt ?? new Date().toISOString();
      if (result.message) activeRun.logs.push(result.message);
      activeChild = null;
      broadcastToolStatus();
      void snapshot(true);
      return;
    } catch {}
  }
  if (activeRun.runnerPid && !processExists(activeRun.runnerPid)) {
    activeRun.status = 'error';
    activeRun.endedAt = new Date().toISOString();
    activeRun.logs.push('Tiáº¿n trÃ¬nh ná»n Ä‘Ã£ dá»«ng nhÆ°ng khÃ´ng ghi Ä‘Æ°á»£c káº¿t quáº£.');
    broadcastToolStatus();
  }
}

function ensureOperationMonitor() {
  if (operationMonitor) clearInterval(operationMonitor);
  operationMonitor = setInterval(syncPersistentOperation, 300);
  operationMonitor.unref();
  syncPersistentOperation();
}

function launchPersistentOperation(run: ToolRun, executable: string, args: string[], env: Record<string, string> = {}) {
  mkdirSync(operationRuntimeDir, { recursive: true });
  const logPath = path.join(operationRuntimeDir, `${run.id}.log`);
  const resultPath = path.join(operationRuntimeDir, `${run.id}.result.json`);
  const specPath = path.join(operationRuntimeDir, `${run.id}.spec.json`);
  writeFileSync(logPath, '', 'utf8');
  const operationEnv = { ...process.env, ...env, ACRYLIC_FACTORY_ROOT: factoryRoot, ACRYLIC_IMAGES_DIR: folderPaths.Images, ACRYLIC_IMAGES_ERROR_DIR: folderPaths.images_error, ACRYLIC_IMAGES_DONE_DIR: folderPaths.imgaes_done, ACRYLIC_WAIT_DIR: folderPaths.wait, ACRYLIC_OUTPUT_AI_DIR: folderPaths.output_ai, ACRYLIC_OUTPUT_FRONT_DIR: folderPaths.output_front, ACRYLIC_OUTPUT_BACK_DIR: folderPaths.output_back, ACRYLIC_OUTPUT_LAZER_DIR: folderPaths.output_lazer, ACRYLIC_TEMPLATE_PATH: path.join(folderPaths.template ?? path.join(factoryRoot, 'template'), 'Template_UVDTF.ai'), ACRYLIC_LAZER_TEMPLATE_PATH: path.join(folderPaths.template ?? path.join(factoryRoot, 'template'), 'Template_Lazer.ai') };
  if (executable === 'cscript.exe' && /clear-wait-printed-layers\.runtime\.jsx$/i.test(String(args[2] ?? ''))) {
    const source = readFileSync(path.join(toolDir, 'scripts', 'clear-wait-printed-layers.jsx'), 'utf8');
    writeFileSync(path.join(toolDir, 'scripts', 'clear-wait-printed-layers.runtime.jsx'), ['var CODEX_WAIT_PRINTED_SOURCE_PATH = ' + JSON.stringify(String((operationEnv as Record<string, string>).ACRYLIC_WAIT_PRINTED_SOURCE_PATH ?? '').replace(/\\/g, '/')) + ';', 'var CODEX_WAIT_PRINTED_RESULT_PATH = ' + JSON.stringify(String((operationEnv as Record<string, string>).ACRYLIC_WAIT_PRINTED_RESULT_PATH ?? '').replace(/\\/g, '/')) + ';', 'var CODEX_WAIT_PRINTED_MANIFEST_PATH = ' + JSON.stringify(String((operationEnv as Record<string, string>).ACRYLIC_WAIT_PRINTED_MANIFEST_PATH ?? '').replace(/\\/g, '/')) + ';', source].join('\n'), 'utf8');
  }
  writeFileSync(specPath, JSON.stringify({ kind: run.kind, executable, args, cwd: toolDir, env: operationEnv, logPath, resultPath }), 'utf8');
  const runner = spawn(process.execPath, [operationRunnerPath, specPath], { cwd: factoryRoot, env: process.env, windowsHide: true, detached: true, shell: false, stdio: 'ignore' });
  runner.unref();
  run.runnerPid = runner.pid;
  run.logPath = logPath;
  run.resultPath = resultPath;
  run.logOffset = 0;
  activeRun = run;
  activeChild = runner;
  broadcastToolStatus();
  ensureOperationMonitor();
  void snapshot(true);
}


function setupStatus() {
  if (activeRun?.kind === 'setup' && activeRun.status === 'running') {
    return { status: 'running', steps: [], setupVersion: currentSetupVersion, setupRequired: false, updatedAt: activeRun.startedAt, logs: activeRun.logs.slice(-8) };
  }
  const resultPath = path.join(factoryRoot, '.runtime', 'machine-setup.json');
  try {
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as Record<string, unknown>;
    const setupRequired = result.status !== 'completed' || result.setupVersion !== currentSetupVersion;
    return { ...result, currentSetupVersion, setupRequired };
  } catch {
    return { status: 'idle', steps: [], setupVersion: null, currentSetupVersion, setupRequired: true, updatedAt: null };
  }
}

function runMachineSetup() {
  if (activeRun?.status === 'running') return { ok: false, message: 'Đang có tiến trình khác chạy, vui lòng chờ xong rồi mới thiết lập.', run: activeRun };
  const run = { id: 'setup-' + Date.now(), kind: 'setup' as RunKind, command: 'check' as ToolCommand, status: 'running' as RunnerStatus, startedAt: new Date().toISOString(), lastLogAt: new Date().toISOString(), logs: ['> Thiết lập máy này'] };
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(appRoot, 'scripts', 'setup-machine.ps1'), '-Root', factoryRoot];
  launchPersistentOperation(run, executable, args, {});
  return { ok: true, message: 'Đã bắt đầu thiết lập máy này.', run: activeRun };
}

function launchWaitPrintedCleanup(waitRelativePath: string) {
  if (activeRun?.status === 'running') return { ok: false, message: 'Tool hoặc Export đang chạy.', run: activeRun };
  const source = resolveWaitAiPath(waitRelativePath);
  const run: ToolRun = { id: `wait-printed-${Date.now()}`, kind: 'tool', command: 'check', status: 'running', startedAt: new Date().toISOString(), lastLogAt: new Date().toISOString(), logs: ['> dọn FRONT/BACK/LAZER trong wait: ' + path.basename(source)] };
  launchPersistentOperation(run, 'cscript.exe', ['//nologo', path.join(toolDir, 'scripts', 'launch-illustrator-and-run.vbs'), path.join(toolDir, 'scripts', 'clear-wait-printed-layers.runtime.jsx')], { ACRYLIC_WAIT_PRINTED_SOURCE_PATH: source, ACRYLIC_WAIT_PRINTED_RESULT_PATH: path.join(factoryRoot, '.runtime', 'wait-printed-result.json'), ACRYLIC_WAIT_PRINTED_MANIFEST_PATH: path.join(path.dirname(source), path.basename(source).replace(/\.ai$/i, '.manifest.json')) });
  return { ok: true, message: 'Đang mở file wait để xóa FRONT/BACK/LAZER.', run: activeRun };
}

function resolveWaitAiPath(relativePath: string) {
  const resolved = resolveFileInside(folderPaths.wait, relativePath);
  if (path.extname(resolved).toLowerCase() !== '.ai') throw new Error('Chỉ có thể export file wait .ai.');
  if (!existsSync(resolved)) throw new Error('Không tìm thấy file wait.');
  return resolved;
}

function buildOutputAiCopyTarget(waitFileName: string) {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const year = String(now.getFullYear()).slice(-2);
  const folder = path.join(folderPaths.output_ai, `thang${month}`, `${day}-${month}-${year}`);
  mkdirSync(folder, { recursive: true });
  const waitBase = path.basename(waitFileName, path.extname(waitFileName));
  const waitSize = waitBase.match(/^wait_(.+)$/i)?.[1] ?? 'unknown';
  let index = 1;
  while (true) {
    const fileName = `wait_${waitSize}_${day}_${month}_${String(index).padStart(2, '0')}.ai`;
    const filePath = path.join(folder, fileName);
    if (!existsSync(filePath)) return { filePath, relativePath: path.relative(folderPaths.output_ai, filePath) };
    index += 1;
  }
}

function copyWaitToOutputAndExport(waitRelativePath: string, assets: ExportAssetKind[]) {
  if (activeRun?.status === 'running') return { ok: false, message: 'Tool hoặc Export đang chạy.', run: activeRun };
  const source = resolveWaitAiPath(waitRelativePath);
  const target = buildOutputAiCopyTarget(path.basename(source));
  fs.copyFileSync(source, target.filePath);
  const result = runExport(target.relativePath, assets);
  if (activeRun) activeRun.logs.push(`Đã sao chép wait: ${path.basename(source)} -> ${target.relativePath}`);
  cachedSnapshot = null;
  cacheExpiresAt = 0;
  return { ...result, outputAiRelativePath: target.relativePath };
}

function markWaitPrinted(waitRelativePath: string) {
  if (activeRun?.status === 'running') throw new Error('Không thể đánh dấu Đã in khi Tool hoặc Export đang chạy.');
  const waitPath = resolveWaitAiPath(waitRelativePath);
  const manifestPath = waitPath.replace(/\.ai$/i, '.manifest.json');
  let manifest: Record<string, unknown> = {};
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>; } catch {}
  manifest.printedAt = new Date().toISOString();
  manifest.printed = true;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  cachedSnapshot = null;
  cacheExpiresAt = 0;
  return manifest.printedAt;
}

function runExport(outputAiRelativePath: string, assets: ExportAssetKind[]) {
  if (activeRun?.status === 'running') return { ok: false, message: 'Äang cÃ³ tiáº¿n trÃ¬nh khÃ¡c cháº¡y.', run: activeRun };
  const outputAiPath = resolveOutputAiPath(outputAiRelativePath);
  const selected: ExportAssetKind[] = assets.length ? assets : ['front', 'back', 'lazer'];
  const run: ToolRun = { id: `export-${Date.now()}`, kind: 'export', command: 'check', status: 'running', startedAt: new Date().toISOString(), lastLogAt: new Date().toISOString(), logs: [`> export bundle: ${selected.join(', ')}`], exportAssets: selected, outputAiRelativePath };
  launchPersistentOperation(run, 'node', [path.join(toolDir, 'dist-bundle', 'test-export-output-assets.cjs'), outputAiPath], { ACRYLIC_EXPORT_ASSETS: selected.join(',') });
  return { ok: true, message: 'ÄÃ£ báº¯t Ä‘áº§u export.', run: activeRun };
}

function runTool(command: ToolCommand) {
  if (activeRun?.status === 'running') return { ok: false, message: 'Äang cÃ³ tiáº¿n trÃ¬nh khÃ¡c cháº¡y.', run: activeRun };
  const commandEnv: Record<string, string> = command === 'error'
    ? { ACRYLIC_IGNORE_CHECK_FALSE: '1', ACRYLIC_ERROR_COMPARE_ONLY: '1', ACRYLIC_SKIP_DERIVED_OUTPUT_EXPORT: '1', ACRYLIC_CHECKPOINT_ITEM_LIMIT: '90', ACRYLIC_CHECKPOINT_MODE: 'continue', ACRYLIC_CHECKPOINT_PAUSE_MS: '0', ACRYLIC_JSX_BATCH_SIZE: '1', ACRYLIC_ITEM_STALL_TIMEOUT_MS: '180000', ACRYLIC_QUIT_ILLUSTRATOR_AFTER_SAVE: '0', ACRYLIC_CLOSE_DOCUMENT_AFTER_SAVE: '1' }
    : command === 'check'
      ? { ACRYLIC_CHECK_FULL_PIPELINE: '1', ACRYLIC_ITEM_STALL_TIMEOUT_MS: '180000', ACRYLIC_QUIT_ILLUSTRATOR_AFTER_SAVE: '0', ACRYLIC_CLOSE_DOCUMENT_AFTER_SAVE: '1' }
      : { ACRYLIC_CHECKPOINT_ITEM_LIMIT: '90', ACRYLIC_CHECKPOINT_MODE: 'continue', ACRYLIC_CHECKPOINT_PAUSE_MS: '0', ACRYLIC_JSX_BATCH_SIZE: '18', ACRYLIC_ITEM_STALL_TIMEOUT_MS: '180000', ACRYLIC_QUIT_ILLUSTRATOR_AFTER_SAVE: '0', ACRYLIC_CLOSE_DOCUMENT_AFTER_SAVE: '1' };
  const run: ToolRun = { id: String(Date.now()), kind: 'tool', command, status: 'running', startedAt: new Date().toISOString(), lastLogAt: new Date().toISOString(), logs: ['> cháº¡y Tool bundle: ' + command] };
  launchPersistentOperation(run, 'node', [path.join(toolDir, 'dist-bundle', 'index.cjs')], commandEnv);
  return { ok: true, message: 'ÄÃ£ cháº¡y Tool ' + command + '.', run: activeRun };
}

ensureOperationMonitor();
async function scanFolder(root: string): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  let errorMetadata: Record<string, Record<string, unknown>> = {};
  if (path.resolve(root).toLowerCase() === path.resolve(folderPaths.images_error).toLowerCase()) {
    try { errorMetadata = JSON.parse(readFileSync(path.join(root, '.error-metadata.json'), 'utf8')) as Record<string, Record<string, unknown>>; } catch {}
  }
  async function walk(current: string) {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) { await walk(fullPath); continue; }
      const lowerName = entry.name.toLowerCase();
      if (!entry.isFile() || entry.name === '.error-metadata.json' || lowerName.endsWith('.manifest.json') || lowerName === 'thumbs.db' || lowerName === 'desktop.ini' || lowerName === '.ds_store' || lowerName.startsWith('~') || lowerName.endsWith('.tmp') || lowerName.endsWith('.bak') || lowerName.endsWith('.lock')) continue;
      const rootKey = Object.entries(folderPaths).find(([, folder]) => path.resolve(folder).toLowerCase() === path.resolve(root).toLowerCase())?.[0];
      const extension = path.extname(entry.name).toLowerCase();
      if ((rootKey === 'Images' || rootKey === 'images_error' || rootKey === 'images_processed') && extension !== '.png') continue;
      if (rootKey === 'output_ai' && (extension !== '.ai' || !/^(?:Acrylic_\d{1,2}_\d{1,2}_\d{2}|wait_[^/\\]+_\d{1,2}_\d{1,2}_\d{2})\.ai$/i.test(entry.name))) continue;
      if (rootKey === 'output_front' && (extension !== '.png' || !/_front\.png$/i.test(entry.name))) continue;
      if (rootKey === 'output_back' && (extension !== '.png' || !/_back\.png$/i.test(entry.name))) continue;
      if (rootKey === 'output_lazer' && (extension !== '.ai' || !/_lazer\.ai$/i.test(entry.name))) continue;
      const info = await stat(fullPath);
      let waitManifest: Record<string, unknown> | undefined;
      if (path.resolve(root).toLowerCase() === path.resolve(folderPaths.wait).toLowerCase() && entry.name.toLowerCase().endsWith('.ai')) {
        const manifestPath = fullPath.replace(/\.ai$/i, '.manifest.json');
        try { waitManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>; } catch {}
      }
      files.push({ path: fullPath, relativePath: path.relative(root, fullPath), name: entry.name, sizeBytes: info.size, modifiedAt: info.mtime.toISOString(), errorMeta: errorMetadata[entry.name], waitManifest });
    }
  }
  await walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en', { numeric: true }));
}

let cachedSnapshot: Snapshot | null = null;
let snapshotPromise: Promise<Snapshot> | null = null;
let cacheExpiresAt = 0;

async function snapshot(force = false): Promise<Snapshot> {
  if (!force && cachedSnapshot && Date.now() < cacheExpiresAt) return cachedSnapshot;
  if (snapshotPromise) return snapshotPromise;
  snapshotPromise = (async () => {
    const normalizedLoaded = normalizeSavedFolderPaths(loadFolderPaths());
    folderPaths = normalizedLoaded.normalizedPaths;
    folderPathWarnings = normalizedLoaded.warnings;
    if (normalizedLoaded.changed) saveFolderPaths(folderPaths);
    const folderHealth = Object.fromEntries(Object.entries(folderPaths).map(([key, folder]) => [key, canAccessFolder(folder)]));
    for (const [key, health] of Object.entries(folderHealth)) if (health.warning) folderPathWarnings[key] = health.warning;
    const entries = await Promise.all(Object.entries(folderPaths).map(async ([key, folder]) => [key, await scanFolder(folder)] as const));
    const folders = Object.fromEntries(entries);
    const running = Boolean(activeChild && activeRun?.status === 'running');
    cachedSnapshot = {
      toolId: 'acrylic',
      machineId: 'windows-local-01',
      capturedAt: new Date().toISOString(),
      runnerStatus: running ? 'running' : 'idle',
      illustratorConnected: false,
      folders,
      folderPaths,
      folderHealth,
      folderPathWarnings,
      runnerProgress: running ? { imageBaseName: enrichRun(activeRun)?.currentStep?.fileName ?? `npm run ${activeRun?.command ?? 'tool'}`, index: enrichRun(activeRun)?.currentStep?.index ?? 1, total: enrichRun(activeRun)?.currentStep?.total ?? 1 } : undefined,
    };
    cacheExpiresAt = Date.now() + 2000;
    return cachedSnapshot;
  })().finally(() => { snapshotPromise = null; });
  return snapshotPromise;
}

function json(response: import('node:http').ServerResponse, value: unknown, statusCode = 200) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(value));
}

function serveFile(url: URL, response: import('node:http').ServerResponse) {
  const match = url.pathname.match(/^\/api\/v1\/files\/([^/]+)$/);
  if (!match) return false;
  const scope = decodeURIComponent(match[1]);
  const root = folderPaths[scope];
  if (!root) { response.statusCode = 404; response.end('UNKNOWN_SCOPE'); return true; }
  const relativePath = url.searchParams.get('path') ?? '';
  const resolvedRoot = path.resolve(root);
  const resolvedFile = path.resolve(root, relativePath);
  if (!relativePath || (!resolvedFile.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep) && resolvedFile.toLowerCase() !== resolvedRoot.toLowerCase())) { response.statusCode = 400; response.end('INVALID_PATH'); return true; }
  const ext = path.extname(resolvedFile).toLowerCase();
  if (ext === '.png') response.setHeader('Content-Type', 'image/png');
  else if (ext === '.jpg' || ext === '.jpeg') response.setHeader('Content-Type', 'image/jpeg');
  else if (ext === '.webp') response.setHeader('Content-Type', 'image/webp');
  else { response.statusCode = 415; response.end('PREVIEW_NOT_SUPPORTED'); return true; }
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  createReadStream(resolvedFile).on('error', () => { if (!response.headersSent) response.statusCode = 404; response.end('FILE_NOT_FOUND'); }).pipe(response);
  return true;
}


const waitPreviewDir = path.join(factoryRoot, '.runtime', 'wait-previews');
let waitPreviewPromise: Promise<string> | null = null;

function runProcess(executable: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: 'ignore' });
    const timeout = setTimeout(() => {
      try { child.kill(); } catch {}
      reject(new Error('PREVIEW_TIMEOUT'));
    }, 45000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error('PREVIEW_EXIT_' + code)); });
  });
}

async function ensureWaitPreview(waitFilePath: string) {
  mkdirSync(waitPreviewDir, { recursive: true });
  const safeBase = path.basename(waitFilePath, path.extname(waitFilePath)).replace(/[^a-z0-9_-]+/gi, '_');
  const outputPath = path.join(waitPreviewDir, safeBase + '.png');
  if (existsSync(outputPath) && statSync(outputPath).mtimeMs >= statSync(waitFilePath).mtimeMs) return outputPath;
  if (activeRun?.status === 'running') throw new Error('TOOL_BUSY');
  if (waitPreviewPromise) return waitPreviewPromise;
  waitPreviewPromise = (async () => {
    const source = readFileSync(path.join(toolDir, 'scripts', 'export-sheet-preview.jsx'), 'utf8');
    const resultPath = path.join(waitPreviewDir, safeBase + '.result.json');
    const runtimePath = path.join(waitPreviewDir, safeBase + '.runtime.jsx');
    writeFileSync(runtimePath, [
      'var CODEX_SHEET_PREVIEW_SOURCE_PATH = ' + JSON.stringify(waitFilePath.replace(/\\\\/g, '/')) + ';',
      'var CODEX_SHEET_PREVIEW_OUTPUT_PATH = ' + JSON.stringify(outputPath.replace(/\\\\/g, '/')) + ';',
      'var CODEX_SHEET_PREVIEW_RESULT_PATH = ' + JSON.stringify(resultPath.replace(/\\\\/g, '/')) + ';',
      source,
    ].join('\n'), 'utf8');
    try { if (existsSync(resultPath)) writeFileSync(resultPath, ''); } catch {}
    await runProcess('cscript.exe', ['//nologo', path.join(toolDir, 'scripts', 'launch-illustrator-and-run.vbs'), runtimePath], toolDir);
    const result = JSON.parse(readFileSync(resultPath, 'utf8')) as { success?: boolean; message?: string };
    if (result.success !== true || !existsSync(outputPath)) throw new Error(result.message ?? 'WAIT_PREVIEW_FAILED');
    return outputPath;
  })().finally(() => { waitPreviewPromise = null; });
  return waitPreviewPromise;
}

function formatDurationMs(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0 phÃºt';
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} phÃºt`;
  if (minutes <= 0) return `${hours} giá»`;
  return `${hours} giá» ${minutes} phÃºt`;
}

function readOperationHistory() {
  try {
    if (!existsSync(operationRuntimeDir)) return [];
    const specFiles = readdirSync(operationRuntimeDir).filter((name) => name.endsWith('.spec.json'));
    return specFiles.map((specName) => {
      const baseName = specName.slice(0, -'.spec.json'.length);
      const specPath = path.join(operationRuntimeDir, specName);
      const resultPath = path.join(operationRuntimeDir, `${baseName}.result.json`);
      const logPath = path.join(operationRuntimeDir, `${baseName}.log`);
      const spec = JSON.parse(readFileSync(specPath, 'utf8')) as Record<string, unknown>;
      const result = existsSync(resultPath) ? JSON.parse(readFileSync(resultPath, 'utf8')) as Record<string, unknown> : {};
      const logLines = existsSync(logPath) ? readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean) : [];
      const startedAt = statSync(specPath).mtime.toISOString();
      const endedAtRaw = String(result.endedAt ?? '');
      const endedAt = endedAtRaw ? new Date(endedAtRaw).toISOString() : null;
      const startedDate = new Date(startedAt);
      const endedDate = endedAt ? new Date(endedAt) : null;
      const itemCount = logLines.filter((line) => /^\[\d+\/\d+\]\s+PACKING:/i.test(line)).length;
      const sheetCount = logLines.filter((line) => /^Sheet\s+\d+:/i.test(line) || /^Saved (?:checkpoint |remaining-space )?wait AI/i.test(line) || /^Saved AI output:/i.test(line)).length;
      const errorCount = logLines.filter((line) => /\bERROR\b|CHECK_COMPARE_FALSE|Tool chay loi|Tool ket thuc voi ma/i.test(line)).length;
      const status = String(result.status ?? 'completed') === 'completed' && Number(result.exitCode ?? 0) === 0 ? 'completed' : String(result.status ?? 'failed');
      const specArgs = Array.isArray(spec.args) ? spec.args : [];
      const currentFile = String((logLines.find((line) => /^Sheet\s+\d+:/i.test(line)) ?? logLines.find((line) => /^Saved .*wait AI/i.test(line)) ?? specArgs[specArgs.length - 1] ?? spec.kind ?? 'â€”'));
      const timeline = logLines.slice(-80).map((line, index) => ({
        time: `${String(index + 1).padStart(2,'0')}:00`,
        event: /ERROR|FALSE/i.test(line) ? 'Lá»—i' : /PACKING/i.test(line) ? 'Äang xáº¿p' : /TRACE_LAZER/i.test(line) ? 'Trace lazer' : /DONE|DONE_BATCH/i.test(line) ? 'HoÃ n táº¥t' : /Saved/i.test(line) ? 'ÄÃ£ lÆ°u' : 'Log',
        message: line,
        level: /ERROR|FALSE|Tool chay loi|Tool ket thuc voi ma/i.test(line) ? 'error' : /waiting instead of killing/i.test(line) ? 'warning' : 'info',
      }));
      return {
        id: baseName,
        kind: String(spec.kind ?? 'tool'),
        command: String(Array.isArray(spec.args) ? spec.args.join(' ') : ''),
        startedAt,
        endedAt,
        duration: endedDate ? formatDurationMs(endedDate.getTime() - startedDate.getTime()) : 'Äang cháº¡y',
        sheets: sheetCount,
        items: itemCount,
        errors: errorCount,
        status: status === 'running' ? 'running' : status === 'completed' ? 'completed' : 'failed',
        currentFile,
        timeline,
        exitCode: Number(result.exitCode ?? 0),
        logPath,
      };
    }).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  } catch {
    return [];
  }
}
function localFilesystemApi(): Plugin {
  return {
    name: 'acrylic-local-filesystem-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/v1/')) return next();
        if (serveFile(url, response)) return;
        if (url.pathname === '/api/v1/wait-preview') {
          const relativePath = url.searchParams.get('path') ?? '';
          const waitRoot = path.resolve(folderPaths.wait);
          const sourcePath = path.resolve(waitRoot, relativePath);
          if (!relativePath || !sourcePath.toLowerCase().startsWith(waitRoot.toLowerCase() + path.sep)) return json(response, { ok: false, message: 'File wait khÃ´ng há»£p lá»‡.' }, 400);
          try {
            const previewPath = await ensureWaitPreview(sourcePath);
            response.setHeader('Content-Type', 'image/png');
            response.setHeader('Cache-Control', 'no-store, max-age=0');
            createReadStream(previewPath).pipe(response);
          } catch (error) {
            json(response, { ok: false, message: error instanceof Error && error.message === 'TOOL_BUSY' ? 'Tool Ä‘ang cháº¡y nÃªn chÆ°a thá»ƒ táº¡o preview.' : 'KhÃ´ng thá»ƒ táº¡o preview file wait.' }, error instanceof Error && error.message === 'TOOL_BUSY' ? 409 : 500);
          }
          return;
        }

        if (url.pathname === '/api/v1/setup/status') return json(response, setupStatus());
        if (url.pathname === '/api/v1/setup/run') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          return json(response, runMachineSetup());
        }
        if (url.pathname === '/api/v1/tool/status') return json(response, toolStatus());
        if (url.pathname === '/api/v1/tool/stop') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          return json(response, stopTool());
        }
        if (url.pathname === '/api/v1/tool/reset') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          return json(response, resetTool());
        }
        if (url.pathname === '/api/v1/tool/events') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          toolEventClients.add(response);
          response.write(`event: tool\ndata: ${JSON.stringify(toolStatus())}\n\n`);
          request.on('close', () => toolEventClients.delete(response));
          return;
        }
        if (url.pathname === '/api/v1/wait/export') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          let body = '';
          request.on('data', (chunk) => { body += String(chunk); });
          request.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const waitRelativePath = String(payload.waitRelativePath ?? '');
              const assets = Array.isArray(payload.assets) ? payload.assets.filter((item: unknown) => ['front', 'back', 'lazer'].includes(String(item))) as ExportAssetKind[] : [];
              if (!waitRelativePath) return json(response, { ok: false, message: 'Thiếu file wait để export.', run: toolStatus().run }, 400);
              return json(response, copyWaitToOutputAndExport(waitRelativePath, assets));
            } catch (error) {
              return json(response, { ok: false, message: error instanceof Error ? error.message : 'Không thể export file wait.', run: toolStatus().run }, 400);
            }
          });
          return;
        }
        if (url.pathname === '/api/v1/wait/printed') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          let body = '';
          request.on('data', (chunk) => { body += String(chunk); });
          request.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const waitRelativePath = String(payload.waitRelativePath ?? '');
              if (!waitRelativePath) return json(response, { ok: false, message: 'Thiếu file wait.' }, 400);
              const cleanup = launchWaitPrintedCleanup(waitRelativePath);
              return json(response, { ...cleanup, message: cleanup.ok ? 'Đang mở file wait để xóa FRONT/BACK/LAZER.' : cleanup.message });
            } catch (error) {
              return json(response, { ok: false, message: error instanceof Error ? error.message : 'Không thể đánh dấu Đã in.' }, 400);
            }
          });
          return;
        }
        if (url.pathname === '/api/v1/export/run') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          let body = '';
          request.on('data', (chunk) => { body += String(chunk); });
          request.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const outputAiRelativePath = String(payload.outputAiRelativePath ?? '');
              const assets = Array.isArray(payload.assets) ? payload.assets.filter((item: unknown) => ['front', 'back', 'lazer'].includes(String(item))) as ExportAssetKind[] : [];
              if (!outputAiRelativePath) return json(response, { ok: false, message: 'Thiáº¿u file AI Ä‘á»ƒ export.', run: toolStatus().run }, 400);
              json(response, runExport(outputAiRelativePath, assets));
            } catch (error) {
              json(response, { ok: false, message: `khÃ´ng tá»ƒ export: ${error instanceof Error ? error.message : String(error)}`, run: toolStatus().run }, 500);
            }
          });
          return;
        }
        if (url.pathname === '/api/v1/tool/run') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          let body = '';
          request.on('data', (chunk) => { body += String(chunk); });
          request.on('end', () => {
            let payload: { command?: unknown };
            try {
              payload = body ? JSON.parse(body) : {};
            } catch {
              json(response, { ok: false, message: 'Dá»¯ liá»‡u gá»­i lÃªn khÃ´ng pháº£i JSON há»£p lá»‡.', run: toolStatus().run }, 400);
              return;
            }
            const command = payload.command;
            if (!['start', 'error', 'check'].includes(String(command))) {
              json(response, { ok: false, message: 'Lá»‡nh Tool khÃ´ng há»£p lá»‡.', run: toolStatus().run }, 400);
              return;
            }
            try {
              json(response, runTool(command as ToolCommand));
            } catch (error) {
              json(response, { ok: false, message: `khÃ´ng tá»ƒ kh?i ??ng Tool: ${error instanceof Error ? error.message : String(error)}`, run: toolStatus().run }, 500);
            }
          });
          return;
        }
        if (url.pathname === '/api/v1/history/events') return json(response, readOperationHistory());
        if (url.pathname === '/api/v1/integrations/nocodb') return json(response, { enabled: false, eventsTableConfigured: false, snapshotsTableConfigured: false });
        if (url.pathname === '/api/v1/events') {
          response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          const send = async () => {
            const live = await snapshot();
            const running = live.runnerStatus === 'running';
            response.write(`event: snapshot\ndata: ${JSON.stringify({ capturedAt: live.capturedAt, runnerStatus: live.runnerStatus, illustratorConnected: live.illustratorConnected, progress: live.runnerProgress ?? null, kpi: { queue: live.folders.Images.length, processing: running ? 1 : 0, done: live.folders.imgaes_done.length, errors: live.folders.images_error.length, wait: live.folders.wait.length, outputAi: live.folders.output_ai.length, outputFront: live.folders.output_front.length, outputBack: live.folders.output_back.length, outputLazer: live.folders.output_lazer.length } })}\n\n`);
            response.write(`event: tool\ndata: ${JSON.stringify(toolStatus())}\n\n`);
          };
          await send();
          const timer = setInterval(() => void send(), 250);
          request.on('close', () => clearInterval(timer));
          return;
        }
        const current = await snapshot();
        if (url.pathname === '/api/v1/status') return json(response, current);
        if (url.pathname === '/api/v1/queue') return json(response, current.folders.Images);
        if (url.pathname === '/api/v1/errors') return json(response, current.folders.images_error);
        if (url.pathname === '/api/v1/errors/processed') {
          if (request.method !== 'POST') { response.statusCode = 405; response.end('METHOD_NOT_ALLOWED'); return; }
          let body = '';
          request.on('data', (chunk) => { body += String(chunk); });
          request.on('end', () => {
            try {
              const parsed = JSON.parse(body || '{}') as { relativePath?: unknown };
              const relativePath = String(parsed.relativePath ?? '').trim();
              if (!relativePath) return json(response, { ok: false, message: 'Thiáº¿u Ä‘Æ°á»ng dáº«n áº£nh lá»—i.' }, 400);
              const processedRelativePath = moveErrorToProcessed(relativePath);
              return json(response, { ok: true, message: 'Đã chuyển ảnh sang thư mục images_processed.', relativePath: processedRelativePath });
            } catch (error) {
              return json(response, { ok: false, message: error instanceof Error ? error.message : 'KhÃ´ng thá»ƒ chuyá»ƒn áº£nh Ä‘Ã£ xá»­ lÃ½.' }, 400);
            }
          });
          return;
        }
        if (url.pathname === '/api/v1/wait') return json(response, current.folders.wait);
        if (url.pathname === '/api/v1/outputs') return json(response, { ai: current.folders.output_ai, front: current.folders.output_front, back: current.folders.output_back, lazer: current.folders.output_lazer });
        if (url.pathname === '/api/v1/settings/folders') return json(response, { folderPaths, folderPathWarnings });
        if (url.pathname === '/api/v1/settings/folders/save') {
          let body=''; request.on('data', (chunk) => body += chunk); request.on('end', () => {
            try { const parsed = JSON.parse(body || '{}') as { folderPaths?: Record<string, string>; moveData?: boolean };
              if (!parsed.folderPaths) return json(response, { ok:false, message:'Thiếu folderPaths' }, 400);
              if (activeRun?.status === 'running') return json(response, { ok:false, message:'Không thể đổi thư mục khi Tool hoặc Export đang chạy.' }, 409);
              const submittedPaths: Record<string, string> = {};
              const normalizedPaths: Record<string, NormalizedFolderPath> = {};
              const warnings: Record<string, string> = {};
              for (const [key, value] of Object.entries(parsed.folderPaths)) {
                const normalized = normalizeFolderPath(String(value ?? ''));
                normalizedPaths[key] = normalized;
                if (normalized.warning || !normalized.normalizedPath) {
                  const message = normalized.warning ?? '???ng d?n th? m?c kh?ng h?p l?.';
                  warnings[key] = message;
                  return json(response, { ok:false, message, normalizedPaths, warnings }, 409);
                }
                const health = canAccessFolder(normalized.normalizedPath);
                if (!health.reachable) return json(response, { ok:false, message: health.warning ?? 'Kh?ng truy c?p ???c th? m?c m?i.', normalizedPaths, warnings: { [key]: health.warning } }, 409);
                submittedPaths[key] = normalized.normalizedPath;
              }
              const nextPaths = { ...folderPaths, ...submittedPaths };
              if (parsed.moveData !== false) {
                for (const key of Object.keys(submittedPaths)) { const oldPath = folderPaths[key]; const newPath = submittedPaths[key]; if (oldPath && newPath && path.resolve(oldPath) !== path.resolve(newPath)) moveFolderContents(oldPath, newPath); }
              }
              folderPaths = nextPaths; folderPathWarnings = {}; cachedSnapshot = null; saveFolderPaths(folderPaths); return json(response, { ok:true, folderPaths, normalizedPaths, warnings, moveData: parsed.moveData !== false });
            } catch (error) { return json(response, { ok:false, message: error instanceof Error ? error.message : 'SAVE_FAILED' }, 400); }
          }); return; } 
        next();
      });
    },
  };
}

export default defineConfig({ plugins: [localFilesystemApi(), react(), tailwindcss()] });


























