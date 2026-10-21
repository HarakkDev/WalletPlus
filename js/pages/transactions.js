import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, monthKey, recentDateRange, categoriesFor } from '../domain/finance.js';
import { isDate } from '../domain/validation.js';
import { routeHref, consumeRouteParams } from '../navigation.js';

const paymentMethods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto', 'Outro'];
const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');
const periodLabels = { month: 'Este mês', last30: 'Últimos 30 dias', last90: 'Últimos 90 dias', all: 'Todo o histórico' };

function connectBillsLink(dialog, ctx, transaction = null) {
  const link = dialog.querySelector('[data-open-bills]');
  if (!link) return;
  const updateLink = () => {
    const type = transaction?.recurringId ? transaction.type : dialog.querySelector('[name="type"]')?.value || transaction?.type || 'expense';
    const date = dialog.querySelector('[name="date"]')?.value || transaction?.date || dateISO();
    const params = {kind: type === 'income' ? 'income' : 'bill'};
    if (transaction?.referenceMonth) params.month = transaction.referenceMonth;
    else if (isDate(date)) params.month = monthKey(date);
    if (transaction?.recurringId) params.recurring = transaction.recurringId;
    link.setAttribute('href', routeHref('bills', params));
  };
  updateLink();
  dialog.querySelector('[name="type"]')?.addEventListener('change', updateLink);
  dialog.querySelector('[name="date"]')?.addEventListener('change', updateLink);
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    updateLink();
    dialog.close();
    ctx.navigate(link.getAttribute('href').slice(1));
  });
}

