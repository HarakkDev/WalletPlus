import { escapeHTML, icon } from './ui.js';
import { dateISO, formatDate, formatMoney, recurringDate } from '../domain/finance.js';
import { routeHref } from '../navigation.js';

export function occurrenceApplies(item, month) {
  return (!item.startMonth || item.startMonth <= month) && (item.frequency !== 'once' || (item.date?.slice(0, 7) || item.startMonth) === month);
}

export function occurrencePayment(data, kind, item, month) {
  return data.transactions.find(transaction => transaction.recurringKind === kind && transaction.recurringId === item.id && transaction.referenceMonth === month);
}

export function sortRecurringItems(items, data, kind, month) {
  const priority = item => !item.active || !occurrenceApplies(item, month) ? 2 : occurrencePayment(data, kind, item, month) ? 1 : 0;
  return [...items].sort((first, second) => priority(first) - priority(second) || first.day - second.day || first.name.localeCompare(second.name, 'pt-BR'));
}

export function renderRecurringCard(item, kind, data, month) {
  const isIncome = kind === 'income';
  const payment = occurrencePayment(data, kind, item, month);
  const applies = occurrenceApplies(item, month);
  const date = item.frequency === 'once' ? item.date : recurringDate(month, item.day);
  const overdue = applies && item.active && !payment && date < dateISO();
  const status = payment ? isIncome ? 'Recebido' : 'Pago' : !item.active ? 'Pausada' : !applies ? 'Fora deste mês' : overdue ? isIncome ? 'A receber' : 'Em atraso' : isIncome ? 'A receber' : 'A pagar';
  const name = escapeHTML(item.name);
  const reference = month.split('-').reverse().join('/');
  const category = item.category || (isIncome ? 'Outros' : 'Contas Fixas');
  const normalizedCategory = category.trim().toLocaleLowerCase('pt-BR');
  const showCategory = !['contas fixas', 'outros'].includes(normalizedCategory) && normalizedCategory !== item.name.trim().toLocaleLowerCase('pt-BR') && !(item.group === 'subscription' && normalizedCategory === 'assinaturas');
  const caption = [showCategory ? category : '', item.frequency === 'once' ? 'Pontual' : ''].filter(Boolean).map(escapeHTML).join(' · ');
  const action = payment
    ? `<button type="button" class="btn recurring-payment-toggle" data-undo="${item.id}" data-kind="${kind}" aria-pressed="true" aria-label="${isIncome ? 'Recebido. Desfazer recebimento de' : 'Pago. Desfazer pagamento de'} ${name}, referência ${reference}" title="${isIncome ? 'Desfazer recebimento' : 'Marcar como não pago'}">${icon('check')}<span>${isIncome ? 'Recebido' : 'Pago'}</span>${icon('undo')}</button>`
    : !item.active || !applies
      ? `<span class="recurring-unavailable">${!item.active ? 'Previsão pausada' : isIncome ? 'Sem recebimento previsto neste mês' : 'Sem cobrança neste mês'}</span>`
      : `<button type="button" class="btn btn-primary" data-confirm="${item.id}" data-kind="${kind}" aria-pressed="false" aria-label="${isIncome ? 'Confirmar recebimento de' : 'Marcar como pago:'} ${name}, referência ${reference}">${icon('check')}<span>${isIncome ? 'Confirmar recebimento' : 'Marcar como pago'}</span></button>`;
  const option = (attribute, label, symbol, className = '') => `<button type="button" class="recurring-option ${className}" ${attribute}="${item.id}" data-kind="${kind}">${icon(symbol)}<span>${label}</span></button>`;
  return `<article class="recurring-row ${!item.active ? 'is-inactive' : ''}" data-recurring-row="${item.id}" data-kind="${kind}">
    <span class="recurring-icon ${isIncome ? 'income' : item.group === 'subscription' ? 'subscription' : ''}">${icon(isIncome ? 'landmark' : item.group === 'subscription' ? 'repeat' : 'receipt')}</span>
    <div class="recurring-info"><h3>${name}</h3>${caption ? `<p class="recurring-category">${caption}</p>` : ''}</div>
    <div class="recurring-value"><span class="sr-only">${payment ? isIncome ? 'Valor recebido' : 'Valor pago' : 'Valor previsto'}</span><strong class="recurring-amount">${formatMoney(payment?.amount ?? item.amount)}</strong>${payment && payment.amount !== item.amount ? `<small>Previsto: ${formatMoney(item.amount)}</small>` : ''}</div>
    <div class="recurring-details"><div class="recurring-schedule"><span>${isIncome ? 'Previsão' : 'Vence'} ${formatDate(date)}</span>${!payment ? `<span class="badge ${overdue ? 'badge-danger' : ''}">${status}</span>` : ''}</div>${payment ? `<small class="recurring-payment-date">${isIncome ? 'Recebido' : 'Pago'} em ${formatDate(payment.date)}</small>` : ''}</div>
    <div class="recurring-actions">${action}<details class="recurring-menu"><summary aria-label="Opções de ${name}"><span>Opções</span>${icon('more')}</summary><div class="recurring-menu-panel">
      <p class="recurring-menu-heading">${name}</p>
      ${option('data-history', 'Ver histórico', 'payment-history')}
      ${payment ? `<a class="recurring-option" href="${escapeHTML(routeHref('transactions', { record: payment.id }))}">${icon('receipt')}<span>Ver ${isIncome ? 'recebimento' : 'pagamento'} no Extrato</span></a><a class="recurring-option" href="${escapeHTML(routeHref('transactions', { record: payment.id, edit: '1' }))}">${icon('pencil')}<span>Editar ${isIncome ? 'recebimento' : 'pagamento'}</span></a>` : ''}
      ${option('data-edit-recurring', 'Editar previsão', 'pencil')}
      ${option('data-toggle', item.active ? 'Pausar previsão' : 'Reativar previsão', item.active ? 'pause' : 'play')}
      <div class="recurring-menu-divider"></div>${option('data-delete-recurring', isIncome ? 'Excluir renda' : 'Excluir conta', 'trash-2', 'recurring-option-danger')}
    </div></details></div>
  </article>`;
}
