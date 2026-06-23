require('dotenv').config();
const express          = require('express');
const path             = require('path');
const fs               = require('fs');
const https            = require('https');
const cookieParser     = require('cookie-parser');
const bcrypt           = require('bcryptjs');
const jwt              = require('jsonwebtoken');
const speakeasy        = require('speakeasy');
const QRCode           = require('qrcode');
const multer           = require('multer');
const { MongoClient }  = require('mongodb');
const Anthropic        = require('@anthropic-ai/sdk');
const CloudConvert     = require('cloudconvert');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET           = process.env.JWT_SECRET           || 'invest_bg_dev_secret_CHANGE_IN_PROD';
const BCRYPT_ROUNDS        = 10;
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL             = process.env.BASE_URL             || 'http://localhost:3000';
const MONGODB_URI          = process.env.MONGODB_URI          || 'mongodb://localhost:27017';
const STARTUP_SECRET       = process.env.STARTUP_SECRET       || 'startup_post_secret_2026';

const ADMIN_EMAILS = ['baptiste.faisy@gmail.com', 'bg.fsg.invest@gmail.com'];

// ─── Claude (assistant IA term sheet du SaaS) ─────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null; // lit ANTHROPIC_API_KEY

// ─── CloudConvert (conversion PDF ⇄ DOCX du SaaS) ─────────────────────────────
const cloudConvert = process.env.CLOUDCONVERT_API_KEY ? new CloudConvert(process.env.CLOUDCONVERT_API_KEY) : null;

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

// News
async function readNews()       { return col('news').find({}, { projection: { _id: 0 } }).toArray(); }
async function insertNews(entry) { await col('news').insertOne(entry); }

// ─── Uploads ─────────────────────────────────────────────────────────────────
const UPLOADS_DIR    = path.join(__dirname, 'uploads');
const PUBLIC_IMG_DIR = path.join(UPLOADS_DIR, 'public');
if (!fs.existsSync(UPLOADS_DIR))    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_IMG_DIR)) fs.mkdirSync(PUBLIC_IMG_DIR, { recursive: true });

