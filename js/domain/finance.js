import { MAX_MONEY, requireDate, requireDay, requireMonth, requireMoney } from './validation.js';

export const DEFAULT_CATEGORIES = {
  expense: ['Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Contas Fixas', 'Outros'],
  income: ['Salário', 'Aluguel Recebido', 'Freelance', 'Renda Extra', 'Investimentos', 'Outros'],
};

export function uid() {
  return globalThis.crypto.randomUUID();
}

export function formatMoney(value = 0) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
}

export function parseMoney(value) {
  const input = String(value ?? '').trim().replace(/^R\$\s*/, '');
  if (!input || /[^\d.,]/.test(input)) throw new Error('Informe um valor válido, sem sinal negativo.');
  let normalized = input;
  if (input.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(input)) throw new Error('Use no máximo duas casas decimais.');
    normalized = input.replaceAll('.', '').replace(',', '.');
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(input)) {
    throw new Error('Informe um valor válido, por exemplo 1250,50.');
  }
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > MAX_MONEY) throw new Error('O valor informado é muito alto.');
  return cents;
}

export function dateISO(date = new Date()) {
  if (typeof date === 'string') return requireDate(date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function monthKey(date = new Date()) {
  return typeof date === 'string' ? requireMonth(date.slice(0, 7)) : dateISO(date).slice(0, 7);
}

export function recentDateRange(days, end = dateISO()) {
  requireDate(end);
  if (!Number.isSafeInteger(days) || days < 1) throw new Error('Informe uma quantidade positiva de dias.');
  const start = new Date(`${end}T12:00:00`);
  start.setDate(start.getDate() - days + 1);
  return { from: requireDate(dateISO(start)), to: end };
}

export function shiftMonth(month, offset) {
  requireMonth(month);
  if (!Number.isInteger(offset)) throw new Error('O deslocamento deve ser um número inteiro de meses.');
  const [year, monthNumber] = month.split('-').map(Number);
  return monthKey(new Date(year, monthNumber - 1 + offset, 1, 12));
}

export function formatDate(value) {
  if (!value) return 'Sem prazo';
  requireDate(value);
  return value.split('-').reverse().join('/');
}

export function recurringDate(month, day) {
  requireMonth(month);
  requireDay(day);
  const [year, monthNumber] = month.split('-').map(Number);
  const finalDay = Math.min(day, new Date(year, monthNumber, 0).getDate());
  return `${month}-${String(finalDay).padStart(2, '0')}`;
}

export function goalSaved(goal) {
  return (goal.initialAmount || 0) + (goal.contributions || []).reduce((total, contribution) => total + contribution.amount, 0);
}

export function recordGoalMovement(data, goalId, amount, date = dateISO(), note = '') {
  if (!Number.isSafeInteger(amount)) throw new Error('Informe um valor monetário válido.');
  requireMoney(Math.abs(amount));
  requireDate(date);
  if (date > dateISO()) throw new Error('Informe uma data até hoje.');
  const goal = data.goals.find(item => item.id === goalId);
  if (!goal) throw new Error('Esta meta não está mais disponível.');
  if (amount < 0 && -amount > goalSaved(goal)) throw new Error(`Você só pode retirar até ${formatMoney(goalSaved(goal))} desta meta.`);
  const movement = { id: uid(), amount, date, note: String(note).trim() };
  goal.contributions.push(movement);
  return movement;
}

export function categoriesFor(data, type) {
  return [...new Set([...(DEFAULT_CATEGORIES[type] || []), ...(data.categories || []).filter(category => category.type === type).map(category => category.name)])];
}

export function isRecurringApplicable(item, month) {
  return item.active !== false && (!item.startMonth || item.startMonth <= month) && (item.frequency !== 'once' || item.date?.slice(0, 7) === month);
}

export function isOccurrencePaid(data, kind, id, month) {
  const source = kind === 'income' ? data.incomeSources.find(item => item.id === id) : null;
  return data.transactions.some(transaction => transaction.recurringKind === kind && transaction.recurringId === id && (source?.frequency === 'once' || transaction.referenceMonth === month));
}

export function confirmRecurring(data, kind, id, month, date = dateISO(), amount) {
  requireMonth(month);
  requireDate(date);
  if (date > dateISO()) throw new Error('A data efetiva deve ser hoje ou uma data anterior.');
  if (!['bill', 'income'].includes(kind)) throw new Error('Tipo de recorrência inválido.');
  const item = (kind === 'bill' ? data.bills : data.incomeSources).find(record => record.id === id);
  if (!item) throw new Error('Este cadastro recorrente não foi encontrado.');
  requireMoney(item.amount);
  const effectiveAmount = requireMoney(amount === undefined ? item.amount : amount, kind === 'bill' ? 'Valor pago' : 'Valor recebido');
  const existing = data.transactions.find(transaction => transaction.recurringKind === kind && transaction.recurringId === id && (item.frequency === 'once' || transaction.referenceMonth === month));
  if (existing) return existing;
  if (!isRecurringApplicable(item, month)) throw new Error('Este cadastro não está ativo no mês selecionado.');
  const transaction = {
    id: uid(),
    type: kind === 'bill' ? 'expense' : 'income',
    description: item.name,
    amount: effectiveAmount,
    date,
    category: item.category || (kind === 'bill' ? 'Contas Fixas' : 'Outros'),
    paymentMethod: '',
    notes: `Referência: ${month.split('-').reverse().join('/')}`,
    recurringId: id,
    recurringKind: kind,
    referenceMonth: month,
  };
  data.transactions.push(transaction);
  return transaction;
}

export function undoRecurring(data, kind, id, month) {
  requireMonth(month);
  if (!['bill', 'income'].includes(kind)) throw new Error('Tipo de recorrência inválido.');
  const source = kind === 'income' ? data.incomeSources.find(item => item.id === id) : null;
  data.transactions = data.transactions.filter(transaction => !(transaction.recurringKind === kind && transaction.recurringId === id && (source?.frequency === 'once' || transaction.referenceMonth === month)));
}

export function getSummary(data, month = monthKey()) {
  requireMonth(month);
  const monthly = data.transactions.filter(transaction => transaction.date.slice(0, 7) === month);
  const income = monthly.filter(transaction => transaction.type === 'income').reduce((total, transaction) => total + transaction.amount, 0);
  const expense = monthly.filter(transaction => transaction.type === 'expense').reduce((total, transaction) => total + transaction.amount, 0);
  const balance = data.transactions.reduce((total, transaction) => total + (transaction.type === 'income' ? transaction.amount : -transaction.amount), 0);
  const forecastIncome = data.incomeSources.filter(item => isRecurringApplicable(item, month)).reduce((total, item) => total + item.amount, 0);
  const forecastExpense = data.bills.filter(item => isRecurringApplicable(item, month)).reduce((total, item) => total + item.amount, 0);
  const reserved = data.goals.reduce((total, goal) => total + goalSaved(goal), 0);
  return { balance, income, expense, forecastIncome, forecastExpense, forecastBalance: forecastIncome - forecastExpense, reserved, activeGoals: data.goals.filter(goal => goalSaved(goal) < goal.target).length };
}

export function getMonthlySeries(data, month = monthKey(), count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const referenceMonth = shiftMonth(month, index - count + 1);
    const summary = getSummary(data, referenceMonth);
    return { month: referenceMonth, income: summary.income, expense: summary.expense };
  });
}

