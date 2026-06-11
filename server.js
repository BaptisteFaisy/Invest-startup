require('dotenv').config();
const express          = require('express');
const path             = require('path');
const fs               = require('fs');
const https            = require('https');
const crypto           = require('crypto');
const cookieParser     = require('cookie-parser');
const helmet           = require('helmet');
const rateLimit        = require('express-rate-limit');
const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');
const speakeasy        = require('speakeasy');
const QRCode           = require('qrcode');
const multer           = require('multer');
const { MongoClient }  = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;
const IS_PROD              = process.env.NODE_ENV === 'production';
const JWT_SECRET           = process.env.JWT_SECRET           || 'invest_bg_dev_secret_CHANGE_IN_PROD';
const BCRYPT_ROUNDS        = 12;
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL             = process.env.BASE_URL             || 'http://localhost:3000';
const MONGODB_URI          = process.env.MONGODB_URI          || 'mongodb://localhost:27017';
const STARTUP_SECRET       = process.env.STARTUP_SECRET       || 'startup_post_secret_2026';

const ADMIN_EMAILS = ['baptiste.faisy@gmail.com', 'bg.fsg.invest@gmail.com'];

// ─── Garde-fou des secrets en production ──────────────────────────────────────
// Refuse de démarrer si des secrets forts ne sont pas fournis : sans cela des
// jetons d'authentification pourraient être forgés ou les données déchiffrées.
function assertSecretsOrExit() {
  if (!IS_PROD) return;
  const problems = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET — absent ou < 32 caractères');
  if (!process.env.MONGODB_URI)
    problems.push('MONGODB_URI — absent');
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32)
    problems.push('ENCRYPTION_KEY — absent ou < 32 caractères');
  if (problems.length) {
    console.error('\n  ✗  Démarrage refusé — secrets manquants/faibles en production :');
    problems.forEach(p => console.error('       - ' + p));
    console.error('     Définissez ces variables dans Railway avant de déployer.\n');
    process.exit(1);
  }
}

// ─── Chiffrement au repos (AES-256-GCM) des champs sensibles ──────────────────
// Clé 32 octets dérivée de ENCRYPTION_KEY (sinon de JWT_SECRET en dev).
const ENC_KEY = crypto.createHash('sha256')
  .update(process.env.ENCRYPTION_KEY || JWT_SECRET).digest();

