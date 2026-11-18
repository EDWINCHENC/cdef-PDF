import {test,expect,_electron as electron} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {venvPython} from './venv-python';

for(const locale of ['zh-CN','en-US'])test(`${locale}: scans and mixed pages export editable Word; blank recognition never saves`,async()=>{
 const root=path.resolve('.'),output=path.join(root,'tests/results','scan-conversion-'+locale+'-'+Date.now());
 await fs.mkdir(output,{recursive:true});
 const source=path.join(output,'sources'),destination=path.join(output,'batch');
 await fs.mkdir(source);await fs.mkdir(destination);
 execFileSync(venvPython(root),['-c',[
  'import sys,io;from pathlib import Path;import pymupdf as f;from PIL import Image',
  'out=Path(sys.argv[1]);n=f.open();p=n.new_page(width=500,height=700)',
  'p.insert_text((40,80),"TOP ALPHA 123",fontsize=22)',
  'p.insert_text((40,280),"中文文字识别测试",fontname="china-s",fontsize=22)',
  'p.insert_text((40,620),"BOTTOM OMEGA 789",fontsize=22)',
  'image=p.get_pixmap(matrix=f.Matrix(2,2)).tobytes("png")',
  'for name in ["scan","mixed","blank"]:',
  ' d=f.open();p=d.new_page(width=500,height=700)',
  ' if name=="blank":',
  '  b=io.BytesIO();Image.new("RGB",(500,700),"white").save(b,format="PNG");png=b.getvalue()',
  ' else:png=image',
  ' p.insert_image(p.rect,stream=png)',
  ' if name=="mixed":p.insert_text((410,680),"Page 1")',
  ' d.save(out/(name+".pdf"));d.close()',
 ].join('\n'),source],{env:{...process.env,PYTHONIOENCODING:'utf-8'}});
 const t=JSON.parse(await fs.readFile(`src/i18n/${locale}.json`,'utf8'));
 const app=await electron.launch({args:[root,'--no-sandbox','--user-data-dir='+path.join(output,'profile')]});
 try{
  const page=await app.firstWindow(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.waitForSelector('.empty');await expect(page).toHaveTitle('CDEF PDF Studio');expect(page.url()).toContain('/dist/index.html');
  await page.evaluate(l=>localStorage.setItem('language',l),locale);await page.reload();
  const tab=(k:string)=>page.locator('.ribbon-tabs').getByRole('button',{name:t[k],exact:true});
  const readWord=(file:string)=>execFileSync(venvPython(root),['-c','import sys;from docx import Document;print("\\n".join(p.text for p in Document(sys.argv[1]).paragraphs))',file],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  for(const name of ['scan','mixed','blank']){
   const file=path.join(source,name+'.pdf'),save=path.join(output,name+'.docx');
   await app.evaluate(({dialog},{file,save})=>{
    (globalThis as any).__scanSaveCalls=0;
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});
    dialog.showSaveDialog=async()=>{(globalThis as any).__scanSaveCalls++;return {canceled:false,filePath:save}};
   },{file,save});
   await page.locator('.quick-actions').getByRole('button',{name:t.open,exact:true}).click();
   await expect(page.locator('.paper>img')).toBeVisible();await tab('convert').click();
   await page.locator('.ribbon').getByRole('button',{name:t.docx,exact:true}).click();
   if(name==='blank'){
    await expect(page.getByRole('alert')).toContainText(t['error.conversionNoText']);
    expect(await app.evaluate(()=>(globalThis as any).__scanSaveCalls)).toBe(0);
    expect(await fs.stat(save).catch(()=>null)).toBeNull();
   }else{
    await expect.poll(async()=>!!await fs.stat(save).catch(()=>null)).toBe(true);
    const text=readWord(save);expect(text).toContain('中文文字识别测试');expect(text.indexOf('ALPHA')).toBeLessThan(text.indexOf('OMEGA'));
    if(name==='mixed')expect(text.match(/Page 1/g)).toHaveLength(1);
    await expect(page.getByRole('alert')).toHaveCount(0);
   }
   await expect(page.locator('.busy-mask')).toHaveCount(0);await expect(page.locator('.dirty-dot')).toHaveCount(0);
   await expect(page.locator('.quick-actions').getByRole('button',{name:t.undo,exact:true})).toBeDisabled();
   await page.screenshot({path:path.join(output,name+'.png')});
  }
  // The batch uses the same real OCR export and preserves transactional output.
  await tab('batch').click();await page.getByRole('button',{name:t.batchConvert,exact:true}).click();
  const choose=async(names:string[])=>{
   await app.evaluate(({dialog},{files,destination})=>{dialog.showOpenDialog=async(_w,options)=>({canceled:false,filePaths:options.properties.includes('openDirectory')?[destination]:files})},{files:names.map(n=>path.join(source,n+'.pdf')),destination});
   await page.getByRole('button',{name:t.batchChooseFiles,exact:true}).click();
  };
  await choose(['scan','mixed']);await page.getByRole('button',{name:t.batchChooseFolder,exact:true}).click();
  await page.getByRole('button',{name:t.batchStart,exact:true}).click();await expect(page.locator('.batch-success')).toBeVisible();
  const folders=await fs.readdir(destination);expect(folders).toHaveLength(1);
  for(const name of await fs.readdir(path.join(destination,folders[0])))expect(readWord(path.join(destination,folders[0],name))).toContain('中文文字识别测试');
  await choose(['scan','blank']);await page.getByRole('button',{name:t.batchStart,exact:true}).click();
  await expect(page.locator('dialog [role=alert]')).toContainText(t['error.conversionNoText']);
  expect(await fs.readdir(destination)).toEqual(folders);
  expect(await page.locator('vite-error-overlay').count()).toBe(0);expect(errors).toEqual([]);
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({locale,title:await page.title(),url:page.url(),errors,scanWord:readWord(path.join(output,'scan.docx')),mixedWord:readWord(path.join(output,'mixed.docx')),blankNotSaved:true,batchScanSuccess:true,batchFailureRolledBack:true},null,2));
 }finally{await app.close()}
});
