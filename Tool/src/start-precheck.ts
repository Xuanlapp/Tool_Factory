import { readFile } from 'node:fs/promises';
import { PNG } from 'pngjs';

function readPngTolerant(buffer: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('PNG_SIGNATURE_INVALID');
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset);
    const chunkEnd = offset + 12 + dataLength;
    if (chunkEnd > buffer.length) throw new Error('PNG_CHUNK_TRUNCATED');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IEND') return PNG.sync.read(buffer.subarray(0, chunkEnd));
    offset = chunkEnd;
  }
  return PNG.sync.read(buffer);
}

function readRegions(buffer: Buffer, sideCount: number) {
  const png = readPngTolerant(buffer);
  const labels = sideCount >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  const regionHeight = Math.floor(png.height / labels.length);
  const regions: Record<string, any> = {};
  for (let index = 0; index < labels.length; index += 1) {
    const startY = index * regionHeight;
    const endY = index === labels.length - 1 ? png.height : startY + regionHeight;
    let minX = png.width, minY = endY, maxX = -1, maxY = -1, pixels = 0;
    for (let y = startY; y < endY; y += 1) for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      const red = png.data[offset], green = png.data[offset + 1], blue = png.data[offset + 2];
      if (alpha <= 10 || (red > 245 && green > 245 && blue > 245)) continue;
      pixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    regions[labels[index]] = pixels > 0 ? { pixels, minX, minY: minY - startY, maxX, maxY: maxY - startY, widthPx: maxX - minX + 1, heightPx: maxY - minY + 1 } : { pixels: 0, empty: true };
  }
  return { width: png.width, height: png.height, regionHeight, regions };
}

const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
const fmt = (value: number) => value.toFixed(3);

