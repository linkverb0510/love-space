// 由 public/assets/brand/*.svg 生成 PWA 所需的全部位图图标。
// 运行:npm run icons(依赖 devDependency:sharp)
import { mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const brandDir = path.join(root, 'public', 'assets', 'brand');
const outDir = path.join(root, 'public', 'icons');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

const jobs = [
  { source: 'app-icon.svg', size: 192, file: 'icon-192.png' },
  { source: 'app-icon.svg', size: 512, file: 'icon-512.png' },
  { source: 'app-icon-maskable.svg', size: 512, file: 'maskable-512.png' },
  { source: 'app-icon.svg', size: 180, file: 'apple-touch-icon.png' }
];

await mkdir(outDir, { recursive: true });
for (const job of jobs) {
  const svg = path.join(brandDir, job.source);
  if (!(await exists(svg))) throw new Error(`缺少图标源文件:${svg}`);
  await sharp(svg, { density: 384 })
    .resize(job.size, job.size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, job.file));
  console.log(`✓ ${job.file} (${job.size}×${job.size}) ← ${job.source}`);
}
