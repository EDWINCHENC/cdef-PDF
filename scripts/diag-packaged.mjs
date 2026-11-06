// 打包应用渲染诊断：最早挂载监听，打印全部控制台与失败请求
import { _electron as electron } from '@playwright/test';
import path from 'node:path';

const root = process.cwd();
const appPath = process.argv[2] || path.join(root, 'release/mac-arm64/OpenPDF Studio.app/Contents/MacOS/OpenPDF Studio');

const app = await electron.launch({
  executablePath: appPath,
  args: ['--no-sandbox', '--user-data-dir=' + path.join(root, 'tests/results/profile-diagpkg-' + Date.now())],
  cwd: root,
});
app.process().stderr?.on('data', d => {
  const s = d.toString();
  if (!/warning|Warning|deprecat|GPU|gpu|dbus|Fontconfig|libva|MESA|Code Cache|disk_cache/i.test(s)) {
    console.log('[main]', s.slice(0, 200));
  }
});
try {
  const page = await app.firstWindow();
  page.on('console', m => console.log(`[console:${m.type()}]`, m.text().slice(0, 300)));
  page.on('pageerror', e => console.log('[pageerror]', e.message.slice(0, 300)));
  page.on('requestfailed', r => console.log('[requestfailed]', r.url().slice(-60), r.failure()?.errorText));
  page.on('response', r => { if (r.status() >= 400) console.log('[http', r.status() + ']', r.url().slice(-60)); });
  console.log('URL:', page.url());
  await page.waitForTimeout(8000);
  const state = await page.evaluate(() => ({
    root: !!document.getElementById('root'),
    rootHtml: document.getElementById('root')?.innerHTML?.slice(0, 100) || '(empty)',
    scripts: document.querySelectorAll('script').length,
  }));
  console.log('页面状态:', JSON.stringify(state));
} finally {
  await app.close();
}
