import {register} from '../js/services/auth.js';
import {getAccountByEmail, getData, updateData, updateAccount, deleteAccount} from '../js/services/repository.js';
import {dateISO, monthKey, shiftMonth, formatMoney, recentDateRange, getSummary, goalSaved} from '../js/domain/finance.js';
import {routeHref} from '../js/navigation.js';

const frame = document.querySelector('#application');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const button = document.querySelector('#run-tests');
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const appDocument = () => frame.contentDocument;
const find = selector => appDocument()?.querySelector(selector);
const findAll = selector => [...appDocument().querySelectorAll(selector)];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const money = cents => (cents / 100).toFixed(2).replace('.', ',');
const modalField = name => find('dialog[open] [name="' + name + '"]');
const row = id => find('[data-recurring-row="' + id + '"]');
const group = (status, kind = 'bill') => find('#recurring-panel-' + kind + ' [data-recurring-status="' + status + '"]');
const query = link => new URLSearchParams(link.getAttribute('href').split('?')[1]);
const basicFields = () => findAll('dialog[open] input:not([type="hidden"]), dialog[open] select, dialog[open] textarea').filter(field => !field.closest('details:not([open])') && field.getClientRects().length).map(field => field.name).sort().join(',');

async function until(condition, description) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    const value = await condition();
    if (value) return value;
    await pause(15);
  }
  throw new Error('Tempo esgotado: ' + description + '. ' + (find('dialog[open] .form-error:not([hidden])')?.textContent || ''));
}

function input(selector, value) {
  const field = find(selector);
  assert(field, 'Campo ausente: ' + selector);
  field.value = value;
  field.dispatchEvent(new frame.contentWindow.Event('input', {bubbles: true}));
  field.dispatchEvent(new frame.contentWindow.Event('change', {bubbles: true}));
}

async function navigate(page, heading, params = {}) {
  frame.contentWindow.location.hash = routeHref(page, params).slice(1);
  await until(() => find('main h1')?.textContent.includes(heading) && frame.contentWindow.location.hash === '#' + page, 'abrir ' + page);
  await pause(40);
}

async function changeDashboardPeriod(period) {
  const previousPicker = find('#dashboard-period');
  input('#dashboard-period', period);
  await until(() => find('#dashboard-period') !== previousPicker && find('#dashboard-period')?.value === period, 'trocar intervalo do Início');
}

async function closeModal() {
  find('dialog[open] [data-close]').click();
  await until(() => !find('dialog[open]'), 'fechar modal');
}

async function submit(values, twice = false) {
  const form = await until(() => find('dialog[open] form'), 'abrir formulário');
  Object.entries(values).forEach(([name, value]) => input('dialog[open] [name="' + name + '"]', value));
  form.requestSubmit();
  if (twice) form.requestSubmit();
  await until(() => !find('dialog[open]'), 'salvar formulário');
}

async function menuFor(id) {
  const card = row(id);
  assert(card, 'A previsão deve estar na lista.');
  const status = card.closest('[data-recurring-status]');
  if (!status.open) { status.open = true; await pause(25); }
  const menu = card.querySelector('.recurring-menu');
  if (!menu.open) menu.querySelector('summary').click();
  await until(() => menu.open, 'abrir Opções');
  return menu;
}

function assertRecord(description) {
  assert(find('.statement-detail-modal[open] .statement-detail-heading h3')?.textContent === description, 'O detalhe deve abrir o lançamento exato solicitado.');
  assert(findAll('dialog[open]').length === 1, 'A navegação não pode deixar modais sobrepostos.');
}

