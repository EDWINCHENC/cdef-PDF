"""跨平台 OCR 助手：RapidOCR（onnxruntime）实现，契约与 vision-ocr 一致。

用法（子进程契约，替代原 macOS Swift vision-ocr）：
    python ocr_rapidocr.py <page.png>

输出（stdout，JSON 行数组）：
    [{"text": "...", "rect": [x, y, w, h], "confidence": 0.95}, ...]
    rect 为归一化坐标（0-1）：x,y 为左上角，w,h 为宽高。

为什么选 RapidOCR 而非 Tesseract：
- 纯 pip 安装，模型随 wheel 打包，无外部二进制/语言包依赖；
- onnxruntime 提供 Windows/macOS/Linux 预编译库，PyInstaller 可直接打包；
- 中文识别开箱即用（PP-OCR 模型），适合中文优先的产品定位。
"""
import json
import sys
from pathlib import Path

_ENGINE = None


def _get_engine():
    """惰性初始化（首次调用才加载模型，约 0.2s）。"""
    global _ENGINE
    if _ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR

        _ENGINE = RapidOCR()
    return _ENGINE


def _image_size(png_path: str) -> tuple[int, int]:
    """读取 PNG 尺寸（避免引入 Pillow 依赖，手解 IHDR）。"""
    with open(png_path, "rb") as f:
        header = f.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError("not_a_png")
    width = int.from_bytes(header[16:20], "big")
    height = int.from_bytes(header[20:24], "big")
    return width, height


def ocr(png_path: str) -> list[dict]:
    """对 PNG 跑 RapidOCR，返回归一化矩形行列表。"""
    engine = _get_engine()
    width, height = _image_size(png_path)
    if width == 0 or height == 0:
        raise RuntimeError("bad_image_size")
    result, _elapse = engine(png_path)
    if not result:
        return []
    lines = []
    for box, text, conf in result:
        text = (text or "").strip()
        if not text:
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        x0, x1 = min(xs), max(xs)
        y0, y1 = min(ys), max(ys)
        x, y = x0 / width, y0 / height
        w, h = (x1 - x0) / width, (y1 - y0) / height
        lines.append(
            {"text": text, "rect": [x, y, w, h], "confidence": round(float(conf), 4)}
        )
    lines.sort(key=lambda r: (r["rect"][1], r["rect"][0]))
    return lines


def main() -> int:
    # Windows 默认代码页（cp1252/cp936）无法编码中文：强制 stdout 为 UTF-8，
    # 否则 print(ensure_ascii=False) 会 UnicodeEncodeError 导致子进程非零退出。
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    if len(sys.argv) != 2:
        print(json.dumps({"error": "usage: ocr_rapidocr.py <page.png>"}))
        return 2
    try:
        print(json.dumps(ocr(sys.argv[1]), ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001 - 助手契约：错误也走 stdout JSON
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
