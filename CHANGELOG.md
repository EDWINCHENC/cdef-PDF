# 更新日志

## 0.1.3（2026-11-18，源码修复，尚未发布）

- 修复扫描 PDF 直接导出空白 Word：Word/Excel/TXT 导出自动执行本地 OCR，覆盖带原生页码的混合扫描页；没有可导出正文时明确报错。
- 修复 RapidOCR 与原 Vision 的坐标约定不一致；隐藏文字框按识别区域缩放，恢复搜索定位及阅读顺序。
- 导出过程中不修改原 PDF、修订号或撤销历史；单文件和批量转换共用识别与失败处理。
- 重新识别扫描页时忽略旧的不可见文字层，避免继承旧坐标错误或重复导出页码；中文 DOCX 指定东亚字体。
- 采用 openpdf-studio 当前 OCR 适配器的坐标契约、Unicode 文件读取和 RPC 日志隔离方法。
- 新增内容、坐标、中英文真实识别及界面回归；Windows CI 增加冻结引擎与 OCR 二进制的实际转换验证。
- Word 仍为可编辑文字版；扫描表格、图片和复杂原排版的重建仍未实现。Windows 安装包需重新构建和验收，旧 0.1.2 不包含本次修复。

## 0.1.2（2026-11-06）

- 全新应用图标「隐私小屋」：暖奶油底 + 品牌蓝屋身 + 白色穹顶 + PDF 页小门，
  呼应「全部本地处理、不上云」。exe / NSIS 安装向导 / 任务栏全面生效。
- 修复：v0.1.0/v0.1.1 的应用图标未嵌入（打包脚本未暂存 build/ 目录，
  electron-builder 静默回退默认图标）。
- 版本号对齐：构建产物文件名与 Release tag 一致。

## 0.1.0（开发中）

首个可验证版本。基于对 WPS Office PDF 功能的有边界逆向研究（见
[research/wps-pdf-reverse-engineering.md](research/wps-pdf-reverse-engineering.md)），
以开源组件独立实现的桌面 PDF 编辑器。与 WPS / 金山公司无隶属关系。

### 功能

- **编辑**：页内文字替换/删除/插入、字号/颜色/下划线、图片替换/移动/删除/层级/裁剪/透明度
- **页面**：合并、拆分、旋转、插入空白页、重排、替换页面、从 Word/Excel/PPT/TXT/图片导入页面
- **OCR**：扫描件中英文识别（RapidOCR/PP-OCR），生成不可见文字层，保留原图；按页/批量
- **转换**：PDF → DOCX / XLSX（含表格检测）/ PPTX / TXT / PNG(ZIP)
- **其他**：标注（高亮/下划线/删除线）、搜索、书签、缩略图、中英双语界面、最近文档恢复

### 安全模型

- 预览令牌 + 修订号 + 区域差异校验（编辑不越界）
- 原 PDF 只读载入，编辑发生在副本中
- 运行时版本门控（Node/Electron 修订版基线，见 [docs/runtime-security.md](docs/runtime-security.md)）

### 已知限制

- 不等同 WPS 全功能：无表单/签名/会员 AI 功能；OCR 与转换为独立实现，非 WPS 算法复刻
- 字体可能替换（编辑文字改用内嵌开源字体）
- 输入限制：单份 PDF 60 MB / 500 页；加密或带签名的 PDF 会被拒绝
- Windows 构建产物需在 Windows 环境最终验证

### 技术栈

Electron 44.10.2 + React 19 + TypeScript + Vite 7 + PyMuPDF 1.28.2 + RapidOCR
（详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)）。许可：AGPL-3.0-or-later。
