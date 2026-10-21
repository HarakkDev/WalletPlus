import { escapeHTML, icon, emptyState, downloadFile, toast, openModal } from '../components/ui.js';
import { createChart, destroyCharts } from '../components/charts.js';
import { formatMoney, formatDate, dateISO, monthKey } from '../domain/finance.js';
import { requireDate } from '../domain/validation.js';

const palette = ['#35d7aa', '#6c9fff', '#ba91ff', '#f688a0', '#f6c56c', '#55c6ed', '#e59df7', '#8fcf8f', '#b0bdcf', '#fa9f75'];
const sum = transactions => transactions.reduce((total, item) => total + item.amount, 0);
const isoDate = date => date.toISOString().split('T')[0];
const comparisonDate = value => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', {timeZone: 'UTC'});
const percentage = (amount, total) => total ? `${(amount / total * 100).toFixed(1).replace('.', ',')}%` : '0%';

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
    if (year < 1900 || year > 9998) throw new Error('Escolha um mês entre os anos de 1900 e 9998.');
    const start = new Date(Date.UTC(year, monthNumber - 1, 1));
    return {
      from: `${month}-01`,
      to: isoDate(new Date(Date.UTC(year, monthNumber, 0))),
      previousFrom: isoDate(new Date(Date.UTC(year, monthNumber - 2, 1))),
      previousTo: isoDate(new Date(Date.UTC(year, monthNumber - 1, 0))),
      label: start.toLocaleDateString('pt-BR', {month: 'long', year: 'numeric', timeZone: 'UTC'}),
    };
  }
  const from = requireDate(form.elements.from.value, 'Data inicial');
  const to = requireDate(form.elements.to.value, 'Data final');
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

function renderStat({label, amount, previous, symbol, tone, result = false}) {
  return `<article class="report-stat${result ? ' report-stat-result' : ''}${result && amount < 0 ? ' is-negative' : ''}">
    <div class="report-stat-label"><span>${label}</span><span class="report-stat-icon ${tone}">${icon(symbol)}</span></div>
    <strong class="report-stat-value ${tone}">${formatMoney(amount)}</strong>
    <p class="report-stat-previous">Anterior <span>${formatMoney(previous)}</span></p>
  </article>`;
}

function comparisonMessage(result, previousResult, hasPrevious) {
  if (!hasPrevious) return 'Ainda não há registros no período anterior para comparar.';
  const difference = result - previousResult;
  if (!difference) return 'O resultado se manteve igual ao período anterior.';
  return `Seu resultado ${difference > 0 ? 'melhorou' : 'diminuiu'} ${formatMoney(Math.abs(difference))} em relação ao período anterior.`;
}

function renderCategoryRows(categories, expense) {
  return `<div class="report-category-details">
    <div class="report-category-heading"><span>Categoria</span><span>Valor e participação</span></div>
    <ul class="report-category-list">${categories.map(([name, amount], index) => `<li>
      <div class="report-category-name"><span class="report-color-dot" style="--category-color:${palette[index % palette.length]}"></span><span>${escapeHTML(name)}</span></div>
      <div class="report-category-value"><strong>${formatMoney(amount)}</strong><span>${percentage(amount, expense)}</span></div>
      <div class="report-category-track" aria-hidden="true"><span style="width:${amount / expense * 100}%;--category-color:${palette[index % palette.length]}"></span></div>
    </li>`).join('')}</ul>
  </div>`;
}