// Multer/busboy décode le nom de fichier en latin1 : on le ré-interprète en
// UTF-8 pour éviter le mojibake (« â Ãditeur » → « – Éditeur »). On mute
// file.originalname pour que tous les usages en aval (titre, download…) en profitent.
const fixOriginalName = (file) => {
  file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8');
  return file.originalname;
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file, cb) => {
    const safe = fixOriginalName(file).replace(/[^a-zA-Z0-9._-]/g, '_');
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
    const ext = path.extname(fixOriginalName(file)).toLowerCase() || '.jpg';
    cb(null, `img_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use('/uploads/public', express.static(PUBLIC_IMG_DIR));
// Le SaaS (dossier interne au site) est servi sous /saas → même origine que l'API,
// donc le cookie de session et les appels /api/auth/* fonctionnent sans CORS.
app.use('/saas', express.static(path.join(__dirname, 'Saas')));
app.use(express.static(__dirname));

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
app.post('/api/auth/register', async (req, res) => {
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
app.post('/api/auth/login', async (req, res) => {
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
  await updateUserById(req.user.id, { twofa_method: 'totp', totp_secret: secret });
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
app.post('/api/auth/2fa/verify', async (req, res) => {
  const { tempToken, code } = req.body ?? {};
  let payload;
  try {
    payload = jwt.verify(tempToken, JWT_SECRET);
    if (payload.purpose !== 'verify_2fa') throw new Error();
  } catch { return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' }); }

  const user = await findByEmail(payload.email);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token: (code || '').replace(/\s/g, ''), window: 1 }))
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
app.post('/api/startup/register', async (req, res) => {
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

app.post('/api/startup/login', async (req, res) => {
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
  const state =
    req.query.from === 'app'  ? 'from_app'  :
    req.query.from === 'saas' ? 'from_saas' : 'from_web';
  const params   = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID, redirect_uri: `${BASE_URL}/auth/google/callback`,
    response_type: 'code', scope: 'openid email profile',
    state, access_type: 'online', prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const fromApp  = state === 'from_app';
  const fromSaas = state === 'from_saas';
  if (error || !code)
    return fromApp  ? res.redirect('liquidplus://auth?error=google_cancelled')
         : fromSaas ? res.redirect('/saas/login.html?error=google_cancelled')
         :            res.redirect('/login.html?error=google_cancelled');
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
    res.redirect(fromSaas ? '/saas/editor.html' : '/index.html');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    fromApp  ? res.redirect('liquidplus://auth?error=google_failed')
    : fromSaas ? res.redirect('/saas/login.html?error=google_failed')
    :            res.redirect('/login.html?error=google_failed');
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

// ─── SaaS : assistant IA Claude pour modifier une clause de term sheet ─────────
// Comptabilise les tokens Claude consommés par un utilisateur (cumul + nb requêtes).
async function recordClaudeUsage(userId, response) {
  try {
    const u = response?.usage || {};
    const input  = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    const output = u.output_tokens || 0;
    await col('saas_claude_usage').updateOne(
      { user_id: userId },
      {
        $inc: { requests: 1, input_tokens: input, output_tokens: output, total_tokens: input + output },
        $set: { updated_at: new Date().toISOString() },
      },
      { upsert: true }
    );
  } catch (e) { console.error('recordClaudeUsage error:', e.message); }
}

app.post('/api/saas/clause-chat', requireAuth, async (req, res) => {
  if (!anthropic)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ANTHROPIC_API_KEY dans le .env du serveur.' });

  const { clauseLabel, clauseHtml, plain, documentContext, messages } = req.body ?? {};
  if (!clauseHtml || !Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'clauseHtml et messages sont requis' });

  // On ne garde que les tours user/assistant textuels, plafonnés pour borner le contexte.
  const convo = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16)
    .map(m => ({ role: m.role, content: m.content }));
  if (!convo.length || convo[convo.length - 1].role !== 'user')
    return res.status(400).json({ error: 'Le dernier message doit provenir de l\'utilisateur' });

  const system =
`Tu es l'assistant juridique IA de « liquid + », un éditeur de term sheet pour fondateurs de startup.
Tu aides un fondateur à comprendre et à modifier UNE SEULE clause de sa term sheet — celle ci-dessous, et aucune autre.

Plan complet de la term sheet (CONTEXTE seulement, pour comprendre les renvois entre clauses — tu ne dois RIEN y modifier) :
${documentContext || '(non fourni)'}

Clause à traiter : « ${clauseLabel || 'Clause'} »
Résumé en langage courant : ${plain || '(non fourni)'}

Contenu HTML actuel de la clause (c'est le SEUL texte que tu peux modifier) :
${clauseHtml}

Règles :
- Réponds en français, de façon claire et concise, du point de vue du fondateur (pas de l'investisseur).
- Fais le changement le plus CIBLÉ possible. Ne réécris JAMAIS toute la clause pour une demande mineure.
- Pour une modification locale (une durée, un montant, un mot, une phrase), renvoie une liste "edits" : chaque entrée a "find" = un extrait EXACT copié caractère pour caractère depuis le HTML de la clause ci-dessus (assez long pour être unique), et "replace" = le texte de remplacement. Tout le reste de la clause doit rester identique. Dans ce cas, laisse "updatedClause" vide ("").
- N'utilise "updatedClause" (la clause entière réécrite en HTML, même format que l'original) QUE si la demande impose de restructurer l'essentiel de la clause. Dans ce cas, laisse "edits" vide ([]).
- Ne remplis jamais "edits" ET "updatedClause" en même temps.
- Si le fondateur pose seulement une question (pas de modification), laisse "edits" vide et "updatedClause" vide.
- N'invente jamais de chiffres non demandés et ne touche pas aux autres clauses. Signale brièvement dans "reply" l'impact de ta modification (point de vigilance).`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4000,
      thinking: { type: 'adaptive' },
      system,
      messages: convo,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              reply: { type: 'string', description: 'Réponse de chat en français pour le fondateur.' },
              edits: {
                type: 'array',
                description: 'Modifications ciblées (find/replace) sur le HTML de la clause. Vide si aucune.',
                items: {
                  type: 'object',
                  properties: {
                    find:    { type: 'string', description: 'Extrait exact à remplacer, copié depuis le HTML de la clause.' },
                    replace: { type: 'string', description: 'Texte de remplacement.' },
                  },
                  required: ['find', 'replace'],
                  additionalProperties: false,
                },
              },
              updatedClause: { type: 'string', description: 'Clause entière réécrite en HTML, ou "" si on utilise edits / aucune modification.' },
            },
            required: ['reply', 'edits', 'updatedClause'],
            additionalProperties: false,
          },
        },
      },
    });
    await recordClaudeUsage(req.user.id, response);

    const textBlock = response.content.find(b => b.type === 'text');
    const data = JSON.parse(textBlock ? textBlock.text : '{}');
    res.json({
      reply:         data.reply || '',
      edits:         Array.isArray(data.edits) ? data.edits.filter(e => e && typeof e.find === 'string' && typeof e.replace === 'string' && e.find) : [],
      updatedClause: data.updatedClause || '',
    });
  } catch (err) {
    console.error('Claude clause-chat error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : bloc « Pour bien comprendre » (explication dynamique d'UNE clause) ─
// Recalcule à la demande l'explication simple d'une clause précise, à partir de
// son texte RÉEL (valeurs comprises) — pas un texte générique. Le front la
// réactualise dès que la clause change.
app.post('/api/saas/clause-explain', requireAuth, async (req, res) => {
  if (!anthropic)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ANTHROPIC_API_KEY dans le .env du serveur.' });

  const { clauseLabel, clauseHtml, plain } = req.body ?? {};
  if (!clauseHtml || typeof clauseHtml !== 'string')
    return res.status(400).json({ error: 'clauseHtml est requis' });

  const system =
`Tu es l'assistant pédagogique de « liquid + », un éditeur de term sheet pour fondateurs de startup.
On te donne UNE clause précise. Tu dois rédiger le bloc « Pour bien comprendre » : une explication très simple et imagée de CE QUE DIT EXACTEMENT le texte actuel de cette clause, en tenant compte de ses valeurs réelles (durées, montants, pourcentages).

Clause : « ${clauseLabel || 'Clause'} »
Résumé en langage courant (contexte) : ${plain || '(non fourni)'}

Contenu HTML actuel de la clause (c'est CE texte précis que tu dois expliquer, avec ses vraies valeurs) :
${clauseHtml}

Règles :
- Réponds UNIQUEMENT par le texte de l'explication, en français, 1 à 3 phrases, sans titre, sans balises HTML, sans liste.
- Sois fidèle aux valeurs réellement écrites dans la clause : si une durée, un montant ou un pourcentage change, l'explication doit changer en conséquence.
- Utilise une analogie simple et concrète de la vie quotidienne, du point de vue du fondateur. Pas de jargon juridique.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: 'Rédige le bloc « Pour bien comprendre » pour cette clause.' }],
    });
    await recordClaudeUsage(req.user.id, response);
    const textBlock = response.content.find(b => b.type === 'text');
    const simple = (textBlock ? textBlock.text : '').trim();
    res.json({ simple });
  } catch (err) {
    console.error('Claude clause-explain error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : consommation IA Claude de l'utilisateur (tokens + nb requêtes) ─────
app.get('/api/saas/usage', requireAuth, async (req, res) => {
  const u = await col('saas_claude_usage').findOne(
    { user_id: req.user.id },
    { projection: { _id: 0, user_id: 0 } }
  );
  res.json({
    requests:      u?.requests      || 0,
    input_tokens:  u?.input_tokens  || 0,
    output_tokens: u?.output_tokens || 0,
    total_tokens:  u?.total_tokens  || 0,
    updated_at:    u?.updated_at     || null,
  });
});

// ─── SaaS : dossiers JURIDIQUES de levée de fonds (par utilisateur, en base) ───
// Le SaaS se concentre sur le volet juridique d'une levée. Chaque dossier
// correspond à une phase juridique de l'opération et porte la checklist des
// documents juridiques attendus à cette étape (droit français, SAS).
// `FOLDERS_SEED_VERSION` est incrémentée à chaque évolution de cette liste pour
// re-synchroniser automatiquement les dossiers système des utilisateurs.
const FOLDERS_SEED_VERSION = 2;
const FUNDRAISING_PHASES = [
  {
    key: 'mise-en-ordre',
    name: '1 · Mise en ordre juridique (pré-levée)',
    checklist: [
      'Statuts à jour',
      'Extrait Kbis (moins de 3 mois)',
      'Table de capitalisation (cap table)',
      'Registre des mouvements de titres',
      'Registre des bénéficiaires effectifs (RBE)',
      'PV des assemblées générales antérieures',
      'Pacte d’associés existant',
      'Contrats clés (clients, fournisseurs, baux)',
      'Cessions de propriété intellectuelle & dépôts (marques, brevets)',
      'Contrats de travail, BSPCE / BSA / management package',
    ],
  },
  {
    key: 'confidentialite',
    name: '2 · Confidentialité & approche',
    checklist: [
      'Accord de confidentialité (NDA)',
      'Engagement de confidentialité d’accès à la data room',
    ],
  },
  {
    key: 'term-sheet',
    name: '3 · Lettre d’intention / Term sheet',
    checklist: [
      'Term sheet (lettre d’intention)',
      'Clause d’exclusivité / de négociation',
    ],
  },
  {
    key: 'due-diligence',
    name: '4 · Audit juridique (due diligence)',
    checklist: [
      'Data room structurée',
      'Questionnaire de due diligence (réponses)',
      'Rapport d’audit juridique',
      'État des contentieux et litiges en cours',
    ],
  },
  {
    key: 'documentation',
    name: '5 · Documentation de l’opération',
    checklist: [
      'Pacte d’associés (shareholders agreement)',
      'Statuts modifiés (actions de préférence)',
      'Contrat / bulletin de souscription',
      'Convention de garantie d’actif et de passif (GAP)',
      'Termes des valeurs mobilières émises (ADP, BSA, OC)',
      'Rapport du commissaire aux comptes / aux apports',
    ],
  },
  {
    key: 'closing',
    name: '6 · Closing (augmentation de capital)',
    checklist: [
      'PV de l’AGE actant l’augmentation de capital',
      'Certificat du dépositaire des fonds',
      'PV de constatation de la réalisation définitive',
      'Registre des mouvements de titres mis à jour',
      'Cap table post-money mise à jour',
    ],
  },
  {
    key: 'post-closing',
    name: '7 · Formalités & post-closing',
    checklist: [
      'Dépôt au greffe (statuts modifiés, formulaire M2)',
      'Déclaration des bénéficiaires effectifs mise à jour',
      'Information / reporting des investisseurs (info rights)',
      'PV de conseil / comité de surveillance',
      'Suivi des engagements du pacte (covenants)',
    ],
  },
];

function publicFolder(f) {
  const { _id, user_id, ...rest } = f;
  return rest;
}

// Synchronise les dossiers juridiques « système » de l'utilisateur avec la liste
// ci-dessus : crée/met à jour ceux attendus, retire les anciens devenus obsolètes
// (leurs fichiers redeviennent « non classés »). Les dossiers créés par
// l'utilisateur (non système) ne sont jamais touchés. Idempotent et sans écriture
// inutile une fois la dernière version appliquée.
async function ensureUserFolders(userId) {
  const sys = await col('saas_folders')
    .find({ user_id: userId, system: true }, { projection: { id: 1, key: 1, seed_version: 1 } })
    .toArray();

  const upToDate = sys.length === FUNDRAISING_PHASES.length
    && FUNDRAISING_PHASES.every(p => sys.some(f => f.key === p.key && f.seed_version === FOLDERS_SEED_VERSION));
  if (upToDate) return;

  const wantedKeys = new Set(FUNDRAISING_PHASES.map(p => p.key));
  const byKey      = {};
  sys.forEach(f => { if (f.key) byKey[f.key] = f; });
  const now = new Date().toISOString();

  // Supprime les dossiers système obsolètes (anciens génériques sans clé inclus).
  const obsolete = sys.filter(f => !f.key || !wantedKeys.has(f.key));
  for (const f of obsolete) {
    await col('saas_folders').deleteOne({ id: f.id, user_id: userId });
    await col('saas_documents').updateMany({ user_id: userId, folder_id: f.id }, { $unset: { folder_id: '' } });
  }

  // Crée ou met à jour les dossiers juridiques attendus, dans l'ordre.
  for (let i = 0; i < FUNDRAISING_PHASES.length; i++) {
    const p   = FUNDRAISING_PHASES[i];
    const cur = byKey[p.key];
    const set = { name: p.name, order: i, checklist: p.checklist, system: true, seed_version: FOLDERS_SEED_VERSION };
    if (cur) {
      await col('saas_folders').updateOne({ id: cur.id, user_id: userId }, { $set: set });
    } else {
      const id = await nextId('saas_folders');
      await col('saas_folders').insertOne({ id, user_id: userId, key: p.key, created_at: now, ...set });
    }
  }
}

app.get('/api/saas/folders', requireAuth, async (req, res) => {
  await ensureUserFolders(req.user.id);
  const folders = await col('saas_folders')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } })
    .sort({ order: 1, id: 1 })
    .toArray();
  res.json({ folders });
});

