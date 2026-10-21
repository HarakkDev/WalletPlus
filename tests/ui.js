import {getSession} from '../js/services/auth.js';
import {getAccount, getData, updateData, deleteAccount} from '../js/services/repository.js';
import {dateISO, formatMoney, getSummary, goalSaved, recentDateRange, shiftMonth} from '../js/domain/finance.js';
import {exportBackup} from '../js/services/backup.js';
import {educationChannels} from '../js/data/education.js';

const frame = document.querySelector('#application');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const button = document.querySelector('#run-tests');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const documentInApp = () => frame.contentDocument;
const find = selector => documentInApp().querySelector(selector);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function until(condition, label) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const result = await condition();
    if (result) return result;
    await pause(20);
  }
  throw new Error(`Tempo esgotado: ${label}. ${find('.form-error:not([hidden])')?.textContent || find('.toast-error')?.textContent || ''}`);
}
function input(selector, value) {
  const element = find(selector);
  assert(element, `Campo ausente: ${selector}`);
  element.value = value;
  element.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
  element.dispatchEvent(new frame.contentWindow.Event('change', {bubbles: true}));
  if (element.hasAttribute('data-money') && value) {
    assert(element.inputMode === 'numeric' && /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(element.value), `Máscara monetária ausente em ${selector}: ${element.value}`);
  }
}
async function submitModal(values) {
  await until(() => find('dialog[open] form'), 'modal aberto');
  Object.entries(values).forEach(([name, value]) => input(`dialog[open] [name="${name}"]`, value));
  find('dialog[open] form').requestSubmit();
  try {
    await until(() => !find('dialog[open]'), 'salvar modal');
  } catch (error) {
    const invalid = [...documentInApp().querySelectorAll('dialog :invalid')].map(element => `${element.name || element.tagName}: ${element.validationMessage}`).join('; ');
    throw new Error(`${error.message} ${invalid} ${find('dialog')?.innerText || ''}`);
  }
}
function revealRecurringRow(selector) {
  const row = typeof selector === 'string' ? find(selector)?.closest('.recurring-row') : selector;
  assert(row, 'O cadastro recorrente deve existir.');
  let ancestor = row.parentElement;
  while (ancestor) {
    if (ancestor.matches('details')) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  return row;
}
async function recurringAction(selector) {
  const action = find(selector);
  assert(action, `Ação recorrente ausente: ${selector}`);
  revealRecurringRow(action.closest('.recurring-row'));
  const menu = action.closest('.recurring-menu');
  assert(menu, 'Ações secundárias devem estar no menu Opções.');
  if (!menu.open) menu.querySelector('summary').click();
  await until(() => menu.open && action.getBoundingClientRect().height >= 44, 'opção visível');
  action.click();
}
function selectRecurringView(kind) {
  const tab = find(`[data-recurring-view="${kind}"]`);
  assert(tab, 'Seletor de despesas e receitas deve estar disponível.');
  tab.click();
  assert(tab.getAttribute('aria-selected') === 'true' && !find(`#recurring-panel-${kind}`).hidden, 'A aba escolhida deve mostrar seu painel.');
  assert(find(`#recurring-panel-${kind === 'bill' ? 'income' : 'bill'}`).hidden, 'Despesas e receitas não devem aparecer empilhadas.');
}
async function navigate(route, heading) {
  frame.contentWindow.location.hash = route;
  await until(() => find('main h1')?.textContent.includes(heading), `abrir ${route}`);
  await pause(50);
}
function assertReadablePage() {
  const document = documentInApp();
  const root = document.documentElement;
  assert(root.scrollWidth <= root.clientWidth + 1, `A página deve caber na tela: ${root.scrollWidth}/${root.clientWidth}px.`);
  const walker = document.createTreeWalker(document.querySelector('main'), frame.contentWindow.NodeFilter.SHOW_TEXT);
  const smallTexts = [];
  while (walker.nextNode()) {
    const element = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || !element.getClientRects().length || element.closest('svg, script, style')) continue;
    const size = parseFloat(frame.contentWindow.getComputedStyle(element).fontSize);
    if (size < 13.5) smallTexts.push(`${element.tagName}: ${walker.currentNode.textContent.trim().slice(0, 30)} (${size}px)`);
  }
  assert(!smallTexts.length, `Texto pequeno: ${smallTexts.slice(0, 3).join('; ')}`);
  for (const field of document.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main select, main textarea')) {
    if (field.getClientRects().length) assert(parseFloat(frame.contentWindow.getComputedStyle(field).fontSize) >= 16, `Campo ${field.id || field.name} deve ter texto de pelo menos 16px.`);
  }
}
function assertAlignedControls() {
  const document = documentInApp();
  const controls = document.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]), main select');
  for (const control of controls) {
    if (!control.getClientRects().length) continue;
    assert(Math.abs(control.getBoundingClientRect().height - 48) < 1, `Campo ${control.name || control.id} deve seguir a altura padrão de 48px.`);
  }
  for (const group of document.querySelectorAll('main .button-row, main .row-actions, .goal-actions, .education-card-actions, .settings-actions, .recurring-actions')) {
    const actions = [...group.querySelectorAll(':scope>.btn, :scope>.recurring-menu>summary')].filter(action => action.getClientRects().length);
    for (const [index, action] of actions.entries()) {
      const bounds = action.getBoundingClientRect();
      assert(bounds.height >= 44, 'Ações devem manter uma área de toque de ao menos 44px.');
      for (const other of actions.slice(index + 1)) {
        const otherBounds = other.getBoundingClientRect();
        if (Math.abs(bounds.top - otherBounds.top) < 2) assert(Math.abs(bounds.height - otherBounds.height) < 2, 'Botões da mesma linha devem ter a mesma altura.');
        const overlapWidth = Math.min(bounds.right, otherBounds.right) - Math.max(bounds.left, otherBounds.left);
        const overlapHeight = Math.min(bounds.bottom, otherBounds.bottom) - Math.max(bounds.top, otherBounds.top);
        assert(overlapWidth < 1 || overlapHeight < 1, 'Ações não podem ficar sobrepostas.');
      }
    }
  }
}
function pass(name) {
  const item = document.createElement('li');
  item.textContent = `✓ ${name}`;
  results.append(item);
}
async function assertNotificationBehavior() {
  const moduleUrl = new URL('./js/components/ui.js', frame.contentWindow.location.href).href;
  const {toast} = await frame.contentWindow.Function('moduleUrl', 'return import(moduleUrl)')(moduleUrl);
  const notifications = find('#notifications');
  toast('Notificação de sucesso para testar clique');
  const success = notifications.lastElementChild;
  toast('Notificação de erro para testar clique', 'error');
  const error = notifications.lastElementChild;
  assert(success.getAttribute('role') === 'status' && error.getAttribute('role') === 'alert', 'Sucesso e erro devem manter seus anúncios acessíveis.');
  assert(frame.contentWindow.getComputedStyle(success).pointerEvents === 'auto' && frame.contentWindow.getComputedStyle(error).pointerEvents === 'auto', 'As notificações devem aceitar cliques, mesmo dentro do container sem eventos de ponteiro.');
  success.click();
  assert(!success.isConnected && error.isConnected, 'Clicar no corpo deve remover somente a notificação escolhida imediatamente.');
  error.querySelector('span').click();
  assert(!error.isConnected, 'Clicar no texto também deve fechar uma notificação de erro imediatamente.');

  toast('Notificação para testar botão de fechar');
  const accessible = notifications.lastElementChild;
  const close = accessible.querySelector('button[aria-label="Fechar notificação"]');
  assert(close?.type === 'button' && close.tabIndex === 0, 'A notificação deve ter um botão de fechar acessível pelo teclado.');
  close.focus();
  assert(documentInApp().activeElement === close, 'O botão de fechar deve receber foco pelo teclado.');
  close.click();
  assert(!accessible.isConnected, 'Ativar o botão de fechar deve remover a notificação imediatamente.');
  pass('Notificações de sucesso e erro fecham por clique, sem afetar outras, e têm botão acessível');

  const started = performance.now();
  toast('Sucesso com duração de dois segundos e meio');
  const timedSuccess = notifications.lastElementChild;
  toast('Erro com duração de dois segundos e meio', 'error');
  const timedError = notifications.lastElementChild;
  await pause(2000);
  assert(timedSuccess.isConnected && timedError.isConnected, 'Sucesso e erro não devem desaparecer antes de dois segundos.');
  await until(() => !timedSuccess.isConnected && !timedError.isConnected, 'notificações fecharem automaticamente');
  const elapsed = performance.now() - started;
  assert(elapsed >= 2400 && elapsed < 3500, `As notificações devem desaparecer perto de 2,5 segundos, não após ${Math.round(elapsed)}ms.`);
  pass('Notificações permanecem por dois segundos e desaparecem automaticamente em aproximadamente 2,5 segundos');
}
async function run() {
  button.disabled = true;
  results.replaceChildren();
  summary.dataset.status = 'running';
  summary.textContent = 'Executando fluxos…';
  const sessionKey = 'walet-plus-session';
  const previousSession = localStorage.getItem(sessionKey);
  let account;
  let demoAccountToRemove;
  let failure;
  try {
    localStorage.removeItem(sessionKey);
    frame.style.width = '320px';
    frame.width = '320';
    frame.src = '../index.html#register';
    await until(() => find('#auth-form'), 'cadastro');
    assertReadablePage();
    await assertNotificationBehavior();
    input('#auth-name', 'Teste de interface');
    input('#auth-email', `ui-${crypto.randomUUID()}@wallet-test.invalid`);
    input('#auth-password', 'senha-apenas-teste-123');
    find('#auth-form').requestSubmit();
    await until(() => find('#onboarding-form'), 'primeiro acesso');
    account = await getSession();
    assert(account && !account.onboardingComplete, 'Cadastro deve iniciar onboarding.');
    pass('Cadastro pela interface inicia o onboarding automaticamente');

    find('[data-add-income="Salário"]').click();
    input('[name^="income-amount-"]', '5000,00');
    find('[data-add-income="Freelance"]').click();
    const incomes = documentInApp().querySelectorAll('[name^="income-amount-"]');
    incomes[1].value = '300,00';
    assertReadablePage();
    find('#onboarding-form').requestSubmit();
    await until(() => find('[data-bill-toggle]'), 'despesas essenciais');
    const essential = [...documentInApp().querySelectorAll('.bill-choice')].find(element => element.textContent.includes('Energia elétrica'));
    essential.querySelector('input').click();
    input('[name^="bill-amount-"]', '250,00');
    assertReadablePage();
    find('#onboarding-form').requestSubmit();
    await until(() => find('h2')?.textContent.includes('assinaturas'), 'assinaturas');
    const subscription = [...documentInApp().querySelectorAll('.bill-choice')].find(element => element.textContent.includes('Netflix'));
    subscription.querySelector('input').click();
    input('[name^="bill-amount-"]', '50,00');
    assertReadablePage();
    find('#onboarding-form').requestSubmit();
    await until(() => find('[data-add-goal]'), 'metas');
    find('[data-add-goal="Fazer uma viagem"]').click();
    input('[name^="goal-target-"]', '2000,00');
    assertReadablePage();
    find('#onboarding-form').requestSubmit();
    await until(() => find('.onboarding-summary'), 'resumo');
    assertReadablePage();
    assert(find('.summary-total').textContent.includes('5.000,00'), 'Resumo mensal deve resultar em 5.000.');
    find('#onboarding-form').requestSubmit();
    await until(() => find('#dashboard-period'), 'painel após onboarding');
    let data = await getData(account.id);
    assert(data.incomeSources.length === 2 && data.bills.length === 2 && data.goals.length === 1, 'Planejamento deve persistir.');
    assert(getSummary(data).balance === 0, 'Previsões não podem criar saldo.');
    pass('Cinco etapas salvam múltiplas rendas, contas, assinatura e meta sem criar saldo');
    assert(!find('.local-note') && !documentInApp().body.textContent.includes('Seu controle começa aqui'), 'O aviso removido não deve aparecer na barra lateral.');

    const quickLabels = [...documentInApp().querySelectorAll('.mobile-nav a span, .mobile-nav button span')].map(element => element.textContent.trim());
    assert(JSON.stringify(quickLabels) === JSON.stringify(['Início', 'Extrato', 'Contas Fixas', 'Metas', 'Mais']), 'Barra rápida deve seguir a ordem solicitada.');
    assert(!find('.mobile-nav [href="#education"]'), 'Educação deve ficar fora da barra rápida.');
    find('.mobile-nav [data-more]').click();
    await until(() => find('dialog[open] [href="#education"]'), 'educação no menu Mais');
    find('dialog[open] [href="#education"]').click();
    await until(() => find('main h1')?.textContent.includes('Aprenda'), 'abrir educação pelo Mais');
    assert(find('.mobile-nav [data-more]').classList.contains('active'), 'Mais deve ficar ativo na educação.');
    await navigate('bills', 'Contas fixas');
    assert(find('.mobile-nav [href="#bills"]').getAttribute('aria-current') === 'page' && !find('.mobile-nav [data-more]').classList.contains('active'), 'Contas Fixas deve ter seu próprio estado ativo.');
    await navigate('dashboard', 'Olá');
    pass('Barra mobile tem Início, Extrato, Contas Fixas, Metas e Mais; educação abre pelo Mais');

    assert(!find('.dashboard-page button'), 'Início deve ser somente para consulta, sem ações de cadastro.');
    await navigate('transactions', 'Extrato');
    assert(find('.sidebar .nav-link[href="#transactions"]').textContent.trim() === 'Extrato' && documentInApp().title === 'Extrato · Wallet+', 'Desktop, celular, título da página e cabeçalho devem usar o mesmo nome Extrato.');
    assert(!find('.statement-help').open && find('#transaction-results').textContent.includes('Seu extrato ainda está vazio'), 'A tela deve distinguir o histórico vazio e manter a ajuda recolhida.');
    find('.statement-help>summary').click();
    assert(find('.statement-help').textContent.includes('automaticamente') && find('.statement-help a[href="#bills"]'), 'Ajuda deve explicar a passagem de Contas fixas para o Extrato, sem exigir novo cadastro.');
    find('.statement-help>summary').click();
    find('[data-new="expense"]').click();
    assert(find('dialog[open] .statement-manual-note').textContent.includes('para não lançar duas vezes') && !find('dialog[open] .statement-extra-fields').open, 'Cadastro manual deve orientar sobre contas previstas e recolher os campos opcionais.');
    find('dialog[open] [data-open-bills]').click();
    await until(() => find('main h1')?.textContent.includes('Contas fixas') && !find('dialog[open]'), 'ir do cadastro manual para as previsões');
    assert((await getData(account.id)).transactions.length === 0, 'Abrir Contas fixas pelo modal não deve registrar nada nem deixar o modal aberto.');
    pass('Extrato tem nome único, ajuda curta e atalho seguro para confirmar contas sem lançamentos duplicados');
    await navigate('transactions', 'Extrato');
    find('[data-new="income"]').click();
    assert(find('dialog[open] #transaction-date-label').textContent === 'Data do recebimento' && find('dialog[open] [type="submit"]').textContent === 'Registrar entrada', 'Cadastro de entrada deve se referir ao recebimento já ocorrido.');
    const extraFields = find('dialog[open] .statement-extra-fields');
    assert(!extraFields.open && find('dialog[open] #transaction-type').closest('details') === extraFields && find('dialog[open] #transaction-category').closest('details') === extraFields, 'Novo lançamento deve pedir apenas descrição, valor e data antes dos detalhes opcionais.');
    find('dialog[open] .statement-extra-fields>summary').click();
    input('dialog[open] [name="type"]', 'expense');
    assert(find('dialog[open] #transaction-date-label').textContent === 'Data do pagamento' && find('dialog[open] #transaction-amount-label').textContent === 'Valor pago (R$)' && find('dialog[open] [type="submit"]').textContent === 'Registrar saída', 'Trocar o tipo deve atualizar os rótulos e a ação do formulário.');
    input('dialog[open] [name="type"]', 'income');
    input('dialog[open] [name="paymentMethod"]', 'Pix');
    await submitModal({description: 'Entrada de teste', amount: '1000,00', date: dateISO()});
    find('[data-new="expense"]').click();
    await submitModal({description: 'Compra de teste', amount: '100,00', date: dateISO(), category: 'Alimentação'});
    data = await getData(account.id);
    assert(getSummary(data).balance === 90000, 'Saldo realizado após receita e despesa incorreto.');
    await navigate('dashboard', 'Olá');
    assert(find('.stats-grid').textContent.includes('900,00') && !find('.dashboard-page button'), 'Início deve refletir o extrato sem oferecer cadastro direto.');
    pass('Extrato cadastra receitas e despesas; Início somente consulta o saldo atualizado');

    await navigate('transactions', 'Extrato');
    assert(find('#transaction-filter-fields').hidden, 'Filtros avançados devem iniciar recolhidos.');
    assert(!find('[name="period"]').closest('#transaction-filter-fields') && find('[name="period"]').getBoundingClientRect().height === 48 && find('#transaction-date-fields').hidden, 'Período deve estar visível, sem exibir datas personalizadas desnecessárias.');
    assert(find('#transaction-filter-count').hidden, 'O período padrão não deve contar como um filtro avançado ativo.');
    input('#transaction-filters [name="period"]', 'custom');
    assert(!find('#transaction-date-fields').hidden && find('#transaction-filter-fields').hidden, 'Personalizado deve mostrar as datas sem exigir abertura dos filtros de tipo e categoria.');
    input('#transaction-filters [name="period"]', 'last30');
    assert(find('#transaction-date-fields').hidden && find('#transaction-filters [name="from"]').value === recentDateRange(30).from, 'Últimos 30 dias deve preencher as datas e recolher os campos personalizados.');
    input('#transaction-filters [name="period"]', 'month');
    pass('Período fica sempre acessível; datas só aparecem em Personalizado e filtros extras não poluem a tela');
    find('#toggle-transaction-filters').click();
    assert(!find('#transaction-filter-fields').hidden && find('#toggle-transaction-filters').getAttribute('aria-expanded') === 'true', 'Filtros devem abrir com estado acessível.');
    input('#transaction-filters [name="type"]', 'expense');
    assert(documentInApp().querySelectorAll('.statement-entry').length === 1 && find('.statement-summary-result').classList.contains('is-negative'), 'Filtro de despesas deve atualizar a lista e o resultado.');
    input('#transaction-filters [name="category"]', 'Alimentação');
    assert(documentInApp().querySelectorAll('.statement-entry').length === 1, 'Categoria deve combinar com tipo e período.');
    input('#transaction-filters [name="type"]', 'income');
    assert(!find('.statement-entry') && find('#transaction-count').textContent.includes('0') && find('[data-reset-transactions]') && !find('#transaction-results [data-new]'), 'Combinação sem resultados deve oferecer limpar filtros, não induzir a uma despesa duplicada.');
    find('[data-reset-transactions]').click();
    assert(documentInApp().querySelectorAll('.statement-entry').length === 2 && !find('#transaction-filter-count:not([hidden])'), 'Limpar deve restaurar todo o histórico e zerar filtros ativos.');
    input('#transaction-filters [name="to"]', dateISO());
    input('#transaction-filters [name="from"]', '2099-12-31');
    assert(find('#transaction-filter-error:not([hidden])') && documentInApp().querySelectorAll('.statement-entry').length === 2, 'Intervalo inválido deve preservar a lista e explicar o erro.');
    find('[data-new="expense"]').click();
    await submitModal({description: 'Conferência do extrato', amount: '1,00', date: dateISO()});
    const temporaryTransaction = (await getData(account.id)).transactions.find(transaction => transaction.description === 'Conferência do extrato');
    assert(documentInApp().querySelectorAll('.statement-entry').length === 3 && find('#transaction-totals').textContent.includes('101,00'), 'Salvar com intervalo inválido deve atualizar os dados usando o último filtro válido.');
    find(`.statement-entry[data-view="${temporaryTransaction.id}"]`).click();
    await until(() => find('.statement-detail-modal[open]'), 'detalhes da despesa temporária');
    find('.statement-detail-modal [data-delete]').click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão temporária');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => documentInApp().querySelectorAll('.statement-entry').length === 2, 'atualizar lista com filtro inválido');
    assert(getSummary(await getData(account.id)).balance === 90000, 'Criar e excluir uma transação temporária deve restaurar o saldo.');
    find('#clear-filters').click();
    find('#toggle-transaction-filters').click();
    assert(find('#transaction-filter-fields').hidden && !find('#transaction-filter-error:not([hidden])'), 'Fechar filtros não deve manter erros corrigidos.');
    pass('Extrato recolhe filtros, combina tipo e categoria, limpa a busca e valida datas sem perder resultados');

    const range30 = recentDateRange(30);
    const range90 = recentDateRange(90);
    const before30 = recentDateRange(31).from;
    const before90 = recentDateRange(91).from;
    const paginationFixtures = [
      ...Array.from({length: 100}, (_, index) => ({description: `${index < 21 ? 'Paginação lote inicial' : 'Paginação'} ${index + 1}`, amount: 100, date: dateISO()})),
      {description: 'Limite dos 30 dias', amount: 3000, date: range30.from},
      {description: 'Fora dos 30 dias', amount: 5000, date: before30},
      {description: 'Limite dos 90 dias', amount: 7000, date: range90.from},
      {description: 'Fora dos 90 dias', amount: 11000, date: before90},
    ].map(transaction => ({...transaction, id: crypto.randomUUID(), type: 'expense', category: 'Alimentação', paymentMethod: '', notes: ''}));
    await updateData(account.id, workspace => { workspace.transactions.push(...paginationFixtures); });
    await navigate('dashboard', 'Olá');
    assert(JSON.stringify([...find('#dashboard-period').options].map(option => option.textContent)) === JSON.stringify(['Mês atual', '30 dias', '90 dias']), 'Visão geral deve oferecer exatamente Mês atual, 30 dias e 90 dias.');
    const periodWorkspace = await getData(account.id);
    for (const period of ['last30', 'last90', 'month']) {
      const previousChart = find('#cashflow-chart');
      input('#dashboard-period', period);
      await until(() => find('#cashflow-chart') !== previousChart && find('#dashboard-period').value === period, 'aplicar período da visão geral');
      const range = period === 'month' ? {from: `${dateISO().slice(0, 7)}-01`, to: dateISO()} : recentDateRange(period === 'last30' ? 30 : 90);
      const transactions = periodWorkspace.transactions.filter(transaction => transaction.date >= range.from && transaction.date <= range.to);
      const income = transactions.filter(transaction => transaction.type === 'income').reduce((total, transaction) => total + transaction.amount, 0);
      const expense = transactions.filter(transaction => transaction.type === 'expense').reduce((total, transaction) => total + transaction.amount, 0);
      const values = Object.fromEntries([...documentInApp().querySelectorAll('.dashboard-page [data-stat]')].map(element => [element.dataset.stat, element.querySelector('.stat-value').textContent]));
      assert(values.balance === formatMoney(getSummary(periodWorkspace).balance) && values.income === formatMoney(income) && values.expense === formatMoney(expense), 'Período deve filtrar entradas/saídas, mantendo o saldo do Extrato independente das metas.');
      const flow = frame.contentWindow.Chart.getChart(find('#cashflow-chart'));
      assert(flow.data.datasets[0].data.reduce((total, amount) => total + Math.round(amount * 100), 0) === income && flow.data.datasets[1].data.reduce((total, amount) => total + Math.round(amount * 100), 0) === expense, 'Gráfico de fluxo deve somar exatamente os lançamentos do período escolhido.');
      const categories = find('#category-chart') && frame.contentWindow.Chart.getChart(find('#category-chart'));
      assert((categories?.data.datasets[0].data.reduce((total, amount) => total + Math.round(amount * 100), 0) || 0) === expense, 'Gastos por categoria devem respeitar o mesmo período.');
      for (const date of documentInApp().querySelectorAll('.dashboard-transactions .transaction-description small')) {
        const isoDate = date.textContent.split('/').reverse().join('-');
        assert(isoDate >= range.from && isoDate <= range.to, 'Últimas transações não devem misturar registros fora do período.');
      }
      assert(!find('.dashboard-page button'), 'Trocar período não deve reintroduzir ações de cadastro no Início.');
    }
    pass('Visão geral filtra mês atual, 30 e 90 dias nos cards, gráficos e transações, preservando o saldo total');
    await navigate('transactions', 'Extrato');
    find('#toggle-transaction-filters').click();
    input('#transaction-filters [name="type"]', 'expense');
    input('#transaction-filters [name="category"]', 'Alimentação');
    input('#transaction-filters [name="period"]', 'last30');
    assert(find('#transaction-filters [name="from"]').value === range30.from && find('#transaction-filters [name="to"]').value === range30.to, 'Últimos 30 dias deve preencher as datas incluindo hoje.');
    assert(find('#transaction-count').textContent === '102 lançamentos' && find('#transaction-totals').textContent.includes('230,00'), 'Filtro de 30 dias deve incluir o limite e somar todos os resultados, não só a página visível.');
    input('#transaction-filters [name="period"]', 'last90');
    assert(find('#transaction-filters [name="from"]').value === range90.from && find('#transaction-count').textContent === '104 lançamentos', 'Últimos 90 dias deve incluir seu limite e excluir registros anteriores.');
    assert(find('#transaction-filters [name="type"]').value === 'expense' && find('#transaction-filters [name="category"]').value === 'Alimentação', 'Trocar período não deve apagar tipo ou categoria.');
    input('#transaction-filters [name="search"]', 'Fora dos 30 dias');
    assert(find('#transaction-count').textContent === '1 lançamento', 'Pesquisa deve combinar com últimos 90 dias.');
    input('#transaction-filters [name="period"]', 'last30');
    assert(find('#transaction-count').textContent === '0 lançamentos' && find('#transaction-filters [name="search"]').value === 'Fora dos 30 dias', 'Trocar período deve preservar a pesquisa e excluir o dia anterior ao limite.');
    input('#transaction-filters [name="search"]', '');
    input('#transaction-filters [name="period"]', 'custom');
    assert(find('#transaction-filters [name="from"]').value === range30.from && find('#transaction-filters [name="to"]').value === dateISO(), 'Escolher Personalizado deve preservar as datas atuais para edição.');
    input('#transaction-filters [name="from"]', before30);
    input('#transaction-filters [name="to"]', before30);
    assert(find('#transaction-filters [name="period"]').value === 'custom' && find('#transaction-count').textContent === '1 lançamento' && find('.statement-entry').textContent.includes('Fora dos 30 dias'), 'Datas personalizadas devem continuar filtrando com limites inclusivos.');
    pass('Extrato filtra últimos 30 e 90 dias e mantém pesquisa, tipo, categoria e período personalizado');

    find('#clear-filters').click();
    assert(find('#transaction-page-range').textContent === '1–20 de 106' && documentInApp().querySelectorAll('.statement-entry').length === 20 && find('#transaction-page-previous').disabled, 'Extrato deve começar com 20 registros e página anterior desabilitada.');
    const fullTotals = find('#transaction-totals').textContent;
    find('#transaction-page-next').click();
    assert(find('#transaction-page-range').textContent === '21–40 de 106' && find('#transaction-page-label').textContent === 'Página 2 de 6' && find('#transaction-totals').textContent === fullTotals, 'Paginação deve mudar somente a lista, sem alterar os totais filtrados.');
    find('#transaction-page-previous').click();
    assert(find('#transaction-page-range').textContent === '1–20 de 106', 'Página anterior deve restaurar os primeiros resultados.');
    input('#transaction-page-size', '50');
    assert(find('#transaction-page-range').textContent === '1–50 de 106' && documentInApp().querySelectorAll('.statement-entry').length === 50, 'Escolher 50 deve reiniciar na primeira página com 50 registros.');
    find('#transaction-page-next').click();
    find('#transaction-page-next').click();
    assert(find('#transaction-page-range').textContent === '101–106 de 106' && find('#transaction-page-next').disabled && documentInApp().querySelectorAll('.transaction-table tbody tr').length === 6, 'Última página deve mostrar o restante e desabilitar Próxima página.');
    input('#transaction-page-size', '100');
    assert(find('#transaction-page-label').textContent === 'Página 1 de 2' && documentInApp().querySelectorAll('.statement-entry').length === 100, 'Escolher 100 deve atualizar o limite e reiniciar a paginação.');
    find('#transaction-page-next').click();
    input('#transaction-filters [name="search"]', 'Entrada de teste');
    assert(find('#transaction-page-label').textContent === 'Página 1 de 1' && find('#transaction-page-range').textContent === '1–1 de 1' && find('#transaction-page-size').value === '100', 'Pesquisa deve reiniciar a página sem perder o tamanho escolhido.');
    input('#transaction-filters [name="search"]', 'Paginação lote inicial');
    input('#transaction-page-size', '20');
    find('#transaction-page-next').click();
    assert(documentInApp().querySelectorAll('.statement-entry').length === 1, 'Lote de 21 registros deve ter uma última página com um registro.');
    find('.statement-entry').click();
    await until(() => find('.statement-detail-modal[open]'), 'detalhes do último registro da página');
    find('.statement-detail-modal [data-delete]').click();
    await until(() => find('.confirm-modal[open]'), 'excluir último registro da página');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => find('#transaction-page-range').textContent === '1–20 de 20', 'retornar à página anterior após exclusão');
    assert(documentInApp().querySelectorAll('.statement-entry').length === 20 && find('#transaction-page-next').disabled && find('#transaction-filters [name="search"]').value === 'Paginação lote inicial', 'Excluir o último registro deve ajustar a página sem apagar a pesquisa.');
    pass('Extrato pagina 20, 50 ou 100 registros, preserva totais e ajusta a página após filtros e exclusões');
    const paginationIds = new Set(paginationFixtures.map(transaction => transaction.id));
    await updateData(account.id, workspace => { workspace.transactions = workspace.transactions.filter(transaction => !paginationIds.has(transaction.id)); });
    await navigate('dashboard', 'Olá');
    await navigate('transactions', 'Extrato');

    input('#transaction-filters [name="search"]', 'Compra de teste');
    assert(documentInApp().querySelectorAll('.transaction-table tbody tr').length === 1, 'Pesquisa deve filtrar resultados.');
    assert(documentInApp().querySelectorAll('.statement-entry').length === 1, 'Lista mobile deve usar os mesmos filtros da tabela.');
    find('.statement-entry').click();
    await until(() => find('.statement-detail-modal[open]'), 'detalhes da movimentação');
    assert(find('.statement-detail-modal').textContent.includes('100,00') && find('.statement-detail-list').textContent.includes('Alimentação'), 'Detalhes devem mostrar valor e categoria.');
    find('.statement-detail-modal [data-edit]').click();
    await until(() => find('dialog[open] [name="amount"]'), 'editar a partir dos detalhes');
    assert(find('dialog[open] [name="amount"]').value === '100,00', 'Editar deve preservar o valor salvo com a máscara.');
    await submitModal({amount: '120,00', description: 'Compra editada'});
    data = await getData(account.id);
    assert(data.transactions.some(transaction => transaction.description === 'Compra editada' && transaction.amount === 12000), 'Edição não persistiu.');
    assert(find('#transaction-filters [name="search"]').value === 'Compra de teste', 'Editar pelo extrato deve preservar os filtros.');
    pass('Lista mobile abre detalhes e permite editar valores em centavos sem perder a pesquisa');

    await navigate('bills', 'Contas fixas');
    const beforeTabs = await getData(account.id);
    assert(!find('.recurring-help').open && find('.month-selector').textContent.includes('Mês de referência'), 'Contas fixas deve deixar claro o mês de referência e manter a ajuda recolhida.');
    find('.recurring-help>summary').click();
    assert(find('.recurring-help').textContent.includes('Cadastrar não movimenta dinheiro') && find('.recurring-help').textContent.includes('automaticamente'), 'Ajuda deve distinguir salvar previsão de confirmar e criar o lançamento no Extrato.');
    find('.recurring-help>summary').click();
    assert(documentInApp().querySelectorAll('#recurring-panel-bill [data-new-recurring="bill"]').length === 1 && documentInApp().querySelectorAll('#recurring-panel-income [data-new-recurring="income"]').length === 1, 'Deve existir somente uma ação principal de cadastro por aba.');
    const pendingGroups = [...documentInApp().querySelectorAll('#recurring-panel-bill [data-recurring-status="pending"] [data-recurring-type]')];
    assert(JSON.stringify(pendingGroups.map(group => group.dataset.recurringType)) === JSON.stringify(['essential', 'subscription']), 'Despesas essenciais e assinaturas devem ter boxes separados dentro do status.');
    for (const bill of beforeTabs.bills) {
      const billRow = find(`[data-recurring-row="${bill.id}"]`);
      assert(billRow.closest('[data-recurring-type]')?.dataset.recurringType === bill.group, 'Cada despesa deve ficar dentro do box do seu tipo.');
    }
    pass('Contas fixas mostra uma ação por aba e explica previsão, confirmação e mês de referência sem avisos permanentes');
    selectRecurringView('bill');
    assert(find('#recurring-summary').textContent.includes('300,00') && find('#recurring-summary').textContent.includes('Falta pagar'), 'Despesas devem manter seu resumo de pagamentos.');
    selectRecurringView('income');
    assert(find('#recurring-summary').textContent.includes('5.300,00') && find('#recurring-summary').textContent.includes('Falta receber'), 'Receitas devem mostrar apenas seus valores previstos e recebidos.');
    const incomeTab = find('[data-recurring-view="income"]');
    incomeTab.focus();
    incomeTab.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}));
    assert(find('[data-recurring-view="bill"]').getAttribute('aria-selected') === 'true' && documentInApp().activeElement === find('[data-recurring-view="bill"]'), 'Setas devem trocar as abas e mover o foco.');
    find('[data-recurring-view="bill"]').dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key: 'End', bubbles: true}));
    assert(find('[data-recurring-view="income"]').getAttribute('aria-selected') === 'true', 'End deve selecionar Receitas.');
    find('[data-recurring-view="income"]').dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
    assert(find('[data-recurring-view="bill"]').getAttribute('aria-selected') === 'true', 'Home deve selecionar Despesas.');
    selectRecurringView('income');
    const currentReference = find('#bills-month').value;
    input('#bills-month', shiftMonth(currentReference, -1));
    await until(() => find('#bills-month').value === shiftMonth(currentReference, -1) && find('#recurring-summary').textContent.includes('0,00'), 'receitas do mês anterior');
    assert(find('[data-recurring-view="income"]').getAttribute('aria-selected') === 'true', 'Alterar o mês deve preservar a aba Receitas.');
    input('#bills-month', currentReference);
    await until(() => find('#recurring-summary').textContent.includes('5.300,00'), 'retornar ao mês atual');
    find('[data-new-recurring="income"]').click();
    assert(find('dialog[open] [type="submit"]').textContent === 'Salvar previsão' && find('dialog[open] .form-note').textContent.includes('somente a previsão'), 'Criar renda deve mostrar explicitamente que é uma previsão.');
    await submitModal({name: 'Renda temporária da aba', amount: '50,00'});
    const temporaryIncome = (await getData(account.id)).incomeSources.find(item => item.name === 'Renda temporária da aba');
    assert(find('[data-recurring-view="income"]').getAttribute('aria-selected') === 'true' && find('#recurring-summary').textContent.includes('5.350,00'), 'Criar renda deve preservar a aba e atualizar somente a previsão.');
    await recurringAction(`[data-edit-recurring="${temporaryIncome.id}"]`);
    await submitModal({amount: '60,00'});
    assert(find('#recurring-summary').textContent.includes('5.360,00'), 'Editar renda deve atualizar o resumo de Receitas.');
    await recurringAction(`[data-toggle="${temporaryIncome.id}"]`);
    await until(() => find('#recurring-summary').textContent.includes('5.300,00'), 'pausar renda');
    await recurringAction(`[data-toggle="${temporaryIncome.id}"]`);
    await until(() => find('#recurring-summary').textContent.includes('5.360,00'), 'reativar renda');
    await recurringAction(`[data-delete-recurring="${temporaryIncome.id}"]`);
    await until(() => find('.confirm-modal[open]'), 'excluir renda temporária');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => !find(`[data-recurring-row="${temporaryIncome.id}"]`), 'renda temporária removida');
    assert(JSON.stringify((await getData(account.id)).transactions) === JSON.stringify(beforeTabs.transactions), 'Navegação e edição de previsões não devem criar ou alterar transações.');
    selectRecurringView('bill');
    pass('Contas fixas separa despesas e receitas, preserva aba e mês e permite gerenciar rendas com teclado');
    find('[data-confirm][data-kind="bill"]').click();
    assert(find('dialog[open] .payment-reference').textContent.includes('Mês de referência') && find('dialog[open] .form-note').textContent.includes('automaticamente') && find('dialog[open] #recurring-effective-date-help').textContent.includes('desta data') && find('dialog[open] [name="amount"]'), 'Confirmação deve distinguir valor real, referência, data efetiva e registro automático no Extrato.');
    await submitModal({date: dateISO()});
    data = await getData(account.id);
    assert(data.transactions.filter(transaction => transaction.recurringKind === 'bill').length === 1, 'Pagamento precisa gerar uma transação.');
    const paidBillId = data.transactions.find(transaction => transaction.recurringKind === 'bill').recurringId;
    assert(find(`[data-undo="${paidBillId}"]`) && !find(`[data-confirm="${paidBillId}"]`), 'Ocorrência paga deve oferecer desfazer em vez de novo pagamento.');
    selectRecurringView('income');
    find(`[data-confirm="${data.incomeSources[0].id}"][data-kind="income"]`).click();
    await submitModal({date: dateISO()});
    data = await getData(account.id);
    assert(getSummary(data).balance === 563000, 'Confirmação de renda e despesa deve atualizar saldo.');
    assert(find('[data-recurring-view="income"]').getAttribute('aria-selected') === 'true' && find('#recurring-summary').textContent.includes('Já recebido') && find('#recurring-summary').textContent.includes('5.000,00'), 'Confirmar renda deve atualizar seu resumo e manter a aba selecionada.');
    selectRecurringView('bill');
    pass('Contas e rendas são confirmadas por mês sem pagamento duplicado');

    revealRecurringRow(`[data-undo="${paidBillId}"]`);
    assert(find(`[data-undo="${paidBillId}"]`).textContent.includes('Pago') && find(`[data-undo="${paidBillId}"]`).getBoundingClientRect().height > 0, 'Pago deve ser um botão visível ao abrir os concluídos.');
    find(`[data-undo="${paidBillId}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'confirmar desfazer pagamento');
    find('.confirm-modal[open] [value="cancel"]').click();
    await until(() => !find('.confirm-modal[open]'), 'cancelar desfazer');
    assert((await getData(account.id)).transactions.length === 4, 'Cancelar deve preservar o pagamento.');
    find(`[data-undo="${paidBillId}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'desfazer pagamento');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => find(`[data-confirm="${paidBillId}"]`), 'conta pendente novamente');
    data = await getData(account.id);
    assert(getSummary(data).balance === 588000 && !data.transactions.some(transaction => transaction.recurringId === paidBillId), 'Desfazer deve remover somente o pagamento e recompor o saldo.');
    assert(find(`[data-confirm="${paidBillId}"]`).textContent.includes('Marcar como pago'), 'Conta deve voltar a oferecer Marcar como pago.');
    find(`[data-confirm="${paidBillId}"]`).click();
    await submitModal({date: dateISO()});
    assert((await getData(account.id)).transactions.filter(transaction => transaction.recurringId === paidBillId).length === 1, 'Pagar novamente não pode duplicar.');
    const incomeId = data.incomeSources[0].id;
    selectRecurringView('income');
    revealRecurringRow(`[data-undo="${incomeId}"]`);
    find(`[data-undo="${incomeId}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'desfazer recebimento');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => find(`[data-confirm="${incomeId}"]`), 'receita prevista novamente');
    assert(getSummary(await getData(account.id)).balance === 63000, 'Desfazer recebimento deve reduzir saldo.');
    find(`[data-confirm="${incomeId}"]`).click();
    await submitModal({date: dateISO()});
    assert(getSummary(await getData(account.id)).balance === 563000, 'Confirmar novamente deve restaurar o saldo.');
    pass('Desfazer exige confirmação, restaura pendências e permite pagar ou receber novamente');
    selectRecurringView('bill');

    const paidRow = revealRecurringRow(`[data-recurring-row="${paidBillId}"]`);
    assert(paidRow.querySelector('.recurring-payment-date').textContent.includes(dateISO().split('-').reverse().join('/')), 'Conta paga deve mostrar a data efetiva.');
    const historyButton = paidRow.querySelector('[data-history]');
    const menu = paidRow.querySelector('.recurring-menu');
    const trigger = menu.querySelector('summary');
    trigger.click();
    await until(() => menu.open, 'abrir Opções');
    historyButton.focus();
    assert(documentInApp().activeElement === historyButton, 'Histórico deve ser acessível por teclado.');
    historyButton.dispatchEvent(new frame.contentWindow.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert(!menu.open && documentInApp().activeElement === trigger, 'Escape deve fechar Opções e devolver o foco.');
    await recurringAction(`[data-history="${paidBillId}"]`);
    await until(() => find('dialog[open] .history-list'), 'histórico da conta');
    find('dialog[open] [data-close]').click();
    await recurringAction(`[data-edit-recurring="${paidBillId}"]`);
    await submitModal({amount: '260,00'});
    assert(find(`[data-recurring-row="${paidBillId}"] .recurring-amount`).textContent.includes('250,00'), 'Alterar previsão não pode mudar o valor pago exibido.');
    await recurringAction(`[data-edit-recurring="${paidBillId}"]`);
    await submitModal({amount: '250,00'});
    find('[data-new-recurring="bill"][data-group="essential"]').click();
    input('dialog[open] [name="group"]', 'subscription');
    assert(find('dialog[open] [name="category"]').value === 'Assinaturas', 'Cadastro único deve sugerir a categoria de assinatura ao trocar o grupo.');
    input('dialog[open] [name="group"]', 'essential');
    assert(find('dialog[open] [name="category"]').value === 'Contas Fixas', 'Voltar para essenciais deve ajustar a sugestão padrão.');
    input('dialog[open] [name="category"]', 'Saúde');
    input('dialog[open] [name="group"]', 'subscription');
    assert(find('dialog[open] [name="category"]').value === 'Saúde', 'Mudar grupo não pode sobrescrever uma categoria escolhida pelo usuário.');
    input('dialog[open] [name="group"]', 'essential');
    await submitModal({name: 'Conta temporária', amount: '40,00', day: '1'});
    const temporaryBill = (await getData(account.id)).bills.find(item => item.name === 'Conta temporária');
    const pendingRow = documentInApp().querySelector('.recurring-section .recurring-row');
    assert(pendingRow.querySelector('[data-confirm]'), 'Contas pendentes devem aparecer antes das pagas.');
    await recurringAction(`[data-toggle="${temporaryBill.id}"]`);
    await until(() => find(`[data-recurring-row="${temporaryBill.id}"].is-inactive`), 'pausar conta');
    assert(!find(`[data-confirm="${temporaryBill.id}"]`), 'Conta pausada não deve oferecer pagamento.');
    await recurringAction(`[data-toggle="${temporaryBill.id}"]`);
    await until(() => find(`[data-confirm="${temporaryBill.id}"]`), 'reativar conta');
    await recurringAction(`[data-delete-recurring="${temporaryBill.id}"]`);
    await until(() => find('.confirm-modal[open]'), 'excluir conta');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => !find(`[data-recurring-row="${temporaryBill.id}"]`), 'conta excluída');
    pass('Opções reúne as ações da conta, funciona com teclado e preserva valores pagos e pendências');

    await navigate('transactions', 'Extrato');
    const recurringTransaction = (await getData(account.id)).transactions.find(transaction => transaction.recurringKind === 'bill');
    find(`.statement-entry[data-view="${recurringTransaction.id}"]`).click();
    await until(() => find('.statement-detail-modal[open]'), 'detalhes de pagamento recorrente');
    assert((find('.statement-detail-modal .modal-body').textContent.match(/Referência/g) || []).length === 1, 'Referência recorrente deve aparecer uma única vez nos detalhes.');
    assert(!find('.statement-mobile').textContent.includes('Referência:'), 'Lista não deve repetir notas automáticas de recorrência.');
    const recurringMeta = find(`.statement-entry[data-view="${recurringTransaction.id}"] .statement-entry-meta`);
    const recurringMarker = recurringMeta.querySelector('.statement-recurring');
    assert(recurringMeta.textContent.trim() === recurringTransaction.category && recurringMarker.getAttribute('aria-label').includes('Contas fixas') && !recurringMarker.textContent.trim(), 'Lista deve mostrar a categoria uma única vez e indicar a origem pelo ícone, sem repetir Contas fixas.');
    assert(find('.statement-origin-note').textContent.includes('Não precisa lançar novamente'), 'Detalhes devem preservar a explicação da origem automática.');
    find('.statement-detail-modal [data-open-bills]').click();
    await until(() => find('main h1')?.textContent.includes('Contas fixas') && !find('dialog[open]'), 'ir do lançamento automático para Contas fixas');
    assert((await getData(account.id)).transactions.length === 4, 'Consultar a origem não deve duplicar o lançamento confirmado.');
    pass('Extrato identifica a origem Contas fixas e permite consultá-la sem duplicar o registro nem prender o modal');

    await navigate('goals', 'Minhas metas');
    const transactionsBeforeGoals = JSON.stringify((await getData(account.id)).transactions);
    assert(!find('main').textContent.includes('Saldo total') && !find('main').textContent.includes('Saldo livre'), 'Metas não devem misturar saldo geral com dinheiro guardado.');
    assert(documentInApp().querySelectorAll('[data-goals-saved]').length === 1 && find('[data-goals-saved]').textContent === formatMoney(0), 'Resumo de metas deve mostrar somente o total guardado.');
    const goalHelp = find('.goal-savings-help');
    goalHelp.querySelector('summary').click();
    assert(goalHelp.open && goalHelp.textContent.includes('não movimentam dinheiro no banco') && goalHelp.textContent.includes('sem alterar o saldo do Extrato') && goalHelp.textContent.includes('sem gerar receita'), 'Ajuda deve explicar que metas são independentes do saldo, sem prometer movimentações bancárias.');
    find('.goal-savings-help [href="#dashboard"]').click();
    await until(() => find('#dashboard-period'), 'consultar saldo no Início');
    assert(!find('.allocation-note') && !find('main').textContent.includes('Saldo após reservas'), 'Início não deve voltar a duplicar o saldo com um terceiro valor.');
    await navigate('goals', 'Minhas metas');
    assert(find('[data-contribute]').textContent.includes('Guardar'), 'Ação principal da meta deve usar o verbo Guardar.');
    find('[data-contribute]').click();
    assert(find('dialog[open]').textContent.includes('Guardar na meta') && find('dialog[open] .form-note').textContent.includes('nenhum dinheiro é movimentado no banco'), 'Modal deve explicar que Guardar apenas registra dinheiro já separado.');
    await submitModal({amount: '200,00', date: dateISO()});
    assert(find('[data-goals-saved]').textContent === formatMoney(20000), 'Guardar deve atualizar o único total da página.');
    assert(getSummary(await getData(account.id)).balance === 563000, 'Guardar não deve reduzir o saldo do Extrato.');
    await navigate('dashboard', 'Olá');
    assert(find('[data-stat="balance"] .stat-value').textContent === formatMoney(563000), 'Início deve mostrar apenas o saldo do Extrato, sem descontar as metas.');
    assert(find('[data-stat="goals"] .stat-value').textContent === formatMoney(20000), 'Dinheiro nas metas deve aparecer separado do saldo para usar.');
    await navigate('goals', 'Minhas metas');
    find('[data-withdraw]').click();
    await submitModal({amount: '50,00', date: dateISO()});
    data = await getData(account.id);
    assert(goalSaved(data.goals[0]) === 15000 && getSummary(data).balance === 563000, 'Reserva não deve mudar saldo financeiro.');
    assert(getSummary(data).reserved === 15000, 'Retirar deve diminuir apenas o total guardado nas metas.');
    pass('Guardar e Retirar alteram somente as metas, sem gerar receitas ou despesas nem mudar o saldo');
    assert(find('[data-goals-saved]').textContent === formatMoney(15000) && JSON.stringify(data.transactions) === transactionsBeforeGoals, 'Guardar e Retirar não devem criar receita nem despesa no Extrato.');
    find('[data-withdraw]').click();
    await until(() => find('dialog[open] [name="amount"]'), 'retirada acima do guardado');
    input('dialog[open] [name="amount"]', '151,00');
    find('dialog[open] form').requestSubmit();
    await until(() => find('dialog[open] .form-error:not([hidden])'), 'limite da retirada');
    assert(find('dialog[open] .form-error').textContent.includes('150,00') && goalSaved((await getData(account.id)).goals[0]) === 15000, 'Retirada inválida deve informar quanto pode ser retirado e preservar a meta.');
    find('dialog[open] [data-close]').click();
    find('[data-edit-goal]').click();
    await until(() => find('dialog[open] [name="initialAmount"]'), 'editar valor inicial da meta');
    assert(find('dialog[open] [name="initialAmount"]').value === '0,00' && find('dialog[open]').textContent.includes('Valor inicial'), 'Edição deve distinguir o valor inicial das quantias já registradas no histórico.');
    find('dialog[open] [data-close]').click();
    pass('Retiradas acima do guardado são bloqueadas e a edição distingue o valor inicial do histórico');

    find('[data-contribute]').click();
    await submitModal({amount: '5480,01', date: dateISO()});
    data = await getData(account.id);
    assert(goalSaved(data.goals[0]) === 563001 && getSummary(data).balance === 563000 && JSON.stringify(data.transactions) === transactionsBeforeGoals, 'Metas devem aceitar registros próprios sem depender do saldo do Extrato.');
    assert(!find('.goal-balance-note'), 'Não deve haver aviso de cobertura entre controles independentes.');
    await navigate('dashboard', 'Olá');
    assert(find('[data-stat="balance"] .stat-value').textContent === formatMoney(563000) && find('[data-stat="goals"] .stat-value').textContent === formatMoney(563001), 'O total das metas não deve tornar negativo o saldo do Extrato.');
    await navigate('goals', 'Minhas metas');
    find('[data-withdraw]').click();
    await submitModal({amount: '5480,01', date: dateISO()});
    find('[data-new-goal]').click();
    await submitModal({title: 'Reserva separada de teste', target: '10000,00', initialAmount: '6000,00'});
    const separatedGoal = (await getData(account.id)).goals.find(goal => goal.title === 'Reserva separada de teste');
    assert(separatedGoal.initialAmount === 600000 && getSummary(await getData(account.id)).balance === 563000, 'O valor inicial deve ser independente do saldo do Extrato.');
    find(`[data-edit-goal="${separatedGoal.id}"]`).click();
    await submitModal({initialAmount: '7000,00'});
    assert(getSummary(await getData(account.id)).balance === 563000, 'Editar o valor inicial não deve alterar o saldo do Extrato.');
    find(`[data-delete-goal="${separatedGoal.id}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão da meta independente');
    assert(find('.confirm-modal[open]').textContent.includes('7.000,00') && find('.confirm-modal[open]').textContent.includes('não serão alterados'), 'Excluir deve informar que o saldo e as transações não mudam.');
    find('.confirm-modal[open] [value="cancel"]').click();
    await until(() => !find('.confirm-modal[open]'), 'cancelar exclusão da reserva');
    assert((await getData(account.id)).goals.find(goal => goal.id === separatedGoal.id)?.initialAmount === 700000 && getSummary(await getData(account.id)).balance === 563000, 'Cancelar a exclusão deve preservar a meta e o saldo do Extrato.');
    find(`[data-delete-goal="${separatedGoal.id}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'excluir reserva com confirmação');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => !find(`[data-goal-card="${separatedGoal.id}"]`), 'reserva excluída');
    assert(getSummary(await getData(account.id)).balance === 563000 && JSON.stringify((await getData(account.id)).transactions) === transactionsBeforeGoals, 'Excluir uma meta não deve alterar o saldo nem criar uma receita.');
    pass('Metas têm valores próprios: criação, edição e exclusão confirmada não afetam o Extrato');

    find('[data-new-goal]').click();
    await submitModal({title: 'Meta temporária', target: '100,00'});
    const temporaryGoal = (await getData(account.id)).goals.find(goal => goal.title === 'Meta temporária');
    find(`[data-edit-goal="${temporaryGoal.id}"]`).click();
    await submitModal({title: 'Meta renomeada', target: '120,00'});
    find(`[data-contribute="${temporaryGoal.id}"]`).click();
    await submitModal({amount: '120,00', date: dateISO()});
    assert(find(`[data-goal-card="${temporaryGoal.id}"].is-complete`) && find(`[data-goal-card="${temporaryGoal.id}"] [role="progressbar"]`).getAttribute('aria-valuenow') === '100', 'Meta deve indicar conclusão ao atingir o objetivo.');
    find(`[data-goal-history="${temporaryGoal.id}"]`).click();
    await until(() => find('dialog[open] .history-list'), 'histórico da meta');
    assert(find('dialog[open] .history-list').textContent.includes('120,00'), 'Histórico deve exibir a contribuição.');
    find('dialog[open] [data-close]').click();
    find(`[data-withdraw="${temporaryGoal.id}"]`).click();
    await submitModal({amount: '20,00', date: dateISO()});
    assert(!find(`[data-goal-card="${temporaryGoal.id}"].is-complete`), 'Retirada deve atualizar o estado da meta.');
    find(`[data-delete-goal="${temporaryGoal.id}"]`).click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão da meta');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => !find(`[data-goal-card="${temporaryGoal.id}"]`), 'excluir meta');
    assert(getSummary(await getData(account.id)).balance === 563000 && (await getData(account.id)).goals.length === 1, 'Operações com metas não devem alterar o saldo financeiro.');
    pass('Novo layout de metas permite criar, editar, concluir, consultar histórico, retirar e excluir');

    const workspaceBeforeGoalRegression = await getData(account.id);
    const regressionTransactions = [
      {id: crypto.randomUUID(), type: 'income', description: 'Entrada registrada', amount: 450000, date: dateISO(), category: 'Outros', paymentMethod: '', notes: ''},
      {id: crypto.randomUUID(), type: 'expense', description: 'Saída registrada', amount: 522000, date: dateISO(), category: 'Outros', paymentMethod: '', notes: ''},
    ];
    await updateData(account.id, workspace => {
      workspace.transactions = regressionTransactions;
      workspace.goals = [{id: crypto.randomUUID(), title: 'Reserva independente', target: 600000, initialAmount: 497000, targetDate: '', contributions: []}];
    });
    await navigate('dashboard', 'Olá');
    assert(find('[data-stat="balance"] .stat-value').textContent === formatMoney(-72000) && find('[data-stat="goals"] .stat-value').textContent === formatMoney(497000), 'R$ 4.970 nas metas não podem reduzir o saldo de menos R$ 720 para menos R$ 5.690.');
    assert(find('[data-stat="income"] .stat-value').textContent === formatMoney(450000) && find('[data-stat="expense"] .stat-value').textContent === formatMoney(522000), 'Entradas e saídas devem conter apenas as transações do Extrato.');
    await navigate('goals', 'Minhas metas');
    find('[data-new-goal]').click();
    await submitModal({title: 'Meta com Extrato negativo', target: '1000,00', initialAmount: '50,00'});
    const independentGoal = (await getData(account.id)).goals.find(goal => goal.title === 'Meta com Extrato negativo');
    find(`[data-contribute="${independentGoal.id}"]`).click();
    await submitModal({amount: '10,00', date: dateISO()});
    find(`[data-withdraw="${independentGoal.id}"]`).click();
    await submitModal({amount: '5,00', date: dateISO()});
    data = await getData(account.id);
    assert(goalSaved(data.goals.find(goal => goal.id === independentGoal.id)) === 5500 && getSummary(data).balance === -72000 && JSON.stringify(data.transactions) === JSON.stringify(regressionTransactions), 'Criar, Guardar e Retirar devem funcionar com saldo negativo sem alterar as transações.');
    await updateData(account.id, () => workspaceBeforeGoalRegression);
    pass('Regressão: R$ 4.500 menos R$ 5.220 são menos R$ 720; metas permanecem independentes mesmo com saldo negativo');

    await navigate('reports', 'Relatórios');
    assert(!find('#report-error:not([hidden])'), 'Relatório não pode exibir erro.');
    assert(documentInApp().querySelectorAll('#report-content canvas').length === 3, 'Relatórios devem ter três gráficos.');
    const reportForm = find('#report-filters');
    assert(find('.report-stat-result').textContent.includes('5.630,00'), 'Resultado deve destacar apenas o saldo realizado no período.');
    assert(find('#report-period').textContent.includes('4 lançamentos'), 'Filtro deve identificar os registros do período aplicado.');
    find('[name="mode"][value="year"]').click();
    find('#report-filters').requestSubmit();
    assert(!find('#report-error:not([hidden])'), 'Filtro anual deve funcionar.');
    assert(!reportForm.elements.year.disabled && reportForm.elements.month.disabled, 'Apenas campos do modo selecionado devem participar da validação.');
    input('#report-filters [name="year"]', '1800');
    assert(find('#report-error:not([hidden])'), 'Filtro automático deve explicar anos inválidos sem apagar os resultados.');
    input('#report-filters [name="year"]', String(new Date().getFullYear()));
    assert(!find('#report-error:not([hidden])'), 'Corrigir o ano deve reaplicar o relatório sem botão adicional.');
    find('[name="mode"][value="custom"]').click();
    find('#report-custom-range').click();
    await submitModal({from: dateISO(), to: dateISO()});
    assert(!find('#report-error:not([hidden])') && find('.report-stat-result').textContent.includes('5.630,00'), 'Intervalo de um dia deve incluir receitas e pagamentos desse dia.');
    assert(find('.report-category-list').textContent.includes('120,00') && find('.report-category-list').textContent.includes('250,00') && find('.report-breakdown').textContent.includes('250,00'), 'Categorias devem ser detalhadas individualmente e a recorrência deve considerar só contas confirmadas.');
    const appliedPeriod = find('#report-period').textContent;
    find('#report-custom-range').click();
    await until(() => find('dialog[open] form'), 'seletor de período');
    input('dialog[open] [name="from"]', '2099-12-31');
    find('dialog[open] form').requestSubmit();
    await until(() => find('dialog[open] .form-error:not([hidden])'), 'erro de intervalo inválido');
    assert(find('#report-period').textContent === appliedPeriod, 'Intervalo inválido não deve substituir o relatório válido.');
    find('dialog[open] [data-close]').click();
    assert(reportForm.elements.from.value === dateISO(), 'Cancelar deve preservar o intervalo aplicado.');
    find('#report-custom-range').click();
    await submitModal({from: '1900-01-01', to: '1900-01-02'});
    assert(!find('#report-error:not([hidden])') && !find('#report-content canvas') && find('.report-stat-result').textContent.includes('0,00'), 'Período vazio não deve inventar dados nem renderizar gráficos enganosos.');
    find('[name="mode"][value="month"]').click();
    assert(documentInApp().querySelectorAll('#report-content canvas').length === 3, 'Retornar ao modo mensal deve restaurar os três gráficos.');
    const originalCreateURL = frame.contentWindow.URL.createObjectURL;
    const originalAnchorClick = frame.contentWindow.HTMLAnchorElement.prototype.click;
    let csvBlob;
    let csvFilename;
    try {
      frame.contentWindow.URL.createObjectURL = blob => { csvBlob = blob; return originalCreateURL.call(frame.contentWindow.URL, blob); };
      frame.contentWindow.HTMLAnchorElement.prototype.click = function () { csvFilename = this.download; };
      find('#export-csv').click();
      const csv = await csvBlob.text();
      const reportMonth = reportForm.elements.month.value;
      const lastDay = dateISO(new Date(Number(reportMonth.slice(0, 4)), Number(reportMonth.slice(5, 7)), 0, 12));
      assert(csvFilename === `wallet-transacoes-${reportMonth}-01-${lastDay}.csv`, 'CSV deve identificar o intervalo efetivamente aplicado.');
      assert(csv.split('\r\n').length === 5 && csv.includes('"120,00"') && csv.includes('"250,00"'), 'CSV deve exportar somente os quatro registros filtrados, em reais.');
    } finally {
      frame.contentWindow.URL.createObjectURL = originalCreateURL;
      frame.contentWindow.HTMLAnchorElement.prototype.click = originalAnchorClick;
    }
    pass('Relatórios validam filtros mensais, anuais, personalizados, períodos vazios e CSV filtrado');

    await navigate('education', 'Aprenda');
    const players = documentInApp().querySelectorAll('iframe');
    assert(educationChannels.length === 6 && players.length === educationChannels.length && [...players].every(player => player.src.includes('youtube.com/embed/') && player.loading === 'lazy'), 'Seis players oficiais lazy esperados.');
    assert(!find('.education-hero') && documentInApp().querySelectorAll('.education-page .page-header h1').length === 1 && documentInApp().querySelectorAll('.education-page .page-header p').length === 1, 'Abertura deve ter só um título e um texto, sem a segunda introdução.');
    assert([...players].some(player => player.src.endsWith('/9QIfN6awHSo')) && find('.education-page').textContent.includes('Dinheiro Com Você'), 'O sexto canal pesquisado e seu vídeo devem aparecer.');
    assert(!find('[data-subject], .education-count, .education-curation-note') && !find('.education-page').textContent.includes('Encontre sua próxima descoberta'), 'Títulos, contadores, filtros e aviso editorial removidos não devem reaparecer.');
    const avatars = [...documentInApp().querySelectorAll('.channel-avatar img')];
    avatars.forEach(avatar => { avatar.loading = 'eager'; });
    await Promise.all(avatars.map(avatar => avatar.decode()));
    assert(avatars.length === educationChannels.length && avatars.every(avatar => avatar.naturalWidth > 0 && avatar.src.includes('/assets/channels/')), 'Fotos reais dos seis canais devem carregar de arquivos locais.');
    assert(documentInApp().querySelectorAll('.youtube-channel-badge svg').length === educationChannels.length, 'Cada foto deve incluir a identificação do YouTube.');
    pass('Educação mostra seis canais com fotos e players, em uma abertura única de título e texto');

    await navigate('settings', 'Configurações');
    input('#profile-form [name="name"]', 'Nome atualizado');
    input('#profile-form [name="theme"]', 'light');
    find('#profile-form').requestSubmit();
    await until(async () => (await getSession()).name === 'Nome atualizado', 'perfil atualizado');
    assert(documentInApp().documentElement.dataset.theme === 'light', 'Tema claro deve ser aplicado.');
    pass('Nome e tema são persistidos nas configurações');

    find('[data-new-category]').click();
    await submitModal({name: 'Categoria temporária', type: 'expense'});
    find('[data-edit-category]').click();
    await submitModal({name: 'Categoria renomeada'});
    assert((await getData(account.id)).categories[0].name === 'Categoria renomeada', 'Categoria deve ser renomeada.');
    find('[data-delete-category]').click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão de categoria');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(async () => (await getData(account.id)).categories.length === 0, 'excluir categoria');
    pass('Categorias personalizadas permitem criar, renomear e excluir com confirmação');

    await pause(60);
    const backup = exportBackup(await getSession(), await getData(account.id));
    const transfer = new frame.contentWindow.DataTransfer();
    transfer.items.add(new frame.contentWindow.File([backup], 'wallet-backup-teste.json', {type: 'application/json'}));
    find('#backup-file').files = transfer.files;
    find('#backup-file').dispatchEvent(new frame.contentWindow.Event('change', {bubbles: true}));
    await until(() => find('.confirm-modal[open]'), 'confirmar restauração de backup');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(() => [...documentInApp().querySelectorAll('.toast')].some(item => item.textContent.includes('Backup importado')), 'importação concluída');
    assert((await getData(account.id)).transactions.length === 4, 'Backup deve preservar todas as transações.');
    pass('Importação JSON validada restaura dados após confirmação pelo modal');

    await navigate('transactions', 'Extrato');
    input('#transaction-filters [name="search"]', 'Compra editada');
    find('.statement-entry').click();
    await until(() => find('.statement-detail-modal[open]'), 'abrir para excluir');
    find('.statement-detail-modal [data-delete]').click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão da transação');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(async () => (await getData(account.id)).transactions.length === 3, 'excluir transação');
    assert(getSummary(await getData(account.id)).balance === 575000, 'Excluir despesa deve recompor saldo.');
    assert(!find('.statement-detail-modal[open]'), 'Excluir deve fechar os detalhes da movimentação removida.');
    pass('Excluir transação exige confirmação e recalcula o saldo');

    await until(() => !find('.toast'), 'notificações encerradas antes de conferir o layout');
    frame.style.maxWidth = 'none';
    const removedMessages = {
      goals: ['Dê um destino ao seu dinheiro e acompanhe cada conquista.', 'Os valores reservados já fazem parte do saldo total.'],
      transactions: ['Seu extrato, organizado para o dia a dia.'],
      bills: ['Acompanhe suas despesas e receitas previstas.', 'Só pagamentos e recebimentos confirmados alteram o saldo.'],
      reports: ['Seu dinheiro, visto com mais clareza.'],
    };
    for (const width of [320, 390, 768, 1024, 1440, 1920]) {
      frame.style.width = `${width}px`;
      frame.width = String(width);
      for (const [route, heading] of [['dashboard', 'Olá'], ['transactions', 'Extrato'], ['bills', 'Contas fixas'], ['goals', 'Minhas metas'], ['education', 'Aprenda'], ['reports', 'Relatórios'], ['settings', 'Configurações']]) {
        await navigate(route, heading);
        for (const text of removedMessages[route] || []) assert(!find('main').textContent.includes(text), `Texto removido não deve reaparecer em ${route}.`);
        const root = documentInApp().documentElement;
        const overflow = root.scrollWidth > root.clientWidth + 1 ? [...documentInApp().querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > root.clientWidth + 1).slice(0, 6).map(element => `${element.tagName}.${element.className}:${Math.round(element.getBoundingClientRect().right)}`).join(', ') : '';
        assert(root.scrollWidth <= root.clientWidth + 1, `Rolagem horizontal indevida em ${route} a ${width}px: ${root.scrollWidth}/${root.clientWidth} ${overflow}`);
        if (width < 760) {
          assert(frame.contentWindow.getComputedStyle(find('.mobile-nav')).display !== 'none', `Navegação móvel ausente em ${route}`);
          for (const label of documentInApp().querySelectorAll('.mobile-nav span')) assert(label.getBoundingClientRect().width <= label.parentElement.getBoundingClientRect().width + 1, `Rótulo ${label.textContent} não pode se sobrepor à navegação vizinha.`);
          const topbar = find('.topbar');
          assert(frame.contentWindow.getComputedStyle(topbar).position === 'sticky', 'Cabeçalho mobile deve acompanhar a rolagem.');
          assert(find('#main-content').getBoundingClientRect().top >= topbar.getBoundingClientRect().bottom, 'Cabeçalho não deve cobrir o início da página.');
          frame.contentWindow.scrollTo(0, 500);
          await pause(20);
          assert(Math.abs(topbar.getBoundingClientRect().top) < 1, `Cabeçalho deve permanecer no topo em ${route} a ${width}px.`);
          for (const selector of ['.mobile-brand', '.topbar [data-theme]', '.topbar-actions>.avatar']) {
            const item = find(selector);
            const bounds = item.getBoundingClientRect();
            const covering = documentInApp().elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            assert(bounds.top >= 0 && bounds.bottom <= topbar.getBoundingClientRect().bottom + 1 && item.contains(covering), `Cabeçalho obstruído em ${route} a ${width}px: ${selector}, área ${Math.round(bounds.left)},${Math.round(bounds.top)},${Math.round(bounds.width)},${Math.round(bounds.height)}; elemento sobreposto ${covering?.tagName}.${covering?.className?.baseVal ?? covering?.className ?? ''}.`);
          }
          frame.contentWindow.scrollTo(0, 0);
          if (route === 'dashboard') {
            assert([...documentInApp().querySelectorAll('.stat-detail')].every(element => element.getClientRects().length), 'Escopos de histórico, metas e período devem permanecer visíveis no mobile.');
            assert(find('[data-stat="balance"]').textContent.includes('Saldo acumulado') && find('[data-stat="goals"]').textContent.includes('Controle separado'), 'Saldo e metas precisam manter seus escopos explícitos.');
            const help = find('.dashboard-summary-help');
            assert(!help.open && help.getClientRects().length, 'Explicações devem ficar disponíveis sob demanda.');
            help.querySelector('summary').click();
            assert(help.open && help.querySelector('p').getClientRects().length, 'Sobre os valores deve revelar as regras do resumo.');
            help.querySelector('summary').click();
            assert(!find('.forecast-mobile') && !find('.forecast-strip'), 'Planejamento deve ficar em Contas fixas e não competir com os valores realizados.');
          }
        }
        assertReadablePage();
        assertAlignedControls();
        if (route === 'dashboard') {
          const cards = [...documentInApp().querySelectorAll('.dashboard-page [data-stat]')];
          assert(JSON.stringify(cards.map(card => card.dataset.stat)) === JSON.stringify(['balance', 'goals', 'income', 'expense']), 'Cards devem seguir a ordem Saldo, Metas, Entradas e Saídas.');
          const [balance, goals, income, expense] = cards.map(card => card.getBoundingClientRect());
          assert(Math.abs(balance.top - goals.top) < 1 && Math.abs(income.top - expense.top) < 1 && income.top > balance.bottom && balance.right < goals.left, `Resumo deve manter duas linhas e duas colunas em ${width}px.`);
          const valueBounds = cards.map(card => card.querySelector('.stat-value').getBoundingClientRect());
          assert(Math.abs(valueBounds[0].bottom - valueBounds[1].bottom) < 2 && Math.abs(valueBounds[2].bottom - valueBounds[3].bottom) < 2, 'Valores dos cards da mesma linha devem manter a mesma base, mesmo com títulos quebrados.');
          const grid = find('.dashboard-page .stats-grid').getBoundingClientRect();
          const picker = find('#dashboard-period').getBoundingClientRect();
          assert(Math.abs(picker.left - grid.left) < 1 && Math.abs(picker.right - grid.right) < 1 && picker.bottom < grid.top, 'Período deve ocupar toda a largura acima dos quatro cards.');
          assert(!find('.dashboard-overview-toolbar h2'), 'Título Resumo deve ser removido.');
          const greeting = find('.dashboard-greeting-message');
          assert(greeting.getClientRects().length && greeting.textContent === 'Vamos cuidar das suas finanças?', 'Saudação deve ter uma frase curta visível também no celular.');
        }
        if (route === 'goals') {
          assert(!find('main').textContent.includes('Saldo total') && !find('main').textContent.includes('Saldo livre') && documentInApp().querySelectorAll('[data-goals-saved]').length === 1, 'Resumo simples deve aparecer também no desktop.');
          const help = find('.goal-savings-help');
          help.querySelector('summary').click();
          assertReadablePage();
          assert(root.scrollWidth <= root.clientWidth + 1, 'Ajuda das metas deve caber na tela sem rolagem horizontal.');
          help.querySelector('summary').click();
        }
        if (route === 'bills') {
          for (const kind of ['income', 'bill']) {
            selectRecurringView(kind);
            assertReadablePage();
            assertAlignedControls();
            assert(root.scrollWidth <= root.clientWidth + 1, `Aba ${kind} não deve criar rolagem horizontal em ${width}px.`);
            const tabs = [...documentInApp().querySelectorAll('[data-recurring-view]')];
            const firstBounds = tabs[0].getBoundingClientRect();
            const secondBounds = tabs[1].getBoundingClientRect();
            assert(Math.abs(firstBounds.top - secondBounds.top) < 1 && Math.abs(firstBounds.height - secondBounds.height) < 1 && firstBounds.right <= secondBounds.left, 'Abas devem ficar alinhadas, sem sobreposição.');
            for (const button of find(`#recurring-panel-${kind}`).querySelectorAll('[data-new-recurring]')) {
              const section = button.closest('.recurring-section');
              const buttonBounds = button.getBoundingClientRect();
              const panelBounds = section.querySelector('.recurring-list-panel').getBoundingClientRect();
              assert(!button.closest('.panel') && buttonBounds.bottom < panelBounds.top, 'Nova conta e Nova renda devem ficar fora do painel da lista.');
              if (width <= 720) assert(Math.abs(buttonBounds.width - section.getBoundingClientRect().width) < 1 && buttonBounds.height >= 48, 'Ação de cadastro mobile deve ocupar uma linha inteira com área de toque adequada.');
            }
          }
        }
        if (route === 'transactions') {
          if (width >= 390) {
            for (const action of documentInApp().querySelectorAll('.statement-page-header [data-new]')) {
              const textNode = [...action.childNodes].find(node => node.nodeType === frame.contentWindow.Node.TEXT_NODE && node.textContent.trim());
              const textRange = documentInApp().createRange();
              textRange.selectNodeContents(textNode);
              assert(textRange.getClientRects().length === 1, 'Registrar entrada e Registrar saída devem caber na mesma linha a partir de 390px.');
            }
          }
          find('#toggle-transaction-filters').click();
          for (const period of ['month', 'last30', 'last90', 'custom', 'all']) {
            input('#transaction-filters [name="period"]', period);
            assertReadablePage();
            assertAlignedControls();
          }
          const paginationBounds = find('#transaction-pagination').getBoundingClientRect();
          assert(paginationBounds.left >= 0 && paginationBounds.right <= root.clientWidth + 1, `Paginação deve caber em ${width}px.`);
          assert(find('#transaction-page-previous').getBoundingClientRect().height === find('#transaction-page-next').getBoundingClientRect().height, 'Botões de paginação devem manter a mesma altura.');
        }
        if (route === 'education') {
          const cards = [...documentInApp().querySelectorAll('.education-card')];
          for (const [index, card] of cards.entries()) {
            const next = cards[index + 1];
            if (!next || Math.abs(card.getBoundingClientRect().top - next.getBoundingClientRect().top) > 2) continue;
            for (const selector of ['.video-container', '.education-card-actions']) {
              assert(Math.abs(card.querySelector(selector).getBoundingClientRect().top - next.querySelector(selector).getBoundingClientRect().top) < 2, 'Vídeos e ações dos canais devem alinhar na mesma linha.');
            }
          }
        }
        if (route === 'reports') {
          const initialBounds = find('.report-filter-panel').getBoundingClientRect();
          for (const mode of ['year', 'custom', 'month']) {
            find(`[name="mode"][value="${mode}"]`).click();
            const bounds = find('.report-filter-panel').getBoundingClientRect();
            assert(Math.abs(bounds.width - initialBounds.width) < 1 && Math.abs(bounds.height - initialBounds.height) < 1, `Trocar o filtro não pode redimensionar a caixa em ${width}px.`);
            const activeControl = find(`#report-filters [data-mode="${mode}"]`).querySelector('input, button');
            const pickerBounds = activeControl.getBoundingClientRect();
            const switchBounds = find('.report-mode-switch').getBoundingClientRect();
            assert(Math.abs(pickerBounds.height - switchBounds.height) < 1, 'O seletor de período e os modos devem ter a mesma altura.');
            if (width >= 1280) assert(Math.abs(pickerBounds.top - switchBounds.top) < 1, 'Controles de período devem alinhar na mesma linha no desktop.');
            for (const label of documentInApp().querySelectorAll('.report-mode-switch label')) {
              const text = label.querySelector('span');
              const range = documentInApp().createRange();
              range.selectNodeContents(text);
              const textBounds = range.getBoundingClientRect();
              const labelBounds = label.getBoundingClientRect();
              assert(textBounds.left >= labelBounds.left && textBounds.right <= labelBounds.right, `Rótulos não podem se sobrepor no modo ${mode} em ${width}px.`);
            }
          }
          for (const mode of documentInApp().querySelectorAll('.report-mode-switch label')) {
            const text = mode.querySelector('span');
            assert(text.scrollWidth <= text.clientWidth + 1, 'Rótulos dos filtros devem caber sem cortes.');
          }
          if (width < 760) {
            const cards = documentInApp().querySelectorAll('.report-stat');
            assert(cards[0].getBoundingClientRect().top < cards[1].getBoundingClientRect().top, 'Resultado deve aparecer antes de receitas e despesas.');
            assert(Math.abs(cards[1].getBoundingClientRect().top - cards[2].getBoundingClientRect().top) < 2, 'Receitas e despesas devem ficar lado a lado.');
          }
        }
        if (width < 760 && route === 'bills') {
          const summaryCards = documentInApp().querySelectorAll('.recurring-stats .stat-card');
          assert(summaryCards[2].getBoundingClientRect().top < summaryCards[0].getBoundingClientRect().top, 'Falta pagar deve aparecer primeiro no mobile.');
          assert(Math.abs(summaryCards[0].getBoundingClientRect().top - summaryCards[1].getBoundingClientRect().top) < 2, 'Previsto e Já pago devem ficar lado a lado.');
          assert(find('.topbar').getBoundingClientRect().height <= 72, 'Topo mobile deve ser compacto.');
        }
      }
    }
    pass('Sete páginas mantêm textos legíveis, campos e ações alinhados de 320 a 1920px');
    pass('Saudação, período em largura total, ordem dos cards, botões externos e remoção de textos funcionam em seis tamanhos');
    pass('Filtros de relatórios mantêm largura e altura ao trocar Mensal, Anual e Personalizado em seis tamanhos de tela');

    frame.style.maxWidth = 'none';
    for (const width of [320, 390, 768, 1440]) {
      frame.style.width = `${width}px`;
      frame.width = String(width);
      await navigate('bills', 'Contas fixas');
      const root = documentInApp().documentElement;
      assert(root.scrollWidth <= root.clientWidth + 1, `Contas fixas não deve transbordar em ${width}px.`);
      revealRecurringRow(`[data-recurring-row="${paidBillId}"]`);
      const menu = find(`[data-recurring-row="${paidBillId}"] .recurring-menu`);
      assert(menu.querySelectorAll('button').length === 4, 'Opções deve reunir histórico, editar, pausar e excluir.');
      const trigger = menu.querySelector('summary');
      trigger.scrollIntoView({block: 'center'});
      menu.open = false;
      trigger.click();
      await pause(40);
      const panel = menu.querySelector('.recurring-menu-panel').getBoundingClientRect();
      assert(panel.left >= 0 && panel.right <= root.clientWidth + 1 && panel.top >= 0 && panel.bottom <= frame.contentWindow.innerHeight, `Menu deve permanecer visível em ${width}px.`);
      revealRecurringRow(`[data-undo="${paidBillId}"]`);
      const paidButton = find(`[data-undo="${paidBillId}"]`);
      if (width <= 720) {
        const billRow = paidButton.closest('.recurring-row');
        const titleBounds = billRow.querySelector('.recurring-info').getBoundingClientRect();
        const amountBounds = billRow.querySelector('.recurring-value').getBoundingClientRect();
        const rowStyle = frame.contentWindow.getComputedStyle(billRow);
        const contentWidth = billRow.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight);
        assert(Math.abs(titleBounds.width - contentWidth) < 2 && titleBounds.bottom <= amountBounds.top + 1, 'Título da conta deve ocupar sua própria linha, sem competir com o valor no mobile.');
      }
      const billRow = paidButton.closest('.recurring-row');
      const typeGroup = billRow.closest('[data-recurring-type]');
      for (const box of [typeGroup, billRow]) {
        const style = frame.contentWindow.getComputedStyle(box);
        assert(parseFloat(style.borderRadius) > 0 && parseFloat(style.borderTopWidth) >= 1, 'Tipo de despesa e cada despesa devem ter seus próprios boxes com bordas.');
      }
      const rowBounds = billRow.getBoundingClientRect();
      const groupBounds = typeGroup.getBoundingClientRect();
      assert(rowBounds.left > groupBounds.left && rowBounds.right < groupBounds.right, 'O box individual deve permanecer contido no box do tipo, inclusive no mobile.');
      assert(paidButton.getBoundingClientRect().height >= 44 && paidButton.scrollWidth <= paidButton.clientWidth + 1, 'O botão Pago deve permanecer visível e sem cortes.');
      assert(Math.abs(paidButton.getBoundingClientRect().top - trigger.getBoundingClientRect().top) < 2, 'Pago e Opções devem ficar na mesma linha.');
      const pendingButton = find('[data-confirm][data-kind="bill"]');
      if (width >= 390 && pendingButton) {
        const label = pendingButton.querySelector('span');
        assert(label.getBoundingClientRect().height <= parseFloat(frame.contentWindow.getComputedStyle(label).lineHeight) + 1, 'Marcar como pago deve caber em uma linha a partir de 390px.');
      }
    }
    pass('Pago e Opções ficam lado a lado, com menu acessível em 320, 768 e 1440px');

    frame.src = '../index.html#dashboard';
    await until(() => find('#dashboard-period'), 'reabrir sessão');
    assert((await getData(account.id)).transactions.length === 3, 'Dados devem sobreviver a recarregamento.');
    assert(find('main h1').textContent.includes('Nome'), 'Nome editado deve aparecer no painel.');
    pass('Recarregar preserva sessão, dados e onboarding concluído');

    const previousDemo = await getAccount('walet-plus-demo');
    const previousDemoData = previousDemo ? await getData(previousDemo.id) : null;
    if (!previousDemo) demoAccountToRemove = 'walet-plus-demo';
    await navigate('settings', 'Configurações');
    find('[data-logout]').click();
    await until(() => find('#auth-form'), 'sair para explorar demonstração');
    find('#explore-demo').click();
    await until(() => find('#dashboard-period'), 'abrir demonstração sem faixa');
    const demoAccount = await getSession();
    const demoData = await getData(demoAccount.id);
    assert(demoAccount.demo && demoAccount.id !== account.id, 'Explorar demonstração deve manter sua própria conta e seus dados.');
    assert(previousDemoData ? JSON.stringify(demoData) === JSON.stringify(previousDemoData) : demoData.transactions.length > 0, 'Entrar na demonstração deve preservar dados existentes ou criar os exemplos iniciais.');
    for (const [route, heading] of [['dashboard', 'Olá'], ['transactions', 'Extrato'], ['settings', 'Configurações']]) {
      await navigate(route, heading);
      assert(!find('.demo-banner') && !documentInApp().body.textContent.includes('Modo demonstração'), 'Faixa de demonstração não deve aparecer nas páginas.');
    }
    assert(find('main').textContent.includes('Conta de exploração'), 'Configurações deve continuar identificando a conta de demonstração.');
    pass('Demonstração continua acessível, isolada e identificada nas configurações, sem faixa de aviso');
  } catch (error) {
    failure = error;
    const item = document.createElement('li');
    item.textContent = `✗ ${error.message}`;
    results.append(item);
  } finally {
    frame.src = 'about:blank';
    if (account) await deleteAccount(account.id);
    if (demoAccountToRemove) await deleteAccount(demoAccountToRemove);
    if (previousSession) localStorage.setItem(sessionKey, previousSession);
    else localStorage.removeItem(sessionKey);
    summary.dataset.status = failure ? 'fail' : 'pass';
    summary.textContent = failure ? `Falha: ${failure.message}` : `${results.children.length} fluxos verificados com sucesso.`;
    button.disabled = false;
  }
}
button.addEventListener('click', run);
if (new URLSearchParams(location.search).get('autorun') === '1') run();
