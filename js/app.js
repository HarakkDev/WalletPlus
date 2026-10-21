import * as auth from './services/auth.js';
import './services/pwa.js';
import * as repository from './services/repository.js';
import {escapeHTML, icon, toast, openModal} from './components/ui.js';
import {destroyCharts} from './components/charts.js';
import * as dashboard from './pages/dashboard.js';
import * as transactions from './pages/transactions.js';
import * as bills from './pages/bills.js';
import * as goals from './pages/goals.js';
import * as education from './pages/education.js';
import * as reports from './pages/reports.js';
import * as settings from './pages/settings.js';
import * as onboarding from './pages/onboarding.js';

const navigation = [
  {id: 'dashboard', label: 'Visão geral', mobile: 'Início', icon: 'dashboard'},
  {id: 'transactions', label: 'Transações', mobile: 'Transações', icon: 'transactions'},
  {id: 'bills', label: 'Contas Fixas', icon: 'receipt'},
  {id: 'goals', label: 'Minhas Metas', mobile: 'Metas', icon: 'target'},
  {id: 'education', label: 'Educação Financeira', mobile: 'Aprender', icon: 'book'},
  {id: 'reports', label: 'Relatórios', icon: 'chart'},
  {id: 'settings', label: 'Configurações', icon: 'settings'},
];
const pages = {dashboard, transactions, bills, goals, education, reports, settings, onboarding};
const app = document.querySelector('#app');
let account = null;
let context = null;
let currentPage = null;
let renderVersion = 0;

function brand(extraClass = '') {
  return `<a class="brand ${extraClass}" href="#${account ? 'dashboard' : 'welcome'}" aria-label="Wallet+ início"><img src="assets/wallet.svg" alt=""><span>Wallet<b>+</b></span></a>`;
}

function navigate(route) {
  if (location.hash === `#${route}`) renderRoute();
  else location.hash = route;
}

function setTheme() {
  document.documentElement.dataset.theme = account?.theme || 'dark';
}

async function createContext() {
  const data = await repository.getData(account.id);
  context = {
    account,
    data,
    navigate,
    render: renderRoute,
    async update(updater) {
      context.data = await repository.updateData(account.id, updater);
      return context.data;
    },
    async updateAccount(patch) {
      account = await repository.updateAccount(account.id, patch);
      context.account = account;
      setTheme();
      return account;
    },
    async logout() {
      await auth.logout();
      account = null;
      context = null;
      setTheme();
      navigate('login');
    },
    async deleteAccount() {
      await repository.deleteAccount(account.id);
      await context.logout();
      toast('Sua conta e seus dados locais foram apagados.');
    },
  };
}

function renderShell(route) {
  const active = navigation.find(item => item.id === route);
  const initials = account.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const navHTML = navigation.map(item => `<a href="#${item.id}" class="nav-link ${item.id === route ? 'active' : ''}" ${item.id === route ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.label}</span></a>`).join('');
  app.innerHTML = `<aside class="sidebar">${brand()}<p class="nav-caption">Seu espaço financeiro</p><nav class="nav-list" aria-label="Navegação principal">${navHTML}</nav><div class="sidebar-bottom"><div class="local-note">${icon('shield')}<strong>Seu controle começa aqui</strong><p>Dados salvos neste navegador.<br>Faça um backup regularmente.</p></div><button class="profile-button" data-profile><span class="avatar">${escapeHTML(initials)}</span><span class="profile-copy"><strong>${escapeHTML(account.name)}</strong><small>${account.demo ? 'Conta de demonstração' : 'Conta local'}</small></span>${icon('settings')}</button></div></aside><div class="app-layout"><header class="topbar">${brand('mobile-brand')}<div class="breadcrumb"><span>Meu espaço</span>${icon('chevronRight')}<span>${active?.label || 'Primeiros passos'}</span></div><div class="topbar-actions"><span class="local-status"><span class="status-dot"></span>Armazenamento local</span><button class="icon-button" data-theme aria-label="Alternar tema">${icon(account.theme === 'light' ? 'moon' : 'sun')}</button><span class="avatar" aria-label="${escapeHTML(account.name)}">${escapeHTML(initials)}</span></div></header>${account.demo ? '<div class="demo-banner">Você está explorando dados de exemplo. <a href="#settings">Gerenciar demonstração</a></div>' : ''}<main class="app-main" id="main-content" tabindex="-1"></main><nav class="mobile-nav" aria-label="Navegação móvel">${navigation.filter(item => item.mobile).map(item => `<a href="#${item.id}" class="${item.id === route ? 'active' : ''}" ${item.id === route ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.mobile}</span></a>`).join('')}<button data-more class="${['bills', 'reports', 'settings'].includes(route) ? 'active' : ''}" aria-label="Mais páginas">${icon('menu')}<span>Mais</span></button></nav></div>`;
  app.querySelector('[data-profile]').addEventListener('click', () => navigate('settings'));
  app.querySelector('[data-theme]').addEventListener('click', async () => {
    try {
      await context.updateAccount({theme: account.theme === 'light' ? 'dark' : 'light'});
      await renderRoute();
    } catch (error) { toast(error.message, 'error'); }
  });
  app.querySelector('[data-more]').addEventListener('click', () => {
    const dialog = openModal({title: 'Seu Wallet+', body: `<nav class="nav-list" aria-label="Todas as páginas">${navHTML}</nav>`, submitLabel: 'Fechar', onSubmit: async () => {}});
    dialog.querySelectorAll('a').forEach(link => link.addEventListener('click', () => dialog.close()));
  });
  return app.querySelector('#main-content');
}