function encryptSecret(plain) {
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const enc    = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptSecret(value) {
  // Rétro-compatibilité : les anciens secrets en clair ne portent pas le préfixe v1:
  if (typeof value !== 'string' || !value.startsWith('v1:')) return value;
  const [, ivB64, tagB64, dataB64] = value.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

// ─── TOTP temporaire (mémoire) ────────────────────────────────────────────────
const totpSetupStore = new Map();

// ─── MongoDB ──────────────────────────────────────────────────────────────────
let db;

async function connectDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db('liquidplus');
  console.log('  ✓  MongoDB connecté');
}

function col(name) { return db.collection(name); }

async function nextId(colName) {
  const last = await col(colName).findOne({}, { sort: { id: -1 }, projection: { id: 1 } });
  return last ? last.id + 1 : 1;
}

// Users
async function readUsers()        { return col('users').find({}, { projection: { _id: 0 } }).toArray(); }
async function findByEmail(email) { return col('users').findOne({ email }, { projection: { _id: 0 } }); }
async function createUser({ email, password, full_name }) {
  const id   = await nextId('users');
  const user = { id, email, password: password || '', full_name: full_name || null, created_at: new Date().toISOString() };
  await col('users').insertOne(user);
  return user;
}
async function updateUserById(id, updates) {
  await col('users').updateOne({ id }, { $set: updates });
}
async function unsetUserFields(id, fields) {
  const unset = {};
  fields.forEach(f => { unset[f] = ''; });
  await col('users').updateOne({ id }, { $unset: unset });
}

// Startup accounts (portal entreprises)
async function readStartups()             { return col('startup_accounts').find({}, { projection: { _id: 0 } }).toArray(); }
async function findStartupByEmail(email)  { return col('startup_accounts').findOne({ email }, { projection: { _id: 0 } }); }
async function createStartup(data) {
  const id      = await nextId('startup_accounts');
  const startup = { id, ...data, created_at: new Date().toISOString() };
  await col('startup_accounts').insertOne(startup);
  return startup;
}

// Documents
async function readDocs()       { return col('documents').find({}, { projection: { _id: 0 } }).toArray(); }
async function insertDoc(doc)   { await col('documents').insertOne(doc); }
async function deleteDocById(id) { await col('documents').deleteOne({ id }); }

// Catalogue public startups
async function readCatalog()          { return col('catalog').find({}, { projection: { _id: 0 } }).toArray(); }
async function insertCatalogEntry(e)  { await col('catalog').insertOne(e); }
async function updateCatalogById(id, data) { await col('catalog').replaceOne({ id }, { ...data, id }); }
async function deleteCatalogById(id)  { await col('catalog').deleteOne({ id }); }

// Pré-remplissage du catalogue avec des startups d'exemple si la collection est
// vide. Modifiables/supprimables via /admin.html. Ne s'exécute qu'une seule fois.
const SEED_STARTUPS = [
  {
    id: 1, name: 'Nuvo', tagline: 'L\'épargne automatisée pour la génération mobile',
    sector: 'Fintech', stage: 'Seed', color: '#3b82f6', emoji: '💸',
    founded: '2022', employees: '8', raised: '1,2 M€', ticket: '1 000 €', open: true,
    website: 'https://example.com', linkedin: 'https://linkedin.com',
    description: 'Nuvo aide les 18-35 ans à épargner sans y penser en arrondissant leurs achats et en investissant la différence dans des portefeuilles diversifiés.',
    problem: '70 % des jeunes actifs déclarent ne pas réussir à épargner régulièrement faute d\'outils simples et automatisés.',
    solution: 'Une application qui connecte le compte bancaire, arrondit chaque dépense et place automatiquement l\'épargne selon le profil de risque.',
    market: 'Le marché européen de l\'épargne mobile représente 12 Md€ et croît de 24 % par an.',
    kpis: [{ value: '18 k', label: 'Utilisateurs' }, { value: '+22 %', label: 'Croissance / mois' }, { value: '4,8★', label: 'Note App Store' }],
    team: [
      { name: 'Camille Roy', role: 'CEO — ex-Qonto', color: '#3b82f6' },
      { name: 'Hugo Lefèvre', role: 'CTO — ex-Lydia', color: '#1f8e7a' },
    ],
  },
  {
    id: 2, name: 'Greenloop', tagline: 'La consigne réutilisable pour les commerces',
    sector: 'Greentech', stage: 'Pré-seed', color: '#16a34a', emoji: '♻️',
    founded: '2023', employees: '5', raised: '600 k€', ticket: '1 000 €', open: true,
    website: 'https://example.com', linkedin: 'https://linkedin.com',
    description: 'Greenloop remplace les emballages jetables des restaurants et épiceries par un système de contenants consignés et traçés.',
    problem: 'La restauration à emporter génère 220 000 tonnes d\'emballages jetables par an en France.',
    solution: 'Des contenants réutilisables avec QR code, une appli de retour et une logistique de lavage mutualisée.',
    market: 'La réglementation AGEC impose le réemploi : un marché de 1,5 Md€ adressable d\'ici 2030.',
    kpis: [{ value: '120', label: 'Commerces partenaires' }, { value: '85 k', label: 'Contenants en circulation' }, { value: '92 %', label: 'Taux de retour' }],
    team: [
      { name: 'Léa Martin', role: 'CEO — ex-Phenix', color: '#16a34a' },
      { name: 'Tom Bernard', role: 'COO — ex-Back Market', color: '#f59e0b' },
    ],
  },
  {
    id: 3, name: 'Medika', tagline: 'Le suivi des maladies chroniques par IA',
    sector: 'Healthtech', stage: 'Seed', color: '#8b5cf6', emoji: '🩺',
    founded: '2021', employees: '14', raised: '3,1 M€', ticket: '1 000 €', open: false,
    website: 'https://example.com', linkedin: 'https://linkedin.com',
    description: 'Medika accompagne les patients diabétiques avec un assistant qui analyse leurs données et alerte les soignants en cas de dérive.',
    problem: '4 millions de Français vivent avec le diabète et le suivi entre deux consultations reste fragmenté.',
    solution: 'Une plateforme connectée aux capteurs de glycémie qui détecte les anomalies et facilite le lien ville-hôpital.',
    market: 'Le marché de la santé numérique des maladies chroniques pèse 8 Md€ en Europe.',
    kpis: [{ value: '9 k', label: 'Patients suivis' }, { value: '32', label: 'Établissements' }, { value: '−27 %', label: 'Hospitalisations évitées' }],
    team: [
      { name: 'Dr Sarah Cohen', role: 'CEO — endocrinologue', color: '#8b5cf6' },
      { name: 'Yanis Khelifi', role: 'CTO — ex-Doctolib', color: '#3b82f6' },
    ],
  },
  {
    id: 4, name: 'Foodly', tagline: 'Les cuisines fantômes nouvelle génération',
    sector: 'Foodtech', stage: 'Série A', color: '#ef4444', emoji: '🍜',
    founded: '2020', employees: '46', raised: '7,5 M€', ticket: '1 000 €', open: true,
    website: 'https://example.com', linkedin: 'https://linkedin.com',
    description: 'Foodly opère un réseau de cuisines optimisées pour la livraison, avec ses propres marques culinaires data-driven.',
    problem: 'Ouvrir un restaurant de livraison coûte cher et 60 % ferment dans les trois ans.',
    solution: 'Des cuisines clé en main, des marques testées par la donnée et une logistique mutualisée pour les restaurateurs.',
    market: 'La livraison de repas atteindra 25 Md€ en France d\'ici 2027.',
    kpis: [{ value: '12', label: 'Cuisines' }, { value: '480 k', label: 'Commandes / an' }, { value: '+38 %', label: 'CA annuel' }],
    team: [
      { name: 'Marc Dubois', role: 'CEO — ex-Deliveroo', color: '#ef4444' },
      { name: 'Inès Garcia', role: 'CMO — ex-Frichti', color: '#8b5cf6' },
    ],
  },
];

async function seedCatalogIfEmpty() {
  const count = await col('catalog').countDocuments();
  if (count > 0) return;
  await col('catalog').insertMany(SEED_STARTUPS.map(s => ({ logo_url: '', ...s })));
  console.log(`  ✓  Catalogue initialisé avec ${SEED_STARTUPS.length} startups d'exemple`);
}

// News
async function readNews()       { return col('news').find({}, { projection: { _id: 0 } }).toArray(); }
async function insertNews(entry) { await col('news').insertOne(entry); }

// ─── Uploads ─────────────────────────────────────────────────────────────────
const UPLOADS_DIR    = path.join(__dirname, 'uploads');
const PUBLIC_IMG_DIR = path.join(UPLOADS_DIR, 'public');
if (!fs.existsSync(UPLOADS_DIR))    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_IMG_DIR)) fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/png', 'image/jpeg',
                     'application/vnd.ms-excel',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, PUBLIC_IMG_DIR),
  filename:    (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// ─── Middleware ───────────────────────────────────────────────────────────────
// Derrière le proxy Railway/Cloudflare : nécessaire pour les cookies `secure`
// et pour que le rate-limit voie la vraie IP cliente.
app.set('trust proxy', 1);

// En-têtes de sécurité HTTP. CSP désactivée car le site utilise massivement des
// styles/scripts inline et des ressources externes (Calendly, Google Fonts).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads/public', express.static(PUBLIC_IMG_DIR));
app.use(express.static(__dirname));

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Limiteur strict pour l'authentification (anti-force brute).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,           // 15 minutes
  max: 20,                            // 20 tentatives par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });
  return token;
}

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' }); }
}