function renderReportContent(report) {
  const {range, transactions, previous, income, expense, previousIncome, previousExpense, recurringExpense, categories} = report;
  const result = income - expense;
  const previousResult = previousIncome - previousExpense;
  const variableExpense = expense - recurringExpense;
  return `<section class="report-summary" aria-label="Resumo financeiro do período">
    ${renderStat({label: 'Resultado do período', amount: result, previous: previousResult, symbol: 'wallet', tone: result >= 0 ? 'positive' : 'negative', result: true})}
    ${renderStat({label: 'Receitas recebidas', amount: income, previous: previousIncome, symbol: 'arrowDown', tone: 'positive'})}
    ${renderStat({label: 'Despesas pagas', amount: expense, previous: previousExpense, symbol: 'arrowUp', tone: 'negative'})}
  </section>
  <div class="report-charts">
    <section class="panel report-comparison" aria-labelledby="report-comparison-title">
      <div class="panel-header"><div><h2 id="report-comparison-title">Entradas e saídas</h2><p>Compare o período selecionado com o anterior.</p></div></div>
      ${transactions.length || previous.length ? `<div class="report-chart-legend" aria-hidden="true"><span><i class="report-color-dot" style="--category-color:#35d7aa"></i>Receitas</span><span><i class="report-color-dot" style="--category-color:#f688a0"></i>Despesas</span></div>
      <div class="report-bar-chart"><canvas id="period-chart" role="img" aria-label="Receitas e despesas: período anterior e selecionado"></canvas></div>` : emptyState('Seu histórico começa no primeiro registro', 'Receitas e despesas confirmadas serão comparadas aqui.')}
      <div class="report-comparison-note">${icon('chart')}<p>${comparisonMessage(result, previousResult, previous.length > 0)}</p></div>
      <p class="report-reference">Período anterior: ${comparisonDate(range.previousFrom)} a ${comparisonDate(range.previousTo)}</p>
    </section>
    <section class="panel report-recurrence" aria-labelledby="report-recurrence-title">
      <div class="panel-header"><div><h2 id="report-recurrence-title">Como você gastou</h2><p>Contas recorrentes e despesas avulsas.</p></div></div>
      ${expense ? `<div class="report-recurrence-layout">
        <div class="report-donut report-donut-small"><canvas id="recurrence-chart" role="img" aria-label="Despesas recorrentes: ${formatMoney(recurringExpense)}. Variáveis: ${formatMoney(variableExpense)}."></canvas><div class="report-donut-center" aria-hidden="true"><strong>${percentage(recurringExpense, expense)}</strong><span>recorrentes</span></div></div>
        <dl class="report-breakdown">
          <div><dt><span class="report-color-dot" style="--category-color:#ba91ff"></span>Recorrentes</dt><dd>${formatMoney(recurringExpense)}</dd></div>
          <div><dt><span class="report-color-dot" style="--category-color:#6c9fff"></span>Variáveis</dt><dd>${formatMoney(variableExpense)}</dd></div>
        </dl>
      </div><p class="report-reference report-recurrence-note">Recorrentes são pagamentos vinculados a contas fixas. Despesas avulsas são variáveis, independentemente da categoria.</p>` : emptyState('Nenhuma despesa paga', 'Ao confirmar uma conta ou registrar uma despesa, a composição aparecerá aqui.')}
    </section>
    <section class="panel report-categories" aria-labelledby="report-categories-title">
      <div class="panel-header"><div><h2 id="report-categories-title">Gastos por categoria</h2><p>Veja o que mais pesou no seu orçamento.</p></div>${categories.length ? `<span class="badge">${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'}</span>` : ''}</div>
      ${categories.length ? `<div class="report-category-layout">
        <div class="report-donut report-donut-categories"><canvas id="category-chart" role="img" aria-label="Distribuição das despesas por categoria. Valores detalhados na lista ao lado."></canvas><div class="report-donut-center" aria-hidden="true"><span>Total de despesas</span><strong>${formatMoney(expense)}</strong></div></div>
        ${renderCategoryRows(categories, expense)}
      </div>` : emptyState('Sem despesas neste período', 'Suas categorias e os valores pagos aparecerão aqui.')}
    </section>
  </div>
  <p class="report-footnote">${icon('info')}<span>Apenas valores recebidos ou pagos, pela data da transação. Previsões e reservas para metas não entram nestes totais.</span></p>`;
}

function renderReportCharts(content, report) {
  const {transactions, previous, income, expense, previousIncome, previousExpense, recurringExpense, categories} = report;
  const tooltip = {callbacks: {label: context => `${context.dataset.label || context.label}: ${formatMoney(Math.round(context.raw * 100))}`}};
  if (transactions.length || previous.length) {
    createChart(content.querySelector('#period-chart'), 'bar', {
      labels: ['Anterior', 'Selecionado'],
      datasets: [
        {label: 'Receitas', data: [previousIncome / 100, income / 100], backgroundColor: '#35d7aa', borderRadius: 5, maxBarThickness: 42},
        {label: 'Despesas', data: [previousExpense / 100, expense / 100], backgroundColor: '#f688a0', borderRadius: 5, maxBarThickness: 42},
      ],
    }, {plugins: {legend: {display: false}, tooltip}, scales: {y: {ticks: {maxTicksLimit: 5, callback: value => `R$ ${new Intl.NumberFormat('pt-BR', {notation: 'compact', maximumFractionDigits: 1}).format(value)}`}}}});
  }
  if (categories.length) {
    createChart(content.querySelector('#category-chart'), 'doughnut', {
      labels: categories.map(([name]) => name),
      datasets: [{data: categories.map(([, amount]) => amount / 100), backgroundColor: categories.map((category, index) => palette[index % palette.length]), borderWidth: 0, hoverOffset: 4}],
    }, {cutout: '79%', plugins: {legend: {display: false}, tooltip}});
  }
  if (expense) {
    createChart(content.querySelector('#recurrence-chart'), 'doughnut', {
      labels: ['Recorrentes', 'Variáveis'],
      datasets: [{data: [recurringExpense / 100, (expense - recurringExpense) / 100], backgroundColor: ['#ba91ff', '#6c9fff'], borderWidth: 0, hoverOffset: 4}],
    }, {cutout: '80%', plugins: {legend: {display: false}, tooltip}});
  }
}

export async function render(container, ctx) {
  const today = dateISO();
  const currentMonth = monthKey(today);
  container.innerHTML = `<div class="reports-page">
    <header class="page-header reports-header"><h1>Relatórios</h1><button class="btn btn-secondary report-export" id="export-csv" aria-label="Exportar histórico do período selecionado em CSV">${icon('download')}<span>Exportar CSV</span></button></header>
    <section class="panel report-filter-panel" aria-label="Filtros do relatório">
      <form class="report-filters" id="report-filters" data-mode="month">
        <div class="report-mode-switch" role="radiogroup" aria-label="Agrupamento do período">
          ${[['month', 'Mensal'], ['year', 'Anual'], ['custom', 'Personalizado']].map(([value, label]) => `<label><input class="sr-only" type="radio" name="mode" value="${value}" ${value === 'month' ? 'checked' : ''}><span>${label}</span></label>`).join('')}
        </div>
        <div class="report-range-fields">
          <label class="field" data-mode="month">Mês de referência<input name="month" type="month" min="1900-01" max="9998-12" required value="${currentMonth}"></label>
          <label class="field" data-mode="year" hidden>Ano de referência<input name="year" type="number" min="1900" max="9998" required disabled value="${new Date().getFullYear()}"></label>
          <div class="field" data-mode="custom" hidden><span id="report-custom-label">Período personalizado</span><button type="button" class="report-custom-range" id="report-custom-range" aria-labelledby="report-custom-label report-custom-value" aria-haspopup="dialog"><span id="report-custom-value"></span>${icon('calendar')}</button></div>
        </div>
        <input name="from" type="hidden" value="${currentMonth}-01">
        <input name="to" type="hidden" value="${today}">
      </form>
      <p class="form-error" id="report-error" role="alert" hidden></p>
      <div class="report-applied-period" id="report-period" role="status" aria-live="polite"></div>
    </section>
    <div id="report-content"></div>
  </div>`;
  const form = container.querySelector('#report-filters');
  const content = container.querySelector('#report-content');
  const period = container.querySelector('#report-period');
  const errorElement = container.querySelector('#report-error');
  let filteredTransactions = [];
  let selectedRange;
  const updateCustomLabel = () => {
    container.querySelector('#report-custom-value').textContent = `${formatDate(form.elements.from.value)} — ${formatDate(form.elements.to.value)}`;
  };
  const updateReports = () => {
    try {
      const range = rangeFor(form);
      const transactions = ctx.data.transactions.filter(item => item.date >= range.from && item.date <= range.to).sort((first, second) => first.date.localeCompare(second.date));
      const previous = ctx.data.transactions.filter(item => item.date >= range.previousFrom && item.date <= range.previousTo);
      const expenses = transactions.filter(item => item.type === 'expense');
      const categoryTotals = new Map();
      expenses.forEach(item => categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amount));
      const report = {
        range, transactions, previous,
        income: sum(transactions.filter(item => item.type === 'income')),
        expense: sum(expenses),
        previousIncome: sum(previous.filter(item => item.type === 'income')),
        previousExpense: sum(previous.filter(item => item.type === 'expense')),
        recurringExpense: sum(expenses.filter(item => item.recurringKind === 'bill')),
        categories: [...categoryTotals.entries()].sort((first, second) => second[1] - first[1]),
      };
      const markup = renderReportContent(report);
      errorElement.hidden = true;
      selectedRange = range;
      filteredTransactions = transactions;
      period.innerHTML = `<span>${icon('calendar')}<strong>${escapeHTML(range.label)}</strong></span><span>${transactions.length} ${transactions.length === 1 ? 'lançamento registrado' : 'lançamentos registrados'}</span>`;
      destroyCharts(content);
      content.innerHTML = markup;
      renderReportCharts(content, report);
    } catch (error) {
      errorElement.textContent = error.message;
      errorElement.hidden = false;
    }
  };
  form.addEventListener('change', event => {
    if (event.target.name === 'mode') {
      const mode = form.elements.mode.value;
      form.dataset.mode = mode;
      form.querySelectorAll('[data-mode]').forEach(field => {
        field.hidden = field.dataset.mode !== mode;
        field.querySelectorAll('input, button').forEach(control => { control.disabled = field.hidden; });
      });
    }
    updateReports();
  });
  form.addEventListener('submit', event => { event.preventDefault(); updateReports(); });
  container.querySelector('#report-custom-range').addEventListener('click', () => {
    openModal({
      title: 'Escolher período',
      body: `<div class="form-grid"><label class="field">Data inicial<input name="from" type="date" min="1900-01-01" max="9999-12-31" required value="${escapeHTML(form.elements.from.value)}"></label><label class="field">Data final<input name="to" type="date" min="1900-01-01" max="9999-12-31" required value="${escapeHTML(form.elements.to.value)}"></label></div>`,
      submitLabel: 'Usar período',
      onSubmit: values => {
        const from = requireDate(values.get('from'), 'Data inicial');
        const to = requireDate(values.get('to'), 'Data final');
        if (from > to) throw new Error('A data final deve ser igual ou posterior à data inicial.');
        form.elements.from.value = from;
        form.elements.to.value = to;
        updateCustomLabel();
        updateReports();
      },
    });
  });
  container.querySelector('#export-csv').addEventListener('click', () => {
    if (!selectedRange || !filteredTransactions.length) { toast('Não há transações neste período para exportar.', 'info'); return; }
    const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)', 'Forma de pagamento', 'Observações', 'Mês de referência'], ...filteredTransactions.map(item => [formatDate(item.date), item.type === 'income' ? 'Receita' : 'Despesa', item.description, item.category, (item.amount / 100).toFixed(2).replace('.', ','), item.paymentMethod || '', item.notes || '', item.referenceMonth || ''])];
    const csv = '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
    downloadFile(`wallet-transacoes-${selectedRange.from}-${selectedRange.to}.csv`, csv, 'text/csv;charset=utf-8');
    toast('Histórico exportado em CSV.');
  });
  updateCustomLabel();
  updateReports();
}

export function cleanup(container) {
  destroyCharts(container);
}
