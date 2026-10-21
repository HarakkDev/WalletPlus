import {register} from '../js/services/auth.js';
import {getData, updateAccount, deleteAccount} from '../js/services/repository.js';

const summary = document.querySelector('#summary');
const results = document.querySelector('#results');
const frame = document.querySelector('#application');
const appURL = new URL('../', location.href);
const previousSession = localStorage.getItem('walet-plus-session');
let account;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until(condition, label) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const value = await condition();
    if (value) return value;
    await pause(50);
  }
  throw new Error(`Tempo esgotado: ${label}. ${frame.contentDocument?.querySelector('.form-error:not([hidden])')?.textContent || ''}`);
}
function pass(message) {
  const item = document.createElement('li');
  item.textContent = `✓ ${message}`;
  results.append(item);
}
async function finish(error) {
  frame.src = 'about:blank';
  if (account) await deleteAccount(account.id);
  if (previousSession) localStorage.setItem('walet-plus-session', previousSession);
  else localStorage.removeItem('walet-plus-session');
  summary.dataset.status = error ? 'fail' : 'pass';
  summary.textContent = error ? error.message : `${results.children.length} verificações PWA aprovadas.`;
}

window.runOfflineChecks = async () => {
  summary.dataset.status = 'running-offline';
  document.querySelector('#offline-check').hidden = true;
  try {
    let disconnected = false;
    try { await fetch(new URL('pwa.html?network-probe=1', location.href), {cache: 'no-store'}); }
    catch { disconnected = true; }
    assert(disconnected, 'O navegador precisa estar offline para esta verificação.');
    pass('Conexão de rede realmente bloqueada durante o teste');
    frame.src = new URL('index.html?offline-test=1#dashboard', appURL).href;
    await until(() => frame.contentWindow.location.search.includes('offline-test=1') && frame.contentDocument.readyState === 'complete' && frame.contentDocument.querySelector('#new-income'), 'abrir painel offline');
    assert(frame.contentWindow.Chart, 'Chart.js deve carregar sem internet.');
    assert(frame.contentWindow.getComputedStyle(frame.contentDocument.body).backgroundColor === 'rgb(11, 17, 32)', 'CSS deve carregar offline.');
    pass('Página, estilos, módulos e gráficos carregam após recarregar sem internet');
    frame.contentDocument.querySelector('#new-income').click();
    const form = frame.contentDocument.querySelector('dialog[open] form');
    form.elements.description.value = 'Receita offline de teste';
    form.elements.amount.value = '300';
    form.elements.amount.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    assert(form.elements.amount.value === '3,00', 'Máscara deve funcionar offline.');
    form.requestSubmit();
    await until(async () => (await getData(account.id)).transactions.length === 1, 'salvar receita offline');
    assert((await getData(account.id)).transactions[0].amount === 300, 'Persistência offline deve manter centavos.');
    pass('Receita cadastrada e persistida no IndexedDB sem conexão');
    frame.contentWindow.location.hash = 'reports';
    await until(() => frame.contentDocument.querySelector('#report-content canvas'), 'relatórios offline');
    pass('Navegação e relatórios continuam funcionando offline');
    await finish();
  } catch (error) { await finish(error); }
};

try {
  const manifest = await (await fetch(new URL('manifest.webmanifest', appURL))).json();
  assert(manifest.name === 'Wallet+' && manifest.display === 'standalone', 'Manifesto deve identificar a aplicação instalada.');
  assert(new URL(manifest.start_url, appURL).href === appURL.href && new URL(manifest.scope, appURL).href === appURL.href, 'Start URL e escopo devem respeitar o subdiretório.');
  for (const entry of manifest.icons) {
    const image = new Image();
    image.src = new URL(entry.src, appURL);
    await image.decode();
    assert(`${image.naturalWidth}x${image.naturalHeight}` === entry.sizes, 'Dimensão real do ícone diferente da declarada.');
  }
  pass('Manifesto, ícones PNG e caminhos relativos válidos');
  account = await register({name: 'Teste PWA', email: `pwa-${crypto.randomUUID()}@wallet-test.invalid`, password: 'somente-teste-pwa-123'});
  await updateAccount(account.id, {onboardingComplete: true});
  frame.src = new URL('index.html#dashboard', appURL).href;
  await until(() => frame.contentDocument?.querySelector('#new-income'), 'painel online');
  const registration = await until(() => navigator.serviceWorker.getRegistration(appURL.href), 'registro do service worker');
  await until(() => registration.active?.state === 'activated' && frame.contentWindow.navigator.serviceWorker.controller, 'cache instalado e aplicação controlada');
  assert(registration.scope === appURL.href, 'Service worker não deve ultrapassar a pasta da aplicação.');
  assert(frame.contentDocument.querySelector('link[rel="manifest"]'), 'HTML deve vincular o manifesto.');
  pass('Service worker registrado pela aplicação e restrito ao diretório correto');
  summary.dataset.status = 'offline-ready';
  summary.textContent = 'Cache preparado. Aguardando desconexão para testar.';
  document.querySelector('#offline-check').hidden = false;
  document.querySelector('#offline-check').addEventListener('click', window.runOfflineChecks, {once: true});
} catch (error) { await finish(error); }
