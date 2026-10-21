import {formatMoney, formatDate, dateISO, monthKey, recentDateRange, getPeriodSeries, getSummary, goalSaved, recurringDate, isOccurrencePaid, isRecurringApplicable} from '../domain/finance.js';
import {escapeHTML, icon, emptyState} from '../components/ui.js';
import {createChart, chartColors} from '../components/charts.js';
import {routeHref} from '../navigation.js';

let selectedPeriod = 'month';
const periodLabels = { month: 'Mês atual', last30: '30 dias', last90: '90 dias' };

function stat(kind, label, value, detail, symbol, color = '') {
  return `<article class="stat-card" data-stat="${kind}"><div class="stat-label"><span>${label}</span><span class="stat-icon ${color}">${icon(symbol)}</span></div><div class="stat-value ${color}">${value}</div><span class="stat-detail">${detail}</span></article>`;
}

function renderGoals(goals) {
  if (!goals.length) return emptyState('Seus planos merecem espaço', 'Crie uma meta e acompanhe cada passo.', '<a class="btn btn-secondary btn-small" href="#goals">Ver metas</a>');
  return goals.slice(0, 3).map(goal => {
    const saved = goalSaved(goal);
    const progress = Math.min(100, Math.floor(saved / goal.target * 100));
    return `<div class="goal-preview"><div class="goal-preview-heading"><strong>${escapeHTML(goal.title)}</strong><span class="purple">${progress}%</span></div><div class="progress" role="progressbar" aria-label="${escapeHTML(goal.title)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div><div class="goal-preview-values"><span>${formatMoney(saved)}</span><span>de ${formatMoney(goal.target)}</span></div></div>`;
  }).join('');
}

