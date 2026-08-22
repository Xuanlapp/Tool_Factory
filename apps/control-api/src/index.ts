import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LocalDatabase } from '@acrylic/database';
import type { AgentSnapshot, FolderFileEntry } from '@acrylic/contracts';

const execFileAsync = promisify(execFile);
const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const port = Number(process.env.ACRYLIC_CONTROL_API_PORT ?? 4320);
const dataRoot = process.env.ACRYLIC_PLATFORM_DATA ?? 'D:/FFactory/Arcylic/.platform-data';
const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT ?? 'D:/FFactory/Arcylic';
const toolRoot = process.env.ACRYLIC_TOOL_ROOT ?? path.join(factoryRoot, 'Tool');
const templatePath = process.env.ACRYLIC_TEMPLATE_PATH ?? path.join(factoryRoot, 'template', 'Template_UVDTF.ai');
const previewScriptPath = path.join(toolRoot, 'scripts', 'export-sheet-preview.jsx');
const previewVbsPath = path.join(toolRoot, 'scripts', 'launch-illustrator-and-run.vbs');
const previewRoot = path.join(dataRoot, 'sheet-previews');
const maxPreviewAiBytes = Math.max(1, Number(process.env.ACRYLIC_SHEET_PREVIEW_MAX_AI_MB ?? 64)) * 1024 * 1024;
const fileScopes: Record<string, string> = { Images: path.join(factoryRoot, 'Images'), images_error: path.join(factoryRoot, 'images_error'), imgaes_done: path.join(factoryRoot, 'imgaes_done'), wait: path.join(factoryRoot, 'wait'), output_ai: path.join(factoryRoot, 'output_ai'), output_front: path.join(factoryRoot, 'output_front'), output_back: path.join(factoryRoot, 'output_back'), output_lazer: path.join(factoryRoot, 'output_lazer') };
const toolId = process.env.ACRYLIC_TOOL_ID ?? 'acrylic';
const machineId = process.env.ACRYLIC_MACHINE_ID ?? 'windows-local-01';
const database = new LocalDatabase(path.join(dataRoot, 'platform.sqlite'));
const previewJobs = new Map<string, Promise<string>>();

function snapshot() { return database.latestSnapshot(toolId, machineId); }
function files(folderName: string) { return snapshot()?.folders[folderName] ?? []; }
function dashboard(current: AgentSnapshot | null) {
  return {
    capturedAt: current?.capturedAt ?? null,
    runnerStatus: current?.runnerStatus ?? 'offline',
    illustratorConnected: current?.illustratorConnected ?? false,
    progress: current?.runnerProgress ?? null,
    kpi: {
      queue: current?.folders.Images?.length ?? 0,
      errors: current?.folders.images_error?.length ?? 0,
      wait: current?.folders.wait?.length ?? 0,
      outputAi: current?.folders.output_ai?.length ?? 0,
      outputFront: current?.folders.output_front?.length ?? 0,
      outputBack: current?.folders.output_back?.length ?? 0,
      outputLazer: current?.folders.output_lazer?.length ?? 0,
    },
  };
}

function latestWaitAi() {
  const waitFiles = files('wait').filter((file) => /\.ai$/i.test(file.name));
  waitFiles.sort((left, right) => new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime());
  const file = waitFiles[0];
  return file ? { ...file, fullPath: path.join(fileScopes.wait, file.relativePath ?? file.name) } : null;
}

async function fileSignature(filePath: string) {
  const info = await stat(filePath);
  const signature = `${path.resolve(filePath).toLowerCase()}|${info.size}|${info.mtimeMs}`;
  const hash = createHash('sha1').update(signature).digest('hex');
  return { info, cachePath: path.join(previewRoot, `${hash}.png`), resultPath: path.join(previewRoot, `${hash}.json`), runtimePath: path.join(previewRoot, `${hash}.jsx`) };
}

async function exists(filePath: string) {
  try { await access(filePath); return true; } catch { return false; }
}

async function generateSheetPreview(sourcePath: string) {
  const signature = await fileSignature(sourcePath);
  if (await exists(signature.cachePath)) {
    const cached = await stat(signature.cachePath);
    if (cached.size > 0) return signature.cachePath;
    await rm(signature.cachePath, { force: true });
  }
  const key = signature.cachePath;
  const running = previewJobs.get(key);
  if (running) return running;
  if (snapshot()?.runnerStatus === 'running') throw new Error('SHEET_PREVIEW_BUSY_RUNNER');
  const job = (async () => {
    await mkdir(previewRoot, { recursive: true });
    const source = (await readFile(previewScriptPath, 'utf8')).replace(/^\uFEFF/, '');
    const runtimeSource = [
      `var CODEX_SHEET_PREVIEW_SOURCE_PATH = ${JSON.stringify(sourcePath.replace(/\\/g, '/'))};`,
      `var CODEX_SHEET_PREVIEW_OUTPUT_PATH = ${JSON.stringify(signature.cachePath.replace(/\\/g, '/'))};`,
      `var CODEX_SHEET_PREVIEW_RESULT_PATH = ${JSON.stringify(signature.resultPath.replace(/\\/g, '/'))};`,
      source,
    ].join('\n');
    await writeFile(signature.runtimePath, runtimeSource, 'utf8');
    await rm(signature.resultPath, { force: true });
    try {
      await execFileAsync('cscript.exe', ['//nologo', previewVbsPath, signature.runtimePath], { windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024 });
      const result = JSON.parse(await readFile(signature.resultPath, 'utf8')) as { success?: boolean; message?: string };
      if (result.success !== true) throw new Error(result.message || 'SHEET_PREVIEW_EXPORT_FAILED');
      if (!(await exists(signature.cachePath))) throw new Error('SHEET_PREVIEW_OUTPUT_MISSING');
      const previewInfo = await stat(signature.cachePath);
      if (previewInfo.size <= 0) throw new Error('SHEET_PREVIEW_OUTPUT_EMPTY');
      return signature.cachePath;
    } finally {
      await rm(signature.runtimePath, { force: true });
      await rm(signature.resultPath, { force: true });
    }
  })();
  previewJobs.set(key, job);
  try { return await job; } finally { previewJobs.delete(key); }
}

