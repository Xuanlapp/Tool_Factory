import type { FolderFileEntry } from './types';

const isHoloProduct = window.location.pathname === '/holo' || window.location.pathname.startsWith('/holo/');
export const isStickerProduct = window.location.pathname === '/sticker' || window.location.pathname.startsWith('/sticker/');
export const apiBase = import.meta.env.VITE_ACRYLIC_API_BASE ?? (isHoloProduct ? '/api/v1/holo' : isStickerProduct ? '/api/v1/sticker' : '/api/v1');
export const demoMode = String(import.meta.env.VITE_DEMO_MODE ?? '').toLowerCase() === 'true';
const vietnamTimeZone = 'Asia/Ho_Chi_Minh';

export function vietnamTime(value?: string | Date, withSeconds = true) {
  if (!value) return '?';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '?';
  return date.toLocaleTimeString('vi-VN', { timeZone: vietnamTimeZone, hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}) });
}

export function vietnamDateTime(value?: string | Date) {
  if (!value) return '?';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '?' : date.toLocaleString('vi-VN', { timeZone: vietnamTimeZone });
}

export async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(apiBase + path);
  if (!response.ok) throw new Error(`${path} -> ${response.status}`);
  return response.json() as Promise<T>;
}

export function thumbnailUrl(scope?: string, relativePath?: string, fileName?: string, version?: string) {
  const path = relativePath ?? fileName;
  if (!scope || !path) return undefined;
  const cacheKey = version ? `&v=${encodeURIComponent(version)}` : '';
  return `${apiBase}/thumbnails/${encodeURIComponent(scope)}?path=${encodeURIComponent(path)}${cacheKey}`;
}

export function previewUrl(scope?: string, relativePath?: string, fileName?: string, version?: string) {
  const path = relativePath ?? fileName;
  if (!scope || !path) return undefined;
  const cacheKey = version ? `&v=${encodeURIComponent(version)}` : '';
  return `${apiBase}/files/${encodeURIComponent(scope)}?path=${encodeURIComponent(path)}${cacheKey}`;
}

export function fileTime(file?: FolderFileEntry) {
  return file?.modifiedAt ? new Date(file.modifiedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
}

export function fileDate(file?: FolderFileEntry) {
  return file?.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('vi-VN') : '—';
}

export function fileSize(sizeBytes?: number) {
  if (!sizeBytes) return '0 KB';
  if (sizeBytes > 1024 * 1024) return `${(sizeBytes / 1024 / 1024).toFixed(1)}MB`;
  return `${(sizeBytes / 1024).toFixed(1)}KB`;
}

export function parseSizeInch(name: string): number {
  const match = name.toLowerCase().match(/(?:^|[-_])(\d+(?:-\d+)?)in(?:[-_.]|$)/);
  return match ? Number(match[1].replace(/-/g, '.')) : 0;
}

export function parseQty(name: string): number {
  const match = name.toLowerCase().match(/(?:^|[-_])qty_(\d+)(?:[-_.]|$)/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

export function parseSideCount(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('badge-reel')) return 1;
  const match = lower.match(/(?:^|[-_])(\d+)-side(?:[-_.]|$)/);
  return match ? Number(match[1]) : 1;
}

export function parseFileIdentity(name: string) {
  const lower = name.toLowerCase();
  const sizeInch = parseSizeInch(name);
  const qty = parseQty(name);
  const sideCount = parseSideCount(name);
  const orderId = name.match(/^(\d+)/)?.[1] ?? '—';
  const itemId = lower.match(/(item\d+)/)?.[1] ?? '—';
  const sideLabel = lower.includes('badge-reel') ? `${sideCount}side` : `${sideCount}-side`;
  const sizeLabel = sizeInch > 0 ? `${String(sizeInch).replace('.', '-')}in` : '—';
  const qtyLabel = `qty_${qty}`;
  return { orderId, itemId, sideLabel, sizeLabel, qtyLabel };
}

export function parseItemName(name: string) {
  const sizeInch = parseSizeInch(name);
  const qty = parseQty(name);
  const sideCount = parseSideCount(name);
  const lower = name.toLowerCase();
  const side: '1 side' | '2 side' | 'Lazer' = lower.includes('lazer') ? 'Lazer' : sideCount <= 1 ? '1 side' : '2 side';
  return { sizeInch, qty, sideCount, side, ...parseFileIdentity(name) };
}

export function sortLikeTool<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const sizeDiff = parseSizeInch(b.name) - parseSizeInch(a.name);
    if (sizeDiff !== 0) return sizeDiff;
    const qtyDiff = parseQty(b.name) - parseQty(a.name);
    if (qtyDiff !== 0) return qtyDiff;
    return a.name.localeCompare(b.name, 'en', { numeric: true });
  });
}
