import {spawn} from 'node:child_process';
import {mkdtemp, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, dirname, basename} from 'node:path';

const executable = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:5500';
const profile = await mkdtemp(join(tmpdir(), 'wallet-test-'));
const browser = spawn(executable, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {windowsHide: true, stdio: ['ignore', 'ignore', 'pipe']});
let socket;
let sequence = 0;
const pending = new Map();
const wait = milliseconds => new Promise(resolveWait => setTimeout(resolveWait, milliseconds));

try {
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    const timeout = setTimeout(() => reject(new Error('O Chrome não iniciou em 20 segundos. Defina CHROME_PATH para o executável.')), 20000);
    browser.on('error', reject);
    browser.stderr.on('data', chunk => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolveEndpoint(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, {once: true}); socket.addEventListener('error', reject, {once: true}); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolveSend, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Tempo esgotado: ${method}`)); }, 20000);
    pending.set(id, {resolve: resolveSend, reject, timeout});
    socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  if (process.env.GENERATE_PWA_ICONS === '1') {
    const {targetId} = await send('Target.createTarget', {url: `${origin}/assets/wallet.svg`});
    const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
    await send('Page.enable', {}, sessionId);
    await send('Page.navigate', {url: `${origin}/assets/wallet.svg`}, sessionId);
    await wait(500);
    await mkdir('assets/icons', {recursive: true});
    for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
      const result = await send('Runtime.evaluate', {expression: `(async () => { const image = new Image(); image.src = ${JSON.stringify(`${origin}/assets/wallet.svg`)}; await image.decode(); const canvas = document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); canvas.width = ${size}; canvas.height = ${size}; const context = canvas.getContext('2d'); context.fillStyle = '#36d6b0'; context.fillRect(0, 0, ${size}, ${size}); context.drawImage(image, 0, 0, ${size}, ${size}); return canvas.toDataURL('image/png').split(',')[1]; })()`, awaitPromise: true, returnByValue: true}, sessionId);
      if (!result.result.value) throw new Error('Não foi possível rasterizar os ícones.');
      await writeFile(resolve(`assets/icons/${name}.png`), Buffer.from(result.result.value, 'base64'));
    }
    await send('Target.closeTarget', {targetId});
  }
  for (const page of process.argv.slice(2).length ? process.argv.slice(2) : ['browser']) {
    const {targetId} = await send('Target.createTarget', {url: `${origin}/tests/${page}.html?autorun=1`});
    const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
    let result;
    let offlineStarted = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const evaluation = await send('Runtime.evaluate', {expression: '({status: document.querySelector("#summary")?.dataset.status, text: document.querySelector("#summary")?.textContent, details: document.querySelector("#results")?.innerText})', returnByValue: true}, sessionId);
      result = evaluation.result?.value;
      if (page === 'pwa' && result?.status === 'offline-ready' && !offlineStarted) {
        offlineStarted = true;
        await send('Network.enable', {}, sessionId);
        await send('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0}, sessionId);
        await send('Runtime.evaluate', {expression: 'window.runOfflineChecks(); undefined'}, sessionId);
      }
      if (['pass', 'fail'].includes(result?.status)) break;
      await wait(250);
    }
    console.log(`${page}: ${result?.text || 'sem resultado'}\n${result?.details || ''}`);
    if (result?.status !== 'pass') throw new Error(`Falha no teste de navegador: ${page}`);
    if (offlineStarted) await send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1}, sessionId);
    await send('Target.closeTarget', {targetId});
    if (page === 'pwa') {
      const {targetId: appTarget} = await send('Target.createTarget', {url: `${origin}/`});
      const {sessionId: appSession} = await send('Target.attachToTarget', {targetId: appTarget, flatten: true});
      await wait(1000);
      const installability = await send('Page.getInstallabilityErrors', {}, appSession);
      if (installability.installabilityErrors.length) throw new Error(`Instalação PWA: ${JSON.stringify(installability.installabilityErrors)}`);
      console.log('Chrome: nenhum erro de instalabilidade do PWA.');
      await send('Target.closeTarget', {targetId: appTarget});
    }
  }
  if (process.env.CAPTURE_UI === '1') {
    const {targetId} = await send('Target.createTarget', {url: `${origin}/#welcome`});
    const {sessionId} = await send('Target.attachToTarget', {targetId, flatten: true});
    await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-reduced-motion', value: 'reduce'}]}, sessionId);
    await wait(1000);
    await mkdir('test-results', {recursive: true});
    for (const [name, width, height] of [['desktop', 1440, 1080], ['mobile', 390, 844]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await wait(250);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await send('Runtime.evaluate', {expression: 'document.querySelector("#explore-demo").click()'}, sessionId);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const state = await send('Runtime.evaluate', {expression: 'Boolean(document.querySelector("#dashboard-period"))', returnByValue: true}, sessionId);
      if (state.result.value) break;
      await wait(100);
    }
    for (const [name, width, height] of [['dashboard-desktop', 1440, 1080], ['dashboard-mobile', 390, 844], ['dashboard-small', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await wait(600);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
      if (width < 760) {
        await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 500)'}, sessionId);
        await wait(150);
        const scrolled = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
        await writeFile(resolve(`test-results/${name}-scrolled.png`), Buffer.from(scrolled.data, 'base64'));
        await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0)'}, sessionId);
      }
    }
    await send('Runtime.evaluate', {expression: 'location.hash = "bills"'}, sessionId);
    await wait(500);
    for (const [name, width, height] of [['bills-mobile-top', 390, 844], ['bills-small-top', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0)'}, sessionId);
      await wait(250);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    for (const [name, width, height] of [['bills-desktop', 1440, 1080], ['bills-mobile', 390, 844], ['bills-small', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: width < 720 ? "document.querySelector('.recurring-section').scrollIntoView({block: 'start'});" : 'window.scrollTo(0, 0);'}, sessionId);
      await wait(350);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    for (const width of [320, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height: width < 760 ? 844 : 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'document.querySelector("[data-confirm][data-kind=bill]").click()'}, sessionId);
      await wait(200);
      const confirmation = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/bills-confirmation-${width}.png`), Buffer.from(confirmation.data, 'base64'));
      await send('Runtime.evaluate', {expression: '(() => { document.querySelector("dialog[open] [data-close]").click(); const completed = document.querySelector("#recurring-panel-bill [data-recurring-status=completed]"); completed.open = true; completed.scrollIntoView({block: "start"}); })()'}, sessionId);
      await wait(150);
      const completed = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/bills-completed-${width}.png`), Buffer.from(completed.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false}, sessionId);
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "light"; document.querySelector(".recurring-section").scrollIntoView({block: "start"})'}, sessionId);
    await wait(250);
    const billsLight = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/bills-mobile-light.png'), Buffer.from(billsLight.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "dark"'}, sessionId);
    for (const width of [320, 390, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height: width < 760 ? 844 : 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'document.querySelector("[data-recurring-view=income]").click(); window.scrollTo(0, 0)'}, sessionId);
      await wait(150);
      const income = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/bills-income-${width}.png`), Buffer.from(income.data, 'base64'));
      await send('Runtime.evaluate', {expression: 'document.querySelector("[data-recurring-view=bill]").click()'}, sessionId);
    }
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "dark"; location.hash = "goals"'}, sessionId);
    await wait(350);
    for (const [name, width, height] of [['goals-desktop', 1440, 1080], ['goals-wide', 1920, 1080], ['goals-mobile', 390, 844], ['goals-small', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0)'}, sessionId);
      await wait(250);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await send('Runtime.evaluate', {expression: 'location.hash = "reports"'}, sessionId);
    await wait(500);
    for (const [name, width, height] of [['reports-desktop', 1440, 1080], ['reports-wide', 1920, 1080], ['reports-mobile', 390, 844], ['reports-small', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0)'}, sessionId);
      await wait(400);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    for (const [name, width, height, selector] of [['reports-charts-mobile', 390, 844, '.report-comparison'], ['reports-categories-mobile', 390, 844, '.report-categories'], ['reports-recurrence-small', 320, 740, '.report-recurrence']]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: `document.querySelector('${selector}').scrollIntoView({block: 'start'})`}, sessionId);
      await wait(300);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    await send('Runtime.evaluate', {expression: 'document.querySelector(\'[name="mode"][value="custom"]\').click(); window.scrollTo(0, 0)'}, sessionId);
    const reportsCustom = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/reports-custom-small.png'), Buffer.from(reportsCustom.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "light"; document.querySelector(\'[name="mode"][value="month"]\').click()'}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false}, sessionId);
    await wait(300);
    const reportsLight = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/reports-mobile-light.png'), Buffer.from(reportsLight.data, 'base64'));
    const reportMetrics = [];
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height: width < 760 ? 844 : 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "dark"; window.scrollTo(0, 0)'}, sessionId);
      for (const mode of ['month', 'year', 'custom']) {
        await send('Runtime.evaluate', {expression: `document.querySelector('[name="mode"][value="${mode}"]').click()`}, sessionId);
        await wait(100);
        const metrics = await send('Runtime.evaluate', {expression: `(() => { const panel = document.querySelector('.report-filter-panel').getBoundingClientRect(); const picker = document.querySelector('#report-filters [data-mode="${mode}"]').querySelector('input, button').getBoundingClientRect(); const tabs = document.querySelector('.report-mode-switch').getBoundingClientRect(); return {panel: {width: panel.width, height: panel.height}, picker: {height: picker.height, top: picker.top}, tabs: {height: tabs.height, top: tabs.top}}; })()`, returnByValue: true}, sessionId);
        reportMetrics.push({width, mode, ...metrics.result.value});
        if ([320, 390, 1440].includes(width)) {
          const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
          await writeFile(resolve(`test-results/reports-${mode}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        }
      }
    }
    await writeFile(resolve('test-results/report-filter-metrics.json'), JSON.stringify(reportMetrics, null, 2));
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false}, sessionId);
    await send('Runtime.evaluate', {expression: 'document.querySelector("#report-custom-range").click()'}, sessionId);
    await wait(150);
    const reportDialog = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/reports-range-dialog.png'), Buffer.from(reportDialog.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.querySelector("dialog[open] [data-close]").click()'}, sessionId);
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "dark"; location.hash = "education"'}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
    await wait(800);
    const education = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/education-desktop.png'), Buffer.from(education.data, 'base64'));
    for (const [name, width, height] of [['education-channels-desktop', 1440, 1080], ['education-channels-mobile', 390, 844], ['education-channels-small', 320, 740]]) {
      await send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile: false}, sessionId);
      await send('Runtime.evaluate', {expression: 'document.querySelector(".education-library").scrollIntoView({block:"start"})'}, sessionId);
      await wait(300);
      const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
      await writeFile(resolve(`test-results/${name}.png`), Buffer.from(screenshot.data, 'base64'));
    }
    for (const route of ['transactions', 'settings']) {
      await send('Runtime.evaluate', {expression: `location.hash = "${route}"`}, sessionId);
      await wait(250);
      for (const width of [320, 390, 1024, 1440]) {
        await send('Emulation.setDeviceMetricsOverride', {width, height: width < 760 ? 844 : 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
        await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0)'}, sessionId);
        await wait(150);
        const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
        await writeFile(resolve(`test-results/${route}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        if (route === 'transactions') {
          await send('Runtime.evaluate', {expression: 'document.querySelector(".statement-history-heading").scrollIntoView({block: "start"})'}, sessionId);
          const list = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
          await writeFile(resolve(`test-results/statement-list-${width}.png`), Buffer.from(list.data, 'base64'));
        }
      }
    }
    await send('Runtime.evaluate', {expression: 'location.hash = "transactions"'}, sessionId);
    await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: false}, sessionId);
    await wait(200);
    await send('Runtime.evaluate', {expression: 'window.scrollTo(0, 0); document.querySelector("#toggle-transaction-filters").click()'}, sessionId);
    const statementFilters = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/statement-filters-mobile.png'), Buffer.from(statementFilters.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.querySelector("#toggle-transaction-filters").click(); document.querySelector(".statement-entry").click()'}, sessionId);
    const statementDetails = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/statement-details-mobile.png'), Buffer.from(statementDetails.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.querySelector(".statement-detail-modal .modal-footer [data-close]").click(); document.documentElement.dataset.theme = "light"; document.querySelector(".statement-history-heading").scrollIntoView({block: "start"})'}, sessionId);
    const statementLight = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
    await writeFile(resolve('test-results/statement-list-light.png'), Buffer.from(statementLight.data, 'base64'));
    await send('Runtime.evaluate', {expression: 'document.documentElement.dataset.theme = "dark"'}, sessionId);
    for (const [route, selector] of [['transactions', '[data-new="expense"]'], ['goals', '[data-new-goal]'], ['bills', '[data-new-recurring="bill"][data-group="essential"]']]) {
      await send('Runtime.evaluate', {expression: `location.hash = "${route}"`}, sessionId);
      await wait(200);
      for (const width of [320, 1440]) {
        await send('Emulation.setDeviceMetricsOverride', {width, height: width < 760 ? 844 : 1080, deviceScaleFactor: 1, mobile: false}, sessionId);
        await send('Runtime.evaluate', {expression: `document.querySelector('${selector}').click()`}, sessionId);
        await wait(150);
        const screenshot = await send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: false}, sessionId);
        await writeFile(resolve(`test-results/${route}-modal-${width}.png`), Buffer.from(screenshot.data, 'base64'));
        await send('Runtime.evaluate', {expression: 'document.querySelector("dialog[open] [data-close]").click()'}, sessionId);
      }
    }
    await send('Target.closeTarget', {targetId});
  }
  await send('Browser.close');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  socket?.close();
  browser.kill();
  await wait(600);
  if (dirname(resolve(profile)) !== resolve(tmpdir()) || !basename(profile).startsWith('wallet-test-')) throw new Error('Diretório temporário inesperado; limpeza cancelada.');
  await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 500});
}
