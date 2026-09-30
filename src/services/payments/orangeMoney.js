const fetch = require('node-fetch');
const crypto = require('crypto');

// Orange Money Web Payment API shape (OAuth2 client-credentials, then a
// payment-token request whose response the patient completes on their
// phone). Cameroon integrations commonly go through an aggregator instead
// (CamerPay, Maviance) which exposes a simpler REST wrapper around this -
// swap the two fetch calls below for the aggregator's docs if you go that
// route; the calling code in routes/payments.js does not need to change.

const isConfigured = () =>
  Boolean(process.env.ORANGE_CLIENT_ID && process.env.ORANGE_CLIENT_SECRET && process.env.ORANGE_MERCHANT_KEY);

async function getAccessToken() {
  const credentials = Buffer.from(`${process.env.ORANGE_CLIENT_ID}:${process.env.ORANGE_CLIENT_SECRET}`).toString(
    'base64'
  );
  const res = await fetch(`${process.env.ORANGE_BASE_URL}/oauth/v3/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Orange Money token request failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function requestToPay({ amountFcfa, phoneNumber, externalId, payerMessage }) {
  if (!isConfigured()) {
    const referenceId = crypto.randomUUID();
    console.log(`[orange:mock] request-to-pay ${amountFcfa} FCFA from ${phoneNumber}, ref ${referenceId}`);
    return { referenceId, mock: true };
  }

  const referenceId = crypto.randomUUID();
  const token = await getAccessToken();
  const res = await fetch(`${process.env.ORANGE_BASE_URL}/orange-money-webpay/cm/v1/webpayment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      merchant_key: process.env.ORANGE_MERCHANT_KEY,
      currency: 'XAF',
      order_id: externalId,
      amount: amountFcfa,
      return_url: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/payments/return` : undefined,
      cancel_url: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/payments/cancel` : undefined,
      notif_url: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL}/api/payments/webhook/orange` : undefined,
      lang: 'fr',
      reference: referenceId,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Orange Money request failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return { referenceId, payToken: data.pay_token, paymentUrl: data.payment_url, mock: false };
}

async function getStatus(referenceId, { mock }) {
  if (mock) {
    return { status: 'SUCCESS', mock: true };
  }
  // Orange Money confirms via webhook rather than polling in most
  // integrations; a real implementation stores the webhook result keyed by
  // `reference` and reads it back here.
  throw new Error('Orange Money status must be read from the webhook-recorded result in production mode.');
}

module.exports = { isConfigured, requestToPay, getStatus };
