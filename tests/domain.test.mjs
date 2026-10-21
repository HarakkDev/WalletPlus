import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmRecurring, undoRecurring, isOccurrencePaid, getSummary, getPeriodSeries, goalSaved, recordGoalMovement, parseMoney, recurringDate, recentDateRange, shiftMonth } from '../js/domain/finance.js';
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

test('períodos de 30 e 90 dias incluem hoje e atravessam meses, anos e fevereiro bissexto', () => {
  assert.deepEqual(recentDateRange(30, '2026-01-10'), { from: '2025-12-12', to: '2026-01-10' });
  assert.deepEqual(recentDateRange(90, '2026-01-01'), { from: '2025-10-04', to: '2026-01-01' });
  assert.deepEqual(recentDateRange(30, '2028-03-01'), { from: '2028-02-01', to: '2028-03-01' });
  assert.deepEqual(recentDateRange(30, '2026-03-01'), { from: '2026-01-31', to: '2026-03-01' });
  assert.deepEqual(recentDateRange(30, '2026-11-02'), { from: '2026-10-04', to: '2026-11-02' });
  assert.deepEqual(recentDateRange(1, '2026-10-21'), { from: '2026-10-21', to: '2026-10-21' });
  for (const days of [30, 90]) {
    const range = recentDateRange(days, '2026-10-21');
    assert.equal((Date.parse(range.to) - Date.parse(range.from)) / 86400000 + 1, days);
  }
  for (const days of [0, -1, 1.5, Infinity]) assert.throws(() => recentDateRange(days, '2026-10-21'));
  assert.throws(() => recentDateRange(30, '2026-02-30'));
  assert.throws(() => recentDateRange(30, '1900-01-01'));
});

test('fluxo por período agrupa datas sem duplicar centavos nem incluir lançamentos externos', () => {
  const data = empty();
  data.transactions = [
    {date: '2026-09-21', type: 'income', amount: 99999},
    {date: '2026-09-22', type: 'income', amount: 101},
    {date: '2026-10-01', type: 'income', amount: 302},
    {date: '2026-10-21', type: 'expense', amount: 203},
    {date: '2026-10-22', type: 'expense', amount: 99999},
  ];
  const series = getPeriodSeries(data, '2026-09-22', '2026-10-21');
  assert.equal(series.length, 6);
  assert.equal(series[0].from, '2026-09-22');
  assert.equal(series.at(-1).to, '2026-10-21');
  assert.equal(series.reduce((total, interval) => total + interval.income, 0), 403);
  assert.equal(series.reduce((total, interval) => total + interval.expense, 0), 203);
  for (let index = 1; index < series.length; index += 1) assert.equal(Date.parse(series[index].from) - Date.parse(series[index - 1].to), 86400000);
  const leap = getPeriodSeries(empty(), '2028-02-28', '2028-03-01');
  assert.deepEqual(leap.map(interval => interval.from), ['2028-02-28', '2028-02-29', '2028-03-01']);
  assert(leap.every(interval => interval.income === 0 && interval.expense === 0));
  assert.throws(() => getPeriodSeries(data, '2026-10-21', '2026-09-22'));
  assert.throws(() => getPeriodSeries(data, '2026-02-30', '2026-03-01'));
  assert.throws(() => getPeriodSeries(data, '2026-10-01', '2026-10-21', 0));
});

