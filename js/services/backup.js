import { dateISO, goalSaved } from '../domain/finance.js';
import { MAX_MONEY, requireDate, requireDay, requireEnum, requireMonth, requireMoney, requireText } from '../domain/validation.js';

const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 10000;
const collections = ['incomeSources', 'bills', 'transactions', 'goals', 'categories'];

function plainObject(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`${label}: objeto inválido.`);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`${label}: campo não permitido (${key}).`);
  }
}

function text(value, label, max = 200, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  return requireText(value, label, max);
}

function identifier(value) {
  const id = text(value, 'Identificador', 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador inválido no backup.');
  return id;
}

function optionalDate(value) {
  return value === undefined || value === '' ? '' : requireDate(value);
}

function recordedDate(value) {
  requireDate(value);
  if (value > dateISO()) throw new Error('Movimentações realizadas não podem ter uma data futura.');
  return value;
}

function boolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label}: use verdadeiro ou falso.`);
  return value;
}

function unique(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new Error(`${label}: há identificadores duplicados.`);
    ids.add(record.id);
  }
}

function list(value, label) {
  if (!Array.isArray(value) || value.length > MAX_RECORDS) throw new Error(`${label}: a lista deve conter no máximo ${MAX_RECORDS} registros.`);
  return value;
}

function validateIncome(item) {
  plainObject(item, ['id', 'name', 'amount', 'frequency', 'day', 'date', 'startMonth', 'active', 'category'], 'Fonte de renda');
  const source = {
    id: identifier(item.id), name: text(item.name, 'Fonte de renda'), amount: requireMoney(item.amount),
    frequency: requireEnum(item.frequency, ['monthly', 'once'], 'Frequência'),
    startMonth: requireMonth(item.startMonth), active: boolean(item.active, 'Fonte ativa'),
  };
  if (source.frequency === 'monthly') source.day = requireDay(item.day);
  else {
    source.date = requireDate(item.date);
    if (source.date.slice(0, 7) < source.startMonth) throw new Error('A data da renda pontual antecede seu mês inicial.');
    if (item.day !== undefined) source.day = requireDay(item.day);
  }
  if (item.date !== undefined && source.frequency === 'monthly') source.date = optionalDate(item.date);
  if (item.category !== undefined) source.category = text(item.category, 'Categoria', 80);
  return source;
}

function validateBill(item) {
  plainObject(item, ['id', 'name', 'amount', 'day', 'category', 'group', 'active', 'startMonth'], 'Conta recorrente');
  return {
    id: identifier(item.id), name: text(item.name, 'Conta recorrente'), amount: requireMoney(item.amount), day: requireDay(item.day),
    category: text(item.category, 'Categoria', 80), group: requireEnum(item.group, ['essential', 'subscription'], 'Grupo'),
    active: boolean(item.active, 'Conta ativa'), startMonth: requireMonth(item.startMonth),
  };
}

function validateTransaction(item) {
  plainObject(item, ['id', 'type', 'description', 'amount', 'date', 'category', 'paymentMethod', 'notes', 'recurringId', 'referenceMonth', 'recurringKind'], 'Transação');
  const transaction = {
    id: identifier(item.id), type: requireEnum(item.type, ['income', 'expense'], 'Tipo de transação'),
    description: text(item.description, 'Descrição'), amount: requireMoney(item.amount), date: recordedDate(item.date),
    category: text(item.category, 'Categoria', 80), paymentMethod: text(item.paymentMethod, 'Forma de pagamento', 100, true),
    notes: text(item.notes, 'Observações', 2000, true),
  };
  if (item.recurringId !== undefined || item.referenceMonth !== undefined || item.recurringKind !== undefined) {
    transaction.recurringId = identifier(item.recurringId);
    transaction.referenceMonth = requireMonth(item.referenceMonth);
    transaction.recurringKind = requireEnum(item.recurringKind, ['bill', 'income'], 'Tipo de recorrência');
    if ((transaction.recurringKind === 'bill' && transaction.type !== 'expense') || (transaction.recurringKind === 'income' && transaction.type !== 'income')) throw new Error('Tipo de transação incompatível com a recorrência.');
  }
  return transaction;
}

function validateGoal(item) {
  plainObject(item, ['id', 'title', 'target', 'initialAmount', 'targetDate', 'contributions'], 'Meta');
  const contributions = list(item.contributions, 'Contribuições').map(contribution => {
    plainObject(contribution, ['id', 'amount', 'date', 'note'], 'Contribuição');
    if (!Number.isSafeInteger(contribution.amount) || contribution.amount === 0 || Math.abs(contribution.amount) > MAX_MONEY) throw new Error('Contribuição: informe centavos inteiros, diferentes de zero.');
    return { id: identifier(contribution.id), amount: contribution.amount, date: recordedDate(contribution.date), note: text(contribution.note, 'Observação da meta', 2000, true) };
  });
  unique(contributions, 'Contribuições');
  const goal = {
    id: identifier(item.id), title: text(item.title, 'Título da meta'), target: requireMoney(item.target),
    initialAmount: requireMoney(item.initialAmount, 'Valor inicial da meta', true), targetDate: optionalDate(item.targetDate), contributions,
  };
  let runningAmount = goal.initialAmount;
  for (const contribution of contributions) {
    runningAmount += contribution.amount;
    if (!Number.isSafeInteger(runningAmount) || runningAmount < 0) throw new Error('As retiradas de uma meta não podem superar o valor reservado.');
  }
  return goal;
}

function validateCategory(item) {
  plainObject(item, ['id', 'name', 'type'], 'Categoria');
  return { id: identifier(item.id), name: text(item.name, 'Categoria', 80), type: requireEnum(item.type, ['income', 'expense'], 'Tipo de categoria') };
}

export function validateWorkspace(value) {
  plainObject(value, collections, 'Dados financeiros');
  const validators = { incomeSources: validateIncome, bills: validateBill, transactions: validateTransaction, goals: validateGoal, categories: validateCategory };
  const data = Object.fromEntries(collections.map(key => [key, list(value[key], key).map(validators[key])]));
  for (const key of collections) unique(data[key], key);
  const occurrences = new Set();
  for (const transaction of data.transactions) {
    if (!transaction.recurringId) continue;
    const source = transaction.recurringKind === 'income' ? data.incomeSources.find(item => item.id === transaction.recurringId) : data.bills.find(item => item.id === transaction.recurringId);
    if (source?.frequency === 'once' && transaction.referenceMonth !== source.date.slice(0, 7)) throw new Error('O mês de referência de uma renda pontual deve corresponder à data prevista.');
    const key = `${transaction.recurringKind}:${transaction.recurringId}:${source?.frequency === 'once' ? 'once' : transaction.referenceMonth}`;
    if (occurrences.has(key)) throw new Error('O backup possui pagamentos ou recebimentos recorrentes duplicados.');
    occurrences.add(key);
  }
  const amountTotal = data.transactions.reduce((total, item) => total + item.amount, 0)
    + data.incomeSources.reduce((total, item) => total + item.amount, 0)
    + data.bills.reduce((total, item) => total + item.amount, 0)
    + data.goals.reduce((total, item) => total + goalSaved(item) + item.target, 0);
  if (!Number.isSafeInteger(amountTotal)) throw new Error('O total dos valores do backup excede a precisão monetária permitida.');
  const categoryNames = new Set();
  for (const category of data.categories) {
    const key = `${category.type}:${category.name.toLocaleLowerCase('pt-BR')}`;
    if (categoryNames.has(key)) throw new Error('O backup possui categorias personalizadas repetidas.');
    categoryNames.add(key);
  }
  return data;
}

function validateProfile(value) {
  plainObject(value, ['name', 'theme', 'onboardingComplete'], 'Perfil');
  return { name: text(value.name, 'Nome', 80), theme: requireEnum(value.theme, ['dark', 'light'], 'Tema'), onboardingComplete: boolean(value.onboardingComplete, 'Primeiro acesso concluído') };
}

export function exportBackup(account, data) {
  const profile = validateProfile({ name: account.name, theme: account.theme, onboardingComplete: account.onboardingComplete });
  const exported = JSON.stringify({ format: 'wallet-plus', version: 1, exportedAt: new Date().toISOString(), profile, data: validateWorkspace(data) }, null, 2);
  if (new TextEncoder().encode(exported).length > MAX_BACKUP_BYTES) throw new Error('O backup excede o limite de 5 MB desta versão. Exporte também o histórico em CSV.');
  return exported;
}

export function validateBackup(input) {
  if (typeof input !== 'string' || new TextEncoder().encode(input).length > MAX_BACKUP_BYTES) throw new Error('Selecione um backup JSON de até 5 MB.');
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new Error('O arquivo não contém JSON válido. Selecione um backup exportado pelo Wallet+.');
  }
  plainObject(parsed, ['format', 'version', 'exportedAt', 'profile', 'data'], 'Backup');
  if (!['wallet-plus', 'walet-plus'].includes(parsed.format) || parsed.version !== 1) throw new Error('Formato ou versão de backup incompatível com o Wallet+.');
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) throw new Error('O backup não possui uma data de exportação válida.');
  return { data: validateWorkspace(parsed.data), profile: validateProfile(parsed.profile) };
}
