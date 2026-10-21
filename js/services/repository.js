import { validateWorkspace } from './backup.js';
import { requireEnum, requireText } from '../domain/validation.js';

const DATABASE_NAME = 'walet-plus';
const DATABASE_VERSION = 1;
let databasePromise;

export function emptyData() {
  return { incomeSources: [], bills: [], transactions: [], goals: [], categories: [] };
}

function storageError(error) {
  if (error?.name === 'QuotaExceededError') return new Error('O navegador está sem espaço. Exporte um backup antes de liberar armazenamento.');
  if (error?.name === 'ConstraintError') return new Error('Este e-mail já possui uma conta local neste navegador.');
  return error instanceof Error && error.message ? error : new Error('Não foi possível acessar os dados locais. Verifique as permissões de armazenamento do navegador.');
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Seu navegador não disponibiliza IndexedDB. Use um navegador atualizado e permita o armazenamento local.'));
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const accounts = database.createObjectStore('accounts', { keyPath: 'id' });
        accounts.createIndex('email', 'email', { unique: true });
        database.createObjectStore('workspaces', { keyPath: 'accountId' });
      };
      request.onerror = () => { databasePromise = undefined; reject(storageError(request.error)); };
      request.onblocked = () => { databasePromise = undefined; reject(new Error('Feche outras abas do Wallet+ e tente novamente para atualizar o armazenamento.')); };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = undefined; };
        resolve(database);
      };
    });
  }
  return databasePromise;
}

async function readRecord(storeName, key, indexName) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = (indexName ? store.index(indexName) : store).get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(storageError(request.error));
  });
}

export function getAccount(id) {
  return readRecord('accounts', id);
}

export function getAccountByEmail(email) {
  return readRecord('accounts', email, 'email');
}

export async function createAccount(account, data = emptyData()) {
  const validData = validateWorkspace(data);
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['accounts', 'workspaces'], 'readwrite');
    transaction.objectStore('accounts').add(account);
    transaction.objectStore('workspaces').add({ accountId: account.id, data: validData });
    transaction.oncomplete = () => resolve(account);
    transaction.onabort = () => reject(storageError(transaction.error));
    transaction.onerror = () => {};
  });
}

export async function updateAccount(id, patch) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('accounts', 'readwrite');
    const store = transaction.objectStore('accounts');
    const request = store.get(id);
    let updated;
    let failure;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('A conta local não foi encontrada. Entre novamente.');
        const safePatch = Object.fromEntries(Object.entries(patch).filter(([key]) => ['name', 'theme', 'onboardingComplete'].includes(key)));
        if (safePatch.name !== undefined) safePatch.name = requireText(safePatch.name, 'Nome', 80);
        if (safePatch.theme !== undefined) requireEnum(safePatch.theme, ['dark', 'light'], 'Tema');
        if (safePatch.onboardingComplete !== undefined && typeof safePatch.onboardingComplete !== 'boolean') throw new Error('O estado do primeiro acesso é inválido.');
        updated = { ...request.result, ...safePatch };
        store.put(updated);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(updated);
    transaction.onabort = () => reject(storageError(failure || transaction.error));
    transaction.onerror = () => {};
  });
}

export async function getData(accountId) {
  const record = await readRecord('workspaces', accountId);
  if (!record) throw new Error('Os dados desta conta não foram encontrados. Entre novamente.');
  return record.data;
}

export async function updateData(accountId, updater) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['accounts', 'workspaces'], 'readwrite');
    const store = transaction.objectStore('workspaces');
    const request = store.get(accountId);
    let updated;
    let failure;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new Error('Os dados desta conta não foram encontrados. Entre novamente.');
        const draft = request.result.data;
        const returned = updater(draft);
        if (returned && typeof returned.then === 'function') throw new Error('As alterações no armazenamento devem ser síncronas.');
        updated = validateWorkspace(returned === undefined ? draft : returned);
        store.put({ accountId, data: updated });
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(updated);
    transaction.onabort = () => reject(storageError(failure || transaction.error));
    transaction.onerror = () => {};
  });
}

export function replaceData(accountId, data) {
  return updateData(accountId, () => structuredClone(data));
}

export function clearData(accountId) {
  return replaceData(accountId, emptyData());
}

export async function deleteAccount(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(['accounts', 'workspaces'], 'readwrite');
    transaction.objectStore('accounts').delete(id);
    transaction.objectStore('workspaces').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(storageError(transaction.error));
    transaction.onerror = () => {};
  });
}

export const repository = { getData, updateData, replaceData, clearData, getAccount, updateAccount, deleteAccount };