function requireAdmin(req, res, next) {
  const token = req.cookies.auth_token
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAILS.includes(payload.email))
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    req.user = payload; next();
  } catch { res.status(401).json({ error: 'Session expirée' }); }
}

function requireStartupAuth(req, res, next) {
  const token = req.cookies.startup_token;
  if (!token) return res.status(401).json({ error: 'Non authentifié en tant que startup' });
  try { req.startup = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expirée' }); }
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, password, full_name } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const emailClean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean))
    return res.status(400).json({ error: 'Adresse email invalide' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
  if (await findByEmail(emailClean))
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await createUser({ email: emailClean, password: hash, full_name: full_name?.trim() });
  const token = setAuthCookie(res, user);
  res.status(201).json({ success: true, token, user: { id: user.id, email: user.email, name: user.full_name } });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = await findByEmail(email.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  if (!user.password)
    return res.status(401).json({ error: 'Ce compte utilise Google. Connectez-vous avec le bouton Google.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  if (!user.twofa_method) {
    const token = setAuthCookie(res, user);
    return res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.full_name } });
  }

  const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'verify_2fa' }, JWT_SECRET, { expiresIn: '5m' });
  return res.json({ requires2FA: true, tempToken });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { _id: 0, password: 0, totp_secret: 0 } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: { id: user.id, email: user.email, name: user.full_name, created_at: user.created_at } });
});

