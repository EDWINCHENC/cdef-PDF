# 开发环境笔记（macOS 构建机）

> 记录构建/验证过程中遇到的环境问题与绕行方案。在 Windows 上构建时部分不适用（已标注）。

## 已解决问题的绕行方案

| 问题 | 现象 | 绕行方案 | Windows 上是否适用 |
|---|---|---|---|
| **npm 缓存 root 文件** | `npx`/`npm install` 报 EPERM | `npm_config_cache=/tmp/npm-cache-win npm install` | 适用（若遇同类问题） |
| **uv 缓存 root 文件** | `uv venv/pip` 报 EPERM | `UV_CACHE_DIR=/tmp/uv-cache uv ...` | 适用 |
| **/opt/homebrew root 所有** | `brew install tesseract` 静默失败 | 放弃 Homebrew，OCR 改用 pip 生态 RapidOCR | 不适用 |
| **`ELECTRON_RUN_AS_NODE=1`** | Electron 启动后 `app` 为 undefined；`require('electron')` 返回路径字符串 | 启动时 `env -u ELECTRON_RUN_AS_NODE`。**该变量由 DSH harness 环境注入**，在 harness 终端里跑 Electron 必须去掉 | 仅 macOS 构建机遇此 |
| **`~/Library/Caches` ACL** | `group:everyone deny delete`，Electron 二进制缓存无法创建 | 手动下载 zip 解压到 `node_modules/electron/dist/`，并写 `path.txt` 为 `Electron.app/Contents/MacOS/Electron`（注意：是可执行相对路径，不是版本号） | 不适用 |
| **`~/Library/Application Support` ACL** | PyInstaller 缓存 `PermissionError: Operation not permitted` | `PYINSTALLER_CONFIG_DIR=/tmp/pyinstaller-config bash scripts/freeze-engine.sh` | 不适用 |
| **Chromium 沙箱失败** | `sandbox initialization failed: Operation not permitted` + SIGTRAP | 外层沙箱内开发测试加 `--no-sandbox`；**正式产物不要加** | 不适用 |
| **@vitejs/plugin-react@^5.4.0 不存在** | npm ETARGET | 改用 `^5.2.0`（支持 Vite 4–8；6.x 需要 Vite 8） | 已修正 |

## 本机可复现的验证命令

```sh
# 引擎测试（86 项）
.venv/bin/python -m pytest tests/ -q

# 桌面端测试（8 项）
node --test tests/test_batch_conversion.cjs

# UI 构建
npm run build

# 整栈冒烟（本机 harness 环境需去 ELECTRON_RUN_AS_NODE + --no-sandbox）
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron . --no-sandbox

# IPC 协议验证（无需 Electron）
node -e "<见会话记录：spawn worker.py 后 call open/render/objects/search/export/close>"
```

## 待用户处理的环境修复（一次性）

```sh
sudo chown -R 501:20 ~/.npm          # 修 npm 缓存（或保持用临时缓存）
sudo chown -R chen /opt/homebrew     # 修 Homebrew（若想用 brew）
# ~/.cache/uv 同理；~/Library/Caches 的 ACL 需排查来源（安全软件？）
```

## 引擎冻结验证结果（2026-11-06）

```sh
PYINSTALLER_CONFIG_DIR=/tmp/pyinstaller-config bash scripts/freeze-engine.sh
```

产物（macOS arm64，onefile 模式）：

| 二进制 | 大小 | 用途 |
|---|---|---|
| `build/engine-dist/openpdf-engine` | 134 MB | 引擎主进程（PyMuPDF + RapidOCR 全内置） |
| `build/engine-dist/ocr_rapidocr` | 103 MB | OCR 助手（ONNX 模型内置） |

**端到端验证通过**：以打包后相同方式启动（冻结引擎 + `OPENPDF_OCR` 指向冻结 OCR），open/render/ocr_plan/ocr_begin/step/finish 全链路正常，中文扫描件识别 5 行。

**已知权衡**：onefile 每次启动需解压到临时目录（启动稍慢）；如优化启动速度可改 `--onedir`（CI 中把 `engine-dist` 目录整体随附）。237MB 体积主要来自 onnxruntime + PP-OCR 模型，属 OCR 功能必要成本。

- 本机默认 `node` 为 22.22.3（PATH 中另有 ~/.local/bin/node 24.22.0）
- 引擎冻结与 electron-builder 建议用 24.x；Electron 44 内置 Node 24.22.0
- Windows 构建机需 Node ≥ 20.19（Vite 7 要求）
