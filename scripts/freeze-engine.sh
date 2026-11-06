#!/usr/bin/env bash
# 冻结引擎为独立可执行文件（PyInstaller）
# 注意：PyInstaller 不能交叉编译——Windows 可执行文件必须在 Windows 上构建。
# 本脚本跨平台（macOS/Linux/Windows-GitBash）；正式 Windows 产物由 CI 或 Windows 机器执行。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 跨平台 venv Python 探测：Windows 用 Scripts/python.exe，POSIX 用 bin/python
if [ -n "${PYTHON:-}" ]; then
  PYTHON="$PYTHON"
elif [ -f ".venv/Scripts/python.exe" ]; then
  PYTHON=".venv/Scripts/python.exe"
elif [ -f ".venv/bin/python" ]; then
  PYTHON=".venv/bin/python"
else
  echo "错误：未找到 .venv，请先创建虚拟环境" >&2; exit 1
fi
OUT="build/engine-dist"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "==> 检查 PyInstaller"
"$PYTHON" -c "import PyInstaller" 2>/dev/null || "$PYTHON" -m pip install pyinstaller

echo "==> 冻结引擎（worker.py 入口，含 core + ocr_rapidocr）"
"$PYTHON" -m PyInstaller \
  --onefile \
  --name cdef-pdf-engine \
  --distpath "$OUT" \
  --workpath build/pyinstaller-work \
  --specpath build \
  --collect-all rapidocr_onnxruntime \
  --collect-all pymupdf \
  --hidden-import core \
  --paths engine \
  engine/worker.py

echo "==> 冻结 OCR 助手（独立二进制，供 CDEF_PDF_OCR 指向）"
"$PYTHON" -m PyInstaller \
  --onefile \
  --name cdef-pdf-ocr \
  --distpath "$OUT" \
  --workpath build/pyinstaller-work-ocr \
  --specpath build \
  --collect-all rapidocr_onnxruntime \
  engine/ocr_rapidocr.py

echo "==> 完成：$OUT"
ls -la "$OUT"
