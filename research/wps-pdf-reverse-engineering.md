# WPS PDF 逆向研究笔记（Phase 1 成果）

> 研究对象：WPS Office for macOS **12.1.29182**（本机安装版）
> 研究日期：2026-11-06 ｜ 方法：只读静态观察（资源文件 + 官方声明 + 符号/字符串分析）
> 证据等级：**A** = 官方随附文件/本机直接观察 ｜ **B** = 强推断 ｜ **D** = 未知（不编造）

---

## 1. PDF 引擎构成（A 级）

来源：`Contents/Resources/office6/thirdpartylegalnoticesforpdf.rtf`（官方开源声明）

| 组件 | 用途 |
|---|---|
| **PDFium**（Foxit 提供，BSD-3-Clause） | **PDF 渲染引擎** |
| FreeType | 字体光栅化 |
| ICU | Unicode/文本处理 |
| JBig2 / OpenJPEG / LibJPEG | 图像解码 |
| Leptonica | 图像处理 |
| Lcms2 | 色彩管理 |
| Zlib / BOOST | 压缩/基础库 |

**关键结论**：WPS 的 PDF 渲染内核就是开源 PDFium。复刻品使用开源 PDF 引擎（PyMuPDF/MuPDF 或 pypdfium2）与 WPS 行为同源，无法律风险。

## 2. 转换功能矩阵（A 级）

来源：`addons/kpdfkit/engines_mac.cfg`（引擎注册表）+ `res/pdfentries.kuip`（命令清单）

**PDF → 其他格式**（引擎插件 `kconvertercoreengines`）：

| 目标格式 | 引擎名 |
|---|---|
| Word（.docx/.doc） | kconverter_pdf_docx_v5 / _doc_v5 |
| WPS 文字 | kconverter_pdf_wps_v5 |
| RTF | kconverter_pdf_rtf_v5 |
| Excel（.xlsx/.xls/.et） | kconverter_pdf_xlsx_v5 / _xls_v5 / _et_v5 |
| PPT（.pptx/.ppt/.dps） | kconverter_pdf_pptx_v5 / _ppt_v5 / _dps_v5 |
| 图片 | kconverter_pdf_image_v5 |
| TXT | SpecialFunc_PDFZZ_PDF2TXT |
| CAD（dwg/dwt/dxf） | kconverter_pdf_dwg_v5 等 |
| Markdown / XMind | ATT_ModifyPageRange_MarkDown / _XMind |
| OFD（国产版式格式） | OFD2Word/Excel/PPT/PDF/ImgPdf 系列 |

**图片 → Office**：KConverter_Photo_Word / _Excel / _Ppt
**CAD → PDF**：SpecialFunc_PDFZZ_CAD2PDF（VIP 门槛，见 §5）

## 3. 编辑/合并功能清单（A 级）

来源：`res/pdfentries.kuip` 共提取 **140 条 PDF 命令**（存档 `evidence/wps-pdf-commands.txt`），按功能区：

| 功能区 | 能力 |
|---|---|
| **编辑（CT_Edit）** | 插入图片、插入文本、显示内容框、擦除/修正液（标注） |
| **图片编辑（CT_PictureEdit）** | 替换/删除图片、旋转 90°、反向、透明度、裁剪、层级调整（置顶/置底/上移/下移）、OCR 提取 |
| **页面（CT_Page）** | 从 Word/Excel/PPT/TXT/PDF/图片导入页面、插入空白页、替换页面 |
| **合并（CT_Merge）** | PDF 合并设置 |
| **OCR（PdfOcrExtractMenu）** | 提取文本、提取手写、表格识别、转 Word、转 Excel、按页提取 |
| **签名** | 嵌入/删除签名（单页+批量） |
| **打印** | PDF 打印、批量打印 |
| **转换（CT_Convert）** | PDF2TXT、PDF2Photo、CAD↔PDF、表格识别、AIOCR 可搜索图片、电子发票打印 |

## 4. 转换引擎架构（B 级）

来源：`kpdf2wordv3.framework`（5.1MB，Mach-O universal x86_64+arm64，Qt 5.12.12 + ziparchive + kdownload）字符串与符号分析（存档见 evidence/）

| 发现 | 证据 |
|---|---|
| 本地转换器代号 **"Solid"**（CM_Solid / EnUseCoIfLocalSolidFailed） | 符号/字符串 |
| **在线转换兜底**：`Pdf2OfficeOnlineConverter`、`Pdf2CadOnlineConverter` 类；本地失败/乱码时走云端 | 符号 + ATT_UseOnlineConverter_* 遥测 |
| **转换质量分级**：Normal / **Scanner**（扫描件检测）/ Garbled（乱码修复："Try a garbled fix to the document"） | 字符串 + 遥测分类 |
| **版面重建模式**：`SolidReconstructionMode`、`ReconstructionMode_NoColumns`——PDF→Word 含**分栏检测的版面重建** | 符号 |
| 扫描件检测：`KTipScannerDoclabel`、`checkOutLabelScanner` | 字符串 |
| 页面范围修改（合并/拆分/转换共用）：ATT_ModifyPageRange_* 32 项 | 遥测字符串 |
| 超限提示：ATT_OverlimitPageRange_* 22 项（页数上限提示） | 遥测字符串 |

**对复刻的含义**：
- "段落重排"从参考项目的 D（未知）升级为 **B（确认存在，算法未知）**——复刻品用 PyMuPDF 的受限替换+局部重建策略即可达到参考项目同等水平，无需复刻 WPS 算法。
- 在线兜底是 WPS 云服务，**复刻品明确不做**（离线处理反而是差异化卖点）。
- Scanner/Normal 模式提示：复刻品 OCR 前也应做扫描件检测。

## 5. VIP 门槛功能（B 级，复刻品不碰）

ATT_VIP_MUST_* 遥测显示付费墙功能包括：CAD2PDF、CAJ2PDF、OFD2ImgPdf 等。
**复刻边界**：只做免费功能集，不破解、不绕过任何会员检查（与参考项目同一红线）。

## 6. 研究边界与阻塞

| 项 | 状态 |
|---|---|
| ✅ 引擎构成、转换矩阵、功能清单、转换器架构 | 已完成（只读静态分析） |
| ⛔ **UI 交互观察**（capture-native-ui-scenario） | **被 macOS 权限阻塞**：需在 系统设置→隐私与安全性 中授予 终端/DSH **屏幕录制 + 辅助功能**权限。授权后可用 `rea observe-native-ui` / `capture-native-ui-scenario` 记录功能区与点击编辑流程 |
| ⏳ 黑盒转换测试（WPS 实测 PDF→Word 产出结构） | 同样被权限阻塞；授权后可用合成 PDF 驱动 WPS 导出并解剖 DOCX |
| D（未知，不编造） | OCR 具体算法、字体子集重建细节、保存事务实现、版面重建算法细节 |

## 7. Phase 1 结论

1. **技术路线确认**：PyMuPDF 引擎 + 跨平台 OCR 的方案成立；WPS 自身也用开源引擎（PDFium），复刻合理合法。
2. **功能范围确认**：复刻品聚焦免费集——页内文字编辑、图片编辑、合并/拆分/旋转、PDF→Word/Excel/PPT/TXT/图片、OCR（Tesseract）。
3. **下一步**：等用户授权 UI 观察权限后可补 A 级交互证据；或直接进入 Phase 2 引擎层开发（决策项 D1–D5 待用户确认）。