function authStory() {
  return `<aside class="auth-story">${brand()}<div class="auth-story-content"><p class="eyebrow positive">Mais clareza. Mais possibilidades.</p><h1>Seu dinheiro.<br>Seus planos.<br><span>Seu próximo passo.</span></h1><p>Organize o presente, construa seus objetivos e aprenda a fazer escolhas que fazem sentido para você.</p><div class="auth-illustration" aria-hidden="true"><p>Uma relação melhor com seu dinheiro</p><strong>Começa com um pequeno passo.</strong><svg viewBox="0 0 330 80" fill="none"><path d="M0 65H330M0 40H330M0 15H330" stroke="#a7bacb15"/><path d="M0 70C30 75 30 45 60 50S100 65 125 38s35 10 65-5 45 0 65-20 45 10 75-10" stroke="#36d6b0" stroke-width="3"/><circle cx="329" cy="3" r="4" fill="#36d6b0"/></svg><small>Ilustração · cada trajetória financeira é única</small></div><div class="auth-badges"><span>${icon('shield')}No seu navegador</span><span>${icon('book')}Aprendizado contínuo</span></div></div><p class="auth-story-footer">Wallet+ · Organização para hoje. Educação para a vida.</p></aside>`;
}

function renderAuth(route) {
  const register = route === 'register';
  const welcome = route === 'welcome';
  app.innerHTML = `<div class="auth-shell ${welcome ? '' : 'compact'}">${authStory()}<main class="auth-content" id="main-content" tabindex="-1"><p class="eyebrow positive">${welcome ? 'Bem-vindo ao Wallet+' : register ? 'Um novo começo' : 'Bom ter você de volta'}</p><h2>${welcome ? 'Faça espaço para suas conquistas.' : register ? 'Crie sua conta local' : 'Entre no seu espaço'}</h2><p>${welcome ? 'Finanças mais organizadas, objetivos mais próximos. Tudo em um só lugar.' : register ? 'Um primeiro passo simples para conhecer suas finanças.' : 'Continue de onde parou e acompanhe seus planos.'}</p>${welcome ? `<div class="feature-list"><div class="feature-row"><span class="stat-icon">${icon('wallet')}</span><span><strong>Seu dinheiro, sem mistério</strong><small>Entradas, saídas e contas em dia.</small></span></div><div class="feature-row"><span class="stat-icon purple">${icon('target')}</span><span><strong>Objetivos que ganham forma</strong><small>Acompanhe cada conquista, no seu ritmo.</small></span></div><div class="feature-row"><span class="stat-icon blue">${icon('book')}</span><span><strong>Conhecimento que fica</strong><small>Conheça cinco canais de educação financeira.</small></span></div></div><div class="welcome-actions"><a class="btn btn-primary" href="#register">Começar minha jornada ${icon('arrowRight')}</a><a class="btn btn-secondary" href="#login">Já tenho uma conta local</a></div>` : `<form id="auth-form" class="auth-form">${register ? '<div class="field"><label for="auth-name">Como podemos chamar você?</label><input id="auth-name" name="name" autocomplete="given-name" required minlength="2" maxlength="80" placeholder="Seu nome"></div>' : ''}<div class="field"><label for="auth-email">E-mail</label><input id="auth-email" type="email" name="email" autocomplete="email" required maxlength="254" placeholder="voce@exemplo.com"></div><div class="field"><label for="auth-password">Senha ${register ? '(mínimo de 8 caracteres)' : ''}</label><input id="auth-password" type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" required minlength="${register ? 8 : 1}" maxlength="256" placeholder="Sua senha local"></div><p class="form-error" role="alert" hidden></p><button class="btn btn-primary" type="submit">${register ? 'Criar conta e começar' : 'Entrar na minha conta'}${icon('arrowRight')}</button></form><p class="auth-switch">${register ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'} <a href="#${register ? 'login' : 'register'}">${register ? 'Entrar' : 'Criar conta local'}</a></p>`}<div class="auth-divider">conheça antes de começar</div><button class="btn btn-secondary" id="explore-demo">${icon('sparkles')}Explorar demonstração</button><p class="auth-disclaimer">${icon('info')} Conta local exclusivamente demonstrativa: este login não constitui autenticação segura para produção. Dados financeiros ficam neste navegador/dispositivo e podem ser perdidos ao limpar os dados do site. Não use uma senha utilizada em outros serviços.</p></main></div>`;
  document.title = `${register ? 'Criar conta' : welcome ? 'Bem-vindo' : 'Entrar'} · Wallet+`;
  app.querySelector('#auth-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    if (button.disabled) return;
    button.disabled = true;
    const error = form.querySelector('.form-error');
    error.hidden = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      account = await (register ? auth.register(values) : auth.login(values));
      setTheme();
      await createContext();
      navigate(account.onboardingComplete ? 'dashboard' : 'onboarding');
    } catch (failure) {
      error.textContent = failure.message || 'Não foi possível abrir sua conta.';
      error.hidden = false;
    } finally { button.disabled = false; }
  });
  app.querySelector('#explore-demo').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      account = await auth.exploreDemo();
      setTheme();
      await createContext();
      navigate('dashboard');
    } catch (error) { toast(error.message, 'error'); button.disabled = false; }
  });
}

