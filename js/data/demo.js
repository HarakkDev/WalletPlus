import { confirmRecurring, dateISO, monthKey, recurringDate, shiftMonth, uid } from '../domain/finance.js';

export function createDemoData() {
  const currentMonth = monthKey();
  const startMonth = shiftMonth(currentMonth, -5);
  const data = {
    incomeSources: [
      { id: uid(), name: 'Salário de exemplo', amount: 480000, frequency: 'monthly', day: 5, startMonth, active: true, category: 'Salário' },
      { id: uid(), name: 'Freelance de exemplo', amount: 85000, frequency: 'monthly', day: 15, startMonth, active: true, category: 'Freelance' },
    ],
    bills: [
      { id: uid(), name: 'Aluguel', amount: 130000, day: 10, category: 'Moradia', group: 'essential', active: true, startMonth },
      { id: uid(), name: 'Energia elétrica', amount: 17890, day: 18, category: 'Contas Fixas', group: 'essential', active: true, startMonth },
      { id: uid(), name: 'Internet', amount: 9990, day: 23, category: 'Contas Fixas', group: 'essential', active: true, startMonth },
      { id: uid(), name: 'Spotify', amount: 2190, day: 12, category: 'Assinaturas', group: 'subscription', active: true, startMonth },
      { id: uid(), name: 'Academia', amount: 11990, day: 28, category: 'Saúde', group: 'subscription', active: true, startMonth },
    ],
    transactions: [],
    goals: [
      { id: uid(), title: 'Reserva de emergência', target: 1800000, initialAmount: 0, targetDate: recurringDate(shiftMonth(currentMonth, 12), 20), contributions: [{ id: uid(), amount: 350000, date: recurringDate(startMonth, 28), note: 'Alocação ilustrativa' }] },
      { id: uid(), title: 'Próxima viagem', target: 650000, initialAmount: 0, targetDate: recurringDate(shiftMonth(currentMonth, 8), 10), contributions: [{ id: uid(), amount: 175000, date: recurringDate(startMonth, 28), note: 'Alocação ilustrativa' }] },
      { id: uid(), title: 'Notebook novo', target: 500000, initialAmount: 0, targetDate: '', contributions: [{ id: uid(), amount: 90000, date: recurringDate(startMonth, 28), note: 'Alocação ilustrativa' }] },
    ],
    categories: [],
  };
  const today = dateISO();
  for (let offset = -5; offset <= 0; offset += 1) {
    const reference = shiftMonth(currentMonth, offset);
    for (const source of data.incomeSources) {
      const receivedAt = recurringDate(reference, source.day);
      if (receivedAt <= today) confirmRecurring(data, 'income', source.id, reference, receivedAt);
    }
    for (const bill of data.bills) {
      const paidAt = recurringDate(reference, bill.day);
      if (paidAt <= today) confirmRecurring(data, 'bill', bill.id, reference, paidAt);
    }
    const examples = [
      ['Compras no mercado', 39280 + (offset + 5) * 1970, 'Alimentação', 6],
      ['Transporte da semana', 12450 + (offset + 5) * 810, 'Transporte', 9],
      ['Almoço com amigos', 8990 + (offset + 5) * 290, 'Lazer', 17],
      ['Curso online', 14900, 'Educação', 21],
    ];
    for (const [description, amount, category, day] of examples) {
      const date = recurringDate(reference, day);
      if (date <= today) data.transactions.push({ id: uid(), type: 'expense', description, amount, date, category, paymentMethod: 'Pix', notes: 'Dado fictício exclusivo da demonstração.' });
    }
  }
  return data;
}
