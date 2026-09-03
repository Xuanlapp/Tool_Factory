import type { AgentSnapshot, FolderFileEntry, RunnerStatus } from '@acrylic/contracts';
import { apiBase, demoMode, fileDate, fileSize, fileTime, isStickerProduct, parseFileIdentity, parseItemName, parseSizeInch, readJson, sortLikeTool, vietnamTime } from './client';
import { mockData } from './mock';
import type { DashboardData, DashboardSummary, DoneItem, ErrorItem, OutputGroup, QueueItem, RunHistory, SettingsView, SheetView, SideMode, WaitFile, WaitItem } from './types';

interface ApiOutputs {
  ai: FolderFileEntry[];
  front: FolderFileEntry[];
  back: FolderFileEntry[];
  lazer: FolderFileEntry[];
}

const WAIT_MIN_CAP_INCH = 3;

function fixVietnameseText(value: unknown) {
  let text = String(value ?? '');
  const replacements: Array<[string, string]> = [
    ['kh?ng', 'kh?ng'], ['c?n', 'c?n'], ['tr?i', 'tr?i'], ['ph?i', 'ph?i'], ['l?ch', 'l?ch'],
    ['Kh?ng', 'Kh?ng'], ['Lazer kh?ng c?n tr?i/ph?i', 'Lazer kh?ng c?n tr?i/ph?i'],
    ['kh?ng', 'kh?ng'], ['c?n', 'c?n'], ['tr?i', 'tr?i'], ['ph?i', 'ph?i'], ['l?ch', 'l?ch'],
    ['d??i', 'd??i'], ['??t', '??t'], ['?i?u ki?n', '?i?u ki?n'],
  ];
  for (const [from, to] of replacements) text = text.split(from).join(to);
  return text;
}

function byDateDesc<T extends { modifiedAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(b.modifiedAt ?? 0).getTime() - new Date(a.modifiedAt ?? 0).getTime());
}

function waitCapOf(name: string): number {
  const match = name.match(/wait_(\d+(?:-\d+)?)/i);
  return match ? Number(match[1].replace('-', '.')) : 0;
}

function activeWaitFile(waitFiles: FolderFileEntry[]) {
  const aiWaits = waitFiles.filter((file) => isStickerProduct ? /_wait_[\d_]+\.ai$/i.test(file.name) : /wait_\d+(?:-\d+)?\.ai$/i.test(file.name));
  if (isStickerProduct) return aiWaits.sort((a, b) => new Date(b.modifiedAt ?? 0).getTime() - new Date(a.modifiedAt ?? 0).getTime())[0] ?? null;
  return aiWaits.sort((a, b) => waitCapOf(a.name) - waitCapOf(b.name))[0] ?? null;
}

function mapWaitItems(file: FolderFileEntry, previewFiles: FolderFileEntry[] = []): WaitItem[] {
  const manifest = file.waitManifest as { items?: Array<Record<string, unknown>> } | undefined;
  return (manifest?.items ?? []).map((item, index) => {
    const fileName = String(item.fileName ?? `item-${index + 1}`);
    const parsed = parseItemName(fileName);
    const previewFile = previewFiles.find((candidate) => candidate.name.toLowerCase() === fileName.toLowerCase());
    return {
      id: `${file.path}#${index}`,
      fileName,
      previewScope: previewFile ? (previewFile as FolderFileEntry & { previewScope?: string }).previewScope ?? 'Images' : undefined,
      previewRelativePath: previewFile?.relativePath ?? previewFile?.name,
      sizeInch: Number(item.sizeInch ?? parsed.sizeInch),
      side: (String(item.side ?? parsed.side) || parsed.side) as SideMode,
      qtyPlaced: Number(item.qtyPlaced ?? 1),
      qtyRemaining: Number(item.qtyRemaining ?? 0),
    };
  });
}