app.post('/api/saas/folders', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom du dossier requis' });
  await ensureUserFolders(req.user.id);
  const last   = await col('saas_folders').findOne({ user_id: req.user.id }, { sort: { order: -1 }, projection: { order: 1 } });
  const id     = await nextId('saas_folders');
  const folder = { id, user_id: req.user.id, name, order: (last?.order ?? -1) + 1, system: false, created_at: new Date().toISOString() };
  await col('saas_folders').insertOne(folder);
  res.status(201).json({ folder: publicFolder(folder) });
});

app.put('/api/saas/folders/:id', requireAuth, async (req, res) => {
  const id   = Number(req.params.id);
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nom du dossier requis' });
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { name } });
  res.json({ success: true });
});

app.delete('/api/saas/folders/:id', requireAuth, async (req, res) => {
  const id     = Number(req.params.id);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  await col('saas_folders').deleteOne({ id, user_id: req.user.id });
  // Les documents qui étaient classés ici redeviennent « non classés ».
  await col('saas_documents').updateMany({ user_id: req.user.id, folder_id: id }, { $unset: { folder_id: '' } });
  res.json({ success: true });
});

// Range (ou retire) un document dans un dossier.
app.put('/api/saas/documents/:id/folder', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const raw = req.body?.folder_id;
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  if (raw === null || raw === '' || raw === undefined) {
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $unset: { folder_id: '' } });
  } else {
    const folderId = Number(raw);
    if (!(await col('saas_folders').findOne({ id: folderId, user_id: req.user.id })))
      return res.status(404).json({ error: 'Dossier introuvable' });
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $set: { folder_id: folderId } });
  }
  res.json({ success: true });
});

