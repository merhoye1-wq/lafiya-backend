require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const doctorsRoutes = require('./routes/doctors.routes');
const appointmentsRoutes = require('./routes/appointments.routes');
const paymentsRoutes = require('./routes/payments.routes');
const documentsRoutes = require('./routes/documents.routes');
const adminRoutes = require('./routes/admin.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'lafiya-backend', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorsRoutes);
app.use('/api/appointments', appointmentsRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'route_not_found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Lafiya backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
