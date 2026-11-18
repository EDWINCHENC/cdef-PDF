"""Content checks for automatic OCR exports, beyond valid Office containers."""
import base64
import io
import json
import subprocess
import sys
from pathlib import Path

import pymupdf as fitz
import pytest
from docx import Document
from openpyxl import load_workbook
from PIL import Image

sys.path.insert(0, str(Path(__file__).parents[1] / 'engine'))
import core
from core import Engine, EngineError, b64
from ocr_rapidocr import normalize_results


def scan(engine, mixed=False, rotation=0):
    image = io.BytesIO()
    Image.new('RGB', (500, 700), 'white').save(image, format='PNG')
    with fitz.open() as d:
        p = d.new_page(width=500, height=700)
        p.insert_image(p.rect, stream=image.getvalue())
        if mixed:
            p.insert_text((410, 680), 'Page 1')
        p.set_rotation(rotation)
        raw = d.tobytes()
    sid = engine.open(b64(raw), 'scan.pdf')['id']
    return sid, raw


def rows(page):
    return [{'text': 'TOP ALPHA 123', 'rect': fitz.Rect(40, 60, 250, 85), 'confidence': .99},
            {'text': 'BOTTOM OMEGA 789', 'rect': fitz.Rect(40, 600, 290, 625), 'confidence': .98}]


def test_rapidocr_contract_matches_vision_and_bounds():
    output = normalize_results([
        ([[10, 10], [90, 10], [90, 30], [10, 30]], 'TOP', .99),
        ([[-2, 170], [100, 170], [100, 200], [-2, 200]], 'BOTTOM', 1.1),
    ], 100, 200)
    assert output[0]['rect'] == pytest.approx([.1, .85, .8, .1])
    assert output[1]['rect'] == pytest.approx([0, 0, 1, .15])
    assert output[1]['confidence'] == 1
    with pytest.raises(ValueError):
        normalize_results([([[0, 0], [1, 0], [1, float('nan')], [0, 1]], 'x', .5)], 100, 100)


@pytest.mark.parametrize('fmt', ['docx', 'xlsx', 'txt'])
def test_scan_export_is_readable_ordered_and_does_not_mutate(monkeypatch, fmt):
    e = Engine()
    sid, original = scan(e)
    monkeypatch.setattr(core, 'recognize_lines', rows)
    raw = base64.b64decode(e.export(sid, fmt)['data'])
    if fmt == 'docx':
        actual = '\n'.join(p.text for p in Document(io.BytesIO(raw)).paragraphs)
    elif fmt == 'xlsx':
        actual = '\n'.join(str(row[0]) for row in load_workbook(io.BytesIO(raw)).active.values)
    else:
        actual = raw.decode()
    assert actual == 'TOP ALPHA 123\nBOTTOM OMEGA 789'
    assert e.session(sid).data == original
    assert e.info(sid)['revision'] == 0
    assert not e.session(sid).undo and not e.previews


def test_mixed_scan_exports_body_and_native_footer_once(monkeypatch):
    e = Engine()
    sid, original = scan(e, mixed=True)
    def recognize(page):
        footer = page.get_texttrace()[0]
        return [rows(page)[0], {'text': 'Page1', 'rect': fitz.Rect(footer['bbox']), 'confidence': .99}]
    monkeypatch.setattr(core, 'recognize_lines', recognize)
    raw = base64.b64decode(e.export(sid, 'docx')['data'])
    values = [p.text for p in Document(io.BytesIO(raw)).paragraphs]
    assert values == ['TOP ALPHA 123', 'Page 1']
    assert e.session(sid).data == original


def test_hidden_ocr_line_fits_recognized_box_without_changing_pixels(monkeypatch):
    e = Engine()
    sid, original = scan(e)
    monkeypatch.setattr(core, 'recognize_lines', rows)
    candidate = e.preview(sid, [{'type': 'ocr'}])
    e.commit(sid, candidate['token'])
    with fitz.open(stream=e.session(sid).data, filetype='pdf') as d:
        for row in rows(d[0]):
            found = d[0].search_for(row['text'])[0]
            assert list(found) == pytest.approx(list(row['rect']), abs=.1)
        with fitz.open(stream=original, filetype='pdf') as before:
            assert d[0].get_pixmap().samples == before[0].get_pixmap().samples


@pytest.mark.parametrize('mixed', [False, True])
def test_no_recognized_body_rejects_blank_or_footer_only_output(monkeypatch, mixed):
    e = Engine()
    sid, original = scan(e, mixed=mixed)
    monkeypatch.setattr(core, 'recognize_lines', lambda p: [])
    with pytest.raises(EngineError, match='conversionNoText'):
        e.export(sid, 'docx')
    assert e.session(sid).data == original


