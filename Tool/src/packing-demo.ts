import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nestItems, type NestItem } from "./nesting/engine.js";

const CM = 28.346456692913385;
const template = { left: 5 * CM, top: 45 * CM, right: 45 * CM, bottom: 5 * CM, width: 40 * CM, height: 40 * CM };
const items: NestItem[] = [
  { id: "A-large", sizeInch: 3, polygon: [{ x: 0, y: 0 }, { x: 210, y: 0 }, { x: 190, y: 120 }, { x: 20, y: 135 }] },
  { id: "B-medium", sizeInch: 2.5, polygon: [{ x: 0, y: 0 }, { x: 130, y: 0 }, { x: 150, y: 70 }, { x: 35, y: 105 }] },
  { id: "C-small", sizeInch: 2, polygon: [{ x: 0, y: 0 }, { x: 85, y: 0 }, { x: 70, y: 65 }, { x: 10, y: 55 }] },
];
const placements = nestItems(items, { template, gap: 0.2 * CM, fallbackGridStep: 0.2 * CM });
const canvasWidth = template.right + 10 * CM;
const canvasHeight = template.top + 10 * CM;
const polygonPoints = (points: Array<{ x: number; y: number }>) => points.map((point) => `${point.x.toFixed(2)},${(canvasHeight - point.y).toFixed(2)}`).join(" ");
const colors = ["#4f81bd", "#70ad47", "#ed7d31"];
const content = placements.map((placement, index) => `<polygon points="${polygonPoints(placement.polygon)}" fill="${colors[index % colors.length]}" fill-opacity="0.35" stroke="${colors[index % colors.length]}" stroke-width="2"/><text x="${placement.bounds.left + 6}" y="${canvasHeight - placement.bounds.top + 18}" font-size="16">${placement.id} ${placement.angle}deg</text>`).join("\n");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}"><rect width="100%" height="100%" fill="#eee"/><rect x="${template.left}" y="${canvasHeight - template.top}" width="${template.width}" height="${template.height}" fill="#fff" stroke="#222" stroke-width="3"/>${content}</svg>`;
await mkdir(".runtime", { recursive: true });
const output = path.resolve(".runtime/packing-demo.svg");
await writeFile(output, svg, "utf8");
console.log(`Demo SVG: ${output}`);
for (const placement of placements) console.log(`${placement.id}: angle=${placement.angle}, score=${placement.score.toFixed(2)}`);