// Lier un document à un élément de la checklist d'un dossier, et/ou marquer cet
// élément comme « document final » (validé). L'état est conservé dans
// `items_state` (carte slug -> { document_id, final }) sur le dossier lui-même ;
// la synchronisation des dossiers système ne touche pas ce champ.
app.put('/api/saas/folders/:id/checklist', requireAuth, async (req, res) => {
  const id   = Number(req.params.id);
  const slug = (req.body?.slug ?? '').toString().trim();
  if (!slug) return res.status(400).json({ error: 'Élément de checklist requis' });

  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });

  const state = { ...(folder.items_state || {}) };
  const cur   = { ...(state[slug] || {}) };

  // Lien vers un document (ou retrait si null/'').
  if ('document_id' in (req.body || {})) {
    const raw = req.body.document_id;
    if (raw === null || raw === '' || raw === undefined) {
      delete cur.document_id;
      cur.final = false;
    } else {
      const docId = Number(raw);
      const doc   = await col('saas_documents').findOne({ id: docId, user_id: req.user.id });
      if (!doc) return res.status(404).json({ error: 'Document introuvable' });
      cur.document_id = docId;
      // Le document fourni est rangé dans la phase concernée.
      await col('saas_documents').updateOne({ id: docId, user_id: req.user.id }, { $set: { folder_id: id } });
    }
  }

  // Validation « document final ».
  if ('final' in (req.body || {})) cur.final = !!req.body.final;

  if (cur.document_id == null && !cur.final) delete state[slug];
  else state[slug] = cur;

  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { items_state: state } });
  res.json({ success: true, items_state: state });
});

