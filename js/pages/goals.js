import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, goalSaved, recordGoalMovement } from '../domain/finance.js';

const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');

function openGoal(ctx, goal = null) {
  openModal({
    title: goal ? 'Editar meta' : 'Nova meta',
    body: `<div class="form-grid"><label class="field full-width">Nome da meta<input name="title" required maxlength="100" placeholder="Ex.: minha reserva de emergência" value="${escapeHTML(goal?.title || '')}"></label><label class="field">Valor desejado (R$)<input name="target" data-money inputmode="numeric" required maxlength="18" placeholder="0,00" value="${goal ? moneyValue(goal.target) : ''}"></label><label class="field">Valor inicial (R$)<input name="initialAmount" data-money inputmode="numeric" required maxlength="18" value="${moneyValue(goal?.initialAmount || 0)}"></label><label class="field full-width"><span>Data-alvo <span class="muted">(opcional)</span></span><input name="targetDate" type="date" value="${goal?.targetDate || ''}"></label><p class="form-note full-width">O valor inicial é registrado apenas nesta meta. Ele não altera o saldo nem cria receitas ou despesas no Extrato.</p></div>`,
    onSubmit: async formData => {
      const title = String(formData.get('title')).trim();
      const target = parseMoney(formData.get('target'));
      const initialAmount = parseMoney(formData.get('initialAmount'));
      if (!title) throw new Error('Dê um nome à sua meta.');
      if (!Number.isSafeInteger(target) || target <= 0) throw new Error('Informe um valor desejado maior que zero.');
      if (!Number.isSafeInteger(initialAmount) || initialAmount < 0) throw new Error('O valor guardado deve ser zero ou positivo.');
      const updated = { ...goal, id: goal?.id || crypto.randomUUID(), title, target, initialAmount, targetDate: String(formData.get('targetDate')), contributions: goal?.contributions || [] };
      await ctx.update(data => {
        const position = data.goals.findIndex(item => item.id === updated.id);
        if (goal && position < 0) throw new Error('Esta meta não está mais disponível.');
        if (position >= 0) updated.contributions = data.goals[position].contributions;
        if (goalSaved(updated) < 0) throw new Error('O valor inicial não pode deixar a meta com menos de zero guardado.');
        if (position >= 0) data.goals[position] = updated;
        else data.goals.push(updated);
      });
      toast(goal ? 'Meta atualizada.' : 'Meta criada. Um passo mais perto!');
      await ctx.render();
    },
  });
}

function openContribution(ctx, goal, withdrawal = false) {
  openModal({
    title: withdrawal ? 'Retirar da meta' : 'Guardar na meta',
    submitLabel: withdrawal ? 'Retirar' : 'Guardar',
    body: `<p class="muted">${escapeHTML(goal.title)} · ${formatMoney(goalSaved(goal))} guardados</p><div class="form-grid"><label class="field">Valor (R$)<input name="amount" data-money inputmode="numeric" maxlength="18" required placeholder="0,00"></label><label class="field">Data<input name="date" type="date" required max="${dateISO()}" value="${dateISO()}"></label><label class="field full-width"><span>Observação <span class="muted">(opcional)</span></span><input name="note" maxlength="200" placeholder="Ex.: valor separado este mês"></label></div><p class="form-note">${withdrawal ? 'Este valor será retirado apenas do total guardado nesta meta, sem alterar o saldo, as receitas ou as despesas do Extrato.' : 'Este valor será somado apenas a esta meta, sem alterar o saldo, as receitas ou as despesas do Extrato.'} É só um registro no Wallet+: nenhum dinheiro é movimentado no banco.</p>`,
    onSubmit: async formData => {
      const amount = parseMoney(formData.get('amount'));
      const date = String(formData.get('date'));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!date || date > dateISO()) throw new Error('Informe uma data até hoje.');
      await ctx.update(data => {
        recordGoalMovement(data, goal.id, withdrawal ? -amount : amount, date, String(formData.get('note')).trim());
      });
      toast(withdrawal ? 'Valor retirado da meta.' : 'Valor guardado na meta.');
      await ctx.render();
    },
  });
}

function showHistory(goal) {
  openModal({
    title: `Histórico · ${goal.title}`,
    submitLabel: 'Fechar',
    body: `<p class="muted">Valor inicial: ${formatMoney(goal.initialAmount)}</p>${goal.contributions.length ? `<ul class="history-list">${[...goal.contributions].sort((first, second) => second.date.localeCompare(first.date)).map(item => `<li><div><strong>${item.amount > 0 ? 'Guardado' : 'Retirado'}</strong><span class="muted">${formatDate(item.date)}${item.note ? ` · ${escapeHTML(item.note)}` : ''}</span></div><strong class="${item.amount > 0 ? 'positive' : 'negative'}">${formatMoney(item.amount)}</strong></li>`).join('')}</ul>` : '<p class="muted">Seus registros de Guardar e Retirar aparecerão aqui.</p>'}`,
    onSubmit: async () => {},
  });
}

