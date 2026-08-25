import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const outdir = path.join(root, 'Tool', 'dist-bundle');
const toolRoot = path.join(root, 'Tool');
const entries = [
  ['index', path.join(toolRoot, 'src', 'index.ts')],
  ['test-export-output-assets', path.join(toolRoot, 'src', 'test-export-output-assets.ts')],
  ['test-import-one-image', path.join(toolRoot, 'src', 'test-import-one-image.ts')],
  ['check-image-width', path.join(toolRoot, 'src', 'check-image-width.ts')],
];

const banner = "const { pathToFileURL: __acrylicPathToFileURL } = require('node:url'); const __acrylicImportMetaUrl = __acrylicPathToFileURL(__filename).href;";

fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

await Promise.all(entries.map(([name, entryPoint]) => build({
  entryPoints: [entryPoint],
  outfile: path.join(outdir, name + '.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  banner: { js: banner },
  define: { 'import.meta.url': '__acrylicImportMetaUrl' },
  sourcemap: false,
  minify: false,
  logLevel: 'info',
})));
