export async function sendTelegram(text, { token, chatId, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
}

// `node src/telegram.js --test` invia un messaggio di prova con le variabili d'ambiente
if (process.argv[1]?.endsWith('telegram.js') && process.argv.includes('--test')) {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chatId } = process.env;
  if (!token || !chatId) {
    console.error('Mancano TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID');
    process.exit(1);
  }
  await sendTelegram('Voli Weekend: test avvisi OK', { token, chatId });
  console.log('Messaggio di prova inviato');
}
