// CDEF PDF Studio 功能演示截图脚本
// 逐个功能走一遍真实操作流程，产出干净的演示图（中英双语）
import { test, _electron as electron } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve('.');
const out = path.join(root, 'docs/images');
await fs.mkdir(out, { recursive: true });

for (const locale of ['zh-CN', 'en-US']) {
  const t = JSON.parse(await fs.readFile(`src/i18n/${locale}.json`, 'utf8'));
  const zh = locale === 'zh-CN';
  const shot = (name) => path.join(out, `demo-${locale}-${name}.png`);

  test(`demo ${locale}`, async () => {
    const app = await electron.launch({
      args: [root, '--no-sandbox', '--user-data-dir=' + path.join(root, 'tests/results/profile-demo-' + locale + '-' + Date.now())],
      cwd: root,
    });
    try {
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.waitForSelector('.empty', { timeout: 30000 });
      await page.evaluate(l => localStorage.setItem('language', l), locale);
      await page.reload();
      await page.waitForSelector('.empty', { timeout: 30000 });
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1496, 855));
      await page.waitForTimeout(400);

      const button = (k) => page.getByRole('button', { name: t[k], exact: true });
      const tab = (k) => page.locator('.ribbon-tabs').getByRole('button', { name: t[k], exact: true });
      // 打开文件：空状态用主按钮，已有文档时用标签栏的「+」
      const openFile = async (f) => {
        await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); },
          path.join(root, 'test-fixtures', f));
        const emptyOpen = page.locator('.empty').getByRole('button', { name: t.open, exact: true });
        if (await emptyOpen.count()) await emptyOpen.click();
        else await page.locator('.titlebar button[aria-label="' + t.open + '"]').last().click();
        await page.waitForSelector('.paper>img', { timeout: 30000 });
        await page.waitForTimeout(600);
      };

      // ============ 1. 空状态/主界面 ============
      await page.screenshot({ path: shot('01-welcome') });

      // ============ 2. 打开 PDF：主界面（阅读态）============
      await openFile('research.pdf');
      await page.screenshot({ path: shot('02-open') });

      // ============ 3. 搜索功能 ============
      await page.getByLabel(t.search, { exact: true }).fill(zh ? '中文' : 'layout');
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shot('03-search') });
      await page.getByLabel(t.search, { exact: true }).fill('');

      // ============ 4. 页内文字编辑 ============
      await tab('edit').click();
      await page.waitForTimeout(300);
      await page.locator('.text-object').first().click();
      await page.waitForSelector('[data-testid=text-content]');
      await page.getByTestId('text-content').fill(zh ? '这是编辑后的文字内容' : 'This is edited text content');
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('04-text-edit') });
      await page.getByTestId('text-content').press('Escape');
      await page.waitForTimeout(300);
      await button('undo').click().catch(() => {});
      await page.waitForTimeout(400);

      // ============ 5. 添加文字 ============
      await tab('edit').click();
      await button('addText').click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: shot('05-add-text') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 6. 图片编辑 ============
      await openFile('images.pdf');
      await tab('edit').click();
      await page.waitForTimeout(400);
      await page.locator('.image-object').first().click({ position: { x: 15, y: 15 } });
      await page.waitForTimeout(600);
      await page.screenshot({ path: shot('06-image-edit') });

      // ============ 7. 页面管理（合并/拆分/旋转）============
      await tab('page').click();
      await page.waitForTimeout(300);
      await button('pageManager').click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('07-page-manager') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 8. 标注 ============
      await tab('annotate').click();
      await button('markup.highlight').click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('08-markup') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 9. OCR 对话框 ============
      await openFile('ocr-batch.pdf');
      await tab('home').click();
      await button('ocr').click();
      await page.waitForTimeout(1200);
      await page.screenshot({ path: shot('09-ocr') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 10. 批量转换对话框 ============
      await tab('batch').click();
      await button('batchConvert').click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot('10-batch') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 11. 转换对话框（单文件）============
      await tab('convert').click();
      await button('convert').click().catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: shot('11-convert') });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);

      // ============ 12. 设置/关于 ============
      await button('settings').click().catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot('12-settings') });
      await page.keyboard.press('Escape');

      console.log(`✅ ${locale} 演示截图完成，页面错误: ${errors.length ? errors.join('; ') : '无'}`);
    } finally {
      await app.close();
    }
  });
}