test('previsões não afetam o saldo realizado e respeitam início e ativação', () => {
  const data = empty();
  data.bills.push({ ...bill });
  data.incomeSources.push({ ...source });
  assert.deepEqual(getSummary(data, '2026-02'), { balance: 0, income: 0, expense: 0, forecastIncome: 500000, forecastExpense: 130000, forecastBalance: 370000, reserved: 0, activeGoals: 0 });
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

test('confirmação usa valor e data reais sem alterar previsão, outras competências ou metas', () => {
  const data = empty();
  data.bills.push({ ...bill });
  data.incomeSources.push({ ...source });
  data.goals.push({ id: 'goal-1', title: 'Viagem', target: 500000, initialAmount: 497000, contributions: [] });
  const goals = structuredClone(data.goals);
  const previous = confirmRecurring(data, 'bill', bill.id, '2026-01', '2026-01-31');
  const payment = confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-02', 125050);
  const receipt = confirmRecurring(data, 'income', source.id, '2026-02', '2026-03-03', 450025);
  assert.equal(payment.amount, 125050);
  assert.equal(receipt.amount, 450025);
  assert.equal(payment.referenceMonth, '2026-02');
  assert.equal(data.bills[0].amount, bill.amount);
  assert.equal(data.incomeSources[0].amount, source.amount);
  assert.equal(previous.amount, bill.amount);
  assert.equal(getSummary(data, '2026-02').income, 0);
  assert.equal(getSummary(data, '2026-02').expense, 0);
  assert.equal(getSummary(data, '2026-02').forecastExpense, bill.amount);
  assert.equal(getSummary(data, '2026-02').forecastIncome, source.amount);
  assert.equal(getSummary(data, '2026-03').expense, 125050);
  assert.equal(getSummary(data, '2026-03').income, 450025);
  assert.equal(getSummary(data).balance, 194975);
  assert.equal(getSummary(data).reserved, 497000);
  assert.deepEqual(data.goals, goals);
  const restored = validateWorkspace(data);
  assert.equal(restored.transactions.find(transaction => transaction.id === payment.id).amount, 125050);
  undoRecurring(data, 'bill', bill.id, '2026-02');
  assert.deepEqual(data.transactions.map(transaction => transaction.id), [previous.id, receipt.id]);
  assert.equal(getSummary(data).balance, 320025);
  assert.deepEqual(data.goals, goals);
});

test('confirmação rejeita valores inválidos sem modificar dados e duplicadas preservam o lançamento existente', () => {
  const data = empty();
  data.bills.push({ ...bill });
  data.incomeSources.push({ ...source });
  const original = structuredClone(data);
  for (const kind of ['bill', 'income']) {
    const identifier = kind === 'bill' ? bill.id : source.id;
    for (const amount of [0, -1, 1.5, NaN, Infinity, '100', null, 1_000_000_000_001, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => confirmRecurring(data, kind, identifier, '2026-02', '2026-02-05', amount), /Valor/);
      assert.deepEqual(data, original);
    }
  }
  assert.throws(() => confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-30', 150000));
  assert.throws(() => confirmRecurring(data, 'bill', bill.id, '2026-02', '9999-01-01', 150000));
  assert.deepEqual(data, original);
  const payment = confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-06', 120000);
  const snapshot = structuredClone(data);
  const repeated = confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-07', 140000);
  assert.equal(repeated, payment);
  assert.deepEqual(data, snapshot);
  assert.throws(() => confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-07', -1));
  assert.deepEqual(data, snapshot);
  data.incomeSources[0].frequency = 'once';
  data.incomeSources[0].date = '2026-02-05';
  const receipt = confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-07', 490025);
  const repeatedReceipt = confirmRecurring(data, 'income', source.id, '2026-03', '2026-03-05', 510000);
  assert.equal(repeatedReceipt, receipt);
  assert.equal(receipt.amount, 490025);
  assert.equal(data.transactions.length, 2);
});

test('desfazer pagamento preserva outros meses e permite pagar novamente sem duplicar', () => {
  const data = empty();
  data.bills.push({ ...bill }, { ...bill, id: 'bill-2' });
  const previous = confirmRecurring(data, 'bill', bill.id, '2026-01', '2026-01-31');
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-02');
  const other = confirmRecurring(data, 'bill', 'bill-2', '2026-02', '2026-02-28');
  undoRecurring(data, 'bill', bill.id, '2026-02');
  assert.deepEqual(data.transactions.map(transaction => transaction.id), [previous.id, other.id]);
  assert.equal(isOccurrencePaid(data, 'bill', bill.id, '2026-02'), false);
  assert.equal(getSummary(data, '2026-03').expense, 0);
  assert.equal(getSummary(data, '2026-02').forecastExpense, bill.amount * 2);
  undoRecurring(data, 'bill', bill.id, '2026-02');
  assert.equal(data.transactions.length, 2);
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-03');
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-03-03');
  assert.equal(data.transactions.length, 3);
  assert.equal(getSummary(data, '2026-03').expense, bill.amount);
});

test('desfazer recebimentos respeita tipo, mês e receitas pontuais já deslocadas', () => {
  const data = empty();
  data.bills.push({ ...bill, id: source.id });
  data.incomeSources.push({ ...source });
  confirmRecurring(data, 'bill', source.id, '2026-02', '2026-02-28');
  confirmRecurring(data, 'income', source.id, '2026-01', '2026-01-05');
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  undoRecurring(data, 'income', source.id, '2026-02');
  assert.equal(getSummary(data, '2026-02').income, 0);
  assert.equal(getSummary(data, '2026-01').income, source.amount);
  assert.equal(isOccurrencePaid(data, 'bill', source.id, '2026-02'), true);
  data.incomeSources[0].frequency = 'once';
  data.incomeSources[0].date = '2026-02-05';
  undoRecurring(data, 'income', source.id, '2026-02');
  assert.equal(isOccurrencePaid(data, 'income', source.id, '2026-02'), false);
  assert.equal(data.transactions.length, 1);
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  assert.equal(getSummary(data, '2026-02').income, source.amount);
  assert.throws(() => undoRecurring(data, 'invalid', source.id, '2026-02'));
  assert.throws(() => undoRecurring(data, 'income', source.id, '2026-13'));
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

test('valores de metas não entram no saldo, nas receitas ou nas despesas', () => {
  const data = empty();
  data.incomeSources.push({ ...source });
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  data.goals.push({ id: 'goal-1', title: 'Reserva', target: 100000, initialAmount: 10000, targetDate: '', contributions: [{ id: 'contribution-1', amount: 30000, date: '2026-02-06', note: '' }, { id: 'contribution-2', amount: -5000, date: '2026-02-07', note: '' }] });
  assert.equal(goalSaved(data.goals[0]), 35000);
  const summary = getSummary(data, '2026-02');
  assert.equal(summary.balance, 500000);
  assert.equal(summary.income, 500000);
  assert.equal(summary.expense, 0);
  assert.equal(summary.reserved, 35000);
});

test('guardar, retirar, editar e excluir metas não alteram o saldo nem criam transações', () => {
  const data = empty();
  data.transactions.push({id: 'income', type: 'income', amount: 100000, date: '2026-01-01'}, {id: 'expense', type: 'expense', amount: 20000, date: '2026-01-02'});
  data.goals.push({id: 'first', target: 100000, initialAmount: 0, contributions: []}, {id: 'second', target: 100000, initialAmount: 0, contributions: []});
  const transactions = structuredClone(data.transactions);
  recordGoalMovement(data, 'first', 30000, '2026-01-03');
  assert.equal(getSummary(data).balance, 80000);
  assert.equal(getSummary(data).reserved, 30000);
  recordGoalMovement(data, 'second', 40000, '2026-01-04');
  assert.equal(getSummary(data).balance, 80000);
  assert.equal(getSummary(data).reserved, 70000);
  recordGoalMovement(data, 'first', -10000, '2026-01-05');
  assert.equal(getSummary(data).balance, 80000);
  assert.equal(getSummary(data).reserved, 60000);
  data.goals[1].initialAmount = 90000;
  assert.equal(getSummary(data).balance, 80000);
  assert.equal(getSummary(data).reserved, 150000);
  data.goals = data.goals.filter(goal => goal.id !== 'second');
  assert.equal(getSummary(data).balance, 80000);
  assert.equal(getSummary(data).reserved, 20000);
  assert.deepEqual(data.transactions, transactions);
});

test('metas independem do Extrato, mas rejeitam retiradas excessivas, datas e valores inválidos', () => {
  const data = empty();
  data.goals.push({id: 'first', target: 10000, initialAmount: 0, contributions: []}, {id: 'second', target: 10000, initialAmount: 0, contributions: []});
  recordGoalMovement(data, 'first', 9000, '2026-01-02');
  recordGoalMovement(data, 'second', 10000, '2026-01-03');
  assert.equal(getSummary(data).balance, 0);
  assert.equal(getSummary(data).reserved, 19000);
  assert.equal(data.transactions.length, 0);
  const snapshot = structuredClone(data);
  assert.throws(() => recordGoalMovement(data, 'first', -9001, '2026-01-03'), /retirar/);
  assert.throws(() => recordGoalMovement(data, 'missing', 1, '2026-01-03'), /disponível/);
  assert.throws(() => recordGoalMovement(data, 'first', 1, '9999-01-01'), /até hoje/);
  for (const amount of [0, 1.5, NaN, Infinity, '100']) assert.throws(() => recordGoalMovement(data, 'first', amount, '2026-01-03'));
  assert.deepEqual(data, snapshot);
});

test('R$ 4.500 de entradas e R$ 5.220 de saídas resultam em menos R$ 720, independentemente das metas', () => {
  const data = empty();
  data.incomeSources.push({ ...source, amount: 450000 });
  data.bills.push({ ...bill, amount: 522000 });
  confirmRecurring(data, 'income', source.id, '2026-02', '2026-02-05');
  confirmRecurring(data, 'bill', bill.id, '2026-02', '2026-02-28');
  data.goals.push({ id: 'goal-1', title: 'Reserva', target: 600000, initialAmount: 497000, targetDate: '', contributions: [] });
  const summary = getSummary(data, '2026-02');
  assert.equal(summary.income, 450000);
  assert.equal(summary.expense, 522000);
  assert.equal(summary.balance, -72000);
  assert.equal(summary.reserved, 497000);
  const restored = validateBackup(exportBackup(account, data)).data;
  assert.equal(getSummary(restored, '2026-02').balance, -72000);
  assert.equal(getSummary(restored, '2026-02').reserved, 497000);
  const transactions = structuredClone(restored.transactions);
  recordGoalMovement(restored, 'goal-1', 1000, '2026-03-01');
  recordGoalMovement(restored, 'goal-1', -500, '2026-03-02');
  assert.equal(getSummary(restored, '2026-02').balance, -72000);
  assert.equal(getSummary(restored, '2026-02').reserved, 497500);
  assert.deepEqual(restored.transactions, transactions);
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
