// 跨平台 venv Python 解析：Windows 用 Scripts/python.exe，POSIX 用 bin/python
import path from 'node:path';
import fs from 'node:fs';

export function venvPython(root: string): string {
  const candidates = process.platform === 'win32'
    ? [path.join(root, '.venv', 'Scripts', 'python.exe'), path.join(root, '.venv', 'bin', 'python')]
    : [path.join(root, '.venv', 'bin', 'python'), path.join(root, '.venv', 'Scripts', 'python.exe')];
  const found = candidates.find(c => fs.existsSync(c));
  if (!found) throw new Error('venv python not found: ' + candidates.join(' or '));
  return found;
}
