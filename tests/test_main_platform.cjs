// main.cjs 跨平台适配单元测试：mock electron 与 child_process，
// 在 win32 / darwin 下验证 Windows 适配的三处关键逻辑。
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const MAIN = path.resolve(__dirname, '..', 'desktop', 'main.cjs');

function loadMain(platform) {
  const originalLoad = Module._load;
  const originalPlatform = process.platform;
  const realChildProcess = require('node:child_process'); // 先取真实模块，避免 mock 内递归 require
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });

  const spawnCalls = [];
  const ipcHandlers = new Map();
  const webContentsHandlers = new Map();
  const menuTemplates = [];
  let readyCallback = null;

  const makeWorker = () => {
    const w = new EventEmitter();
    w.stdin = { write() {} };
    w.stdout = new PassThrough(); // readline 需要真实流（resume/data 事件）
    w.stderr = new PassThrough();
    w.kill = () => {};
    return w;
  };

  const electronMock = {
    app: {
      isPackaged: false,
      whenReady: () => { readyCallback = () => {}; return Promise.resolve(); },
      getLocale: () => 'zh-CN',
      getPath: () => '/tmp/fake-user-data',
      on: () => {},
      quit: () => {},
    },
    BrowserWindow: class {
      constructor() {
        this.webContents = {
          setVisualZoomLevelLimits: () => {},
          setWindowOpenHandler: () => {},
          on: (event, fn) => webContentsHandlers.set(event, fn),
          send: () => {},
        };
      }
      loadFile() { return Promise.resolve(); }
    },
    ipcMain: { handle: (channel, fn) => ipcHandlers.set(channel, fn) },
    dialog: {},
    Menu: {
      setApplicationMenu: () => {},
      buildFromTemplate: (tpl) => { menuTemplates.push(tpl); return { items: tpl.map(t => ({ label: t.label })) }; },
    },
    shell: {},
  };

  const cpMock = {
    spawn: (...args) => { spawnCalls.push(args); return makeWorker(); },
  };

  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electronMock;
    if (request === 'node:child_process') return { ...realChildProcess, spawn: cpMock.spawn };
    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(MAIN)];
    require(MAIN);
  } finally {
    Module._load = originalLoad;
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  }
  return { spawnCalls, ipcHandlers, webContentsHandlers, menuTemplates };
}

for (const platform of ['win32', 'darwin']) {
  test(`${platform}: 引擎 spawn 路径与 OCR 助手指向`, async () => {
    const { spawnCalls } = loadMain(platform);
    await new Promise(r => setImmediate(r));
    assert.ok(spawnCalls.length >= 1, 'startWorker 应已 spawn 引擎');
    const [command, args, options] = spawnCalls[0];
    if (platform === 'win32') {
      assert.ok(command.endsWith(path.join('.venv', 'Scripts', 'python.exe')), `win32 应使用 Scripts/python.exe，实际: ${command}`);
    } else {
      assert.ok(command.endsWith(path.join('.venv', 'bin', 'python')), `darwin 应使用 bin/python，实际: ${command}`);
    }
    assert.ok(args[0].endsWith(path.join('engine', 'worker.py')), `应启动 engine/worker.py，实际: ${args[0]}`);
    assert.ok(options.env.OPENPDF_OCR.endsWith(path.join('engine', 'ocr_rapidocr.py')), `OPENPDF_OCR 应指向 ocr_rapidocr.py，实际: ${options.env.OPENPDF_OCR}`);
  });
}

test('win32: 应用菜单不含 macOS 专属 hide 角色', async () => {
  const { ipcHandlers, menuTemplates } = loadMain('win32');
  await new Promise(r => setImmediate(r));
  const setLocale = ipcHandlers.get('set-locale');
  assert.ok(setLocale, 'set-locale handler 应已注册');
  await setLocale({}, 'zh-CN');
  const tpl = menuTemplates.at(-1);
  assert.ok(tpl, '应已构建菜单');
  const appMenu = tpl[0];
  const roles = appMenu.submenu.filter(i => i.role).map(i => i.role);
  assert.ok(!roles.includes('hide'), `win32 菜单不应含 hide 角色，实际: ${roles.join(',')}`);
  assert.ok(roles.includes('quit'), 'quit 角色应存在');
});

test('darwin: 应用菜单含 hide 角色', async () => {
  const { ipcHandlers, menuTemplates } = loadMain('darwin');
  await new Promise(r => setImmediate(r));
  const setLocale = ipcHandlers.get('set-locale');
  await setLocale({}, 'zh-CN');
  const tpl = menuTemplates.at(-1);
  const roles = tpl[0].submenu.filter(i => i.role).map(i => i.role);
  assert.ok(roles.includes('hide'), `darwin 菜单应含 hide 角色，实际: ${roles.join(',')}`);
});

test('win32: will-navigate 守卫放行自身 dist 页面（file:///C:/... 正斜杠 URL）', async () => {
  const { webContentsHandlers } = loadMain('win32');
  await new Promise(r => setImmediate(r));
  const guard = webContentsHandlers.get('will-navigate');
  assert.ok(guard, 'will-navigate handler 应已注册');
  // 模拟 Windows 下 loadFile 产生的 URL（盘符 + 正斜杠）
  const root = path.resolve(__dirname, '..');
  const distUrl = 'file://' + path.join(root, 'dist').split(path.sep).join('/');
  let prevented = false;
  guard({ preventDefault: () => { prevented = true; } }, distUrl + '/index.html');
  assert.ok(!prevented, `自身页面不应被拦截: ${distUrl}`);
  prevented = false;
  guard({ preventDefault: () => { prevented = true; } }, 'https://evil.example.com');
  assert.ok(prevented, '外部 URL 应被拦截');
});
