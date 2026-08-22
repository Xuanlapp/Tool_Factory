import { readdir, readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LocalDatabase } from '@acrylic/database';
import type { AgentSnapshot, FolderFileEntry, RunnerProgress, RunnerStatus } from '@acrylic/contracts';
import { createEvent } from '@acrylic/telemetry';
import { NocoDbClient } from '@acrylic/nocodb';

const execFileAsync = promisify(execFile);
const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT ?? 'D:/FFactory/Arcylic';
const toolRoot = process.env.ACRYLIC_TOOL_ROOT ?? path.join(factoryRoot, 'Tool');
const dataRoot = process.env.ACRYLIC_PLATFORM_DATA ?? path.join(factoryRoot, '.platform-data');
const toolId = process.env.ACRYLIC_TOOL_ID ?? 'acrylic';
const machineId = process.env.ACRYLIC_MACHINE_ID ?? 'windows-local-01';
const intervalMs = Math.max(1000, Number(process.env.ACRYLIC_AGENT_INTERVAL_MS ?? 3000));
const watchDebounceMs = Math.max(100, Number(process.env.ACRYLIC_AGENT_WATCH_DEBOUNCE_MS ?? 250));
const folders = { Images: path.join(factoryRoot, 'Images'), images_error: path.join(factoryRoot, 'images_error'), imgaes_done: path.join(factoryRoot, 'imgaes_done'), wait: path.join(factoryRoot, 'wait'), output_ai: path.join(factoryRoot, 'output_ai'), output_front: path.join(factoryRoot, 'output_front'), output_back: path.join(factoryRoot, 'output_back'), output_lazer: path.join(factoryRoot, 'output_lazer') };
const noco = new NocoDbClient({ baseUrl: process.env.NOCODB_BASE_URL ?? '', apiToken: process.env.NOCODB_API_TOKEN ?? '', eventsTableId: process.env.NOCODB_EVENTS_TABLE_ID, snapshotsTableId: process.env.NOCODB_SNAPSHOTS_TABLE_ID });

async function scanFolder(folderPath: string): Promise<FolderFileEntry[]> {
  const files: FolderFileEntry[] = [];
  async function walk(currentPath: string) {
    let entries;
    try { entries = await readdir(currentPath, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const filePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) { await walk(filePath); continue; }
      if (!entry.isFile()) continue;
      const info = await stat(filePath);
      files.push({ path: filePath, relativePath: path.relative(folderPath, filePath), name: entry.name, sizeBytes: info.size, modifiedAt: info.mtime.toISOString() });
    }
  }
  await walk(folderPath);
  return files.sort((a, b) => String(a.relativePath ?? a.name).localeCompare(String(b.relativePath ?? b.name), 'en', { numeric: true }));
}

async function listWindowsProcesses() {
  try {
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'Illustrator|cscript|node' } | Select-Object Name,ProcessId,CommandLine | ConvertTo-Json -Compress"], { windowsHide: true, maxBuffer: 1024 * 1024 });
    if (!stdout.trim()) return [] as Array<{ Name?: string; CommandLine?: string }>;
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch { return [] as Array<{ Name?: string; CommandLine?: string }>; }
}

async function latestProgress(): Promise<RunnerProgress | undefined> {
  try {
    const entries = await readdir(path.join(toolRoot, '.runtime'), { withFileTypes: true });
    const candidates = [] as Array<{ filePath: string; mtimeMs: number }>;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.progress.json')) continue;
      const filePath = path.join(toolRoot, '.runtime', entry.name);
      const info = await stat(filePath);
      candidates.push({ filePath, mtimeMs: info.mtimeMs });
    }
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = candidates[0];
    if (!latest) return undefined;
    const progress = JSON.parse(await readFile(latest.filePath, 'utf8')) as Partial<RunnerProgress>;
    return { index: Number(progress.index ?? 0), total: Number(progress.total ?? 0), state: String(progress.state ?? 'UNKNOWN'), imageBaseName: progress.imageBaseName, message: progress.message, updatedAt: new Date(latest.mtimeMs).toISOString(), sourcePath: latest.filePath };
  } catch { return undefined; }
}