export function getPeriodSeries(data, from, to, count = 6) {
  requireDate(from);
  requireDate(to);
  if (from > to || !Number.isSafeInteger(count) || count < 1) throw new Error('Informe um período e uma quantidade de intervalos válidos.');
  const dayMilliseconds = 86400000;
  const start = Date.parse(from);
  const days = (Date.parse(to) - start) / dayMilliseconds + 1;
  const intervalDays = Math.ceil(days / count);
  return Array.from({ length: Math.ceil(days / intervalDays) }, (_, index) => {
    const firstDay = new Date(start + index * intervalDays * dayMilliseconds).toISOString().slice(0, 10);
    const lastDay = new Date(Math.min(Date.parse(to), start + ((index + 1) * intervalDays - 1) * dayMilliseconds)).toISOString().slice(0, 10);
    const transactions = data.transactions.filter(transaction => transaction.date >= firstDay && transaction.date <= lastDay);
    return {
      from: firstDay,
      to: lastDay,
      income: transactions.filter(transaction => transaction.type === 'income').reduce((total, transaction) => total + transaction.amount, 0),
      expense: transactions.filter(transaction => transaction.type === 'expense').reduce((total, transaction) => total + transaction.amount, 0),
    };
  });
}

export function expenseByCategory(data, from = '', to = '9999-12-31') {
  return data.transactions.filter(transaction => transaction.type === 'expense' && transaction.date >= from && transaction.date <= to).reduce((totals, transaction) => {
    totals[transaction.category] = (totals[transaction.category] || 0) + transaction.amount;
    return totals;
  }, Object.create(null));
}
