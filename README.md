# Lafiya Sante - Backend

Backend Node.js/Express reel pour la plateforme Lafiya : authentification, base de
donnees, logique metier (double-reservation impossible, verification des
medecins), et integrations de paiement/notification prêtes a etre branchees sur
de vrais comptes MTN MoMo, Orange Money et WhatsApp Business.

## Demarrage rapide

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
```

Le serveur ecoute par defaut sur `http://localhost:4000`. Testez avec :

```bash
curl http://localhost:4000/health
```

## Ce qui est reel des le depart

- **Comptes et connexion** : mots de passe hashes (bcrypt), sessions par JWT.
- **Base de donnees** : SQLite en local (`prisma/dev.db`), migrable vers
  Postgres en production en changeant simplement `DATABASE_URL` et le
  `provider` dans `prisma/schema.prisma`.
- **Empecher un double rendez-vous** : contrainte unique en base
  (`doctorId` + `scheduledAt`), pas seulement une verification cote
  interface - meme en cas de requetes simultanees, la deuxieme est rejetee
  (409 `slot_already_booked`).
- **Verification des medecins** : un compte medecin cree via
  `/api/auth/signup/doctor` reste `pending` et ne recoit pas de jeton de
  connexion tant qu'un administrateur ne l'a pas approuve via
  `/api/admin/doctors/:id/approve`. Seuls les medecins `approved`
  apparaissent dans l'annuaire public.
- **Emails** : fonctionnels immediatement via un compte de test Ethereal
  cree automatiquement (aucune configuration requise) - un lien de previsualisation
  s'affiche dans les logs du serveur. Pour de vrais emails, renseignez les
  variables `SMTP_*` dans `.env`.
- **Documents patients (PDF)** : upload reel par le medecin
  (`POST /api/documents`), stockage sur disque, telechargement protege par
  verification de permission (`GET /api/documents/:id/download`), notification
  email automatique au patient.

## Ce qui reste a activer avec de vrais identifiants

| Fonction | Etat par defaut | A fournir pour activer |
|---|---|---|
| SMS | Simule (log `[sms:mock]`) | `SMS_GATEWAY_URL`, `SMS_API_KEY` |
| WhatsApp | Simule (log `[whatsapp:mock]`) | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (Meta Cloud API) |
| MTN Mobile Money | Simule (confirmation automatique apres ~3,5s) | `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY`, `MOMO_BASE_URL` (voir momodeveloper.mtn.com) |
| Orange Money | Simule (confirmation automatique apres ~3,5s) | `ORANGE_CLIENT_ID`, `ORANGE_CLIENT_SECRET`, `ORANGE_MERCHANT_KEY`, `ORANGE_BASE_URL` |
| Paiement carte bancaire | Non branche (aucun acquereur configure) | Un prestataire type Stripe/Flutterwave, a integrer dans `src/routes/payments.routes.js` |

Tant que ces identifiants ne sont pas fournis, le code utilise automatiquement
un mode simule clairement marque `mock:true` en base - aucune fausse
transaction n'est jamais presentee comme reelle dans les donnees.

Le plan pour obtenir ces identifiants (demarches, interlocuteurs, delais) est
detaille dans le cahier des charges, section « Mettre en place les briques
techniques reelles ».

## Principales routes API

- `POST /api/auth/signup/patient`, `POST /api/auth/signup/doctor`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET /api/doctors` (annuaire public, filtrable par `specialty`/`city`/`q`), `GET /api/doctors/:id`, `GET /api/doctors/me/appointments`
- `POST /api/appointments`, `GET /api/appointments/me`, `POST /api/appointments/:id/cancel`
- `POST /api/payments/initiate`, `GET /api/payments/:appointmentId/status`, `POST /api/payments/:appointmentId/simulate-confirm`
- `POST /api/documents` (medecin), `GET /api/documents/mine` (patient), `GET /api/documents/:id/download`
- `GET /api/admin/doctors/pending`, `POST /api/admin/doctors/:id/approve`, `POST /api/admin/doctors/:id/reject`, `GET /api/admin/stats`

## Lien avec le frontend

Le frontend React livre precedemment (`lafiya-app/src/services/`) contient des
stubs (`api.js`, `payments/mtnMomo.js`, `payments/orangeMoney.js`,
`notifications.js`) prevus pour appeler exactement ces routes. Les brancher
consiste a remplacer les appels simules par de vrais `fetch()` vers
`http://localhost:4000/api/...` (ou l'URL de production), en transmettant le
jeton JWT recu a la connexion dans l'en-tete `Authorization: Bearer <token>`.
