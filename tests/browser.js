import { register, login, logout, getSession } from '../js/services/auth.js';
import { getAccount, getAccountByEmail, getData, updateData, updateAccount, deleteAccount } from '../js/services/repository.js';
import { confirmRecurring, dateISO, getSummary, monthKey, uid } from '../js/domain/finance.js';
import { exportBackup, validateBackup } from '../js/services/backup.js';

const sessionKey = 'walet-plus-session';
const runButton = document.querySelector('#run-tests');
const resultsElement = document.querySelector('#results');
const summaryElement = document.querySelector('#summary');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function rejects(operation, message) {
  let failed = false;
  try { await operation(); } catch { failed = true; }
  assert(failed, message);
}

async function readDirectly(storeName, key) {
  return new Promise((resolve, reject) => {
    const openRequest = indexedDB.open('walet-plus');
    openRequest.onerror = () => reject(openRequest.error);
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onabort = () => database.close();
    };
  });
}

async function run() {
  if (runButton.disabled) return;
  runButton.disabled = true;
  resultsElement.replaceChildren();
  summaryElement.textContent = 'Executando verificações…';
  summaryElement.dataset.status = 'running';
  const results = [];
  const emails = [`teste-a-${uid()}@walet-test.invalid`, `teste-b-${uid()}@walet-test.invalid`];
  const password = `Teste-local-${uid()}`;
  let previousSession;
  let firstAccount;
  let secondAccount;
  let sessionRead = false;
  window.__waletTestResults = { status: 'running', results };

  async function check(name, operation) {
    const item = document.createElement('li');
    item.textContent = `${name}…`;
    resultsElement.append(item);
    try {
      await operation();
      results.push({ name, status: 'pass' });
      item.dataset.status = 'pass';
      item.textContent = `✓ ${name}`;
    } catch (error) {
      results.push({ name, status: 'fail', error: error.message });
      item.dataset.status = 'fail';
      item.textContent = `✗ ${name}: ${error.message}`;
    }
  }

  try {
    previousSession = localStorage.getItem(sessionKey);
    sessionRead = true;
    await check('Cadastro salva somente PBKDF2 com salts independentes', async () => {
      firstAccount = await register({ name: 'Teste temporário A', email: emails[0], password });
      secondAccount = await register({ name: 'Teste temporário B', email: emails[1], password });
      const savedFirst = await readDirectly('accounts', firstAccount.id);
      const savedSecond = await readDirectly('accounts', secondAccount.id);
      assert(savedFirst.password.hash !== savedSecond.password.hash, 'Senhas iguais precisam de derivações diferentes com salts próprios.');
      assert(savedFirst.password.salt !== savedSecond.password.salt, 'Cada conta precisa de seu próprio salt.');
      assert(savedFirst.password.iterations >= 210000 && savedFirst.password.hash.length === 64, 'Derivação PBKDF2 inesperada.');
      assert(!JSON.stringify(savedFirst).includes(password), 'Uma senha em texto puro foi encontrada.');
      assert(!firstAccount.onboardingComplete, 'Uma nova conta deve iniciar o onboarding.');
    });

    await check('Login rejeita senha incorreta e aceita senha correta', async () => {
      logout();
      await rejects(() => login({ email: emails[0], password: `${password}-incorreta` }), 'Uma senha incorreta foi aceita.');
      assert(await getSession() === null, 'Login rejeitado não deve criar sessão.');
      const loggedIn = await login({ email: emails[0].toUpperCase(), password });
      assert(loggedIn.id === firstAccount.id, 'O login deve normalizar o e-mail e retornar a conta correta.');
      assert((await getSession())?.id === firstAccount.id, 'A sessão não foi persistida.');
    });

    await check('Contas mantêm dados financeiros isolados e persistidos', async () => {
      await updateData(firstAccount.id, data => {
        data.transactions.push({ id: uid(), type: 'income', description: 'Receita de teste', amount: 123456, date: dateISO(), category: 'Outros', paymentMethod: '', notes: '' });
      });
      const firstData = await getData(firstAccount.id);
      const secondData = await getData(secondAccount.id);
      assert(firstData.transactions.length === 1 && secondData.transactions.length === 0, 'Os dados de contas diferentes foram misturados.');
      const persisted = await readDirectly('workspaces', firstAccount.id);
      assert(persisted.data.transactions[0].amount === 123456, 'A receita não foi persistida no IndexedDB.');
      firstData.transactions[0].amount = 1;
      assert((await getData(firstAccount.id)).transactions[0].amount === 123456, 'Alterar uma cópia em memória modificou os dados persistidos.');
    });

    await check('Conclusão do onboarding e preferências persistem por conta', async () => {
      await updateAccount(firstAccount.id, { onboardingComplete: true, theme: 'light', name: 'Nome atualizado' });
      const refreshed = await getSession();
      assert(refreshed.onboardingComplete && refreshed.theme === 'light' && refreshed.name === 'Nome atualizado', 'As preferências não foram persistidas.');
      assert((await getAccount(secondAccount.id)).onboardingComplete === false, 'O onboarding da outra conta foi alterado.');
    });

    await check('Confirmações simultâneas geram um único pagamento mensal', async () => {
      const billId = uid();
      await updateData(firstAccount.id, data => {
        data.bills.push({ id: billId, name: 'Conta de teste', amount: 15990, day: 5, category: 'Contas Fixas', group: 'essential', startMonth: monthKey(), active: true });
      });
      await Promise.all(Array.from({ length: 12 }, () => updateData(firstAccount.id, data => { confirmRecurring(data, 'bill', billId, monthKey(), dateISO()); })));
      const data = await getData(firstAccount.id);
      const payments = data.transactions.filter(item => item.recurringId === billId);
      assert(payments.length === 1, `Esperado um pagamento, encontrados ${payments.length}.`);
      assert(getSummary(data).balance === 123456 - 15990, 'O saldo incluiu a cobrança mais de uma vez.');
    });

    await check('Falha de validação e exceção cancelam toda a escrita', async () => {
      const before = JSON.stringify(await getData(firstAccount.id));
      await rejects(() => updateData(firstAccount.id, data => {
        data.transactions[0].amount = -10;
      }), 'Centavos negativos deveriam impedir a escrita.');
      await rejects(() => updateData(firstAccount.id, data => {
        data.transactions.length = 0;
        throw new Error('Cancelamento proposital do teste');
      }), 'Uma exceção deveria cancelar a escrita.');
      assert(JSON.stringify(await getData(firstAccount.id)) === before, 'Uma escrita incompleta foi persistida.');
    });

    await check('Backup validado preserva valores e exclui credenciais', async () => {
      const account = await getAccount(firstAccount.id);
      const data = await getData(firstAccount.id);
      const exported = exportBackup(account, data);
      const imported = validateBackup(exported);
      assert(JSON.stringify(imported.data) === JSON.stringify(data), 'O backup alterou os dados financeiros.');
      assert(!exported.includes(account.password.hash) && !exported.includes(account.email), 'O backup incluiu credenciais ou e-mail.');
    });

    await check('Logout encerra a sessão sem remover os dados', async () => {
      logout();
      assert(await getSession() === null, 'A sessão continuou ativa após logout.');
      assert((await getData(firstAccount.id)).transactions.length === 2, 'O logout alterou o histórico financeiro.');
    });
  } catch (error) {
    await check('Inicialização do ambiente', () => { throw error; });
  } finally {
    await check('Contas temporárias removidas e sessão anterior restaurada', async () => {
      let cleanupError;
      for (const email of emails) {
        try {
          const account = await getAccountByEmail(email);
          if (account) await deleteAccount(account.id);
          assert(await getAccountByEmail(email) === null, 'Uma conta temporária permaneceu no armazenamento.');
        } catch (error) { cleanupError = error; }
      }
      if (sessionRead) {
        if (previousSession === null) localStorage.removeItem(sessionKey);
        else localStorage.setItem(sessionKey, previousSession);
        assert(localStorage.getItem(sessionKey) === previousSession, 'A sessão anterior não foi restaurada.');
      }
      if (cleanupError) throw cleanupError;
    });
    const failures = results.filter(result => result.status === 'fail').length;
    const status = failures ? 'fail' : 'pass';
    summaryElement.dataset.status = status;
    summaryElement.textContent = `${results.length - failures}/${results.length} verificações concluídas com sucesso.${failures ? ` ${failures} falha(s).` : ''}`;
    window.__waletTestResults = { status, passed: results.length - failures, failed: failures, results };
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', run);
if (new URLSearchParams(location.search).get('autorun') === '1') run();