function mapWaitFile(file: FolderFileEntry, previewFiles: FolderFileEntry[] = []): WaitFile {
  const manifest = file.waitManifest as { fitCapInch?: unknown; savedAt?: unknown; printedAt?: unknown } | undefined;
  const itemList = mapWaitItems(file, previewFiles);
  const version = encodeURIComponent(file.modifiedAt ?? String(manifest?.savedAt ?? file.name));
  return {
    fileName: file.name,
    relativePath: file.relativePath ?? file.name,
    updatedAt: fileTime(file),
    modifiedAt: file.modifiedAt,
    fitCapInch: Number(manifest?.fitCapInch ?? (isStickerProduct ? 0 : waitCapOf(file.name))),
    savedAt: typeof manifest?.savedAt === 'string' ? manifest.savedAt : undefined,
    printedAt: typeof manifest?.printedAt === 'string' ? manifest.printedAt : undefined,
    items: itemList.length,
    itemList,
    previewUrl: `${apiBase}/wait-preview?path=${encodeURIComponent(file.relativePath ?? file.name)}&v=${version}`,
  };
}
function mapQueue(files: FolderFileEntry[], summary: DashboardSummary, waitFiles: FolderFileEntry[]): QueueItem[] {
  const activeWait = activeWaitFile(waitFiles);
  const waitCap = activeWait ? waitCapOf(activeWait.name) : null;
  const runningBase = summary.runnerStatus === 'running' ? String(summary.progress?.imageBaseName ?? '').toLowerCase() : '';
  return sortLikeTool(files).map((file, index) => {
    const parsed = parseItemName(file.name);
    const identity = parseFileIdentity(file.name);
    const isCurrent = Boolean(runningBase) && file.name.toLowerCase().startsWith(runningBase);
    const waitMismatch = !isStickerProduct && waitCap !== null && parsed.sizeInch > waitCap + 0.0001;
    return {
      id: file.path,
      priority: index + 1,
      fileName: file.name,
      imagePath: file.path,
      previewScope: 'Images',
      previewRelativePath: file.relativePath ?? file.name,
      sizeInch: parsed.sizeInch,
      side: parsed.side,
      qty: parsed.qty,
      placed: 0,
      remaining: parsed.qty,
      status: isCurrent ? 'running' : waitMismatch ? 'wait_mismatch' : 'queued',
      waitFile: activeWait?.name,
      pixelSize: '—',
      dpi: 0,
      sourceFolder: 'Images',
      detectedAt: fileTime(file),
      ...identity,
    };
  });
}

function mapSheet(summary: DashboardSummary, waitFiles: FolderFileEntry[], previewFiles: FolderFileEntry[] = []): SheetView {
  const running = summary.runnerStatus === 'running';
  const activeWait = activeWaitFile(waitFiles);
  const waitCap = activeWait ? waitCapOf(activeWait.name) : 0;
  const currentName = running ? String(summary.progress?.imageBaseName ?? '') : undefined;
  const version = encodeURIComponent(summary.capturedAt ?? activeWait?.modifiedAt ?? 'template');
  const beforePreviewUrl = `${apiBase}/sheet-preview?slot=before&v=${version}`;
  const afterPreviewUrl = `${apiBase}/sheet-preview?slot=after&v=${version}`;
  return {
    id: running ? 'Đang chạy' : '—',
    status: running ? 'running' : 'idle',
    placed: running ? Number(summary.progress?.index ?? 0) : 0,
    total: running ? Number(summary.progress?.total ?? 0) : 0,
    fitCapInch: waitCap,
    remainingFitInch: 0,
    spacingCm: 0.2,
    waitDecision: running ? (waitCap > WAIT_MIN_CAP_INCH ? 'Giữ wait' : 'Sẽ ra output') : 'Chưa chạy',
    currentWaitFile: activeWait?.name ?? '—',
    items: currentName ? [{ index: Number(summary.progress?.index ?? 1), fileName: currentName, turn: '—', sizeInch: parseSizeInch(currentName), rotation: '—', position: 'Đang chờ dữ liệu', status: 'running' }] : [],
    waitFiles: waitFiles.filter((file) => isStickerProduct ? /_wait_[\d_]+\.ai$/i.test(file.name) : /wait_\d+(?:-\d+)?\.ai$/i.test(file.name)).sort((a, b) => isStickerProduct ? new Date(b.modifiedAt ?? 0).getTime() - new Date(a.modifiedAt ?? 0).getTime() : waitCapOf(a.name) - waitCapOf(b.name)).map((file) => mapWaitFile(file, previewFiles)),
    beforePreviewLabel: activeWait?.name ? `Preview từ ${activeWait.name}` : 'Preview từ template mặc định',
    afterPreviewLabel: running ? 'EYE + BORDER từ sheet đã lưu gần nhất' : 'EYE + BORDER của wait/template hiện tại',
    beforePreviewUrl,
    afterPreviewUrl,
    currentItemName: currentName,
  };
}

