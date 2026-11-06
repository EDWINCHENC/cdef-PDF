const {app,BrowserWindow,ipcMain,dialog,Menu,shell}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const readline=require('node:readline');
const {BatchConversion}=require('./batch-conversion.cjs');
const batch=new BatchConversion((method,params)=>call(method,params));
let worker,win,seq=0,localeRequest=0;const pending=new Map();
const root=path.resolve(__dirname,'..');
const isWin=process.platform==='win32';
const allowed=new Set(['open','info','close','render','objects','text_backdrop','text_layout','ocr_plan','ocr_begin','ocr_step','ocr_finish','ocr_cancel','image_layer','search','preview','commit','history','plan','replace_plan','conversion_info','markup_plan','markups','export','import_file']);
function call(method,params={}){return new Promise((resolve,reject)=>{if(!allowed.has(method))return reject(new Error('invalidOperation'));const id=++seq;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,method,params})+'\n');});}
function startWorker(){
 const packaged=app.isPackaged;
 // 开发模式：项目内 venv 的 Python（Windows 用 Scripts/python.exe，POSIX 用 bin/python）
 const command=packaged
  ?path.join(process.resourcesPath,'engine',isWin?'cdef-pdf-engine.exe':'cdef-pdf-engine')
  :path.join(root,'.venv',isWin?'Scripts':'bin',isWin?'python.exe':'python');
 worker=spawn(command,packaged?[]:[path.join(root,'engine','worker.py')],{env:{...process.env,CDEF_PDF_OCR:packaged
  ?path.join(process.resourcesPath,'engine',isWin?'cdef-pdf-ocr.exe':'cdef-pdf-ocr')
  :path.join(root,'engine','ocr_rapidocr.py')},stdio:['pipe','pipe','pipe']});
 readline.createInterface({input:worker.stdout}).on('line',line=>{try{const r=JSON.parse(line);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(new Error(r.error.code)):p.resolve(r.result);}}catch(e){console.error(e.message);}});
 worker.stderr.on('data',b=>console.error(b.toString()));
 const fail=()=>{for(const p of pending.values())p.reject(new Error('engineStopped'));pending.clear();};worker.on('exit',fail);worker.on('error',fail);
}
app.whenReady().then(()=>{
 startWorker();
 win=new BrowserWindow({width:1496,height:855,minWidth:980,minHeight:640,title:'CDEF PDF Studio',backgroundColor:'#eceef1',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 // PDF zoom belongs to the viewer, never magnify the menus and sidebars.
 win.webContents.setVisualZoomLevelLimits(1,1);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 // Windows 下 path.join 产生反斜杠，file:// URL 需要正斜杠：统一转换后比较
 const distUrl='file://'+path.join(root,'dist').split(path.sep).join('/');
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(distUrl))event.preventDefault();});
 ipcMain.handle('rpc',(_e,method,params)=>call(method,params));
 ipcMain.handle('batch-conversion',async(_event,action,value)=>{
  if(action==='reset')return batch.reset();
  if(action==='files'){
   if(batch.busy||batch.stage)throw new Error('batchBusy');
   const r=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'PDF',extensions:['pdf']}]});
   return r.canceled?batch.status():batch.configure({files:r.filePaths});
  }
  if(action==='folder'){
   if(batch.busy||batch.stage)throw new Error('batchBusy');
   const r=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});
   return r.canceled?batch.status():batch.configure({destination:r.filePaths[0]});
  }
  if(action==='format')return batch.configure({format:value});
  if(action==='begin')return batch.begin();
  if(action==='step')return batch.step();
  if(action==='finish')return batch.finish();
  if(action==='cancel')return batch.cancel();
  if(action==='reveal'&&batch.result){const error=await shell.openPath(batch.result);if(error)throw new Error('batchRevealFailed');return batch.status()}
  throw new Error('invalidOperation');
 });
 ipcMain.handle('language',()=>app.getLocale());
 ipcMain.handle('set-locale',async(_event,lng)=>{
  if(!['en-US','zh-CN'].includes(lng))throw new Error('invalidOperation');
  const request=++localeRequest;
  const base=app.isPackaged?path.join(root,'source'):root;
  const labels=JSON.parse(await fs.readFile(path.join(base,'src/i18n',lng+'.json'),'utf8'));
  if(request!==localeRequest)return;
  const item=(key,command,accelerator)=>({label:labels[key],accelerator,click:()=>win.webContents.send('menu-command',command)});
  // 'hide' 是 macOS 专属角色，Windows 上省略以避免无效角色
  const appSubmenu=[item('settings','settings','CmdOrCtrl+,'),{type:'separator'}];
  if(!isWin)appSubmenu.push({label:labels.hide,role:'hide'});
  appSubmenu.push({label:labels.quit,role:'quit'});
  Menu.setApplicationMenu(Menu.buildFromTemplate([
   {label:labels.appName,submenu:appSubmenu},
   {label:labels.fileMenu,submenu:[item('open','open','CmdOrCtrl+O'),item('save','save','CmdOrCtrl+S')]},
   {label:labels.editMenu,submenu:[item('undo','undo','CmdOrCtrl+Z'),item('redo','redo','CmdOrCtrl+Shift+Z'),{type:'separator'},...['cut','copy','paste','selectAll'].map(role=>({label:labels[role],role})),item('search','search','CmdOrCtrl+F')]},
   {label:labels.viewMenu,submenu:[item('fit','fit'),{label:labels.fullscreen,role:'togglefullscreen'}]},
   {label:labels.windowMenu,submenu:[{label:labels.minimize,role:'minimize'},{label:labels.zoomWindow,role:'zoom'}]},
   {label:labels.help,submenu:[item('help','help')]}
  ]));
 });
 ipcMain.handle('pick',async(_e,kind='pdf')=>{
  const filters=kind==='image'?[{name:'Images',extensions:['png','jpg','jpeg','webp']}]:kind==='import'?[{name:'PDF / Word / Images',extensions:['pdf','docx','png','jpg','jpeg']}]:[{name:'PDF',extensions:['pdf']}];
  const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters});if(r.canceled)return null;
  const stat=await fs.stat(r.filePaths[0]);if(stat.size>60*1024*1024)throw new Error('fileTooLarge');
  return {name:path.basename(r.filePaths[0]),data:(await fs.readFile(r.filePaths[0])).toString('base64')};
 });
 ipcMain.handle('save',async(_e,result)=>{
  if(!result || typeof result.data!=='string' || result.data.length>250*1024*1024)throw new Error('invalidOperation');
  const r=await dialog.showSaveDialog(win,{defaultPath:path.basename(result.name),filters:[{name:result.extension.toUpperCase(),extensions:[result.extension]}]});if(r.canceled)return false;
  const temp=r.filePath+'.cdef-pdf-'+Date.now()+'.tmp';try{await fs.writeFile(temp,Buffer.from(result.data,'base64'),{flag:'wx'});await fs.rename(temp,r.filePath);}finally{await fs.rm(temp,{force:true});}return true;
 });
 ipcMain.handle('recovery',async(_e,action,data)=>{
  const file=path.join(app.getPath('userData'),'recovery.json');
  if(action==='write'){const temp=file+'.tmp';await fs.writeFile(temp,JSON.stringify(data));await fs.rename(temp,file);return true;}
  if(action==='read'){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}}
  if(action==='clear'){await fs.rm(file,{force:true});return true;}
  throw new Error('invalidOperation');
 });
 win.loadFile(path.join(root,'dist/index.html'));
});
app.on('window-all-closed',()=>app.quit());
let quitting=false;app.on('before-quit',event=>{if(quitting)return;if(batch.stage||batch.busy){event.preventDefault();batch.cancel().finally(()=>{const poll=setInterval(()=>{if(!batch.busy){clearInterval(poll);quitting=true;worker?.kill();app.quit()}},100)})}else worker?.kill()});
