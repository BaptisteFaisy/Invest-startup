require('dotenv').config();
const express        = require('express');
const path           = require('path');
const fs             = require('fs');
const https          = require('https');
const cookieParser   = require('cookie-parser');
const bcrypt         = require('bcryptjs');
const jwt            = require('jsonwebtoken');
const { authenticator } = require('otplib');
const multer       = require('multer');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET         = process.env.JWT_SECRET         || 'invest_bg_dev_secret_CHANGE_IN_PROD';
const BCRYPT_ROUNDS      = 10;
const GOOGLE_CLIENT_ID   = process.env.GOOGLE_CLIENT_ID   || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL           = process.env.BASE_URL           || 'http://localhost:3000';

// ─── Store JSON (base de données simple) ─────────────────────────────────────
const DATA_DIR         = path.join(__dirname, 'data');
const UPLOADS_DIR      = path.join(__dirname, 'uploads');
const USERS_FILE       = path.join(DATA_DIR, 'users.json');
const STARTUPS_FILE    = path.join(DATA_DIR, 'startups.json');
const DOCS_FILE        = path.join(DATA_DIR, 'documents.json');
const CATALOG_FILE     = path.join(DATA_DIR, 'startups_catalog.json');

const ADMIN_EMAILS = ['baptiste.faisy@gmail.com', 'bg.fsg.invest@gmail.com'];

// ─── Store temporaire TOTP (mémoire) ─────────────────────────────────────────
const totpSetupStore = new Map(); // userId → secret (pendant la configuration)

if (!fs.existsSync(DATA_DIR))    fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(USERS_FILE))    fs.writeFileSync(USERS_FILE,    '[]', 'utf8');
if (!fs.existsSync(STARTUPS_FILE)) fs.writeFileSync(STARTUPS_FILE, '[]', 'utf8');
if (!fs.existsSync(DOCS_FILE))     fs.writeFileSync(DOCS_FILE,     '[]', 'utf8');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function findByEmail(email) {
  return readUsers().find(u => u.email === email);
}

// ─── Helpers startups ────────────────────────────────────────────────────────
function readStartups() {
  try { return JSON.parse(fs.readFileSync(STARTUPS_FILE, 'utf8')); }
  catch { return []; }
}
function writeStartups(s) {
  fs.writeFileSync(STARTUPS_FILE, JSON.stringify(s, null, 2), 'utf8');
}
function findStartupByEmail(email) {
  return readStartups().find(s => s.email === email);
}

// ─── Helpers documents ───────────────────────────────────────────────────────
function readDocs() {
  try { return JSON.parse(fs.readFileSync(DOCS_FILE, 'utf8')); }
  catch { return []; }
}
function writeDocs(d) {
  fs.writeFileSync(DOCS_FILE, JSON.stringify(d, null, 2), 'utf8');
}

// ─── Multer (upload fichiers) ─────────────────────────────────────────────────
const PUBLIC_IMG_DIR = path.join(UPLOADS_DIR, 'public');
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

function createUser({ email, password, full_name }) {
  const users = readUsers();
  const user  = {
    id:         users.length ? Math.max(...users.map(u => u.id)) + 1 : 1,
    email,
    password,   // déjà hashé par l'appelant
    full_name:  full_name || null,
    created_at: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  return user;
}

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, 'https://' + req.headers.host + req.url);
  next();
});
app.use('/uploads/public', express.static(PUBLIC_IMG_DIR));
app.use(express.static(__dirname));   // sert index.html, login.html, styles.css…

// ─── Helpers auth ────────────────────────────────────────────────────────────
function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
}

function requireAdmin(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Non authentifié' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!ADMIN_EMAILS.includes(payload.email))
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée' });
  }
}

