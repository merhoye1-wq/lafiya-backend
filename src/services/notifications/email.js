const nodemailer = require('nodemailer');

// Lazily-created transporter, shared across requests.
let transporterPromise = null;

async function getTransporter() {
  if (transporterPromise) return transporterPromise;

  if (process.env.SMTP_HOST) {
    // Real SMTP configured -> use it. Works with any provider (business
    // mailbox, SendGrid, Mailgun, etc.) that exposes SMTP credentials.
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      })
    );
    return transporterPromise;
  }

  // No SMTP configured: create a free, real Ethereal test inbox on the fly.
  // Emails ARE genuinely sent over real SMTP and can be opened in a browser
  // via the preview URL logged below - nothing reaches a real patient's
  // inbox until SMTP_HOST etc. are filled in, but the code path, the
  // message formatting and the delivery mechanics are all real.
  transporterPromise = nodemailer.createTestAccount().then((testAccount) =>
    nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    })
  );
  return transporterPromise;
}

async function sendEmail({ to, subject, html, text }) {
  const transporter = await getTransporter();
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || 'Lafiya Sante <no-reply@lafiya.cm>',
    to,
    subject,
    text: text || undefined,
    html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    // eslint-disable-next-line no-console
    console.log(`[email:mock-inbox] "${subject}" to ${to} -> preview: ${previewUrl}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[email:sent] "${subject}" to ${to} (message id ${info.messageId})`);
  }
  return { messageId: info.messageId, previewUrl: previewUrl || null };
}

module.exports = { sendEmail };