export function openTransaction(ctx, transaction = null, initialType = 'expense', afterSave = ctx.render) {
  const selectedType = transaction?.type || initialType;
  const categoryChoices = {expense: 'Outros', income: 'Outros'};
  if (transaction) categoryChoices[selectedType] = transaction.category;
  const categoryOptions = type => [...new Set([...categoriesFor(ctx.data, type), ...(transaction?.type === type && transaction.category ? [transaction.category] : [])])].map(name =>
    `<option value="${escapeHTML(name)}" ${name === categoryChoices[type] ? 'selected' : ''}>${escapeHTML(name)}</option>`
  ).join('');
  const linked = Boolean(transaction?.recurringId);
  const extraFieldsOpen = Boolean(transaction && (transaction.category !== 'Outros' || transaction.paymentMethod || visibleNote(transaction)));
  const result = openModal({
    title: transaction ? 'Editar lançamento' : selectedType === 'income' ? 'Registrar entrada' : 'Registrar saída',
    submitLabel: transaction ? 'Salvar alterações' : selectedType === 'income' ? 'Registrar entrada' : 'Registrar saída',
    body: `<div class="form-grid">
      ${linked ? '<p class="full-width form-note">Criado ao confirmar em Contas fixas. Você está editando o pagamento ou recebimento registrado, não a previsão dos próximos meses.</p>' : !transaction ? '<p class="full-width form-note statement-manual-note">Já tem uma previsão? <a href="#bills" data-open-bills>Confirme em Contas fixas</a> para não lançar duas vezes.</p>' : ''}
      <label class="field full-width">Descrição<input name="description" required maxlength="120" value="${escapeHTML(transaction?.description || '')}" placeholder="${selectedType === 'income' ? 'Ex.: pagamento recebido' : 'Ex.: compras da semana'}" autofocus></label>
      <label class="field"><span id="transaction-amount-label">${selectedType === 'income' ? 'Valor recebido (R$)' : 'Valor pago (R$)'}</span><input name="amount" data-money inputmode="numeric" placeholder="0,00" required value="${transaction ? moneyValue(transaction.amount) : ''}" maxlength="18"></label>
      <label class="field"><span id="transaction-date-label">${selectedType === 'income' ? 'Data do recebimento' : 'Data do pagamento'}</span><input type="date" name="date" required max="${dateISO()}" value="${transaction?.date || dateISO()}"></label>
      ${linked ? `<input type="hidden" name="type" id="transaction-type" value="${selectedType}">` : ''}
      <details class="statement-extra-fields full-width" ${extraFieldsOpen ? 'open' : ''}><summary>Mais detalhes <span class="muted">(opcional)</span>${icon('chevronRight')}</summary><div class="form-grid">
        <label class="field full-width">Categoria<select name="category" id="transaction-category" required>${categoryOptions(selectedType)}</select></label>
        <label class="field full-width">Forma de pagamento<select name="paymentMethod"><option value="">Não informado</option>${paymentMethods.map(method => `<option ${transaction?.paymentMethod === method ? 'selected' : ''}>${method}</option>`).join('')}</select></label>
        <label class="field full-width">Observações<textarea name="notes" maxlength="1000" rows="3">${escapeHTML(transaction?.notes || '')}</textarea></label>
        ${!linked ? `<label class="field full-width statement-type-field">Alterar tipo do lançamento<select name="type" id="transaction-type"><option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>Saída · já paguei</option><option value="income" ${selectedType === 'income' ? 'selected' : ''}>Entrada · já recebi</option></select></label>` : ''}
      </div></details>
    </div>`,
    onSubmit: async formData => {
      const amount = parseMoney(formData.get('amount'));
      const description = String(formData.get('description')).trim();
      const date = String(formData.get('date'));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!description) throw new Error('Informe a descrição da transação.');
      if (!isDate(date) || date > dateISO()) throw new Error('Informe uma data válida até hoje.');
      const type = linked ? transaction.type : String(formData.get('type'));
      if (!['income', 'expense'].includes(type)) throw new Error('Escolha um tipo de lançamento válido.');
      const updated = { ...transaction, id: transaction?.id || crypto.randomUUID(), type, description, amount, date, category: String(formData.get('category')), paymentMethod: String(formData.get('paymentMethod')), notes: String(formData.get('notes')).trim() };
      await ctx.update(data => {
        const position = data.transactions.findIndex(item => item.id === updated.id);
        if (transaction && position < 0) throw new Error('Este lançamento foi removido. Atualize o Extrato para continuar.');
        if (position >= 0) data.transactions[position] = updated;
        else data.transactions.push(updated);
      });
      toast(transaction ? 'Lançamento atualizado no Extrato.' : type === 'income' ? 'Entrada recebida registrada.' : 'Saída paga registrada.');
      await afterSave();
    },
  });
  result.classList.add('statement-edit-modal');
  let activeType = selectedType;
  const typeSelect = result.querySelector('#transaction-type');
  typeSelect?.addEventListener('change', () => {
    const categorySelect = result.querySelector('#transaction-category');
    categoryChoices[activeType] = categorySelect.value;
    activeType = typeSelect.value;
    const isIncome = activeType === 'income';
    categorySelect.innerHTML = categoryOptions(activeType);
    result.querySelector('#transaction-amount-label').textContent = isIncome ? 'Valor recebido (R$)' : 'Valor pago (R$)';
    result.querySelector('#transaction-date-label').textContent = isIncome ? 'Data do recebimento' : 'Data do pagamento';
    result.querySelector('[name="description"]').placeholder = isIncome ? 'Ex.: pagamento recebido' : 'Ex.: compras da semana';
    if (!transaction) {
      const label = isIncome ? 'Registrar entrada' : 'Registrar saída';
      result.querySelector('.modal-header h2').textContent = label;
      result.querySelector('[type="submit"]').textContent = label;
    }
  });
  connectBillsLink(result, ctx, transaction);
  return result;
}


function referenceLabel(transaction) {
  return transaction.referenceMonth?.split('-').reverse().join('/') || '';
}

function visibleNote(transaction) {
  const note = String(transaction.notes || '').trim();
  const automaticNote = `Referência: ${referenceLabel(transaction)}`;
  return transaction.recurringId && note.toLocaleLowerCase('pt-BR') === automaticNote.toLocaleLowerCase('pt-BR') ? '' : note;
}

function signedAmount(transaction) {
  return `${transaction.type === 'income' ? '+' : '−'} ${formatMoney(transaction.amount)}`;
}

