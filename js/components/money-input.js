const initializedInputs = new WeakSet();

export function formatMoneyInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${whole},${padded.slice(-2)}`;
}

function normalizeInput(input) {
  const original = input.value;
  const selection = input.selectionStart ?? original.length;
  let digitsAfterCursor = original.slice(selection).replace(/\D/g, '').length;
  input.value = formatMoneyInput(original);
  let cursor = input.value.length;
  while (cursor > 0 && digitsAfterCursor > 0) {
    cursor -= 1;
    if (/\d/.test(input.value[cursor])) digitsAfterCursor -= 1;
  }
  input.setSelectionRange(cursor, cursor);
}

export function initializeMoneyInputs(container) {
  container.querySelectorAll('input[data-money]').forEach(input => {
    if (initializedInputs.has(input)) return;
    initializedInputs.add(input);
    input.inputMode = 'numeric';
    input.value = formatMoneyInput(input.value);
    input.addEventListener('input', () => normalizeInput(input));
    input.addEventListener('beforeinput', event => {
      if (event.inputType === 'insertText' && event.data && /\D/.test(event.data)) {
        event.preventDefault();
        return;
      }
      const backward = event.inputType === 'deleteContentBackward';
      const forward = event.inputType === 'deleteContentForward';
      if ((!backward && !forward) || input.selectionStart !== input.selectionEnd) return;
      if (input.value === '0,00') {
        event.preventDefault();
        input.value = '';
        input.dispatchEvent(new Event('input', {bubbles: true}));
        return;
      }
      let position = input.selectionStart + (backward ? -1 : 0);
      if (!/[.,]/.test(input.value[position] || '')) return;
      event.preventDefault();
      while (position >= 0 && position < input.value.length && /[.,]/.test(input.value[position])) position += backward ? -1 : 1;
      if (position < 0 || position >= input.value.length) return;
      input.setRangeText('', position, position + 1, 'end');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    input.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text');
      if (text && !/^(?:R\$\s*)?[\d.,\s]+$/.test(text.trim())) event.preventDefault();
    });
  });
}