function fixture(today, month, previousMonth, ids) {
  const transaction = (id, type, description, amount, date, extra = {}) => ({id, type, description, amount, date, category: 'Outros', paymentMethod: '', notes: '', ...extra});
  const bill = (id, name, amount, extra = {}) => ({id, name, amount, day: 1, category: 'Contas Fixas', group: 'essential', active: true, startMonth: previousMonth, ...extra});
  return {
    incomeSources: [{id: ids.income, name: 'Renda prevista do teste', amount: 80000, day: 1, category: 'Outros', active: true, frequency: 'monthly', startMonth: previousMonth, date: ''}],
    bills: [bill(ids.pending, 'Conta pendente do teste', 10000), bill(ids.paid, 'Conta paga do teste', 25000, {group: 'subscription', category: 'Assinaturas'}), bill(ids.paused, 'Conta pausada do teste', 5000, {active: false, category: 'Saúde'}), bill(ids.future, 'Conta de outro mês do teste', 7000, {startMonth: shiftMonth(month, 1)})],
    transactions: [
      transaction(ids.oldRecord, 'income', 'Entrada antiga do teste', 400000, previousMonth + '-01'),
      transaction(crypto.randomUUID(), 'income', 'Entrada atual do teste', 450000, today),
      transaction(crypto.randomUUID(), 'expense', 'Saída antiga do teste', 100000, previousMonth + '-01'),
      transaction(crypto.randomUUID(), 'expense', 'Saída atual do teste', 70000, today),
      transaction(ids.paidRecord, 'expense', 'Conta paga do teste', 25000, today, {recurringId: ids.paid, recurringKind: 'bill', referenceMonth: month}),
      transaction(ids.paidOldRecord, 'expense', 'Conta paga do teste', 24000, previousMonth + '-01', {recurringId: ids.paid, recurringKind: 'bill', referenceMonth: previousMonth}),
      transaction(ids.pendingOldRecord, 'expense', 'Conta pendente do teste', 9500, previousMonth + '-01', {recurringId: ids.pending, recurringKind: 'bill', referenceMonth: previousMonth}),
    ],
    goals: [{id: ids.goal, title: 'Meta independente do teste', target: 1500000, initialAmount: 997000, targetDate: '', contributions: []}],
    categories: [],
  };
}

