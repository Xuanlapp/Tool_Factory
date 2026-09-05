// @ts-nocheck
import { readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';
import { runStartTestPrecheck } from './start-precheck.ts';

const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT ?? 'D:/FFACTORY/Arcylic';
const rootDir = process.cwd();
const imagesDir = process.env.ACRYLIC_IMAGES_DIR ?? path.join(factoryRoot, 'Images');
const requestedImagePath = process.env.ACRYLIC_TEST_IMAGE_PATH?.trim();
const templatePath = process.env.ACRYLIC_TEMPLATE_PATH ?? path.join(factoryRoot, 'template', 'Template_UVDTF.ai');
const runtimeDir = path.join(rootDir, '.runtime');
const jsxPath = path.join(rootDir, 'scripts', 'test-import-one-image.runtime.jsx');
const resultPath = path.join(runtimeDir, 'test-import-one-image.result.json');
const vbsPath = path.join(rootDir, 'scripts', 'launch-illustrator-and-run.vbs');
const faceToleranceCm = Math.max(0, Number(process.env.ACRYLIC_CHECK_FACE_TOLERANCE_CM ?? 0.034));
const cutToleranceCm = Math.max(0, Number(process.env.ACRYLIC_CHECK_CUT_TOLERANCE_CM ?? 0.05));

function sideCountFor(imagePath: string) { return /(?:^|[_-])2-side(?:[_-]|$)/.test(path.basename(imagePath).toLowerCase()) ? 2 : 1; }
function expectedHeightFor(imagePath: string) { return sideCountFor(imagePath) >= 2 ? '91.44' : '60.96'; }
function toJsxPath(value: string) { return value.replace(/\\/g, '/'); }
async function firstPng() {
  if (requestedImagePath) {
    if (!existsSync(requestedImagePath) || path.extname(requestedImagePath).toLowerCase() !== '.png') throw new Error('Ảnh test được chỉ định không tồn tại hoặc không phải PNG.');
    return requestedImagePath;
  }
  const entries = await readdir(imagesDir, { withFileTypes: true });
  const found = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png') && entry.name.toLowerCase() !== 'thumbs.db').map((entry) => path.join(imagesDir, entry.name)).sort()[0];
  if (!found) throw new Error('Không có ảnh PNG trong folder Images để test import.');
  return found;
}
function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(command + ' exited with code ' + code)));
  });
}
function colorRegionCheckLines(colorRegions: { regions: Record<string, any> }) {
  return Object.entries(colorRegions.regions).map(([label, region]) => {
    const readable = Number(region?.pixels ?? 0) > 0 && region?.empty !== true;
    return 'TEST_COLOR_' + label + ': ' + (readable ? 'true' : 'false')
      + ' | pixels=' + Number(region?.pixels ?? 0)
      + (readable ? ' | minX=' + region.minX + ' | minY=' + region.minY + ' | maxX=' + region.maxX + ' | maxY=' + region.maxY + ' | widthPx=' + region.widthPx + ' | heightPx=' + region.heightPx : ' | reason=NO_COLOR_PIXELS');
  });
}

