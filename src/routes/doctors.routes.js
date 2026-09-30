const express = require('express');
const prisma = require('../db/prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public directory search - only approved doctors are ever listed here,
// mirroring the admin-validation requirement from the spec.
router.get('/', async (req, res, next) => {
  try {
    const { specialty, city, q } = req.query;
    const where = { verificationStatus: 'approved' };
    if (specialty) where.specialty = specialty;
    if (city) where.city = city;
    if (q) {
      where.OR = [
        { user: { firstName: { contains: String(q) } } },
        { user: { lastName: { contains: String(q) } } },
        { specialty: { contains: String(q) } },
      ];
    }

    const doctors = await prisma.doctorProfile.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ doctors: doctors.map(toPublicDoctor) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!doctor || doctor.verificationStatus !== 'approved') {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json({ doctor: toPublicDoctor(doctor) });
  } catch (err) {
    next(err);
  }
});

// The doctor's own "queue": every appointment attached to their profile,
// grouped loosely by day on the client. Requires a doctor session.
router.get('/me/appointments', requireAuth, requireRole('doctor'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
    if (!doctor) return res.status(404).json({ error: 'doctor_profile_not_found' });

    const appointments = await prisma.appointment.findMany({
      where: { doctorId: doctor.id, status: { in: ['confirmed', 'completed'] } },
      include: { patient: { select: { firstName: true, lastName: true, email: true, phone: true } } },
      orderBy: { scheduledAt: 'asc' },
    });
    res.json({ appointments });
  } catch (err) {
    next(err);
  }
});

function toPublicDoctor(doctor) {
  return {
    id: doctor.id,
    name: `${doctor.user.firstName} ${doctor.user.lastName}`,
    specialty: doctor.specialty,
    city: doctor.city,
    languages: doctor.languages.split(','),
    modes: doctor.modes.split(','),
    consultationPriceFcfa: doctor.consultationPriceFcfa,
    homeVisitPriceFcfa: doctor.homeVisitPriceFcfa,
    verified: doctor.verificationStatus === 'approved',
  };
}

module.exports = router;
