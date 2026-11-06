# WPS PDF 功能复刻 — Windows 独立版（开发中）

> 逆向研究 WPS Office PDF 功能（编辑/合并/转换），独立实现的开源桌面 PDF 工具。
> 方法学与红线继承自 [openpdf-studio](reference-openpdf-studio)（AGPL-3.0）：
> **RE 只用于理解交互与行为；引擎用开源组件自建；不破解会员、不复制 WPS 二进制/资产。**

## 当前进度（2026-11-06）

| 阶段 | 状态 |
|---|---|
| Phase 1 研究与设计 | ✅ 静态研究完成（[research/wps-pdf-reverse-engineering.md](research/wps-pdf-reverse-engineering.md)）；UI 观察待 macOS 权限授权 |
| Phase 2 引擎层 | ✅ **完成**：86/86 测试通过，OCR 跨平台移植（RapidOCR），转换链全格式验证 |
| Phase 3 UI 层 | ✅ **测试全过**：TS 零错误构建、整栈冒烟、IPC 契约、桌面测试 15/15、**Playwright UI 套件 27/27**；待真机 Windows 回归 |
| Phase 4 打包交付 | ✅ **Windows 安装包已由 CI 产出**（Run 42189506102 三 job 全绿：test 12/12 + ui-test 11/11 + package 13/13；产物 660.8MB：NSIS 安装包 + 便携版） |

**测试体系**：引擎 86 + 桌面/平台 15 + UI 27 = **128 项全部通过**。
平台测试（`tests/test_main_platform.cjs`）在 win32/darwin 双平台模拟下锁定 Windows 适配：venv Python 路径、OCR 助手路径、菜单 hide 角色、will-navigate URL 守卫。
**安全门控**：`scripts/check-runtime.cjs` 强制 Node/Electron 修订版基线（对应 2026-10-21 Node 安全公告），低于基线禁止启动/打包（见 [docs/runtime-security.md](docs/runtime-security.md)）。

**已验证可运行**：本机 macOS 上 `env -u ELECTRON_RUN_AS_NODE electron . --no-sandbox` 可启动完整应用（主进程 + Python 引擎 + UI）。
**Windows 交付路径**：推送 `v*` tag → GitHub Actions 自动完成 测试 → PyInstaller 冻结 → electron-builder（NSIS + portable）→ 产物上传。

## 目录结构

```
engine/            PDF 引擎（Python + PyMuPDF）
  core.py           648 行引擎：编辑/合并/拆分/OCR/转换（测试覆盖）
  ocr_rapidocr.py   跨平台 OCR 助手（RapidOCR/onnxruntime，替代 Apple Vision）
  worker.py         JSON-lines over stdio 服务协议
desktop/           Electron 主进程（已适配 Windows：venv 路径/OCR 助手/菜单/URL）
src/               React + TS 前端（编辑器/查看器/页面管理/OCR/批量转换/标注）
tests/             86 项引擎测试 + 8 项桌面测试（全部通过）
test-fixtures/     测试用 PDF
src/i18n/          中英语言文件
fixtures/          开发用合成 PDF
evidence/          RE 证据存档
research/           逆向研究笔记
scripts/           freeze-engine.sh（PyInstaller）+ package-win.mjs（electron-builder）
.github/workflows/ build-windows.yml（CI：测试→冻结→打包→产物）
electron-builder.yml  Windows 打包配置（NSIS + portable）
DEVNOTES.md         开发环境问题与绕行方案
LICENSE / THIRD_PARTY_NOTICES.md  AGPL-3.0 与第三方声明
reference-openpdf-studio/  参考项目（macOS 先行者，AGPL-3.0）
```

## 快速开始（开发环境）

```sh
# 引擎环境（Python 3.12 + PyMuPDF + RapidOCR）
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r engine-requirements.txt
# 跑测试
.venv/bin/python -m pytest tests/ -q
```

## 已验证能力

- **编辑**：页内文字替换/删除/插入、图片替换/移动/删除/层级、标注（高亮等）
- **页面**：合并、拆分、旋转、插入空白页、重排、从 Office/图片导入页面
- **OCR**：扫描件中文+英文识别（置信度 0.99），生成不可见文字层，保留原图
- **转换**：PDF→DOCX / XLSX（含表格检测）/ PPTX / TXT / PNG(ZIP)
- **安全模型**：预览令牌 + 修订号 + 区域差异校验（编辑不越界）

## 技术决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| PDF 引擎 | PyMuPDF (MuPDF) | 参考项目 648 行引擎已验证；编辑 API 完善 |
| OCR | RapidOCR (onnxruntime) | 纯 pip、模型随 wheel 打包、PyInstaller 友好、中文开箱即用；Tesseract 因本机 Homebrew 权限问题不可行 |
| 引擎通信 | JSON-lines over stdio | 崩溃隔离；进程边界清晰 |
| 前端 | Electron + React + TS（规划） | 与参考项目一致的技术栈，跨平台 |

## 法律与伦理边界

- 本项目是**独立实现**，与 WPS / 金山公司无任何隶属或授权关系
- 逆向研究仅针对本机已拥有的 WPS 安装版，只读分析官方随附文件与公开界面
- 不绕过任何会员/付费检查，不实现需要 WPS 账号的云功能
- 许可：AGPL-3.0-or-later（继承 PyMuPDF 的传染性义务）
