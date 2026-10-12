/* npm install --no-save playwright && npx playwright install chromium
 * node tests/browser.cjs
 * Real TensorFlow/MobileNet/KNN are used; only the physical camera is simulated.
 */
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright` : 'playwright');

(async () => {
  const server = http.createServer((request, response) => {
    const filename = {'/':'index.html','/app.js':'app.js','/styles.css':'styles.css'}[request.url];
    if (!filename) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(fs.readFileSync(path.join(__dirname, '..', filename)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.TEST_URL || `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROMIUM_PATH || undefined,
    proxy: process.env.HTTPS_PROXY ? {server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost'} : undefined, args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    ...(process.env.TEST_CPU === '1' ? ['--disable-webgl'] : [])
  ]});
  const page = await browser.newPage({viewport: {width: 1440, height: 1100},
    ignoreHTTPSErrors: process.env.TEST_PROXY_CERT === '1'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith('https:')) console.log('Download:', response.status(), response.url().split('?')[0]);
  });
  page.on('console', message => { if (message.type() === 'error' || message.text().startsWith('Training:')) console.log('Browser:', message.text()); });
  page.setDefaultTimeout(180000);
  try {
    await page.goto(url);
    await page.evaluate(() => new MutationObserver(() => console.log('Training:', document.getElementById('training-status').textContent))
      .observe(document.getElementById('training-status'), {childList:true}));
    assert.equal(await page.locator('.class-container').count(), 2);
    assert.equal(await page.locator('#train-btn').isDisabled(), true);
    assert.equal(await page.locator('#test-upload-btn').isDisabled(), true);
    assert.equal(await page.locator('script[src*="cdn.jsdelivr"]').count(), 0);
    for (let i = 0; i < 3; i++) await page.locator('#add-class-btn').click();
    assert.equal(await page.locator('.class-container').count(), 5);
    assert.equal(await page.locator('#add-class-btn').isDisabled(), true);
    await page.locator('#clear-data-btn').click();
    assert.equal(await page.locator('.class-container').count(), 2);
    console.log('PASS immediate initialization, class limits, reset and training gates');

    await page.locator('.class-name').nth(0).fill('Rot <img src=x onerror=alert(1)>');
    await page.locator('.class-name').nth(1).fill('Blau');
    const samples = await page.evaluate(() => ['red', 'blue'].map((color, i) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 224;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,224,224);
      ctx.fillStyle = 'white';
      if (i === 0) { for(let x=0; x<224; x+=32) ctx.fillRect(x,0,10,224); }
      else { ctx.beginPath(); ctx.arc(112,112,70,0,Math.PI*2); ctx.fill(); }
      return canvas.toDataURL('image/png').split(',')[1];
    }));
    const file = (color, i) => ({name: `sample-${i}.png`, mimeType: 'image/png', buffer: Buffer.from(samples[color], 'base64')});
    await page.locator('input[type="file"][multiple]').nth(0).setInputFiles(Array.from({length: 25}, (_,i) => file(0,i)));
    await page.waitForFunction(() => !busy);
    assert.equal(await page.locator('.class-container').nth(0).locator('.preview-img').count(), 20);
    assert.equal(await page.locator('.image-count').nth(0).textContent(), '20 / 20 Bilder');
    await page.locator('input[type="file"][multiple]').nth(1).setInputFiles([
      {name:'bad.png', mimeType:'image/png', buffer:Buffer.from('not an image')},
      ...Array.from({length:5}, (_,i)=>file(1,i))
    ]);
    await page.waitForFunction(() => !busy);
    assert.equal(await page.locator('.class-container').nth(1).locator('.preview-img').count(), 5);
    assert.equal(await page.locator('#train-btn').isEnabled(), true);
    assert.equal(await page.locator('.class-header img').count(), 0);
    console.log('PASS bounded concurrent uploads, corrupt images, safe labels and counts');

    await page.route('**/tf.min.js', route => route.abort());
    await page.locator('#train-btn').click();
    await page.waitForFunction(() => !busy);
    assert.match(await page.locator('#training-status').textContent(), /nicht geladen/);
    assert.equal(await page.locator('#train-btn').isEnabled(), true);
    assert.equal(await page.locator('.preview-img').count(), 25);
    await page.unroute('**/tf.min.js');
    console.log('PASS CDN failure is recoverable and preserves samples');

    await page.locator('#train-btn').click();
    await page.waitForFunction(() => !busy);
    const trainingMessage = await page.locator('#training-status').textContent();
    assert.match(trainingMessage, /Training abgeschlossen/);
    assert.equal(await page.evaluate(() => trained), true);
    assert.equal(await page.evaluate(() => Object.values(classifier.getClassExampleCount()).reduce((a,b)=>a+b,0)), 25);
    await page.locator('#test-upload').setInputFiles(file(1,0));
    await page.waitForFunction(() => !busy);
    assert.equal(await page.locator('.result-percentage').nth(1).textContent(), '100.0 %');
    assert.equal(await page.locator('#test-image').isVisible(), true);
    const before = await page.evaluate(() => tf.memory().numTensors);
    await page.evaluate(async () => {
      for(let i=0;i<12;i++) await predict(await decodeImage(classes[1].images[0].src));
    });
    assert.equal(await page.evaluate(() => tf.memory().numTensors), before);
    await page.locator('#train-btn').click();
    await page.waitForFunction(() => !busy);
    assert.equal(await page.evaluate(() => Object.values(classifier.getClassExampleCount()).reduce((a,b)=>a+b,0)), 25);
    console.log('PASS real ML training, image prediction, tensor stability and retraining without duplication');

    await page.locator('#webcam-btn').click();
    await page.waitForFunction(() => document.getElementById('test-status').textContent === 'Live-Test läuft.');
    await page.waitForFunction(() => lastConfidences !== null);
    await page.evaluate(() => { window.testTracks = liveSession.stream.getTracks(); });
    await page.locator('#webcam-btn').click();
    assert.equal(await page.evaluate(() => testTracks.every(track => track.readyState === 'ended')), true);
    await page.evaluate(() => predictionTask);
    console.log('PASS webcam prediction, stopping and track cleanup');

    await page.locator('.class-container').nth(1).locator('.preview-delete').first().click();
    assert.equal(await page.locator('#train-btn').isDisabled(), true);
    assert.equal(await page.locator('#webcam-btn').isDisabled(), true);
    await page.locator('.class-container').nth(1).locator('[data-action="capture"]').click();
    await page.waitForFunction(() => !document.querySelector('.capture-dialog .btn-success').disabled);
    await page.locator('.capture-dialog .btn-success').click();
    await page.evaluate(() => { window.captureTracks = captureSession.stream.getTracks(); });
    await page.locator('.capture-dialog .btn-secondary').click();
    await page.waitForFunction(() => captureSession === null);
    assert.equal(await page.evaluate(() => captureTracks.every(track => track.readyState === 'ended')), true);
    assert.equal(await page.locator('#train-btn').isEnabled(), true);
    assert.equal(await page.locator('.class-container').nth(1).locator('.preview-img').count(), 5);
    console.log('PASS invalidation on deletion and webcam sample capture');

    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path: process.env.TEST_SCREENSHOT || '/tmp/lernmaschine-mobile.png', fullPage:true});
    await page.locator('#clear-data-btn').click();
    await page.waitForFunction(() => !busy);
    assert.equal(await page.locator('.preview-img').count(),0);
    assert.equal(await page.locator('#test-upload-btn').isDisabled(),true);
    assert.equal(await page.evaluate(() => classifier),null);
    assert.deepEqual(errors, []);
    console.log('PASS mobile layout, final reset and no uncaught browser errors');
  } catch (error) {
    console.log('State at failure:', await page.locator('#training-status').textContent().catch(() => 'unavailable'));
    throw error;
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
