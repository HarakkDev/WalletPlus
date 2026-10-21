import { escapeHTML, icon, openModal, confirmDialog, toast, downloadFile } from '../components/ui.js';
import { categoriesFor, dateISO } from '../domain/finance.js';
import { exportBackup, validateBackup } from '../services/backup.js';

function categoryForm(category = {}) {
  return `<div class="form-grid"><label class="field full-width"><span>Nome da categoria</span><input name="name" maxlength="60" value="${escapeHTML(category.name || '')}" placeholder="Ex.: Cuidados com pets" required></label><label class="field full-width"><span>Tipo</span><select name="type" ${category.id ? 'disabled' : ''}><option value="expense" ${category.type !== 'income' ? 'selected' : ''}>Despesa</option><option value="income" ${category.type === 'income' ? 'selected' : ''}>Receita</option></select></label></div>${category.id ? '<p class="muted">Renomear também atualiza os registros que usam esta categoria.</p>' : ''}`;
}

export async function render(container, ctx) {
  container.innerHTML = `<header class="page-header"><div><h1>Configurações</h1><p class="muted">Cuide do seu perfil, do planejamento e dos seus dados.</p></div></header><div class="settings-grid"><section class="panel settings-section"><h2>${icon('user-round')} Seu perfil</h2><p class="muted">${escapeHTML(ctx.account.email)}${ctx.account.demo ? ' · Conta de exploração' : ''}</p><form id="profile-form"><div class="form-grid"><label class="field full-width"><span>Nome de exibição</span><input name="name" value="${escapeHTML(ctx.account.name)}" maxlength="80" required autocomplete="name"></label><label class="field full-width"><span>Aparência</span><select name="theme"><option value="dark" ${ctx.account.theme !== 'light' ? 'selected' : ''}>Escuro</option><option value="light" ${ctx.account.theme === 'light' ? 'selected' : ''}>Claro</option></select></label></div><button class="btn btn-primary" type="submit">${icon('check')} Salvar preferências</button></form></section><section class="panel settings-section"><h2>${icon('sliders-horizontal')} Seu planejamento</h2><p class="muted">Revise suas fontes de renda, contas essenciais, assinaturas e objetivos no mesmo passo a passo do primeiro acesso.</p><p class="muted">Receitas previstas só entram no saldo após confirmação. Para confirmar recebimentos e editar contas individualmente, abra Contas Fixas.</p><div class="settings-actions"><button class="btn btn-primary" data-review>${icon('pencil')} Revisar planejamento</button><button class="btn btn-secondary" data-bills>${icon('calendar-days')} Contas e rendas</button></div></section><section class="panel settings-section"><div class="panel-header"><h2>${icon('tags')} Categorias personalizadas</h2><button class="btn btn-secondary btn-small" data-new-category>${icon('plus')} Nova categoria</button></div><p class="muted">As categorias padrão continuam disponíveis. Crie outras para organizar o que faz sentido para você.</p><div class="settings-categories">${ctx.data.categories.length ? ctx.data.categories.map(category => `<div class="settings-category"><div><strong>${escapeHTML(category.name)}</strong><small class="muted">${category.type === 'income' ? 'Receita' : 'Despesa'}</small></div><button class="btn btn-ghost btn-icon" data-edit-category="${category.id}" aria-label="Editar ${escapeHTML(category.name)}">${icon('pencil')}</button><button class="btn btn-ghost btn-icon" data-delete-category="${category.id}" aria-label="Excluir ${escapeHTML(category.name)}">${icon('trash-2')}</button></div>`).join('') : '<p class="muted">Você ainda não tem categorias personalizadas.</p>'}</div></section><section class="panel settings-section"><h2>${icon('database-backup')} Backup dos seus dados</h2><p class="muted">Exporte seu histórico e planejamento em JSON. O arquivo contém seus dados financeiros e nome, mas não inclui senha nem permite entrar na sua conta.</p><p class="muted">A importação substitui os dados da conta atual. Guarde uma cópia antes de continuar.</p><div class="settings-actions"><button class="btn btn-primary" data-export>${icon('download')} Exportar backup</button><button class="btn btn-secondary" data-import>${icon('upload')} Importar backup</button><input type="file" accept=".json,application/json" id="backup-file" hidden></div><p class="muted" id="backup-status" role="status" aria-live="polite"></p></section><section class="panel settings-section"><h2>${icon('shield-check')} Conta local demonstrativa</h2><p class="muted">Este login existe para demonstração. Ele não constitui autenticação segura para produção. Quem tem acesso ao navegador ou dispositivo pode acessar ou alterar os dados locais.</p><div class="settings-actions"><button class="btn btn-secondary" data-logout>${icon('log-out')} Sair da conta</button></div></section><section class="panel settings-section settings-danger"><h2>${icon('trash-2')} Excluir conta local</h2><p class="muted">Apaga esta conta, todas as suas transações, metas, contas recorrentes e preferências neste navegador. Outras contas locais são preservadas.</p><div class="settings-actions"><button class="btn btn-danger" data-delete-account>Apagar minha conta e meus dados</button></div></section></div><aside class="settings-note">${icon('hard-drive')}<p>Seus dados ficam exclusivamente neste navegador e dispositivo, sem sincronização. Limpar os dados do site, usar navegação privada ou trocar de navegador pode apagar ou tornar seus registros indisponíveis. Faça backups regularmente.</p></aside>`;

  container.querySelector('#profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get('name')).trim();
    if (!name) { toast('Informe um nome de exibição.', 'error'); return; }
    button.disabled = true;
    try {
      await ctx.updateAccount({ name, theme: formData.get('theme') === 'light' ? 'light' : 'dark' });
      toast('Preferências salvas.');
      await ctx.render();
    } catch (error) { toast(error.message || 'Não foi possível salvar as preferências.', 'error'); button.disabled = false; }
  });
  container.querySelector('[data-review]').addEventListener('click', () => ctx.navigate('onboarding'));
  container.querySelector('[data-bills]').addEventListener('click', () => ctx.navigate('bills'));

  const editCategory = category => openModal({
    title: category ? 'Editar categoria' : 'Nova categoria',
    body: categoryForm(category),
    onSubmit: async formData => {
      const name = String(formData.get('name')).trim();
      const type = category?.type || (formData.get('type') === 'income' ? 'income' : 'expense');
      if (!name) throw new Error('Informe o nome da categoria.');
      const comparable = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
      const otherCategories = categoriesFor(ctx.data, type).filter(existing => !category || existing !== category.name);
      if (otherCategories.some(existing => comparable(existing) === comparable(name))) throw new Error('Já existe uma categoria com esse nome para este tipo.');
      await ctx.update(data => {
        if (category) {
          data.categories = data.categories.map(existing => existing.id === category.id ? { ...existing, name } : existing);
          data.transactions = data.transactions.map(transaction => transaction.type === type && transaction.category === category.name ? { ...transaction, category: name } : transaction);
          if (type === 'expense') data.bills = data.bills.map(bill => bill.category === category.name ? { ...bill, category: name } : bill);
          else data.incomeSources = data.incomeSources.map(source => source.category === category.name ? { ...source, category: name } : source);
        } else data.categories.push({ id: crypto.randomUUID(), name, type });
        return data;
      });
      toast(category ? 'Categoria atualizada.' : 'Categoria criada.');
      await ctx.render();
    },
  });
  container.querySelector('[data-new-category]').addEventListener('click', () => editCategory());
  container.querySelectorAll('[data-edit-category]').forEach(button => button.addEventListener('click', () => editCategory(ctx.data.categories.find(category => category.id === button.dataset.editCategory))));
  container.querySelectorAll('[data-delete-category]').forEach(button => button.addEventListener('click', async () => {
    const category = ctx.data.categories.find(item => item.id === button.dataset.deleteCategory);
    if (!category || !await confirmDialog('Excluir categoria?', `A categoria “${category.name}” será excluída. Os registros que a utilizam serão movidos para Outros; nenhum valor será apagado.`)) return;
    try {
      await ctx.update(data => {
        data.categories = data.categories.filter(item => item.id !== category.id);
        data.transactions = data.transactions.map(transaction => transaction.type === category.type && transaction.category === category.name ? { ...transaction, category: 'Outros' } : transaction);
        if (category.type === 'expense') data.bills = data.bills.map(bill => bill.category === category.name ? { ...bill, category: 'Outros' } : bill);
        else data.incomeSources = data.incomeSources.map(source => source.category === category.name ? { ...source, category: 'Outros' } : source);
        return data;
      });
      toast('Categoria excluída.');
      await ctx.render();
    } catch (error) { toast(error.message || 'Não foi possível excluir a categoria.', 'error'); }
  }));
  container.querySelector('[data-export]').addEventListener('click', () => {
    try { downloadFile(`wallet-backup-${dateISO()}.json`, exportBackup(ctx.account, ctx.data), 'application/json'); toast('Backup exportado. Guarde o arquivo em um lugar seguro.'); }
    catch (error) { toast(error.message || 'Não foi possível exportar o backup.', 'error'); }
  });
  const fileInput = container.querySelector('#backup-file');
  container.querySelector('[data-import]').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const status = container.querySelector('#backup-status');
    try {
      status.textContent = 'Validando arquivo…';
      if (file.size > 5 * 1024 * 1024) throw new Error('O backup precisa ter no máximo 5 MB.');
      const backup = validateBackup(await file.text());
      status.textContent = `${backup.data.transactions.length} transações, ${backup.data.bills.length} contas e ${backup.data.goals.length} metas encontradas.`;
      if (!await confirmDialog('Substituir os dados desta conta?', `O arquivo “${file.name}” contém ${backup.data.transactions.length} transações e ${backup.data.goals.length} metas. A importação substituirá o planejamento, o histórico e as preferências atuais. Seu e-mail e sua senha permanecem os mesmos. Exporte um backup antes se quiser preservar os dados atuais.`, 'Importar e substituir')) { status.textContent = 'Importação cancelada. Nenhum dado foi alterado.'; return; }
      await ctx.update(() => backup.data);
      await ctx.updateAccount(backup.profile);
      toast('Backup importado com sucesso.');
      if (!backup.profile.onboardingComplete) ctx.navigate('onboarding');
      else await ctx.render();
    } catch (error) { status.textContent = ''; toast(error.message || 'O arquivo não é um backup válido do Wallet+.', 'error'); }
    finally { fileInput.value = ''; }
  });
  container.querySelector('[data-logout]').addEventListener('click', async () => {
    try { await ctx.logout(); } catch (error) { toast(error.message || 'Não foi possível sair da conta.', 'error'); }
  });
  container.querySelector('[data-delete-account]').addEventListener('click', async () => {
    if (!await confirmDialog('Apagar sua conta e todos os seus dados?', `A conta local de ${ctx.account.name} e seus dados financeiros serão removidos deste navegador. Esta ação não pode ser desfeita. Exporte um backup se quiser manter uma cópia.`, 'Apagar definitivamente')) return;
    try { await ctx.deleteAccount(); toast('Conta local e dados apagados.'); }
    catch (error) { toast(error.message || 'Não foi possível apagar sua conta.', 'error'); }
  });
}
