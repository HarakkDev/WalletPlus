const paths = {
  wallet: '<path d="M20 8V5H6a3 3 0 0 0 0 6h15v9H6a3 3 0 0 1-3-3V8"/><path d="M21 12h-6v5h6"/><path d="M17 14.5h.01"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  transactions: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  receipt: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  book: '<path d="M12 5v16M3 4h5l4 2 4-2h5v15h-5l-4 2-4-2H3Z"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4"/>',
  settings: '<path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 2 3-1 2 4 3-2 3 1 3-3-1-3 2-3-3-2-1-3-4 1Z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowUp: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  arrowDown: '<path d="M12 5v14m-6-6 6 6 6-6"/>',
  arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4M9 12h12"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  shield: '<path d="m12 3 8 4v6c0 4-8 8-8 8s-8-4-8-8V7Z"/><path d="m8 12 3 3 5-6"/>',
  edit: '<path d="m16 3 5 5-12 12H4v-5ZM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  lightbulb: '<path d="M9 18h6m-6 3h6M8 14a6 6 0 1 1 8 0l-1 3H9Z"/>',
  'graduation-cap': '<path d="m2 9 10-5 10 5-10 5Zm4 2v6q6 5 12 0v-6M22 9v8"/>',
};
const aliases = {'arrow-down-left': 'arrowDown', 'arrow-up-right': 'arrowUp', 'arrow-left': 'chevronLeft', 'arrow-right': 'arrowRight', 'trash-2': 'trash', pencil: 'edit', 'circle-check': 'check', 'user-round': 'user', 'sliders-horizontal': 'settings', 'calendar-days': 'calendar', 'shield-check': 'shield', 'log-out': 'logout', house: 'home', 'hard-drive': 'wallet', 'database-backup': 'download', tags: 'receipt', 'trending-up': 'chart', landmark: 'home', repeat: 'transactions', history: 'calendar'};

export function escapeHTML(value = '') {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

export function icon(name, className = '') {
  return `<svg class="icon ${escapeHTML(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[aliases[name] || name] || paths.wallet}</svg>`;
}

export function emptyState(title, description, actionHTML = '') {
  return `<div class="empty-state"><span class="empty-icon">${icon('wallet')}</span><h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${actionHTML}</div>`;
}

export function toast(message, type = 'success') {
  const notification = document.createElement('div');
  notification.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
  notification.setAttribute('role', type === 'error' ? 'alert' : 'status');
  notification.innerHTML = `${icon(type === 'error' ? 'info' : 'check')}<span>${escapeHTML(message)}</span>`;
  document.querySelector('#notifications').append(notification);
  setTimeout(() => notification.remove(), 6000);
}

export function openModal({title, body, submitLabel = 'Salvar', onSubmit}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  const titleId = `modal-${crypto.randomUUID()}`;
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.innerHTML = `<div class="modal-header"><h2 id="${titleId}">${escapeHTML(title)}</h2><button type="button" class="icon-button" data-close aria-label="Fechar">${icon('close')}</button></div><form class="modal-form"><div class="modal-body">${body}</div><p class="form-error" role="alert" hidden></p><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close>Cancelar</button><button type="submit" class="btn btn-primary">${escapeHTML(submitLabel)}</button></div></form>`;
  document.body.append(dialog);
  let saving = false;
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => { if (!saving) dialog.close(); }));
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove(), {once: true});
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    const form = event.currentTarget;
    const error = dialog.querySelector('.form-error');
    saving = true;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    error.hidden = true;
    try {
      await onSubmit(new FormData(form), form);
      dialog.close();
    } catch (failure) {
      error.textContent = failure.message || 'Não foi possível salvar. Tente novamente.';
      error.hidden = false;
    } finally {
      saving = false;
      submit.disabled = false;
    }
  });
  dialog.showModal();
  return dialog;
}

export function confirmDialog(title, message, confirmLabel = 'Excluir') {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal confirm-modal';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><h2>${escapeHTML(title)}</h2></div><div class="modal-body"><p>${escapeHTML(message)}</p></div><div class="modal-footer"><button class="btn btn-secondary" value="cancel" autofocus>Cancelar</button><button class="btn btn-danger" value="confirm">${escapeHTML(confirmLabel)}</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener('close', () => { resolve(dialog.returnValue === 'confirm'); dialog.remove(); }, {once: true});
    dialog.showModal();
  });
}

export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], {type: mime}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