export async function runStartTestPrecheck(imagePath: string, sideCount: number, actualWidthCm: number, actualHeightCm: number, options: { faceToleranceCm?: number; cutToleranceCm?: number } = {}) {
  const expectedWidthCm = 30.48;
  const expectedHeightCm = sideCount >= 2 ? 91.44 : 60.96;
  const faceToleranceCm = Number.isFinite(options.faceToleranceCm) ? Number(options.faceToleranceCm) : 0.034;
  const cutToleranceCm = Number.isFinite(options.cutToleranceCm) ? Number(options.cutToleranceCm) : 0.05;
  if (Math.abs(actualWidthCm - expectedWidthCm) > 0.02 || Math.abs(actualHeightCm - expectedHeightCm) > 0.02) {
    return { ok: false, step: 'CHECK_IMAGE_SIZE_FALSE', reason: `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: \u1ea2nh sai k\u00edch th\u01b0\u1edbc | W=${actualWidthCm.toFixed(2)}cm | H=${actualHeightCm.toFixed(2)}cm | \u0079\u00ea\u0075 \u0063\u1ea7\u0075 W=${expectedWidthCm.toFixed(2)}cm | H=${expectedHeightCm.toFixed(2)}cm` };
  }
  const image = readRegions(await readFile(imagePath), sideCount);
  const labels = sideCount >= 2 ? ['LAZER', 'FRONT', 'BACK'] : ['LAZER', 'FRONT'];
  for (const label of labels) if (!image.regions[label] || image.regions[label].empty) return { ok: false, step: 'CHECK_COLOR_FALSE', reason: `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: \u004b\u0068\u00f4\u006e\u0067 \u0111\u1ecdc \u0111\u01b0\u1ee3c v\u00f9ng m\u00e0u ${label}` };
  const lazer = image.regions.LAZER;
  const front = image.regions.FRONT;
  const back = sideCount >= 2 ? image.regions.BACK : null;
  const leftOffsets = sideCount >= 2 ? [(front.minX - lazer.minX), (back.minX - lazer.minX)] : [];
  const topOffsets = sideCount >= 2 ? [(front.minY - lazer.minY), (back.minY - lazer.minY)] : [];
  const pxX = expectedWidthCm / image.width;
  const pxY = expectedHeightCm / image.height;
  const leftSpreadCm = spread(leftOffsets) * pxX;
  const topSpreadCm = spread(topOffsets) * pxY;
  if (sideCount >= 2 && leftSpreadCm > faceToleranceCm) return { ok: false, step: 'CHECK_2SIDE_LEFT_FALSE', reason: `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: 2 side b\u1ecb l\u1ec7ch, vui l\u00f2ng ki\u1ec3m tra l\u1ea1i! | LEFT: Front=${fmt(front.minX * pxX)}cm | Back=${fmt(back.minX * pxX)}cm | l\u1ec7ch=${fmt(leftSpreadCm)}cm | Sai s\u1ed1 t\u1ed1i \u0111a=${fmt(faceToleranceCm)}cm` };
  if (sideCount >= 2 && topSpreadCm > faceToleranceCm) return { ok: false, step: 'CHECK_2SIDE_TOP_FALSE', reason: `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: 2 side b\u1ecb l\u1ec7ch, vui l\u00f2ng ki\u1ec3m tra l\u1ea1i! | TOP: Front=${fmt(front.minY * pxY)}cm | Back=${fmt(back.minY * pxY)}cm | l\u1ec7ch=${fmt(topSpreadCm)}cm | Sai s\u1ed1 t\u1ed1i \u0111a=${fmt(faceToleranceCm)}cm` };
  const leftFront = (front.minX - lazer.minX) * pxX;
  const rightFront = ((lazer.maxX + 1) - (front.maxX + 1)) * pxX;
  const bottomFront = ((lazer.maxY + 1) - (front.maxY + 1)) * pxY;
  const leftBack = sideCount >= 2 ? (back.minX - lazer.minX) * pxX : null;
  const rightBack = sideCount >= 2 ? ((lazer.maxX + 1) - (back.maxX + 1)) * pxX : null;
  const bottomBack = sideCount >= 2 ? ((lazer.maxY + 1) - (back.maxY + 1)) * pxY : null;
  const cutValues = sideCount >= 2 ? [leftFront, rightFront, bottomFront, leftBack, rightBack, bottomBack] : [leftFront, rightFront, bottomFront];
  const cutSpread = spread(cutValues);
  if (cutSpread > cutToleranceCm) return { ok: false, step: 'CHECK_CUT_ALIGNMENT_FALSE', reason: sideCount >= 2 ? `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: L\u1ec7ch \u0111\u01b0\u1eddng c\u1eaft | 2 side | Front: Tr\u00e1i=${fmt(leftFront)}cm | Ph\u1ea3i=${fmt(rightFront)}cm | D\u01b0\u1edbi=${fmt(bottomFront)}cm || Back: Tr\u00e1i=${fmt(leftBack)}cm | Ph\u1ea3i=${fmt(rightBack)}cm | D\u01b0\u1edbi=${fmt(bottomBack)}cm | \u0110\u1ed9 l\u1ec7ch l\u1edbn nh\u1ea5t=${fmt(cutSpread)}cm | Sai s\u1ed1 t\u1ed1i \u0111a=${fmt(cutToleranceCm)}cm` : `\u004e\u0067\u0075\u0079\u00ean \u006e\u0068\u00e2\u006e \u006c\u1ed7\u0069: L\u1ec7ch \u0111\u01b0\u1eddng c\u1eaft | 1 side/badge-reel | Tr\u00e1i=${fmt(leftFront)}cm | Ph\u1ea3i=${fmt(rightFront)}cm | D\u01b0\u1edbi=${fmt(bottomFront)}cm | \u0110\u1ed9 l\u1ec7ch l\u1edbn nh\u1ea5t=${fmt(cutSpread)}cm | Sai s\u1ed1 t\u1ed1i \u0111a=${fmt(cutToleranceCm)}cm` };
  return { ok: true, step: 'CHECK_PRECHECK_TRUE', reason: '' };
}
