import sys,json,traceback
# Windows 默认代码页（cp1252/cp936）无法编码中文响应（如 objects 返回的 PDF 提取文本）：
# 强制 stdout 为 UTF-8，否则 print 抛 UnicodeEncodeError 导致 worker 进程崩溃。
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
from core import Engine,EngineError
engine=Engine()
allowed={'open','info','close','render','objects','text_backdrop','text_layout','ocr_plan','ocr_begin','ocr_step','ocr_finish','ocr_cancel','image_layer','search','preview','commit','history','plan','replace_plan','conversion_info','markup_plan','markups','export','import_file'}
for line in sys.stdin:
    try:
        request=json.loads(line)
        if request['method'] not in allowed:raise EngineError('invalidOperation')
        result=getattr(engine,request['method'])(**request.get('params',{}))
        response={'id':request['id'],'result':result}
    except EngineError as e:response={'id':request.get('id'),'error':{'code':e.code,'details':e.details}}
    except Exception:
        traceback.print_exc(file=sys.stderr);response={'id':request.get('id'),'error':{'code':'operationFailed'}}
    print(json.dumps(response,ensure_ascii=False),flush=True)
