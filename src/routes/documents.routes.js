const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const prisma = require('../db/prismaClient');
const { requireAuth, requireRole } = require('../middleware/auth');
const { notifyNewDocument } = require('../services/notifications');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    cb(null, safe);
  },
});

function pdfOnly(req, file, cb) {
  if (file.mimetype !== 'application/pdf') {
    return cb(new Error('pdf_only'));
  }
  cb(null, true);
}

const upload = multer({ storage, fileFilter: pdfOnly, limits: { fileSize: 15 * 1024 * 1024 } });

// A doctor issues a result/prescription PDF for a patient. The patient is
// identified by email (matches the prototype: "il s'est inscrit par mail,
// il recevra une notification directe").
router.post('/', requireAuth, requireRole('doctor'), (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const code = err.message === 'pdf_only' ? 'pdf_only' : 'upload_failed';
      return res.status(400).json({ error: code });
    }
    try {
      const { patientEmail, kind, appointmentId } = req.body || {};
      if (!req.file) return res.status(400).json({ error: 'file_required' });
      if (!patientEmail || !kind) return res.status(400).json({ error: 'missing_fields' });
      if (!['results', 'prescription'].includes(kind)) return res.status(400).json({ error: 'invalid_kind' });

      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.user.id } });
      if (!doctor) return res.status(404).json({ error: 'doctor_profile_not_found' });

      const doc = await prisma.patientDocument.create({
        data: {
          appointmentId: appointmentId || null,
          patientEmail,
          doctorId: doctor.id,
          kind,
          fileName: req.file.originalname,
          filePath: req.file.filename,
        },
        include: { doctor: { include: { user: true } } },
      });

      notifyNewDocument({
        patientEmail,
        doctorName: `${doc.doctor.user.firstName} ${doc.doctor.user.lastName}`,
        kind,
        downloadUrl: `/api/documents/${doc.id}/download`,
      }).catch((e) => console.error('[documents] notify failed:', e.message));

      res.status(201).json({ document: { id: doc.id, fileName: doc.fileName, kind: doc.kind, createdAt: doc.createdAt } });
    } catch (e) {
      next(e);
    }
  });
});

router.get('/mine', requireAuth, requireRole('patient'), async (req, res, next) => {
  try {
    const documents = await prisma.patientDocument.findMany({
      where: { patientEmail: req.user.email },
      include: { doctor: { include: { user: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      documents: documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        fileName: d.fileName,
        createdAt: d.createdAt,
        doctorName: `${d.doctor.user.firstName} ${d.doctor.user.lastName}`,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// Streamed, not statically served, so this permission check always runs:
// only the issuing doctor, the matching patient (by email), or an admin.
router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const doc = await prisma.patientDocument.findUnique({
      where: { id: req.params.id },
      include: { doctor: true },
    });
    if (!doc) return res.status(404).json({ error: 'not_found' });

    const isIssuingDoctor = req.user.role === 'doctor' && doc.doctor.userId === req.user.id;
    const isMatchingPatient = req.user.role === 'patient' && req.user.email === doc.patientEmail;
    if (!isIssuingDoctor && !isMatchingPatient && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }

    const filePath = path.join(uploadsDir, doc.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file_missing' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
