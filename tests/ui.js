import {getSession} from '../js/services/auth.js';
import {getData, deleteAccount} from '../js/services/repository.js';
import {dateISO, getSummary, goalSaved} from '../js/domain/finance.js';
import {exportBackup} from '../js/services/backup.js';

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
async function navigate(route, heading) {
  frame.contentWindow.location.hash = route;
  await until(() => find('main h1')?.textContent.includes(heading), `abrir ${route}`);
  await pause(50);
}
function pass(name) {
  const item = document.createElement('li');
  item.textContent = `✓ ${name}`;
  results.append(item);
}
async function run() {
  button.disabled = true;
  results.replaceChildren();
  summary.dataset.status = 'running';
  summary.textContent = 'Executando fluxos…';
  const sessionKey = 'walet-plus-session';
  const previousSession = localStorage.getItem(sessionKey);
  let account;
  let failure;
  try {
    localStorage.removeItem(sessionKey);
    frame.src = '../index.html#register';
    await until(() => find('#auth-form'), 'cadastro');
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
    find('#onboarding-form').requestSubmit();
    await until(() => find('[data-bill-toggle]'), 'despesas essenciais');
    const essential = [...documentInApp().querySelectorAll('.bill-choice')].find(element => element.textContent.includes('Energia elétrica'));
    essential.querySelector('input').click();
    input('[name^="bill-amount-"]', '250,00');
    find('#onboarding-form').requestSubmit();
    await until(() => find('h2')?.textContent.includes('assinaturas'), 'assinaturas');
    const subscription = [...documentInApp().querySelectorAll('.bill-choice')].find(element => element.textContent.includes('Netflix'));
    subscription.querySelector('input').click();
    input('[name^="bill-amount-"]', '50,00');
    find('#onboarding-form').requestSubmit();
    await until(() => find('[data-add-goal]'), 'metas');
    find('[data-add-goal="Fazer uma viagem"]').click();
    input('[name^="goal-target-"]', '2000,00');
    find('#onboarding-form').requestSubmit();
    await until(() => find('.onboarding-summary'), 'resumo');
    assert(find('.summary-total').textContent.includes('5.000,00'), 'Resumo mensal deve resultar em 5.000.');
    find('#onboarding-form').requestSubmit();
    await until(() => find('#new-income'), 'painel após onboarding');
    let data = await getData(account.id);
    assert(data.incomeSources.length === 2 && data.bills.length === 2 && data.goals.length === 1, 'Planejamento deve persistir.');
    assert(getSummary(data).balance === 0, 'Previsões não podem criar saldo.');
    pass('Cinco etapas salvam múltiplas rendas, contas, assinatura e meta sem criar saldo');

    find('#new-income').click();
    await submitModal({description: 'Entrada de teste', amount: '1000,00', date: dateISO()});
    find('#new-expense').click();
    await submitModal({description: 'Compra de teste', amount: '100,00', date: dateISO()});
    data = await getData(account.id);
    assert(getSummary(data).balance === 90000, 'Saldo realizado após receita e despesa incorreto.');
    pass('Dashboard registra receitas e despesas por modais e atualiza saldo');

    await navigate('transactions', 'Transações');
    input('#transaction-filters [name="search"]', 'Compra de teste');
    assert(documentInApp().querySelectorAll('.transaction-table tbody tr').length === 1, 'Pesquisa deve filtrar resultados.');
    find('[data-edit]').click();
    assert(find('dialog[open] [name="amount"]').value === '100,00', 'Editar deve preservar o valor salvo com a máscara.');
    await submitModal({amount: '120,00', description: 'Compra editada'});
    data = await getData(account.id);
    assert(data.transactions.some(transaction => transaction.description === 'Compra editada' && transaction.amount === 12000), 'Edição não persistiu.');
    pass('Pesquisa e edição de transações funcionam com valores em centavos');

    await navigate('bills', 'Contas fixas');
    find('[data-confirm][data-kind="bill"]').click();
    await submitModal({date: dateISO()});
    data = await getData(account.id);
    assert(data.transactions.filter(transaction => transaction.recurringKind === 'bill').length === 1, 'Pagamento precisa gerar uma transação.');
    assert(find('[data-confirm][data-kind="bill"]').disabled, 'Ocorrência paga deve bloquear nova confirmação.');
    find('[data-confirm][data-kind="income"]').click();
    await submitModal({date: dateISO()});
    data = await getData(account.id);
    assert(getSummary(data).balance === 563000, 'Confirmação de renda e despesa deve atualizar saldo.');
    pass('Contas e rendas são confirmadas por mês sem pagamento duplicado');

    await navigate('goals', 'Minhas metas');
    find('[data-contribute]').click();
    await submitModal({amount: '200,00', date: dateISO()});
    find('[data-withdraw]').click();
    await submitModal({amount: '50,00', date: dateISO()});
    data = await getData(account.id);
    assert(goalSaved(data.goals[0]) === 15000 && getSummary(data).balance === 563000, 'Reserva não deve mudar saldo financeiro.');
    pass('Contribuição e retirada alteram somente a reserva da meta');

    await navigate('reports', 'Relatórios');
    assert(!find('#report-error:not([hidden])'), 'Relatório não pode exibir erro.');
    assert(documentInApp().querySelectorAll('#report-content canvas').length === 3, 'Relatórios devem ter três gráficos.');
    input('[name="mode"]', 'year');
    find('#report-filters').requestSubmit();
    assert(!find('#report-error:not([hidden])'), 'Filtro anual deve funcionar.');
    pass('Relatórios renderizam comparação, categorias e recorrência com filtros');

    await navigate('education', 'Aprenda');
    const players = documentInApp().querySelectorAll('iframe');
    assert(players.length === 5 && [...players].every(player => player.src.includes('youtube.com/embed/') && player.loading === 'lazy'), 'Cinco players oficiais lazy esperados.');
    const filter = documentInApp().querySelector('[data-subject]:not([data-subject="all"])');
    filter.click();
    assert(find('[data-results]').textContent.includes('cana'), 'Filtro de assuntos deve atualizar quantidade.');
    pass('Educação inclui cinco embeds oficiais, links e filtro por assunto');

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

    await navigate('transactions', 'Transações');
    input('#transaction-filters [name="search"]', 'Compra editada');
    find('[data-delete]').click();
    await until(() => find('.confirm-modal[open]'), 'confirmar exclusão da transação');
    find('.confirm-modal[open] [value="confirm"]').click();
    await until(async () => (await getData(account.id)).transactions.length === 3, 'excluir transação');
    assert(getSummary(await getData(account.id)).balance === 575000, 'Excluir despesa deve recompor saldo.');
    pass('Excluir transação exige confirmação e recalcula o saldo');

    frame.style.width = '360px';
    frame.width = '360';
    for (const [route, heading] of [['dashboard', 'Olá'], ['transactions', 'Transações'], ['bills', 'Contas fixas'], ['goals', 'Minhas metas'], ['education', 'Aprenda'], ['reports', 'Relatórios'], ['settings', 'Configurações']]) {
      await navigate(route, heading);
      const root = documentInApp().documentElement;
      assert(root.scrollWidth <= root.clientWidth + 1, `Rolagem horizontal indevida em ${route}: ${root.scrollWidth}/${root.clientWidth}`);
      assert(frame.contentWindow.getComputedStyle(find('.mobile-nav')).display !== 'none', `Navegação móvel ausente em ${route}`);
    }
    pass('Sete páginas funcionam a 360 px sem rolagem horizontal e com navegação inferior');

    frame.src = '../index.html#dashboard';
    await until(() => find('#new-income'), 'reabrir sessão');
    assert((await getData(account.id)).transactions.length === 3, 'Dados devem sobreviver a recarregamento.');
    assert(find('main h1').textContent.includes('Nome'), 'Nome editado deve aparecer no painel.');
    pass('Recarregar preserva sessão, dados e onboarding concluído');
  } catch (error) {
    failure = error;
    const item = document.createElement('li');
    item.textContent = `✗ ${error.message}`;
    results.append(item);
  } finally {
    frame.src = 'about:blank';
    if (account) await deleteAccount(account.id);
    if (previousSession) localStorage.setItem(sessionKey, previousSession);
    else localStorage.removeItem(sessionKey);
    summary.dataset.status = failure ? 'fail' : 'pass';
    summary.textContent = failure ? `Falha: ${failure.message}` : `${results.children.length} fluxos verificados com sucesso.`;
    button.disabled = false;
  }
}
button.addEventListener('click', run);
if (new URLSearchParams(location.search).get('autorun') === '1') run();
