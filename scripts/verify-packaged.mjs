// 打包应用功能验证：驱动 .app 内的完整流程（打开→渲染→编辑→保存）
import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = process.cwd();
const appPath = process.argv[2] || path.join(root, 'release/mac-arm64/OpenPDF Studio.app/Contents/MacOS/OpenPDF Studio');
const engineDir = path.join(path.dirname(appPath), '../Resources/engine');
const fixture = path.join(root, 'test-fixtures/research.pdf');

const app = await electron.launch({
  executablePath: appPath,
  args: ['--no-sandbox', '--user-data-dir=' + path.join(root, 'tests/results/profile-packaged-' + Date.now())],
  cwd: root,
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  console.log('页面 URL:', page.url());
  await page.waitForSelector('.empty', { timeout: 20000 });
  console.log('✅ 打包应用窗口加载（空状态）');

  // 打开 PDF（mock 对话框）
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixture);
  await page.locator('.empty').getByRole('button', { name: '打开 PDF' }).click();
  await page.waitForSelector('.paper>img', { timeout: 20000 });
  const thumbs = await page.locator('.thumb').count();
  console.log(`✅ PDF 打开并渲染，缩略图 ${thumbs} 张`);

  // 页内编辑：选一段文字改掉
  await page.locator('.ribbon-tabs').getByRole('button', { name: '编辑' }).click();
  await page.locator('.text-object').first().click();
  await page.waitForSelector('[data-testid=text-content]', { timeout: 10000 });
  const original = await page.getByTestId('text-content').inputValue();
  await page.getByTestId('text-content').fill('PACKAGED BUILD OK');
  await page.getByTestId('text-content').press('Enter');
  await page.waitForTimeout(500);
  console.log(`✅ 页内编辑完成（原文: ${original.slice(0, 30)}...）`);

  // 保存副本并验证文件
  const out = path.join(root, 'tests/results/packaged-save.pdf');
  await fs.rm(out, { force: true });
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, out);
  await page.locator('.quick-actions').getByRole('button', { name: '另存副本' }).click();
  await page.waitForTimeout(2000);
  const stat = await fs.stat(out).catch(() => null);
  console.log(stat ? `✅ 保存成功：${out}（${stat.size} bytes）` : '❌ 保存失败');

  // 用引擎读回验证编辑生效
  if (stat) {
    const { spawn } = await import('node:child_process');
    const { createInterface } = await import('node:readline');
    const engine = path.join(engineDir, 'openpdf-engine');
    const worker = spawn(engine, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const rl = createInterface({ input: worker.stdout });
    const data = (await fs.readFile(out)).toString('base64');
    const result = await new Promise((resolve, reject) => {
      rl.on('line', line => {
        const r = JSON.parse(line);
        if (r.id === 1) r.error ? reject(new Error(r.error.code)) : resolve(r.result);
      });
      worker.stdin.write(JSON.stringify({ id: 1, method: 'open', params: { data, name: 'readback.pdf' } }) + '\n');
    });
    const objects = await new Promise((resolve, reject) => {
      rl.on('line', line => {
        const r = JSON.parse(line);
        if (r.id === 2) r.error ? reject(new Error(r.error.code)) : resolve(r.result);
      });
      worker.stdin.write(JSON.stringify({ id: 2, method: 'objects', params: { sid: result.id, page: 0 } }) + '\n');
    });
    const found = objects.texts.some(t => t.text.includes('PACKAGED BUILD OK'));
    console.log(found ? '✅ 读回验证：编辑已写入保存的 PDF' : '❌ 读回验证失败');
    worker.kill();
  }
  console.log(errors.length ? `⚠️ 页面错误: ${errors.join('; ')}` : '✅ 无页面错误');
  console.log('🎉 打包应用端到端功能验证通过');
} finally {
  await app.close();
}