function readColorRegions(buffer: Buffer, sideCount: number) {
  const png = PNG.sync.read(buffer);
  const labels = sideCount >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  const regionHeight = Math.floor(png.height / labels.length);
  const regions: Record<string, unknown> = {};
  for (let index = 0; index < labels.length; index += 1) {
    const startY = index * regionHeight;
    const endY = index === labels.length - 1 ? png.height : startY + regionHeight;
    let minX = png.width, minY = endY, maxX = -1, maxY = -1, pixels = 0;
    let leftPoint: { x: number; y: number } | null = null, topPoint: { x: number; y: number } | null = null, leftTopPoint: { x: number; y: number } | null = null;
    const rowMap = new Map<number, { minX: number; maxX: number; pixels: number }>();
    const columnMap = new Map<number, { minY: number; maxY: number; pixels: number }>();
    for (let y = startY; y < endY; y += 1) for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const red = png.data[offset], green = png.data[offset + 1], blue = png.data[offset + 2], alpha = png.data[offset + 3];
      // White is printable artwork when it is opaque; only transparent pixels are outside the item.
      if (alpha <= 10) continue;
      pixels += 1;
      const row = rowMap.get(y) ?? { minX: x, maxX: x, pixels: 0 };
      row.minX = Math.min(row.minX, x); row.maxX = Math.max(row.maxX, x); row.pixels += 1; rowMap.set(y, row);
      const column = columnMap.get(x) ?? { minY: y, maxY: y, pixels: 0 };
      column.minY = Math.min(column.minY, y); column.maxY = Math.max(column.maxY, y); column.pixels += 1; columnMap.set(x, column);
      if (x < minX || (x === minX && y < (leftPoint?.y ?? Number.MAX_SAFE_INTEGER))) leftPoint = { x, y };
      if (y < minY || (y === minY && x < (topPoint?.x ?? Number.MAX_SAFE_INTEGER))) topPoint = { x, y };
      if (!leftTopPoint || x < leftTopPoint.x || (x === leftTopPoint.x && y < leftTopPoint.y)) leftTopPoint = { x, y };
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const leftCandidates = Array.from(rowMap.entries()).map(([y, row]) => ({ x: row.minX, y, widthPx: row.maxX - row.minX + 1, pixels: row.pixels }));
    const topCandidates = Array.from(columnMap.entries()).map(([x, column]) => ({ x, y: column.minY, heightPx: column.maxY - column.minY + 1, pixels: column.pixels }));
    regions[labels[index]] = pixels > 0 ? { pixels, minX, minY, maxX, maxY, widthPx: maxX - minX + 1, heightPx: maxY - minY + 1, leftPoint, topPoint, leftTopPoint, leftCandidates, topCandidates }   : { pixels: 0, empty: true };
  }
  return { imageWidthPx: png.width, imageHeightPx: png.height, regions };
}

async function main() {
  const imagePath = await firstPng();
  const expectedHeightCm = expectedHeightFor(imagePath);
  const sideCount = sideCountFor(imagePath);
  const imageBuffer = await readFile(imagePath);
  const colorRegions = readColorRegions(imageBuffer, sideCount);
  const png = PNG.sync.read(imageBuffer);
  // Match start: canvas dimensions are derived from the 300-DPI placement size.
  const startPrecheck = await runStartTestPrecheck(imagePath, sideCount, png.width / 300 * 2.54, png.height / 300 * 2.54, { faceToleranceCm, cutToleranceCm });
  await rm(resultPath, { force: true });
  const source = await readFile(path.join(rootDir, 'scripts', 'test-import-one-image.jsx'), 'utf8');
  await writeFile(jsxPath, [
    'var CODEX_IMAGE_PATH = ' + JSON.stringify(toJsxPath(imagePath)) + ';',
    'var CODEX_TEMPLATE_PATH = ' + JSON.stringify(toJsxPath(templatePath)) + ';',
    'var CODEX_RESULT_PATH = ' + JSON.stringify(toJsxPath(resultPath)) + ';',
    'var CODEX_TEST_EXPECTED_HEIGHT_CM = ' + JSON.stringify(expectedHeightCm) + ';',
    'var CODEX_TEST_SIDE_COUNT = ' + JSON.stringify(sideCount) + ';',
    'var CODEX_TEST_FACE_TOLERANCE_CM = ' + JSON.stringify(faceToleranceCm) + ';',
    'var CODEX_TEST_CUT_TOLERANCE_CM = ' + JSON.stringify(cutToleranceCm) + ';',
    'var CODEX_TEST_COLOR_REGIONS = ' + JSON.stringify(colorRegions) + ';',
    'var CODEX_START_PRECHECK_OK = ' + JSON.stringify(startPrecheck.ok) + ';',
    'var CODEX_START_PRECHECK_STEP = ' + JSON.stringify(startPrecheck.step) + ';',
    'var CODEX_START_PRECHECK_REASON = ' + JSON.stringify(startPrecheck.reason) + ';',
    source,
  ].join('\n'), 'utf8');
  console.log('TEST_IMPORT_ONE_IMAGE: ' + path.basename(imagePath));
  console.log('START_PRECHECK: ' + path.basename(imagePath) + ' | ' + startPrecheck.step + ' | ' + (startPrecheck.ok ? 'true' : 'false') + (startPrecheck.reason ? ' | ' + startPrecheck.reason : ''));
  for (const line of colorRegionCheckLines(colorRegions)) console.log(line);
  await run('cscript.exe', ['//nologo', vbsPath, jsxPath]);
  if (!existsSync(resultPath)) throw new Error('TEST_IMPORT_RESULT_MISSING');
  const result = JSON.parse(await readFile(resultPath, 'utf8'));
  console.log('TEST_RESULT: ' + result.message);
  if (result.success !== true) throw new Error(result.message || 'TEST_IMPORT_FAILED');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