// ─── SaaS : stockage de documents (par utilisateur) ───────────────────────────
function publicDoc(d) {
  const { _id, filename, user_id, ...rest } = d; // on masque le nom de fichier interne
  return rest;
}

app.get('/api/saas/documents', requireAuth, async (req, res) => {
  // On exclut le HTML des term sheets (volumineux) de la liste.
  const docs = await col('saas_documents')
    .find({ user_id: req.user.id }, { projection: { _id: 0, filename: 0, user_id: 0, html: 0 } })
    .sort({ updated_at: -1, created_at: -1 })
    .toArray();
  res.json({ documents: docs });
});

// ─── SaaS : term sheets éditées (stockées en base, pas de fichier) ────────────
// Enregistre / met à jour le document de travail (apparaît dans « Mes documents »).
app.post('/api/saas/termsheets', requireAuth, async (req, res) => {
  const { name, html } = req.body ?? {};
  if (typeof html !== 'string') return res.status(400).json({ error: 'html requis' });
  const now = new Date().toISOString();
  const id  = await nextId('saas_documents');
  const doc = {
    id, user_id: req.user.id, kind: 'termsheet',
    name: (name || 'Term sheet').trim(),
    html, size: Buffer.byteLength(html, 'utf8'),
    created_at: now, updated_at: now,
  };
  await col('saas_documents').insertOne(doc);
  res.status(201).json({ id, document: publicDoc({ ...doc, html: undefined }) });
});