function stripDoneBase(name: string) {
  return name.replace(/_\d+(?:-\d+)?in_qty_\d+\.[a-z0-9]+$/i, '').replace(/_qty_\d+\.[a-z0-9]+$/i, '').replace(/\.[a-z0-9]+$/i, '');
}

function mapDone(files: FolderFileEntry[]): DoneItem[] {
  return byDateDesc(files).map((file) => {
    const parsed = parseItemName(file.name);
    const relative = file.relativePath ?? file.name;
    const monthMatch = relative.match(/thang(\d+)/i);
    const dateMatch = relative.match(/(\d+-\d+-\d+)/);
    return {
      id: file.path,
      fileName: file.name,
      previewScope: 'imgaes_done',
      previewRelativePath: relative,
      sizeInch: parsed.sizeInch,
      side: parsed.side,
      requestedQty: parsed.qty,
      placedQty: parsed.qty,
      sheet: 'Chưa có dữ liệu',
      completedAt: fileTime(file),
      completedDate: dateMatch ? dateMatch[1] : fileDate(file),
      status: 'complete',
      sourceGroup: stripDoneBase(file.name),
      outputs: [],
      monthFolder: monthMatch ? `thang${monthMatch[1]}` : undefined,
      dateFolder: dateMatch ? dateMatch[1] : undefined,
    };
  });
}

function mapErrors(files: FolderFileEntry[]): ErrorItem[] {
  return byDateDesc(files).map((file) => {
    const parsed = parseItemName(file.name);
    return {
      id: file.path,
      fileName: file.name,
      previewScope: 'images_error',
      previewRelativePath: file.relativePath ?? file.name,
      sizeInch: parsed.sizeInch,
      side: parsed.side,
      qty: parsed.qty,
      step: String(file.errorMeta?.step ?? 'UNKNOWN') as ErrorItem['step'],
      reason: String(file.errorMeta?.reason ?? 'Chưa có dữ liệu chi tiết lỗi trong cơ sở dữ liệu'),
      time: fileTime(file),
      actual: file.errorMeta?.actual ? fixVietnameseText(file.errorMeta.actual) : undefined,
      expected: file.errorMeta?.expected ? fixVietnameseText(file.errorMeta.expected) : undefined,
    };
  });
}

function outputBase(name: string) {
  return name.replace(/^lazer_/i, '').replace(/_(front|back|lazer)(?=\.(ai|png)$)/i, '').replace(/\.(ai|png)$/i, '');
}

function mapOutputs(outputs: ApiOutputs): OutputGroup[] {
  return byDateDesc(outputs.ai).map((file) => {
    const base = outputBase(file.name);
    const front = outputs.front.find((item) => outputBase(item.name) === base);
    const back = outputs.back.find((item) => outputBase(item.name) === base);
    const lazer = outputs.lazer.find((item) => outputBase(item.name) === base);
    const exported = Boolean(front && lazer);
    return {
      id: file.path,
      date: fileDate(file),
      sheet: '—',
      fileName: file.name,
      outputAiRelativePath: file.relativePath ?? file.name,
      previewScope: 'output_front',
      previewRelativePath: front?.relativePath ?? front?.name,
      completedAt: fileTime(file),
      status: exported ? 'exported' : 'processing',
      assets: [
        { kind: 'AI', fileName: file.name, format: 'Adobe Illustrator', detail: fileSize(file.sizeBytes), size: fileSize(file.sizeBytes), time: fileTime(file), status: 'exported' },
        { kind: 'FRONT', fileName: front?.name ?? '—', format: 'PNG', detail: front ? '300 DPI' : '—', size: fileSize(front?.sizeBytes), time: fileTime(front), status: front ? 'exported' : 'processing', previewScope: front ? 'output_front' : undefined, previewRelativePath: front?.relativePath ?? front?.name, previewVersion: front?.modifiedAt },
        { kind: 'BACK', fileName: back?.name ?? '—', format: 'PNG', detail: back ? '300 DPI' : '—', size: fileSize(back?.sizeBytes), time: fileTime(back), status: back ? 'exported' : 'processing', previewScope: back ? 'output_back' : undefined, previewRelativePath: back?.relativePath ?? back?.name, previewVersion: back?.modifiedAt },
        { kind: 'LAZER', fileName: lazer?.name ?? '—', format: 'Illustrator 8', detail: fileSize(lazer?.sizeBytes), size: fileSize(lazer?.sizeBytes), time: fileTime(lazer), status: lazer ? 'exported' : 'processing', previewScope: lazer ? 'output_lazer' : undefined, previewRelativePath: lazer?.relativePath ?? lazer?.name, previewVersion: lazer?.modifiedAt },
      ],
    };
  });
}

