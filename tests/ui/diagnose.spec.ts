// Windows CI 诊断：逐步 dump 打开→渲染链路的状态
import { test, _electron as electron } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

test('diagnose open-render chain', async () => {
  const root = path.resolve('.');
  const app = await electron.launch({
    args: [root, '--no-sandbox', '--user-data-dir=' + path.join(root, 'tests/results/profile-diag-' + Date.now())],
    cwd: root,
  });
  try {
    const page = await app.firstWindow();
    const logs: string[] = [];
    page.on('console', m => logs.push(`[console:${m.type()}] ${m.text().slice(0, 200)}`));
    page.on('pageerror', e => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
    await page.waitForSelector('.empty', { timeout: 30000 });
    await page.evaluate(l => localStorage.setItem('language', l), 'zh-CN');
    await page.reload();
    await page.waitForSelector('.empty', { timeout: 30000 });
    console.log('DIAG shell: title=' + (await page.title()));

    const data = (await fs.readFile(path.join(root, 'test-fixtures/research.pdf'))).toString('base64');
    // 步骤 1: 直接 import_file RPC
    const r1 = await page.evaluate(async (d) => {
      try {
        const r = await (window as any).studio.rpc('import_file', { data: d, name: 'research.pdf' });
        return { ok: true, id: r.id, pages: r.pages?.length };
      } catch (e) { return { ok: false, error: String(e).slice(0, 300) }; }
    }, data);
    console.log('DIAG step1 import_file: ok=' + r1.ok + (r1.ok ? ` pages=${r1.pages}` : ` error=${r1.error}`));

    // 步骤 2: 直接 render RPC（用完整 id）
    if (r1.ok) {
      const r2 = await page.evaluate(async (id) => {
        try {
          const r = await (window as any).studio.rpc('render', { sid: id, page: 0, scale: 1 });
          return { ok: true, imgLen: r.image?.length, w: r.width, h: r.height };
        } catch (e) { return { ok: false, error: String(e).slice(0, 300) }; }
      }, r1.id);
      console.log('DIAG step2 render: ok=' + r2.ok + (r2.ok ? ` imgLen=${r2.imgLen} ${r2.w}x${r2.h}` : ` error=${r2.error}`));
    }

    // 步骤 3: 走 UI 打开流程
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, path.join(root, 'test-fixtures/research.pdf'));
    await page.locator('.empty').getByRole('button', { name: '打开 PDF' }).click();
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => ({
      hasEmpty: !!document.querySelector('.empty'),
      hasPaper: !!document.querySelector('.paper'),
      hasImg: !!document.querySelector('.paper>img'),
      imgSrc: (document.querySelector('.paper>img') as HTMLImageElement)?.src?.slice(0, 60) || null,
      error: document.querySelector('.error,[role=alert]')?.textContent?.slice(0, 200) || null,
      bodyText: document.body.innerText.slice(0, 200),
    }));
    console.log('DIAG step3 ui-state: ' + JSON.stringify(state));
    console.log('DIAG logs: ' + JSON.stringify(logs.slice(0, 15)));
  } finally {
    await app.close();
  }
});
