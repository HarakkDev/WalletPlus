import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, monthKey, categoriesFor, recurringDate, confirmRecurring, undoRecurring, isOccurrencePaid } from '../domain/finance.js';
import { occurrenceApplies, occurrencePayment, renderRecurringCard, sortRecurringItems } from '../components/recurring-card.js';

import { consumeRouteParams, routeHref } from '../navigation.js';

let selectedMonth = monthKey(dateISO());
let selectedView = 'bill';
const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');
let menuEvents;
let stateOwner;
const expandedGroups = new Map();
const groupStateKey = (kind, status) => `${selectedMonth}:${kind}:${status}`;
const itemStatus = (data, kind, item) => occurrencePayment(data, kind, item, selectedMonth) ? 'completed' : item.active && occurrenceApplies(item, selectedMonth) ? 'pending' : 'inactive';

function statementPeriodHref(date = dateISO()) {
  const month = monthKey(date);
  return routeHref('transactions', { period: 'custom', from: `${month}-01`, to: recurringDate(month, 31) });
}

export function cleanup() {
  menuEvents?.abort();
}

function setupMenus(container) {
  cleanup();
  menuEvents = new AbortController();
  const { signal } = menuEvents;
  const closeMenus = except => container.querySelectorAll('.recurring-menu[open]').forEach(menu => {
    if (menu !== except) menu.open = false;
  });
  document.addEventListener('pointerdown', event => closeMenus(event.target.closest('.recurring-menu')), { signal });
  container.addEventListener('toggle', event => {
    const menu = event.target;
    if (!menu.matches('.recurring-menu') || !menu.open) return;
    closeMenus(menu);
    const panel = menu.querySelector('.recurring-menu-panel');
    menu.classList.remove('opens-up');
    panel.style.transform = '';
    const bounds = panel.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const offset = bounds.left < 16 ? 16 - bounds.left : bounds.right > viewportWidth - 16 ? viewportWidth - 16 - bounds.right : 0;
    if (offset) panel.style.transform = `translateX(${offset}px)`;
    const availableBelow = window.innerHeight - menu.getBoundingClientRect().bottom - 90;
    if (availableBelow < panel.offsetHeight && menu.getBoundingClientRect().top > panel.offsetHeight) menu.classList.add('opens-up');
  }, { capture: true, signal });
  container.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const menu = container.querySelector('.recurring-menu[open]');
    if (!menu) return;
    event.preventDefault();
    menu.open = false;
    menu.querySelector('summary').focus();
  }, { signal });
  container.addEventListener('focusout', event => {
    const menu = event.target.closest('.recurring-menu');
    if (menu && event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false;
  }, { signal });
}