function renderDesktop(transactions) {
  return `<div class="panel statement-desktop"><div class="table-wrap"><table class="data-table transaction-table statement-table">
    <thead><tr><th>Lançamento</th><th>Data</th><th>Categoria</th><th class="statement-money">Valor</th><th>Ações</th></tr></thead>
    <tbody>${transactions.map(transaction => `<tr data-record-id="${escapeHTML(transaction.id)}">
      <td><div class="statement-description"><span class="statement-symbol ${transaction.type}">${icon(transaction.type === 'income' ? 'arrowDown' : 'arrowUp')}</span><div><strong>${escapeHTML(transaction.description)}</strong><small>${transaction.recurringId ? `Contas fixas · ${referenceLabel(transaction)}` : escapeHTML(transaction.paymentMethod || (transaction.type === 'income' ? 'Entrada recebida' : 'Saída paga'))}</small></div></div></td>
      <td class="statement-date">${formatDate(transaction.date)}</td><td><span class="badge">${escapeHTML(transaction.category)}</span></td>
      <td class="statement-money ${transaction.type === 'income' ? 'positive' : 'negative'}">${signedAmount(transaction)}</td>
      <td class="statement-actions"><div class="row-actions"><button class="btn btn-ghost btn-icon" data-view="${escapeHTML(transaction.id)}" aria-label="Ver detalhes de ${escapeHTML(transaction.description)}" title="Ver detalhes">${icon('info')}</button><button class="btn btn-ghost btn-icon" data-edit="${escapeHTML(transaction.id)}" aria-label="Editar ${escapeHTML(transaction.description)}" title="Editar">${icon('pencil')}</button><button class="btn btn-ghost btn-icon statement-delete" data-delete="${escapeHTML(transaction.id)}" aria-label="Excluir ${escapeHTML(transaction.description)}" title="Excluir">${icon('trash-2')}</button></div></td>
    </tr>`).join('')}</tbody>
  </table></div></div>`;
}

function renderMobile(transactions) {
  const days = new Map();
  transactions.forEach(transaction => {
    if (!days.has(transaction.date)) days.set(transaction.date, []);
    days.get(transaction.date).push(transaction);
  });
  return `<div class="statement-mobile">${[...days.entries()].map(([date, entries]) => `<section class="statement-day" aria-label="Lançamentos de ${formatDate(date)}">
    <h3>${date === dateISO() ? 'Hoje' : new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {weekday: 'long'}).replace(/^./, character => character.toLocaleUpperCase('pt-BR'))}<span>${formatDate(date)}</span></h3>
    <ul class="statement-day-list">${entries.map(transaction => `<li><button class="statement-entry" data-record-id="${escapeHTML(transaction.id)}" data-view="${escapeHTML(transaction.id)}" aria-label="Ver detalhes de ${escapeHTML(transaction.description)}, ${transaction.type === 'income' ? 'receita' : 'despesa'} de ${formatMoney(transaction.amount)}">
      <span class="statement-symbol ${transaction.type}">${icon(transaction.type === 'income' ? 'arrowDown' : 'arrowUp')}</span>
      <span class="statement-entry-copy"><strong>${escapeHTML(transaction.description)}</strong><span class="statement-entry-meta">${escapeHTML(transaction.category)}${transaction.recurringId ? `<span class="statement-recurring" role="img" aria-label="Registrado ao confirmar em Contas fixas" title="Registrado ao confirmar em Contas fixas">${icon('receipt')}</span>` : ''}</span></span>
      <span class="statement-entry-value"><strong class="${transaction.type === 'income' ? 'positive' : 'negative'}">${signedAmount(transaction)}</strong><span>Detalhes ${icon('chevronRight')}</span></span>
    </button></li>`).join('')}</ul>
  </section>`).join('')}</div>`;
}

