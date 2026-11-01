// Notifiche dell'app (Web Push): la chiave pubblica è in web/config.js, la privata solo nei Secrets.
export const VAPID_PUBLIC_KEY = 'BM3YtStpMqHxhFaGmVcYYxsfQN5WTpQW2c3LSIPee_dgGNIysgucdq22uqTAgqjWC4-OXrwgSPIAkPLRMCUQBks';
const VAPID_SUBJECT = 'https://waxenpie679.github.io/voli-weekend/';

export async function sendPush(payload, { subscription, vapidKey }) {
  const { default: webpush } = await import('web-push');
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, vapidKey.trim());
  const sub = typeof subscription === 'string' ? JSON.parse(subscription) : subscription;
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600 });
  } catch (err) {
    // 404/410: iscrizione scaduta (app rimossa dalla Home o notifiche disattivate)
    if ([404, 410].includes(err.statusCode)) throw new Error(`iscrizione scaduta (${err.statusCode}): riattiva le notifiche dall'app`);
    throw new Error(`push HTTP ${err.statusCode ?? '?'}: ${err.body ?? err.message}`);
  }
}

// `node src/push.js --test` invia una notifica di prova con le variabili d'ambiente
if (process.argv[1]?.endsWith('push.js') && process.argv.includes('--test')) {
  const { PUSH_SUBSCRIPTION: subscription, VAPID_PRIVATE_KEY: vapidKey } = process.env;
  if (!subscription || !vapidKey) {
    console.error('Mancano PUSH_SUBSCRIPTION o VAPID_PRIVATE_KEY');
    process.exit(1);
  }
  await sendPush({ title: 'Voli Weekend', body: 'Notifiche attive: ti avviso qui quando esce un volo sotto 80 €.', url: VAPID_SUBJECT }, { subscription, vapidKey });
  console.log('Notifica di prova inviata');
}
