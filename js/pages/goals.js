import { escapeHTML, icon, emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { formatMoney, parseMoney, formatDate, dateISO, goalSaved, getSummary, monthKey } from '../domain/finance.js';

const moneyValue = amount => (amount / 100).toFixed(2).replace('.', ',');

function openGoal(ctx, goal = null) {
  openModal({
    title: goal ? 'Editar meta' : 'Uma nova conquista começa aqui',
    body: `<div class="form-grid"><label class="field full-width">Nome da meta<input name="title" required maxlength="100" placeholder="Ex.: minha reserva de emergência" value="${escapeHTML(goal?.title || '')}"></label><label class="field">Valor desejado (R$)<input name="target" inputmode="decimal" required maxlength="16" placeholder="0,00" value="${goal ? moneyValue(goal.target) : ''}"></label><label class="field">Valor inicialmente guardado (R$)<input name="initialAmount" inputmode="decimal" required maxlength="16" value="${moneyValue(goal?.initialAmount || 0)}"></label><label class="field full-width">Data-alvo <span class="muted">(opcional)</span><input name="targetDate" type="date" value="${goal?.targetDate || ''}"></label><p class="form-note full-width">O valor guardado representa uma reserva, não uma nova receita. Para que o saldo financeiro reflita dinheiro anterior ao uso do Wallet+, registre esse valor como receita nas transações.</p></div>`,
    onSubmit: async formData => {
      const title = String(formData.get('title')).trim();
      const target = parseMoney(formData.get('target'));
      const initialAmount = parseMoney(formData.get('initialAmount'));
      if (!title) throw new Error('Dê um nome à sua meta.');
      if (!Number.isSafeInteger(target) || target <= 0) throw new Error('Informe um valor desejado maior que zero.');
      if (!Number.isSafeInteger(initialAmount) || initialAmount < 0) throw new Error('O valor guardado deve ser zero ou positivo.');
      const updated = { ...goal, id: goal?.id || crypto.randomUUID(), title, target, initialAmount, targetDate: String(formData.get('targetDate')), contributions: goal?.contributions || [] };
      if (goalSaved(updated) < 0) throw new Error('O valor inicial não pode tornar o total reservado negativo.');
      await ctx.update(data => {
        const position = data.goals.findIndex(item => item.id === updated.id);
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
    title: withdrawal ? 'Retirar da reserva' : 'Adicionar contribuição',
    submitLabel: withdrawal ? 'Registrar retirada' : 'Reservar valor',
    body: `<p class="muted">${escapeHTML(goal.title)} · ${formatMoney(goalSaved(goal))} reservados</p><div class="form-grid"><label class="field">Valor (R$)<input name="amount" inputmode="decimal" maxlength="16" required placeholder="0,00"></label><label class="field">Data<input name="date" type="date" required max="${dateISO()}" value="${dateISO()}"></label><label class="field full-width">Observação <span class="muted">(opcional)</span><input name="note" maxlength="200" placeholder="Ex.: contribuição do mês"></label></div><p class="form-note">${withdrawal ? 'A retirada libera dinheiro reservado. Se você gastou esse valor, registre a despesa separadamente.' : 'Uma contribuição apenas reserva dinheiro para esta meta. Ela não reduz seu saldo financeiro nem conta como despesa.'}</p>`,
    onSubmit: async formData => {
      const amount = parseMoney(formData.get('amount'));
      const date = String(formData.get('date'));
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Informe um valor maior que zero.');
      if (!date || date > dateISO()) throw new Error('Informe uma data até hoje.');
      await ctx.update(data => {
        const currentGoal = data.goals.find(item => item.id === goal.id);
        if (!currentGoal) throw new Error('Esta meta não está mais disponível.');
        if (withdrawal && amount > goalSaved(currentGoal)) throw new Error('A retirada não pode superar o valor reservado.');
        currentGoal.contributions.push({ id: crypto.randomUUID(), amount: withdrawal ? -amount : amount, date, note: String(formData.get('note')).trim() });
      });
      toast(withdrawal ? 'Retirada registrada.' : 'Contribuição registrada!');
      await ctx.render();
    },
  });
}

function showHistory(goal) {
  openModal({
    title: `Histórico · ${goal.title}`,
    submitLabel: 'Fechar',
    body: `<p class="muted">Reserva inicial: ${formatMoney(goal.initialAmount)}</p>${goal.contributions.length ? `<ul class="history-list">${[...goal.contributions].sort((first, second) => second.date.localeCompare(first.date)).map(item => `<li><div><strong>${item.amount > 0 ? 'Contribuição' : 'Retirada'}</strong><span class="muted">${formatDate(item.date)}${item.note ? ` · ${escapeHTML(item.note)}` : ''}</span></div><strong class="${item.amount > 0 ? 'positive' : 'negative'}">${formatMoney(item.amount)}</strong></li>`).join('')}</ul>` : '<p class="muted">Suas contribuições e retiradas aparecerão aqui.</p>'}`,
    onSubmit: async () => {},
  });
}

export async function render(container, ctx) {
  const summary = getSummary(ctx.data, monthKey(dateISO()));
  const saved = ctx.data.goals.reduce((total, goal) => total + goalSaved(goal), 0);
  container.innerHTML = `<header class="page-header"><div><p class="eyebrow">UM PASSO DE CADA VEZ</p><h1>Minhas metas</h1><p class="muted">Transforme seus planos em conquistas reais.</p></div><button class="btn btn-primary" data-new-goal>${icon('plus')} Criar meta</button></header>
    <div class="stats-grid goal-stats"><article class="stat-card"><span class="muted">Saldo financeiro registrado</span><strong>${formatMoney(summary.balance)}</strong></article><article class="stat-card"><span class="muted">Reservado para metas</span><strong class="purple">${formatMoney(saved)}</strong></article><article class="stat-card"><span class="muted">Saldo após reservas</span><strong class="${summary.balance - saved < 0 ? 'negative' : 'positive'}">${formatMoney(summary.balance - saved)}</strong></article></div>
    <p class="form-note">O valor reservado faz parte do saldo financeiro; os valores não devem ser somados.${saved > summary.balance ? ' Suas reservas superam o saldo registrado. Verifique se todas as receitas e saldos anteriores já foram registrados.' : ''}</p>
    ${ctx.data.goals.length ? `<div class="card-grid goals-grid">${ctx.data.goals.map(goal => {
      const accumulated = goalSaved(goal);
      const percentage = Math.min(100, Math.floor(accumulated / goal.target * 100));
      return `<article class="panel goal-card"><div class="goal-card-heading"><span class="goal-icon">${icon(accumulated >= goal.target ? 'circle-check' : 'target')}</span><div class="row-actions"><button class="btn btn-icon btn-ghost" data-edit-goal="${goal.id}" aria-label="Editar ${escapeHTML(goal.title)}">${icon('pencil')}</button><button class="btn btn-icon btn-ghost" data-delete-goal="${goal.id}" aria-label="Excluir ${escapeHTML(goal.title)}">${icon('trash-2')}</button></div></div><h2>${escapeHTML(goal.title)}</h2><p class="muted">${goal.targetDate ? `Até ${formatDate(goal.targetDate)}` : 'No seu ritmo, sem prazo definido'}</p><div class="goal-amount"><strong>${formatMoney(accumulated)}</strong><span class="muted">de ${formatMoney(goal.target)}</span></div><div class="progress" role="progressbar" aria-label="Progresso de ${escapeHTML(goal.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}"><span style="width:${percentage}%"></span></div><div class="goal-progress-label"><span>${percentage}% concluído</span><span class="${accumulated >= goal.target ? 'positive' : 'muted'}">${accumulated >= goal.target ? 'Meta conquistada!' : `Faltam ${formatMoney(goal.target - accumulated)}`}</span></div><div class="goal-actions"><button class="btn btn-primary" data-contribute="${goal.id}">${icon('plus')} Contribuir</button><button class="btn btn-secondary" data-withdraw="${goal.id}" ${accumulated <= 0 ? 'disabled' : ''}>Retirar</button><button class="btn btn-ghost" data-goal-history="${goal.id}">Histórico</button></div></article>`;
    }).join('')}</div>` : `<section class="panel">${emptyState('Qual será sua próxima conquista?', 'Crie uma reserva de emergência, planeje uma viagem ou dê um nome ao seu sonho.', '<button class="btn btn-primary" data-new-goal>Criar minha primeira meta</button>')}</section>`}`;
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
      if (await confirmDialog('Excluir esta meta?', `“${goal.title}” e seu histórico serão removidos. O saldo financeiro não será alterado; ${formatMoney(goalSaved(goal))} deixarão de estar reservados.`)) {
        try {
          await ctx.update(data => { data.goals = data.goals.filter(item => item.id !== goal.id); });
          toast('Meta excluída.');
          await ctx.render();
        } catch (error) { toast(error.message, 'error'); }
      }
    }
  };
}
