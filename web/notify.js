// Notifiche dell'app: iscrizione Web Push e codice da copiare nei Secrets di GitHub.
import { VAPID_PUBLIC_KEY, SECRETS_URL } from './config.js';

const $ = (id) => document.getElementById(id);

const urlBase64ToUint8Array = (b64) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function showCode(subscription) {
  $('notify-code').value = JSON.stringify(subscription);
  $('secrets-link').href = SECRETS_URL;
  $('notify-dialog').showModal();
}

async function subscribe() {
  const hint = $('notify-hint');
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      hint.textContent = 'Permesso negato: puoi riattivarlo da Impostazioni → Notifiche → Voli Weekend.';
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    $('notify-btn').textContent = 'Mostra codice notifiche';
    hint.textContent = 'Notifiche attive su questo dispositivo.';
    showCode(sub);
  } catch (err) {
    hint.textContent = `Non riesco ad attivare le notifiche: ${err.message}`;
  }
}

export async function initNotifications() {
  const box = $('notify');
  if (!supported) {
    // Su iPhone le notifiche funzionano solo con l'app aggiunta alla schermata Home
    if (isIos && !isStandalone) {
      box.hidden = false;
      $('notify-btn').hidden = true;
      $('notify-hint').textContent = 'Per ricevere le notifiche aggiungi l\'app alla schermata Home (Condividi → Aggiungi alla schermata Home) e aprila da lì.';
    }
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  box.hidden = false;
  if (await reg.pushManager.getSubscription()) {
    $('notify-btn').textContent = 'Mostra codice notifiche';
    $('notify-hint').textContent = 'Notifiche attive su questo dispositivo.';
  }
  $('notify-btn').addEventListener('click', subscribe);
  $('notify-close').addEventListener('click', () => $('notify-dialog').close());
  $('notify-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('notify-code').value);
      $('notify-copy').textContent = 'Copiato';
    } catch {
      $('notify-code').select();
      $('notify-copy').textContent = 'Selezionato: copia a mano';
    }
  });
}