function openRecurring(ctx, kind, item = null, initialGroup = 'essential') {
  const isIncome = kind === 'income';
  const categoryNames = [...new Set([...categoriesFor(ctx.data, isIncome ? 'income' : 'expense'), ...(item?.category ? [item.category] : [])])];
  const selectedCategory = item?.category || (isIncome ? 'Salário' : initialGroup === 'subscription' ? 'Assinaturas' : 'Contas Fixas');
  const dialog = openModal({
    title: `${item ? 'Editar' : 'Cadastrar'} ${isIncome ? 'renda prevista' : 'conta prevista'}`,
    submitLabel: 'Salvar previsão',
    body: `<div class="form-grid"><label class="field full-width">${isIncome ? 'Fonte de renda' : 'Nome da conta'}<input name="name" required maxlength="120" placeholder="${isIncome ? 'Ex.: salário' : 'Ex.: energia elétrica'}" value="${escapeHTML(item?.name || '')}"></label><label class="field">Valor previsto (R$)<input name="amount" data-money inputmode="numeric" maxlength="18" required placeholder="0,00" value="${item ? moneyValue(item.amount) : ''}"></label><label class="field">${isIncome ? 'Dia previsto de recebimento' : 'Dia do vencimento'}<select name="day">${Array.from({ length: 31 }, (_, index) => index + 1).map(day => `<option value="${day}" ${day === (item?.day || Number(item?.date?.slice(-2)) || 5) ? 'selected' : ''}>${day}</option>`).join('')}</select></label></div>
      <details class="recurring-form-options"><summary>Mais opções<span>Categoria, ${isIncome ? 'frequência' : 'grupo'} e início</span>${icon('chevronRight')}</summary><div class="form-grid"><label class="field">Categoria<select name="category">${categoryNames.map(name => `<option value="${escapeHTML(name)}" ${name === selectedCategory ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('')}</select></label>${isIncome ? `<label class="field">Frequência<select name="frequency"><option value="monthly" ${item?.frequency !== 'once' ? 'selected' : ''}>Mensal</option><option value="once" ${item?.frequency === 'once' ? 'selected' : ''}>Pontual</option></select></label>` : `<label class="field">Grupo<select name="group"><option value="essential" ${(item?.group || initialGroup) === 'essential' ? 'selected' : ''}>Despesa essencial</option><option value="subscription" ${(item?.group || initialGroup) === 'subscription' ? 'selected' : ''}>Assinatura ou opcional</option></select></label>`}<label class="field full-width">${isIncome ? 'Primeiro mês (ou mês da renda pontual)' : 'Primeiro mês da conta'}<input name="startMonth" type="month" required min="1900-01" value="${escapeHTML(item?.startMonth || selectedMonth)}"></label></div></details>
      <p class="form-note">Salvar cadastra somente a previsão. Nenhum valor entra no Extrato até você confirmar ${isIncome ? 'o recebimento' : 'o pagamento'}. Dias inexistentes usam o último dia do mês.${item?.frequency === 'once' && isOccurrencePaid(ctx.data, 'income', item.id, item.date.slice(0, 7)) ? ' Esta renda pontual já foi recebida: desfaça o recebimento antes de alterar seu mês previsto.' : ''}</p>`,
    onSubmit: async formData => {
      const name = String(formData.get('name')).trim();
      const amount = parseMoney(formData.get('amount'));
      const day = Number(formData.get('day'));
      const startMonth = String(formData.get('startMonth'));
      if (!name) throw new Error('Informe um nome.');
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth) || Number(startMonth.slice(0, 4)) < 1900) throw new Error('Informe um mês inicial válido.');
      const updated = { ...item, id: item?.id || crypto.randomUUID(), name, amount, day, startMonth, category: String(formData.get('category')), active: item?.active ?? true };
      if (isIncome) {
        updated.frequency = String(formData.get('frequency'));
        updated.date = updated.frequency === 'once' ? recurringDate(startMonth, day) : '';
      } else updated.group = String(formData.get('group'));
      await ctx.update(data => {
        const collection = isIncome ? data.incomeSources : data.bills;
        const position = collection.findIndex(source => source.id === updated.id);
        if (item && position < 0) throw new Error('Esta previsão não está mais disponível.');
        if (position >= 0) collection[position] = { ...updated, active: collection[position].active };
        else collection.push(updated);
      });
      toast(item ? `Previsão atualizada. ${isIncome ? 'Recebimentos' : 'Pagamentos'} anteriores mantidos.` : `${isIncome ? 'Renda' : 'Conta'} cadastrada. Confirme quando ${isIncome ? 'receber' : 'pagar'}.`);
      await ctx.render();
    },
  });
  dialog.classList.add('recurring-form-modal');
  dialog.querySelector('[name="startMonth"]').addEventListener('invalid', () => { dialog.querySelector('.recurring-form-options').open = true; });
  if (!isIncome && !item) {
    const categorySelect = dialog.querySelector('[name="category"]');
    const groupSelect = dialog.querySelector('[name="group"]');
    let categoryChosen = false;
    categorySelect.addEventListener('change', () => { categoryChosen = true; });
    groupSelect.addEventListener('change', () => {
      if (!categoryChosen) categorySelect.value = groupSelect.value === 'subscription' ? 'Assinaturas' : 'Contas Fixas';
    });
  }
}

function showHistory(ctx, kind, item) {
  const payments = ctx.data.transactions.filter(transaction => transaction.recurringId === item.id && transaction.recurringKind === kind).sort((first, second) => second.date.localeCompare(first.date));
  const dialog = openModal({
    title: `Histórico · ${item.name}`,
    submitLabel: 'Fechar',
    body: payments.length ? `<ul class="history-list recurring-history">${payments.map(payment => `<li><div><strong>Referência ${payment.referenceMonth.split('-').reverse().join('/')}</strong><span class="muted">${kind === 'income' ? 'Recebido' : 'Pago'} em ${formatDate(payment.date)}</span><a href="${escapeHTML(routeHref('transactions', { record: payment.id }))}" data-open-statement>Ver lançamento no Extrato ${icon('arrowRight')}</a></div><strong class="${kind === 'income' ? 'positive' : 'negative'}">${formatMoney(payment.amount)}</strong></li>`).join('')}</ul><p class="form-note">Cada confirmação já está no Extrato. Abra o lançamento para consultar ou editar o valor e a data reais.</p>` : `<p class="muted">Nenhum ${kind === 'income' ? 'recebimento' : 'pagamento'} confirmado. A previsão continua separada do Extrato.</p>`,
    onSubmit: async () => {},
  });
  dialog.querySelector('.modal-footer [data-close]').hidden = true;
  dialog.querySelectorAll('[data-open-statement]').forEach(link => link.addEventListener('click', () => dialog.close()));
}

function openConfirmation(ctx, kind, item) {
  const month = selectedMonth;
  const isIncome = kind === 'income';
  const dialog = openModal({
    title: isIncome ? 'Confirmar recebimento' : 'Confirmar pagamento',
    submitLabel: isIncome ? 'Confirmar recebimento' : 'Confirmar pagamento',
    body: `<p class="payment-reference">Mês de referência: ${month.split('-').reverse().join('/')}</p><div class="payment-summary"><strong>${escapeHTML(item.name)}</strong><span>Previsto: ${formatMoney(item.amount)}</span></div><div class="form-grid"><label class="field">${isIncome ? 'Valor recebido' : 'Valor pago'} (R$)<input name="amount" data-money inputmode="numeric" maxlength="18" required value="${moneyValue(item.amount)}" aria-describedby="recurring-effective-amount-help"></label><label class="field">${isIncome ? 'Data em que recebeu' : 'Data em que pagou'}<input name="date" type="date" required max="${dateISO()}" value="${dateISO()}" aria-describedby="recurring-effective-date-help"></label></div><p class="recurring-date-help" id="recurring-effective-amount-help">A previsão dos próximos meses não muda.</p><p class="recurring-date-help" id="recurring-effective-date-help">No Extrato, vale o mês desta data.</p><p class="form-note">Vai para o <a href="${escapeHTML(statementPeriodHref())}" data-open-statement>Extrato</a> automaticamente. Já registrou manualmente? Não confirme de novo.</p>`,
    onSubmit: async formData => {
      const date = String(formData.get('date'));
      const amount = parseMoney(formData.get('amount'));
      if (!date || date > dateISO()) throw new Error('A data efetiva deve ser hoje ou uma data anterior.');
      await ctx.update(data => { confirmRecurring(data, kind, item.id, month, date, amount); });
      toast(isIncome ? 'Recebimento confirmado. Consulte em Recebidas ou no Extrato.' : 'Pagamento confirmado. Consulte em Pagas ou no Extrato.');
      await ctx.render();
    },
  });
  dialog.classList.add('recurring-confirmation-modal');
  const statementLink = dialog.querySelector('[data-open-statement]');
  statementLink.addEventListener('click', () => dialog.close());
  dialog.querySelector('[name="date"]').addEventListener('change', event => {
    if (event.target.validity.valid) statementLink.href = statementPeriodHref(event.target.value);
  });
}

async function undoConfirmation(ctx, kind, item) {
  const month = selectedMonth;
  const isIncome = kind === 'income';
  const confirmed = await confirmDialog(
    isIncome ? 'Desfazer recebimento?' : 'Desfazer pagamento?',
    `“${item.name}” voltará a ficar ${isIncome ? 'a receber' : 'pendente'} na referência ${month.split('-').reverse().join('/')}. O lançamento correspondente sairá do Extrato e o saldo será atualizado. A previsão será mantida.`,
    isIncome ? 'Desfazer recebimento' : 'Desfazer pagamento',
  );
  if (!confirmed) return;
  try {
    await ctx.update(data => { undoRecurring(data, kind, item.id, month); });
    toast(isIncome ? 'Recebimento desfeito. Receita voltou a ficar prevista.' : 'Pagamento desfeito. Conta voltou a ficar pendente.');
    await ctx.render();
  } catch (error) { toast(error.message, 'error'); }
}

function renderSummary(data, kind, month) {
  const isIncome = kind === 'income';
  const collection = isIncome ? data.incomeSources : data.bills;
  const active = collection.filter(item => item.active && occurrenceApplies(item, month));
  const expected = active.reduce((total, item) => total + item.amount, 0);
  const confirmed = data.transactions.filter(item => item.recurringKind === kind && item.referenceMonth === month).reduce((total, item) => total + item.amount, 0);
  const pending = active.filter(item => !isOccurrencePaid(data, kind, item.id, month)).reduce((total, item) => total + item.amount, 0);
  return `<article class="stat-card"><span class="muted">Total previsto</span><strong>${formatMoney(expected)}</strong></article><article class="stat-card"><span class="muted">${isIncome ? 'Já recebido' : 'Já pago'}</span><strong class="positive">${formatMoney(confirmed)}</strong></article><article class="stat-card recurring-pending-stat"><span class="muted">${isIncome ? 'Falta receber' : 'Falta pagar'}</span><strong class="${isIncome ? 'positive' : 'negative'}">${formatMoney(pending)}</strong></article>`;
}

function renderStatusGroups(ctx, kind) {
  const isIncome = kind === 'income';
  const collection = isIncome ? ctx.data.incomeSources : ctx.data.bills;
  const statuses = [
    { id: 'pending', title: isIncome ? 'A receber neste mês' : 'A pagar neste mês', empty: collection.length ? isIncome ? 'Nenhum recebimento pendente' : 'Nenhuma conta pendente' : isIncome ? 'Nenhuma renda prevista' : 'Nenhuma conta prevista', description: collection.length ? 'As confirmações ficam no grupo abaixo.' : `Use Cadastrar ${isIncome ? 'renda' : 'conta'} para começar.` },
    { id: 'completed', title: isIncome ? 'Recebidas' : 'Pagas', empty: isIncome ? 'Nenhum recebimento confirmado' : 'Nenhum pagamento confirmado', description: `Ao confirmar ${isIncome ? 'um recebimento' : 'um pagamento'}, ele aparecerá aqui e no Extrato.` },
    { id: 'inactive', title: 'Pausadas ou de outros meses', empty: 'Nenhuma outra previsão', description: 'Cadastros pausados ou fora do mês de referência aparecem aqui.' },
  ];
  return statuses.map(status => {
    const items = sortRecurringItems(collection.filter(item => itemStatus(ctx.data, kind, item) === status.id), ctx.data, kind, selectedMonth);
    const key = groupStateKey(kind, status.id);
    const open = expandedGroups.has(key) ? expandedGroups.get(key) : status.id === 'pending';
    const list = isIncome ? `<div class="recurring-list">${items.map(item => renderRecurringCard(item, kind, ctx.data, selectedMonth)).join('')}</div>` : [{ group: 'essential', title: 'Despesas essenciais' }, { group: 'subscription', title: 'Assinaturas e opcionais' }].map(group => {
      const grouped = items.filter(item => item.group === group.group);
      return grouped.length ? `<section class="recurring-group" data-recurring-type="${group.group}" aria-label="${group.title}"><h3 class="recurring-group-title">${group.title}</h3><div class="recurring-list">${grouped.map(item => renderRecurringCard(item, kind, ctx.data, selectedMonth)).join('')}</div></section>` : '';
    }).join('');
    return `<details class="recurring-status-group" data-recurring-status="${status.id}" data-group-key="${key}" ${open ? 'open' : ''}><summary><span>${status.title}</span><span class="recurring-status-count">${items.length}</span>${icon('chevronRight')}</summary><div class="panel recurring-list-panel">${items.length ? list : emptyState(status.empty, status.description)}</div></details>`;
  }).join('');
}

export async function render(container, ctx) {
  if (stateOwner !== ctx.account.id) {
    stateOwner = ctx.account.id;
    selectedMonth = monthKey(dateISO());
    selectedView = 'bill';
    expandedGroups.clear();
  }
  const params = consumeRouteParams();
  const routeMonth = params.get('month');
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(routeMonth || '') && Number(routeMonth.slice(0, 4)) >= 1900) selectedMonth = routeMonth;
  const routeKind = params.get('kind');
  if (['bill', 'income'].includes(routeKind)) selectedView = routeKind;
  const routeItem = ['bill', 'income'].includes(routeKind) ? (routeKind === 'income' ? ctx.data.incomeSources : ctx.data.bills).find(item => item.id === params.get('recurring')) : null;
  if (routeItem) expandedGroups.set(groupStateKey(routeKind, itemStatus(ctx.data, routeKind, routeItem)), true);
  container.innerHTML = `<header class="page-header recurring-page-header"><div><h1>Contas fixas</h1></div><label class="field month-selector"><span>Mês de referência</span><input type="month" id="bills-month" min="1900-01" required value="${selectedMonth}"></label></header>
    <div class="recurring-view-tabs" role="tablist" aria-label="Despesas ou receitas"><button type="button" class="btn recurring-view-tab" id="recurring-tab-bill" role="tab" data-recurring-view="bill" aria-controls="recurring-panel-bill">${icon('arrowUp')} Despesas</button><button type="button" class="btn recurring-view-tab" id="recurring-tab-income" role="tab" data-recurring-view="income" aria-controls="recurring-panel-income">${icon('arrowDown')} Receitas</button></div>
    <div class="stats-grid recurring-stats" id="recurring-summary" aria-label="Resumo das previsões" aria-live="polite"></div>
    <details class="recurring-help"><summary>${icon('info')} Como usar Contas fixas? ${icon('chevronRight')}</summary><div class="recurring-help-steps"><p><strong>1. Cadastre a previsão</strong>Informe o valor e o vencimento. Cadastrar não movimenta dinheiro.</p><p><strong>2. Confirme quando acontecer</strong>Use Marcar como pago ou Confirmar recebimento. Confira o valor real e a data.</p><p><strong>3. Confira no Extrato</strong>A confirmação aparece automaticamente por lá. Não é preciso cadastrar outra vez. Clicou por engano? Abra Pagas ou Recebidas e use Pago ou Recebido para desfazer.</p></div></details>
    <div id="recurring-panel-bill" role="tabpanel" aria-labelledby="recurring-tab-bill" tabindex="0">
    <section class="recurring-section"><div class="panel-header"><div><h2>Suas contas</h2></div><button type="button" class="btn btn-primary recurring-add-button" data-new-recurring="bill" data-group="essential">${icon('plus')} Cadastrar conta</button></div>${renderStatusGroups(ctx, 'bill')}</section></div>
    <div id="recurring-panel-income" role="tabpanel" aria-labelledby="recurring-tab-income" tabindex="0">
    <section class="recurring-section"><div class="panel-header"><div><h2>Suas rendas</h2></div><button type="button" class="btn btn-primary recurring-add-button" data-new-recurring="income">${icon('plus')} Cadastrar renda</button></div>${renderStatusGroups(ctx, 'income')}</section></div>`;
  const viewTabs = [...container.querySelectorAll('[data-recurring-view]')];
  const selectView = kind => {
    selectedView = kind;
    container.querySelectorAll('.recurring-menu[open]').forEach(menu => { menu.open = false; });
    viewTabs.forEach(tab => {
      const selected = tab.dataset.recurringView === kind;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      container.querySelector(`#${tab.getAttribute('aria-controls')}`).hidden = !selected;
    });
    const summary = container.querySelector('#recurring-summary');
    summary.classList.toggle('is-income', kind === 'income');
    summary.setAttribute('aria-label', kind === 'income' ? 'Resumo das receitas previstas' : 'Resumo das despesas previstas');
    summary.innerHTML = renderSummary(ctx.data, kind, selectedMonth);
  };
  viewTabs.forEach(tab => tab.addEventListener('click', () => selectView(tab.dataset.recurringView)));
  container.querySelector('[role="tablist"]').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? viewTabs[0] : event.key === 'End' ? viewTabs[1] : viewTabs.find(tab => tab.dataset.recurringView !== selectedView);
    selectView(next.dataset.recurringView);
    next.focus();
  });
  container.querySelectorAll('[data-recurring-status]').forEach(group => group.addEventListener('toggle', () => {
    expandedGroups.set(group.dataset.groupKey, group.open);
  }));
  selectView(selectedView);
  setupMenus(container);
  if (routeItem) {
    const row = [...container.querySelectorAll('[data-recurring-row]')].find(item => item.dataset.recurringRow === routeItem.id && item.dataset.kind === routeKind);
    row.classList.add('is-highlighted');
    row.tabIndex = -1;
    requestAnimationFrame(() => {
      if (!row.isConnected) return;
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }
  container.querySelector('#bills-month').addEventListener('change', async event => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && Number(event.target.value.slice(0, 4)) >= 1900) {
      selectedMonth = event.target.value;
      await ctx.render();
    }
  });
  container.onclick = async event => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const menu = button.closest('.recurring-menu');
    if (menu) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
    if (button.dataset.newRecurring) { openRecurring(ctx, button.dataset.newRecurring, null, button.dataset.group); return; }
    const kind = button.dataset.kind;
    if (!['bill', 'income'].includes(kind)) return;
    const collectionName = kind === 'income' ? 'incomeSources' : 'bills';
    const itemId = button.dataset.confirm || button.dataset.undo || button.dataset.history || button.dataset.editRecurring || button.dataset.toggle || button.dataset.deleteRecurring;
    const item = ctx.data[collectionName].find(source => source.id === itemId);
    if (!item) return;
    if (button.dataset.confirm) openConfirmation(ctx, kind, item);
    if (button.dataset.undo) await undoConfirmation(ctx, kind, item);
    if (button.dataset.history) showHistory(ctx, kind, item);
    if (button.dataset.editRecurring) openRecurring(ctx, kind, item);
    if (button.dataset.toggle) {
      try {
        await ctx.update(data => {
          const storedItem = data[collectionName].find(source => source.id === item.id);
          if (!storedItem) throw new Error('Esta previsão não está mais disponível.');
          storedItem.active = !storedItem.active;
        });
        toast(item.active ? 'Previsão pausada.' : 'Previsão reativada.');
        await ctx.render();
      } catch (error) { toast(error.message, 'error'); }
    }
    if (button.dataset.deleteRecurring && await confirmDialog('Excluir esta previsão?', `“${item.name}” será excluída. Os ${kind === 'income' ? 'recebimentos' : 'pagamentos'} já confirmados continuarão no Extrato.`)) {
      try {
        await ctx.update(data => { data[collectionName] = data[collectionName].filter(source => source.id !== item.id); });
        toast('Previsão excluída. Histórico preservado.');
        await ctx.render();
      } catch (error) { toast(error.message, 'error'); }
    }
  };
}
