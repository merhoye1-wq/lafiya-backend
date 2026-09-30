const fetch = require('node-fetch');

// Generic REST-gateway shape: most Cameroonian/regional SMS aggregators
// expose a simple "POST { to, message }" endpoint with an API key header.
// Swap the request shape below to match your chosen provider's docs -
// the calling code (see appointments/payments routes) never needs to change.
async function sendSms({ to, message }) {
  if (!process.env.SMS_GATEWAY_URL) {
    // eslint-disable-next-line no-console
    console.log(`[sms:mock] to ${to}: ${message}`);
    return { mock: true };
  }

  const res = await fetch(process.env.SMS_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SMS_API_KEY}`,
    },
    body: JSON.stringify({ to, message }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SMS gateway error ${res.status}: ${body}`);
  }
  return { mock: false, response: await res.json().catch(() => ({})) };
}

module.exports = { sendSms };
