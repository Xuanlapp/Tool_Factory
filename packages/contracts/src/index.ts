export type ToolId = string;
export type MachineId = string;
export type RunId = string;
export type SheetId = string;
export type ItemId = string;

export type RunnerStatus = 'idle' | 'starting' | 'running' | 'paused' | 'checkpoint' | 'stopping' | 'error' | 'offline';
export type ItemStatus = 'queued' | 'doing' | 'placed' | 'partial' | 'no_fit' | 'error' | 'done';
export type OutputKind = 'wait' | 'ai' | 'front' | 'back' | 'lazer';

export interface PlatformIdentity { toolId: ToolId; machineId: MachineId; }
export interface RunRef extends PlatformIdentity { runId: RunId; startedAt: string; finishedAt?: string; status: RunnerStatus; }
export interface SheetSnapshot { sheetId: SheetId; runId: RunId; index: number; source: 'template' | 'wait'; sourcePath: string; waitCapInch?: number; placedItemCount: number; status: 'open' | 'saved_wait' | 'saved_output' | 'error'; }
export interface ItemSnapshot { itemId: ItemId; runId?: RunId; sheetId?: SheetId; fileName: string; imagePath: string; sizeInch?: number; sideCount?: number; requestedQty?: number; placedQty?: number; status: ItemStatus; step?: string; updatedAt: string; }
export interface ErrorSnapshot { errorId: string; itemId?: ItemId; runId?: RunId; sheetId?: SheetId; code: string; step: string; message: string; expected?: string; actual?: string; createdAt: string; }
export interface OutputSnapshot { outputId: string; runId?: RunId; sheetId?: SheetId; kind: OutputKind; filePath: string; createdAt: string; }
export interface FolderFileEntry { path: string; relativePath?: string; name: string; sizeBytes: number; modifiedAt: string; errorMeta?: Record<string, unknown>; waitManifest?: Record<string, unknown>; }
export interface RunnerProgress { index: number; total: number; state: string; imageBaseName?: string; message?: string; updatedAt: string; sourcePath: string; }
export interface FolderHealth { reachable: boolean; network: boolean; mappedDrive?: string; uncResolved?: boolean; warning?: string; }
export interface AgentSnapshot extends PlatformIdentity { capturedAt: string; runnerStatus: RunnerStatus; illustratorConnected: boolean; folders: Record<string, FolderFileEntry[]>; folderPaths?: Record<string, string>; folderHealth?: Record<string, FolderHealth>; folderPathWarnings?: Record<string, string>; activeRun?: RunRef; activeSheet?: SheetSnapshot; runnerProgress?: RunnerProgress; }
export interface HealthResponse { ok: boolean; service: string; version: string; now: string; }
