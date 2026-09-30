const express = require('express');
const prisma = require('../db/prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyDoctorVerified } = require('../services/notifications');

const router = express.Router();

router.get('/doctors/pending', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const doctors = await prisma.doctorProfile.findMany({
      where: { verificationStatus: 'pending' },
      include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

router.get('/doctors', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = status ? { verificationStatus: status } : {};
    const doctors = await prisma.doctorProfile.findMany({
      where,
      include: { user: { select: { firstName: true, lastName: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ doctors });
  } catch (err) {
    next(err);
  }
});

router.post('/doctors/:id/approve', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const doctor = await prisma.doctorProfile.update({
      where: { id: req.params.id },
      data: { verificationStatus: 'approved', verifiedAt: new Date(), verificationNote: null },
      include: { user: true },
    });
    notifyDoctorVerified({ email: doctor.user.email, approved: true }).catch((e) => console.error('[admin] notify failed:', e.message));
    res.json({ doctor });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

router.post('/doctors/:id/reject', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const doctor = await prisma.doctorProfile.update({
      where: { id: req.params.id },
      data: { verificationStatus: 'rejected', verificationNote: reason || null },
      include: { user: true },
    });
    notifyDoctorVerified({ email: doctor.user.email, approved: false, note: reason }).catch((e) => console.error('[admin] notify failed:', e.message));
    res.json({ doctor });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

router.get('/stats', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const [patients, doctorsApproved, doctorsPending, appointments, payments] = await Promise.all([
      prisma.user.count({ where: { role: 'patient' } }),
      prisma.doctorProfile.count({ where: { verificationStatus: 'approved' } }),
      prisma.doctorProfile.count({ where: { verificationStatus: 'pending' } }),
      prisma.appointment.count(),
      prisma.payment.aggregate({ _sum: { amountFcfa: true }, where: { status: 'confirmed' } }),
    ]);
    res.json({
      patients,
      doctorsApproved,
      doctorsPending,
      appointments,
      revenueFcfa: payments._sum.amountFcfa || 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
