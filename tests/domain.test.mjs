import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmRecurring, getSummary, goalSaved, parseMoney, recurringDate, shiftMonth } from '../js/domain/finance.js';
import { exportBackup, validateBackup, validateWorkspace } from '../js/services/backup.js';
import { createDemoData } from '../js/data/demo.js';

const empty = () => ({ transactions: [], bills: [], incomeSources: [], goals: [], categories: [] });
const account = { id: 'account-1', name: 'Ana', email: 'ana@example.com', password: { salt: 'private', hash: 'private' }, theme: 'dark', onboardingComplete: true };
const bill = { id: 'bill-1', name: 'Aluguel', amount: 130000, day: 31, category: 'Moradia', group: 'essential', active: true, startMonth: '2026-01' };
const source = { id: 'source-1', name: 'Salário', amount: 500000, day: 5, frequency: 'monthly', active: true, startMonth: '2026-01' };

test('valores monetários são convertidos em centavos sem arredondamento binário', () => {
  assert.equal(parseMoney('1.250,50'), 125050);
  assert.equal(parseMoney('1250.50'), 125050);
  assert.equal(parseMoney('0,29'), 29);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney('R$ 100,01'), 10001);
  for (const invalid of ['-1', '1,001', '1.234', '12.34,50', 'NaN', 'Infinity', '1e5', '', '2,']) assert.throws(() => parseMoney(invalid));
});

test('vencimentos ajustam dias 29 a 31 ao último dia do mês sem desvio de fuso', () => {
  assert.equal(recurringDate('2026-02', 31), '2026-02-28');
  assert.equal(recurringDate('2028-02', 31), '2028-02-29');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.throws(() => recurringDate('2026-13', 1));
  assert.throws(() => recurringDate('2026-10', 0));
});

test('previsões não afetam o saldo realizado e respeitam início e ativação', () => {
  const data = empty();
  data.bills.push({ ...bill });
  data.incomeSources.push({ ...source });
  assert.deepEqual(getSummary(data, '2026-02'), { balance: 0, income: 0, expense: 0, forecastIncome: 500000, forecastExpense: 130000, forecastBalance: 370000, reserved: 0, available: 0, activeGoals: 0 });
  assert.equal(getSummary(data, '2025-12').forecastExpense, 0);
  data.bills[0].active = false;
  assert.equal(getSummary(data, '2026-02').forecastExpense, 0);
});

test('pagamento mensal é idempotente; competência não altera o mês do movimento', () => {
  const data = empty();
  data.bills.push({ ...bill });
  const first = confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-02');
  const duplicate = confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-03');
  assert.equal(first.id, duplicate.id);
  assert.equal(data.transactions.length, 1);
  assert.equal(getSummary(data, '2026-02').expense, 0);
  assert.equal(getSummary(data, '2026-03').expense, bill.amount);
  confirmRecurring(data, 'bill', bill.id, '2026-03', '2026-03-31');
  assert.equal(data.transactions.length, 2);
  assert.throws(() => confirmRecurring(data, 'bill', bill.id, '2026-04', '2026-02-31'));
});

test('renda pontual não se repete em outro mês; receita prevista requer confirmação', () => {
  const data = empty();
  data.incomeSources.push({ ...source, frequency: 'once', date: '2026-02-05' });
  assert.equal(getSummary(data, '2026-03').forecastIncome, 0);
  assert.throws(() => confirmRecurring(data, 'income', source.id, '2026-03', '2026-03-05'));
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  confirmRecurring(data, 'income', source.id, '2026-03', '2026-03-05');
  assert.equal(data.transactions.length, 1);
  assert.equal(getSummary(data, '2026-02').income, source.amount);
});

test('contribuições e retiradas de metas são alocações e não despesas de consumo', () => {
  const data = empty();
  data.incomeSources.push({ ...source });
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  data.goals.push({ id: 'goal-1', title: 'Reserva', target: 100000, initialAmount: 10000, targetDate: '', contributions: [{ id: 'contribution-1', amount: 30000, date: '2026-02-06', note: '' }, { id: 'contribution-2', amount: -5000, date: '2026-02-07', note: '' }] });
  assert.equal(goalSaved(data.goals[0]), 35000);
  const summary = getSummary(data, '2026-02');
  assert.equal(summary.balance, 500000);
  assert.equal(summary.expense, 0);
  assert.equal(summary.reserved, 35000);
  assert.equal(summary.available, 465000);
});

test('backup preserva dados sem incluir e-mail, sessão ou credenciais', () => {
  const data = empty();
  data.bills.push({ ...bill });
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-28');
  const exported = exportBackup(account, data);
  assert.ok(!exported.includes('private'));
  assert.ok(!exported.includes('ana@example.com'));
  const imported = validateBackup(exported);
  assert.deepEqual(imported.data, data);
  assert.deepEqual(imported.profile, { name: 'Ana', theme: 'dark', onboardingComplete: true });
});

test('backup rejeita centavos inválidos, campos inesperados e pagamentos duplicados', () => {
  const data = empty();
  data.bills.push({ ...bill });
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-28');
  data.transactions.push({ ...data.transactions[0], id: 'transaction-2' });
  assert.throws(() => validateWorkspace(data), /duplicados/);
  data.transactions.pop();
  data.transactions[0].amount = 10.5;
  assert.throws(() => validateWorkspace(data), /Valor/);
  data.transactions[0].amount = 100;
  data.transactions[0].evil = true;
  assert.throws(() => validateWorkspace(data), /campo não permitido/);
  assert.throws(() => validateBackup('{"__proto__":{"polluted":true}}'), /campo não permitido/);
  assert.equal({}.polluted, undefined);
  assert.throws(() => validateBackup('x'.repeat(5 * 1024 * 1024 + 1)), /5 MB/);
});

test('backup rejeita saldos reservados negativos e datas impossíveis', () => {
  const data = empty();
  data.goals.push({ id: 'goal-1', title: 'Reserva', target: 10000, initialAmount: 0, contributions: [{ id: 'contribution-1', amount: -1, date: '2026-02-01', note: '' }] });
  assert.throws(() => validateWorkspace(data), /retiradas/);
  data.goals[0].contributions[0].amount = 100;
  data.goals[0].contributions[0].date = '2026-02-30';
  assert.throws(() => validateWorkspace(data), /data válida/);
});

test('movimentações futuras não podem aumentar nem reduzir o saldo realizado', () => {
  const data = empty();
  data.incomeSources.push({ ...source });
  assert.throws(() => confirmRecurring(data, 'income', source.id, '9999-01', '9999-01-05'), /data anterior/);
  data.transactions.push({ id: 'future-1', type: 'income', description: 'Receita futura', amount: 100, date: '9999-01-05', category: 'Outros', paymentMethod: '', notes: '' });
  assert.throws(() => validateWorkspace(data), /data futura/);
});

test('demonstração isolada gera dados consistentes e pode ser exportada e restaurada', () => {
  const firstDemo = createDemoData();
  const secondDemo = createDemoData();
  assert.ok(firstDemo.transactions.length > 0);
  assert.notEqual(firstDemo.incomeSources[0].id, secondDemo.incomeSources[0].id);
  assert.equal(validateBackup(exportBackup(account, firstDemo)).data.transactions.length, firstDemo.transactions.length);
  assert.equal(new Set(firstDemo.transactions.map(transaction => transaction.id)).size, firstDemo.transactions.length);
});
