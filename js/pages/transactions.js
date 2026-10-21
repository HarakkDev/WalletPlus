import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, monthKey, categoriesFor } from '../domain/finance.js';

const paymentMethods = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Boleto', 'Outro'];
const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');

export function openTransaction(ctx, transaction = null, initialType = 'expense') {
  const selectedType = transaction?.type || initialType;
  const categoryOptions = type => [...new Set([...categoriesFor(ctx.data, type), ...(transaction?.type === type && transaction.category ? [transaction.category] : [])])].map(category => {
    const name = typeof category === 'string' ? category : category.name;
    return `<option value="${escapeHTML(name)}" ${name === transaction?.category ? 'selected' : ''}>${escapeHTML(name)}</option>`;
  }).join('');
  const linked = Boolean(transaction?.recurringId);
  const result = openModal({
    title: transaction ? 'Editar transação' : selectedType === 'income' ? 'Nova receita' : 'Nova despesa',
    body: `<div class="form-grid">
      ${linked ? '<p class="full-width form-note">Este lançamento confirma uma ocorrência recorrente. Sua edição preserva o vínculo com o mês de referência.</p>' : ''}
      <label class="field">Tipo<select name="type" id="transaction-type" ${linked ? 'disabled' : ''}><option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>Despesa</option><option value="income" ${selectedType === 'income' ? 'selected' : ''}>Receita</option></select></label>
      <label class="field">Valor (R$)<input name="amount" data-money inputmode="numeric" placeholder="0,00" required value="${transaction ? moneyValue(transaction.amount) : ''}" maxlength="18"></label>
      <label class="field full-width">Descrição<input name="description" required maxlength="120" value="${escapeHTML(transaction?.description || '')}" placeholder="Ex.: compras da semana"></label>
      <label class="field">Data<input type="date" name="date" required max="${dateISO()}" value="${transaction?.date || dateISO()}"></label>
      <label class="field">Categoria<select name="category" id="transaction-category" required>${categoryOptions(selectedType)}</select></label>
      <label class="field full-width">Forma de pagamento <span class="muted">(opcional)</span><select name="paymentMethod"><option value="">Não informado</option>${paymentMethods.map(method => `<option ${transaction?.paymentMethod === method ? 'selected' : ''}>${method}</option>`).join('')}</select></label>
      <label class="field full-width">Observações <span class="muted">(opcional)</span><textarea name="notes" maxlength="1000" rows="3">${escapeHTML(transaction?.notes || '')}</textarea></label>
    </div>`,
    onSubmit: async formData => {
      const amount = parseMoney(formData.get('amount'));
      const description = String(formData.get('description')).trim();
      const date = String(formData.get('date'));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!description) throw new Error('Informe a descrição da transação.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > dateISO()) throw new Error('Informe uma data válida até hoje.');
      const type = linked ? transaction.type : String(formData.get('type'));
      const updated = { ...transaction, id: transaction?.id || crypto.randomUUID(), type, description, amount, date, category: String(formData.get('category')), paymentMethod: String(formData.get('paymentMethod')), notes: String(formData.get('notes')).trim() };
      await ctx.update(data => {
        const position = data.transactions.findIndex(item => item.id === updated.id);
        if (position >= 0) data.transactions[position] = updated;
        else data.transactions.push(updated);
      });
      toast(transaction ? 'Transação atualizada.' : 'Transação registrada.');
      await ctx.render();
    },
  });
  const typeSelect = document.getElementById('transaction-type');
  typeSelect?.addEventListener('change', () => {
    document.getElementById('transaction-category').innerHTML = categoryOptions(typeSelect.value);
  });
  return result;
}

