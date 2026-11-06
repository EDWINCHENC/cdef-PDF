# WPS PDF 功能逆向研究与 Windows 独立复刻 — 项目计划

> 会话目录：`sessions/2026-11-06_wps-pdf-windows-clone/`
> 创建：2026-11-06 ｜ 方法学基准：[openpdf-studio](reference-openpdf-studio)（AGPL-3.0，macOS 版先行者）

---

## 一、任务定义

逆向研究 WPS Office 的 PDF 编辑、合并、转换功能，**独立实现**一个 Windows 可用的桌面 PDF 工具。
红线（与参考项目一致）：不破解会员、不绕过授权、不复制 WPS 二进制/图标/专有代码；RE 只用于理解交互与行为，引擎用开源组件自建。

## 二、RE 研究发现（截至 2026-11-06）

### 已获证据

| # | 结论 | 等级 | 来源 |
|---|---|---|---|
| R1 | WPS PDF 渲染引擎为 **PDFium**（Foxit 提供，BSD-3-Clause） | **A** | 官方随附 `thirdpartylegalnoticesforpdf.rtf` 组件清单第 8 项 |
| R2 | PDF 栈第三方组件全集：FreeType、ICU、JBig2、Lcms2、Leptonica、LibJPEG、OpenJPEG、PDFium、Zlib、BOOST | **A** | 同上 |
| R3 | PDF 模块框架：`kufe`/`kufepdfcommon`/`kpdfkit`/`pdffloattool`，Qt 技术栈（QtCoreKso/QtGuiKso） | **A** | 本机 `/Applications/WPS Office.app` 文件观察（版本 12.1.29182） |
| R4 | 未发现 Tesseract —— WPS OCR 为自有实现（参考项目对 OCR 算法评级 D：未知） | **B** | R2 清单无 Tesseract；参考研究笔记 |
| R5 | 交互模型：点击正文定位 → 输入触发页内编辑；中文功能区 + 页面缩略图 + 属性区布局 | **A** | 参考项目公开研究笔记（WPS 12.1.28496） |
| R6 | 段落重排、字体子集重建、保存事务、OCR/转换具体算法 | **D（未知）** | 参考项目明示未知，不据名称编造 |

### 对复刻的含义

- WPS 的 PDF 渲染内核本身就是**开源 PDFium**——复刻品同样可用开源 PDF 引擎，行为同源合理合法。
- 需要"复刻"的是**功能集合与交互体验**，不是私有算法（也拿不到，见 R6）。
- 编辑引擎无需从零造：参考项目已用 PyMuPDF 实现 648 行引擎并通过 73 项测试（本机复跑 **72 通过 / 1 失败=OCR**，见 §四）。

## 三、目标架构（Windows 独立版）

```
┌─────────────────────────────────────────────┐
│ Electron 外壳（React 19 + TS + Vite）          │  ← 移植参考项目 UI（i18n 中英双语）
│   页面缩略图 / 页内文字编辑 / 图片编辑 / 合并拆分  │
├─────────────────────────────────────────────┤
│ 引擎进程：Python + PyMuPDF 1.28.2             │  ← core.py 直接复用（已验证 72 测试通过）
│   JSON-lines over stdio（worker.py 协议）      │
│   编辑 / 合并 / 拆分 / 旋转 / 导出 DOCX/XLSX/PPTX │
├─────────────────────────────────────────────┤
│ OCR：Tesseract（chi_sim+eng）替代 Apple Vision │  ← 唯一需重写件，契约已明确（见 §四）
├─────────────────────────────────────────────┤
│ PyInstaller 打包引擎 → electron-builder NSIS   │
└─────────────────────────────────────────────┘
```

## 四、已验证事实（本机实验）

