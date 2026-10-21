import {toast} from '../components/ui.js';

async function registerOfflineSupport() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    const registration = await navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url), {
      scope: new URL('../../', import.meta.url).href,
      updateViaCache: 'none',
    });
    let updateNotified = false;
    const notifyUpdate = () => {
      if (updateNotified || !navigator.serviceWorker.controller) return;
      updateNotified = true;
      toast('Nova versão disponível. Salve suas alterações, feche todas as abas do Wallet+ e abra novamente.');
    };
    if (registration.waiting) notifyUpdate();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && registration.waiting) notifyUpdate();
      });
    });
  } catch (error) {
    console.warn('Wallet+: não foi possível preparar o acesso offline nesta visita.', error);
  }
}

if (document.readyState === 'complete') registerOfflineSupport();
else window.addEventListener('load', registerOfflineSupport, {once: true});
