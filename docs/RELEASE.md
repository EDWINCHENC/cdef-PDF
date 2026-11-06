# 发布交付手册（Windows 独立版）

本手册是产出 Windows 安装包的完整操作清单。所有验证门禁已在 CI 中固化。

## 一、发布前决策（需项目负责人确认）

| # | 决策 | 当前值 | 影响面 |
|---|---|---|---|
| D5 | **产品命名** | 临时名 `CDEF PDF Studio`（包名 `cdef-pdf-studio`） | package.json / electron-builder.yml 的 productName / index.html 标题 / i18n 的 appName / 应用图标说明 |
| D2 | 渲染引擎 | PyMuPDF（已定） | — |
| D4 | 分发形态 | NSIS 安装包 + 便携版（已定） | electron-builder.yml |

**改名操作**（确定 D5 后）：全局替换 `CDEF PDF Studio` → 新名称（package.json、
electron-builder.yml `productName`、index.html `<title>`、src/i18n/*.json 的 `appName`、
scripts/ 与 .github/ 中的展示名），重新 `npm run build` 并提交。

## 二、仓库准备（一次性）

```sh
# 1. 在 GitHub 创建空仓库（建议私有→公开前完成合规检查）
# 2. 关联并推送
git remote add origin https://github.com/<your-account>/<repo>.git
git push -u origin main
```

## 三、触发发布

```sh
git tag v0.1.0
git push origin v0.1.0
```

CI（`.github/workflows/build-windows.yml`）自动执行三个 job，**任一失败即阻断出包**：

| Job | 内容 | 门禁 |
|---|---|---|
| test | 引擎测试 86 项 + 桌面/平台测试 15 项 + UI 构建 | 全绿 |
| ui-test | Playwright UI 测试 27 项（中英双语） | 全绿 |
| package | 运行时安全门控 → PyInstaller 冻结引擎 → Vite 构建 → electron-builder（NSIS + portable） | 构建成功 |

产物（`windows-installer` artifact）：
- `CDEF PDF Studio-0.1.0-x64.exe`（NSIS 安装包）
- `CDEF PDF Studio-0.1.0-portable.exe`（便携版）

### 已验证：打包流水线可跨平台执行

**electron-builder 能从 macOS 直接构建 Windows 目标**（已实测产出 PE32+ 安装包+便携版，
NSIS 配置/图标转换/asar 结构全部正确）。唯一无法交叉的是 PyInstaller 引擎冻结
（`cdef-pdf-engine.exe` / `cdef-pdf-ocr.exe` 必须在 Windows 上产出）。

因此除 CI 外还有一条混合路径：

```sh
# 1. 在任意 Windows 机器（或一次性 CI job）冻结引擎
npm run engine:freeze
# 2. 将 build/engine-dist/*.exe 拷回本仓库 build/engine-dist/（覆盖 macOS 产物）
# 3. 在 macOS 上直接交叉构建完整 Windows 包
node scripts/package-win.mjs          # 产物在 build/staging-win/release/
```

⚠️ 未执行步骤 1-2 时，交叉构建产出的 .exe 内是 macOS 引擎二进制，**不可分发**。

## 四、本地 Windows 构建（无 CI 时的备选）

在 Windows 机器上（需 Node ≥ 22.23.4 或 24.x、Python 3.12）：

```sh
python -m venv .venv
.venv/Scripts/python -m pip install -r engine-requirements.txt pyinstaller
npm ci
npm run engine:freeze     # PyInstaller 冻结 → build/engine-dist/*.exe
npm run build             # Vite 构建 → dist/
npm run package           # 安全门控 + electron-builder → release/
```

## 五、真机验收清单（Windows）

CI 产出安装包后，在真实 Windows 环境逐项验证：

- [ ] 安装包安装/卸载干净，开始菜单与桌面快捷方式正常
- [ ] 启动无白屏（验证 source/ 语言文件与引擎随附）
- [ ] 打开 PDF：渲染、缩略图、书签、搜索
- [ ] 页内文字编辑：替换/删除/插入、撤销/重做、另存副本后读回一致
- [ ] 图片编辑：替换/旋转/删除/层级
- [ ] 页面操作：合并/拆分/旋转/重排/导入 Word 页面
- [ ] OCR：扫描件中文识别生成可搜索文字层
- [ ] 转换：PDF→DOCX/XLSX（表格检测）/PPTX/TXT/PNG
- [ ] 批量转换：多文件、取消回滚、输出目录
- [ ] 中英界面切换、原生菜单语言跟随
- [ ] 高 DPI（150%/200%）下布局与渲染
- [ ] 60MB/500 页限制与加密 PDF 的拒绝提示

## 六、合规检查（公开分发前）

- [ ] LICENSE（AGPL-3.0）随包 ✓（source/ 已由打包脚本自动置于 app 内）
- [ ] THIRD_PARTY_NOTICES.md 覆盖全部依赖（PyMuPDF/RapidOCR/onnxruntime/Electron 等）
- [ ] 产品名称与描述不含 WPS/金山商标或暗示背书
- [ ] README/CHANGELOG 注明独立实现、无会员功能、已知限制
- [ ] 逆向研究材料（research/、evidence/）**不随安装包分发**（仅在源码仓库；CI 的 files 配置已确保只打 dist/desktop/source/node_modules）

## 七、已知限制（发布说明中声明）

- 不等同 WPS 全功能：无表单/签名/会员 AI；OCR 与转换为独立实现
- 字体可能替换；加密/签名 PDF 拒绝编辑
- 单份 60MB / 500 页上限
- Windows 首次启动 PyInstaller onefile 解压约 2-5 秒（可改 onedir 优化）
