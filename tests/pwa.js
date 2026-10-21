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
    await until(() => frame.contentWindow.location.search.includes('offline-test=1') && frame.contentDocument.readyState === 'complete' && frame.contentDocument.querySelector('#dashboard-period'), 'abrir painel offline');
    assert(frame.contentWindow.Chart, 'Chart.js deve carregar sem internet.');
    assert(frame.contentWindow.getComputedStyle(frame.contentDocument.body).backgroundColor === 'rgb(11, 17, 32)', 'CSS deve carregar offline.');
    pass('Página, estilos, módulos e gráficos carregam após recarregar sem internet');
    assert(!frame.contentDocument.querySelector('.dashboard-page button'), 'Início deve permanecer somente para consulta offline.');
    frame.contentWindow.location.hash = 'transactions';
    await until(() => frame.contentDocument.querySelector('[data-new="income"]'), 'cadastro no extrato offline');
    frame.contentDocument.querySelector('[data-new="income"]').click();
    const form = frame.contentDocument.querySelector('dialog[open] form');
    form.elements.description.value = 'Receita offline de teste';
    form.elements.amount.value = '300';
    form.elements.amount.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    assert(form.elements.amount.value === '3,00', 'Máscara deve funcionar offline.');
    form.requestSubmit();
    await until(async () => (await getData(account.id)).transactions.length === 1, 'salvar receita offline');
    assert((await getData(account.id)).transactions[0].amount === 300, 'Persistência offline deve manter centavos.');
    pass('Receita cadastrada e persistida no IndexedDB sem conexão');
    frame.contentWindow.location.hash = 'transactions';
    await until(() => frame.contentDocument.querySelector('.statement-entry') && !frame.contentDocument.querySelector('dialog[open]'), 'extrato offline');
    assert([...frame.contentDocument.styleSheets].some(sheet => sheet.href?.endsWith('/css/pages/transactions.css') && sheet.cssRules.length > 0), 'Estilo do extrato deve carregar do cache.');
    frame.contentDocument.querySelector('.statement-entry').click();
    await until(() => frame.contentDocument.querySelector('.statement-detail-modal[open]'), 'detalhes offline');
    assert(frame.contentDocument.querySelector('.statement-detail-amount').textContent.includes('3,00'), 'Detalhes devem usar o valor real salvo offline.');
    frame.contentDocument.querySelector('.statement-detail-modal .modal-footer [data-close]').click();
    pass('Novo extrato, estilo e detalhes dos lançamentos funcionam offline');
    frame.contentWindow.location.hash = 'reports';
    await until(() => frame.contentDocument.querySelector('#report-content canvas'), 'relatórios offline');
    assert([...frame.contentDocument.styleSheets].some(sheet => sheet.href?.endsWith('/css/pages/reports.css') && sheet.cssRules.length > 0), 'Layout específico de relatórios deve carregar do cache.');
    pass('Navegação, gráficos e novo layout dos relatórios funcionam offline');
    frame.contentWindow.location.hash = 'bills';
    await until(() => frame.contentDocument.querySelector('#bills-month'), 'contas fixas offline');
    assert(frame.contentDocument.querySelector('[data-new-recurring="bill"]'), 'Contas fixas e seus componentes devem carregar sem internet.');
    frame.contentDocument.querySelector('[data-recurring-view="income"]').click();
    assert(!frame.contentDocument.querySelector('#recurring-panel-income').hidden && frame.contentDocument.querySelector('#recurring-panel-bill').hidden && frame.contentDocument.querySelector('#recurring-summary').textContent.includes('Falta receber'), 'Separação de receitas e despesas deve funcionar offline.');
    frame.contentDocument.querySelector('[data-recurring-view="bill"]').click();
    pass('Novo fluxo de contas fixas também carrega offline');
    frame.contentWindow.location.hash = 'goals';
    await until(() => frame.contentDocument.querySelector('.goal-overview'), 'metas offline');
    assert(frame.contentDocument.querySelector('[data-goals-saved]') && !frame.contentDocument.querySelector('main').textContent.includes('Saldo livre') && !frame.contentDocument.querySelector('main').textContent.includes('Saldo total'), 'Resumo simplificado de metas deve carregar offline sem saldos duplicados.');
    frame.contentDocument.querySelector('[data-new-goal]').click();
    const goalForm = frame.contentDocument.querySelector('dialog[open] form');
    goalForm.elements.title.value = 'Meta offline';
    goalForm.elements.target.value = '1000';
    goalForm.elements.target.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    goalForm.requestSubmit();
    await until(() => frame.contentDocument.querySelector('[data-contribute]') && !frame.contentDocument.querySelector('dialog[open]'), 'criar meta offline');
    frame.contentDocument.querySelector('[data-contribute]').click();
    const savingForm = frame.contentDocument.querySelector('dialog[open] form');
    savingForm.elements.amount.value = '200';
    savingForm.elements.amount.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    savingForm.requestSubmit();
    await until(async () => (await getData(account.id)).goals[0]?.contributions.length === 1 && !frame.contentDocument.querySelector('dialog[open]'), 'separar dinheiro offline');
    assert((await getData(account.id)).transactions.length === 1, 'Guardar offline não deve registrar uma despesa.');
    frame.contentWindow.location.hash = 'dashboard';
    await until(() => frame.contentDocument.querySelector('[data-stat="balance"]'), 'ver saldo separado offline');
    assert(frame.contentDocument.querySelector('[data-stat="balance"] .stat-value').textContent.includes('3,00') && frame.contentDocument.querySelector('[data-stat="goals"] .stat-value').textContent.includes('2,00'), 'Metas devem continuar independentes do saldo do Extrato, inclusive offline.');
    assert([...frame.contentDocument.styleSheets].some(sheet => sheet.href?.endsWith('/css/pages/goals.css') && sheet.cssRules.length > 0), 'Estilos da nova tela de metas devem carregar do cache.');
    pass('Nova tela de metas e seu estilo específico carregam offline');
    frame.contentWindow.location.hash = 'bills';
    await until(() => frame.contentDocument.querySelector('#bills-month'), 'criar previsão offline');
    frame.contentDocument.querySelector('[data-recurring-view="bill"]').click();
    frame.contentDocument.querySelector('[data-new-recurring="bill"]').click();
    const billForm = frame.contentDocument.querySelector('dialog[open] form');
    billForm.elements.name.value = 'Conta offline';
    billForm.elements.amount.value = '100';
    billForm.elements.amount.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    billForm.requestSubmit();
    await until(async () => (await getData(account.id)).bills.length === 1 && !frame.contentDocument.querySelector('dialog[open]'), 'salvar previsão offline');
    assert((await getData(account.id)).transactions.length === 1, 'Previsão offline não pode criar despesa.');
    const offlineBill = (await getData(account.id)).bills[0];
    frame.contentDocument.querySelector(`[data-confirm="${offlineBill.id}"]`).click();
    const paymentForm = frame.contentDocument.querySelector('dialog[open] form');
    paymentForm.elements.amount.value = '75';
    paymentForm.elements.amount.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
    paymentForm.requestSubmit();
    await until(async () => (await getData(account.id)).transactions.length === 2 && !frame.contentDocument.querySelector('dialog[open]'), 'confirmar valor real offline');
    const paidWorkspace = await getData(account.id);
    assert(paidWorkspace.bills[0].amount === 100 && paidWorkspace.transactions.find(transaction => transaction.recurringId === offlineBill.id)?.amount === 75, 'Valor efetivo offline deve ser salvo sem modificar a previsão.');
    const paidRow = frame.contentDocument.querySelector(`[data-recurring-row="${offlineBill.id}"]`);
    paidRow.closest('[data-recurring-status="completed"]').open = true;
    paidRow.querySelector('.recurring-menu').open = true;
    const statementLink = [...paidRow.querySelectorAll('a')].find(link => link.hash.includes('record=') && !link.hash.includes('edit='));
    assert(statementLink, 'Conta paga precisa oferecer link para o lançamento exato.');
    statementLink.click();
    await until(() => frame.contentDocument.querySelector('.statement-detail-modal[open]'), 'abrir lançamento exato offline');
    assert(frame.contentDocument.querySelector('.statement-detail-amount').textContent.includes('0,75'), 'Atalho offline deve abrir o valor real pago, não o previsto.');
    frame.contentDocument.querySelector('.statement-detail-modal .modal-footer [data-close]').click();
    await until(() => !frame.contentDocument.querySelector('dialog[open]'), 'fechar lançamento offline');
    assert((await getData(account.id)).transactions.length === 2, 'Navegação offline não pode duplicar o pagamento.');
    pass('Confirmação com valor real e navegação ao lançamento exato funcionam offline');
    frame.contentWindow.location.hash = 'education';
    await until(() => frame.contentDocument.querySelector('.channel-avatar img'), 'educação offline');
    const avatars = [...frame.contentDocument.querySelectorAll('.channel-avatar img')];
    avatars.forEach(avatar => { avatar.loading = 'eager'; });
    await Promise.all(avatars.map(avatar => avatar.decode()));
    assert(avatars.length === 6 && avatars.every(avatar => avatar.naturalWidth > 0) && avatars.some(avatar => avatar.src.endsWith('/dinheiro-com-voce.jpg')), 'Fotos dos seis canais devem carregar sem internet.');
    pass('Fotos dos seis canais, incluindo Dinheiro Com Você, carregam do cache sem internet');
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
  await until(() => frame.contentDocument?.querySelector('#dashboard-period'), 'painel online');
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