app.get('/health', async () => ({ ok: true, service: 'acrylic-control-api', version: '0.1.0', now: new Date().toISOString() }));
app.get('/api/v1/status', async () => snapshot());
app.get('/api/v1/dashboard', async () => dashboard(snapshot()));
app.get('/api/v1/queue', async () => files('Images'));
app.get('/api/v1/errors', async () => files('images_error'));
app.get('/api/v1/wait', async () => files('wait'));
app.get('/api/v1/outputs', async () => ({ ai: files('output_ai'), front: files('output_front'), back: files('output_back'), lazer: files('output_lazer') }));
app.get('/api/v1/history/snapshots', async () => database.listSnapshots(toolId, machineId, 100));
app.get('/api/v1/history/events', async () => database.recentEvents(200));
app.get('/api/v1/integrations/nocodb', async () => ({ enabled: Boolean(process.env.NOCODB_BASE_URL && process.env.NOCODB_API_TOKEN), eventsTableConfigured: Boolean(process.env.NOCODB_EVENTS_TABLE_ID), snapshotsTableConfigured: Boolean(process.env.NOCODB_SNAPSHOTS_TABLE_ID) }));
app.get('/api/v1/sheet-preview', async (request, reply) => {
  const slot = String((request.query as { slot?: string } | undefined)?.slot ?? 'before').toLowerCase();
  const latestWait = latestWaitAi();
  let sourcePath = templatePath;
  if (slot === 'after' && latestWait?.fullPath && latestWait.sizeBytes <= maxPreviewAiBytes) sourcePath = latestWait.fullPath;
  try {
    const previewPath = await generateSheetPreview(sourcePath);
    return reply.type('image/png').header('Cache-Control', 'no-store').header('X-Acrylic-Preview-Source', sourcePath).send(createReadStream(previewPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (sourcePath !== templatePath) {
      try {
        const previewPath = await generateSheetPreview(templatePath);
        return reply.type('image/png').header('Cache-Control', 'no-store').header('X-Acrylic-Preview-Source', templatePath).header('X-Acrylic-Preview-Fallback', 'template').send(createReadStream(previewPath));
      } catch {}
    }
    const statusCode = message === 'SHEET_PREVIEW_BUSY_RUNNER' ? 409 : 500;
    return reply.code(statusCode).send({ error: message, sourcePath, slot });
  }
});
app.get<{ Params: { scope: string }; Querystring: { path?: string } }>('/api/v1/files/:scope', async (request, reply) => {
  const rootPath = fileScopes[request.params.scope];
  if (!rootPath) return reply.code(404).send({ error: 'UNKNOWN_SCOPE' });
  const relativePath = String(request.query.path ?? '');
  const resolvedRoot = path.resolve(rootPath);
  const resolvedFile = path.resolve(rootPath, relativePath);
  if (!relativePath || (!resolvedFile.toLowerCase().startsWith(resolvedRoot.toLowerCase() + path.sep) && resolvedFile.toLowerCase() !== resolvedRoot.toLowerCase())) return reply.code(400).send({ error: 'INVALID_PATH' });
  const extension = path.extname(resolvedFile).toLowerCase();
  if (extension === '.png') reply.type('image/png');
  else if (extension === '.jpg' || extension === '.jpeg') reply.type('image/jpeg');
  else return reply.code(415).send({ error: 'PREVIEW_NOT_SUPPORTED' });
  return reply.send(createReadStream(resolvedFile));
});
app.get('/api/v1/events', async (request, reply) => {
  reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const writeSnapshot = () => reply.raw.write('event: snapshot\ndata: ' + JSON.stringify(dashboard(snapshot())) + '\n\n');
  writeSnapshot();
  const timer = setInterval(writeSnapshot, 500);
  request.raw.on('close', () => clearInterval(timer));
});

if (process.env.ACRYLIC_API_SMOKE === '1') {
  const response = await app.inject({ method: 'GET', url: '/health' });
  console.log(response.body);
  database.close();
  await app.close();
} else {
  await app.listen({ host: '0.0.0.0', port });
  console.log('Acrylic Control API listening on http://0.0.0.0:' + port);
}