app.put('/api/saas/termsheets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, html } = req.body ?? {};
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id, kind: 'termsheet' });
  if (!doc) return res.status(404).json({ error: 'Term sheet introuvable' });
  const set = { updated_at: new Date().toISOString() };
  if (typeof html === 'string') { set.html = html; set.size = Buffer.byteLength(html, 'utf8'); }
  if (typeof name === 'string' && name.trim()) set.name = name.trim();
  await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $set: set });
  res.json({ success: true, id });
});

app.get('/api/saas/termsheets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const doc = await col('saas_documents').findOne(
    { id, user_id: req.user.id, kind: 'termsheet' },
    { projection: { _id: 0, user_id: 0 } }
  );
  if (!doc) return res.status(404).json({ error: 'Term sheet introuvable' });
  res.json({ id: doc.id, name: doc.name, html: doc.html || '' });
});

app.post('/api/saas/documents', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu ou format non supporté' });
  const id  = await nextId('saas_documents');
  const doc = {
    id, user_id: req.user.id,
    name: (req.body.name || req.file.originalname).trim(),
    filename: req.file.filename, originalname: req.file.originalname,
    mimetype: req.file.mimetype, size: req.file.size,
    created_at: new Date().toISOString(),
  };
  // Rangement direct dans un dossier de l'utilisateur si fourni.
  if (req.body.folder_id) {
    const folderId = Number(req.body.folder_id);
    if (await col('saas_folders').findOne({ id: folderId, user_id: req.user.id })) doc.folder_id = folderId;
  }
  await col('saas_documents').insertOne(doc);
  res.status(201).json({ document: publicDoc(doc) });
});

