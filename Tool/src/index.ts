// @ts-nocheck
import { access, copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { runStartTestPrecheck } from "./start-precheck.ts";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const factoryRoot = process.env.ACRYLIC_FACTORY_ROOT ?? "D:/FFACTORY/Arcylic";
const templatePath = process.env.ACRYLIC_TEMPLATE_PATH ?? "D:/FFactory/Arcylic/template/Template_UVDTF.ai";
const imagesDir = process.env.ACRYLIC_IMAGES_DIR ?? "D:/FFactory/Arcylic/Images";
const imagesErrorDir = process.env.ACRYLIC_IMAGES_ERROR_DIR ?? "D:/FFactory/Arcylic/images_error";
const imagesErrorMetadataPath = path.join(imagesErrorDir, '.error-metadata.json');
const approvedErrorsPath = path.join(imagesDir, '.approved-errors.json');
const imagesDoneDir = process.env.ACRYLIC_IMAGES_DONE_DIR ?? "D:/FFactory/Arcylic/imgaes_done";
const runtimeDir = path.join(rootDir, ".runtime");
const outputAiDir = process.env.ACRYLIC_OUTPUT_AI_DIR ?? "D:/FFactory/Arcylic/output_ai";
const outputFrontDir = process.env.ACRYLIC_OUTPUT_FRONT_DIR ?? "D:/FFactory/Arcylic/output_front";
const outputBackDir = process.env.ACRYLIC_OUTPUT_BACK_DIR ?? "D:/FFactory/Arcylic/output_back";
const outputLazerDir = process.env.ACRYLIC_OUTPUT_LAZER_DIR ?? "D:/FFactory/Arcylic/output_lazer";
const lazerTemplatePath = process.env.ACRYLIC_LAZER_TEMPLATE_PATH ?? "D:/FFactory/Arcylic/template/Template_Lazer.ai";
const waitDir = process.env.ACRYLIC_WAIT_DIR ?? "D:/FFactory/Arcylic/wait";
const pendingCommitPath = path.join(runtimeDir, "pending-commit.json");
const waitAssetsDir = path.join(runtimeDir, "wait-assets");
const waitPreviewDir = path.join(factoryRoot, ".runtime", "wait-previews");
const ILLUSTRATOR_MAX_PNG_DIMENSION = Math.max(0, Number(process.env.ACRYLIC_ILLUSTRATOR_MAX_PNG_DIMENSION ?? 0));
const LAZER_TRACE_MAX_PNG_DIMENSION = Math.max(0, Number(process.env.ACRYLIC_LAZER_TRACE_MAX_PNG_DIMENSION ?? ILLUSTRATOR_MAX_PNG_DIMENSION));
const CHECK_FULL_PIPELINE = /^(1|true|yes)$/i.test(process.env.ACRYLIC_CHECK_FULL_PIPELINE ?? '');
const PREVIEW_SORT_ONLY = /^(1|true|yes)$/i.test(process.env.ACRYLIC_PREVIEW_SORT_ONLY ?? '');
const BYPASS_CHECKS = /^(1|true|yes)$/i.test(process.env.ACRYLIC_BYPASS_CHECKS ?? '');
const IGNORE_CHECK_FALSE = /^(1|true|yes)$/i.test(process.env.ACRYLIC_IGNORE_CHECK_FALSE ?? '');
const ERROR_COMPARE_ONLY = /^(1|true|yes)$/i.test(process.env.ACRYLIC_ERROR_COMPARE_ONLY ?? '');
const CHECK_IMAGE_SIZE_ENABLED = !/^(0|false|no)$/i.test(process.env.ACRYLIC_CHECK_IMAGE_SIZE ?? 'true');
const CHECK_TWO_SIDE_FACE_OFFSET_ENABLED = /^(1|true|yes)$/i.test(process.env.ACRYLIC_CHECK_TWO_SIDE_FACE_OFFSET ?? 'false');
const CHECK_FRONT_BACK_VS_LAZER_ENABLED = /^(1|true|yes)$/i.test(process.env.ACRYLIC_CHECK_FRONT_BACK_VS_LAZER ?? 'false');
const CHECK_FACE_TOLERANCE_CM = Math.max(0, Number(process.env.ACRYLIC_CHECK_FACE_TOLERANCE_CM ?? 0.034));
const CHECK_CUT_TOLERANCE_CM = Math.max(0, Number(process.env.ACRYLIC_CHECK_CUT_TOLERANCE_CM ?? 0.05));
const PRECHECK_START_ENABLED = /^(1|true|yes)$/i.test(process.env.ACRYLIC_TEST_PRECHECK ?? 'false');
const USE_CHECK_MEASUREMENT = CHECK_FULL_PIPELINE || ERROR_COMPARE_ONLY;
const SKIP_DERIVED_OUTPUT_EXPORT = /^(1|true|yes)$/i.test(process.env.ACRYLIC_SKIP_DERIVED_OUTPUT_EXPORT ?? '');
const DEBUG_PIPELINE = /^(1|true|yes)$/i.test(process.env.ACRYLIC_DEBUG_PIPELINE ?? '');
const DEBUG_LAZER_STEPS = DEBUG_PIPELINE || /^(1|true|yes)$/i.test(process.env.ACRYLIC_DEBUG_LAZER_STEPS ?? '');
const CHECKPOINT_ITEM_LIMIT = (DEBUG_LAZER_STEPS || CHECK_FULL_PIPELINE || PREVIEW_SORT_ONLY) ? 1 : Math.max(1, Number(process.env.ACRYLIC_CHECKPOINT_ITEM_LIMIT ?? 50));
const CHECKPOINT_PAUSE_MS = Math.max(0, Number(process.env.ACRYLIC_CHECKPOINT_PAUSE_MS ?? 5000));
const CHECKPOINT_MODE = (process.env.ACRYLIC_CHECKPOINT_MODE ?? "stop").toLowerCase();
const QUIT_ILLUSTRATOR_AFTER_SAVE = !/^(0|false|no)$/i.test(process.env.ACRYLIC_QUIT_ILLUSTRATOR_AFTER_SAVE ?? 'true');
const CLOSE_DOCUMENT_AFTER_SAVE = /^(1|true|yes)$/i.test(process.env.ACRYLIC_CLOSE_DOCUMENT_AFTER_SAVE ?? '');
const SHOULD_STOP_AFTER_CHECKPOINT = CHECKPOINT_MODE !== "continue";
const JSX_BATCH_SIZE = (CHECK_FULL_PIPELINE || PREVIEW_SORT_ONLY) ? 1 : Math.max(1, Math.min(CHECKPOINT_ITEM_LIMIT, Number(process.env.ACRYLIC_JSX_BATCH_SIZE ?? (IGNORE_CHECK_FALSE ? 18 : CHECKPOINT_ITEM_LIMIT))));
const PACK_GAP_CM = Math.max(0, Number(process.env.ACRYLIC_PACK_GAP_CM ?? 0.2));
const UI_REDRAW_EVERY = Math.max(1, Number(process.env.ACRYLIC_UI_REDRAW_EVERY ?? 5));
const WAIT_MIN_CAP_INCH = Number(process.env.ACRYLIC_WAIT_MIN_CAP_INCH ?? 3);
const JSX_STALL_TIMEOUT_MS = Math.max(0, Number(process.env.ACRYLIC_ITEM_STALL_TIMEOUT_MS ?? (IGNORE_CHECK_FALSE ? 180000 : 0)));
const coloredMetricsCache = new Map();
const runtimeSourceCache = new Map();
const placementMetricsCache = new Map();
function isApprovedErrorImage(imagePath) {
    const imageName = path.basename(imagePath);
    try {
        const approved = JSON.parse(readFileSync(approvedErrorsPath, 'utf8'));
        if (approved && approved[imageName]) {
            console.log('APPROVAL_LOOKUP: ' + imageName + ' | approved=true | marker=' + approvedErrorsPath);
            return true;
        }
    }
    catch { }
    console.log('APPROVAL_LOOKUP: ' + imageName + ' | approved=false | marker=' + approvedErrorsPath);
    return false;
}
function getDatedDoneDir(now = new Date()) {
    const monthDir = `thang${now.getMonth() + 1}`;
    const datePart = `${now.getDate()}-${now.getMonth() + 1}-${String(now.getFullYear()).slice(-2)}`;
    return { monthDir, datePart, baseDir: path.join(imagesDoneDir, monthDir), datedDir: path.join(imagesDoneDir, monthDir, datePart) };
}
function sleep(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function readPngTolerant(buffer) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!buffer.subarray(0, 8).equals(signature))
        throw new Error('PNG_SIGNATURE_INVALID');
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const dataLength = buffer.readUInt32BE(offset);
        const chunkEnd = offset + 12 + dataLength;
        if (chunkEnd > buffer.length)
            throw new Error('PNG_CHUNK_TRUNCATED');
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'IEND')
            return PNG.sync.read(buffer.subarray(0, chunkEnd));
        offset = chunkEnd;
    }
    return PNG.sync.read(buffer);
}

function readPngDpi(buffer) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!buffer.subarray(0, 8).equals(signature))
        return { dpiX: null, dpiY: null, hasPhys: false };
    let offset = 8;
    while (offset + 12 <= buffer.length) {
        const dataLength = buffer.readUInt32BE(offset);
        const chunkEnd = offset + 12 + dataLength;
        if (chunkEnd > buffer.length)
            break;
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'pHYs' && dataLength >= 9) {
            const pixelsPerMeterX = buffer.readUInt32BE(offset + 8);
            const pixelsPerMeterY = buffer.readUInt32BE(offset + 12);
            const unit = buffer[offset + 16];
            if (unit === 1) {
                return {
                    dpiX: pixelsPerMeterX * 0.0254,
                    dpiY: pixelsPerMeterY * 0.0254,
                    hasPhys: true,
                };
            }
            return { dpiX: null, dpiY: null, hasPhys: true };
        }
        if (type === 'IEND')
            break;
        offset = chunkEnd;
    }
    return { dpiX: null, dpiY: null, hasPhys: false };
}
function isPng300Dpi(dpi) {
    return dpi.hasPhys && dpi.dpiX !== null && dpi.dpiY !== null && Math.abs(dpi.dpiX - 300) <= 0.5 && Math.abs(dpi.dpiY - 300) <= 0.5;
}
function formatPngDpi(dpi) {
    if (!dpi.hasPhys) return 'khÃ´ng cÃ³ metadata DPI (pHYs)';
    if (dpi.dpiX === null || dpi.dpiY === null) return 'pHYs khÃ´ng ghi theo Ä‘Æ¡n vá»‹ DPI';
    return 'DPI X=' + dpi.dpiX.toFixed(2) + ', Y=' + dpi.dpiY.toFixed(2);
}
function getCheckSummaryLine(jsxResult) {
    const reports = Array.isArray(jsxResult?.reports) ? jsxResult.reports : [];
    for (const line of reports) {
        if (String(line).indexOf('CHECK_COMPARE_1SIDE:') === 0 || String(line).indexOf('CHECK_COMPARE_2SIDE:') === 0)
            return String(line);
    }
    return '';
}

