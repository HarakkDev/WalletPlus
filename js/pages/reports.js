import { escapeHTML, icon, emptyState, downloadFile, toast } from '../components/ui.js';
import { createChart, destroyCharts } from '../components/charts.js';
import { formatMoney, formatDate, dateISO, monthKey } from '../domain/finance.js';

const palette = ['#35d7aa', '#6c9fff', '#ba91ff', '#f688a0', '#f6c56c', '#55c6ed', '#e59df7', '#8fcf8f', '#b0bdcf', '#fa9f75'];
const sum = transactions => transactions.reduce((total, item) => total + item.amount, 0);
const isoDate = date => date.toISOString().slice(0, 10);

function rangeFor(form) {
  const mode = form.elements.mode.value;
  if (mode === 'year') {
    const year = Number(form.elements.year.value);
    if (!Number.isInteger(year) || year < 1900 || year > 9998) throw new Error('Informe um ano entre 1900 e 9998.');
    return { from: `${year}-01-01`, to: `${year}-12-31`, previousFrom: `${year - 1}-01-01`, previousTo: `${year - 1}-12-31`, label: String(year) };
  }
  if (mode === 'month') {
    const month = form.elements.month.value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Escolha um mês válido.');
    const [year, monthNumber] = month.split('-').map(Number);
    return { from: `${month}-01`, to: isoDate(new Date(Date.UTC(year, monthNumber, 0))), previousFrom: isoDate(new Date(Date.UTC(year, monthNumber - 2, 1))), previousTo: isoDate(new Date(Date.UTC(year, monthNumber - 1, 0))), label: `${String(monthNumber).padStart(2, '0')}/${year}` };
  }
  const from = form.elements.from.value;
  const to = form.elements.to.value;
  if (!from || !to || from > to) throw new Error('Escolha um período válido, com a data inicial anterior à final.');
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  const duration = end.getTime() - start.getTime() + 86400000;
  return { from, to, previousFrom: isoDate(new Date(start.getTime() - duration)), previousTo: isoDate(new Date(start.getTime() - 86400000)), label: `${formatDate(from)} a ${formatDate(to)}` };
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function render(container, ctx) {
  container.innerHTML = `<header class="page-header"><div><p class="eyebrow">CLAREZA PARA DECIDIR MELHOR</p><h1>Relatórios</h1><p class="muted">Entenda os hábitos por trás dos seus números.</p></div><button class="btn btn-secondary" id="export-csv">${icon('download')} Exportar CSV</button></header><section class="panel"><form class="toolbar report-filters" id="report-filters"><label class="field">Período<select name="mode"><option value="month">Por mês</option><option value="year">Por ano</option><option value="custom">Personalizado</option></select></label><label class="field" data-mode="month">Mês<input name="month" type="month" value="${monthKey(dateISO())}"></label><label class="field" data-mode="year" hidden>Ano<input name="year" type="number" min="1900" max="9998" value="${new Date().getFullYear()}"></label><label class="field" data-mode="custom" hidden>De<input name="from" type="date" value="${monthKey(dateISO())}-01"></label><label class="field" data-mode="custom" hidden>Até<input name="to" type="date" value="${dateISO()}"></label><button type="submit" class="btn btn-primary">Aplicar período</button></form><p class="form-error" id="report-error" role="alert" hidden></p></section><div id="report-content"></div>`;
  const form = container.querySelector('#report-filters');
  const content = container.querySelector('#report-content');
  let filteredTransactions = [];
  let selectedRange;
  const updateReports = () => {
    try {
      const range = rangeFor(form);
      selectedRange = range;
      container.querySelector('#report-error').hidden = true;
      filteredTransactions = ctx.data.transactions.filter(item => item.date >= range.from && item.date <= range.to).sort((first, second) => first.date.localeCompare(second.date));
      const previous = ctx.data.transactions.filter(item => item.date >= range.previousFrom && item.date <= range.previousTo);
      const income = sum(filteredTransactions.filter(item => item.type === 'income'));
      const expense = sum(filteredTransactions.filter(item => item.type === 'expense'));
      const previousIncome = sum(previous.filter(item => item.type === 'income'));
      const previousExpense = sum(previous.filter(item => item.type === 'expense'));
      const expenses = filteredTransactions.filter(item => item.type === 'expense');
      const recurringExpense = sum(expenses.filter(item => item.recurringKind === 'bill'));
      const variableExpense = expense - recurringExpense;
      const categoryTotals = new Map();
      expenses.forEach(item => categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amount));
      const categories = [...categoryTotals.entries()].sort((first, second) => second[1] - first[1]);
      destroyCharts(content);
      content.innerHTML = `<div class="report-period"><span class="badge">${escapeHTML(range.label)}</span><p class="muted">${filteredTransactions.length} lançamentos efetivamente registrados</p></div><div class="stats-grid report-stats"><article class="stat-card"><span class="muted">Receitas recebidas</span><strong class="positive">${formatMoney(income)}</strong><small class="muted">Anterior: ${formatMoney(previousIncome)}</small></article><article class="stat-card"><span class="muted">Despesas pagas</span><strong class="negative">${formatMoney(expense)}</strong><small class="muted">Anterior: ${formatMoney(previousExpense)}</small></article><article class="stat-card"><span class="muted">Resultado do período</span><strong class="${income >= expense ? 'positive' : 'negative'}">${formatMoney(income - expense)}</strong><small class="muted">Anterior: ${formatMoney(previousIncome - previousExpense)}</small></article></div><div class="report-charts"><section class="panel report-comparison"><div class="panel-header"><div><h2>Comparação entre períodos</h2><p class="muted">Anterior: ${formatDate(range.previousFrom)} a ${formatDate(range.previousTo)}</p></div></div>${filteredTransactions.length || previous.length ? '<div class="chart-box"><canvas id="period-chart" role="img" aria-label="Comparação das receitas e despesas do período atual e anterior"></canvas></div>' : emptyState('Seu histórico começa com o primeiro registro', 'As receitas e despesas confirmadas serão comparadas aqui.')}<p class="form-note">O resultado do período ${income - expense >= previousIncome - previousExpense ? 'aumentou' : 'diminuiu'} ${formatMoney(Math.abs((income - expense) - (previousIncome - previousExpense)))} em relação ao anterior.</p></section><section class="panel"><div class="panel-header"><div><h2>Gastos por categoria</h2><p class="muted">Para onde foi seu dinheiro?</p></div></div>${categories.length ? '<div class="chart-box chart-box-donut"><canvas id="category-chart" role="img" aria-label="Distribuição das despesas por categoria"></canvas></div>' : emptyState('Sem despesas neste período', 'As categorias aparecerão após registrar uma despesa.')}</section><section class="panel"><div class="panel-header"><div><h2>Recorrentes e variáveis</h2><p class="muted">A composição das despesas pagas.</p></div></div>${expense ? '<div class="chart-box chart-box-donut"><canvas id="recurrence-chart" role="img" aria-label="Comparação entre despesas recorrentes e variáveis"></canvas></div>' : emptyState('Nenhum pagamento registrado', 'Confirme suas contas ou registre despesas para analisar.')}<div class="report-breakdown"><span>Recorrentes <strong>${formatMoney(recurringExpense)}</strong></span><span>Variáveis <strong>${formatMoney(variableExpense)}</strong></span></div><p class="form-note">Recorrentes são pagamentos vinculados a uma conta fixa. Despesas avulsas são variáveis, independentemente da categoria.</p></section></div>${categories.length ? `<section class="panel report-categories"><div class="panel-header"><h2>Detalhamento das categorias</h2></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Categoria</th><th>Valor pago</th><th>Participação</th></tr></thead><tbody>${categories.map(([name, amount]) => `<tr><td>${escapeHTML(name)}</td><td>${formatMoney(amount)}</td><td>${(amount / expense * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('')}</tbody></table></div></section>` : ''}<p class="form-note">Os relatórios usam a data efetiva da transação. Previsões não confirmadas e alocações para metas não entram nos gastos.</p>`;
      if (filteredTransactions.length || previous.length) createChart(content.querySelector('#period-chart'), 'bar', { labels: ['Período anterior', 'Período selecionado'], datasets: [{ label: 'Receitas', data: [previousIncome / 100, income / 100], backgroundColor: '#35d7aa', borderRadius: 5 }, { label: 'Despesas', data: [previousExpense / 100, expense / 100], backgroundColor: '#f688a0', borderRadius: 5 }] }, { plugins: { tooltip: { callbacks: { label: context => `${context.dataset.label}: ${formatMoney(Math.round(context.raw * 100))}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: value => formatMoney(Math.round(value * 100)) } } } });
      if (categories.length) createChart(content.querySelector('#category-chart'), 'doughnut', { labels: categories.map(([name]) => name), datasets: [{ data: categories.map(([, amount]) => amount / 100), backgroundColor: palette, borderWidth: 0, hoverOffset: 6 }] }, { cutout: '72%', plugins: { tooltip: { callbacks: { label: context => `${context.label}: ${formatMoney(Math.round(context.raw * 100))}` } } } });
      if (expense) createChart(content.querySelector('#recurrence-chart'), 'doughnut', { labels: ['Recorrentes', 'Variáveis'], datasets: [{ data: [recurringExpense / 100, variableExpense / 100], backgroundColor: ['#ba91ff', '#6c9fff'], borderWidth: 0, hoverOffset: 6 }] }, { cutout: '72%', plugins: { tooltip: { callbacks: { label: context => `${context.label}: ${formatMoney(Math.round(context.raw * 100))}` } } } });
    } catch (error) {
      const errorElement = container.querySelector('#report-error');
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    }
  };
  form.elements.mode.addEventListener('change', () => {
    form.querySelectorAll('[data-mode]').forEach(field => { field.hidden = field.dataset.mode !== form.elements.mode.value; });
    updateReports();
  });
  form.addEventListener('submit', event => { event.preventDefault(); updateReports(); });
  container.querySelector('#export-csv').addEventListener('click', () => {
    if (!selectedRange || !filteredTransactions.length) { toast('Não há transações neste período para exportar.', 'info'); return; }
    const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Forma de pagamento', 'Observações', 'Mês de referência'], ...filteredTransactions.map(item => [formatDate(item.date), item.type === 'income' ? 'Receita' : 'Despesa', item.description, item.category, (item.amount / 100).toFixed(2).replace('.', ','), item.paymentMethod || '', item.notes || '', item.referenceMonth || ''])];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`wallet-transacoes-${selectedRange.from}-${selectedRange.to}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Histórico exportado em CSV.');
  });
  updateReports();
}

export function cleanup(container) {
  destroyCharts(container);
}
