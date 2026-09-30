const fetch = require('node-fetch');
const crypto = require('crypto');

// Real MTN Mobile Money "Collection" product flow (per momodeveloper.mtn.com):
//   1. OAuth2 token request using the API user/key issued for your subscription.
//   2. POST /collection/v1_0/requesttopay - asks MTN to push a PIN prompt to
//      the payer's phone (this is the "message on the phone" the prototype
//      simulates).
//   3. GET /collection/v1_0/requesttopay/{referenceId} - poll until the
//      payer has approved or rejected it.
// Get a free sandbox subscription key at https://momodeveloper.mtn.com to
// exercise this for real before touching production credentials.

const isConfigured = () =>
  Boolean(process.env.MOMO_SUBSCRIPTION_KEY && process.env.MOMO_API_USER && process.env.MOMO_API_KEY);

async function getAccessToken() {
  const base = process.env.MOMO_BASE_URL;
  const credentials = Buffer.from(`${process.env.MOMO_API_USER}:${process.env.MOMO_API_KEY}`).toString('base64');
  const res = await fetch(`${base}/collection/token/`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY,
    },
  });
  if (!res.ok) throw new Error(`MoMo token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function requestToPay({ amountFcfa, phoneNumber, externalId, payerMessage }) {
  if (!isConfigured()) {
    // Mock path: no sandbox credentials yet. Mirrors the real flow's shape
    // (a referenceId you poll) so calling code never branches on mock vs real.
    const referenceId = crypto.randomUUID();
    console.log(`[momo:mock] request-to-pay ${amountFcfa} FCFA from ${phoneNumber}, ref ${referenceId}`);
    return { referenceId, mock: true };
  }

  const referenceId = crypto.randomUUID();
  const token = await getAccessToken();
  const res = await fetch(`${process.env.MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'X-Target-Environment': process.env.MOMO_TARGET_ENVIRONMENT || 'sandbox',
      'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: String(amountFcfa),
      currency: 'EUR', // MTN's sandbox only accepts EUR; production Cameroon uses XAF - confirm with MTN at go-live
      externalId,
      payer: { partyIdType: 'MSISDN', partyId: phoneNumber.replace(/\D/g, '') },
      payerMessage: payerMessage || 'Paiement Lafiya Sante',
      payeeNote: 'Lafiya Sante',
    }),
  });
  if (res.status !== 202) {
    const body = await res.text().catch(() => '');
    throw new Error(`MoMo request-to-pay failed: ${res.status} ${body}`);
  }
  return { referenceId, mock: false };
}

async function getStatus(referenceId, { mock }) {
  if (mock) {
    // Simulated: the prototype's UX has the patient confirm within a few
    // seconds, so mock as SUCCESSFUL once this has been polled a couple times.
    return { status: 'SUCCESSFUL', mock: true };
  }
  const token = await getAccessToken();
  const res = await fetch(`${process.env.MOMO_BASE_URL}/collection/v1_0/requesttopay/${referenceId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Target-Environment': process.env.MOMO_TARGET_ENVIRONMENT || 'sandbox',
      'Ocp-Apim-Subscription-Key': process.env.MOMO_SUBSCRIPTION_KEY,
    },
  });
  if (!res.ok) throw new Error(`MoMo status check failed: ${res.status}`);
  const data = await res.json();
  return { status: data.status, mock: false }; // PENDING | SUCCESSFUL | FAILED
}

module.exports = { isConfigured, requestToPay, getStatus };
