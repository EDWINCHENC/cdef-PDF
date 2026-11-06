// 跨平台引擎测试入口：解析 venv Python（Windows: Scripts/python.exe，POSIX: bin/python）
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const root = process.cwd();
const candidates = process.platform === 'win32'
  ? [path.join(root, '.venv', 'Scripts', 'python.exe'), path.join(root, '.venv', 'bin', 'python')]
  : [path.join(root, '.venv', 'bin', 'python'), path.join(root, '.venv', 'Scripts', 'python.exe')];
const python = candidates.find(p => fs.existsSync(p));
if (!python) {
  console.error('未找到 .venv，请先创建：uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r engine-requirements.txt');
  process.exit(1);
}
const result = spawnSync(python, ['-m', 'pytest', 'tests/', '-q', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status ?? 1);