async function renderRoute() {
  const version = ++renderVersion;
  try {
    currentPage?.cleanup?.();
    destroyCharts(app);
    let route = location.hash.slice(1).split('?')[0] || (account ? 'dashboard' : 'welcome');
    if (!account) {
      if (!['welcome', 'login', 'register'].includes(route)) route = 'login';
      renderAuth(route);
      return;
    }
    if (!account.onboardingComplete && !['onboarding', 'settings'].includes(route)) route = 'onboarding';
    if (!pages[route]) route = 'dashboard';
    if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
    context.data = await repository.getData(account.id);
    if (version !== renderVersion) return;
    const container = renderShell(route);
    document.title = `${navigation.find(item => item.id === route)?.label || 'Primeiros passos'} · Wallet+`;
    currentPage = pages[route];
    await currentPage.render(container, context);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Não foi possível carregar esta página.', 'error');
    if (!app.querySelector('main') || app.querySelector('.boot-screen')) renderFatal(error);
  }
}

function renderFatal(error) {
  app.innerHTML = `<main class="boot-screen" id="main-content"><img src="assets/wallet.svg" alt="Wallet+" width="64"><h1>Não conseguimos abrir seu espaço</h1><p>${escapeHTML(error.message || 'O armazenamento local não está disponível.')}</p><p>Use localhost ou HTTPS e permita o armazenamento de dados neste navegador.</p><button class="btn btn-primary" id="retry">Tentar novamente</button></main>`;
  app.querySelector('#retry').addEventListener('click', () => location.reload());
}

window.addEventListener('hashchange', () => { renderRoute(); window.scrollTo(0, 0); });
window.addEventListener('unhandledrejection', event => {
  toast(event.reason?.message || 'Ocorreu um erro. Tente novamente.', 'error');
});
window.addEventListener('storage', event => {
  if (event.key?.startsWith('walet')) location.reload();
});

try {
  if (!window.isSecureContext || !crypto.subtle) throw new Error('Abra o projeto por localhost ou HTTPS para usar a proteção de senhas.');
  account = await auth.getSession();
  setTheme();
  if (account) await createContext();
  await renderRoute();
} catch (error) { renderFatal(error); }
