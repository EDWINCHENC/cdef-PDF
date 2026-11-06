// Windows 交付组装：把 Windows 引擎二进制放入 engine-dist 并交叉构建安装包
// 用法：
//   node scripts/assemble-windows.mjs <cdef-pdf-engine.exe 路径> <cdef-pdf-ocr.exe 路径>
// 或把两个文件放进 build/windows-drop/ 后无参数运行：
//   node scripts/assemble-windows.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const dropDir = path.join(root, 'build', 'windows-drop');
const engineDist = path.join(root, 'build', 'engine-dist');

async function findExe(name) {
  const arg = process.argv[2];
  if (arg) {
    const stat = await fs.stat(arg).catch(() => null);
    if (!stat) throw new Error(`找不到文件: ${arg}`);
    return arg;
  }
  // 无参数：从 drop 目录寻找
  const candidates = [
    path.join(dropDir, name),
    path.join(dropDir, name.replace('.exe', '')),
  ];
  for (const c of candidates) {
    const stat = await fs.stat(c).catch(() => null);
    if (stat) return c;
  }
  return null;
}

const engineExe = await findExe('cdef-pdf-engine.exe');
const ocrExe = await findExe('cdef-pdf-ocr.exe');
if (!engineExe || !ocrExe) {
  console.error('用法: node scripts/assemble-windows.mjs <cdef-pdf-engine.exe> <cdef-pdf-ocr.exe>');
  console.error('或将两个文件放入 build/windows-drop/ 后无参数运行');
  process.exit(1);
}

console.log('==> 清理 engine-dist 并放入 Windows 引擎二进制');
await fs.rm(engineDist, { recursive: true, force: true });
await fs.mkdir(engineDist, { recursive: true });
await fs.copyFile(engineExe, path.join(engineDist, 'cdef-pdf-engine.exe'));
await fs.copyFile(ocrExe, path.join(engineDist, 'cdef-pdf-ocr.exe'));
for (const f of await fs.readdir(engineDist)) {
  const stat = await fs.stat(path.join(engineDist, f));
  console.log(`    ${f}  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
}

console.log('==> 交叉构建 Windows 安装包（NSIS + portable）');
execFileSync('node', [path.join(root, 'scripts', 'package-win.mjs')], { stdio: 'inherit' });

const release = path.join(root, 'build', 'staging-win', 'release');
console.log('==> 完成，产物:');
for (const f of await fs.readdir(release)) {
  if (f.endsWith('.exe')) {
    const stat = await fs.stat(path.join(release, f));
    console.log(`    ${f}  ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
  }
}
console.log('    完整路径: ' + release);
