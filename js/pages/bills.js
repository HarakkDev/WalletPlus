import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, monthKey, categoriesFor, recurringDate, confirmRecurring, isOccurrencePaid } from '../domain/finance.js';

let selectedMonth = monthKey(dateISO());
const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');

function openRecurring(ctx, kind, item = null, initialGroup = 'essential') {
  const isIncome = kind === 'income';
  const categoryNames = [...new Set([...categoriesFor(ctx.data, isIncome ? 'income' : 'expense'), ...(item?.category ? [item.category] : [])])];
  const selectedCategory = item?.category || (isIncome ? 'Salário' : initialGroup === 'subscription' ? 'Assinaturas' : 'Contas Fixas');
  openModal({
    title: `${item ? 'Editar' : 'Adicionar'} ${isIncome ? 'fonte de renda' : 'conta recorrente'}`,
    body: `<div class="form-grid"><label class="field full-width">${isIncome ? 'Fonte de renda' : 'Nome da conta'}<input name="name" required maxlength="120" placeholder="${isIncome ? 'Ex.: salário' : 'Ex.: energia elétrica'}" value="${escapeHTML(item?.name || '')}"></label><label class="field">Valor previsto (R$)<input name="amount" inputmode="decimal" maxlength="16" required placeholder="0,00" value="${item ? moneyValue(item.amount) : ''}"></label><label class="field">Dia previsto<select name="day">${Array.from({ length: 31 }, (_, index) => index + 1).map(day => `<option value="${day}" ${day === (item?.day || Number(item?.date?.slice(-2)) || 5) ? 'selected' : ''}>${day}</option>`).join('')}</select></label><label class="field">Categoria<select name="category">${categoryNames.map(name => `<option value="${escapeHTML(name)}" ${name === selectedCategory ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('')}</select>${isIncome ? '<span class="muted">Será usada ao confirmar o recebimento.</span>' : ''}</label>${isIncome ? `<label class="field">Frequência<select name="frequency"><option value="monthly" ${item?.frequency !== 'once' ? 'selected' : ''}>Mensal</option><option value="once" ${item?.frequency === 'once' ? 'selected' : ''}>Pontual</option></select></label>` : `<label class="field">Grupo<select name="group"><option value="essential" ${(item?.group || initialGroup) === 'essential' ? 'selected' : ''}>Despesa essencial</option><option value="subscription" ${(item?.group || initialGroup) === 'subscription' ? 'selected' : ''}>Assinatura ou opcional</option></select></label>`}<label class="field full-width">Mês inicial ${isIncome ? '(ou mês da renda pontual)' : ''}<input name="startMonth" type="month" required value="${item?.startMonth || selectedMonth}"></label></div><p class="form-note">Valores previstos não alteram o saldo. Confirme ${isIncome ? 'o recebimento' : 'o pagamento'} em cada mês. Em meses mais curtos, o vencimento será o último dia disponível.${item?.frequency === 'once' && isOccurrencePaid(ctx.data, 'income', item.id, item.date.slice(0, 7)) ? ' Esta renda pontual já foi recebida: para alterar seu mês previsto, remova antes o recebimento em Transações.' : ''}</p>`,
    onSubmit: async formData => {
      const name = String(formData.get('name')).trim();
      const amount = parseMoney(formData.get('amount'));
      const day = Number(formData.get('day'));
      const startMonth = String(formData.get('startMonth'));
      if (!name) throw new Error('Informe um nome.');
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(startMonth)) throw new Error('Informe um mês inicial válido.');
      const updated = { ...item, id: item?.id || crypto.randomUUID(), name, amount, day, startMonth, category: String(formData.get('category')), active: item?.active ?? true };
      if (isIncome) {
        updated.frequency = String(formData.get('frequency'));
        updated.date = updated.frequency === 'once' ? recurringDate(startMonth, day) : '';
      } else updated.group = String(formData.get('group'));
      await ctx.update(data => {
        const collection = isIncome ? data.incomeSources : data.bills;
        const position = collection.findIndex(source => source.id === updated.id);
        if (position >= 0) collection[position] = updated;
        else collection.push(updated);
      });
      toast(item ? 'Previsão atualizada. Pagamentos anteriores foram preservados.' : 'Previsão cadastrada.');
      await ctx.render();
    },
  });
}

function showHistory(ctx, kind, item) {
  const payments = ctx.data.transactions.filter(transaction => transaction.recurringId === item.id && transaction.recurringKind === kind).sort((first, second) => second.date.localeCompare(first.date));
  openModal({
    title: `Histórico · ${item.name}`,
    submitLabel: 'Fechar',
    body: payments.length ? `<ul class="history-list">${payments.map(payment => `<li><div><strong>Referência ${payment.referenceMonth.split('-').reverse().join('/')}</strong><span class="muted">${kind === 'income' ? 'Recebido' : 'Pago'} em ${formatDate(payment.date)}</span></div><strong class="${kind === 'income' ? 'positive' : 'negative'}">${formatMoney(payment.amount)}</strong></li>`).join('')}</ul><p class="form-note">Edite ou exclua um lançamento pela página Transações.</p>` : '<p class="muted">Nenhuma confirmação registrada para esta previsão.</p>',
    onSubmit: async () => {},
  });
}

function openConfirmation(ctx, kind, item) {
  const month = selectedMonth;
  openModal({
    title: kind === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento',
    submitLabel: kind === 'income' ? 'Recebi este valor' : 'Confirmar pagamento',
    body: `<div class="payment-summary"><strong>${escapeHTML(item.name)}</strong><span class="${kind === 'income' ? 'positive' : 'negative'}">${formatMoney(item.amount)}</span></div><p class="muted">Referência: ${month.split('-').reverse().join('/')}. Esta confirmação cria um único lançamento no histórico.</p><label class="field">Data efetiva<input name="date" type="date" required max="${dateISO()}" value="${dateISO()}"></label><p class="form-note">O saldo realizado usa a data efetiva. O mês de referência identifica a ocorrência da previsão.</p>`,
    onSubmit: async formData => {
      const date = String(formData.get('date'));
      if (!date || date > dateISO()) throw new Error('A data efetiva deve ser hoje ou uma data anterior.');
      await ctx.update(data => { confirmRecurring(data, kind, item.id, month, date); });
      toast(kind === 'income' ? 'Receita confirmada e registrada.' : 'Pagamento confirmado e registrado.');
      await ctx.render();
    },
  });
}

function occurrenceApplies(item, month) {
  return (!item.startMonth || item.startMonth <= month) && (item.frequency !== 'once' || (item.date?.slice(0, 7) || item.startMonth) === month);
}

export async function render(container, ctx) {
  const renderCard = (item, kind) => {
    const isIncome = kind === 'income';
    const paid = isOccurrencePaid(ctx.data, kind, item.id, selectedMonth);
    const applies = occurrenceApplies(item, selectedMonth);
    const date = item.frequency === 'once' ? item.date : recurringDate(selectedMonth, item.day);
    const overdue = applies && item.active && !paid && date < dateISO();
    const status = paid ? isIncome ? 'Recebido' : 'Pago' : !item.active ? 'Desativada' : !applies ? 'Fora deste período' : overdue ? isIncome ? 'Aguardando receita' : 'Em atraso' : 'Pendente';
    return `<article class="recurring-row ${item.active ? '' : 'is-inactive'}"><span class="recurring-icon ${isIncome ? 'income' : item.group === 'subscription' ? 'subscription' : ''}">${icon(isIncome ? 'landmark' : item.group === 'subscription' ? 'repeat' : 'receipt')}</span><div class="recurring-info"><h3>${escapeHTML(item.name)}</h3><p class="muted">${escapeHTML(item.category || (isIncome ? 'Outros' : 'Contas Fixas'))} · ${isIncome ? 'Previsto' : 'Vence'} ${formatDate(date)}${item.frequency === 'once' ? ' · Pontual' : ''}</p><span class="badge ${paid ? 'badge-success' : overdue ? 'badge-danger' : ''}">${status}</span></div><strong class="recurring-amount">${formatMoney(item.amount)}</strong><div class="recurring-actions"><button class="btn ${paid ? 'btn-secondary' : 'btn-primary'}" data-confirm="${item.id}" data-kind="${kind}" ${paid || !item.active || !applies ? 'disabled' : ''}>${paid ? icon('check') : icon(isIncome ? 'arrow-down-left' : 'check')} ${paid ? isIncome ? 'Recebido' : 'Pago' : isIncome ? 'Recebi' : 'Marcar paga'}</button><div class="row-actions"><button class="btn btn-icon btn-ghost" data-history="${item.id}" data-kind="${kind}" aria-label="Histórico de ${escapeHTML(item.name)}" title="Histórico">${icon('history')}</button><button class="btn btn-icon btn-ghost" data-edit-recurring="${item.id}" data-kind="${kind}" aria-label="Editar ${escapeHTML(item.name)}" title="Editar">${icon('pencil')}</button><button class="btn btn-icon btn-ghost" data-toggle="${item.id}" data-kind="${kind}" aria-label="${item.active ? 'Desativar' : 'Ativar'} ${escapeHTML(item.name)}" title="${item.active ? 'Desativar' : 'Ativar'}">${icon(item.active ? 'pause' : 'play')}</button><button class="btn btn-icon btn-ghost" data-delete-recurring="${item.id}" data-kind="${kind}" aria-label="Excluir ${escapeHTML(item.name)}" title="Excluir">${icon('trash-2')}</button></div></div></article>`;
  };
  const activeBills = ctx.data.bills.filter(item => item.active && occurrenceApplies(item, selectedMonth));
  const expected = activeBills.reduce((total, item) => total + item.amount, 0);
  const paidTotal = ctx.data.transactions.filter(item => item.recurringKind === 'bill' && item.referenceMonth === selectedMonth).reduce((total, item) => total + item.amount, 0);
  const pending = activeBills.filter(item => !isOccurrencePaid(ctx.data, 'bill', item.id, selectedMonth)).reduce((total, item) => total + item.amount, 0);
  container.innerHTML = `<header class="page-header"><div><p class="eyebrow">PREVISIBILIDADE PARA SUA ROTINA</p><h1>Contas fixas</h1><p class="muted">Organize suas previsões e confirme cada movimentação.</p></div><label class="field month-selector">Mês de referência<input type="month" id="bills-month" required value="${selectedMonth}"></label></header>
    <div class="stats-grid recurring-stats"><article class="stat-card"><span class="muted">Despesas previstas</span><strong>${formatMoney(expected)}</strong></article><article class="stat-card"><span class="muted">Pagamentos desta referência</span><strong class="positive">${formatMoney(paidTotal)}</strong></article><article class="stat-card"><span class="muted">Ainda pendente</span><strong class="negative">${formatMoney(pending)}</strong></article></div>
    <p class="form-note">Previsões só entram no saldo após confirmação. O mês de referência evita duplicidades, mesmo quando o pagamento acontece em outra data.</p>
    ${[{ group: 'essential', title: 'Despesas essenciais', subtitle: 'As contas que fazem parte da sua rotina.' }, { group: 'subscription', title: 'Assinaturas e opcionais', subtitle: 'Pequenos valores recorrentes também merecem atenção.' }].map(section => {
      const items = ctx.data.bills.filter(item => item.group === section.group);
      return `<section class="panel recurring-section"><div class="panel-header"><div><h2>${section.title}</h2><p class="muted">${section.subtitle}</p></div><button class="btn btn-secondary" data-new-recurring="bill" data-group="${section.group}">${icon('plus')} Adicionar</button></div>${items.length ? `<div class="recurring-list">${items.map(item => renderCard(item, 'bill')).join('')}</div>` : emptyState('Nenhuma conta cadastrada', 'Adicione uma previsão e acompanhe os pagamentos mês a mês.')}</section>`;
    }).join('')}
    <section class="panel recurring-section"><div class="panel-header"><div><h2>Receitas previstas</h2><p class="muted">Salário e outras entradas só contam quando você recebe.</p></div><button class="btn btn-secondary" data-new-recurring="income">${icon('plus')} Adicionar renda</button></div>${ctx.data.incomeSources.length ? `<div class="recurring-list">${ctx.data.incomeSources.map(item => renderCard(item, 'income')).join('')}</div>` : emptyState('Suas fontes de renda aparecem aqui', 'Cadastre rendas mensais ou pontuais e confirme os recebimentos.')}</section>`;
  container.querySelector('#bills-month').addEventListener('change', async event => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
      selectedMonth = event.target.value;
      await ctx.render();
    }
  });
  container.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.newRecurring) { openRecurring(ctx, button.dataset.newRecurring, null, button.dataset.group); return; }
    const kind = button.dataset.kind;
    const collectionName = kind === 'income' ? 'incomeSources' : 'bills';
    const itemId = button.dataset.confirm || button.dataset.history || button.dataset.editRecurring || button.dataset.toggle || button.dataset.deleteRecurring;
    const item = ctx.data[collectionName].find(source => source.id === itemId);
    if (!item) return;
    if (button.dataset.confirm) openConfirmation(ctx, kind, item);
    if (button.dataset.history) showHistory(ctx, kind, item);
    if (button.dataset.editRecurring) openRecurring(ctx, kind, item);
    if (button.dataset.toggle) {
      try {
        await ctx.update(data => { data[collectionName].find(source => source.id === item.id).active = !item.active; });
        toast(item.active ? 'Previsão desativada.' : 'Previsão ativada.');
        await ctx.render();
      } catch (error) { toast(error.message, 'error'); }
    }
    if (button.dataset.deleteRecurring && await confirmDialog('Excluir esta previsão?', `“${item.name}” será excluída. Os pagamentos já confirmados serão preservados no histórico de transações.`)) {
      try {
        await ctx.update(data => { data[collectionName] = data[collectionName].filter(source => source.id !== item.id); });
        toast('Previsão excluída. Histórico preservado.');
        await ctx.render();
      } catch (error) { toast(error.message, 'error'); }
    }
  };
}
