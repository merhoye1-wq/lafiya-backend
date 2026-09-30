const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../db/prismaClient');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

router.post('/signup/patient', async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, phone, city } = req.body || {};
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'firstName, lastName, email and password are required.' });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'email_taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { firstName, lastName, email, phone, passwordHash, role: 'patient' },
    });

    // Patients are usable immediately - no professional credentials to verify.
    const token = signToken(user);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/signup/doctor', async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, password, phone,
      specialty, city, orderNumber, languages, modes,
      consultationPriceFcfa, homeVisitPriceFcfa,
    } = req.body || {};

    if (!firstName || !lastName || !email || !password || !specialty || !city || !orderNumber) {
      return res.status(400).json({
        error: 'missing_fields',
        message: 'firstName, lastName, email, password, specialty, city and orderNumber are required.',
      });
    }
    if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'email_taken' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        firstName, lastName, email, phone, passwordHash, role: 'doctor',
        doctorProfile: {
          create: {
            specialty,
            city,
            orderNumber,
            languages: Array.isArray(languages) ? languages.join(',') : (languages || 'FR'),
            modes: Array.isArray(modes) ? modes.join(',') : (modes || 'presentiel'),
            consultationPriceFcfa: Number(consultationPriceFcfa) || 0,
            homeVisitPriceFcfa: homeVisitPriceFcfa ? Number(homeVisitPriceFcfa) : null,
            verificationStatus: 'pending',
          },
        },
      },
      include: { doctorProfile: true },
    });

    // No token yet on purpose: a doctor account cannot be used to see real
    // patients until an admin has checked the ONMC registration number.
    return res.status(201).json({
      message: 'Compte cree. Un administrateur doit verifier votre numero d\'inscription a l\'Ordre avant activation.',
      user: publicUser(user),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'missing_fields' });

    const user = await prisma.user.findUnique({ where: { email }, include: { doctorProfile: true } });
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = signToken(user);
    return res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { doctorProfile: true } });
    if (!user) return res.status(404).json({ error: 'not_found' });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

function publicUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = router;