function renderGoalCard(goal) {
  const accumulated = goalSaved(goal);
  const percentage = Math.min(100, Math.floor(accumulated / goal.target * 100));
  const completed = accumulated >= goal.target;
  const goalId = escapeHTML(goal.id);
  const title = escapeHTML(goal.title);
  return `<article class="panel goal-card ${completed ? 'is-complete' : ''}" data-goal-card="${goalId}" aria-label="Meta ${title}">
    <div class="goal-card-heading"><span class="goal-icon">${icon(completed ? 'circle-check' : 'target')}</span><div class="goal-card-tools"><button class="btn btn-icon btn-ghost" data-edit-goal="${goalId}" aria-label="Editar ${title}" title="Editar meta">${icon('pencil')}</button><button class="btn btn-icon btn-ghost" data-delete-goal="${goalId}" aria-label="Excluir ${title}" title="Excluir meta">${icon('trash-2')}</button></div></div>
    <h2>${title}</h2><p class="goal-deadline">${icon('calendar')}<span>${goal.targetDate ? `Até ${formatDate(goal.targetDate)}` : 'Sem prazo definido'}</span></p>
    <div class="goal-saved"><span>Guardado nesta meta</span><strong>${formatMoney(accumulated)}</strong></div>
    <div class="goal-progress-label"><span>${percentage}% concluído</span><span class="${completed ? 'positive' : ''}">${completed ? `${icon('check')} Meta conquistada` : 'Em andamento'}</span></div>
    <div class="progress" role="progressbar" aria-label="Progresso de ${title}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div>
    <div class="goal-targets"><div><span>Quero juntar</span><strong>${formatMoney(goal.target)}</strong></div><div><span>Falta guardar</span><strong class="${completed ? 'positive' : ''}">${formatMoney(Math.max(0, goal.target - accumulated))}</strong></div></div>
    <div class="goal-actions"><button class="btn btn-primary" data-contribute="${goalId}">${icon('plus')} Guardar</button><button class="btn btn-secondary" data-withdraw="${goalId}" ${accumulated <= 0 ? 'disabled' : ''}>Retirar</button></div>
    <button class="btn btn-ghost goal-history-button" data-goal-history="${goalId}">${icon('payment-history')} Ver histórico</button>
  </article>`;
}

export async function render(container, ctx) {
  const goals = ctx.data.goals;
  const saved = goals.reduce((total, goal) => total + goalSaved(goal), 0);
  container.innerHTML = `<section class="goals-page">
    <header class="page-header goals-page-header"><div><h1>Minhas metas</h1></div><button class="btn btn-primary" data-new-goal>${icon('plus')} Criar meta</button></header>
    <section class="goal-overview" aria-label="Dinheiro guardado nas metas">
      <div class="goal-savings-summary"><div class="goal-savings-copy"><span>${icon('target')} Guardado nas metas</span><p>Controle separado do Extrato.</p></div><strong class="purple" data-goals-saved>${formatMoney(saved)}</strong></div>
      <details class="goal-savings-help"><summary>${icon('info')} Como usar as metas ${icon('chevronRight')}</summary><div>
        <p><strong>Guardar:</strong> aumenta apenas o valor guardado nesta meta, sem alterar o saldo do Extrato.</p>
        <p><strong>Retirar:</strong> diminui apenas o valor guardado nesta meta, sem gerar receita.</p>
        <p>Metas não são receitas nem despesas e não movimentam dinheiro no banco. Criar, editar ou excluir uma meta também não altera o Extrato. <a href="#dashboard">Ver meu saldo.</a></p>
      </div></details>
    </section>
    <section class="goals-list-section" aria-label="Seus objetivos"><div class="goals-section-heading"><h2>Seus objetivos</h2><span data-goal-count>${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}</span></div>
      ${goals.length ? `<div class="goals-grid ${goals.length === 1 ? 'single-goal' : ''}">${goals.map(renderGoalCard).join('')}</div>` : `<div class="panel">${emptyState('Qual será sua próxima conquista?', 'Crie uma reserva de emergência, planeje uma viagem ou dê um nome ao seu sonho.', '<button class="btn btn-primary" data-new-goal>Criar minha primeira meta</button>')}</div>`}
    </section>
  </section>`;
  container.onclick = async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-new-goal')) openGoal(ctx);
    if (button.dataset.editGoal) openGoal(ctx, ctx.data.goals.find(goal => goal.id === button.dataset.editGoal));
    if (button.dataset.contribute) openContribution(ctx, ctx.data.goals.find(goal => goal.id === button.dataset.contribute));
    if (button.dataset.withdraw) openContribution(ctx, ctx.data.goals.find(goal => goal.id === button.dataset.withdraw), true);
    if (button.dataset.goalHistory) showHistory(ctx.data.goals.find(goal => goal.id === button.dataset.goalHistory));
    if (button.dataset.deleteGoal) {
      const goal = ctx.data.goals.find(item => item.id === button.dataset.deleteGoal);
      if (await confirmDialog('Excluir esta meta?', `“${goal.title}”, os registros de ${formatMoney(goalSaved(goal))} guardados e seu histórico serão removidos. O saldo e as transações do Extrato não serão alterados.`)) {
        try {
          await ctx.update(data => { data.goals = data.goals.filter(item => item.id !== goal.id); });
          toast('Meta excluída.');
          await ctx.render();
        } catch (error) { toast(error.message, 'error'); }
      }
    }
  };
}
