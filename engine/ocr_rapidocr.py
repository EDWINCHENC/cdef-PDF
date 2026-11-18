"""跨平台 OCR 助手：RapidOCR（onnxruntime）实现，契约与 vision-ocr 一致。

用法（子进程契约，替代原 macOS Swift vision-ocr）：
    python ocr_rapidocr.py <page.png>

输出（stdout，JSON 行数组）：
    [{"text": "...", "rect": [x, y, w, h], "confidence": 0.95}, ...]
    rect 为归一化坐标（0-1）：x,y 为左下角，w,h 为宽高。
    与原 Vision 及 openpdf-studio/engine/rapid_ocr.py 的坐标契约一致。

为什么选 RapidOCR 而非 Tesseract：
- 纯 pip 安装，模型随 wheel 打包，无外部二进制/语言包依赖；
- onnxruntime 提供 Windows/macOS/Linux 预编译库，PyInstaller 可直接打包；
- 中文识别开箱即用（PP-OCR 模型），适合中文优先的产品定位。
"""
import contextlib
import json
import math
import sys

_ENGINE = None


def _get_engine():
    """惰性初始化（首次调用才加载模型，约 0.2s）。"""
    global _ENGINE
    if _ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR

        _ENGINE = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    return _ENGINE


def normalize_results(result, width, height) -> list[dict]:
    """Adapt RapidOCR's top-left pixels to the bottom-left Vision contract.

    Coordinate convention follows openpdf-studio's AGPL rapid_ocr adapter.
    """
    if width <= 0 or height <= 0:
        raise ValueError('bad_image_size')
    lines = []
    for box, text, conf in result or []:
        if not isinstance(text, str) or len(box) != 4:
            raise ValueError('bad_ocr_result')
        coords = [float(v) for point in box for v in point]
        conf = float(conf)
        if len(coords) != 8 or not all(math.isfinite(v) for v in [*coords, conf]):
            raise ValueError('bad_ocr_coordinates')
        text = text.strip()
        if not text:
            continue
        x0, x1 = max(0., min(coords[::2])), min(float(width), max(coords[::2]))
        y0, y1 = max(0., min(coords[1::2])), min(float(height), max(coords[1::2]))
        if x1 <= x0 or y1 <= y0:
            continue
        lines.append(
            {"text": text, "rect": [x0 / width, 1 - y1 / height,
                                     (x1 - x0) / width, (y1 - y0) / height],
             "confidence": round(max(0., min(1., conf)), 4)}
        )
    lines.sort(key=lambda r: (-r["rect"][1], r["rect"][0]))
    return lines


def ocr(png_path: str) -> list[dict]:
    """Pillow handles non-ASCII Windows paths before passing pixels to OCR."""
    import numpy as np
    from PIL import Image
    with Image.open(png_path) as image:
        width, height = image.size
        pixels = np.array(image.convert('RGB'))[:, :, ::-1].copy()
    result, _elapse = _get_engine()(pixels)
    return normalize_results(result, width, height)


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
        with contextlib.redirect_stdout(sys.stderr):
            lines = ocr(sys.argv[1])
        print(json.dumps(lines, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001 - 助手契约：错误也走 stdout JSON
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
