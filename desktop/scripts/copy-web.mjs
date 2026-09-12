import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(here, '..');
const repoRoot = resolve(desktopDir, '..');
const outDir = resolve(desktopDir, 'web');

const files = [
  'index.html',
  'style.css',
  'app-v062.js',
  'app-v064-loader.js',
  'image-layers-v063.js',
  'image-controls-v064.js',
  'ffmpeg-worker.js',
  'file-protocol-guard.js'
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of files) {
  await cp(resolve(repoRoot, file), resolve(outDir, file));
}

console.log(`Copied ${files.length} web files to ${outDir}`);