// ─── GET /api/auth/2fa/status ─────────────────────────────────────────────────
app.get('/api/auth/2fa/status', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { twofa_method: 1 } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ enabled: !!user.twofa_method });
});

// ─── POST /api/auth/2fa/setup ─────────────────────────────────────────────────
app.post('/api/auth/2fa/setup', requireAuth, async (req, res) => {
  try {
    const user = await col('users').findOne({ id: req.user.id });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const secretObj = speakeasy.generateSecret({ length: 20, name: 'LIQUID+:' + user.email, issuer: 'LIQUID+' });
    totpSetupStore.set(user.id, secretObj.base32);
    const qrDataUrl = await QRCode.toDataURL(secretObj.otpauth_url, { width: 220, margin: 1, color: { dark: '#f4f2ee', light: '#111318' } });
    res.json({ success: true, otpauth: secretObj.otpauth_url, secret: secretObj.base32, qr: qrDataUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/2fa/confirm ───────────────────────────────────────────────
app.post('/api/auth/2fa/confirm', requireAuth, async (req, res) => {
  const { code } = req.body ?? {};
  const secret   = totpSetupStore.get(req.user.id);
  if (!secret) return res.status(400).json({ error: 'Session expirée, recommencez la configuration' });
  if (!speakeasy.totp.verify({ secret, encoding: 'base32', token: (code || '').replace(/\s/g, ''), window: 1 }))
    return res.status(400).json({ error: 'Code incorrect — vérifiez l\'heure de votre téléphone' });
  await updateUserById(req.user.id, { twofa_method: 'totp', totp_secret: encryptSecret(secret) });
  totpSetupStore.delete(req.user.id);
  res.json({ success: true });
});

// ─── DELETE /api/auth/2fa ─────────────────────────────────────────────────────
app.delete('/api/auth/2fa', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  await unsetUserFields(req.user.id, ['twofa_method', 'totp_secret']);
  res.json({ success: true });
});

// ─── POST /api/auth/2fa/verify ────────────────────────────────────────────────
app.post('/api/auth/2fa/verify', authLimiter, async (req, res) => {
  const { tempToken, code } = req.body ?? {};
  let payload;
  try {
    payload = jwt.verify(tempToken, JWT_SECRET);
    if (payload.purpose !== 'verify_2fa') throw new Error();
  } catch { return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' }); }

  const user = await findByEmail(payload.email);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!speakeasy.totp.verify({ secret: decryptSecret(user.totp_secret), encoding: 'base32', token: (code || '').replace(/\s/g, ''), window: 1 }))
    return res.status(400).json({ error: 'Code incorrect' });

  const token = setAuthCookie(res, user);
  res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.full_name } });
});

// ─── PUT /api/auth/profile ────────────────────────────────────────────────────
app.put('/api/auth/profile', requireAuth, async (req, res) => {
  const { full_name, email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const emailClean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean))
    return res.status(400).json({ error: 'Adresse email invalide' });

  const existing = await findByEmail(emailClean);
  if (existing && existing.id !== req.user.id)
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });

  const updates = { email: emailClean };
  if (full_name) updates.full_name = full_name.trim();
  await updateUserById(req.user.id, updates);
  const updated = await col('users').findOne({ id: req.user.id }, { projection: { _id: 0 } });
  const token = setAuthCookie(res, updated);
  res.json({ success: true, token, user: { id: updated.id, email: updated.email, name: updated.full_name } });
});

