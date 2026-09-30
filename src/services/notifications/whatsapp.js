const fetch = require('node-fetch');

// Real WhatsApp Business Platform (Meta Cloud API) call shape. Requires a
// phone number ID and access token from a Meta-approved Business Solution
// Provider. Meta bills per message from Oct 1, 2026 - budget for it before
// switching this on for every booking confirmation.
async function sendWhatsapp({ to, message }) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp:mock] to ${to}: ${message}`);
    return { mock: true };
  }

  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WhatsApp API error ${res.status}: ${body}`);
  }
  return { mock: false, response: await res.json() };
}

module.exports = { sendWhatsapp };