function eventTime(value: unknown) {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function mapHistory(events: Array<Record<string, unknown>>, summary: DashboardSummary): RunHistory[] {
  if (!events.length) return [];
  const timeline = events.slice(0, 30).map((event) => {
    const eventType = String(event.event_type ?? event.type ?? 'event');
    const level = eventType.includes('error') ? 'error' : 'info';
    let message = String(event.message ?? '');
    if (!message && event.payload_json) {
      try { message = JSON.stringify(JSON.parse(String(event.payload_json))); } catch { message = String(event.payload_json); }
    }
    return { time: eventTime(event.occurred_at ?? event.createdAt), event: eventType, message: message.slice(0, 180), level: level as 'info' | 'warning' | 'error' };
  });
  return [{ id: 'events-recent', startedAt: timeline[timeline.length - 1]?.time ?? '—', duration: '—', sheets: 0, items: summary.progress?.index ?? 0, errors: timeline.filter((item) => item.level === 'error').length, status: summary.runnerStatus === 'running' ? 'running' : 'completed', currentFile: summary.currentFile, timeline }];
}

function mapSettings(snapshot: AgentSnapshot | null, nocodb: SettingsView['nocodb']): SettingsView {
  return {
    folders: Object.entries(snapshot?.folders ?? {}).map(([key, files]) => ({ key, label: key, path: snapshot?.folderPaths?.[key] ?? (files[0]?.path ? files[0].path.slice(0, files[0].path.lastIndexOf('\\')) : '—'), valid: Boolean(snapshot), files: files.length, writable: !key.toLowerCase().includes('template') })),
    nocodb,
    sqlite: snapshot ? 'healthy' : 'warning',
    illustrator: snapshot?.illustratorConnected ? 'connected' : 'offline',
    lastCheck: snapshot?.capturedAt ? new Date(snapshot.capturedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—',
  };
}

function buildSummary(snapshot: AgentSnapshot | null, outputs: ApiOutputs): DashboardSummary {
  const running = snapshot?.runnerStatus === 'running';
  return {
    capturedAt: snapshot?.capturedAt ?? null,
    runnerStatus: snapshot?.runnerStatus ?? 'idle',
    illustratorConnected: snapshot?.illustratorConnected ?? false,
    currentFile: running ? (snapshot?.runnerProgress?.imageBaseName ?? 'Đang chạy') : '—',
    progress: running ? (snapshot?.runnerProgress ?? null) : null,
    kpi: {
      queue: snapshot?.folders.Images?.length ?? 0,
      processing: running && snapshot?.runnerProgress?.total ? 1 : 0,
      done: snapshot?.folders.imgaes_done?.length ?? 0,
      errors: snapshot?.folders.images_error?.length ?? 0,
      wait: snapshot?.folders.wait?.length ?? 0,
      outputAi: outputs.ai.length,
      outputFront: outputs.front.length,
      outputBack: outputs.back.length,
      outputLazer: outputs.lazer.length,
    },
  };
}

function disconnectedDashboard(errorMessage: string): DashboardData {
  return {
    source: 'api',
    degraded: true,
    failedSources: [errorMessage],
    summary: { ...mockData.summary, capturedAt: new Date().toISOString(), runnerStatus: 'idle', illustratorConnected: false, currentFile: '—', progress: null, kpi: { queue: 0, processing: 0, done: 0, errors: 0, wait: 0, outputAi: 0, outputFront: 0, outputBack: 0, outputLazer: 0 } },
    queue: [],
    sheet: { ...mockData.sheet, id: '—', status: 'idle', placed: 0, total: 0, items: [], waitFiles: [], currentWaitFile: '—', waitDecision: 'Chưa kết nối agent' },
    done: [],
    processed: [],
    errors: [],
    outputs: [],
    history: [],
    settings: { ...mockData.settings, illustrator: 'offline', lastCheck: new Date().toISOString(), folders: mockData.settings.folders.map((folder) => ({ ...folder, files: 0, valid: false, writable: false })) },
  };
}
export async function getDashboardData(): Promise<DashboardData> {
  try {
    const [status, queueFiles, errorFiles, waitFiles, outputs, events, nocodb] = await Promise.all([
      readJson<AgentSnapshot | null>('/status'),
      readJson<FolderFileEntry[]>('/queue'),
      readJson<FolderFileEntry[]>('/errors'),
      readJson<FolderFileEntry[]>('/wait'),
      readJson<ApiOutputs>('/outputs'),
      readJson<Array<Record<string, unknown>>>('/history/events'),
      readJson<SettingsView['nocodb']>('/integrations/nocodb'),
    ]);
    const summary = buildSummary(status, outputs);
    const queue = summary.runnerStatus === 'running' ? [] : mapQueue(queueFiles, summary, waitFiles);
    return {
      source: 'api',
      summary,
      queue,
      sheet: mapSheet(summary, waitFiles, [...(status?.folders.Images ?? []).map((file) => ({ ...file, previewScope: 'Images' })), ...(status?.folders.imgaes_done ?? []).map((file) => ({ ...file, previewScope: 'imgaes_done' })), ...(status?.folders.images_error ?? []).map((file) => ({ ...file, previewScope: 'images_error' }))]),
      done: mapDone(status?.folders.imgaes_done ?? []),
      processed: mapDone(status?.folders.images_processed ?? []),
      errors: mapErrors(errorFiles),
      outputs: mapOutputs(outputs),
      history: mapHistory(events, summary),
      settings: mapSettings(status, nocodb),
    };
  } catch (error) {
    if (demoMode) return mockData;
    return disconnectedDashboard(String(error instanceof Error ? error.message : error));
  }
}

export function subscribeDashboard(onData: (summary: Partial<DashboardSummary>) => void) {
  const events = new EventSource(apiBase + '/events');
  events.addEventListener('snapshot', (event) => {
    const payload = JSON.parse((event as MessageEvent).data) as { capturedAt?: string | null; runnerStatus?: RunnerStatus; illustratorConnected?: boolean; progress?: AgentSnapshot['runnerProgress'] | null; kpi?: Partial<DashboardSummary['kpi']> };
    const running = payload.runnerStatus === 'running';
    onData({
      capturedAt: payload.capturedAt ?? null,
      runnerStatus: payload.runnerStatus ?? 'idle',
      illustratorConnected: Boolean(payload.illustratorConnected),
      currentFile: running ? String(payload.progress?.imageBaseName ?? 'Đang chạy') : '—',
      progress: running ? (payload.progress ?? null) : null,
      kpi: {
        queue: payload.kpi?.queue ?? 0,
        processing: running && payload.progress?.total ? 1 : 0,
        done: payload.kpi?.done ?? 0,
        errors: payload.kpi?.errors ?? 0,
        wait: payload.kpi?.wait ?? 0,
        outputAi: payload.kpi?.outputAi ?? 0,
        outputFront: payload.kpi?.outputFront ?? 0,
        outputBack: payload.kpi?.outputBack ?? 0,
        outputLazer: payload.kpi?.outputLazer ?? 0,
      },
    });
  });
  return () => events.close();
}
