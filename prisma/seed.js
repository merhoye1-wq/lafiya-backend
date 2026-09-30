require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Comptes médecins de démonstration - approuvés directement (contourne le
// flux normal d'inscription + validation admin) pour que le répertoire ne
// soit pas vide au premier lancement du site. A remplacer par de vrais
// médecins inscrits et vérifiés avant un lancement public.
const DEMO_DOCTOR_PASSWORD = process.env.DEMO_DOCTOR_PASSWORD || 'DemoLafiya2026!';
const DEMO_DOCTORS = [
  { firstName: 'Aïssatou', lastName: 'Ndjidda', specialty: 'generale', city: 'Garoua', languages: 'FR,Fulfulde', modes: 'presentiel,video,domicile', consultationPriceFcfa: 8000, homeVisitPriceFcfa: 12000, orderNumber: 'ONMC-DEMO-001' },
  { firstName: 'Paul', lastName: 'Mbarga', specialty: 'cardio', city: 'Yaoundé', languages: 'FR,EN', modes: 'presentiel,video', consultationPriceFcfa: 15000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-002' },
  { firstName: 'Fatimatou', lastName: 'Oumarou', specialty: 'gyneco', city: 'Garoua', languages: 'FR,Fulfulde', modes: 'presentiel,video', consultationPriceFcfa: 12000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-003' },
  { firstName: 'Serge', lastName: 'Eloundou', specialty: 'pediatrie', city: 'Douala', languages: 'FR,EN', modes: 'presentiel,video,domicile', consultationPriceFcfa: 10000, homeVisitPriceFcfa: 14000, orderNumber: 'ONMC-DEMO-004' },
  { firstName: 'Brenda', lastName: 'Fokou', specialty: 'dermato', city: 'Douala', languages: 'FR,EN', modes: 'video', consultationPriceFcfa: 9000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-005' },
  { firstName: 'Hamadou', lastName: 'Bello', specialty: 'endocrino', city: 'Maroua', languages: 'FR,Fulfulde', modes: 'presentiel,video,domicile', consultationPriceFcfa: 13000, homeVisitPriceFcfa: 16000, orderNumber: 'ONMC-DEMO-006' },
  { firstName: 'Clarisse', lastName: 'Ateba', specialty: 'pneumo', city: 'Yaoundé', languages: 'FR,EN', modes: 'presentiel,video', consultationPriceFcfa: 14000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-007' },
  { firstName: 'Jean-Marie', lastName: 'Nkeng', specialty: 'rhumato', city: 'Douala', languages: 'FR', modes: 'presentiel,video', consultationPriceFcfa: 12000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-008' },
  { firstName: 'Aminatou', lastName: 'Sali', specialty: 'ophtalmo', city: 'Garoua', languages: 'FR,Fulfulde', modes: 'presentiel', consultationPriceFcfa: 10000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-009' },
  { firstName: 'Ruth', lastName: 'Ebogo', specialty: 'psy', city: 'Yaoundé', languages: 'FR,EN', modes: 'video', consultationPriceFcfa: 8000, homeVisitPriceFcfa: null, orderNumber: 'ONMC-DEMO-010' },
  { firstName: 'Moussa', lastName: 'Adamou', specialty: 'labo', city: 'Garoua', languages: 'FR,Fulfulde', modes: 'domicile', consultationPriceFcfa: 0, homeVisitPriceFcfa: 6000, orderNumber: 'ONMC-DEMO-011' },
  { firstName: 'Aïcha', lastName: 'Mballa', specialty: 'generale', city: 'Ngaoundéré', languages: 'FR,Fulfulde,EN', modes: 'video,domicile', consultationPriceFcfa: 7000, homeVisitPriceFcfa: 11000, orderNumber: 'ONMC-DEMO-012' },
];

function slugEmail(firstName, lastName) {
  const norm = (s) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
  return `${norm(firstName)}.${norm(lastName)}@demo.lafiya.cm`;
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@lafiya.cm';
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, passwordHash, role: 'admin', firstName: 'Admin', lastName: 'Lafiya' },
  });
  console.log(`Admin account created: ${email}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log(`Using default password "${password}" - set ADMIN_PASSWORD in .env before going live.`);
  }
}

async function seedDemoDoctors() {
  const passwordHash = await bcrypt.hash(DEMO_DOCTOR_PASSWORD, 10);
  let created = 0;
  for (const doc of DEMO_DOCTORS) {
    const email = slugEmail(doc.firstName, doc.lastName);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) continue;

    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'doctor',
        firstName: doc.firstName,
        lastName: doc.lastName,
        doctorProfile: {
          create: {
            specialty: doc.specialty,
            city: doc.city,
            languages: doc.languages,
            modes: doc.modes,
            orderNumber: doc.orderNumber,
            consultationPriceFcfa: doc.consultationPriceFcfa,
            homeVisitPriceFcfa: doc.homeVisitPriceFcfa,
            verificationStatus: 'approved',
            verifiedAt: new Date(),
          },
        },
      },
    });
    created += 1;
  }
  if (created > 0) {
    console.log(`${created} demo doctor account(s) created (password: env DEMO_DOCTOR_PASSWORD or default).`);
  } else {
    console.log('Demo doctors already present - nothing to seed.');
  }
}

async function main() {
  await seedAdmin();
  await seedDemoDoctors();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
