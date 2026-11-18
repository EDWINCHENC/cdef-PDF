"""Exercise the shipped worker/OCR pair, not only imports in the build venv."""
import argparse
import base64
import io
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading

import pymupdf as fitz
from docx import Document
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    runtime = parser.add_mutually_exclusive_group(required=True)
    runtime.add_argument('--engine', type=Path, help='frozen worker executable')
    runtime.add_argument('--python', type=Path, help='source worker Python for local validation')
    parser.add_argument('--ocr', type=Path, required=True, help='matching OCR executable or Python helper')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    # Keep the venv path: resolving its Python symlink loses pyvenv.cfg discovery.
    command = [str(args.engine.resolve())] if args.engine else [str(args.python.absolute()), str(root/'engine/worker.py')]
    env = {**os.environ, 'CDEF_PDF_OCR': str(args.ocr.resolve()), 'PYTHONIOENCODING': 'utf-8'}
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding='utf8', env=env)
    replies, diagnostics = queue.Queue(), []
    def read_replies():
        for line in process.stdout:
            replies.put(line)
        replies.put(None)
    def read_errors():
        for line in process.stderr:
            diagnostics.append(line.rstrip())
            del diagnostics[:-100]
    threading.Thread(target=read_replies, daemon=True).start()
    threading.Thread(target=read_errors, daemon=True).start()
    seq = 0
    def rpc(method, **params):
        nonlocal seq
        seq += 1
        process.stdin.write(json.dumps({'id': seq, 'method': method, 'params': params}, ensure_ascii=False)+'\n')
        process.stdin.flush()
        line = replies.get(timeout=360)
        if line is None:
            raise RuntimeError('Worker exited: '+'; '.join(diagnostics))
        reply = json.loads(line)  # Any diagnostic on stdout is a protocol failure.
        assert reply['id'] == seq, reply
        return reply
    def result(method, **params):
        reply = rpc(method, **params)
        assert 'error' not in reply, reply
        return reply['result']
    try:
        with fitz.open() as native:
            p = native.new_page(width=500, height=700)
            p.insert_text((40, 80), 'TOP ALPHA 123', fontsize=22)
            p.insert_text((40, 280), '中文文字识别测试', fontname='china-s', fontsize=22)
            p.insert_text((40, 620), 'BOTTOM OMEGA 789', fontsize=22)
            image = p.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes('png')
        for mixed in [False, True]:
            with fitz.open() as d:
                p = d.new_page(width=500, height=700)
                p.insert_image(p.rect, stream=image)
                if mixed:
                    p.insert_text((410, 680), 'Page 1')
                raw = d.tobytes()
            sid = result('open', data=base64.b64encode(raw).decode(), name='中文扫描.pdf')['id']
            exported = result('export', sid=sid, format='docx')
            word = Document(io.BytesIO(base64.b64decode(exported['data'])))
            text = '\n'.join(p.text for p in word.paragraphs)
            assert 'ALPHA' in text and 'OMEGA' in text and '中文文字识别测试' in text, text
            assert text.index('ALPHA') < text.index('中文') < text.index('OMEGA'), text
            if mixed:
                assert text.count('Page 1') == 1, text
            current = result('info', sid=sid)
            assert current['revision'] == 0 and not current['canUndo'], current
            if not mixed:
                preview = result('preview', sid=sid, operations=[{'type':'ocr'}])
                result('commit', sid=sid, token=preview['token'])
                saved = result('export', sid=sid, format='pdf')
                with fitz.open(stream=base64.b64decode(saved['data']), filetype='pdf') as d:
                    assert d[0].search_for('ALPHA')[0].y0 < 120
                    assert d[0].search_for('OMEGA')[0].y0 > 580
            result('close', sid=sid)
        blank = io.BytesIO()
        Image.new('RGB', (500, 700), 'white').save(blank, format='PNG')
        with fitz.open() as d:
            p = d.new_page(width=500, height=700)
            p.insert_image(p.rect, stream=blank.getvalue())
            raw = d.tobytes()
        sid = result('open', data=base64.b64encode(raw).decode(), name='blank.pdf')['id']
        reply = rpc('export', sid=sid, format='docx')
        assert reply.get('error', {}).get('code') == 'conversionNoText', reply
        result('close', sid=sid)
        print('PASS: scan/mixed DOCX body, Chinese text, reading order, no footer duplication, OCR position, empty-output rejection')
    finally:
        try:
            process.stdin.close()
        except BrokenPipeError:
            pass
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


if __name__ == '__main__':
    main()