function readCatalog() {
  try { return JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8')); }
  catch { return []; }
}
function writeCatalog(data) {
  fs.writeFileSync(CATALOG_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function requireStartupAuth(req, res, next) {
  const token = req.cookies.startup_token;
  if (!token) return res.status(401).json({ error: 'Non authentifié en tant que startup' });
  try {
    req.startup = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expirée' });
  }
}

// ─── POST /api/auth/register ─────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body ?? {};

  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const emailClean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean))
    return res.status(400).json({ error: 'Adresse email invalide' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });

  if (findByEmail(emailClean))
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = createUser({ email: emailClean, password: hash, full_name: full_name?.trim() });

  setAuthCookie(res, user);
  res.status(201).json({ success: true, user: { id: user.id, email: user.email, full_name: user.full_name } });
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = findByEmail(email.trim().toLowerCase());
  if (!user)
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid)
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  // Pas de 2FA configuré → connexion directe
  if (!user.twofa_method) {
    setAuthCookie(res, user);
    return res.json({ success: true, user: { id: user.id, email: user.email, full_name: user.full_name } });
  }

  const tempToken = jwt.sign(
    { id: user.id, email: user.email, purpose: 'verify_2fa' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );
  return res.json({ requires2FA: true, tempToken });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ─── GET /api/auth/2fa/status — statut 2FA (utilisateur connecté) ────────────
app.get('/api/auth/2fa/status', requireAuth, (req, res) => {
  const user = readUsers().find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ enabled: !!user.twofa_method });
});

