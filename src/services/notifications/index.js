const { sendEmail } = require('./email');
const { sendSms } = require('./sms');
const { sendWhatsapp } = require('./whatsapp');

// High-level helpers used by the route handlers, so a route never talks to
// a channel's raw client directly. Failures in one channel never crash the
// request; they're caught and logged so a flaky SMS gateway can't cancel a
// confirmed, paid appointment.

async function notifyBookingConfirmed({ patientEmail, patientPhone, doctorName, scheduledAt, ref }) {
  const results = { email: null, sms: null, whatsapp: null };
  const when = new Date(scheduledAt).toLocaleString('fr-FR');

  try {
    results.email = await sendEmail({
      to: patientEmail,
      subject: `Lafiya Sante - Rendez-vous confirme (${ref})`,
      html: `<p>Votre rendez-vous avec <strong>${doctorName}</strong> le <strong>${when}</strong> est confirme.</p><p>Reference : ${ref}</p>`,
    });
  } catch (err) {
    console.error('[notify] email failed:', err.message);
  }

  if (patientPhone) {
    const message = `Lafiya Sante: RDV confirme avec ${doctorName} le ${when}. Ref ${ref}.`;
    try {
      results.sms = await sendSms({ to: patientPhone, message });
    } catch (err) {
      console.error('[notify] sms failed:', err.message);
    }
    try {
      results.whatsapp = await sendWhatsapp({ to: patientPhone, message });
    } catch (err) {
      console.error('[notify] whatsapp failed:', err.message);
    }
  }

  return results;
}

async function notifyDoctorVerified({ email, approved, note }) {
  const subject = approved ? 'Votre compte Lafiya est valide' : 'Votre inscription Lafiya necessite une correction';
  const html = approved
    ? '<p>Felicitations, votre compte medecin a ete verifie par notre equipe. Vous pouvez maintenant recevoir des patients sur Lafiya.</p>'
    : `<p>Votre inscription n'a pas pu etre validee en l'etat.</p><p>${note || ''}</p>`;
  try {
    return await sendEmail({ to: email, subject, html });
  } catch (err) {
    console.error('[notify] doctor verification email failed:', err.message);
    return null;
  }
}

async function notifyNewDocument({ patientEmail, doctorName, kind, downloadUrl }) {
  const label = kind === 'prescription' ? 'une ordonnance' : 'un resultat d\'analyse';
  try {
    return await sendEmail({
      to: patientEmail,
      subject: 'Lafiya Sante - Nouveau document disponible',
      html: `<p>${doctorName} vient de vous envoyer ${label}.</p><p><a href="${downloadUrl}">Telecharger le document</a></p>`,
    });
  } catch (err) {
    console.error('[notify] document email failed:', err.message);
    return null;
  }
}

module.exports = { notifyBookingConfirmed, notifyDoctorVerified, notifyNewDocument };
