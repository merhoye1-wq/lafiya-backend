const express = require('express');
const prisma = require('../db/prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');
const { adapterFor } = require('../services/payments');
const { notifyBookingConfirmed } = require('../services/notifications');

const router = express.Router();

async function confirmAppointment(appointmentId) {
  const appointment = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'confirmed' },
    include: { doctor: { include: { user: true } }, patient: true },
  });
  await prisma.payment.update({
    where: { appointmentId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });

  const ref = appointment.id.slice(-8).toUpperCase();
  notifyBookingConfirmed({
    patientEmail: appointment.patient.email,
    patientPhone: appointment.patient.phone,
    doctorName: `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`,
    scheduledAt: appointment.scheduledAt,
    ref,
  }).catch((err) => console.error('[payments] notification dispatch failed:', err.message));

  return appointment;
}

router.post('/initiate', requireAuth, requireRole('patient'), async (req, res, next) => {
  try {
    const { appointmentId, method, phoneNumber } = req.body || {};
    if (!appointmentId || !method) return res.status(400).json({ error: 'missing_fields' });
    if (!['momo', 'orange', 'card'].includes(method)) return res.status(400).json({ error: 'invalid_method' });

    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    if (!appointment || appointment.patientId !== req.user.id) {
      return res.status(404).json({ error: 'appointment_not_found' });
    }
    if (appointment.status !== 'pending_payment') {
      return res.status(409).json({ error: 'appointment_not_awaiting_payment', status: appointment.status });
    }

    if (method === 'card') {
      // No card acquirer is wired up yet (Stripe/Flutterwave etc. would go
      // here) - service fee is charged 0% here rather than pretending a
      // real charge happened. Marked mock:true so it's never confused with
      // a genuine transaction in reporting.
      const payment = await prisma.payment.create({
        data: { appointmentId, method, amountFcfa: appointment.priceFcfa, status: 'confirmed', mock: true, confirmedAt: new Date() },
      });
      await confirmAppointment(appointmentId);
      return res.status(201).json({ payment, status: 'confirmed' });
    }

    if (!phoneNumber) return res.status(400).json({ error: 'phone_number_required' });

    const adapter = adapterFor(method);
    const mock = !adapter.isConfigured();
    const { referenceId } = await adapter.requestToPay({
      amountFcfa: appointment.priceFcfa,
      phoneNumber,
      externalId: appointmentId,
      payerMessage: 'Paiement Lafiya Sante',
    });

    const payment = await prisma.payment.create({
      data: {
        appointmentId,
        method,
        phoneNumber,
        amountFcfa: appointment.priceFcfa,
        status: 'pending_confirmation',
        providerRef: referenceId,
        mock,
      },
    });

    if (mock) {
      // Simulates the patient approving the USSD/app prompt on their phone
      // after a few seconds, exactly like the front-end prototype's tunnel.
      setTimeout(() => {
        confirmAppointment(appointmentId).catch((err) => console.error('[payments] mock auto-confirm failed:', err.message));
      }, 3500);
    }

    res.status(201).json({ payment, status: 'pending_confirmation', mock });
  } catch (err) {
    next(err);
  }
});

router.get('/:appointmentId/status', requireAuth, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { appointmentId: req.params.appointmentId } });
    if (!payment) return res.status(404).json({ error: 'not_found' });
    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// Dev/demo convenience mirroring the prototype's "simulate confirmation
// now" button - lets a real (non-mock) sandbox integration be short-
// circuited during a live demo without waiting on an actual phone.
router.post('/:appointmentId/simulate-confirm', requireAuth, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({ where: { appointmentId: req.params.appointmentId } });
    if (!payment) return res.status(404).json({ error: 'not_found' });
    if (payment.status === 'confirmed') return res.json({ payment });

    const appointment = await confirmAppointment(req.params.appointmentId);
    res.json({ appointment });
  } catch (err) {
    next(err);
  }
});

// Real provider webhook target for production Orange Money integrations
// (MTN MoMo is polled instead - see services/payments/mtnMomo.js).
router.post('/webhook/orange', express.json(), async (req, res, next) => {
  try {
    const { order_id: appointmentId, status } = req.body || {};
    if (!appointmentId) return res.status(400).json({ error: 'missing_order_id' });
    if (status === 'SUCCESS') {
      await confirmAppointment(appointmentId);
    } else {
      await prisma.payment.update({ where: { appointmentId }, data: { status: 'failed' } });
    }
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
