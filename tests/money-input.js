import {initializeMoneyInputs} from '../js/components/money-input.js';
import {parseMoney} from '../js/domain/finance.js';

const fixture = document.querySelector('#fixture');
const input = fixture.elements.amount;
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');
initializeMoneyInputs(fixture);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function edit(inputType, data = null) {
  input.focus();
  const event = new InputEvent('beforeinput', {inputType, data, bubbles: true, cancelable: true});
  if (!input.dispatchEvent(event)) return;
  let start = input.selectionStart;
  let end = input.selectionEnd;
  if (start === end && inputType === 'deleteContentBackward') start = Math.max(0, start - 1);
  if (start === end && inputType === 'deleteContentForward') end = Math.min(input.value.length, end + 1);
  input.setRangeText(data || '', start, end, 'end');
  input.dispatchEvent(new InputEvent('input', {inputType, data, bubbles: true}));
}

function replace(text) {
  input.select();
  edit('insertFromPaste', text);
}

function check(name, run) {
  run();
  const result = document.createElement('li');
  result.textContent = `✓ ${name}`;
  results.append(result);
}

try {
  check('Digitação começa nos centavos e insere separadores de milhares', () => {
    for (const [digit, expected] of [['3', '0,03'], ['0', '0,30'], ['0', '3,00'], ['0', '30,00'], ['0', '300,00'], ['0', '3.000,00']]) {
      edit('insertText', digit);
      assert(input.value === expected, `Esperado ${expected}; recebido ${input.value}.`);
    }
    assert(parseMoney(new FormData(fixture).get('amount')) === 300000, 'O formulário deve salvar 300.000 centavos.');
  });
  check('Backspace reduz o valor e permite apagar completamente o campo', () => {
    for (const expected of ['300,00', '30,00', '3,00', '0,30', '0,03', '0,00', '']) {
      edit('deleteContentBackward');
      assert(input.value === expected, `Backspace: esperado ${expected}; recebido ${input.value}.`);
    }
    assert(input.validity.valueMissing, 'O campo vazio deve continuar sujeito à validação obrigatória.');
  });
  check('Valores existentes recebem pontos sem mudar os centavos', () => {
    assert(fixture.elements.existing.value === '1.234.567,89', 'Edição deve mostrar os milhares.');
    assert(parseMoney(fixture.elements.existing.value) === 123456789, 'Edição deve preservar centavos.');
    assert(fixture.elements.description.value === 'Texto original', 'Campos não monetários não devem ser alterados.');
  });
  check('Colagem e seleção completa preservam a máscara e o cursor', () => {
    replace('R$ 1.234.567,89');
    assert(input.value === '1.234.567,89', 'Valor colado deve ser normalizado.');
    assert(input.selectionStart === input.value.length, 'Cursor deve continuar no fim após colar.');
    input.select();
    edit('insertText', '3');
    assert(input.value === '0,03', 'Substituição deve começar nos centavos.');
  });
  check('Backspace e Delete próximos à vírgula não prendem o cursor', () => {
    replace('12,34');
    input.setSelectionRange(3, 3);
    edit('deleteContentBackward');
    assert(input.value === '1,34', 'Backspace deve apagar o dígito antes da vírgula.');
    replace('12,34');
    input.setSelectionRange(2, 2);
    edit('deleteContentForward');
    assert(input.value === '1,24', 'Delete deve apagar o dígito depois da vírgula.');
  });
  check('Letras e colagens negativas são bloqueadas', () => {
    const previous = input.value;
    edit('insertText', 'a');
    assert(input.value === previous, 'Letras não devem alterar o valor.');
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', '-100,00');
    const accepted = input.dispatchEvent(new ClipboardEvent('paste', {clipboardData, bubbles: true, cancelable: true}));
    assert(!accepted && input.value === previous, 'Valor negativo colado não deve virar positivo.');
  });
  summary.textContent = `${results.children.length} verificações da máscara aprovadas.`;
  summary.dataset.status = 'pass';
} catch (error) {
  summary.textContent = error.message;
  summary.dataset.status = 'fail';
}
