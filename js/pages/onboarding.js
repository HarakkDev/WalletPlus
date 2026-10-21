import { escapeHTML, icon, toast, confirmDialog } from '../components/ui.js';
import { formatMoney, parseMoney, monthKey } from '../domain/finance.js';
import { initializeMoneyInputs } from '../components/money-input.js';

const incomeNames = ['Salário', 'Aluguel recebido', 'Aposentadoria ou pensão', 'Trabalho autônomo', 'Freelance', 'Renda extra', 'Outros'];
const essentialNames = ['Aluguel ou prestação do imóvel', 'Energia elétrica', 'Água', 'Internet residencial', 'Plano de celular', 'Condomínio', 'Plano de saúde', 'Transporte recorrente', 'Mensalidade escolar ou faculdade', 'Seguro', 'Outras despesas fixas'];
const subscriptionNames = ['Netflix', 'Spotify', 'Amazon Prime', 'Disney+', 'YouTube Premium', 'Academia', 'Jogos e aplicativos', 'Outras assinaturas'];
const goalNames = ['Criar uma reserva de emergência', 'Comprar um celular', 'Comprar um notebook', 'Fazer uma viagem', 'Comprar um veículo', 'Quitar dívidas', 'Criar uma meta personalizada'];
const stepNames = ['Renda', 'Contas essenciais', 'Assinaturas', 'Metas', 'Seu resumo'];
const amountText = amount => (Number(amount || 0) / 100).toFixed(2).replace('.', ',');
const newId = () => crypto.randomUUID();
const field = (label, name, value = '', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${escapeHTML(value)}" ${extra}></label>`;
const moneyField = (label, name, value = '', required = true) => field(label, name, value, `data-money inputmode="numeric" placeholder="0,00" ${required ? 'required' : ''} autocomplete="off" maxlength="18"`);

function prepareBills(data, group, suggestions) {
  const existing = data.bills.filter(bill => bill.group === group);
  return [...existing.map(bill => ({ ...bill, existing: true, enabled: bill.active !== false, amountText: amountText(bill.amount) })), ...suggestions.filter(name => !existing.some(bill => bill.name === name)).map(name => ({ id: newId(), name, amountText: '', day: 10, group, category: group === 'essential' ? 'Contas Fixas' : 'Assinaturas', enabled: false, active: true }))];
}

function positiveMoney(value, label, allowZero = false) {
  if (!String(value).trim()) {
    if (allowZero) return 0;
    throw new Error(`Informe o valor de ${label}.`);
  }
  const amount = parseMoney(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) throw new Error(`Informe um valor ${allowZero ? 'válido, igual ou maior que zero' : 'maior que zero'} para ${label}.`);
  return amount;
}

export async function render(container, ctx) {
  const original = structuredClone(ctx.data);
  const draft = {
    incomes: original.incomeSources.map(source => ({ ...source, amountText: amountText(source.amount) })),
    essentials: prepareBills(original, 'essential', essentialNames),
    subscriptions: prepareBills(original, 'subscription', subscriptionNames),
    goals: original.goals.map(goal => ({ ...goal, targetText: amountText(goal.target), initialText: amountText(goal.initialAmount) })),
  };
  let step = 0;
  let saving = false;

  function capture() {
    const form = container.querySelector('#onboarding-form');
    if (!form) return;
    const formData = new FormData(form);
    if (step === 0) draft.incomes.forEach(source => {
      source.name = String(formData.get(`income-name-${source.id}`) ?? source.name).trim();
      source.amountText = String(formData.get(`income-amount-${source.id}`) ?? source.amountText);
      source.frequency = String(formData.get(`income-frequency-${source.id}`) ?? source.frequency);
      source.day = Number(formData.get(`income-day-${source.id}`) || source.day || 1);
      source.date = String(formData.get(`income-date-${source.id}`) ?? source.date ?? '');
      source.active = formData.has(`income-active-${source.id}`);
    });
    if (step === 1 || step === 2) draft[step === 1 ? 'essentials' : 'subscriptions'].forEach(bill => {
      bill.enabled = formData.has(`bill-enabled-${bill.id}`);
      bill.name = String(formData.get(`bill-name-${bill.id}`) ?? bill.name).trim();
      bill.amountText = String(formData.get(`bill-amount-${bill.id}`) ?? bill.amountText);
      bill.day = Number(formData.get(`bill-day-${bill.id}`) || bill.day || 1);
    });
    if (step === 3) draft.goals.forEach(goal => {
      goal.title = String(formData.get(`goal-title-${goal.id}`) ?? goal.title).trim();
      goal.targetText = String(formData.get(`goal-target-${goal.id}`) ?? goal.targetText);
      goal.initialText = String(formData.get(`goal-initial-${goal.id}`) ?? goal.initialText);
      goal.targetDate = String(formData.get(`goal-date-${goal.id}`) ?? goal.targetDate ?? '');
    });
  }

  function validate(currentStep) {
    if (currentStep === 0) draft.incomes.forEach(source => {
      if (!source.name) throw new Error('Dê um nome para cada fonte de renda.');
      positiveMoney(source.amountText, source.name);
      if (source.frequency === 'monthly' && (!Number.isInteger(source.day) || source.day < 1 || source.day > 31)) throw new Error('O dia de recebimento precisa estar entre 1 e 31.');
      if (source.frequency === 'once' && !/^\d{4}-\d{2}-\d{2}$/.test(source.date)) throw new Error('Informe a data prevista da renda pontual.');
      const previous = original.incomeSources.find(item => item.id === source.id);
      const receipts = original.transactions.filter(transaction => transaction.recurringKind === 'income' && transaction.recurringId === source.id);
      if (receipts.length && previous?.frequency !== source.frequency) throw new Error('Esta fonte já tem recebimentos confirmados. Preserve a frequência e crie uma nova fonte para mudar o planejamento.');
      if (source.frequency === 'once' && receipts.some(receipt => receipt.referenceMonth !== source.date.slice(0, 7))) throw new Error('Esta renda pontual já foi recebida. Preserve seu mês previsto ou remova primeiro o recebimento no Extrato.');
    });
    if (currentStep === 1 || currentStep === 2) draft[currentStep === 1 ? 'essentials' : 'subscriptions'].filter(bill => bill.enabled).forEach(bill => {
      if (!bill.name) throw new Error('Informe o nome de cada conta selecionada.');
      positiveMoney(bill.amountText, bill.name);
      if (!Number.isInteger(bill.day) || bill.day < 1 || bill.day > 31) throw new Error('O vencimento precisa estar entre os dias 1 e 31.');
    });
    if (currentStep === 3) draft.goals.forEach(goal => {
      if (!goal.title) throw new Error('Dê um nome para cada meta.');
      positiveMoney(goal.targetText, goal.title);
      const initialAmount = positiveMoney(goal.initialText, 'valor já guardado', true);
      let runningAmount = initialAmount;
      for (const contribution of goal.contributions || []) {
        runningAmount += contribution.amount;
        if (runningAmount < 0) throw new Error('O valor inicial não pode deixar a meta com saldo negativo após as retiradas existentes.');
      }
    });
  }

  function incomeStep() {
    return `<div class="onboarding-intro"><span class="eyebrow">ETAPA 1 · SUAS ENTRADAS</span><h2>De onde vem seu dinheiro?</h2><p class="muted">Vamos conhecer melhor suas finanças. Adicione quantas fontes de renda precisar. Elas são previsões: só entram no saldo quando você confirmar o recebimento.</p></div><div class="suggestion-list">${incomeNames.map(name => `<button type="button" class="suggestion-chip" data-add-income="${escapeHTML(name)}">${icon('plus')} ${name}</button>`).join('')}</div><div class="onboarding-records">${draft.incomes.length ? draft.incomes.map(source => `<article class="onboarding-record"><div class="record-heading"><h3>${icon('wallet')} Fonte de renda</h3><button class="btn btn-ghost btn-icon" type="button" data-remove-income="${source.id}" aria-label="Remover ${escapeHTML(source.name)}">${icon('trash-2')}</button></div><div class="form-grid">${field('Descrição', `income-name-${source.id}`, source.name, 'required maxlength="100"')}${moneyField('Valor previsto (R$)', `income-amount-${source.id}`, source.amountText)}<label class="field"><span>Frequência</span><select name="income-frequency-${source.id}" data-frequency><option value="monthly" ${source.frequency === 'monthly' ? 'selected' : ''}>Mensal</option><option value="once" ${source.frequency === 'once' ? 'selected' : ''}>Pontual</option></select></label>${source.frequency === 'monthly' ? field('Dia previsto de recebimento', `income-day-${source.id}`, source.day || 1, 'type="number" min="1" max="31" required') : field('Data prevista de recebimento', `income-date-${source.id}`, source.date || '', 'type="date" required')}<label class="check-label"><input type="checkbox" name="income-active-${source.id}" ${source.active !== false ? 'checked' : ''}> Fonte de renda ativa</label></div></article>`).join('') : '<div class="onboarding-tip">Você pode adicionar uma renda agora ou continuar e fazer isso depois.</div>'}</div>`;
  }

  function billStep(group) {
    const essential = group === 'essentials';
    return `<div class="onboarding-intro"><span class="eyebrow">ETAPA ${essential ? 2 : 3} · ${essential ? 'O ESSENCIAL' : 'SEU ESTILO DE VIDA'}</span><h2>${essential ? 'Quais contas fazem parte da sua rotina?' : 'E as suas assinaturas?'}</h2><p class="muted">${essential ? 'Selecione suas despesas essenciais e informe o valor e o vencimento. Nenhuma opção é obrigatória.' : 'Streaming, academia e outros serviços ficam separados das contas essenciais. Selecione apenas o que faz parte da sua vida.'}</p></div><div class="bill-checklist">${draft[group].map(bill => `<article class="bill-choice ${bill.enabled ? 'is-selected' : ''}"><label class="bill-choice-toggle"><input type="checkbox" name="bill-enabled-${bill.id}" data-bill-toggle ${bill.enabled ? 'checked' : ''}><span>${icon(essential ? 'house' : 'play')} ${escapeHTML(bill.name || 'Nova conta personalizada')}</span></label>${bill.enabled ? `<div class="form-grid bill-choice-fields">${field('Nome da conta', `bill-name-${bill.id}`, bill.name, 'required maxlength="100"')}${moneyField('Valor mensal (R$)', `bill-amount-${bill.id}`, bill.amountText)}${field('Dia do vencimento', `bill-day-${bill.id}`, bill.day, 'type="number" min="1" max="31" required')}</div>` : ''}</article>`).join('')}</div><button type="button" class="btn btn-secondary" data-add-bill="${group}">${icon('plus')} Adicionar ${essential ? 'conta personalizada' : 'outro serviço'}</button><p class="muted onboarding-note">Ao revisar seu planejamento, desmarcar uma conta a desativa. Os pagamentos anteriores continuam no histórico.</p>`;
  }

  function goalsStep() {
    return `<div class="onboarding-intro"><span class="eyebrow">ETAPA 4 · OLHANDO PARA O FUTURO</span><h2>Qual conquista vem a seguir?</h2><p class="muted">Você tem algum objetivo financeiro que gostaria de alcançar? Comece pequeno ou pule esta etapa para decidir depois.</p></div><div class="suggestion-list">${goalNames.map(name => `<button class="suggestion-chip" type="button" data-add-goal="${escapeHTML(name)}">${icon('plus')} ${name}</button>`).join('')}</div><div class="onboarding-records">${draft.goals.map(goal => `<article class="onboarding-record goal-record"><div class="record-heading"><h3>${icon('target')} Sua meta</h3><button type="button" class="btn btn-ghost btn-icon" data-remove-goal="${goal.id}" aria-label="Remover meta ${escapeHTML(goal.title)}">${icon('trash-2')}</button></div><div class="form-grid">${field('Título da meta', `goal-title-${goal.id}`, goal.title, 'required maxlength="100"')}${moneyField('Valor desejado (R$)', `goal-target-${goal.id}`, goal.targetText)}${moneyField('Valor inicial já guardado (R$)', `goal-initial-${goal.id}`, goal.initialText, false)}${field('Data-alvo (opcional)', `goal-date-${goal.id}`, goal.targetDate, 'type="date"')}</div>${goal.contributions.length ? '<p class="muted onboarding-note">O histórico de Guardar e Retirar será mantido e somado ao valor inicial.</p>' : ''}</article>`).join('')}</div><div class="onboarding-tip">${icon('info')} As metas têm controle próprio: o valor já guardado não altera o saldo, as receitas ou as despesas do Extrato.</div>`;
  }

  function summaryStep() {
    const income = draft.incomes.filter(source => source.active !== false && source.frequency === 'monthly').reduce((total, source) => total + parseMoney(source.amountText), 0);
    const essentials = draft.essentials.filter(bill => bill.enabled).reduce((total, bill) => total + parseMoney(bill.amountText), 0);
    const subscriptions = draft.subscriptions.filter(bill => bill.enabled).reduce((total, bill) => total + parseMoney(bill.amountText), 0);
    const remaining = income - essentials - subscriptions;
    return `<div class="onboarding-intro"><span class="eyebrow">ETAPA 5 · TUDO PRONTO</span><h2>Seu dinheiro, com mais direção.</h2><p class="muted">Este é o seu planejamento mensal. O painel começa com os valores efetivamente registrados, e você confirma receitas e pagamentos conforme acontecerem.</p></div><div class="onboarding-summary"><div><span>Renda mensal prevista</span><strong class="positive">${formatMoney(income)}</strong></div><div><span>Gastos fixos essenciais previstos</span><strong>${formatMoney(essentials)}</strong></div><div><span>Assinaturas previstas</span><strong>${formatMoney(subscriptions)}</strong></div><div><span>Total de gastos recorrentes</span><strong class="negative">${formatMoney(essentials + subscriptions)}</strong></div><div class="summary-total"><span>Valor mensal previsto restante</span><strong class="${remaining >= 0 ? 'positive' : 'negative'}">${formatMoney(remaining)}</strong></div></div><p class="muted onboarding-note">Rendas pontuais não entram neste resumo mensal recorrente. No painel, são consideradas apenas no mês previsto.</p><h3 class="onboarding-goals-title">${icon('target')} Suas metas (${draft.goals.length})</h3>${draft.goals.length ? `<div class="onboarding-goal-summary">${draft.goals.map(goal => `<div><span>${escapeHTML(goal.title)}</span><strong>${formatMoney(parseMoney(goal.targetText))}</strong></div>`).join('')}</div>` : '<p class="muted">Nenhuma meta por enquanto. Você pode criar sua primeira meta no painel.</p>'}`;
  }

  async function finish() {
    if (saving) return;
    saving = true;
    const finishButton = container.querySelector('[data-continue]');
    if (finishButton) finishButton.disabled = true;
    try {
      [0, 1, 2, 3].forEach(validate);
      const incomeSources = draft.incomes.map(source => ({ id: source.id, name: source.name, amount: positiveMoney(source.amountText, source.name), frequency: source.frequency, day: source.day || 1, date: source.frequency === 'once' ? source.date : '', category: source.category || ({ 'Salário': 'Salário', 'Aluguel recebido': 'Aluguel Recebido', 'Freelance': 'Freelance', 'Renda extra': 'Renda Extra' }[source.name] || 'Outros'), active: source.active !== false, startMonth: source.frequency === 'once' ? source.date.slice(0, 7) : source.startMonth || monthKey() }));
      original.incomeSources.filter(source => !incomeSources.some(current => current.id === source.id)).forEach(source => incomeSources.push({ ...source, active: false }));
      const bills = [...draft.essentials, ...draft.subscriptions].filter(bill => bill.enabled || bill.existing).map(bill => ({ id: bill.id, name: bill.name, amount: bill.enabled ? positiveMoney(bill.amountText, bill.name) : bill.amount, day: bill.day, category: bill.category, group: bill.group, active: bill.enabled, startMonth: bill.startMonth || monthKey() }));
      const goals = draft.goals.map(goal => ({ id: goal.id, title: goal.title, target: positiveMoney(goal.targetText, goal.title), initialAmount: positiveMoney(goal.initialText, 'valor já guardado', true), targetDate: goal.targetDate || '', contributions: goal.contributions || [] }));
      await ctx.update(current => ({ ...current, incomeSources, bills, goals }));
      await ctx.updateAccount({ onboardingComplete: true });
      toast('Planejamento salvo. Seu próximo passo começa aqui!');
      ctx.navigate('dashboard');
    } catch (error) {
      toast(error.message || 'Não foi possível salvar seu planejamento.', 'error');
      saving = false;
      if (finishButton) finishButton.disabled = false;
    }
  }

  function draw() {
    container.innerHTML = `<section class="onboarding-page"><header class="page-header"><div><span class="eyebrow">SEU PRIMEIRO PASSO</span><h1>${ctx.account.onboardingComplete ? 'Revisar meu planejamento' : 'Vamos começar, ' + escapeHTML(ctx.account.name.split(' ')[0]) + '?'}</h1><p class="muted">Um pouco de organização hoje. Mais tranquilidade amanhã.</p></div>${ctx.account.onboardingComplete ? '<button type="button" class="btn btn-ghost" data-cancel>Cancelar revisão</button>' : ''}</header><nav class="onboarding-steps" aria-label="Etapas do planejamento">${stepNames.map((name, index) => `<div class="onboarding-step ${index === step ? 'is-current' : ''} ${index < step ? 'is-complete' : ''}" ${index === step ? 'aria-current="step"' : ''}><span>${index < step ? icon('check') : index + 1}</span><small>${name}</small></div>`).join('')}</nav><div class="progress onboarding-progress" role="progressbar" aria-label="Progresso do planejamento" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${step + 1}"><span style="width:${(step + 1) * 20}%"></span></div><form id="onboarding-form" class="panel onboarding-panel"><div class="onboarding-step-content">${step === 0 ? incomeStep() : step === 1 ? billStep('essentials') : step === 2 ? billStep('subscriptions') : step === 3 ? goalsStep() : summaryStep()}</div><footer class="onboarding-footer"><button type="button" class="btn btn-secondary" data-back ${step === 0 ? 'disabled' : ''}>${icon('arrow-left')} Voltar</button><span class="muted">Etapa ${step + 1} de 5</span><button type="submit" class="btn btn-primary" data-continue>${step === 4 ? 'Ir para meu painel' : step === 3 && !draft.goals.length ? 'Pular esta etapa' : 'Continuar'} ${icon('arrow-right')}</button></footer></form></section>`;
    initializeMoneyInputs(container);
    container.querySelector('#onboarding-form').addEventListener('submit', async event => {
      event.preventDefault();
      capture();
      try {
        validate(step);
        if (step === 4) await finish();
        else { step += 1; draw(); container.querySelector('h2')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      } catch (error) { toast(error.message, 'error'); }
    });
    container.querySelector('[data-back]').addEventListener('click', () => { capture(); step = Math.max(0, step - 1); draw(); });
    container.querySelector('[data-cancel]')?.addEventListener('click', async () => { if (await confirmDialog('Cancelar revisão?', 'As alterações desta revisão ainda não foram salvas.', 'Descartar alterações')) ctx.navigate('settings'); });
    container.querySelectorAll('[data-add-income]').forEach(button => button.addEventListener('click', () => { capture(); draft.incomes.push({ id: newId(), name: button.dataset.addIncome === 'Outros' ? '' : button.dataset.addIncome, amountText: '', frequency: 'monthly', day: 5, active: true }); draw(); container.querySelector('.onboarding-record:last-child input')?.focus(); }));
    container.querySelectorAll('[data-remove-income]').forEach(button => button.addEventListener('click', () => { capture(); draft.incomes = draft.incomes.filter(source => source.id !== button.dataset.removeIncome); draw(); }));
    container.querySelectorAll('[data-frequency], [data-bill-toggle]').forEach(input => input.addEventListener('change', () => { capture(); draw(); }));
    container.querySelector('[data-add-bill]')?.addEventListener('click', event => { capture(); const group = event.currentTarget.dataset.addBill; draft[group].push({ id: newId(), name: '', amountText: '', day: 10, enabled: true, group: group === 'essentials' ? 'essential' : 'subscription', category: group === 'essentials' ? 'Contas Fixas' : 'Assinaturas' }); draw(); container.querySelector('.bill-choice:last-child input[type="text"], .bill-choice:last-child input:not([type])')?.focus(); });
    container.querySelectorAll('[data-add-goal]').forEach(button => button.addEventListener('click', () => { capture(); draft.goals.push({ id: newId(), title: button.dataset.addGoal === 'Criar uma meta personalizada' ? '' : button.dataset.addGoal, targetText: '', initialText: '0,00', targetDate: '', contributions: [] }); draw(); container.querySelector('.goal-record:last-child input')?.focus(); }));
    container.querySelectorAll('[data-remove-goal]').forEach(button => button.addEventListener('click', async () => { capture(); if (original.goals.some(goal => goal.id === button.dataset.removeGoal) && !await confirmDialog('Remover meta do planejamento?', 'Ao concluir a revisão, esta meta e seu histórico de contribuições serão excluídos. O histórico de transações será preservado.', 'Remover meta')) return; draft.goals = draft.goals.filter(goal => goal.id !== button.dataset.removeGoal); draw(); }));
  }

  draw();
}