// ─── POST /api/auth/2fa/setup — démarrer la config TOTP (utilisateur connecté) ─
app.post('/api/auth/2fa/setup', requireAuth, (req, res) => {
  try {
    const user = readUsers().find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    const secret  = authenticator.generateSecret();
    totpSetupStore.set(user.id, secret);
    const otpauth = authenticator.keyuri(user.email, 'LIQUID+', secret);
    res.json({ success: true, otpauth, secret });
  } catch (err) {
    console.error('2FA setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auth/2fa/confirm — activer le 2FA après scan QR ───────────────
app.post('/api/auth/2fa/confirm', requireAuth, (req, res) => {
  const { code }  = req.body ?? {};
  const secret    = totpSetupStore.get(req.user.id);
  if (!secret) return res.status(400).json({ error: 'Session expirée, recommencez la configuration' });

  if (!authenticator.verify({ token: (code || '').replace(/\s/g, ''), secret }))
    return res.status(400).json({ error: 'Code incorrect — vérifiez l\'heure de votre téléphone' });

  const users   = readUsers();
  const userIdx = users.findIndex(u => u.id === req.user.id);
  users[userIdx].twofa_method = 'totp';
  users[userIdx].totp_secret  = secret;
  writeUsers(users);
  totpSetupStore.delete(req.user.id);
  res.json({ success: true });
});

// ─── DELETE /api/auth/2fa — désactiver le 2FA ────────────────────────────────
app.delete('/api/auth/2fa', requireAuth, (req, res) => {
  const users   = readUsers();
  const userIdx = users.findIndex(u => u.id === req.user.id);
  if (userIdx === -1) return res.status(404).json({ error: 'Utilisateur introuvable' });
  delete users[userIdx].twofa_method;
  delete users[userIdx].totp_secret;
  writeUsers(users);
  res.json({ success: true });
});

// ─── POST /api/auth/2fa/verify — vérifier le code TOTP à la connexion ────────
app.post('/api/auth/2fa/verify', (req, res) => {
  const { tempToken, code } = req.body ?? {};
  let payload;
  try {
    payload = jwt.verify(tempToken, JWT_SECRET);
    if (payload.purpose !== 'verify_2fa') throw new Error();
  } catch { return res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' }); }

  const user = findByEmail(payload.email);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (!authenticator.verify({ token: (code || '').replace(/\s/g, ''), secret: user.totp_secret }))
    return res.status(400).json({ error: 'Code incorrect' });

  setAuthCookie(res, user);
  res.json({ success: true, user: { id: user.id, email: user.email, full_name: user.full_name } });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
  const all  = readUsers();
  const user = all.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ user: { id: user.id, email: user.email, full_name: user.full_name, created_at: user.created_at } });
});

// ─── GET /api/investments ────────────────────────────────────────────────────
const MOCK_INVESTMENTS = [
  {
    id: 1,
    name: 'TechSaaS',
    sector: 'SaaS B2B',
    description: 'Logiciel de gestion RH pour PME',
    invested: 2000,
    current_value: 2480,
    return_pct: 24.0,
    invested_at: '2024-03-15',
    status: 'Actif',
    color: '#2de0bc',
  },
  {
    id: 2,
    name: 'BiomedX',
    sector: 'Biotech',
    description: 'Diagnostic médical par intelligence artificielle',
    invested: 1500,
    current_value: 1755,
    return_pct: 17.0,
    invested_at: '2024-05-20',
    status: 'Actif',
    color: '#f5a06a',
  },
  {
    id: 3,
    name: 'GreenEnergy',
    sector: 'Cleantech',
    description: 'Stockage d\'énergie pour les énergies renouvelables',
    invested: 3000,
    current_value: 4200,
    return_pct: 40.0,
    invested_at: '2023-11-08',
    status: 'Actif',
    color: '#1f8e7a',
  },
  {
    id: 4,
    name: 'FinFlow',
    sector: 'Fintech',
    description: 'Paiements instantanés B2B en Europe',
    invested: 1000,
    current_value: 920,
    return_pct: -8.0,
    invested_at: '2024-09-01',
    status: 'Actif',
    color: '#e07a4f',
  },
];

app.get('/api/investments', requireAuth, (req, res) => {
  res.json({ investments: MOCK_INVESTMENTS });
});

// ─── POST /api/startup/register ──────────────────────────────────────────────
app.post('/api/startup/register', async (req, res) => {
  const { email, password, company_name } = req.body ?? {};
  if (!email || !password || !company_name)
    return res.status(400).json({ error: 'Email, mot de passe et nom de la startup requis' });

  const emailClean = email.trim().toLowerCase();
  if (findStartupByEmail(emailClean))
    return res.status(409).json({ error: 'Un compte startup existe déjà avec cet email' });

  const hash     = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const startups = readStartups();
  const startup  = {
    id:           startups.length ? Math.max(...startups.map(s => s.id)) + 1 : 1,
    email:        emailClean,
    password:     hash,
    company_name: company_name.trim(),
    created_at:   new Date().toISOString(),
  };
  startups.push(startup);
  writeStartups(startups);

  const token = jwt.sign({ id: startup.id, email: startup.email, company_name: startup.company_name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('startup_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.status(201).json({ success: true, startup: { id: startup.id, email: startup.email, company_name: startup.company_name } });
});

// ─── POST /api/startup/login ──────────────────────────────────────────────────
app.post('/api/startup/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const startup = findStartupByEmail(email.trim().toLowerCase());
  if (!startup || !(await bcrypt.compare(password, startup.password)))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  const token = jwt.sign({ id: startup.id, email: startup.email, company_name: startup.company_name }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('startup_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7*24*60*60*1000 });
  res.json({ success: true, startup: { id: startup.id, email: startup.email, company_name: startup.company_name } });
});

// ─── POST /api/startup/logout ─────────────────────────────────────────────────
app.post('/api/startup/logout', (_req, res) => {
  res.clearCookie('startup_token');
  res.json({ success: true });
});

// ─── GET /api/startup/me ──────────────────────────────────────────────────────
app.get('/api/startup/me', requireStartupAuth, (req, res) => {
  const startup = readStartups().find(s => s.id === req.startup.id);
  if (!startup) return res.status(404).json({ error: 'Startup introuvable' });
  res.json({ startup: { id: startup.id, email: startup.email, company_name: startup.company_name, created_at: startup.created_at } });
});

// ─── POST /api/startup/upload ─────────────────────────────────────────────────
app.post('/api/startup/upload', requireStartupAuth, upload.single('document'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu ou format non supporté (PDF, Word, Excel, image)' });

  const { title, type, description } = req.body ?? {};
  const docs = readDocs();
  const doc  = {
    id:           docs.length ? Math.max(...docs.map(d => d.id)) + 1 : 1,
    startup_id:   req.startup.id,
    company_name: req.startup.company_name,
    title:        (title || req.file.originalname).trim(),
    type:         type || 'document',
    description:  description?.trim() || '',
    filename:     req.file.filename,
    originalname: req.file.originalname,
    mimetype:     req.file.mimetype,
    size:         req.file.size,
    uploaded_at:  new Date().toISOString(),
  };
  docs.push(doc);
  writeDocs(docs);
  res.status(201).json({ success: true, document: doc });
});

// ─── GET /api/startup/documents ──────────────────────────────────────────────
app.get('/api/startup/documents', requireStartupAuth, (req, res) => {
  const docs = readDocs()
    .filter(d => d.startup_id === req.startup.id)
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  res.json({ documents: docs });
});

// ─── DELETE /api/startup/documents/:id ───────────────────────────────────────
app.delete('/api/startup/documents/:id', requireStartupAuth, (req, res) => {
  const id   = Number(req.params.id);
  const docs = readDocs();
  const doc  = docs.find(d => d.id === id && d.startup_id === req.startup.id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  writeDocs(docs.filter(d => d.id !== id));
  res.json({ success: true });
});

// ─── GET /api/investor/documents ─────────────────────────────────────────────
// Retourne les documents des startups dans lesquelles l'investisseur a investi
app.get('/api/investor/documents', requireAuth, (req, res) => {
  const investedNames = MOCK_INVESTMENTS.map(i => i.name.toLowerCase());
  const startups      = readStartups().filter(s => investedNames.includes(s.company_name.toLowerCase()));
  const startupIds    = startups.map(s => s.id);

  const docs = readDocs()
    .filter(d => startupIds.includes(d.startup_id))
    .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at))
    .map(d => ({ ...d, filename: undefined })); // ne pas exposer le chemin réel
  res.json({ documents: docs });
});

// ─── GET /api/documents/file/:id ─────────────────────────────────────────────
// Sert le fichier — vérifie que l'utilisateur est soit l'investisseur soit la startup
app.get('/api/documents/file/:id', (req, res) => {
  const id = Number(req.params.id);

  // Vérification : investisseur connecté ayant investi dans la startup
  const investorToken = req.cookies.auth_token;
  const startupToken  = req.cookies.startup_token;

  let authorized = false;
  const doc = readDocs().find(d => d.id === id);
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  if (investorToken) {
    try {
      jwt.verify(investorToken, JWT_SECRET);
      const investedNames = MOCK_INVESTMENTS.map(i => i.name.toLowerCase());
      const startups      = readStartups().filter(s => investedNames.includes(s.company_name.toLowerCase()));
      authorized = startups.some(s => s.id === doc.startup_id);
    } catch {}
  }
  if (!authorized && startupToken) {
    try {
      const s = jwt.verify(startupToken, JWT_SECRET);
      authorized = s.id === doc.startup_id;
    } catch {}
  }

  if (!authorized) return res.status(403).json({ error: 'Accès refusé' });

  const filepath = path.join(UPLOADS_DIR, doc.filename);
  if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(filepath, doc.originalname);
});

// ─── Google OAuth helpers ────────────────────────────────────────────────────
function httpsPost(hostname, path, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const req  = https.request({ hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error('Parse error')); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── GET /auth/google ─────────────────────────────────────────────────────────
app.get('/auth/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).send('Google OAuth non configuré. Ajoutez GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans vos variables d\'environnement.');
  const fromApp = req.query.from === 'app';
  const params = new URLSearchParams({
    client_id:     GOOGLE_CLIENT_ID,
    redirect_uri:  `${BASE_URL}/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state:         fromApp ? 'from_app' : 'from_web',
    access_type:   'online',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────
app.get('/auth/google/callback', async (req, res) => {
  const { code, error, state } = req.query;
  const fromApp = state === 'from_app';
  if (error || !code) {
    return fromApp
      ? res.redirect('liquidplus://auth?error=google_cancelled')
      : res.redirect('/login.html?error=google_cancelled');
  }

  try {
    // 1. Échanger le code contre un access token
    const tokenData = await httpsPost('oauth2.googleapis.com', '/token', {
      code,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri:  `${BASE_URL}/auth/google/callback`,
      grant_type:    'authorization_code',
    });

    if (!tokenData.access_token) return res.redirect('/login.html?error=google_token');

    // 2. Récupérer les infos utilisateur
    const profile = await httpsGet('www.googleapis.com', '/oauth2/v2/userinfo', tokenData.access_token);
    if (!profile.email) return res.redirect('/login.html?error=google_email');

    const emailClean = profile.email.toLowerCase();

    // 3. Trouver ou créer l'utilisateur
    let user = findByEmail(emailClean);
    if (!user) {
      // Création automatique — pas de mot de passe (compte Google)
      user = createUser({
        email:     emailClean,
        password:  '',           // vide : connexion uniquement via Google
        full_name: profile.name || emailClean.split('@')[0],
      });
    }

    // 4. Émettre le cookie JWT et rediriger
    setAuthCookie(res, user);
    if (fromApp) {
      const appToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.redirect(`liquidplus://auth?token=${encodeURIComponent(appToken)}`);
    }
    res.redirect('/index.html');
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    fromApp
      ? res.redirect('liquidplus://auth?error=google_failed')
      : res.redirect('/login.html?error=google_failed');
  }
});

// ─── News / rapports startups ────────────────────────────────────────────────
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
if (!fs.existsSync(NEWS_FILE)) fs.writeFileSync(NEWS_FILE, '[]', 'utf8');

function readNews() {
  try { return JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')); }
  catch { return []; }
}
function writeNews(news) {
  fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2), 'utf8');
}

// GET /api/news — retourne uniquement les news des startups dans lesquelles l'utilisateur a investi
app.get('/api/news', requireAuth, (req, res) => {
  const investedIds = MOCK_INVESTMENTS.map(i => i.id);
  const news = readNews()
    .filter(n => investedIds.includes(n.startup_id))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ news });
});

// POST /api/news — permet à une startup de publier une actualité (protégé par clé)
const STARTUP_SECRET = process.env.STARTUP_SECRET || 'startup_post_secret_2026';

app.post('/api/news', (req, res) => {
  const { startup_key, startup_id, startup_name, startup_color, type, title, content, kpis } = req.body ?? {};

  if (startup_key !== STARTUP_SECRET)
    return res.status(403).json({ error: 'Clé startup invalide' });

  if (!startup_id || !title || !content)
    return res.status(400).json({ error: 'startup_id, title et content sont requis' });

  const all = readNews();
  const entry = {
    id:             all.length ? Math.max(...all.map(n => n.id)) + 1 : 1,
    startup_id:     Number(startup_id),
    startup_name:   startup_name || '',
    startup_color:  startup_color || '#2de0bc',
    type:           type || 'mensuel',
    title,
    date:           new Date().toISOString().split('T')[0],
    content,
    kpis:           Array.isArray(kpis) ? kpis : [],
  };
  all.push(entry);
  writeNews(all);
  res.status(201).json({ success: true, news: entry });
});

// ─── POST /api/admin/upload-image — upload logo ou photo fondateur ───────────
app.post('/api/admin/upload-image', requireAdmin, imageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier image' });
  res.json({ url: `/uploads/public/${req.file.filename}` });
});

// ─── GET /api/startups — catalogue public ─────────────────────────────────────
app.get('/api/startups', (req, res) => {
  res.json({ startups: readCatalog() });
});

// ─── Admin : CRUD catalogue startups ─────────────────────────────────────────

// POST /api/admin/startups — ajouter une startup
app.post('/api/admin/startups', requireAdmin, (req, res) => {
  const { name, tagline, sector, stage, color, emoji, logo_url, founded, employees,
          raised, ticket, open, website, linkedin, description, problem, solution, market, team, kpis } = req.body ?? {};

  if (!name || !tagline || !sector)
    return res.status(400).json({ error: 'name, tagline et sector sont requis' });

  const catalog = readCatalog();
  const entry = {
    id:          catalog.length ? Math.max(...catalog.map(s => s.id)) + 1 : 1,
    name:        name.trim(),
    tagline:     tagline.trim(),
    sector:      sector.trim(),
    stage:       stage || 'Pré-seed',
    color:       color || '#1f8e7a',
    emoji:       (emoji || name.charAt(0)).trim(),
    founded:     founded || String(new Date().getFullYear()),
    employees:   employees || '1',
    raised:      raised || '0',
    ticket:      ticket || '1 000 €',
    open:        open === true || open === 'true',
    logo_url:    logo_url || '',
    website:     website?.trim() || '',
    linkedin:    linkedin?.trim() || '',
    description: description?.trim() || '',
    problem:     problem?.trim() || '',
    solution:    solution?.trim() || '',
    market:      market?.trim() || '',
    team:        Array.isArray(team) ? team : [],
    kpis:        Array.isArray(kpis) ? kpis : [],
  };
  catalog.push(entry);
  writeCatalog(catalog);
  res.status(201).json({ success: true, startup: entry });
});

// PUT /api/admin/startups/:id — modifier une startup
app.put('/api/admin/startups/:id', requireAdmin, (req, res) => {
  const id      = Number(req.params.id);
  const catalog = readCatalog();
  const idx     = catalog.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Startup introuvable' });

  const updated = { ...catalog[idx], ...req.body, id };
  if (typeof updated.open === 'string') updated.open = updated.open === 'true';
  catalog[idx] = updated;
  writeCatalog(catalog);
  res.json({ success: true, startup: updated });
});

// DELETE /api/admin/startups/:id — supprimer une startup
app.delete('/api/admin/startups/:id', requireAdmin, (req, res) => {
  const id      = Number(req.params.id);
  const catalog = readCatalog();
  if (!catalog.find(s => s.id === id)) return res.status(404).json({ error: 'Startup introuvable' });
  writeCatalog(catalog.filter(s => s.id !== id));
  res.json({ success: true });
});

// GET /api/admin/me — vérifier les droits admin
app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ admin: true, email: req.user.email });
});

// ─── Démarrage ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓  Invest BG  →  http://localhost:${PORT}\n`);
});