function detectRunnerStatus(processes: Array<{ Name?: string; CommandLine?: string }>): RunnerStatus {
  const normalizedToolRoot = toolRoot.replace(/\//g, '\\').toLowerCase();
  const hasRunner = processes.some((process) => {
    const commandLine = String(process.CommandLine ?? '').toLowerCase();
    const isToolPath = commandLine.includes(normalizedToolRoot);
    const isToolEntry = commandLine.includes('src\\index.ts') || commandLine.includes('dist\\index.js') || commandLine.includes('npm run start') || commandLine.includes('npm run error') || commandLine.includes('npm run check');
    return isToolPath && isToolEntry;
  });
  return hasRunner ? 'running' : 'idle';
}

async function captureSnapshot(): Promise<AgentSnapshot> {
  const [folderEntries, processes, progress] = await Promise.all([
    Promise.all(Object.entries(folders).map(async ([name, folderPath]) => [name, await scanFolder(folderPath)])),
    listWindowsProcesses(),
    latestProgress(),
  ]);
  const illustratorConnected = processes.some((process) => String(process.Name ?? '').toLowerCase().includes('illustrator'));
  const runnerStatus = detectRunnerStatus(processes);
  return { toolId, machineId, capturedAt: new Date().toISOString(), runnerStatus, illustratorConnected, folders: Object.fromEntries(folderEntries) as Record<string, FolderFileEntry[]>, folderPaths: { ...folders }, runnerProgress: runnerStatus === 'running' ? progress : undefined };
}

function canSyncNocoDb(destination: string) {
  if (!noco.enabled) return false;
  return destination === 'nocodb.events' ? Boolean(process.env.NOCODB_EVENTS_TABLE_ID) : Boolean(process.env.NOCODB_SNAPSHOTS_TABLE_ID);
}

async function syncNocoDb(database: LocalDatabase) {
  if (!noco.enabled) return;
  for (const row of database.pendingSync(20)) {
    const tableId = row.destination === 'nocodb.snapshots' ? process.env.NOCODB_SNAPSHOTS_TABLE_ID : process.env.NOCODB_EVENTS_TABLE_ID;
    if (!tableId) continue;
    try {
      await noco.insert(tableId, JSON.parse(row.payload_json));
      database.markSyncSuccess(row.event_id);
    } catch (error) {
      database.markSyncFailure(row.event_id, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main() {
  const database = new LocalDatabase(path.join(dataRoot, 'platform.sqlite'));
  const started = createEvent({ toolId, machineId }, 'agent.started', { factoryRoot, toolRoot, mode: 'read-only-observer', nocoEnabled: noco.enabled });
  database.appendEvent(started);
  if (canSyncNocoDb('nocodb.events')) database.enqueueSync(started.eventId, 'nocodb.events', { EventId: started.eventId, ToolId: started.toolId, MachineId: started.machineId, EventType: started.eventType, OccurredAt: started.occurredAt, RunId: started.runId ?? null, SheetId: started.sheetId ?? null, ItemId: started.itemId ?? null, PayloadJson: JSON.stringify(started.payload) });
  let lastFingerprint = '';
  let lastStoredAt = 0;
  const capture = async () => {
    const snapshot = await captureSnapshot();
    const fingerprint = JSON.stringify({ runnerStatus: snapshot.runnerStatus, illustratorConnected: snapshot.illustratorConnected, progress: snapshot.runnerProgress ? { index: snapshot.runnerProgress.index, total: snapshot.runnerProgress.total, state: snapshot.runnerProgress.state, imageBaseName: snapshot.runnerProgress.imageBaseName, message: snapshot.runnerProgress.message } : null, folders: Object.fromEntries(Object.entries(snapshot.folders).map(([key, value]) => [key, value.map((file) => [file.name, file.sizeBytes, file.modifiedAt])])) });
    const shouldStore = fingerprint !== lastFingerprint || Date.now() - lastStoredAt >= 30000;
    if (shouldStore) {
      database.saveSnapshot(snapshot);
      const event = createEvent({ toolId, machineId }, 'agent.snapshot', { runnerStatus: snapshot.runnerStatus, illustratorConnected: snapshot.illustratorConnected, progress: snapshot.runnerProgress, fileCounts: Object.fromEntries(Object.entries(snapshot.folders).map(([key, value]) => [key, value.length])) });
      database.appendEvent(event);
      if (canSyncNocoDb('nocodb.events')) database.enqueueSync(event.eventId, 'nocodb.events', { EventId: event.eventId, ToolId: event.toolId, MachineId: event.machineId, EventType: event.eventType, OccurredAt: event.occurredAt, RunId: event.runId ?? null, SheetId: event.sheetId ?? null, ItemId: event.itemId ?? null, PayloadJson: JSON.stringify(event.payload) });
      if (canSyncNocoDb('nocodb.snapshots')) database.enqueueSync(crypto.randomUUID(), 'nocodb.snapshots', { ToolId: snapshot.toolId, MachineId: snapshot.machineId, CapturedAt: snapshot.capturedAt, RunnerStatus: snapshot.runnerStatus, IllustratorConnected: snapshot.illustratorConnected, SnapshotJson: JSON.stringify(snapshot) });
      lastFingerprint = fingerprint;
      lastStoredAt = Date.now();
      console.log(JSON.stringify({ type: 'agent.snapshot', capturedAt: snapshot.capturedAt, runnerStatus: snapshot.runnerStatus, illustratorConnected: snapshot.illustratorConnected, progress: snapshot.runnerProgress }));
    }
    await syncNocoDb(database);
  };
  await capture();
  if (process.env.ACRYLIC_AGENT_ONCE === '1') { database.close(); return; }

  let scheduledCapture: NodeJS.Timeout | undefined;
  const scheduleCapture = () => {
    if (scheduledCapture) clearTimeout(scheduledCapture);
    scheduledCapture = setTimeout(() => {
      scheduledCapture = undefined;
      void capture().catch((error) => console.error('Agent watcher snapshot failed:', error));
    }, watchDebounceMs);
  };
  for (const folderPath of [...Object.values(folders), path.join(toolRoot, '.runtime')]) {
    try { watch(folderPath, { recursive: true }, scheduleCapture); } catch (error) { console.error('Agent watch unavailable:', folderPath, error); }
  }
  setInterval(() => void capture().catch((error) => console.error('Agent interval snapshot failed:', error)), intervalMs);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
