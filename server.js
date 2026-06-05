const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const cookieParser = require('cookie-parser');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET    = process.env.JWT_SECRET || 'invest_bg_dev_secret_CHANGE_IN_PROD';
const BCRYPT_ROUNDS = 10;

// ─── Store JSON (base de données simple) ─────────────────────────────────────
const DATA_DIR   = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]', 'utf8');

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
  res.status(201).json({
    success: true,
    user: { id: user.id, email: user.email, full_name: user.full_name },
  });
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

  setAuthCookie(res, user);
  res.json({
    success: true,
    user: { id: user.id, email: user.email, full_name: user.full_name },
  });
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
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

// ─── Démarrage ───────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✓  Invest BG  →  http://localhost:${PORT}\n`);
});
