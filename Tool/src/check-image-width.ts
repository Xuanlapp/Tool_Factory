import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const templatePath = process.env.ACRYLIC_TEMPLATE_PATH ?? "D:/FFactory/Arcylic/template/Template_UVDTF.ai";
const imagesDir = process.env.ACRYLIC_IMAGES_DIR ?? "D:/FFactory/Arcylic/Images";
const runtimeDir = path.join(rootDir, ".runtime");
const vbsPath = path.join(rootDir, "scripts", "launch-illustrator-and-run.vbs");
const jsxTemplatePath = path.join(rootDir, "scripts", "check-image-width.jsx");
const expectedWidthCm = 30.48;

type CheckResult = {
  success: boolean;
  matches: boolean;
  widthCm: number;
  templateWidthCm: number;
  expectedWidthCm: number;
  message?: string;
};

function toJsxPath(value: string) {
  return value.replace(/\\/g, "/");
}

async function ensurePathExists(filePath: string) {
  await access(filePath, constants.F_OK);
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", detached: true, windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

function runCommandCapture(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true, windowsHide: true });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}: ${stderr.trim()}`));
    });
  });
}

async function inspectImageSizeInPoints(imagePath: string) {
  const source = [
    "from PIL import Image",
    "import json, sys",
    "image = Image.open(sys.argv[1])",
    "dpi = image.info.get('dpi') or (300.0, 300.0)",
    "dpi_x = float(dpi[0]) if float(dpi[0]) > 0 else 300.0",
    "dpi_y = float(dpi[1]) if float(dpi[1]) > 0 else 300.0",
    "print(json.dumps({'widthPoint': image.size[0] / dpi_x * 72.0, 'heightPoint': image.size[1] / dpi_y * 72.0}))",
  ].join("; ");
  const raw = await runCommandCapture("python", ["-c", source, imagePath]);
  const result = JSON.parse(raw) as { widthPoint: number; heightPoint: number };
  if (!(result.widthPoint > 0) || !(result.heightPoint > 0)) throw new Error("không đ𞳜 được kích thước PNG theo DPI.");
  return result;
}

async function findFirstPng(directoryPath: string) {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
      .map((entry) => path.join(directoryPath, entry.name))
      .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))[0] ?? null;
  } catch {
    return null;
  }
}

async function resolveImagePath() {
  const requestedPath = process.argv[2] ?? process.env.ACRYLIC_CHECK_IMAGE_PATH;
  if (requestedPath) {
    await ensurePathExists(requestedPath);
    return path.resolve(requestedPath);
  }
  const candidateDirs = [
    imagesDir,
    path.join(rootDir, "place-assets"),
    path.join(rootDir, "wait-assets"),
    path.join(runtimeDir, "wait-assets"),
  ];
  for (const candidateDir of candidateDirs) {
    const firstPng = await findFirstPng(candidateDir);
    if (firstPng) return firstPng;
  }
  throw new Error(`Kh?ng t?m th?y PNG test. H?y ch?y: npm run check -- "D:\\duong-dan\\anh.png"`);
}

async function main() {
  await ensurePathExists(templatePath);
  await ensurePathExists(vbsPath);
  await ensurePathExists(jsxTemplatePath);
  const imagePath = await resolveImagePath();
  const size = await inspectImageSizeInPoints(imagePath);
  const resultPath = path.join(runtimeDir, "check-image-width-result.json");
  const runtimePath = path.join(runtimeDir, "check-image-width-runtime.jsx");
  const jsx = await readFile(jsxTemplatePath, "utf8");

  await mkdir(runtimeDir, { recursive: true });
  const runtimeJsx = [
    `var CODEX_TEMPLATE_PATH = ${JSON.stringify(toJsxPath(templatePath))};`,
    `var CODEX_IMAGE_PATH = ${JSON.stringify(toJsxPath(imagePath))};`,
    `var CODEX_IMAGE_WIDTH_POINT = ${size.widthPoint};`,
    `var CODEX_IMAGE_HEIGHT_POINT = ${size.heightPoint};`,
    `var CODEX_RESULT_PATH = ${JSON.stringify(toJsxPath(resultPath))};`,
    jsx,
  ].join("\n");
  await writeFile(runtimePath, runtimeJsx, "utf8");
  await runCommand("cscript.exe", ["//nologo", vbsPath, runtimePath]);

  const result = JSON.parse(await readFile(resultPath, "utf8")) as CheckResult;
  if (!result.success) throw new Error(result.message || "CHECK_IMAGE_WIDTH_FAILED");
  console.log(`Image: ${imagePath}`);
  console.log(`Imported W: ${result.widthCm.toFixed(3)} cm | Template W: ${result.templateWidthCm.toFixed(3)} cm`);
  console.log(`Expected W: ${expectedWidthCm.toFixed(2)} cm`);
  console.log(`CHECK_WIDTH_30_48CM: ${result.matches}`);
}

main().catch((error) => {
  console.error("Tool check loi:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
