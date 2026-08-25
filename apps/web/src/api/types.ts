import type { AgentSnapshot, FolderFileEntry, RunnerStatus } from '@acrylic/contracts';

export type AppRouteId = 'overview' | 'queue' | 'sheets' | 'done' | 'processed' | 'errors' | 'outputs' | 'history' | 'settings';
export type SideMode = '1 side' | '2 side' | 'Lazer';
export type JobStatus = 'queued' | 'waiting' | 'running' | 'placed' | 'partial' | 'wait_mismatch' | 'error' | 'done';
export type ErrorStep = 'IMPORT_SIZE' | 'FRONT_BACK' | 'LAZER' | 'SAVE' | 'PACKING' | 'UNKNOWN';

export interface DashboardKpi {
  queue: number;
  processing: number;
  done: number;
  errors: number;
  wait: number;
  outputAi: number;
  outputFront: number;
  outputBack: number;
  outputLazer: number;
}

export interface DashboardSummary {
  capturedAt: string | null;
  runnerStatus: RunnerStatus;
  illustratorConnected: boolean;
  currentFile: string;
  progress: AgentSnapshot['runnerProgress'] | null;
  kpi: DashboardKpi;
}

export interface QueueItem {
  id: string;
  priority: number;
  fileName: string;
  imagePath?: string;
  previewScope?: string;
  previewRelativePath?: string;
  sizeInch: number;
  side: SideMode;
  qty: number;
  placed: number;
  remaining: number;
  status: JobStatus;
  waitFile?: string;
  pixelSize: string;
  dpi: number;
  sourceFolder: string;
  detectedAt: string;
  orderId?: string;
  itemId?: string;
  sideLabel?: string;
  sizeLabel?: string;
  qtyLabel?: string;
}

export interface SheetItem {
  index: number;
  fileName: string;
  outputAiRelativePath?: string;
  previewScope?: string;
  previewRelativePath?: string;
  turn: string;
  sizeInch: number;
  rotation: string;
  position: string;
  status: JobStatus;
}

export interface WaitItem {
  id: string;
  fileName: string;
  previewScope?: string;
  previewRelativePath?: string;
  sizeInch: number;
  side: SideMode;
  qtyPlaced: number;
  qtyRemaining: number;
}

export interface WaitFile {
  fileName: string;
  relativePath?: string;
  updatedAt: string;
  modifiedAt?: string;
  items: number;
  fitCapInch: number;
  savedAt?: string;
  printedAt?: string;
  previewUrl?: string;
  itemList: WaitItem[];
}

export interface SheetView {
  id: string;
  status: 'running' | 'saved_wait' | 'saved_output' | 'idle';
  placed: number;
  total: number;
  fitCapInch: number;
  remainingFitInch: number;
  spacingCm: number;
  waitDecision: string;
  currentWaitFile: string;
  items: SheetItem[];
  waitFiles: WaitFile[];
  beforePreviewLabel?: string;
  afterPreviewLabel?: string;
  beforePreviewUrl?: string;
  afterPreviewUrl?: string;
  currentItemName?: string;
}

export interface DoneItem {
  id: string;
  fileName: string;
  outputAiRelativePath?: string;
  previewScope?: string;
  previewRelativePath?: string;
  sizeInch: number;
  side: SideMode;
  requestedQty: number;
  placedQty: number;
  sheet: string;
  completedAt: string;
  completedDate: string;
  status: 'complete' | 'partial';
  sourceGroup: string;
  outputs: string[];
  monthFolder?: string;
  dateFolder?: string;
}

export interface ErrorItem {
  id: string;
  fileName: string;
  outputAiRelativePath?: string;
  previewScope?: string;
  previewRelativePath?: string;
  sizeInch: number;
  side: SideMode;
  qty: number;
  step: ErrorStep;
  reason: string;
  time: string;
  actual?: string;
  expected?: string;
  delta?: string;
  sheet?: string;
  runId?: string;
}

export interface OutputAsset {
  kind: 'AI' | 'FRONT' | 'BACK' | 'LAZER';
  fileName: string;
  format: string;
  detail: string;
  size: string;
  time: string;
  status: 'exported' | 'processing' | 'error';
  previewScope?: string;
  previewRelativePath?: string;
  previewVersion?: string;
}

export interface OutputGroup {
  id: string;
  date: string;
  sheet: string;
  fileName: string;
  outputAiRelativePath?: string;
  previewScope?: string;
  previewRelativePath?: string;
  completedAt: string;
  status: 'exported' | 'processing' | 'error';
  assets: OutputAsset[];
}

export interface RunHistory {
  id: string;
  startedAt: string;
  duration: string;
  sheets: number;
  items: number;
  errors: number;
  status: 'running' | 'completed' | 'failed';
  currentFile: string;
  timeline: Array<{ time: string; event: string; message: string; level: 'info' | 'warning' | 'error' }>;
}

export interface FolderSetting {
  key: string;
  label: string;
  path: string;
  valid: boolean;
  files: number;
  writable: boolean;
  network?: boolean;
  mappedDrive?: string;
  warning?: string;
}

export interface SettingsView {
  folders: FolderSetting[];
  checkSettings?: { checkImageSize: boolean; checkTwoSideFaceOffset: boolean; faceToleranceCm: number; cutToleranceCm: number };
  nocodb: { enabled: boolean; eventsTableConfigured: boolean; snapshotsTableConfigured: boolean };
  sqlite: 'healthy' | 'warning';
  illustrator: 'connected' | 'offline';
  lastCheck: string;
}

export interface DashboardData {
  summary: DashboardSummary;
  queue: QueueItem[];
  sheet: SheetView;
  done: DoneItem[];
  processed: DoneItem[];
  errors: ErrorItem[];
  outputs: OutputGroup[];
  history: RunHistory[];
  settings: SettingsView;
  source: 'api' | 'mock';
  degraded?: boolean;
  failedSources?: string[];
}

export type { FolderFileEntry };