// ─── PUT /api/auth/password ───────────────────────────────────────────────────
app.put('/api/auth/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Mot de passe actuel et nouveau requis' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });

  const user = await col('users').findOne({ id: req.user.id });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!(await bcrypt.compare(currentPassword, user.password)))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });

  await updateUserById(req.user.id, { password: await bcrypt.hash(newPassword, BCRYPT_ROUNDS) });
  res.json({ success: true });
});

// ─── GET /api/investments ─────────────────────────────────────────────────────
const MOCK_INVESTMENTS = [];

app.get('/api/investments', requireAuth, (_req, res) => {
  res.json({ investments: MOCK_INVESTMENTS });
});

// ─── Startup portal ───────────────────────────────────────────────────────────
app.post('/api/startup/register', authLimiter, async (req, res) => {
  const { email, password, company_name } = req.body ?? {};
  if (!email || !password || !company_name)
    return res.status(400).json({ error: 'Email, mot de passe et nom requis' });

  const emailClean = email.trim().toLowerCase();
  if (await findStartupByEmail(emailClean))
    return res.status(409).json({ error: 'Un compte startup existe déjà avec cet email' });

  const hash    = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const startup = await createStartup({ email: emailClean, password: hash, company_name: company_name.trim() });
  const token   = jwt.sign({ id: startup.id, email: startup.email, company_name: startup.company_name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('startup_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.status(201).json({ success: true, startup: { id: startup.id, email: startup.email, company_name: startup.company_name } });
});

app.post('/api/startup/login', authLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
  const startup = await findStartupByEmail(email.trim().toLowerCase());
  if (!startup || !(await bcrypt.compare(password, startup.password)))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  const token = jwt.sign({ id: startup.id, email: startup.email, company_name: startup.company_name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('startup_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.json({ success: true, startup: { id: startup.id, email: startup.email, company_name: startup.company_name } });
});

app.post('/api/startup/logout', (_req, res) => {
  res.clearCookie('startup_token');
  res.json({ success: true });
});

app.get('/api/startup/me', requireStartupAuth, async (req, res) => {
  const startup = await col('startup_accounts').findOne({ id: req.startup.id }, { projection: { _id: 0, password: 0 } });
  if (!startup) return res.status(404).json({ error: 'Startup introuvable' });
  res.json({ startup });
});

app.post('/api/startup/upload', requireStartupAuth, upload.single('document'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu ou format non supporté' });
  const { title, type, description } = req.body ?? {};
  const id  = await nextId('documents');
  const doc = {
    id, startup_id: req.startup.id, company_name: req.startup.company_name,
    title: (title || req.file.originalname).trim(), type: type || 'document',
    description: description?.trim() || '',
    filename: req.file.filename, originalname: req.file.originalname,
    mimetype: req.file.mimetype, size: req.file.size,
    uploaded_at: new Date().toISOString(),
  };
  await insertDoc(doc);
  res.status(201).json({ success: true, document: doc });
});

app.get('/api/startup/documents', requireStartupAuth, async (req, res) => {
  const docs = (await readDocs())
    .filter(d => d.startup_id === req.startup.id)
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  res.json({ documents: docs });
});

app.delete('/api/startup/documents/:id', requireStartupAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('documents').findOne({ id, startup_id: req.startup.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  await deleteDocById(id);
  res.json({ success: true });
});

app.get('/api/investor/documents', requireAuth, async (req, res) => {
  const investedNames = MOCK_INVESTMENTS.map(i => i.name.toLowerCase());
  const startups      = (await readStartups()).filter(s => investedNames.includes(s.company_name.toLowerCase()));
  const startupIds    = startups.map(s => s.id);
  const docs = (await readDocs())
    .filter(d => startupIds.includes(d.startup_id))
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    .map(d => ({ ...d, filename: undefined }));
  res.json({ documents: docs });
});

app.get('/api/documents/file/:id', async (req, res) => {
  const id             = Number(req.params.id);
  const investorToken  = req.cookies.auth_token;
  const startupToken   = req.cookies.startup_token;
  const doc            = await col('documents').findOne({ id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  let authorized = false;
  if (investorToken) {
    try {
      jwt.verify(investorToken, JWT_SECRET);
      const investedNames = MOCK_INVESTMENTS.map(i => i.name.toLowerCase());
      const startups      = (await readStartups()).filter(s => investedNames.includes(s.company_name.toLowerCase()));
      authorized = startups.some(s => s.id === doc.startup_id);
    } catch {}
  }
  if (!authorized && startupToken) {
    try { const s = jwt.verify(startupToken, JWT_SECRET); authorized = s.id === doc.startup_id; } catch {}
  }
  if (!authorized) return res.status(403).json({ error: 'Accès refusé' });

  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(filepath, doc.originalname);
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────
function httpsPost(hostname, urlPath, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const req  = https.request({ hostname, path: urlPath, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Parse error')); } }); });
    req.on('error', reject); req.write(body); req.end();
  });
}

function httpsGet(hostname, urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path: urlPath, method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    }, res => { let raw = ''; res.on('data', c => raw += c); res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Parse error')); } }); });
    req.on('error', reject); req.end();
  });
}

app.post('/api/auth/google/token', async (req, res) => {
  const { access_token } = req.body ?? {};
  if (!access_token) return res.status(400).json({ error: 'access_token requis' });
  try {
    const profile    = await httpsGet('www.googleapis.com', '/oauth2/v2/userinfo', access_token);
    if (!profile.email) return res.status(401).json({ error: 'Email non récupérable via Google' });
    const emailClean = profile.email.toLowerCase();
    let user         = await findByEmail(emailClean);
    if (!user) user  = await createUser({ email: emailClean, password: '', full_name: profile.name || emailClean.split('@')[0] });
    const token      = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email, name: user.full_name } });
  } catch (err) {
    console.error('Google token verify error:', err.message);
    res.status(401).json({ error: 'Token Google invalide' });
  }
});

app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google OAuth non configuré.');
  const fromApp  = req.query.from === 'app';
  const params   = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: `${BASE_URL}/auth/google/callback`,
    response_type: 'code', scope: 'openid email profile',
    state: fromApp ? 'from_app' : 'from_web', access_type: 'online', prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const fromApp = state === 'from_app';
  if (error || !code)
    return fromApp ? res.redirect('liquidplus://auth?error=google_cancelled') : res.redirect('/login.html?error=google_cancelled');
  try {
    const tokenData = await httpsPost('oauth2.googleapis.com', '/token', {
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${BASE_URL}/auth/google/callback`, grant_type: 'authorization_code',
    });
    if (!tokenData.access_token) return res.redirect('/login.html?error=google_token');
    const profile    = await httpsGet('www.googleapis.com', '/oauth2/v2/userinfo', tokenData.access_token);
    if (!profile.email) return res.redirect('/login.html?error=google_email');
    const emailClean = profile.email.toLowerCase();
    let user         = await findByEmail(emailClean);
    if (!user) user  = await createUser({ email: emailClean, password: '', full_name: profile.name || emailClean.split('@')[0] });
    setAuthCookie(res, user);
    if (fromApp) {
      const appToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.redirect(`liquidplus://auth?token=${encodeURIComponent(appToken)}`);
    }
    res.redirect('/index.html');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    fromApp ? res.redirect('liquidplus://auth?error=google_failed') : res.redirect('/login.html?error=google_failed');
  }
});

// ─── News ─────────────────────────────────────────────────────────────────────
app.get('/api/news', requireAuth, async (_req, res) => {
  const investedIds = MOCK_INVESTMENTS.map(i => i.id);
  const news = (await readNews())
    .filter(n => investedIds.includes(n.startup_id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ news });
});

app.post('/api/news', async (req, res) => {
  const { startup_key, startup_id, startup_name, startup_color, type, title, content, kpis } = req.body ?? {};
  if (startup_key !== STARTUP_SECRET) return res.status(403).json({ error: 'Clé startup invalide' });
  if (!startup_id || !title || !content) return res.status(400).json({ error: 'startup_id, title et content requis' });
  const id    = await nextId('news');
  const entry = {
    id, startup_id: Number(startup_id), startup_name: startup_name || '',
    startup_color: startup_color || '#2de0bc', type: type || 'mensuel',
    title, date: new Date().toISOString().split('T')[0], content,
    kpis: Array.isArray(kpis) ? kpis : [],
  };
  await insertNews(entry);
  res.status(201).json({ success: true, news: entry });
});

// ─── Admin ────────────────────────────────────────────────────────────────────
app.post('/api/admin/upload-image', requireAdmin, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier image' });
  res.json({ url: `/uploads/public/${req.file.filename}` });
});

app.get('/api/startups', async (_req, res) => {
  res.json({ startups: await readCatalog() });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ admin: true, email: req.user.email });
});

app.post('/api/admin/startups', requireAdmin, async (req, res) => {
  const { name, tagline, sector, stage, color, emoji, logo_url, founded, employees,
          raised, ticket, open, website, linkedin, description, problem, solution, market, team, kpis } = req.body ?? {};
  if (!name || !tagline || !sector) return res.status(400).json({ error: 'name, tagline et sector requis' });
  const id    = await nextId('catalog');
  const entry = {
    id, name: name.trim(), tagline: tagline.trim(), sector: sector.trim(),
    stage: stage || 'Pré-seed', color: color || '#1f8e7a',
    emoji: (emoji || name.charAt(0)).trim(),
    founded: founded || String(new Date().getFullYear()),
    employees: employees || '1', raised: raised || '0', ticket: ticket || '1 000 €',
    open: open === true || open === 'true', logo_url: logo_url || '',
    website: website?.trim() || '', linkedin: linkedin?.trim() || '',
    description: description?.trim() || '', problem: problem?.trim() || '',
    solution: solution?.trim() || '', market: market?.trim() || '',
    team: Array.isArray(team) ? team : [], kpis: Array.isArray(kpis) ? kpis : [],
  };
  await insertCatalogEntry(entry);
  res.status(201).json({ success: true, startup: entry });
});

app.put('/api/admin/startups/:id', requireAdmin, async (req, res) => {
  const id      = Number(req.params.id);
  const current = await col('catalog').findOne({ id });
  if (!current) return res.status(404).json({ error: 'Startup introuvable' });
  const updated = { ...current, ...req.body, id };
  if (typeof updated.open === 'string') updated.open = updated.open === 'true';
  delete updated._id;
  await updateCatalogById(id, updated);
  res.json({ success: true, startup: updated });
});

app.delete('/api/admin/startups/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!(await col('catalog').findOne({ id }))) return res.status(404).json({ error: 'Startup introuvable' });
  await deleteCatalogById(id);
  res.json({ success: true });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
assertSecretsOrExit();
connectDB().then(async () => {
  await seedCatalogIfEmpty();
  app.listen(PORT, () => console.log(`\n  ✓  LIQUID+  →  http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('Impossible de se connecter à MongoDB :', err.message);
  process.exit(1);
});
