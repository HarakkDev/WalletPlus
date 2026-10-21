const instances = new Map();
export const chartColors = ['#36d6b0', '#719bff', '#a88bfa', '#f5b86b', '#ed7895', '#63c9e8', '#b5c86a', '#ae92a7'];

export function createChart(canvas, type, data, options = {}) {
  if (!canvas) return null;
  instances.get(canvas)?.destroy();
  if (!window.Chart) {
    const message = document.createElement('p');
    message.className = 'muted';
    message.textContent = 'O gráfico não carregou. Os totais continuam disponíveis nesta página.';
    canvas.replaceWith(message);
    return null;
  }
  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--muted').trim();
  const border = styles.getPropertyValue('--border').trim();
  const pluginDefaults = {legend: {display: type === 'doughnut', position: 'bottom', labels: {color: muted, usePointStyle: true, padding: 20}}, tooltip: {callbacks: {label: context => `${context.dataset.label || context.label}: ${Number(context.parsed?.y ?? context.parsed).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}`}}};
  const scaleDefaults = {x: {grid: {display: false}, ticks: {color: muted}, border: {display: false}}, y: {beginAtZero: true, grid: {color: border}, ticks: {color: muted, callback: value => value >= 1000 ? `R$ ${value / 1000} mil` : `R$ ${value}`}, border: {display: false}}};
  const merge = (base, override) => {
    const result = {...base};
    Object.entries(override || {}).forEach(([key, value]) => { result[key] = value && typeof value === 'object' && !Array.isArray(value) ? merge(base?.[key], value) : value; });
    return result;
  };
  const chart = new window.Chart(canvas, {
    type,
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500},
      color: muted,
      font: {family: 'Poppins, sans-serif'},
      ...(type === 'doughnut' ? {cutout: '76%', borderWidth: 0} : {}),
      ...options,
      plugins: merge(pluginDefaults, options.plugins),
      ...(type === 'doughnut' ? {} : {scales: merge(scaleDefaults, options.scales)}),
    },
  });
  instances.set(canvas, chart);
  return chart;
}

export function destroyCharts(container = document) {
  for (const [canvas, chart] of instances) {
    if (container.contains(canvas) || !canvas.isConnected) {
      chart.destroy();
      instances.delete(canvas);
    }
  }
}