app.get('/api/saas/documents/:id/download', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(filepath, doc.originalname || doc.name);
});

app.delete('/api/saas/documents/:id', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (doc.filename) { // term sheets stockées en base : pas de fichier à supprimer
    const filepath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  await col('saas_documents').deleteOne({ id, user_id: req.user.id });
  res.json({ success: true });
});

// ─── SaaS : conversion PDF ⇄ DOCX via CloudConvert ────────────────────────────
async function convertViaCloudConvert(inputPath, inputFilename, outputFormat) {
  let job = await cloudConvert.jobs.create({
    tasks: {
      'upload-file':  { operation: 'import/upload' },
      'convert-file': { operation: 'convert', input: 'upload-file', output_format: outputFormat },
      'export-file':  { operation: 'export/url', input: 'convert-file' },
    },
  });
  const uploadTask = job.tasks.find(t => t.name === 'upload-file');
  await cloudConvert.tasks.upload(uploadTask, fs.createReadStream(inputPath), inputFilename);
  job = await cloudConvert.jobs.wait(job.id);
  const exportTask = job.tasks.find(t => t.name === 'export-file');
  if (!exportTask || exportTask.status !== 'finished' || !exportTask.result?.files?.length)
    throw new Error('export task non terminée');
  return exportTask.result.files[0]; // { filename, url, size }
}

async function downloadTo(url, destPath) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`téléchargement échoué (${r.status})`);
  fs.writeFileSync(destPath, Buffer.from(await r.arrayBuffer()));
}

app.post('/api/saas/documents/:id/convert', requireAuth, async (req, res) => {
  if (!cloudConvert)
    return res.status(503).json({ error: 'Conversion non configurée : ajoutez CLOUDCONVERT_API_KEY dans le .env du serveur.' });

  const id     = Number(req.params.id);
  const target = String(req.body?.to || '').toLowerCase();
  if (!['pdf', 'docx'].includes(target))
    return res.status(400).json({ error: 'Format cible invalide (pdf ou docx).' });

  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const srcExt = path.extname(doc.originalname || doc.filename).toLowerCase();
  if (srcExt === '.' + target)
    return res.status(400).json({ error: `Ce document est déjà au format ${target.toUpperCase()}.` });

  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Fichier introuvable' });

  try {
    const out       = await convertViaCloudConvert(filepath, doc.originalname || doc.filename, target);
    const baseName  = (doc.name || doc.originalname || 'document').replace(/\.[^.]+$/, '');
    const safe      = (out.filename || `${baseName}.${target}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedName = `${Date.now()}_${safe}`;
    const destPath  = path.join(UPLOADS_DIR, storedName);
    await downloadTo(out.url, destPath);

    const newId  = await nextId('saas_documents');
    const newDoc = {
      id: newId, user_id: req.user.id,
      name: `${baseName}.${target}`, filename: storedName, originalname: `${baseName}.${target}`,
      mimetype: target === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: fs.statSync(destPath).size, created_at: new Date().toISOString(),
      converted_from: doc.id,
    };
    await col('saas_documents').insertOne(newDoc);
    res.status(201).json({ document: publicDoc(newDoc) });
  } catch (err) {
    console.error('CloudConvert error:', err.message);
    res.status(502).json({ error: 'La conversion a échoué. Réessayez.' });
  }
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => console.log(`\n  ✓  LIQUID+  →  http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('Impossible de se connecter à MongoDB :', err.message);
  process.exit(1);
});