export async function render(container, ctx) {
  const currentMonth = monthKey(dateISO());
  const filterCategories = [...new Set([...['income', 'expense'].flatMap(type => categoriesFor(ctx.data, type)), ...ctx.data.transactions.map(transaction => transaction.category)])];
  container.innerHTML = `<header class="page-header"><div><p class="eyebrow">SEU DINHEIRO EM MOVIMENTO</p><h1>Transações</h1><p class="muted">Cada entrada e saída, no seu controle.</p></div><div class="row-actions"><button class="btn btn-secondary" data-new="income">${icon('plus')} Nova receita</button><button class="btn btn-primary" data-new="expense">${icon('plus')} Nova despesa</button></div></header>
    <section class="panel"><form class="transaction-filters toolbar" id="transaction-filters"><label class="field filter-search">Pesquisar<input name="search" type="search" placeholder="Descrição ou observação"></label><label class="field">De<input name="from" type="date" value="${currentMonth}-01"></label><label class="field">Até<input name="to" type="date" value="${dateISO()}"></label><label class="field">Tipo<select name="type"><option value="">Todos os tipos</option><option value="income">Receitas</option><option value="expense">Despesas</option></select></label><label class="field">Categoria<select name="category"><option value="">Todas as categorias</option>${filterCategories.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('')}</select></label><button type="button" class="btn btn-ghost" id="clear-filters">Limpar filtros</button></form></section>
    <div class="transaction-totals" id="transaction-totals" aria-live="polite"></div><section class="panel" id="transaction-results"></section>`;
  const filters = container.querySelector('#transaction-filters');
  const renderResults = () => {
    const values = new FormData(filters);
    const search = String(values.get('search')).trim().toLocaleLowerCase('pt-BR');
    const from = String(values.get('from'));
    const to = String(values.get('to'));
    const filtered = ctx.data.transactions.filter(transaction => (!from || transaction.date >= from) && (!to || transaction.date <= to) && (!values.get('type') || transaction.type === values.get('type')) && (!values.get('category') || transaction.category === values.get('category')) && (!search || `${transaction.description} ${transaction.notes || ''}`.toLocaleLowerCase('pt-BR').includes(search))).sort((first, second) => second.date.localeCompare(first.date));
    const income = filtered.filter(item => item.type === 'income').reduce((total, item) => total + item.amount, 0);
    const expense = filtered.filter(item => item.type === 'expense').reduce((total, item) => total + item.amount, 0);
    container.querySelector('#transaction-totals').innerHTML = `<span>${filtered.length} lançamento${filtered.length === 1 ? '' : 's'}</span><span>Entradas <strong class="positive">${formatMoney(income)}</strong></span><span>Saídas <strong class="negative">${formatMoney(expense)}</strong></span><span>Resultado <strong class="${income >= expense ? 'positive' : 'negative'}">${formatMoney(income - expense)}</strong></span>`;
    container.querySelector('#transaction-results').innerHTML = filtered.length ? `<div class="table-wrap"><table class="data-table transaction-table"><thead><tr><th>Transação</th><th>Data</th><th>Categoria</th><th>Valor</th><th><span class="sr-only">Ações</span></th></tr></thead><tbody>${filtered.map(transaction => `<tr><td data-label="Transação"><div class="transaction-description"><span class="transaction-symbol ${transaction.type === 'income' ? 'income' : 'expense'}">${icon(transaction.type === 'income' ? 'arrow-down-left' : 'arrow-up-right')}</span><div><strong>${escapeHTML(transaction.description)}</strong><small class="muted">${transaction.recurringId ? `Recorrente · ref. ${transaction.referenceMonth?.split('-').reverse().join('/') || ''}` : escapeHTML(transaction.paymentMethod || (transaction.type === 'income' ? 'Receita' : 'Despesa'))}</small>${transaction.notes ? `<small class="transaction-note">${escapeHTML(transaction.notes)}</small>` : ''}</div></div></td><td data-label="Data">${formatDate(transaction.date)}</td><td data-label="Categoria"><span class="badge">${escapeHTML(transaction.category)}</span></td><td data-label="Valor" class="money-cell ${transaction.type === 'income' ? 'positive' : 'negative'}">${transaction.type === 'income' ? '+' : '−'} ${formatMoney(transaction.amount)}</td><td class="transaction-actions"><div class="row-actions"><button class="btn btn-icon btn-ghost" data-edit="${transaction.id}" aria-label="Editar ${escapeHTML(transaction.description)}">${icon('pencil')}</button><button class="btn btn-icon btn-ghost" data-delete="${transaction.id}" aria-label="Excluir ${escapeHTML(transaction.description)}">${icon('trash-2')}</button></div></td></tr>`).join('')}</tbody></table></div>` : emptyState('Nenhuma transação encontrada', 'Registre suas movimentações ou ajuste os filtros para visualizar outros períodos.', '<button class="btn btn-primary" data-new="expense">Registrar transação</button>');
  };
  filters.addEventListener('input', renderResults);
  filters.addEventListener('submit', event => event.preventDefault());
  container.querySelector('#clear-filters').addEventListener('click', () => {
    filters.reset();
    filters.elements.from.value = '';
    filters.elements.to.value = '';
    renderResults();
  });
  container.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.new) openTransaction(ctx, null, button.dataset.new);
    if (button.dataset.edit) openTransaction(ctx, ctx.data.transactions.find(item => item.id === button.dataset.edit));
    if (button.dataset.delete) {
      const transaction = ctx.data.transactions.find(item => item.id === button.dataset.delete);
      if (await confirmDialog('Excluir transação?', `“${transaction.description}” será removida.${transaction.recurringId ? ' A ocorrência recorrente voltará a ficar pendente.' : ''}`)) {
        try {
          await ctx.update(data => { data.transactions = data.transactions.filter(item => item.id !== transaction.id); });
          toast('Transação excluída.');
          renderResults();
        } catch (error) { toast(error.message, 'error'); }
      }
    }
  };
  renderResults();
}