| 验证项 | 结果 |
|---|---|
| 参考引擎 core.py 在 Python 3.12 + PyMuPDF 1.28.2 运行 | ✅ 72/73 测试通过 |
| 唯一失败项 | `test_ocr` → `ocrUnavailable`（Apple Vision 二进制缺失），**即 Windows 唯一缺口** |
| OCR 替换契约 | `recognize_page()` 调用外部助手：入参 PNG 路径，出参 JSON 行 `[{text, rect:[x,y,w,h], confidence}]`，坐标归一化 0–1。Tesseract 包装器可实现同一契约 |
| 转换链 | python-docx / python-pptx / openpyxl / xlsxwriter 全部跨平台，无 macOS 依赖 |
| REA CLI 能力 | `capture-native-ui-scenario`（AX 界面观察）无需引擎可用；`analyze`/`decompile` 需 Ghidra/Hopper（未装，且对本任务非必需） |

## 五、分阶段计划

### Phase 1 — 研究与设计定稿（✅ 静态部分完成，UI 观察待权限）
- [x] 参考项目架构与测试摸底
- [x] WPS 静态观察（组件清单/框架结构）→ [research/wps-pdf-reverse-engineering.md](research/wps-pdf-reverse-engineering.md)
- [x] 引擎可移植性验证（72/73）
- [x] **转换矩阵与转换器架构分析**（Solid 本地转换器 + 在线兜底 + Scanner 检测 + 版面重建模式）
- [x] **功能清单**（140 条 PDF 命令，存档 evidence/wps-pdf-commands.txt）
- [ ] **RE 补充：UI 观察** — ⛔ 阻塞：需 macOS 屏幕录制+辅助功能权限（用户操作，见 PLAN §七）
- [ ] **RE 补充：黑盒转换测试** — ⛔ 同上权限阻塞
- [ ] 设计定稿：功能清单取舍、OCR 选型、品牌命名 → **待用户决策 D1–D5**

### Phase 2 — 引擎层（✅ 核心完成）
- [x] 移植 core.py → `engine/core.py`（OCR 助手改为跨平台实现）
- [x] **RapidOCR 适配器** `engine/ocr_rapidocr.py`（原计划 Tesseract，因 /opt/homebrew root 权限问题改用 pip 生态 RapidOCR——模型随 wheel 打包、PyInstaller 友好、中文开箱即用，对 Windows 目标更优）
- [x] **完整测试 86/86 通过**（含此前唯一失败的 OCR 测试与 13 项 OCR 批量测试）
- [x] **转换链验证**：PDF→DOCX/XLSX/PPTX/TXT/PNG 全部导出成功；XLSX 表格检测 4×3 单元格精确还原
- [x] worker.py JSON-lines 协议就位
- [ ] Windows 引擎冒烟测试（纯 Python + onnxruntime，预期无系统依赖；最终在 Windows 验证）

### Phase 3 — UI 层（✅ 测试全过，待真机 Windows 回归）
- [x] 移植 React UI（src/：App/Viewer/Inspector/PageManager/OCR/批量转换/标注，中英 i18n）
- [x] package.json 跨平台化（修复 @vitejs/plugin-react 版本不存在问题 → ^5.2.0；补 @types/react）
- [x] **main.cjs 四处 Windows 适配**：venv Python 路径（Scripts/python.exe）、OCR 助手指向 ocr_rapidocr.py、菜单 hide 角色仅 macOS、will-navigate 的 file:// URL 反斜杠修复（否则 Windows 拒绝加载自身页面）
- [x] **TypeScript 编译零错误 + Vite 构建成功**（dist/：JS 380KB / CSS 21KB）
- [x] **Electron 整栈冒烟通过**：主进程 → spawn Python 引擎 → UI 加载，无错误
- [x] **IPC 协议契约验证**：open/render/objects/search/export/close 全链路通过
- [x] 桌面端测试 8/8 通过
- [x] **完整 Playwright UI 套件 27/27 通过**（14 规格 × 中英双语：打开/编辑/撤销/保存/OCR/图片/页面/批量转换/标注/手势）
- [x] 修复测试基建问题：补齐遗漏的 PNG fixture（replacement.png）；修复批量转换取消测试的机器速度相关竞态（快速机上 50% flaky：取消点击落到同位置的“关闭”按钮——改为等第一批在途后 dispatchEvent 派发）
- [ ] Windows 适配收尾：文件对话框/快捷键/DPI 实测（需真机）