export async function render(container, context) {
  const {data, account} = context;
  const currentMonth = monthKey();
  const range = selectedPeriod === 'month' ? {from: `${currentMonth}-01`, to: dateISO()} : recentDateRange(selectedPeriod === 'last30' ? 30 : 90);
  const periodTransactions = data.transactions.filter(transaction => transaction.date >= range.from && transaction.date <= range.to);
  const summary = {
    ...getSummary(data, currentMonth),
    income: periodTransactions.filter(transaction => transaction.type === 'income').reduce((total, transaction) => total + transaction.amount, 0),
    expense: periodTransactions.filter(transaction => transaction.type === 'expense').reduce((total, transaction) => total + transaction.amount, 0),
  };
  const periodLabel = periodLabels[selectedPeriod];
  const periodScope = selectedPeriod === 'month' ? 'Neste mês' : `Últimos ${selectedPeriod === 'last30' ? 30 : 90} dias`;
  const statementParams = {...range, period: selectedPeriod};
  const statementHref = escapeHTML(routeHref('transactions', statementParams));
  const billsHref = escapeHTML(routeHref('bills', {kind: 'bill', month: currentMonth}));
  const recent = [...periodTransactions].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 5);
  const spending = new Map();
  periodTransactions.filter(transaction => transaction.type === 'expense').forEach(transaction => spending.set(transaction.category, (spending.get(transaction.category) || 0) + transaction.amount));
  const monthBills = data.bills.filter(bill => isRecurringApplicable(bill, currentMonth));
  const due = monthBills.filter(bill => !isOccurrencePaid(data, 'bill', bill.id, currentMonth)).map(bill => ({...bill, dueDate: recurringDate(currentMonth, bill.day)})).sort((first, second) => first.dueDate.localeCompare(second.dueDate)).slice(0, 4);
  container.innerHTML = `<div class="dashboard-page"><header class="page-header dashboard-page-header"><div><h1>Olá, ${escapeHTML(account.name.split(' ')[0])}<span class="positive">!</span></h1><p class="dashboard-greeting-message">Vamos cuidar das suas finanças?</p></div></header><div class="dashboard-overview-toolbar"><label><span>Período das entradas e saídas</span><select class="dashboard-period-picker" id="dashboard-period" aria-label="Período das entradas e saídas">${Object.entries(periodLabels).map(([value, label]) => `<option value="${value}" ${value === selectedPeriod ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><section class="stats-grid" aria-label="Resumo financeiro">${stat('balance', 'Saldo acumulado', formatMoney(summary.balance), 'Todo o histórico', 'wallet', summary.balance < 0 ? 'negative' : '')}${stat('goals', 'Metas', formatMoney(summary.reserved), 'Controle separado', 'target', 'purple')}${stat('income', 'Entradas recebidas', formatMoney(summary.income), periodScope, 'arrowDown', 'blue')}${stat('expense', 'Saídas pagas', formatMoney(summary.expense), periodScope, 'arrowUp', 'negative')}</section><details class="dashboard-summary-help"><summary>${icon('info')} Sobre os valores ${icon('chevronRight')}</summary><div><p><strong>Saldo acumulado:</strong> entradas recebidas menos saídas pagas de todo o Extrato. Ele não muda ao trocar o período.</p><p><strong>Entradas e saídas:</strong> apenas os valores realizados no intervalo escolhido. Previsões e pendências ficam em Contas fixas.</p><p><strong>Metas:</strong> um controle independente. Guardar e retirar não alteram o saldo nem criam receitas ou despesas.</p></div></details><div class="dashboard-chart-grid"><section class="panel"><div class="panel-header"><div><h2>Fluxo financeiro</h2><p>Entradas e saídas realizadas no período</p></div><span class="chart-period">${periodLabel}</span></div><div class="chart-container"><canvas id="cashflow-chart" role="img" aria-label="Gráfico de receitas e despesas no período selecionado"></canvas></div><div class="chart-legend"><span><i></i>Entradas</span><span><i class="expense-dot"></i>Saídas</span></div></section><section class="panel"><div class="panel-header"><div><h2>Para onde vai seu dinheiro?</h2><p>Gastos por categoria · ${escapeHTML(periodLabel)}</p></div></div>${spending.size ? '<div class="chart-container"><canvas id="category-chart" role="img" aria-label="Distribuição das despesas realizadas por categoria"></canvas></div>' : emptyState('Sem despesas no período', 'Os gastos registrados neste intervalo aparecerão aqui.')}</section></div><div class="dashboard-bottom-grid"><section class="panel dashboard-transactions"><div class="panel-header"><div><h2>Últimas transações</h2><p>As movimentações mais recentes do período</p></div><a href="${statementHref}">Ver todas ${icon('chevronRight')}</a></div>${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Descrição</th><th class="category-cell">Categoria</th><th>Valor</th></tr></thead><tbody>${recent.map(transaction => `<tr><td><div class="transaction-description"><span class="transaction-symbol ${transaction.type}">${icon(transaction.type === 'income' ? 'arrowDown' : 'arrowUp')}</span><span><strong><a class="dashboard-transaction-link" href="${escapeHTML(routeHref('transactions', {...statementParams, record: transaction.id}))}">${escapeHTML(transaction.description)}</a></strong><small>${formatDate(transaction.date)}</small></span></div></td><td class="category-cell"><span class="badge">${escapeHTML(transaction.category)}</span></td><td class="${transaction.type === 'income' ? 'positive' : 'negative'}">${transaction.type === 'income' ? '+' : '−'} ${formatMoney(transaction.amount)}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Sem transações no período', 'Consulte outro intervalo ou acesse seu extrato completo.', `<a class="btn btn-secondary btn-small" href="${statementHref}">Ver extrato</a>`)}</section><div class="dashboard-side-stack"><section class="panel"><div class="panel-header"><h2>Minhas metas</h2><a href="#goals">Ver todas ${icon('chevronRight')}</a></div>${renderGoals(data.goals)}</section><section class="panel"><div class="panel-header"><div><h2>Contas a pagar</h2><p>Pendências do mês atual</p></div><a href="${billsHref}">Ver todas ${icon('chevronRight')}</a></div>${due.length ? due.map(bill => `<div class="upcoming-item"><div class="due-day"><small>Dia</small>${Number(bill.dueDate.slice(-2))}</div><div class="upcoming-copy"><strong>${escapeHTML(bill.name)}</strong><small>${escapeHTML(bill.group === 'subscription' ? 'Assinatura' : 'Essencial')}</small></div><div class="upcoming-amount">${formatMoney(bill.amount)}<small class="${bill.dueDate < dateISO() ? 'negative' : 'muted'}">${bill.dueDate < dateISO() ? 'Em atraso' : bill.dueDate === dateISO() ? 'Vence hoje' : 'Pendente'}</small></div></div>`).join('') : emptyState(monthBills.length ? 'Nenhuma conta pendente' : 'Nenhuma conta neste mês', monthBills.length ? 'As contas deste mês estão em dia.' : 'Organize os próximos vencimentos em Contas fixas.')}</section></div></div><aside class="learning-banner"><span class="learning-banner-icon">${icon('book')}</span><div class="learning-banner-copy"><h2>O melhor investimento começa com conhecimento.</h2><p>Descubra conteúdos para organizar suas finanças e dar o próximo passo.</p></div><a class="btn btn-secondary" href="#education">Quero aprender ${icon('arrowRight')}</a></aside></div>`;
  container.querySelector('#dashboard-period').addEventListener('change', event => {
    if (Object.hasOwn(periodLabels, event.target.value)) {
      selectedPeriod = event.target.value;
      context.render();
    }
  });
  const series = getPeriodSeries(data, range.from, range.to);
  createChart(container.querySelector('#cashflow-chart'), 'bar', {
    labels: series.map(interval => formatDate(interval.from).slice(0, 5)),
    datasets: [{label: 'Entradas', data: series.map(interval => interval.income / 100), backgroundColor: '#36d6b0', borderRadius: 4, maxBarThickness: 18}, {label: 'Saídas', data: series.map(interval => interval.expense / 100), backgroundColor: '#719bff', borderRadius: 4, maxBarThickness: 18}],
  }, {plugins: {tooltip: {callbacks: {title: items => {
    const interval = series[items[0]?.dataIndex];
    return interval ? interval.from === interval.to ? formatDate(interval.from) : `${formatDate(interval.from)} — ${formatDate(interval.to)}` : '';
  }}}}});
  if (spending.size) createChart(container.querySelector('#category-chart'), 'doughnut', {labels: [...spending.keys()], datasets: [{data: [...spending.values()].map(amount => amount / 100), backgroundColor: chartColors}]});
}
