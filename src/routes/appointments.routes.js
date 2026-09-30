const express = require('express');
const prisma = require('../db/prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_MODES = ['presentiel', 'video', 'domicile'];

router.post('/', requireAuth, requireRole('patient'), async (req, res, next) => {
  try {
    const { doctorId, scheduledAt, mode, address } = req.body || {};
    if (!doctorId || !scheduledAt || !mode) {
      return res.status(400).json({ error: 'missing_fields', message: 'doctorId, scheduledAt and mode are required.' });
    }
    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: 'invalid_mode' });
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60000) {
      return res.status(400).json({ error: 'invalid_datetime', message: 'scheduledAt must be a valid, non-past ISO datetime.' });
    }

    const doctor = await prisma.doctorProfile.findUnique({ where: { id: doctorId } });
    if (!doctor || doctor.verificationStatus !== 'approved') {
      return res.status(404).json({ error: 'doctor_not_found_or_unverified' });
    }
    if (!doctor.modes.split(',').includes(mode)) {
      return res.status(400).json({ error: 'mode_not_offered_by_doctor' });
    }
    if (mode === 'domicile' && (!address || !address.quartier || !address.ville || !address.tel)) {
      return res.status(400).json({ error: 'address_required_for_home_visit' });
    }

    const priceFcfa = mode === 'domicile' ? (doctor.homeVisitPriceFcfa || doctor.consultationPriceFcfa) : doctor.consultationPriceFcfa;

    const appointment = await prisma.appointment.create({
      data: {
        patientId: req.user.id,
        doctorId,
        scheduledAt: when,
        mode,
        priceFcfa,
        addressJson: mode === 'domicile' ? JSON.stringify(address) : null,
      },
    });
    res.status(201).json({ appointment });
  } catch (err) {
    // Prisma throws P2002 on the unique(doctorId, scheduledAt) constraint -
    // this is the real double-booking guard, not a UI-only check.
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'slot_already_booked', message: 'This doctor already has an appointment at that exact time.' });
    }
    next(err);
  }
});

router.get('/me', requireAuth, requireRole('patient'), async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.user.id },
      include: {
        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
        payment: true,
      },
      orderBy: { scheduledAt: 'desc' },
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', requireAuth, async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { doctor: true },
    });
    if (!appointment) return res.status(404).json({ error: 'not_found' });

    const isOwnerPatient = req.user.role === 'patient' && appointment.patientId === req.user.id;
    const isOwnerDoctor = req.user.role === 'doctor' && appointment.doctor.userId === req.user.id;
    if (!isOwnerPatient && !isOwnerDoctor && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ appointment: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
