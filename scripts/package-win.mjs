// Windows 独立版打包脚本（electron-builder）
// 前置条件：
//   1. scripts/freeze-engine.sh 已生成 build/engine-dist/（须在 Windows 上执行以产出 .exe）
//   2. npm run build 已生成 dist/
//   3. build/icon.png 存在（electron-builder 自动生成 .ico）
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stage = path.join(root, 'build', 'staging-win');

console.log('==> 清理并准备暂存目录');
await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });

for (const name of ['dist', 'desktop', 'src', 'engine', 'tests', 'test-fixtures',
  'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'engine-requirements.txt',
  'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'index.html', 'electron-builder.yml']) {
  try {
    await fs.cp(path.join(root, name), path.join(stage, name), {
      recursive: true,
      filter: (p) => !p.includes('/results/') && !p.includes('__pycache__') && !p.includes('/.venv/'),
    });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

// 打包用 package.json（dev 依赖已在 electron-builder 阶段通过 node_modules 提供）
await fs.writeFile(
  path.join(stage, 'package.json'),
  JSON.stringify({
    name: 'openpdf-studio-windows',
    version: JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version,
    description: '免费开源 PDF 编辑器｜WPS PDF 交互逆向研究与独立实现｜本地编辑、OCR、PDF 转 Word',
    author: 'OpenPDF Studio contributors',
    main: 'desktop/main.cjs',
    license: 'AGPL-3.0-or-later',
  }),
);

// source/ 目录：打包态 main.cjs 从这里读取 src/i18n/*.json 构建原生菜单；
// 同时履行 AGPL-3.0 的随附源码出示义务。缺失会导致 set-locale 崩溃、应用白屏。
const source = path.join(stage, 'source');
await fs.mkdir(source, { recursive: true });
for (const name of [
  'src', 'engine', 'desktop', 'scripts', 'docs', 'tests', 'test-fixtures',
  'README.md', 'PLAN.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md',
  'engine-requirements.txt', 'package-lock.json', 'package.json',
  'playwright.config.ts', 'tsconfig.json', 'vite.config.ts', 'index.html',
  'electron-builder.yml',
]) {
  try {
    await fs.cp(path.join(root, name), path.join(source, name), {
      recursive: true,
      filter: (p) => !p.includes('/results/') && !p.includes('__pycache__') && !p.includes('/.venv/'),
    });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
console.log('==> source/ 已暂存（菜单语言文件 + AGPL 源码出示）');

// 引擎冻结产物（build/engine-dist/）作为 extraResources 注入。
// electron-builder 的 extraResources.from 相对 staging 目录解析，须先复制进来。
const engineDist = path.join(root, 'build', 'engine-dist');
try {
  const stat = await fs.stat(engineDist);
  if (!stat.isDirectory()) throw new Error('not a directory');
  await fs.cp(engineDist, path.join(stage, 'build', 'engine-dist'), { recursive: true });
  console.log('==> 发现引擎冻结产物，将随附');
} catch {
  console.warn('⚠️  未找到 build/engine-dist/ —— 请先运行 scripts/freeze-engine.sh（Windows 产物须在 Windows 构建）');
  console.warn('    本次打包仅产出外壳，引擎需另行放置到 resources/engine/');
}

// 平台参数：默认 win x64（NSIS + portable）；mac 仅用于开发验证
const platform = process.argv[2] === 'mac' ? 'mac' : 'win';
const arch = platform === 'mac' ? 'arm64' : 'x64';
console.log(`==> 运行 electron-builder（${platform} ${arch}）`);
execFileSync(
  'npx',
  ['electron-builder', `--${platform}`, `--${arch}`, '--config', 'electron-builder.yml'],
  { cwd: stage, stdio: 'inherit' },
);

console.log('==> 完成，产物在 release/ 目录');
