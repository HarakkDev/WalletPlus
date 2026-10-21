export const MAX_MONEY = 1_000_000_000_000;

export function requireText(value, label = 'Campo', maxLength = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(`${label}: informe um texto de até ${maxLength} caracteres.`);
  }
  return value.trim();
}

export function requireMoney(value, label = 'Valor', allowZero = false) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > MAX_MONEY) {
    throw new Error(`${label}: informe um valor ${allowZero ? 'igual ou maior que zero' : 'maior que zero'} de até R$ 10 bilhões.`);
  }
  return value;
}

export function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
}

export function requireDate(value, label = 'Data') {
  if (!isDate(value)) throw new Error(`${label}: informe uma data válida.`);
  return value;
}

export function requireMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) < 1900) {
    throw new Error('Informe um mês de referência válido.');
  }
  return value;
}

export function requireDay(value) {
  if (!Number.isInteger(value) || value < 1 || value > 31) throw new Error('O vencimento deve ser um dia entre 1 e 31.');
  return value;
}

export function requireEnum(value, options, label) {
  if (!options.includes(value)) throw new Error(`${label} inválido.`);
  return value;
}

export function requireEmail(value) {
  const email = requireText(value, 'E-mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  return email;
}