function openDetails(ctx, transaction, afterSave, onDelete) {
  let editRequested = false;
  const note = visibleNote(transaction);
  const dialog = openModal({
    title: 'Detalhes do lançamento',
    submitLabel: 'Editar',
    body: `<div class="statement-detail-heading"><span class="statement-symbol ${transaction.type}">${icon(transaction.type === 'income' ? 'arrowDown' : 'arrowUp')}</span><div><p>${transaction.type === 'income' ? 'Receita recebida' : 'Despesa paga'}</p><h3>${escapeHTML(transaction.description)}</h3></div></div><p class="statement-detail-amount ${transaction.type === 'income' ? 'positive' : 'negative'}">${signedAmount(transaction)}</p>
      <dl class="statement-detail-list"><div><dt>${transaction.type === 'income' ? 'Recebido em' : 'Pago em'}</dt><dd>${formatDate(transaction.date)}</dd></div><div><dt>Categoria</dt><dd>${escapeHTML(transaction.category)}</dd></div><div><dt>Forma de pagamento</dt><dd>${escapeHTML(transaction.paymentMethod || 'Não informado')}</dd></div>${transaction.recurringId ? `<div><dt>Origem</dt><dd>Contas fixas · Referência ${escapeHTML(referenceLabel(transaction))}</dd></div>` : ''}</dl>
      ${transaction.recurringId ? `<div class="statement-origin-note"><p>Registrado automaticamente ao confirmar ${transaction.type === 'income' ? 'o recebimento' : 'o pagamento'}. Não precisa lançar novamente.</p><a href="#bills" data-open-bills>Ver contas fixas ${icon('arrowRight')}</a></div>` : ''}
      ${note ? `<div class="statement-detail-note"><h3>Observações</h3><p>${escapeHTML(note)}</p></div>` : ''}
      <button type="button" class="btn btn-ghost statement-delete" data-delete="${escapeHTML(transaction.id)}">${icon('trash-2')} Excluir lançamento</button>`,
    onSubmit: () => { editRequested = true; },
  });
  dialog.classList.add('statement-detail-modal');
  connectBillsLink(dialog, ctx, transaction);
  dialog.querySelector('.modal-footer [data-close]').textContent = 'Fechar';
  dialog.querySelector('[type="submit"]').dataset.edit = transaction.id;
  dialog.querySelector('[data-delete]').addEventListener('click', () => onDelete(transaction, dialog));
  dialog.addEventListener('close', () => {
    if (editRequested) openTransaction(ctx, transaction, transaction.type, afterSave);
  }, {once: true});
}