async function run() {
  if (button.disabled) return;
  button.disabled = true;
  results.replaceChildren();
  summary.dataset.status = 'running';
  summary.textContent = 'Verificando clareza dos fluxos…';
  const sessionKey = 'walet-plus-session';
  const previousSession = localStorage.getItem(sessionKey);
  const email = 'usability-' + crypto.randomUUID() + '@wallet-test.invalid';
  const checks = [];
  const ids = Object.fromEntries(['pending', 'paid', 'paused', 'future', 'income', 'oldRecord', 'paidRecord', 'paidOldRecord', 'pendingOldRecord', 'goal'].map(name => [name, crypto.randomUUID()]));
  const today = dateISO();
  const month = monthKey(today);
  const previousMonth = shiftMonth(month, -1);
  const oldDate = previousMonth + '-01';
  let account;
  let failure;

  async function check(name, operation) {
    const item = document.createElement('li');
    item.textContent = name + '…';
    results.append(item);
    try {
      await operation();
      item.dataset.status = 'pass';
      item.textContent = '✓ ' + name;
      checks.push({name, status: 'pass'});
    } catch (error) {
      item.dataset.status = 'fail';
      item.textContent = '✗ ' + name + ': ' + error.message;
      checks.push({name, status: 'fail', error: error.message});
      throw error;
    }
  }

  try {
    account = await register({name: 'Teste de clareza', email, password: 'senha-temporaria-usability-123'});
    await updateAccount(account.id, {onboardingComplete: true});
    await updateData(account.id, () => fixture(today, month, previousMonth, ids));
    frame.style.width = '1440px';
    frame.style.maxWidth = 'none';
    frame.src = '../index.html#dashboard';
    await until(() => find('#dashboard-period'), 'iniciar conta temporária');

    await check('Início distingue saldo acumulado, metas e valores do período no desktop e celular', async () => {
      const data = await getData(account.id);
      const balance = getSummary(data).balance;
      for (const width of [1440, 320]) {
        frame.style.width = width + 'px';
        frame.width = String(width);
        await pause(30);
        for (const period of ['month', 'last30', 'last90']) {
          await changeDashboardPeriod(period);
          const range = period === 'month' ? {from: month + '-01', to: today} : recentDateRange(period === 'last30' ? 30 : 90);
          const current = data.transactions.filter(item => item.date >= range.from && item.date <= range.to);
          const sum = type => current.filter(item => item.type === type).reduce((total, item) => total + item.amount, 0);
          assert(find('[data-stat="balance"] .stat-value').textContent === formatMoney(balance), 'Período e metas não podem mudar o saldo acumulado.');
          assert(find('[data-stat="goals"] .stat-value').textContent === formatMoney(997000), 'A meta deve continuar separada do saldo.');
          assert(find('[data-stat="income"] .stat-value').textContent === formatMoney(sum('income')) && find('[data-stat="expense"] .stat-value').textContent === formatMoney(sum('expense')), 'Entradas e saídas devem respeitar o intervalo.');
          for (const card of findAll('.dashboard-page [data-stat]')) assert(card.querySelector('.stat-detail').getClientRects().length, 'O escopo deve permanecer visível no celular.');
          assert(find('[data-stat="balance"]').textContent.includes('Todo o histórico') && find('[data-stat="goals"]').textContent.includes('Controle separado'), 'Os escopos devem estar nomeados sem abrir uma ajuda.');
          assert(!find('.forecast-strip') && !find('main').textContent.includes('Restante previsto'), 'Planejamento não deve aparecer como outro saldo no Início.');
          assert(appDocument().documentElement.scrollWidth <= appDocument().documentElement.clientWidth + 1, 'O Início não deve causar rolagem horizontal.');
        }
      }
    });

    await check('Links do Início preservam período e abrem o registro exato, inclusive antigo', async () => {
      await changeDashboardPeriod('last30');
      const range = recentDateRange(30);
      const allLink = find('.dashboard-transactions .panel-header a');
      const params = query(allLink);
      assert(params.get('period') === 'last30' && params.get('from') === range.from && params.get('to') === range.to, 'Ver todas deve levar o período consultado.');
      allLink.click();
      await until(() => find('#transaction-filters'), 'abrir Extrato pelo Início');
      assert(find('[name="period"]').value === 'last30' && find('[name="from"]').value === range.from && find('[name="to"]').value === range.to, 'O Extrato deve aplicar as datas recebidas.');
      await navigate('dashboard', 'Olá');
      const recordLink = find('.dashboard-transaction-link');
      const record = (await getData(account.id)).transactions.find(item => item.id === query(recordLink).get('record'));
      recordLink.click();
      await until(() => find('.statement-detail-modal[open]'), 'abrir transação recente');
      assertRecord(record.description);
      await closeModal();
      await navigate('transactions', 'Extrato', {record: ids.oldRecord, period: 'month', from: month + '-01', to: today});
      assertRecord('Entrada antiga do teste');
      assert(find('[name="from"]').value === oldDate && find('[name="period"]').value === 'custom', 'Um lançamento antigo deve abrir no mês real, fora do filtro atual.');
      await closeModal();
    });

    await check('Contas fixas abre pendências e recolhe pagas, pausadas e previsões de outros meses', async () => {
      await navigate('bills', 'Contas fixas', {kind: 'bill', month});
      assert(group('pending').open && !group('completed').open && !group('inactive').open, 'Pendências devem começar abertas; pagas e pausadas, recolhidas.');
      assert(row(ids.pending).closest('[data-recurring-status]').dataset.recurringStatus === 'pending' && row(ids.paid).closest('[data-recurring-status]').dataset.recurringStatus === 'completed', 'Pendentes e confirmadas devem ficar em grupos distintos.');
      assert(row(ids.paused).closest('[data-recurring-status]').dataset.recurringStatus === 'inactive' && row(ids.future).closest('[data-recurring-status]').dataset.recurringStatus === 'inactive', 'Pausadas e previsões futuras não podem parecer cobranças pendentes.');
      assert(!row(ids.pending).querySelector('.recurring-category') && !row(ids.paid).querySelector('.recurring-category') && row(ids.paused).querySelector('.recurring-category').textContent === 'Saúde', 'Lista deve omitir classificações genéricas repetidas e preservar categorias específicas.');
      assert(row(ids.paid).querySelector('.recurring-value>.sr-only').textContent === 'Valor pago' && !row(ids.paid).querySelector('.recurring-value>small'), 'Valor deve manter o significado acessível sem repetir o status visual de pagamento.');
      group('completed').querySelector('summary').click();
      group('inactive').querySelector('summary').click();
      await pause(35);
    });

    await check('Confirmação usa valor e data reais, rejeita inválidos e não duplica ou altera outros meses', async () => {
      const original = await getData(account.id);
      find('[data-confirm="' + ids.pending + '"]').click();
      assert(modalField('amount').value === money(10000), 'O valor previsto deve iniciar a confirmação.');
      input('dialog[open] [name="amount"]', '0,00');
      find('dialog[open] form').requestSubmit();
      await until(() => find('dialog[open] .form-error:not([hidden])'), 'rejeitar valor zero');
      assert(JSON.stringify(await getData(account.id)) === JSON.stringify(original), 'Um valor inválido não pode alterar dados.');
      const tomorrow = new Date(today + 'T12:00:00');
      tomorrow.setDate(tomorrow.getDate() + 1);
      input('dialog[open] [name="amount"]', money(7000));
      input('dialog[open] [name="date"]', dateISO(tomorrow));
      find('dialog[open] form').requestSubmit();
      assert(modalField('date').validity.rangeOverflow, 'Uma data futura deve ser rejeitada.');
      assert(JSON.stringify(await getData(account.id)) === JSON.stringify(original), 'Uma data inválida não pode salvar pagamento.');
      await submit({amount: money(7000), date: oldDate}, true);
      let data = await getData(account.id);
      const payments = data.transactions.filter(item => item.recurringId === ids.pending && item.referenceMonth === month);
      assert(payments.length === 1 && payments[0].amount === 7000 && payments[0].date === oldDate, 'Confirmação repetida deve criar só um pagamento com os dados efetivos.');
      assert(data.bills.find(item => item.id === ids.pending).amount === 10000 && data.transactions.find(item => item.id === ids.pendingOldRecord).amount === 9500, 'A previsão e o pagamento de outro mês devem permanecer iguais.');
      assert(group('completed').open && group('inactive').open, 'Salvar não deve recolher grupos que o usuário abriu.');
      find('[data-recurring-view="income"]').click();
      find('[data-confirm="' + ids.income + '"]').click();
      await submit({amount: money(90000), date: oldDate}, true);
      data = await getData(account.id);
      const receipts = data.transactions.filter(item => item.recurringId === ids.income && item.referenceMonth === month);
      assert(receipts.length === 1 && receipts[0].amount === 90000 && receipts[0].date === oldDate, 'Recebimento maior que o previsto deve usar valor e data reais sem duplicar.');
      assert(data.incomeSources.find(item => item.id === ids.income).amount === 80000, 'Receber outro valor não deve mudar a renda prevista.');
      find('[data-recurring-view="bill"]').click();
    });

    await check('Editar previsão preserva pagamentos; desfazer mantém grupos e outras referências', async () => {
      const menu = await menuFor(ids.pending);
      assert(menu.querySelector('[data-edit-recurring]').textContent.includes('Editar previsão'), 'Editar cadastro deve se distinguir de editar pagamento.');
      menu.querySelector('[data-edit-recurring]').click();
      await submit({amount: money(14000)});
      let data = await getData(account.id);
      assert(data.bills.find(item => item.id === ids.pending).amount === 14000 && data.transactions.find(item => item.recurringId === ids.pending && item.referenceMonth === month).amount === 7000, 'Editar previsão não pode reescrever o valor pago.');
      assert(group('completed').open && group('inactive').open, 'Editar não deve perder a expansão dos grupos.');
      find('[data-undo="' + ids.pending + '"]').click();
      await until(() => find('.confirm-modal[open]'), 'confirmar desfazer');
      find('.confirm-modal[open] [value="confirm"]').click();
      await until(() => find('[data-confirm="' + ids.pending + '"]'), 'voltar a pendente');
      data = await getData(account.id);
      assert(!data.transactions.some(item => item.recurringId === ids.pending && item.referenceMonth === month) && data.transactions.some(item => item.id === ids.pendingOldRecord), 'Desfazer deve remover só a ocorrência escolhida.');
      assert(group('pending').open && group('completed').open && group('inactive').open, 'Desfazer não deve recolher os grupos abertos.');
    });

    await check('Extrato pede três campos, usa Outros por padrão e preserva detalhes adicionais', async () => {
      await navigate('transactions', 'Extrato');
      find('[data-new="expense"]').click();
      assert(basicFields() === 'amount,date,description' && !find('dialog[open] .statement-extra-fields').open, 'O cadastro básico deve pedir somente descrição, valor e data.');
      assert(modalField('category').value === 'Outros', 'Nova saída deve usar Outros sem obrigar a escolher categoria.');
      find('dialog[open] .statement-extra-fields>summary').click();
      await submit({description: 'Saída detalhada de clareza', amount: money(12345), date: today, category: 'Saúde', paymentMethod: 'Pix', notes: 'Detalhes preservados no teste'});
      const detailed = (await getData(account.id)).transactions.find(item => item.description === 'Saída detalhada de clareza');
      await navigate('transactions', 'Extrato', {record: detailed.id, edit: '1'});
      assert(find('dialog[open] .statement-extra-fields').open && modalField('category').value === 'Saúde' && modalField('paymentMethod').value === 'Pix' && modalField('notes').value === 'Detalhes preservados no teste', 'Editar deve revelar e preservar os campos adicionais existentes.');
      await submit({description: 'Saída detalhada de clareza editada'});
      find('[data-new="income"]').click();
      assert(basicFields() === 'amount,date,description' && modalField('category').value === 'Outros', 'Entrada deve começar simples sem repetir a escolha de tipo.');
      await submit({description: 'Entrada simples de clareza', amount: money(1200), date: today});
      assert((await getData(account.id)).transactions.find(item => item.description === 'Entrada simples de clareza').category === 'Outros', 'Categoria padrão deve persistir.');
    });

    await check('Novas previsões pedem nome, valor e dia, mantendo opções avançadas preservadas', async () => {
      await navigate('bills', 'Contas fixas', {kind: 'bill', month});
      const before = (await getData(account.id)).transactions.length;
      find('[data-new-recurring="bill"]').click();
      assert(basicFields() === 'amount,day,name' && !find('dialog[open] .recurring-form-options').open, 'A nova conta deve começar com três campos.');
      find('dialog[open] .recurring-form-options>summary').click();
      await submit({name: 'Nova previsão detalhada', amount: money(2222), day: '15', category: 'Transporte', group: 'subscription', startMonth: previousMonth});
      let data = await getData(account.id);
      const created = data.bills.find(item => item.name === 'Nova previsão detalhada');
      assert(created.group === 'subscription' && created.category === 'Transporte' && created.startMonth === previousMonth, 'Opções adicionais devem persistir.');
      const menu = await menuFor(created.id);
      menu.querySelector('[data-edit-recurring]').click();
      assert(modalField('category').value === 'Transporte' && modalField('group').value === 'subscription', 'Editar deve manter opções mesmo recolhidas.');
      await submit({name: 'Nova previsão detalhada editada'});
      find('[data-recurring-view="income"]').click();
      find('[data-new-recurring="income"]').click();
      assert(basicFields() === 'amount,day,name' && !find('dialog[open] .recurring-form-options').open, 'Nova renda deve começar com três campos.');
      await submit({name: 'Nova renda simples', amount: money(3333), day: '5'});
      data = await getData(account.id);
      assert(data.incomeSources.find(item => item.name === 'Nova renda simples').frequency === 'monthly' && data.transactions.length === before, 'Cadastrar previsões não pode criar entradas ou saídas.');
    });

    await check('Editar pagamento e histórico abrem o registro certo e a origem correta sem sobrepor modais', async () => {
      await navigate('bills', 'Contas fixas', {kind: 'bill', month, recurring: ids.paid});
      let menu = await menuFor(ids.paid);
      const editLink = [...menu.querySelectorAll('a')].find(link => query(link).get('edit') === '1');
      assert(editLink?.textContent.includes('Editar pagamento'), 'Conta paga deve ter edição específica do pagamento.');
      editLink.click();
      await until(() => find('.statement-edit-modal[open]'), 'editar pagamento no Extrato');
      assert(findAll('dialog[open]').length === 1 && modalField('amount').value === money(25000), 'Editar pagamento deve abrir somente o registro efetivo.');
      await submit({amount: money(30000), date: oldDate});
      const data = await getData(account.id);
      assert(data.transactions.find(item => item.id === ids.paidRecord).amount === 30000 && data.bills.find(item => item.id === ids.paid).amount === 25000, 'Editar pagamento não pode alterar a previsão.');
      await navigate('bills', 'Contas fixas', {kind: 'bill', month, recurring: ids.paid});
      menu = await menuFor(ids.paid);
      menu.querySelector('[data-history]').click();
      await until(() => find('dialog[open] .recurring-history'), 'abrir histórico');
      const historyLink = findAll('dialog[open] [data-open-statement]').find(link => query(link).get('record') === ids.paidOldRecord);
      assert(historyLink, 'O histórico deve oferecer link para cada lançamento.');
      historyLink.click();
      await until(() => find('.statement-detail-modal[open]'), 'abrir lançamento antigo');
      assertRecord('Conta paga do teste');
      assert(find('.statement-detail-modal[open] .statement-detail-amount').textContent.includes(formatMoney(24000)), 'O link deve mostrar o pagamento antigo exato.');
      find('.statement-detail-modal[open] [data-open-bills]').click();
      await until(() => find('#bills-month')?.value === previousMonth && !find('dialog[open]'), 'voltar à previsão de origem');
      assert(find('[data-recurring-view="bill"]').getAttribute('aria-selected') === 'true' && group('completed').open && row(ids.paid).classList.contains('is-highlighted'), 'Origem deve abrir mês, aba e grupo corretos e destacar a conta.');
      const receipt = (await getData(account.id)).transactions.find(item => item.recurringId === ids.income);
      await navigate('transactions', 'Extrato', {record: receipt.id});
      find('.statement-detail-modal[open] [data-open-bills]').click();
      await until(() => find('[data-recurring-view="income"]')?.getAttribute('aria-selected') === 'true' && !find('dialog[open]'), 'abrir origem da renda');
      assert(find('#bills-month').value === month && group('completed', 'income').open && row(ids.income).classList.contains('is-highlighted'), 'A renda deve abrir em Receitas no mês de referência, não no da data efetiva.');
    });

    await check('Datas inválidas e registro inexistente mostram feedback sem modificar dados', async () => {
      const before = JSON.stringify(await getData(account.id));
      await navigate('transactions', 'Extrato', {period: 'custom', from: month + '-28', to: month + '-01', record: 'registro-inexistente-do-teste'});
      const errors = findAll('.toast-error').map(element => element.textContent).join(' ');
      assert(errors.includes('período do link é inválido') && errors.includes('encontrar este lançamento'), 'Links inválidos precisam de feedback compreensível.');
      assert(!find('dialog[open]') && JSON.stringify(await getData(account.id)) === before, 'Parâmetros inválidos não podem abrir outro registro ou alterar o armazenamento.');
    });

    await check('Guardar e retirar metas continuam separados do saldo e do Extrato', async () => {
      const before = await getData(account.id);
      const balance = getSummary(before).balance;
      const originalSaved = goalSaved(before.goals.find(item => item.id === ids.goal));
      await navigate('goals', 'Minhas metas');
      find('[data-contribute="' + ids.goal + '"]').click();
      await submit({amount: money(2500), date: today, note: 'Sem efeito no Extrato'});
      find('[data-withdraw="' + ids.goal + '"]').click();
      await submit({amount: money(1000), date: today});
      const after = await getData(account.id);
      assert(goalSaved(after.goals.find(item => item.id === ids.goal)) === originalSaved + 1500, 'Guardar e retirar devem mudar apenas a meta.');
      assert(getSummary(after).balance === balance && JSON.stringify(after.transactions) === JSON.stringify(before.transactions), 'Metas não podem gerar receita, despesa nem descontar saldo.');
      await navigate('dashboard', 'Olá');
      assert(find('[data-stat="balance"] .stat-value').textContent === formatMoney(balance), 'O painel deve usar somente o saldo do Extrato.');
    });
  } catch (error) {
    failure = error;
    if (!checks.some(check => check.status === 'fail')) {
      const item = document.createElement('li');
      item.dataset.status = 'fail';
      item.textContent = '✗ Inicialização: ' + error.message;
      results.append(item);
      checks.push({name: 'Inicialização', status: 'fail', error: error.message});
    }
  } finally {
    frame.src = 'about:blank';
    await pause(30);
    try {
      await check('Conta temporária removida e sessão anterior restaurada', async () => {
        try {
          const temporary = account || await getAccountByEmail(email);
          if (temporary) await deleteAccount(temporary.id);
          assert(await getAccountByEmail(email) === null, 'A conta temporária deve ser removida.');
        } finally {
          if (previousSession === null) localStorage.removeItem(sessionKey);
          else localStorage.setItem(sessionKey, previousSession);
        }
        assert(localStorage.getItem(sessionKey) === previousSession, 'A sessão anterior deve ser restaurada exatamente.');
      });
    } catch (error) { failure ||= error; }
    const failed = checks.filter(check => check.status === 'fail').length;
    const status = failure ? 'fail' : 'pass';
    summary.dataset.status = status;
    summary.textContent = (checks.length - failed) + '/' + checks.length + ' verificações concluídas com sucesso.' + (failure ? ' Falha: ' + failure.message : '');
    window.__waletTestResults = {status, passed: checks.length - failed, failed, results: checks};
    button.disabled = false;
  }
}

button.addEventListener('click', run);
if (new URLSearchParams(location.search).get('autorun') === '1') run();