def test_ocr_failure_is_not_silently_exported(monkeypatch):
    e = Engine()
    sid, original = scan(e)
    def fail(page):
        raise EngineError('ocrUnavailable')
    monkeypatch.setattr(core, 'recognize_lines', fail)
    with pytest.raises(EngineError, match='ocrUnavailable'):
        e.export(sid, 'docx')
    assert e.session(sid).data == original


def test_rotated_scan_exports_in_display_order_and_ignores_stale_hidden_text(monkeypatch):
    e = Engine()
    sid, _ = scan(e, rotation=90)
    def recognize(page):
        assert page.rotation == 90 and page.rect.width == 700
        return [rows(page)[0]]
    monkeypatch.setattr(core, 'recognize_lines', recognize)
    assert base64.b64decode(e.export(sid, 'txt')['data']).decode() == 'TOP ALPHA 123'
    e2 = Engine()
    sid2, _ = scan(e2)
    with fitz.open(stream=e2.session(sid2).data, filetype='pdf') as d:
        d[0].insert_text((40, 600), 'OLD WRONG HIDDEN TEXT', render_mode=3)
        e2.session(sid2).data = d.tobytes()
    monkeypatch.setattr(core, 'recognize_lines', rows)
    actual = base64.b64decode(e2.export(sid2, 'txt')['data']).decode()
    assert 'OLD WRONG' not in actual and actual.startswith('TOP')


def test_native_text_exports_do_not_require_ocr(monkeypatch):
    def fail(page):
        pytest.fail('native text must not start OCR')
    monkeypatch.setattr(core, 'recognize_lines', fail)
    with fitz.open() as d:
        d.new_page().insert_text((40, 80), 'Native text')
        e = Engine()
        sid = e.open(b64(d.tobytes()))['id']
    word = Document(io.BytesIO(base64.b64decode(e.export(sid, 'docx')['data'])))
    assert word.paragraphs[0].text == 'Native text'


def test_real_scan_word_and_hidden_text_coordinates():
    with fitz.open() as native:
        p = native.new_page(width=500, height=700)
        p.insert_text((40, 80), 'TOP ALPHA 123', fontsize=22)
        p.insert_text((40, 280), '中文文字识别测试', fontname='china-s', fontsize=22)
        p.insert_text((40, 620), 'BOTTOM OMEGA 789', fontsize=22)
        image = p.get_pixmap(matrix=fitz.Matrix(2, 2)).tobytes('png')
    with fitz.open() as d:
        d.new_page(width=500, height=700).insert_image(fitz.Rect(0, 0, 500, 700), stream=image)
        original = d.tobytes()
    e = Engine()
    sid = e.open(b64(original), 'real-scan.pdf')['id']
    word = Document(io.BytesIO(base64.b64decode(e.export(sid, 'docx')['data'])))
    text = '\n'.join(p.text for p in word.paragraphs)
    assert 'ALPHA' in text and 'OMEGA' in text and '中文文字识别测试' in text
    assert text.index('ALPHA') < text.index('中文') < text.index('OMEGA')
    assert e.session(sid).data == original
    with fitz.open(stream=original, filetype='pdf') as mixed:
        mixed[0].insert_text((410, 680), 'Page 1')
        mixed_sid = e.open(b64(mixed.tobytes()))['id']
    mixed_word = Document(io.BytesIO(base64.b64decode(e.export(mixed_sid, 'docx')['data'])))
    mixed_text = '\n'.join(p.text for p in mixed_word.paragraphs)
    assert '中文文字识别测试' in mixed_text and mixed_text.count('Page 1') == 1
    candidate = e.preview(sid, [{'type': 'ocr'}])
    e.commit(sid, candidate['token'])
    with fitz.open(stream=e.session(sid).data, filetype='pdf') as d:
        assert d[0].search_for('ALPHA')[0].y0 < 100
        assert d[0].search_for('OMEGA')[0].y0 > 580
        with fitz.open(stream=original, filetype='pdf') as before:
            assert d[0].get_pixmap().samples == before[0].get_pixmap().samples


def test_worker_recovers_bad_request_and_keeps_stdout_json():
    root = Path(__file__).parents[1]
    with fitz.open() as d:
        d.new_page().insert_text((40, 80), 'Protocol text')
        raw = b64(d.tobytes())
    requests = ['bad json', json.dumps({'id': 2, 'method': 'open', 'params': {'data': raw}})]
    result = subprocess.run([sys.executable, str(root / 'engine/worker.py')], input='\n'.join(requests)+'\n',
                            capture_output=True, text=True, encoding='utf8', timeout=30)
    replies = [json.loads(line) for line in result.stdout.splitlines()]
    assert len(replies) == 2 and replies[0]['error']['code'] == 'operationFailed'
    assert replies[1]['id'] == 2 and 'result' in replies[1]