export async function render(container, ctx) {
  const today = dateISO();
  const currentMonth = monthKey(today);
  const routeParams = consumeRouteParams();
  const requestedRecordId = routeParams.get('record');
  const requestedRecord = requestedRecordId ? ctx.data.transactions.find(transaction => transaction.id === requestedRecordId) : null;
  const filterCategories = [...new Set([...['income', 'expense'].flatMap(type => categoriesFor(ctx.data, type)), ...ctx.data.transactions.map(transaction => transaction.category)])];
  container.innerHTML = `<div class="statement-page">
    <header class="page-header statement-page-header"><div><h1>Extrato</h1></div><div class="row-actions"><button class="btn btn-secondary" data-new="income">${icon('arrowDown')} Registrar entrada</button><button class="btn btn-primary" data-new="expense">${icon('arrowUp')} Registrar saída</button></div></header>
    <details class="statement-help"><summary>${icon('info')} O que aparece no Extrato? ${icon('chevronRight')}</summary><div><p>Apenas entradas recebidas e saídas pagas. Os valores abaixo consideram o período e os filtros escolhidos.</p><p>Previsões ficam em <a href="#bills">Contas fixas</a>. Ao confirmar um pagamento ou recebimento por lá, ele aparece aqui automaticamente. Não é preciso registrar outra vez.</p></div></details>
    <section class="panel statement-filter-panel" aria-label="Pesquisar e filtrar o extrato"><form id="transaction-filters">
      <div class="statement-search-row"><label class="field statement-period-field">Período<select name="period"><option value="month">Este mês</option><option value="last30">Últimos 30 dias</option><option value="last90">Últimos 90 dias</option><option value="custom">Personalizado</option><option value="all">Todo o histórico</option></select></label><label class="statement-search"><span class="sr-only">Pesquisar por descrição ou observação</span>${icon('search')}<input name="search" type="search" placeholder="Pesquisar lançamento" autocomplete="off"></label><button type="button" class="btn btn-secondary" id="toggle-transaction-filters" aria-expanded="false" aria-controls="transaction-filter-fields">${icon('sliders-horizontal')}<span>Filtros</span><span class="statement-filter-count" id="transaction-filter-count"></span></button></div>
      <div class="statement-custom-dates" id="transaction-date-fields" hidden><label class="field">Data inicial<input name="from" type="date" value="${currentMonth}-01"></label><label class="field">Data final<input name="to" type="date" value="${today}"></label></div>
      <div class="statement-filter-fields" id="transaction-filter-fields" hidden>
        <label class="field statement-filter-secondary">Tipo<select name="type"><option value="">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select></label>
        <label class="field statement-filter-secondary">Categoria<select name="category"><option value="">Todas</option>${filterCategories.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('')}</select></label>
      </div>
      <div class="statement-filter-status"><span id="transaction-period"></span><button type="button" class="btn btn-ghost btn-small" id="clear-filters">Limpar filtros</button></div>
      <p class="form-error" id="transaction-filter-error" role="alert" hidden></p>
    </form></section>
    <section class="statement-summary" id="transaction-totals" aria-label="Resumo dos lançamentos filtrados" aria-live="polite"></section>
    <div class="statement-history-heading"><h2>Lançamentos</h2><span id="transaction-count" role="status"></span></div>
    <div id="transaction-results"></div>
    <nav class="statement-pagination" id="transaction-pagination" aria-label="Paginação do extrato" hidden>
      <label class="statement-page-size">Por página<select id="transaction-page-size" aria-label="Lançamentos por página" aria-controls="transaction-results"><option value="20">20</option><option value="50">50</option><option value="100">100</option></select></label>
      <span id="transaction-page-range" role="status" aria-live="polite"></span>
      <div class="statement-page-controls"><button type="button" class="btn btn-secondary btn-icon" id="transaction-page-previous" aria-label="Página anterior" aria-controls="transaction-results">${icon('chevronLeft')}</button><span id="transaction-page-label"></span><button type="button" class="btn btn-secondary btn-icon" id="transaction-page-next" aria-label="Próxima página" aria-controls="transaction-results">${icon('chevronRight')}</button></div>
    </nav>
  </div>`;
  const filters = container.querySelector('#transaction-filters');
  const errorElement = container.querySelector('#transaction-filter-error');
  const pagination = container.querySelector('#transaction-pagination');
  const pageSizeSelect = container.querySelector('#transaction-page-size');
  const previousPage = container.querySelector('#transaction-page-previous');
  const nextPage = container.querySelector('#transaction-page-next');
  let currentPage = 1;
  let pageSize = 20;
  let appliedFilters;
  let selectRecordPage = Boolean(requestedRecord);
  const setPeriodRange = period => {
    if (period === 'month') {
      filters.elements.from.value = `${currentMonth}-01`;
      filters.elements.to.value = today;
    } else if (period === 'last30' || period === 'last90') {
      const range = recentDateRange(period === 'last30' ? 30 : 90, today);
      filters.elements.from.value = range.from;
      filters.elements.to.value = range.to;
    } else if (period === 'all') {
      filters.elements.from.value = '';
      filters.elements.to.value = '';
    }
  };
  const renderResults = () => {
    const values = new FormData(filters);
    const proposed = {search: String(values.get('search')).trim().toLocaleLowerCase('pt-BR'), from: String(values.get('from')), to: String(values.get('to')), type: String(values.get('type')), category: String(values.get('category')), period: String(values.get('period'))};
    container.querySelector('#transaction-date-fields').hidden = proposed.period !== 'custom';
    const invalidDate = (proposed.from && !isDate(proposed.from)) || (proposed.to && !isDate(proposed.to));
    const reversedRange = proposed.from && proposed.to && proposed.from > proposed.to;
    errorElement.hidden = !invalidDate && !reversedRange;
    if (!errorElement.hidden) errorElement.textContent = invalidDate ? 'Informe datas válidas entre os anos de 1900 e 9999.' : 'A data final deve ser igual ou posterior à data inicial.';
    else appliedFilters = proposed;
    if (!appliedFilters) return;
    const {search, from, to, type, category, period: selectedPeriod} = appliedFilters;
    const filtered = ctx.data.transactions.filter(transaction => (!from || transaction.date >= from) && (!to || transaction.date <= to) && (!type || transaction.type === type) && (!category || transaction.category === category) && (!search || `${transaction.description} ${transaction.notes || ''}`.toLocaleLowerCase('pt-BR').includes(search))).sort((first, second) => second.date.localeCompare(first.date));
    if (selectRecordPage) {
      const recordIndex = filtered.findIndex(transaction => transaction.id === requestedRecord.id);
      if (recordIndex >= 0) currentPage = Math.floor(recordIndex / pageSize) + 1;
      selectRecordPage = false;
    }
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pageCount);
    const firstIndex = (currentPage - 1) * pageSize;
    const visibleTransactions = filtered.slice(firstIndex, firstIndex + pageSize);
    const income = filtered.filter(item => item.type === 'income').reduce((total, item) => total + item.amount, 0);
    const expense = filtered.filter(item => item.type === 'expense').reduce((total, item) => total + item.amount, 0);
    container.querySelector('#transaction-totals').innerHTML = `<div class="statement-summary-result${income < expense ? ' is-negative' : ''}"><span>Resultado do período</span><strong class="${income >= expense ? 'positive' : 'negative'}">${formatMoney(income - expense)}</strong></div><div><span>Entradas</span><strong class="positive">${formatMoney(income)}</strong></div><div><span>Saídas</span><strong class="negative">${formatMoney(expense)}</strong></div>`;
    container.querySelector('#transaction-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'lançamento' : 'lançamentos'}`;
    const period = from && to ? `${formatDate(from)} — ${formatDate(to)}` : from ? `Desde ${formatDate(from)}` : to ? `Até ${formatDate(to)}` : 'Todo o histórico';
    const periodStatus = container.querySelector('#transaction-period');
    periodStatus.innerHTML = `${icon('calendar')}<span>${period}</span>`;
    periodStatus.setAttribute('aria-label', `${periodLabels[selectedPeriod] || 'Personalizado'}: ${period}`);
    const filterCount = Number(Boolean(type)) + Number(Boolean(category));
    const count = container.querySelector('#transaction-filter-count');
    count.textContent = String(filterCount);
    count.hidden = filterCount === 0;
    container.querySelector('#transaction-results').innerHTML = filtered.length ? renderDesktop(visibleTransactions) + renderMobile(visibleTransactions) : `<section class="panel">${ctx.data.transactions.length ? emptyState('Nenhum resultado neste filtro', 'Ajuste o período, a pesquisa ou os filtros para encontrar seus lançamentos.', '<button class="btn btn-secondary" data-reset-transactions>Limpar filtros</button>') : emptyState('Seu extrato ainda está vazio', 'Registre uma entrada recebida ou uma saída paga. Confirmações de Contas fixas aparecem aqui automaticamente.', '<a class="btn btn-secondary" href="#bills">Ver contas fixas</a>')}</section>`;
    if (requestedRecord) {
      container.querySelectorAll('[data-record-id]').forEach(record => {
        record.classList.toggle('statement-focused-record', record.dataset.recordId === requestedRecord.id);
      });
    }
    pagination.hidden = filtered.length === 0;
    container.querySelector('#transaction-page-range').textContent = filtered.length ? `${firstIndex + 1}–${firstIndex + visibleTransactions.length} de ${filtered.length}` : '';
    container.querySelector('#transaction-page-label').textContent = `Página ${currentPage} de ${pageCount}`;
    previousPage.disabled = currentPage === 1;
    nextPage.disabled = currentPage === pageCount;
  };
  const deleteTransaction = async (transaction, detailDialog = null) => {
    if (!transaction || !await confirmDialog('Excluir lançamento?', `“${transaction.description}” será removido do Extrato e o saldo será recalculado.${transaction.recurringId ? ' Em Contas fixas, este pagamento ou recebimento voltará a ficar pendente no mês de referência.' : ''}`)) return;
    try {
      await ctx.update(data => { data.transactions = data.transactions.filter(item => item.id !== transaction.id); });
      detailDialog?.close();
      renderResults();
      toast('Lançamento excluído do Extrato.');
    } catch (error) { toast(error.message, 'error'); }
  };
  const changeFilters = event => {
    if (event.target.name === 'period') {
      const selectedPeriod = filters.elements.period.value;
      setPeriodRange(selectedPeriod);
    } else if (event.target.name === 'from' || event.target.name === 'to') {
      filters.elements.period.value = 'custom';
    }
    currentPage = 1;
    renderResults();
  };
  filters.addEventListener('input', changeFilters);
  filters.addEventListener('change', changeFilters);
  filters.addEventListener('submit', event => event.preventDefault());
  pageSizeSelect.addEventListener('change', () => {
    pageSize = Number(pageSizeSelect.value);
    currentPage = 1;
    renderResults();
  });
  const changePage = offset => {
    currentPage += offset;
    renderResults();
    container.querySelector('.statement-history-heading').scrollIntoView({block: 'start'});
  };
  previousPage.addEventListener('click', () => changePage(-1));
  nextPage.addEventListener('click', () => changePage(1));
  container.querySelector('#toggle-transaction-filters').addEventListener('click', event => {
    const toggle = event.currentTarget;
    const fields = container.querySelector('#transaction-filter-fields');
    fields.hidden = !fields.hidden;
    toggle.setAttribute('aria-expanded', String(!fields.hidden));
  });
  container.querySelector('#clear-filters').addEventListener('click', () => {
    filters.reset();
    filters.elements.from.value = '';
    filters.elements.to.value = '';
    filters.elements.period.value = 'all';
    currentPage = 1;
    renderResults();
  });
  container.onclick = event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-reset-transactions')) { container.querySelector('#clear-filters').click(); return; }
    const transaction = ctx.data.transactions.find(item => item.id === (button.dataset.view || button.dataset.edit || button.dataset.delete));
    if (button.dataset.new) openTransaction(ctx, null, button.dataset.new, renderResults);
    if (button.dataset.view && transaction) openDetails(ctx, transaction, renderResults, deleteTransaction);
    if (button.dataset.edit && transaction) openTransaction(ctx, transaction, transaction.type, renderResults);
    if (button.dataset.delete) deleteTransaction(transaction);
  };
  const requestedPeriod = routeParams.get('period');
  const allowedPeriods = ['month', 'last30', 'last90', 'custom', 'all'];
  if (allowedPeriods.includes(requestedPeriod)) {
    filters.elements.period.value = requestedPeriod;
    setPeriodRange(requestedPeriod);
  }
  const routeFrom = routeParams.get('from') || '';
  const routeTo = routeParams.get('to') || '';
  const hasRouteDates = routeParams.has('from') || routeParams.has('to');
  const validRouteDates = (!routeFrom || isDate(routeFrom)) && (!routeTo || isDate(routeTo)) && (!routeFrom || !routeTo || routeFrom <= routeTo);
  if (hasRouteDates && validRouteDates) {
    filters.elements.from.value = routeFrom;
    filters.elements.to.value = routeTo;
    if (!allowedPeriods.includes(requestedPeriod)) filters.elements.period.value = 'custom';
  }
  if (requestedRecord) {
    const from = filters.elements.from.value;
    const to = filters.elements.to.value;
    if ((from && requestedRecord.date < from) || (to && requestedRecord.date > to)) {
      const recordMonth = monthKey(requestedRecord.date);
      const [year, monthNumber] = recordMonth.split('-').map(Number);
      filters.elements.from.value = `${recordMonth}-01`;
      filters.elements.to.value = `${recordMonth}-${new Date(year, monthNumber, 0).getDate()}`;
      filters.elements.period.value = 'custom';
    }
  }
  renderResults();
  if (hasRouteDates && !validRouteDates) toast('O período do link é inválido. Selecione as datas para consultar o Extrato.', 'error');
  if (requestedRecord) {
    const highlightedRecord = [...container.querySelectorAll('.statement-focused-record')].find(record => record.getClientRects().length);
    highlightedRecord?.scrollIntoView({block: 'center'});
    const recordAction = highlightedRecord?.matches('button') ? highlightedRecord : highlightedRecord?.querySelector('[data-view]');
    recordAction?.focus({preventScroll: true});
    if (routeParams.get('edit') === '1') openTransaction(ctx, requestedRecord, requestedRecord.type, renderResults);
    else openDetails(ctx, requestedRecord, renderResults, deleteTransaction);
  } else if (requestedRecordId) toast('Não foi possível encontrar este lançamento nos dados desta conta. Ele pode ter sido excluído.', 'error');
}
