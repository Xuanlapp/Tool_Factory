import { access, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const outputAiDir = process.env.ACRYLIC_OUTPUT_AI_DIR ?? "D:/FFactory/Arcylic/output_ai";
const outputFrontDir = process.env.ACRYLIC_OUTPUT_FRONT_DIR ?? "D:/FFactory/Arcylic/output_front";
const outputBackDir = process.env.ACRYLIC_OUTPUT_BACK_DIR ?? "D:/FFactory/Arcylic/output_back";
const outputLazerDir = process.env.ACRYLIC_OUTPUT_LAZER_DIR ?? "D:/FFactory/Arcylic/output_lazer";
const runtimeDir = path.join(rootDir, ".runtime");
const vbsPath = path.join(rootDir, "scripts", "launch-illustrator-and-run.vbs");
const jsxTemplatePath = path.join(rootDir, "scripts", "export-output-assets.jsx");
const pngDpiSetterPath = path.join(rootDir, "scripts", "set-png-dpi.py");
const lazerTemplatePath = process.env.ACRYLIC_LAZER_TEMPLATE_PATH ?? "D:/FFactory/Arcylic/template/Template_Lazer.ai";

function toJsxPath(value: string) {
  return String(value).replace(/\\/g, "/");
}

async function ensurePathExists(filePath: string) {
  await access(filePath, constants.F_OK);
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", detached: true, windowsHide: true });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}

async function findLatestOutputAiPath() {
  const candidates: Array<{ filePath: string; mtimeMs: number }> = [];
  async function scan(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        await scan(entryPath);
        continue;
      }
      if (!entry.isFile() || !/\.ai$/i.test(entry.name) || !/^Acrylic_\d+\.ai$/i.test(entry.name)) continue;
      const stats = await stat(entryPath);
      candidates.push({ filePath: entryPath, mtimeMs: stats.mtimeMs });
    }
  }
  await scan(outputAiDir);
  if (candidates.length === 0) throw new Error("No Acrylic_*.ai found in output_ai");
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0].filePath;
}

async function getDerivedPaths(outputAiPath: string) {
  const relativePath = path.relative(path.resolve(outputAiDir), path.resolve(outputAiPath));
  const isInsideOutputAi = relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
  const relativeDir = isInsideOutputAi && path.dirname(relativePath) !== "." ? path.dirname(relativePath) : "";
  const baseName = path.basename(outputAiPath, path.extname(outputAiPath));
  return {
    outputFrontPath: path.join(outputFrontDir, relativeDir, baseName + "_front.png"),
    outputBackPath: path.join(outputBackDir, relativeDir, baseName + "_back.png"),
    outputLazerPath: path.join(outputLazerDir, relativeDir, baseName + "_lazer.ai"),
  };
}

function selectedAssets() {
  const raw = (process.env.ACRYLIC_EXPORT_ASSETS ?? 'front,back,lazer').toLowerCase();
  const values = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean));
  if (values.has('all')) return { front: true, back: true, lazer: true };
  return { front: values.has('front'), back: values.has('back'), lazer: values.has('lazer') };
}

async function buildRuntimeJsx(outputAiPath: string) {
  await mkdir(runtimeDir, { recursive: true });
  const { outputFrontPath, outputBackPath, outputLazerPath } = await getDerivedPaths(outputAiPath);
  await mkdir(path.dirname(outputFrontPath), { recursive: true });
  await mkdir(path.dirname(outputBackPath), { recursive: true });
  await mkdir(path.dirname(outputLazerPath), { recursive: true });

  const assets = selectedAssets();
  const source = (await readFile(jsxTemplatePath, "utf8")).replace(/^\uFEFF/, "");
  const runtimeSource = [
    `var CODEX_OUTPUT_AI_PATH = ${JSON.stringify(toJsxPath(outputAiPath))};`,
    `var CODEX_OUTPUT_FRONT_PATH = ${JSON.stringify(toJsxPath(outputFrontPath))};`,
    `var CODEX_OUTPUT_BACK_PATH = ${JSON.stringify(toJsxPath(outputBackPath))};`,
    `var CODEX_OUTPUT_LAZER_PATH = ${JSON.stringify(toJsxPath(outputLazerPath))};`,
    `var CODEX_LAZER_TEMPLATE_PATH = ${JSON.stringify(toJsxPath(lazerTemplatePath))};`,
    `var CODEX_EXPORT_FRONT = ${assets.front ? 'true' : 'false'};`,
    `var CODEX_EXPORT_BACK = ${assets.back ? 'true' : 'false'};`,
    `var CODEX_EXPORT_LAZER = ${assets.lazer ? 'true' : 'false'};`,
    `var CODEX_EXPORT_RESULT_PATH = ${JSON.stringify(toJsxPath(path.join(runtimeDir, "export-output-assets-result.json")))};`,
    source,
  ].join("\n");

  const runtimePath = path.join(runtimeDir, "export-output-assets-runtime.jsx");
  await writeFile(runtimePath, runtimeSource, "utf8");
  return runtimePath;
}

async function main() {
  const inputArg = process.argv[2];
  const outputAiPath = inputArg ? path.resolve(inputArg) : await findLatestOutputAiPath();
  await ensurePathExists(vbsPath);
  await ensurePathExists(jsxTemplatePath);
  await ensurePathExists(lazerTemplatePath);
  await ensurePathExists(pngDpiSetterPath);
  await ensurePathExists(outputAiPath);
  const runtimePath = await buildRuntimeJsx(outputAiPath);
  const resultPath = path.join(runtimeDir, "export-output-assets-result.json");
  await rm(resultPath, { force: true });
  console.log("Testing export for: " + outputAiPath);
  await runCommand("cscript.exe", ["//nologo", vbsPath, runtimePath]);
  const result = JSON.parse(await readFile(resultPath, "utf8")) as { success?: boolean; message?: string; backExported?: boolean };
  if (result.success !== true) throw new Error(result.message || "EXPORT_OUTPUT_ASSETS_FAILED");
  const { outputFrontPath, outputBackPath } = await getDerivedPaths(outputAiPath);
  const dpiPaths = [outputFrontPath];
  if (result.backExported === true) dpiPaths.push(outputBackPath);
  await runCommand("python", [pngDpiSetterPath, "300", ...dpiPaths]);
  console.log(result.backExported === true ? "Set FRONT/BACK PNG metadata to 300 DPI." : "Set FRONT PNG metadata to 300 DPI; BACK skipped (no artwork).");
  console.log("Done.");
}

main().catch((error) => {
  console.error("Test export failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

