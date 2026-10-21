import { createAccount, getAccount, getAccountByEmail } from './repository.js';
import { requireEmail, requireText } from '../domain/validation.js';
import { uid } from '../domain/finance.js';
import { createDemoData } from '../data/demo.js';

const SESSION_KEY = 'walet-plus-session';
const ITERATIONS = 310_000;
const DEMO_ID = 'walet-plus-demo';

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function derivePassword(password, salt, iterations = ITERATIONS) {
  if (!globalThis.crypto?.subtle) throw new Error('A criptografia local exige localhost ou HTTPS. Abra o projeto por um servidor local.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = Uint8Array.from(salt.match(/.{2}/g), byte => parseInt(byte, 16));
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, material, 256);
  return toHex(new Uint8Array(derived));
}

function setSession(id) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {
    throw new Error('Permita o armazenamento local no navegador para manter a sessão desta conta.');
  }
}

export async function register({ name, email, password }) {
  const cleanName = requireText(name, 'Nome', 80);
  const cleanEmail = requireEmail(email);
  if (typeof password !== 'string' || password.length < 8 || password.length > 256) throw new Error('A senha deve ter entre 8 e 256 caracteres.');
  if (['demo@wallet.local', 'demo@walet.local'].includes(cleanEmail) || await getAccountByEmail(cleanEmail)) throw new Error('Este e-mail já possui uma conta local neste navegador.');
  if (!globalThis.crypto?.subtle) throw new Error('Abra o projeto em localhost ou HTTPS para criar uma conta com criptografia.');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await derivePassword(password, salt);
  const account = { id: uid(), name: cleanName, email: cleanEmail, password: { salt, hash, iterations: ITERATIONS }, onboardingComplete: false, theme: 'dark', demo: false };
  await createAccount(account);
  setSession(account.id);
  return account;
}

export async function login({ email, password }) {
  const account = await getAccountByEmail(requireEmail(email));
  if (!account || account.demo || !account.password || typeof password !== 'string' || password.length > 256) throw new Error('E-mail ou senha incorretos. Confira se esta conta foi criada neste navegador.');
  const hash = await derivePassword(password, account.password.salt, account.password.iterations);
  let difference = hash.length ^ account.password.hash.length;
  for (let index = 0; index < hash.length; index += 1) difference |= hash.charCodeAt(index) ^ account.password.hash.charCodeAt(index);
  if (difference !== 0) throw new Error('E-mail ou senha incorretos. Confira se esta conta foi criada neste navegador.');
  setSession(account.id);
  return account;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export async function getSession() {
  let id;
  try {
    id = localStorage.getItem(SESSION_KEY);
  } catch {
    throw new Error('O armazenamento de sessão está bloqueado neste navegador.');
  }
  if (!id) return null;
  const account = await getAccount(id);
  if (!account) logout();
  return account;
}

export async function exploreDemo() {
  let account = await getAccount(DEMO_ID);
  if (!account) {
    account = { id: DEMO_ID, name: 'Alex', email: 'demo@wallet.local', password: null, onboardingComplete: true, theme: 'dark', demo: true };
    try {
      await createAccount(account, createDemoData());
    } catch (error) {
      const concurrentAccount = await getAccount(DEMO_ID);
      if (!concurrentAccount) throw error;
      account = concurrentAccount;
    }
  }
  setSession(account.id);
  return account;
}