### Phase 4 — 打包与交付（✅ 打包应用端到端验证通过，待 Windows CI 执行）
- [x] electron-builder.yml（NSIS 安装包 + portable 双产物，x64；显式 electronVersion；mac 仅 zip 用于开发验证）
- [x] scripts/package-win.mjs（平台参数化；stage source/ 供菜单语言+AGPL；stage engine-dist 供 extraResources）
- [x] scripts/freeze-engine.sh（跨平台 PyInstaller 冻结；⚠️ 不能交叉编译，Windows .exe 须在 Windows 构建）
- [x] **打包应用端到端验证通过**：窗口渲染→打开 PDF→页内编辑→保存→读回验证（与 Windows 交付物同架构）
- [x] **排雷三个 Windows 交付物杀手**：缺 source/ 白屏、extraResources 相对路径失效、staging 无 node_modules（详见 DEVNOTES）
- [x] **Windows CI 流水线**（.github/workflows/build-windows.yml：test → ui-test(27项) → freeze → package → 产物上传）
- [x] build/icon.png（程序化生成，electron-builder 自动转 .ico）
- [x] LICENSE（AGPL-3.0）+ THIRD_PARTY_NOTICES.md（合规声明）
- [ ] Windows 上执行（或推 tag 触发 CI），产出安装包
- [ ] 真机 Windows 回归测试

## 六、待决策项（需用户确认）

| # | 决策 | 选项 | 建议 |
|---|---|---|---|
| D1 | **OCR 引擎** | Tesseract（成熟/轻量）/ PaddleOCR（中文强/重）/ Windows.Media.OCR（系统内置/需桥接） | **Tesseract**，包装成本最低，chi_sim 精度可接受 |
| D2 | **渲染引擎** | PyMuPDF（参考已实现/AGPL）/ PDFium pypdfium2（与 WPS 同源/BSD-3，但编辑 API 弱） | **PyMuPDF 为主**；如需渲染保真对比可加 pypdfium2 |
| D3 | **RE 深度** | 以参考公开研究+黑盒测试为主 / 加装 Ghidra 深挖 WPS 二进制 | **前者**；R6 已证明私有算法不可得，深挖性价比低 |
| D4 | **分发形态** | NSIS 安装包 / 便携 ZIP / 两者都要 | 两者都要（成本差很小） |
| D5 | **品牌命名** | 需独立名称，禁用 WPS 商标 | 待用户定 |

## 七、环境阻塞项（需用户操作）

| 阻塞 | 现象 | 解法 |
|---|---|---|
| Node 版本过低 | 现为 22.22.3，rea-agents 6.8.0 要求 ≥22.23.4；参考项目要求 ≥24.22.1 | 升级 Node 24 LTS（nvm/官网） |
| npm 缓存权限 | `/Users/chen/.npm` 含 root 文件，npx 报 EPERM | `sudo chown -R 501:20 ~/.npm`（一次性） |
| uv 缓存权限 | `/Users/chen/.cache/uv` 同类问题 | 已用 `UV_CACHE_DIR=/tmp/uv-cache` 绕过；或同样 chown |
| REA MCP 未注册 DSH | 本会话无 REA 工具 | 可选：`rea setup --client dsh`（需批准+重启会话）；CLI 已够用 |
| 辅助功能权限 | UI 观察需 macOS 授权 | 首次运行时用户批准 |

## 八、已知限制（提前声明）

- 不等同 WPS 全功能：无表单/签名/复杂段落重排/会员 AI 功能
- 字体替换：编辑文字可能改用内嵌开源字体，不与原字体完全一致
- AGPL-3.0 义务：分发修改版或提供网络服务须开源（PyMuPDF 传染性）
- Windows 构建产物需在真实 Windows 环境最终验证（本机为 macOS）