function getCheckFailureLine(jsxResult) {
    const reports = Array.isArray(jsxResult?.reports) ? jsxResult.reports : [];
    for (const line of reports) {
        if (String(line).indexOf('false ?') >= 0)
            return String(line);
    }
    return '';
}
function runCommand(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit", detached: true, windowsHide: true });
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0)
                return resolve();
            reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
        });
    });
}
async function inspectPngPlacementMetrics(imagePath) {
    const cacheKey = path.resolve(imagePath).toLowerCase();
    const cached = placementMetricsCache.get(cacheKey);
    if (cached)
        return cached;
    const sourceBuffer = await readFile(imagePath);
    const png = readPngTolerant(sourceBuffer);
    const dpi = readPngDpi(sourceBuffer);
    const parsed = { widthPoint: png.width / 300 * 72, heightPoint: png.height / 300 * 72, dpiX: dpi.dpiX, dpiY: dpi.dpiY, hasPhys: dpi.hasPhys, dpiOk: isPng300Dpi(dpi), dpiText: formatPngDpi(dpi) };
    if (!(parsed.widthPoint > 0) || !(parsed.heightPoint > 0))
        throw new Error(`Invalid PNG placement metrics: ${imagePath}`);
    placementMetricsCache.set(cacheKey, parsed);
    return parsed;
}
function runCommandWithProgress(command, args, progressPath) {
    return new Promise((resolve, reject) => {
        let lastProgressKey = "";
        let readingProgress = false;
        let lastProgressAt = Date.now();
        let stallWarned = false;
        const child = spawn(command, args, { stdio: "inherit", detached: true, windowsHide: true });
        const reportProgress = async () => {
            if (readingProgress)
                return;
            readingProgress = true;
            try {
                const progress = await readJsxProgress(progressPath);
                if (!progress)
                    return;
                const progressKey = `${progress.index}|${progress.state}|${progress.imageBaseName ?? ""}|${progress.message ?? ""}`;
                if (progressKey === lastProgressKey)
                    return;
                lastProgressKey = progressKey;
                lastProgressAt = Date.now();
                const itemName = progress.imageBaseName ? `: ${progress.imageBaseName}` : "";
                const message = progress.message ? ` (${progress.message})` : "";
                console.log(`[${progress.index}/${progress.total}] ${progress.state}${itemName}${message}`);
            }
            finally {
                readingProgress = false;
            }
        };
        const timer = setInterval(() => {
            void reportProgress();
            if (JSX_STALL_TIMEOUT_MS > 0 && Date.now() - lastProgressAt > JSX_STALL_TIMEOUT_MS) {
                if (!stallWarned) {
                    stallWarned = true;
                    console.log(`JSX has not updated progress for ${Math.round(JSX_STALL_TIMEOUT_MS / 1000)}s; waiting instead of killing it.`);
                }
            }
        }, 350);
        child.on("error", (error) => {
            clearInterval(timer);
            reject(error);
        });
        child.on("exit", (code) => {
            clearInterval(timer);
            void reportProgress().finally(() => {
                if (code === 0)
                    return resolve();
                reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
            });
        });
    });
}
async function ensurePathExists(filePath) {
    await access(filePath, constants.F_OK);
}
async function getPngImages(directoryPath) {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const pngFiles = entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right, "en"));
    if (pngFiles.length === 0) {
        throw new Error(`KhÃ´ng tÃ¬m tháº¥y file .png trong thÆ° má»¥c ${directoryPath}`);
    }
    return pngFiles.map((fileName) => path.join(directoryPath, fileName));
}
function formatSizeLabel(sizeInch) {
    if (Number.isInteger(sizeInch))
        return `${sizeInch}in`;
    return `${String(sizeInch).replace(/\.0$/, "").replace(/\./g, "-")}in`;
}
function parseImageBaseName(filePath) {
    let baseName = path.basename(filePath, path.extname(filePath));
    while (/_\d+(?:-\d+)?in_qty_\d+$/i.test(baseName)) {
        baseName = baseName.replace(/_\d+(?:-\d+)?in_qty_\d+$/i, "");
    }
    return baseName;
}
function qtyFileStem(imageBaseName, sizeLabel) {
    const strippedBaseName = imageBaseName.replace(/_qty_\d+$/i, "");
    return strippedBaseName === imageBaseName ? `${imageBaseName}_${sizeLabel}` : strippedBaseName;
}
function qtyFileBaseName(imageBaseName, sizeLabel, qty) {
    return `${qtyFileStem(imageBaseName, sizeLabel)}_qty_${qty}`;
}
const CP1252_SPECIAL_BYTES = new Map<number, number>([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
    [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e],
    [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);
function fixVietnameseMojibake(value) {
    if (typeof value !== 'string' || value.length === 0)
        return value;
    if (!/[\u00c2\u00c3\u00c6\u00e1]/.test(value))
        return value;
    try {
        const bytes = [];
        for (const char of value) {
            const code = char.codePointAt(0) ?? 0;
            if (code <= 0xff)
                bytes.push(code);
            else if (CP1252_SPECIAL_BYTES.has(code))
                bytes.push(CP1252_SPECIAL_BYTES.get(code) ?? 0);
            else
                return value;
        }
        const repaired = Buffer.from(bytes).toString('utf8');
        return repaired.indexOf('\ufffd') >= 0 ? value : repaired;
    }
    catch {
        return value;
    }
}
function normalizeJsxResultText(value) {
    if (Array.isArray(value))
        return value.map(normalizeJsxResultText);
    if (!value || typeof value !== "object")
        return fixVietnameseMojibake(value);
    for (const key of Object.keys(value))
        value[key] = normalizeJsxResultText(value[key]);
    return value;
}async function readJsxRunResult(resultPath) {
    try {
        const raw = await readFile(resultPath, "utf8");
        return normalizeJsxResultText(JSON.parse(raw));
    }
    catch {
        return { success: false, fit: false, message: "khÃ´ng Ä‘ðž³œ Ä‘Æ°á»£c káº¿t quáº£ JSX" };
    }
}
async function readJsxProgress(progressPath) {
    try {
        return normalizeJsxResultText(JSON.parse(await readFile(progressPath, "utf8")));
    }
    catch {
        return null;
    }
}
async function clearPathIfExists(filePath) {
    try {
        await rm(filePath, { force: true });
    }
    catch { }
}
async function pathExists(filePath) {
    try {
        await access(filePath, constants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function uniquePathFor(filePath) {
    if (!(await pathExists(filePath)))
        return filePath;
    const parsed = path.parse(filePath);
    for (let index = 2; index < 10000; index += 1) {
        const candidate = path.join(parsed.dir, `${parsed.name}_dup${index}${parsed.ext}`);
        if (!(await pathExists(candidate)))
            return candidate;
    }
    throw new Error(`khÃ´ng táº¡o Ä‘Æ°á»£c tÃªn file khÃ´ng trÃ¹ng cho ${filePath}`);
}
async function writeImageErrorMetadata(fileName, metadata) {
    let current = {};
    try { current = JSON.parse(await readFile(imagesErrorMetadataPath, 'utf8')); } catch {}
    current[fileName] = { ...metadata, updatedAt: new Date().toISOString() };
    await writeFile(imagesErrorMetadataPath, JSON.stringify(current, null, 2), 'utf8');
}
async function moveImageToError(sourceImagePath, reason, metadata = {}) {
    if (!(await pathExists(sourceImagePath))) {
        console.log('Skip move Images error (missing source): ' + sourceImagePath + ' | reason=' + reason);
        return null;
    }
    await mkdir(imagesErrorDir, { recursive: true });
    const targetPath = await uniquePathFor(path.join(imagesErrorDir, path.basename(sourceImagePath)));
    await rename(sourceImagePath, targetPath);
    await writeImageErrorMetadata(path.basename(targetPath), { reason, ...metadata });
    console.log('Moved Images error: ' + targetPath + ' | reason=' + reason);
    return targetPath;
}
async function updateDoneHistory(sourceImagePath, imageBaseName, sizeLabel, addedQty) {
    const doneDir = getDatedDoneDir();
    await mkdir(doneDir.baseDir, { recursive: true });
    await mkdir(path.join(doneDir.baseDir, doneDir.datePart), { recursive: true });
    const targetDir = doneDir.datedDir;
    await mkdir(targetDir, { recursive: true });
    const entries = await readdir(targetDir, { withFileTypes: true });
    const baseName = qtyFileStem(imageBaseName, sizeLabel);
    const pattern = new RegExp(String.raw `^${baseName}_qty_(\d+)\.png$`, "i");
    let currentQty = 0;
    let currentPath = null;
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const match = entry.name.match(pattern);
        if (!match)
            continue;
        const qty = Number(match[1]);
        if (qty >= currentQty) {
            currentQty = qty;
            currentPath = path.join(targetDir, entry.name);
        }
    }
    const nextQty = currentQty + addedQty;
    const nextPath = path.join(targetDir, `${qtyFileBaseName(imageBaseName, sizeLabel, nextQty)}.png`);
    if (currentPath) {
        if (currentPath.toLowerCase() !== nextPath.toLowerCase())
            await rename(currentPath, nextPath);
    }
    else if (await pathExists(sourceImagePath)) {
        await copyFile(sourceImagePath, nextPath);
    }
    else {
        console.log('Bá» qua cáº­p nháº­t áº£nh Ä‘Ã£ xong vÃ¬ áº£nh nguá»“n khÃ´ng cÃ²n: ' + sourceImagePath);
        return null;
    }
    return nextPath;
}
function toJsxPath(filePath) {
    return filePath.replace(/\\/g, "/");
}
function parseSideCount(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName.includes('badge-reel'))
        return 1;
    const match = fileName.match(/(?:^|[-_])(\d+)-side(?:[-_.]|$)/);
    if (!match)
        return 1;
    return Number(match[1]);
}
function parseItemSizeInch(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    const match = fileName.match(/(?:^|[-_])(\d+(?:-\d+)?)in(?:[-_.]|$)/);
    if (!match)
        return 0;
    return Number(match[1].replace(/-/g, '.'));
}
function expectedCanvasSizeCm(filePath) {
    const sideCount = parseSideCount(filePath);
    const badgeReel = path.basename(filePath).toLowerCase().includes('badge-reel');
    return { widthCm: 30.48, heightCm: sideCount >= 2 ? 91.44 : 60.96, sideCount, badgeReel };
}
function validateErrorModeCanvasSize(filePath, placementMetrics) {
    const actualWidthCm = placementMetrics.widthPoint / 72 * 2.54;
    const actualHeightCm = placementMetrics.heightPoint / 72 * 2.54;
    const expected = expectedCanvasSizeCm(filePath);
    const toleranceCm = 0.02;
    const widthOk = Math.abs(actualWidthCm - expected.widthCm) <= toleranceCm;
    const heightOk = Math.abs(actualHeightCm - expected.heightCm) <= toleranceCm;
    return {
        ok: widthOk && heightOk,
        widthOk,
        heightOk,
        actualWidthCm,
        actualHeightCm,
        expectedWidthCm: expected.widthCm,
        expectedHeightCm: expected.heightCm,
        sideCount: expected.sideCount,
        badgeReel: expected.badgeReel,
        reason: `Sai kÃ­ch thÆ°á»›c áº£nh: W=${actualWidthCm.toFixed(2)}cm, H=${actualHeightCm.toFixed(2)}cm; yÃªu cáº§u W=${expected.widthCm.toFixed(2)}cm, H=${expected.heightCm.toFixed(2)}cm (${expected.sideCount >= 2 ? '2 side' : expected.badgeReel ? 'badge-reel' : '1 side'}).`,
    };
}
function parseItemQty(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    const match = fileName.match(/(?:^|[-_])qty_(\d+)(?:[-_.]|$)/);
    if (!match)
        return 1;
    return Math.max(1, Number(match[1]));
}
function isVisiblePixel(data, width, x, y) {
    const offset = (y * width + x) << 2;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const alpha = data[offset + 3];
    if (alpha <= 10)
        return false;
    if (red > 245 && green > 245 && blue > 245)
        return false;
    return true;
}
async function analyzeColoredComponents(pngPath) {
    const cacheKey = path.resolve(pngPath).toLowerCase();
    const cached = coloredMetricsCache.get(cacheKey);
    if (cached)
        return cached;
    const buffer = await readFile(pngPath);
    const image = readPngTolerant(buffer);
    const { width, height, data } = image;
    const visited = new Uint8Array(width * height);
    const components = [];
    const globalRowExtremes = {};
    let edgeLeft = null;
    let edgeRight = null;
    let edgeTop = null;
    let edgeBottom = null;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const startIndex = y * width + x;
            if (visited[startIndex] === 1 || !isVisiblePixel(data, width, x, y))
                continue;
            const stack = [[x, y]];
            visited[startIndex] = 1;
            let minX = x;
            let minY = y;
            let maxX = x;
            let maxY = y;
            let pixelCount = 0;
            const rowExtremes = {};
            while (stack.length > 0) {
                const current = stack.pop();
                if (!current)
                    continue;
                const [cx, cy] = current;
                pixelCount += 1;
                if (edgeLeft === null || cx < edgeLeft.x || (cx === edgeLeft.x && cy < edgeLeft.y))
                    edgeLeft = { x: cx, y: cy };
                if (edgeRight === null || cx > edgeRight.x || (cx === edgeRight.x && cy < edgeRight.y))
                    edgeRight = { x: cx, y: cy };
                if (edgeTop === null || cy < edgeTop.y || (cy === edgeTop.y && cx < edgeTop.x))
                    edgeTop = { x: cx, y: cy };
                if (edgeBottom === null || cy > edgeBottom.y || (cy === edgeBottom.y && cx < edgeBottom.x))
                    edgeBottom = { x: cx, y: cy };
                if (!rowExtremes[cy])
                    rowExtremes[cy] = { minX: cx, maxX: cx };
                if (cx < rowExtremes[cy].minX)
                    rowExtremes[cy].minX = cx;
                if (cx > rowExtremes[cy].maxX)
                    rowExtremes[cy].maxX = cx;
                if (!globalRowExtremes[cy])
                    globalRowExtremes[cy] = { minX: cx, maxX: cx };
                if (cx < globalRowExtremes[cy].minX)
                    globalRowExtremes[cy].minX = cx;
                if (cx > globalRowExtremes[cy].maxX)
                    globalRowExtremes[cy].maxX = cx;
                if (cx < minX)
                    minX = cx;
                if (cy < minY)
                    minY = cy;
                if (cx > maxX)
                    maxX = cx;
                if (cy > maxY)
                    maxY = cy;
                const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
                for (const [nx, ny] of neighbors) {
                    if (nx < 0 || nx >= width || ny < 0 || ny >= height)
                        continue;
                    const nextIndex = ny * width + nx;
                    if (visited[nextIndex] === 1 || !isVisiblePixel(data, width, nx, ny))
                        continue;
                    visited[nextIndex] = 1;
                    stack.push([nx, ny]);
                }
            }
            components.push({ minX, minY, maxX, maxY, pixelCount, rowExtremes });
        }
    }
    const sorted = components.sort((a, b) => {
        if (b.pixelCount !== a.pixelCount)
            return b.pixelCount - a.pixelCount;
        if (a.minY !== b.minY)
            return a.minY - b.minY;
        return a.minX - b.minX;
    });
    const result = {
        imageWidthPx: width,
        imageHeightPx: height,
        componentCount: sorted.length,
        edgeExtremes: edgeLeft && edgeRight && edgeTop && edgeBottom ? { left: edgeLeft, right: edgeRight, top: edgeTop, bottom: edgeBottom } : null,
        globalRowExtremes,
        components: sorted.length > 0 ? (() => {
            const primary = sorted[0];
            const ys = Object.keys(primary.rowExtremes).map((value) => Number(value)).sort((a, b) => a - b);
            const left = ys.map((y) => ({ x: primary.rowExtremes[y].minX, y }));
            const right = ys.slice().reverse().map((y) => ({ x: primary.rowExtremes[y].maxX, y }));
            const outline = left.concat(right);
            const sampledOutline = outline.filter((_, index) => index % 8 === 0 || index === outline.length - 1);
            return [{
                    minX: primary.minX,
                    minY: primary.minY,
                    maxX: primary.maxX,
                    maxY: primary.maxY,
                    widthPx: primary.maxX - primary.minX + 1,
                    heightPx: primary.maxY - primary.minY + 1,
                    pixelCount: primary.pixelCount,
                    sampledOutline,
                }];
        })() : [],
    };
    coloredMetricsCache.set(cacheKey, result);
    return result;
}
async function createRuntimeJsx(jsxTemplatePath, selectedImagePath, coloredMetrics, sideCount, itemSizeInch, itemQty, qtyIndex, isLast, resultPath) {
    await mkdir(runtimeDir, { recursive: true });
    const source = await readRuntimeSource(jsxTemplatePath);
    const imageBaseName = path.basename(selectedImagePath, path.extname(selectedImagePath));
    const imageId = imageBaseName.split("_")[0] || imageBaseName;
    const placementMetrics = await inspectPngPlacementMetrics(selectedImagePath);
    const runtimeSource = [
        `var CODEX_TEMPLATE_PATH = ${JSON.stringify(toJsxPath(templatePath))};`,
        `var CODEX_IMAGE_PATH = ${JSON.stringify(toJsxPath(selectedImagePath))};`,
        `var CODEX_LAZER_IMAGE_PATH = ${JSON.stringify(toJsxPath(selectedImagePath))};`,
        `var CODEX_IMAGE_BASENAME = ${JSON.stringify(imageBaseName)};`,
        `var CODEX_IMAGE_ID = ${JSON.stringify(imageId)};`,
        `var CODEX_SIDE_COUNT = ${JSON.stringify(sideCount)};`,
        `var CODEX_ITEM_SIZE_INCH = ${JSON.stringify(itemSizeInch)};`,
        `var CODEX_ITEM_QTY = ${JSON.stringify(itemQty)};`,
        `var CODEX_IMAGE_WIDTH_POINT = ${JSON.stringify(placementMetrics.widthPoint)};`,
        `var CODEX_IMAGE_HEIGHT_POINT = ${JSON.stringify(placementMetrics.heightPoint)};`,
        `var CODEX_QTY_INDEX = ${JSON.stringify(qtyIndex)};`,
        `var CODEX_ITEM_RUN_SUFFIX = ${JSON.stringify(`_q${qtyIndex}`)};`,
        `var CODEX_IS_LAST_RUN = ${JSON.stringify(isLast)};`,
        `var CODEX_RESULT_PATH = ${JSON.stringify(toJsxPath(resultPath))};`,
        `var CODEX_DEBUG_LAZER_STEPS = ${JSON.stringify(DEBUG_LAZER_STEPS)};`,
        `var CODEX_CHECK_FULL_PIPELINE = ${JSON.stringify(CHECK_FULL_PIPELINE)};`,
        `var CODEX_PREVIEW_SORT_ONLY = ${JSON.stringify(PREVIEW_SORT_ONLY)};`,
        `var CODEX_BYPASS_CHECKS = ${JSON.stringify(BYPASS_CHECKS)};`,
        `var CODEX_PACK_GAP_CM = ${JSON.stringify(PACK_GAP_CM)};`,
        `var CODEX_USE_CHECK_MEASUREMENT = ${JSON.stringify(USE_CHECK_MEASUREMENT)};`,
        `var CODEX_IGNORE_CHECK_FALSE = ${JSON.stringify(IGNORE_CHECK_FALSE)};`,
        `var CODEX_CHECK_IMAGE_SIZE_ENABLED = ${JSON.stringify(CHECK_IMAGE_SIZE_ENABLED)};`,
        `var CODEX_CHECK_TWO_SIDE_FACE_OFFSET_ENABLED = ${JSON.stringify(CHECK_TWO_SIDE_FACE_OFFSET_ENABLED)};`,
        `var CODEX_CHECK_FRONT_BACK_VS_LAZER_ENABLED = ${JSON.stringify(CHECK_FRONT_BACK_VS_LAZER_ENABLED)};`,
        `var CODEX_COLORED_METRICS = ${JSON.stringify(coloredMetrics)};`,
        source,
    ].join("\n");
    const runtimePath = path.join(runtimeDir, "run-import-image.jsx");
    await writeFile(runtimePath, runtimeSource, "utf8");
    return runtimePath;
}
async function getPngImagesIfAny(directoryPath) {
    try {
        return await getPngImages(directoryPath);
    }
    catch {
        return [];
    }
}
async function readRuntimeSource(jsxTemplatePath) {
    const cacheKey = path.resolve(jsxTemplatePath).toLowerCase();
    const cached = runtimeSourceCache.get(cacheKey);
    if (cached)
        return cached;
    const source = (await readFile(jsxTemplatePath, "utf8")).replace(/^\uFEFF/, "");
    runtimeSourceCache.set(cacheKey, source);
    return source;
}
async function ensureNormalizedAsset(job, kind, maxDimension) {
    await mkdir(waitAssetsDir, { recursive: true });
    const assetKey = createHash('sha1').update(`png-normalized-${kind}|${maxDimension}|${path.resolve(job.imagePath).toLowerCase()}`).digest('hex').slice(0, 16);
    const assetPath = path.join(waitAssetsDir, 'asset_' + assetKey + '.png');
    const sourceStats = await stat(job.imagePath);
    let assetIsCurrent = false;
    try {
        const assetStats = await stat(assetPath);
        assetIsCurrent = assetStats.mtimeMs >= sourceStats.mtimeMs && assetStats.size > 0;
    }
    catch { }
    if (!assetIsCurrent) {
        await createIllustratorSafePngAsset(job.imagePath, assetPath, maxDimension);
    }
    await assertPngAssetReady(assetPath);
    return assetPath;
}
async function createIllustratorSafePngAsset(sourcePath, targetPath, maxDimension) {
    const source = readPngTolerant(await readFile(sourcePath));
    const scale = maxDimension <= 0 ? 1 : Math.min(1, maxDimension / Math.max(source.width, source.height));
    if (scale === 1) {
        await writeFile(targetPath, PNG.sync.write(source));
        return;
    }
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const resized = new PNG({ width, height });
    for (let y = 0; y < height; y += 1) {
        const sourceY = Math.min(source.height - 1, Math.floor(y / scale));
        for (let x = 0; x < width; x += 1) {
            const sourceX = Math.min(source.width - 1, Math.floor(x / scale));
            const sourceOffset = (sourceY * source.width + sourceX) * 4;
            const targetOffset = (y * width + x) * 4;
            resized.data[targetOffset] = source.data[sourceOffset];
            resized.data[targetOffset + 1] = source.data[sourceOffset + 1];
            resized.data[targetOffset + 2] = source.data[sourceOffset + 2];
            resized.data[targetOffset + 3] = source.data[sourceOffset + 3];
        }
    }
    await writeFile(targetPath, PNG.sync.write(resized));
}
async function assertPngAssetReady(assetPath) {
    const stats = await stat(assetPath);
    if (stats.size <= 0)
        throw new Error(`PNG_ASSET_EMPTY: ${assetPath}`);
    try {
        readPngTolerant(await readFile(assetPath));
    }
    catch (error) {
        throw new Error(`PNG_ASSET_INVALID: ${assetPath} | ${error instanceof Error ? error.message : String(error)}`);
    }
}
async function ensurePrintAsset(job) {
    return ensureNormalizedAsset(job, 'v6-lossless-print', ILLUSTRATOR_MAX_PNG_DIMENSION);
}
async function ensureLazerTraceAsset(job) {
    return ensureNormalizedAsset(job, 'v1-lazer-trace', LAZER_TRACE_MAX_PNG_DIMENSION);
}
async function clearWaitAssets() {
    await rm(waitAssetsDir, { recursive: true, force: true });
}
function getRuntimeColoredMetrics(metrics) {
    if (!IGNORE_CHECK_FALSE || USE_CHECK_MEASUREMENT || metrics === null || typeof metrics !== 'object')
        return metrics;
    const source = metrics;
    const { globalRowExtremes: _globalRowExtremes, ...lightweight } = source;
    return lightweight;
}
async function createBatchRuntimeJsx(jsxTemplatePath, openTemplatePath, batchItems, resultPath, progressPath, blockedSizeKeys) {
    await mkdir(runtimeDir, { recursive: true });
    const source = await readRuntimeSource(jsxTemplatePath);
    const batchToken = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = batchItems.map((item, index) => {
        const imageBaseName = item.displayName ?? path.basename(item.imagePath, path.extname(item.imagePath));
        const imageId = imageBaseName.split("_")[0] || imageBaseName;
        return {
            imagePath: toJsxPath(item.imagePath),
            lazerImagePath: toJsxPath(item.lazerImagePath),
            imageBaseName,
            imageId,
            sideCount: item.sideCount,
            itemSizeInch: item.itemSizeInch,
            itemQty: item.itemQty,
            placementWidthPoint: item.placementWidthPoint,
            placementHeightPoint: item.placementHeightPoint,
            qtyIndex: item.qtyIndex,
            runSuffix: `_b${batchToken}_${index}_q${item.qtyIndex}`,
            continueAfterNoFit: item.continueAfterNoFit === true,
            jobKey: item.jobKey || item.imagePath,
            skipFollowingCopiesAfterNoFit: item.skipFollowingCopiesAfterNoFit === true,
            coloredMetrics: getRuntimeColoredMetrics(item.coloredMetrics),
            approvedError: item.approvedError === true,
        };
    });
    const runtimeSource = [
        `var CODEX_TEMPLATE_PATH = ${JSON.stringify(toJsxPath(openTemplatePath))};`,
        `var CODEX_RESULT_PATH = ${JSON.stringify(toJsxPath(resultPath))};`,
        `var CODEX_PROGRESS_PATH = ${JSON.stringify(toJsxPath(progressPath))};`,
        `var CODEX_PROGRESS_REDRAW_EVERY = ${JSON.stringify(UI_REDRAW_EVERY)};`,
        `var CODEX_DEBUG_LAZER_STEPS = ${JSON.stringify(DEBUG_LAZER_STEPS)};`,
        `var CODEX_CHECK_FULL_PIPELINE = ${JSON.stringify(CHECK_FULL_PIPELINE)};`,
        `var CODEX_PREVIEW_SORT_ONLY = ${JSON.stringify(PREVIEW_SORT_ONLY)};`,
        `var CODEX_BYPASS_CHECKS = ${JSON.stringify(BYPASS_CHECKS)};`,
        `var CODEX_PACK_GAP_CM = ${JSON.stringify(PACK_GAP_CM)};`,
        `var CODEX_USE_CHECK_MEASUREMENT = ${JSON.stringify(USE_CHECK_MEASUREMENT)};`,
        `var CODEX_IGNORE_CHECK_FALSE = ${JSON.stringify(IGNORE_CHECK_FALSE)};`,
        `var CODEX_CHECK_IMAGE_SIZE_ENABLED = ${JSON.stringify(CHECK_IMAGE_SIZE_ENABLED)};`,
        `var CODEX_CHECK_TWO_SIDE_FACE_OFFSET_ENABLED = ${JSON.stringify(CHECK_TWO_SIDE_FACE_OFFSET_ENABLED)};`,
        `var CODEX_CHECK_FRONT_BACK_VS_LAZER_ENABLED = ${JSON.stringify(CHECK_FRONT_BACK_VS_LAZER_ENABLED)};`,
        `var CODEX_BLOCKED_SIZE_KEYS = ${JSON.stringify(blockedSizeKeys)};`,
        `var CODEX_BATCH_ITEMS = ${JSON.stringify(payload)};`,
        source,
    ].join("\n");
    const runtimePath = path.join(runtimeDir, "run-import-image-batch.jsx");
    await writeFile(runtimePath, runtimeSource, "utf8");
    return runtimePath;
}
const waitAiFileNamePattern = /^wait_(\d+(?:-\d+)?)\.ai(?:\.ai)?$/i;
const waitManifestSuffix = '.manifest.json';
async function normalizeLegacyWaitAiFiles() {
    try {
        const entries = await readdir(waitDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || !/^wait_(\d+(?:-\d+)?)\.ai\.ai$/i.test(entry.name))
                continue;
            const legacyPath = path.join(waitDir, entry.name);
            const canonicalName = entry.name.replace(/\.ai$/i, '');
            const canonicalPath = path.join(waitDir, canonicalName);
            try {
                await access(canonicalPath, constants.F_OK);
                console.log('Kept legacy wait AI because canonical file already exists: ' + entry.name);
            }
            catch {
                await rename(legacyPath, canonicalPath);
                console.log('Normalized legacy wait AI filename: ' + entry.name + ' -> ' + canonicalName);
            }
        }
    }
    catch { }
}
async function getWaitAiFile() {
    try {
        const entries = await readdir(waitDir, { withFileTypes: true });
        const aiEntries = entries
            .filter((entry) => entry.isFile() && waitAiFileNamePattern.test(entry.name))
            .map((entry) => entry.name)
            .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
        if (aiEntries.length === 0)
            return null;
        const name = aiEntries[0];
        const match = name.match(waitAiFileNamePattern);
        const cap = match ? Number(match[1].replace('-', '.')) : null;
        return { filePath: path.join(waitDir, name), cap };
    }
    catch {
        return null;
    }
}
async function removeOtherWaitAiFiles(keepPath) {
    try {
        const keepResolved = keepPath ? path.resolve(keepPath).toLowerCase() : null;
        const keepManifestResolved = keepPath ? path.resolve(keepPath.replace(/\.ai$/i, waitManifestSuffix)).toLowerCase() : null;
        const entries = await readdir(waitDir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile() || (!entry.name.toLowerCase().endsWith('.ai') && !entry.name.toLowerCase().endsWith(waitManifestSuffix)))
                continue;
            const filePath = path.join(waitDir, entry.name);
            const resolvedFile = path.resolve(filePath).toLowerCase();
            if ((keepResolved && resolvedFile === keepResolved) || (keepManifestResolved && resolvedFile === keepManifestResolved))
                continue;
            await rm(filePath, { force: true });
        }
    }
    catch { }
}
async function writeWaitManifest(waitAiPath, waitCap, sheetUpdates) {
    const manifestPath = waitAiPath.replace(/\.ai$/i, waitManifestSuffix);
    const payload = {
        waitFileName: path.basename(waitAiPath),
        waitFilePath: waitAiPath,
        fitCapInch: waitCap,
        savedAt: new Date().toISOString(),
        items: sheetUpdates.map((update) => ({
            fileName: path.basename(update.job.imagePath),
            imagePath: update.job.imagePath,
            sizeInch: update.job.itemSizeInch,
            side: update.job.sideMode,
            qtyPlaced: update.placedQty,
            qtyRemaining: update.remainQty,
            sourceFolder: 'Images',
        })),
    };
    await writeFile(manifestPath, JSON.stringify(payload, null, 2), 'utf8');
}
async function buildOutputAiPath(sheetIndex) {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const folder = path.join(outputAiDir, 'thang' + month, day + '-' + month + '-' + String(now.getFullYear()).slice(-2));
    await mkdir(folder, { recursive: true });
    let index = Math.max(1, sheetIndex);
    while (true) {
        const filePath = path.join(folder, 'Acrylic_' + day + '_' + month + '_' + String(index).padStart(2, '0') + '.ai');
        try {
            await access(filePath, constants.F_OK);
            index += 1;
        }
        catch {
            return { filePath, index };
        }
    }
}
async function buildWaitAiPath(cap) {
    await mkdir(waitDir, { recursive: true });
    const fileName = 'wait_' + formatSizeLabel(cap).replace(/in$/i, '') + '.ai';
    return path.join(waitDir, fileName);
}
function shouldKeepAsWait(cap) {
    return cap !== null && cap > WAIT_MIN_CAP_INCH + 0.0001;
}
async function updateRemainingImage(job, remainingQty, targetDir) {
    if (remainingQty <= 0) {
        await rm(job.imagePath, { force: true });
        return null;
    }
    await mkdir(targetDir, { recursive: true });
    const wantedPath = path.join(targetDir, `${qtyFileBaseName(job.imageBaseName, job.sizeLabel, remainingQty)}.png`);
    if (path.resolve(job.imagePath).toLowerCase() === path.resolve(wantedPath).toLowerCase())
        return wantedPath;
    const nextPath = await uniquePathFor(wantedPath);
    await rename(job.imagePath, nextPath);
    return nextPath;
}
async function commitPlacedImageUpdate(update) {
    if (!update || !update.job)
        throw new Error('INVALID_SHEET_UPDATE');
    const placedQty = Math.max(0, Number(update.placedQty || 0));
    const originalQty = Math.max(1, Number(update.job.itemQty || 1));
    const remainingQty = Math.max(0, Number(update.remainQty || 0));
    if (placedQty <= 0 || placedQty + remainingQty !== originalQty)
        throw new Error('INVALID_QTY_COMMIT: placed=' + placedQty + ', remain=' + remainingQty + ', original=' + originalQty + ' | ' + update.job.imageBaseName);
    if (remainingQty > 0) {
        const remainingPath = await updateRemainingImage(update.job, remainingQty, imagesDir);
        if (!remainingPath || !(await pathExists(remainingPath)))
            throw new Error('REMAINING_IMAGE_MISSING: remain=' + remainingQty + ' | ' + update.job.imageBaseName);
        await updateDoneHistory(remainingPath, update.job.imageBaseName, update.job.sizeLabel, placedQty);
        console.log('PARTIAL_QTY_SAVED: placed=' + placedQty + ' | remain=' + remainingQty + ' | Images=' + path.basename(remainingPath));
        return;
    }
    await updateDoneHistory(update.job.imagePath, update.job.imageBaseName, update.job.sizeLabel, placedQty);
    await updateRemainingImage(update.job, 0, imagesDir);
    console.log('FULL_QTY_DONE: placed=' + placedQty + ' | remain=0 | ' + update.job.imageBaseName);
}
async function normalizeLegacyRemainingImages() {
    const imagePaths = await getPngImagesIfAny(imagesDir);
    for (const imagePath of imagePaths) {
        const baseName = path.basename(imagePath, path.extname(imagePath));
        const legacyMatch = baseName.match(/^(.*)_qty_\d+_\d+(?:-\d+)?in_qty_(\d+)$/i);
        if (!legacyMatch)
            continue;
        const normalizedPath = await uniquePathFor(path.join(imagesDir, `${legacyMatch[1]}_qty_${legacyMatch[2]}.png`));
        await rename(imagePath, normalizedPath);
        console.log(`Normalized remaining qty filename: ${path.basename(imagePath)} -> ${path.basename(normalizedPath)}`);
    }
}
async function restoreLegacyWaitPngs() {
    const legacyPngPaths = await getPngImagesIfAny(waitDir);
    for (const legacyPngPath of legacyPngPaths) {
        const restoredPath = await uniquePathFor(path.join(imagesDir, path.basename(legacyPngPath)));
        await rename(legacyPngPath, restoredPath);
        console.log('Restored legacy wait PNG to Images: ' + path.basename(restoredPath));
    }
}
async function exportOutputAssets(outputAiPath, vbsPath) {
    const scriptPath = path.join(rootDir, 'scripts', 'export-output-assets.jsx');
    await ensurePathExists(scriptPath);
    await ensurePathExists(lazerTemplatePath);
    const relativePath = path.relative(path.resolve(outputAiDir), path.resolve(outputAiPath));
    const relativeDir = path.dirname(relativePath) === '.' ? '' : path.dirname(relativePath);
    const baseName = path.basename(outputAiPath, path.extname(outputAiPath));
    const outputFrontPath = path.join(outputFrontDir, relativeDir, baseName + '_front.png');
    const outputBackPath = path.join(outputBackDir, relativeDir, baseName + '_back.png');
    const outputLazerPath = path.join(outputLazerDir, relativeDir, baseName + '_lazer.ai');
    await mkdir(path.dirname(outputFrontPath), { recursive: true });
    await mkdir(path.dirname(outputBackPath), { recursive: true });
    await mkdir(path.dirname(outputLazerPath), { recursive: true });
    const resultPath = path.join(runtimeDir, 'export-output-assets-result.json');
    const source = (await readFile(scriptPath, 'utf8')).replace(/^\uFEFF/, '');
    const runtimeSource = [
        'var CODEX_OUTPUT_AI_PATH = ' + JSON.stringify(toJsxPath(outputAiPath)) + ';',
        'var CODEX_OUTPUT_FRONT_PATH = ' + JSON.stringify(toJsxPath(outputFrontPath)) + ';',
        'var CODEX_OUTPUT_BACK_PATH = ' + JSON.stringify(toJsxPath(outputBackPath)) + ';',
        'var CODEX_OUTPUT_LAZER_PATH = ' + JSON.stringify(toJsxPath(outputLazerPath)) + ';',
        'var CODEX_LAZER_TEMPLATE_PATH = ' + JSON.stringify(toJsxPath(lazerTemplatePath)) + ';',
        'var CODEX_EXPORT_RESULT_PATH = ' + JSON.stringify(toJsxPath(resultPath)) + ';',
        'var CODEX_DEBUG_PIPELINE = ' + (DEBUG_PIPELINE ? 'true' : 'false') + ';',
        source,
    ].join('\n');
    const runtimePath = path.join(runtimeDir, 'export-output-assets-runtime.jsx');
    await writeFile(runtimePath, runtimeSource, 'utf8');
    await clearPathIfExists(resultPath);
    await runCommand('cscript.exe', ['//nologo', vbsPath, runtimePath]);
    const result = JSON.parse(await readFile(resultPath, 'utf8'));
    if (result.success !== true)
        throw new Error(result.message || 'EXPORT_OUTPUT_ASSETS_FAILED');
    const dpiPaths = [outputFrontPath];
    if (result.backExported === true)
        dpiPaths.push(outputBackPath);
    await Promise.all(dpiPaths.map((pngPath) => setPngDpiMetadata(pngPath, 300)));
    console.log(result.backExported === true ? 'Set FRONT/BACK PNG metadata to 300 DPI.' : 'Set FRONT PNG metadata to 300 DPI; BACK skipped (no artwork).');
    console.log('Exported FRONT PNG: ' + outputFrontPath);
    if (result.backExported === true)
        console.log('Exported BACK PNG: ' + outputBackPath);
    console.log('Exported LAZER AI Illustrator 8: ' + outputLazerPath);
}
function crc32(buffer) {
    let crc = 0xffffffff;
    for (let index = 0; index < buffer.length; index += 1) {
        crc ^= buffer[index];
        for (let bit = 0; bit < 8; bit += 1)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function createPngChunk(type, data) {
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write(type, 4, 4, 'ascii');
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
    return chunk;
}
async function setPngDpiMetadata(pngPath, dpi) {
    const source = await readFile(pngPath);
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!source.subarray(0, 8).equals(signature))
        throw new Error(`PNG_METADATA_INVALID: ${pngPath}`);
    const pixelsPerMeter = Math.round(dpi / 0.0254);
    const physData = Buffer.alloc(9);
    physData.writeUInt32BE(pixelsPerMeter, 0);
    physData.writeUInt32BE(pixelsPerMeter, 4);
    physData[8] = 1;
    const output = [signature];
    let offset = 8;
    let inserted = false;
    while (offset + 12 <= source.length) {
        const dataLength = source.readUInt32BE(offset);
        const chunkEnd = offset + 12 + dataLength;
        if (chunkEnd > source.length)
            throw new Error(`PNG_METADATA_TRUNCATED: ${pngPath}`);
        const type = source.toString('ascii', offset + 4, offset + 8);
        if (type !== 'pHYs')
            output.push(source.subarray(offset, chunkEnd));
        if (type === 'IHDR') {
            output.push(createPngChunk('pHYs', physData));
            inserted = true;
        }
        offset = chunkEnd;
        if (type === 'IEND')
            break;
    }
    if (!inserted)
        throw new Error(`PNG_METADATA_IHDR_MISSING: ${pngPath}`);
    await writeFile(pngPath, Buffer.concat(output));
}
async function maybeExportOutputAssets(outputAiPath, vbsPath) {
    if (SKIP_DERIVED_OUTPUT_EXPORT) {
        console.log('ERROR mode: saved output_ai only; skipped output_front/output_back/output_lazer.');
        return;
    }
    await exportOutputAssets(outputAiPath, vbsPath);
}
async function createSaveAiRuntime(openDocumentPath, saveScriptPath, outputAiPath, resultPath, closeAfterSave, keepIllustratorWarmAfterClose, embedLinkedImages, quitIllustratorAfterSave) {
    const source = await readFile(saveScriptPath, 'utf8');
    const runtimeSource = [
        'var CODEX_TEMPLATE_PATH = ' + JSON.stringify(toJsxPath(openDocumentPath)) + ';',
        'var CODEX_OUTPUT_AI_PATH = ' + JSON.stringify(toJsxPath(outputAiPath)) + ';',
        'var CODEX_SAVE_RESULT_PATH = ' + JSON.stringify(toJsxPath(resultPath)) + ';',
        'var CODEX_CLOSE_AFTER_SAVE = ' + (closeAfterSave ? 'true' : 'false') + ';',
        'var CODEX_KEEP_ILLUSTRATOR_WARM = ' + (keepIllustratorWarmAfterClose ? 'true' : 'false') + ';',
        'var CODEX_QUIT_ILLUSTRATOR_AFTER_SAVE = ' + (quitIllustratorAfterSave ? 'true' : 'false') + ';',
        'var CODEX_DEBUG_PIPELINE = ' + (DEBUG_PIPELINE ? 'true' : 'false') + ';',
        'var CODEX_EMBED_LINKED_IMAGES = ' + (embedLinkedImages ? 'true' : 'false') + ';',
        source,
    ].join('\n');
    const runtimePath = path.join(runtimeDir, 'save-ai-runtime.jsx');
    await writeFile(runtimePath, runtimeSource, 'utf8');
    return runtimePath;
}
async function writePendingCommit(payload) {
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(pendingCommitPath, JSON.stringify(payload), 'utf8');
}
async function readPendingCommit() {
    try {
        const raw = await readFile(pendingCommitPath, 'utf8');
        return normalizeJsxResultText(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
async function clearPendingCommit() {
    await clearPathIfExists(pendingCommitPath);
}
async function applyPendingCommitIfAny() {
    const payload = await readPendingCommit();
    if (!payload)
        return false;
    for (const update of payload.sheetUpdates) {
        await commitPlacedImageUpdate(update);
        console.log('Recovered commit: ' + update.placedQty + ', remain ' + update.remainQty + ': ' + update.job.imageBaseName);
    }
    await clearPendingCommit();
    console.log('Recovered pending commit after previous interrupted run.');
    return true;
}
async function warmIllustrator(vbsPath) {
    await mkdir(runtimeDir, { recursive: true });
    const warmupPath = path.join(runtimeDir, 'warm-illustrator.jsx');
    await writeFile(warmupPath, 'var CODEX_WARMUP = true;\n', 'utf8');
    await runCommand('cscript.exe', ['//nologo', vbsPath, warmupPath]);
}
async function removeOtherWaitPreviews(waitAiPath) {
    const safeBase = path.basename(waitAiPath, path.extname(waitAiPath)).replace(/[^a-z0-9_-]+/gi, '_');
    try {
        const entries = await readdir(waitPreviewDir, { withFileTypes: true });
        await Promise.all(entries
            .filter((entry) => entry.isFile() && entry.name !== `${safeBase}.png` && entry.name !== `${safeBase}.result.json` && entry.name !== `${safeBase}.runtime.jsx`)
            .map((entry) => rm(path.join(waitPreviewDir, entry.name), { force: true })));
    }
    catch { }
}

async function exportWaitPreviewAfterSave(waitAiPath, vbsPath) {
    const safeBase = path.basename(waitAiPath, path.extname(waitAiPath)).replace(/[^a-z0-9_-]+/gi, '_');
    const outputPath = path.join(waitPreviewDir, safeBase + '.png');
    const resultPath = path.join(waitPreviewDir, safeBase + '.result.json');
    const runtimePath = path.join(waitPreviewDir, safeBase + '.runtime.jsx');
    try {
        await mkdir(waitPreviewDir, { recursive: true });
        const source = await readFile(path.join(rootDir, 'scripts', 'export-sheet-preview.jsx'), 'utf8');
        await writeFile(runtimePath, [
            'var CODEX_SHEET_PREVIEW_SOURCE_PATH = ' + JSON.stringify(waitAiPath.replace(/\\/g, '/')) + ';',
            'var CODEX_SHEET_PREVIEW_OUTPUT_PATH = ' + JSON.stringify(outputPath.replace(/\\/g, '/')) + ';',
            'var CODEX_SHEET_PREVIEW_RESULT_PATH = ' + JSON.stringify(resultPath.replace(/\\/g, '/')) + ';',
            source,
        ].join('\n'), 'utf8');
        await clearPathIfExists(resultPath);
        await runCommand('cscript.exe', ['//nologo', vbsPath, runtimePath]);
        const result = JSON.parse(await readFile(resultPath, 'utf8'));
        if (result.success !== true) throw new Error(result.message ?? 'WAIT_PREVIEW_FAILED');
        await stat(outputPath);
        await removeOtherWaitPreviews(waitAiPath);
        console.log('Saved wait preview PNG: ' + outputPath);
    }
    catch (error) {
        console.log('Wait preview pending: ' + (error instanceof Error ? error.message : String(error)) + '. App will create it only when needed.');
    }
}

async function saveAiWithRetry(openDocumentPath, saveScriptPath, outputAiPath, vbsPath, closeAfterSave, keepIllustratorWarmAfterClose = true, embedLinkedImages = false, quitIllustratorAfterSave = QUIT_ILLUSTRATOR_AFTER_SAVE) {
    const resultPath = path.join(runtimeDir, 'save-ai-result.json');
    let lastMessage = 'SAVE_AI_FAILED';
    const shouldRetrySave = (message) => /busy|cancelled|timeout|timed out|not responding|internal error|PARM|TEMP_SAVE_FILE_NOT_FOUND/i.test(message);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
        await clearPathIfExists(resultPath);
        const runtimePath = await createSaveAiRuntime(openDocumentPath, saveScriptPath, outputAiPath, resultPath, closeAfterSave, keepIllustratorWarmAfterClose, embedLinkedImages, quitIllustratorAfterSave);
        try {
            await runCommand('cscript.exe', ['//nologo', vbsPath, runtimePath]);
        }
        catch (error) {
            lastMessage = error instanceof Error ? error.message : String(error);
        }
        try {
            const result = JSON.parse(await readFile(resultPath, 'utf8'));
            if (result.saved)
                return;
            if (result.message)
                lastMessage = result.message;
        }
        catch { }
        if (!shouldRetrySave(lastMessage) || /operation was cancelled/i.test(lastMessage))
            break;
        if (attempt < 3) {
            console.log('Save AI retry ' + attempt + '/3 after Illustrator is busy.');
            await sleep(3000);
        }
    }
    throw new Error('KhÃ´ng thá»ƒ lÆ°u AI: ' + lastMessage);
}
async function main() {
    if (IGNORE_CHECK_FALSE)
        console.log('IGNORE_CHECK_FALSE: bo qua loi check, van tiep tuc sap xep va xuat output.');
    const vbsPath = path.join(rootDir, 'scripts', 'launch-illustrator-and-run.vbs');
    const saveScriptPath = path.join(rootDir, 'scripts', 'save-ai.jsx');
    const jsxTemplatePath = path.join(rootDir, 'scripts', 'import-image.jsx');
    await ensurePathExists(vbsPath);
    await ensurePathExists(jsxTemplatePath);
    await ensurePathExists(saveScriptPath);
    await ensurePathExists(templatePath);
    await ensurePathExists(imagesDir);
    await mkdir(imagesDoneDir, { recursive: true });
    await mkdir(outputAiDir, { recursive: true });
    await mkdir(outputFrontDir, { recursive: true });
    await mkdir(outputBackDir, { recursive: true });
    await mkdir(outputLazerDir, { recursive: true });
    await mkdir(waitDir, { recursive: true });
    if (!CHECK_FULL_PIPELINE)
        await applyPendingCommitIfAny();
    await clearWaitAssets();
    console.log('Cleared stale runtime PNG cache.');
    await normalizeLegacyWaitAiFiles();
    await restoreLegacyWaitPngs();
    await normalizeLegacyRemainingImages();
    let sheetIndex = 1;
    let illustratorWarmupPromise = null;
    while (true) {
        const activeWait = await getWaitAiFile();
        const activeTemplatePath = activeWait ? activeWait.filePath : templatePath;
        const activeWaitCap = activeWait && activeWait.cap ? activeWait.cap : null;
        const imagePaths = await getPngImagesIfAny(imagesDir);
        if (imagePaths.length === 0) {
            if (activeWait) {
                if (shouldKeepAsWait(activeWaitCap)) {
                    console.log('Images ?? h?t PNG, gi? wait v? c?n fit tr?n ' + WAIT_MIN_CAP_INCH + 'in: ' + activeWait.filePath);
                }
                else {
                    const outputInfo = await buildOutputAiPath(sheetIndex);
                    await saveAiWithRetry(activeTemplatePath, saveScriptPath, outputInfo.filePath, vbsPath, CLOSE_DOCUMENT_AFTER_SAVE, false, true, false);
                    await clearPathIfExists(activeWait.filePath);
                    await maybeExportOutputAssets(outputInfo.filePath, vbsPath);
                    await clearWaitAssets();
                    console.log('Saved final wait AI to output: ' + outputInfo.filePath);
                }
            }
            else {
                console.log('Images Ä‘Ã£ háº¿t PNG, dá»«ng láº¡i.');
            }
            break;
        }
        const jobs = [];
        for (const imagePath of imagePaths) {
            const itemSizeInch = parseItemSizeInch(imagePath);
            if (activeWaitCap !== null && itemSizeInch > activeWaitCap + 0.0001)
                continue;
            const placementMetrics = await inspectPngPlacementMetrics(imagePath);
            if (CHECK_FULL_PIPELINE) {
                console.log('CHECK_DPI: ' + path.basename(imagePath) + ' | ' + placementMetrics.dpiText + ' | expected=300 DPI | ' + (placementMetrics.dpiOk ? 'true' : 'false'));
                if (!placementMetrics.dpiOk) {
                    const dpiReason = 'áº¢nh Ä‘áº§u vÃ o khÃ´ng Ä‘áº¡t 300 DPI: ' + placementMetrics.dpiText + '. YÃªu cáº§u DPI X/Y khoáº£ng 300.';
                    await moveImageToError(imagePath, dpiReason, { step: 'CHECK_DPI_FALSE', expected: 'DPI X/Y=300', actual: placementMetrics.dpiText });
                    console.log('CHECK_DPI_FALSE: ' + path.basename(imagePath) + ' | ' + dpiReason);
                    continue;
                }
            }
            if (IGNORE_CHECK_FALSE && !ERROR_COMPARE_ONLY) {
                const sizeCheck = validateErrorModeCanvasSize(imagePath, placementMetrics);
                if (!sizeCheck.ok) {
                    await moveImageToError(imagePath, sizeCheck.reason, { step: 'IMPORT_SIZE', actual: `W=${sizeCheck.actualWidthCm.toFixed(2)}cm, H=${sizeCheck.actualHeightCm.toFixed(2)}cm`, expected: `W=${sizeCheck.expectedWidthCm.toFixed(2)}cm, H=${sizeCheck.expectedHeightCm.toFixed(2)}cm`, widthOk: sizeCheck.widthOk, heightOk: sizeCheck.heightOk, sideCount: sizeCheck.sideCount, badgeReel: sizeCheck.badgeReel });
                    console.log('SIZE_CHECK_FALSE: ' + path.basename(imagePath) + ' | ' + sizeCheck.reason);
                    continue;
                }
            }
            if (PRECHECK_START_ENABLED && !isApprovedErrorImage(imagePath)) {
                const actualWidthCm = placementMetrics.widthPoint / 72 * 2.54;
                const actualHeightCm = placementMetrics.heightPoint / 72 * 2.54;
                const precheck = await runStartTestPrecheck(imagePath, parseSideCount(imagePath), actualWidthCm, actualHeightCm, { faceToleranceCm: CHECK_FACE_TOLERANCE_CM, cutToleranceCm: CHECK_CUT_TOLERANCE_CM });
                console.log('START_PRECHECK: ' + path.basename(imagePath) + ' | ' + precheck.step + ' | ' + (precheck.ok ? 'true' : 'false') + (precheck.reason ? ' | ' + precheck.reason : ''));
                if (!precheck.ok) {
                    await moveImageToError(imagePath, precheck.reason, { step: precheck.step, expected: 'Bá»™ pre-check giá»‘ng npm run test pháº£i true', actual: precheck.reason });
                    continue;
                }
            } else if (PRECHECK_START_ENABLED) {
                console.log('START_PRECHECK: ' + path.basename(imagePath) + ' | BYPASS_APPROVED_ERROR | true | approved=true');
            }
            jobs.push({
                imagePath,
                sideCount: parseSideCount(imagePath),
                itemSizeInch,
                itemQty: parseItemQty(imagePath),
                imageBaseName: parseImageBaseName(imagePath),
                sizeLabel: formatSizeLabel(itemSizeInch),
                sourceDir: path.dirname(imagePath),
                placementWidthPoint: placementMetrics.widthPoint,
                placementHeightPoint: placementMetrics.heightPoint,
            });
        }
        const sheetUpdates = [];
        let placedAnything = false;
        let firstNoFitSeen = false;
        let firstPlacedSize = null;
        let discoveredNextCap = null;
        let sheetRemainingFitCap = null;
        let placedItemCount = 0;
        let checkpointRequested = false;
        console.log('Sheet ' + sheetIndex + ': ' + (activeWait ? ('open wait AI ' + path.basename(activeWait.filePath)) : 'open template new'));
        const processQueue = async () => {
            const sortedJobs = jobs.slice().sort((left, right) => {
                if (right.itemSizeInch !== left.itemSizeInch)
                    return right.itemSizeInch - left.itemSizeInch;
                if (right.itemQty !== left.itemQty)
                    return right.itemQty - left.itemQty;
                return left.imagePath.localeCompare(right.imagePath, 'en', { numeric: true });
            });
            const runUnits = [];
            for (const job of sortedJobs) {
                for (let qtyIndex = 1; qtyIndex <= job.itemQty; qtyIndex += 1) {
                    runUnits.push({ job, qtyIndex, totalQty: job.itemQty });
                }
            }
            const placedByPath = new Map();
            const errorMovedPaths = new Set();
            const blockedSizeKeys = new Set();
            let unitIndex = 0;
            let batchIndex = 0;
            while (unitIndex < runUnits.length && !checkpointRequested) {
                const capacityLeft = CHECKPOINT_ITEM_LIMIT - placedItemCount;
                if (capacityLeft <= 0) {
                    checkpointRequested = true;
                    break;
                }
                const batchUnits = [];
                const batchLimit = Math.min(JSX_BATCH_SIZE, capacityLeft);
                let nextUnitIndex = unitIndex;
                while (nextUnitIndex < runUnits.length && batchUnits.length < batchLimit) {
                    const candidate = runUnits[nextUnitIndex];
                    nextUnitIndex += 1;
                    if (errorMovedPaths.has(candidate.job.imagePath)) {
                        continue;
                    }
                    const candidateSizeKey = String(Number(candidate.job.itemSizeInch));
                    if (blockedSizeKeys.has(candidateSizeKey)) {
                        console.log('Skip remaining size ' + candidateSizeKey + 'in after 2 no-fit; continue smaller sizes.');
                        continue;
                    }
                    batchUnits.push(candidate);
                }
                unitIndex = nextUnitIndex;
                if (batchUnits.length === 0)
                    continue;
                console.log('Preparing batch ' + (batchIndex + 1) + ' with ' + batchUnits.length + ' item(s)...');
                const batchItems = [];
                const batchMetricsByPath = new Map();
                for (const unit of batchUnits) {
                    const linkedAssetPath = await ensurePrintAsset(unit.job);
                    const linkedLazerAssetPath = await ensureLazerTraceAsset(unit.job);
                    let coloredMetrics = batchMetricsByPath.get(unit.job.imagePath);
                    if (!coloredMetrics) {
                        coloredMetrics = await analyzeColoredComponents(linkedAssetPath);
                        batchMetricsByPath.set(unit.job.imagePath, coloredMetrics);
                    }
                    batchItems.push({
                        imagePath: linkedAssetPath,
                        lazerImagePath: linkedLazerAssetPath,
                        displayName: unit.job.imageBaseName,
                        placementWidthPoint: unit.job.placementWidthPoint,
                        placementHeightPoint: unit.job.placementHeightPoint,
                        coloredMetrics,
                        sideCount: unit.job.sideCount,
                        itemSizeInch: unit.job.itemSizeInch,
                        itemQty: unit.job.itemQty,
                        qtyIndex: unit.qtyIndex,
                        continueAfterNoFit: true,
                        jobKey: unit.job.imagePath,
                        skipFollowingCopiesAfterNoFit: true,
                        approvedError: isApprovedErrorImage(unit.job.imagePath),
                    });
                }
                const resultPath = path.join(runtimeDir, 'sheet' + sheetIndex + '_continuous_batch_' + batchIndex + '.json');
                const progressPath = resultPath.replace(/\.json$/i, '.progress.json');
                await clearPathIfExists(resultPath);
                await clearPathIfExists(progressPath);
                const runtimeJsxPath = await createBatchRuntimeJsx(jsxTemplatePath, activeTemplatePath, batchItems, resultPath, progressPath, Array.from(blockedSizeKeys));
                if (illustratorWarmupPromise !== null) {
                    await illustratorWarmupPromise;
                    illustratorWarmupPromise = null;
                }
                try {
                    await runCommandWithProgress('cscript.exe', ['//nologo', vbsPath, runtimeJsxPath], progressPath);
                }
                catch (error) {
                    const jsxFailure = await readJsxRunResult(resultPath);
                    throw new Error(jsxFailure.message || (error instanceof Error ? error.message : String(error)));
                }
                const jsxResult = await readJsxRunResult(resultPath);
                if (typeof jsxResult.remainingFitCapInch === 'number' && jsxResult.remainingFitCapInch > 0) {
                    sheetRemainingFitCap = jsxResult.remainingFitCapInch;
                }
                if (USE_CHECK_MEASUREMENT) {
                    const reportLines = Array.isArray(jsxResult.reports) ? jsxResult.reports : [];
                    for (const reportLine of reportLines) {
                        const line = fixVietnameseMojibake(String(reportLine));
                        if (/^(CHECK_|SOURCE_PIXEL_|LAZER check:|Single-side flow:|Badge-reel flow:|MASK_30_48CM_)/.test(line)) console.log(line);
                    }
                }
                if (CHECK_FULL_PIPELINE) {
                    const summaryLine = getCheckSummaryLine(jsxResult);
                    const failureLine = getCheckFailureLine(jsxResult);
                    if (summaryLine)
                        console.log(summaryLine);
                    if (failureLine)
                        console.log('CHECK_ERROR: ' + failureLine);
                }
                if (Array.isArray(jsxResult.blockedSizeKeys)) {
                    for (const blockedSizeKey of jsxResult.blockedSizeKeys)
                        blockedSizeKeys.add(String(blockedSizeKey));
                }
                const batchResults = jsxResult.results ?? [{ success: jsxResult.success, fit: jsxResult.fit, message: jsxResult.message }];
                for (let resultIndex = 0; resultIndex < batchUnits.length; resultIndex += 1) {
                    const unit = batchUnits[resultIndex];
                    const result = batchResults[resultIndex];
                    if (result?.message === 'CHECK_COMPARE_FALSE' || String(result?.message || '').indexOf('CHECK_IMAGE_WIDTH_FALSE') >= 0 || String(result?.message || '').indexOf('CHECK_MASK_30_48CM_WIDTH_FALSE') >= 0) {
                        if (unit.job && isApprovedErrorImage(unit.job.imagePath)) {
                            console.log('APPROVED_ERROR_BYPASS: ' + unit.job.imageBaseName + ' | bo qua CHECK_COMPARE_FALSE vi da Approve.');
                            continue;
                        }
                        const evidenceLines = Array.isArray(result?.evidence) ? result.evidence.map((line) => fixVietnameseMojibake(String(line))) : [];
                        const compareEvidence = evidenceLines.find((line) => line.indexOf('CHECK_COMPARE_1SIDE:') === 0 || line.indexOf('CHECK_COMPARE_2SIDE:') === 0);
                        const faceOffsetEvidence = evidenceLines.find((line) => line.indexOf('CHECK_LEFT_POINT_FRONT_BACK:') === 0 || line.indexOf('CHECK_LEFT_POINT_FRONT_BACK_UPPER:') === 0);
                        const faceOffsetFailed = !!compareEvidence && compareEvidence.indexOf('CHECK_COMPARE_2SIDE: false') === 0 && compareEvidence.indexOf('face_offset_ok=false') >= 0;
                        const compareReason = (() => {
                            if (!compareEvidence) return '';
                            const front = compareEvidence.match(/frontDeltaTrai=([^|]+)\| frontDeltaPhai=([^|]+)\| frontDeltaDuoi=([^|]+)|deltaTrai=([^|]+)\| deltaPhai=([^|]+)\| deltaDuoi=([^|]+)/i);
                            const back = compareEvidence.match(/backDeltaTrai=([^|]+)\| backDeltaPhai=([^|]+)\| backDeltaDuoi=([^|]+)/i);
                            const tolerance = compareEvidence.match(/(?:bottomTol|leftRightTol)=([^|]+)/i);
                            if (faceOffsetFailed && faceOffsetEvidence) return '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: \u004c\u1ed7\u0069 \u006c\u1ec7\u0063\u0068 \u006d\u1eb7\u0074 2 side | ' + faceOffsetEvidence.replace(/^CHECK_LEFT_POINT_FRONT_BACK(?:_UPPER)?:\s*(true|false)\s*\|\s*/i, '');
                            if (front && back) return 'NguyÃªn nhÃ¢n: Front lá»‡ch trÃ¡i=' + (front[1] || front[4]).trim() + ' | pháº£i=' + (front[2] || front[5]).trim() + ' | dÆ°á»›i=' + (front[3] || front[6]).trim() + ' || Back lá»‡ch trÃ¡i=' + back[1].trim() + ' | pháº£i=' + back[2].trim() + ' | dÆ°á»›i=' + back[3].trim() + (tolerance ? ' | Sai sá»‘ tá»‘i Ä‘a=' + tolerance[1].trim() : '');
                            if (front) return '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: Front lá»‡ch trÃ¡i=' + (front[4] || front[1]).trim() + ' | pháº£i=' + (front[5] || front[2]).trim() + ' | dÆ°á»›i=' + (front[6] || front[3]).trim() + (tolerance ? ' | Sai sá»‘ tá»‘i Ä‘a=' + tolerance[1].trim() : '');
                            if (/missing_front_measurement/i.test(compareEvidence)) return '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: KhÃ´ng Ä‘á»c Ä‘Æ°á»£c sá»‘ Ä‘o Front theo kiá»ƒu bottom. Kiá»ƒm tra CHECK_EDGE_FRONT vÃ  CHECK_DATA FRONT.';
                            if (/missing_lazer_measurement/i.test(compareEvidence)) return '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: KhÃ´ng Ä‘á»c Ä‘Æ°á»£c sá»‘ Ä‘o Lazer. Kiá»ƒm tra CHECK_EDGE_LAZER vÃ  CHECK_DATA LAZER.';
                            return '\u004e\u0067\u0075\u0079\u00ea\u006e \u006e\u0068\u00e2\u006e: ' + compareEvidence.replace(/^CHECK_COMPARE_1SIDE:\s*false\s*\|\s*/i, '').replace(/^CHECK_COMPARE_2SIDE:\s*false\s*\|\s*/i, '');
                        })();
                        const rawReason = fixVietnameseMojibake(String(result.reason || ''));
                        const detailedReason = compareReason || rawReason || fixVietnameseMojibake(String(result.message || 'CHECK_COMPARE_FALSE'));
                        if (compareEvidence) console.log('CHECK lá»‡ch chi tiáº¿t: ' + unit.job.imageBaseName + ' | ' + compareEvidence);
                        else if (evidenceLines.length) console.log('CHECK Ä‘o: ' + unit.job.imageBaseName + ' | ' + evidenceLines.filter((line) => line.indexOf('CHECK_DATA ') === 0 || line.indexOf('CHECK_EDGE_') === 0).join(' || '));
                        if (!errorMovedPaths.has(unit.job.imagePath)) {
                            await moveImageToError(unit.job.imagePath, detailedReason, { step: faceOffsetFailed ? 'CHECK_2SIDE_FACE_OFFSET' : String(result.message || 'CHECK_COMPARE_FALSE'), expected: faceOffsetFailed ? '\u004c\u1ed7\u0069 \u006c\u1ec7\u0063\u0068 \u006d\u1eb7\u0074 2 side: hai thanh Front/Back pháº£i báº±ng nhau trong 0.01cm' : (Number(unit.job.sideCount) >= 2 ? '6 chÃªnh lá»‡ch Lazer-Front/Back pháº£i náº±m trong sai sá»‘ cho phÃ©p' : '3 chÃªnh lá»‡ch Lazer-Front pháº£i náº±m trong sai sá»‘ cho phÃ©p'), actual: detailedReason });
                            errorMovedPaths.add(unit.job.imagePath);
                        }
                        console.log('CHECK false: ' + unit.job.imageBaseName + ' | ' + detailedReason);
                        continue;
                    }
                    if (!result || !result.success || !result.fit) {
                        firstNoFitSeen = true;
                        const messageText = fixVietnameseMojibake(String(result?.message || 'UNKNOWN_ERROR'));
                        const reasonText = fixVietnameseMojibake(String(result?.reason || result?.message || 'UNKNOWN_ERROR'));
                        const isSkip = messageText === 'SKIPPED_SIZE_AFTER_TWO_NO_FIT' || messageText === 'SKIPPED_AFTER_NO_FIT';
                        const isNoFit = messageText === 'NO_FIT_CURRENT_SHEET';
                        if (isSkip) {
                            continue;
                        }
                        if (!isNoFit && !errorMovedPaths.has(unit.job.imagePath)) {
                            await moveImageToError(unit.job.imagePath, reasonText, {
                                step: messageText,
                                expected: Number(unit.job.sideCount) >= 2 ? '6 chÃªnh lá»‡ch Lazer-Front/Back pháº£i báº±ng nhau' : '3 chÃªnh lá»‡ch Lazer-Front/Back pháº£i báº±ng nhau',
                                actual: reasonText,
                            });
                            errorMovedPaths.add(unit.job.imagePath);
                            console.log('Moved Images error ngay: ' + unit.job.imageBaseName + ' | ' + reasonText);
                        }
                        if (result && !isSkip) {
                            const extraReasonText = result.reason ? ' (' + fixVietnameseMojibake(String(result.reason)) + ')' : '';
                            console.log((isNoFit ? 'No fit' : 'Item lá»—i') + ': ' + unit.job.imageBaseName + ' at qty ' + unit.qtyIndex + extraReasonText + '; continue other sizes.');
                        }
                        continue;
                    }
                    placedAnything = true;
                    placedItemCount += 1;
                    const current = placedByPath.get(unit.job.imagePath) ?? { job: unit.job, placedQty: 0 };
                    current.placedQty += 1;
                    placedByPath.set(unit.job.imagePath, current);
                    if (firstPlacedSize === null)
                        firstPlacedSize = unit.job.itemSizeInch;
                    if (firstNoFitSeen && discoveredNextCap === null)
                        discoveredNextCap = unit.job.itemSizeInch;
                }
                batchIndex += 1;
                if (placedItemCount >= CHECKPOINT_ITEM_LIMIT) {
                    checkpointRequested = true;
                    if (CHECK_FULL_PIPELINE)
                        console.log('Reached check limit 1 item; dung de ban xem trong Illustrator.');
                    else
                        console.log('Reached ' + CHECKPOINT_ITEM_LIMIT + ' placed items; saving checkpoint wait AI.');
                }
            }
            for (const placed of placedByPath.values()) {
                sheetUpdates.push({
                    job: placed.job,
                    placedQty: placed.placedQty,
                    remainQty: placed.job.itemQty - placed.placedQty,
                });
            }
        };
        if (jobs.length > 0 && illustratorWarmupPromise === null) {
            illustratorWarmupPromise = warmIllustrator(vbsPath);
        }
        await processQueue();
        if (CHECK_FULL_PIPELINE) {
            console.log(placedAnything ? 'CHECK_RESULT: true | giá»¯ Illustrator má»Ÿ Ä‘á»ƒ báº¡n xem káº¿t quáº£.' : 'CHECK_RESULT: false | giá»¯ Illustrator má»Ÿ Ä‘á»ƒ báº¡n xem lá»—i.');
            break;
        }
        if (PREVIEW_SORT_ONLY) {
            console.log(placedAnything ? 'CHECK_RESULT: true | ?? trace v? s?p x?p 1 item; gi? Illustrator m? ?? xem.' : 'CHECK_RESULT: false | kh?ng s?p x?p ???c item.');
            break;
        }
        if (!placedAnything || sheetUpdates.length === 0) {
            if (activeWait) {
                if (shouldKeepAsWait(activeWaitCap)) {
                    console.log('No suitable Images for wait, giu wait vi con fit tren ' + WAIT_MIN_CAP_INCH + 'in: ' + activeWait.filePath);
                    break;
                }
                const outputInfo = await buildOutputAiPath(sheetIndex);
                await saveAiWithRetry(activeTemplatePath, saveScriptPath, outputInfo.filePath, vbsPath, CLOSE_DOCUMENT_AFTER_SAVE, false, true, false);
                await clearPathIfExists(activeWait.filePath);
                await maybeExportOutputAssets(outputInfo.filePath, vbsPath);
                console.log('No more suitable images for wait AI, moved to output: ' + outputInfo.filePath);
                sheetIndex += 1;
                continue;
            }
            console.log('KhÃ´ng cÃ³ item nÃ o fit trÃªn sheet nÃ y; giá»¯ nguyÃªn PNG trong Images.');
            break;
        }
        const pendingCommitPayload = {
            sheetUpdates,
        };
        const commitProcessedImages = async () => {
            await writePendingCommit(pendingCommitPayload);
            for (const update of sheetUpdates) {
                await commitPlacedImageUpdate(update);
                console.log('Placed ' + update.placedQty + ', remain ' + update.remainQty + ': ' + update.job.imageBaseName);
            }
            await clearPendingCommit();
        };
        const nextCap = sheetRemainingFitCap !== null ? sheetRemainingFitCap : (discoveredNextCap !== null ? discoveredNextCap : firstPlacedSize);
        if (nextCap !== null && shouldKeepAsWait(nextCap)) {
            const waitCap = nextCap;
            const waitAiPath = await buildWaitAiPath(waitCap);
            const checkpointCloseAfterSave = CLOSE_DOCUMENT_AFTER_SAVE || (checkpointRequested && SHOULD_STOP_AFTER_CHECKPOINT);
            const sameWaitPath = activeWait ? path.resolve(activeWait.filePath).toLowerCase() === path.resolve(waitAiPath).toLowerCase() : false;
            if (activeWait && sameWaitPath) {
                await saveAiWithRetry(activeTemplatePath, saveScriptPath, activeWait.filePath, vbsPath, checkpointCloseAfterSave, false, true);
            }
            else if (activeWait && !SHOULD_STOP_AFTER_CHECKPOINT) {
                await saveAiWithRetry(activeTemplatePath, saveScriptPath, waitAiPath, vbsPath, CLOSE_DOCUMENT_AFTER_SAVE, false, true);
                await clearPathIfExists(activeWait.filePath);
            }
            else if (activeWait) {
                await saveAiWithRetry(activeTemplatePath, saveScriptPath, activeWait.filePath, vbsPath, CLOSE_DOCUMENT_AFTER_SAVE, false, true);
                await clearPathIfExists(waitAiPath);
                await rename(activeWait.filePath, waitAiPath);
            }
            else {
                await saveAiWithRetry(activeTemplatePath, saveScriptPath, waitAiPath, vbsPath, checkpointCloseAfterSave, false, true);
            }
            await commitProcessedImages();
            await exportWaitPreviewAfterSave(waitAiPath, vbsPath);
            await writeWaitManifest(waitAiPath, waitCap, sheetUpdates);
            await removeOtherWaitAiFiles(waitAiPath);
            console.log((checkpointRequested ? 'Saved checkpoint wait AI' : 'Saved remaining-space wait AI') + ' after ' + placedItemCount + ' items with cap ' + formatSizeLabel(waitCap) + ': ' + waitAiPath);
            if (checkpointRequested && SHOULD_STOP_AFTER_CHECKPOINT) {
                console.log('Closed checkpoint wait tab; Illustrator remains open.');
                console.log('Checkpoint mode stop: giu file wait va dung tool. Chay lai npm start de tiep tuc tu file wait nay.');
                break;
            }
            if (!checkpointRequested) {
                console.log('Images exhausted but sheet still fits over ' + WAIT_MIN_CAP_INCH + 'in; keeping wait AI.');
                break;
            }
            console.log(CLOSE_DOCUMENT_AFTER_SAVE ? 'Checkpoint mode continue: da dong tab wait; Adobe van mo va se mo lai file wait cho batch tiep theo.' : 'Checkpoint mode continue: giu document dang mo, khong mo lai wait.');
            if (CHECKPOINT_PAUSE_MS > 0) {
                console.log('Pausing ' + (CHECKPOINT_PAUSE_MS / 1000) + 's before continuing.');
                await sleep(CHECKPOINT_PAUSE_MS);
            }
            continue;
        }
        const outputInfo = await buildOutputAiPath(sheetIndex);
        await saveAiWithRetry(activeTemplatePath, saveScriptPath, outputInfo.filePath, vbsPath, CLOSE_DOCUMENT_AFTER_SAVE, false, true, false);
        if (activeWait)
            await clearPathIfExists(activeWait.filePath);
        await commitProcessedImages();
        await maybeExportOutputAssets(outputInfo.filePath, vbsPath);
        await removeOtherWaitAiFiles(null);
        await clearWaitAssets();
        console.log('Saved AI output: ' + outputInfo.filePath);
        sheetIndex += 1;
    }
    console.log('HoÃ n táº¥t lá»‡nh test.');
}
main().catch((error) => {
    console.error('Tool cháº¡y lá»—i:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
});





