require('dotenv').config();
const express          = require('express');
const path             = require('path');
const fs               = require('fs');
const https            = require('https');
const { Readable }     = require('stream');
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
const OpenAI           = require('openai');
const CloudConvert     = require('cloudconvert');
const JSZip            = require('jszip');
const mammoth          = require('mammoth');
const pdfParse         = require('pdf-parse');
const ExcelJS          = require('exceljs');
const { google }       = require('googleapis');
const { Dropbox }      = require('dropbox');
const archiver         = require('archiver');

const app  = express();
const PORT = process.env.PORT || 3000;
function wrapAsyncMiddleware(fn) {
  if (Array.isArray(fn)) return fn.map(wrapAsyncMiddleware);
  if (typeof fn !== 'function' || fn.length >= 4) return fn;
  return function wrappedAsyncMiddleware(req, res, next) {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (err) {
      next(err);
    }
  };
}
['get', 'post', 'put', 'delete', 'patch'].forEach((method) => {
  const original = app[method].bind(app);
  app[method] = function routeWithAsyncErrors(...args) {
    if (method === 'get' && args.length === 1) return original(...args);
    return original(...args.map((arg, index) => (index === 0 ? arg : wrapAsyncMiddleware(arg))));
  };
});
const IS_PROD              = process.env.NODE_ENV === 'production';
const JWT_SECRET           = process.env.JWT_SECRET           || 'invest_bg_dev_secret_CHANGE_IN_PROD';
const BCRYPT_ROUNDS        = 12;
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL             = process.env.BASE_URL             || 'http://localhost:3000';
const MONGODB_URI          = process.env.MONGODB_URI          || 'mongodb://localhost:27017';
const STARTUP_SECRET       = process.env.STARTUP_SECRET       || 'startup_post_secret_2026';
// Data room externe (Google Drive / Dropbox) : OAuth self-service séparé du login.
// Google Drive réutilise par défaut le client OAuth du login (même projet Google
// Cloud) — surchargeable par des variables dédiées si un client séparé est créé.
const GOOGLE_DRIVE_CLIENT_ID     = process.env.GOOGLE_DRIVE_CLIENT_ID     || GOOGLE_CLIENT_ID;
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET;
const DROPBOX_APP_KEY            = process.env.DROPBOX_APP_KEY            || '';
const DROPBOX_APP_SECRET         = process.env.DROPBOX_APP_SECRET         || '';
// Plafond GLOBAL de tokens IA par jour (tout le SaaS confondu), pour borner la
// facture. Réglable via la variable d'environnement DAILY_TOKEN_CAP (Railway →
// service → onglet Variables). Défaut : 5 000 000 tokens/jour.
const DAILY_TOKEN_CAP      = Number(process.env.DAILY_TOKEN_CAP) || 5_000_000;

const ADMIN_EMAILS = ['baptiste.faisy@gmail.com', 'bg.fsg.invest@gmail.com', 'liquidplus.startups@gmail.com'];

// ─── Assistant IA du SaaS (GLM-5.2 via Z.AI, API OpenAI-compatible) ───────────
// L'assistant juridique du term sheet utilise GLM-5.2 sur la plateforme Z.AI.
// Endpoint Coding Plan (abonnement) : https://api.z.ai/api/coding/paas/v4 —
// compatible SDK OpenAI. (L'endpoint /api/paas/v4 facture au solde et renvoie
// 1113 « Insufficient balance » tant qu'il n'est pas rechargé.)
const GLM_MODEL = 'glm-5.2';
const zaiClient = (process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY)
  ? new OpenAI({ apiKey: process.env.ZAI_API_KEY || process.env.ANTHROPIC_API_KEY, baseURL: 'https://api.z.ai/api/coding/paas/v4' })
  : null;

// Appel unifié GLM-5.2. `thinking` active le raisonnement, `json` force une
// sortie JSON (mode json_object + instruction injectée dans le prompt système
// + parsing robuste côté routeur, car GLM peut sinon enrober le JSON de texte).
async function glmChat({ system, messages, maxTokens, thinking, json, jsonHint, signal }) {
  let sys = system;
  if (json) {
    sys = (sys || '') + '\n\nFORMAT DE RÉPONSE IMPÉRATIF : renvoie UNIQUEMENT un objet JSON valide et complet, sans aucun texte autour, sans balise markdown, sans commentaire.'
      + (jsonHint ? ' ' + jsonHint : '');
  }
  const payload = {
    model: GLM_MODEL,
    max_tokens: maxTokens,
    messages: [
      ...(sys ? [{ role: 'system', content: sys }] : []),
      ...messages,
    ],
    thinking: { type: thinking ? 'enabled' : 'disabled' },
  };
  if (thinking) payload.reasoning_effort = 'high';
  if (json) payload.response_format = { type: 'json_object' };
  // `signal` permet d'interrompre l'appel réseau quand une tâche de fond est annulée.
  return zaiClient.chat.completions.create(payload, signal ? { signal } : undefined);
}
// Texte brut d'une réponse GLM.
function glmText(response) {
  return (response?.choices?.[0]?.message?.content ?? '').trim();
}
// JSON robuste depuis une réponse GLM (gère le markdown ```json éventuel).
function glmJson(response) {
  const raw = glmText(response);
  if (!raw) return {};
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const src = fenced ? fenced[1] : raw;
  try { return JSON.parse(src); } catch {}
  const m = src.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return {};
}

// ─── CloudConvert (conversion PDF ⇄ DOCX du SaaS) ─────────────────────────────
const cloudConvert = process.env.CLOUDCONVERT_API_KEY ? new CloudConvert(process.env.CLOUDCONVERT_API_KEY) : null;

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
async function deleteUserAccountById(id) {
  await Promise.all([
    col('saas_documents').deleteMany({ user_id: id }),
    col('saas_doc_versions').deleteMany({ user_id: id }),
    col('saas_doc_transmissions').deleteMany({ user_id: id }),
    col('saas_folders').deleteMany({ user_id: id }),
    col('saas_dilution_simulations').deleteMany({ user_id: id }),
    col('saas_lawyer_profiles').deleteMany({ user_id: id }),
    col('saas_avocat').deleteMany({ $or: [{ user_id: id }, { lawyer_user_id: id }] }),
    col('lawyer_client_proposals').deleteMany({ $or: [{ client_id: id }, { lawyer_id: id }] }),
    col('saas_valuation_estimations').deleteMany({ user_id: id }),
    col('saas_exit_simulations').deleteMany({ user_id: id }),
    col('saas_fundraising_profiles').deleteMany({ user_id: id }),
    col('saas_claude_usage').deleteMany({ user_id: id }),
    col('saas_compare_history').deleteMany({ user_id: id }),
  ]);
  await col('users').deleteOne({ id });
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
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain',
                     'application/vnd.ms-excel',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.oasis.opendocument.text',
                     'application/vnd.google-apps.document'];
    const extAllowed = ['.txt', '.odt', '.gdoc'].includes(path.extname(file.originalname || '').toLowerCase());
    cb(null, allowed.includes(file.mimetype) || extAllowed);
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

// Uploads SaaS : stockés en mémoire puis dans MongoDB (pas de fichier sur disque).
// Limite à 15 Mo pour rester sous le plafond de 16 Mo par document MongoDB.
const saasUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    fixOriginalName(file);
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain',
                     'application/vnd.ms-excel',
                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                     'application/msword',
                     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                     'application/vnd.oasis.opendocument.text',
                     'application/vnd.google-apps.document'];
    const extAllowed = ['.txt', '.odt', '.gdoc'].includes(path.extname(file.originalname || '').toLowerCase());
    cb(null, allowed.includes(file.mimetype) || extAllowed);
  },
});

// Convertit le BSON Binary renvoyé par MongoDB en Buffer Node.js utilisable.
function toBuffer(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data.buffer) return Buffer.from(data.buffer);
  return Buffer.from(data);
}

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

// Limite relevée à 12 Mo : les documents de l'éditeur peuvent embarquer des images
// en data-URI (signatures manuscrites, images d'un DOCX importé). La valeur par
// défaut (100 Ko) ferait échouer l'enregistrement de ces documents.
app.use(express.json({ limit: '12mb' }));
app.use(cookieParser());
app.use('/uploads/public', express.static(PUBLIC_IMG_DIR));
// Les pages HTML ne doivent jamais être servies depuis un cache périmé : sinon une
// ancienne page masque les mises à jour (une modif inline HTML/JS/CSS reste
// invisible). `no-cache` force la revalidation à chaque chargement (304 si le
// fichier n'a pas changé). Les CSS/JS externes, eux, restent versionnés via ?v=.
const staticHtmlNoCache = {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    if (path.basename(filePath) === 'auth.js') res.setHeader('Cache-Control', 'no-cache');
  },
};
// Le SaaS (dossier interne au site) est servi sous /saas → même origine que l'API,
// donc le cookie de session et les appels /api/auth/* fonctionnent sans CORS.
app.get('/saas/index.html', (_req, res) => res.redirect(302, '/index.html'));
app.use('/saas', express.static(path.join(__dirname, 'Saas'), staticHtmlNoCache));
app.use(express.static(__dirname, staticHtmlNoCache));

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

function publicAuthUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.full_name,
    created_at: user.created_at,
    account_types: Array.isArray(user.account_types) ? user.account_types : [],
    theme: (user.theme === 'dark' || user.theme === 'paper') ? user.theme : null,
    lawyer_profile_completed: !!user.lawyer_profile_completed,
    lawyer_status: user.account_types?.includes('avocat') ? (user.lawyer_status || 'pending') : null,
    is_admin: ADMIN_EMAILS.includes(user.email),
  };
}

function hasAccountTypes(user) {
  return Array.isArray(user?.account_types) && user.account_types.length > 0;
}

// Un avocat qui a déjà enregistré sa candidature (profil présent en base) doit
// accéder à son tableau de bord, pas au formulaire. On resynchronise le drapeau
// `lawyer_profile_completed` s'il a divergé du profil réellement sauvegardé
// (anciens comptes créés avant l'ajout du drapeau, désynchronisation, etc.).
// Mutation en base uniquement lorsqu'un profil existe : strictement correctif.
async function ensureLawyerCompletion(user) {
  if (!user || user.lawyer_profile_completed) return user;
  if (!Array.isArray(user.account_types) || !user.account_types.includes('avocat')) return user;
  const profile = await col('saas_lawyer_profiles').findOne({ user_id: user.id }, { projection: { _id: 1 } });
  if (profile) {
    await updateUserById(user.id, { lawyer_profile_completed: true });
    user.lawyer_profile_completed = true;
  }
  return user;
}

function authLandingPath(user) {
  if (ADMIN_EMAILS.includes(user.email)) return '/admin.html';
  if (!hasAccountTypes(user)) return '/saas/onboarding.html';
  const types = user.account_types;
  // Le rôle avocat est prioritaire pour les anciens comptes qui auraient gardé
  // simultanément les valeurs « avocat » et « fondateur ».
  if (types.includes('avocat')) {
    return '/saas/tableau-de-bord-avocat.html';
  }
  return '/saas/tableau-de-bord.html';
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

async function requireLawyer(req, res, next) {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { account_types: 1, lawyer_status: 1 } });
  if (!user?.account_types?.includes('avocat')) return res.status(403).json({ error: 'Accès réservé aux avocats' });
  if ((user.lawyer_status || 'pending') !== 'active') return res.status(403).json({ error: 'Votre compte avocat doit être activé par un administrateur' });
  req.lawyer = user;
  next();
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
  res.status(201).json({ success: true, token, user: publicAuthUser(user) });
});

// ─── POST /api/auth/account-type ──────────────────────────────────────────────
// Enregistre le(s) type(s) de compte choisi(s) à l'onboarding : fondateur,
// avocat, VC, business angel. Plusieurs valeurs possibles.
app.post('/api/auth/account-type', requireAuth, async (req, res) => {
  const { types } = req.body ?? {};
  const allowed = ['fondateur', 'avocat', 'vc', 'business_angel'];
  const clean = Array.isArray(types)
    ? [...new Set(types)].filter(t => allowed.includes(t))
    : [];
  if (clean.length === 0)
    return res.status(400).json({ error: 'Sélectionnez au moins un type de compte' });
  await updateUserById(req.user.id, { account_types: clean });
  res.json({ success: true, account_types: clean });
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
    await ensureLawyerCompletion(user);
    const token = setAuthCookie(res, user);
    return res.json({ success: true, token, user: publicAuthUser(user), redirect: authLandingPath(user) });
  }

  const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'verify_2fa' }, JWT_SECRET, { expiresIn: '5m' });
  return res.json({ requires2FA: true, tempToken });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ─── DELETE /api/auth/account ─────────────────────────────────────────────────
app.delete('/api/auth/account', requireAuth, async (req, res) => {
  if (req.body?.confirm !== 'SUPPRIMER')
    return res.status(400).json({ error: 'Confirmation requise' });

  const user = await col('users').findOne({ id: req.user.id }, { projection: { id: 1 } });
  if (!user) {
    res.clearCookie('auth_token');
    return res.status(404).json({ error: 'Utilisateur introuvable' });
  }

  totpSetupStore.delete(req.user.id);
  await deleteUserAccountById(req.user.id);
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { _id: 0, password: 0, totp_secret: 0 } });
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  await ensureLawyerCompletion(user);
  res.json({ user: publicAuthUser(user) });
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

  await ensureLawyerCompletion(user);
  const token = setAuthCookie(res, user);
  res.json({ success: true, token, user: publicAuthUser(user), redirect: authLandingPath(user) });
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
  res.json({ success: true, token, user: publicAuthUser(updated) });
});

// ─── PUT /api/auth/preferences ────────────────────────────────────────────────
// Préférences d'affichage rattachées au compte (elles suivent l'utilisateur d'un
// appareil à l'autre). Pour l'instant : thème de l'outil Avocat (« paper » / « dark »).
app.put('/api/auth/preferences', requireAuth, async (req, res) => {
  const theme = ['paper', 'dark'].includes(req.body?.theme) ? req.body.theme : null;
  if (!theme) return res.status(400).json({ error: 'Thème invalide' });
  await updateUserById(req.user.id, { theme });
  res.json({ success: true, theme });
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
    res.json({ success: true, token, user: publicAuthUser(user) });
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
    await ensureLawyerCompletion(user);
    res.redirect(authLandingPath(user));
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

app.get('/api/admin/administrators', requireAdmin, async (_req, res) => {
  const users = await col('users').find(
    { email: { $in: ADMIN_EMAILS } },
    { projection: { _id: 0, id: 1, email: 1, full_name: 1, created_at: 1 } },
  ).toArray();
  const byEmail = new Map(users.map(user => [user.email, user]));
  res.json({ administrators: ADMIN_EMAILS.map(email => {
    const user = byEmail.get(email);
    return user ? { ...user, registered: true } : { email, registered: false };
  }) });
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

// ─── Feedback : messagerie utilisateur ↔ fondateur (aucun appel IA, juste Mongo) ─
// Un seul fil de discussion par utilisateur, identifié par user_id.
// ─── Simulations de dilution ─────────────────────────────────────────────────
// L'historique est rattaché au compte plutôt qu'à un navigateur : il reste donc
// disponible après un changement d'appareil ou un nettoyage du cache local.
const DILUTION_HISTORY_MAX = 30;

function asFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeDilutionSimulation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name || '').trim().slice(0, 160);
  if (!name || !raw.state || typeof raw.state !== 'object' || Array.isArray(raw.state)) return null;

  // Une simulation est petite. Cette limite évite d'utiliser cet endpoint comme
  // stockage générique tout en laissant de la marge pour une cap table détaillée.
  let serialized;
  try { serialized = JSON.stringify(raw.state); } catch { return null; }
  if (Buffer.byteLength(serialized, 'utf8') > 100_000) return null;

  const savedAt = asFiniteNumber(raw.savedAt) || Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    savedAt,
    summary: {
      premoney: asFiniteNumber(raw.summary?.premoney),
      postV: asFiniteNumber(raw.summary?.postV),
      raised: asFiniteNumber(raw.summary?.raised),
      founderDilution: asFiniteNumber(raw.summary?.founderDilution),
    },
    state: raw.state,
  };
}

async function pruneDilutionHistory(userId) {
  const obsolete = await col('saas_dilution_simulations')
    .find({ user_id: userId }, { projection: { _id: 1 } })
    .sort({ savedAt: -1, created_at: -1 })
    .skip(DILUTION_HISTORY_MAX)
    .toArray();
  if (obsolete.length) {
    await col('saas_dilution_simulations').deleteMany({ _id: { $in: obsolete.map(entry => entry._id) } });
  }
}

app.get('/api/saas/dilution-simulations', requireAuth, async (req, res) => {
  const simulations = await col('saas_dilution_simulations')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0, created_at: 0 } })
    .sort({ savedAt: -1, created_at: -1 })
    .limit(DILUTION_HISTORY_MAX)
    .toArray();
  res.json({ simulations });
});

app.post('/api/saas/dilution-simulations', requireAuth, async (req, res) => {
  const simulation = normalizeDilutionSimulation(req.body?.simulation);
  if (!simulation) return res.status(400).json({ error: 'Simulation invalide ou trop volumineuse.' });

  const record = { ...simulation, user_id: req.user.id, created_at: new Date().toISOString() };
  await col('saas_dilution_simulations').insertOne(record);
  await pruneDilutionHistory(req.user.id);
  res.status(201).json({ simulation });
});

app.delete('/api/saas/dilution-simulations/:id', requireAuth, async (req, res) => {
  const result = await col('saas_dilution_simulations').deleteOne({ id: req.params.id, user_id: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Simulation introuvable.' });
  res.json({ success: true });
});

// ─── Estimations de valorisation ─────────────────────────────────────────────
// Même principe que l'historique de dilution : rattaché au compte plutôt qu'au
// navigateur, il survit donc à un changement d'appareil ou à un nettoyage du cache.
const VALUATION_HISTORY_MAX = 30;

function normalizeValuationEstimation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name || '').trim().slice(0, 160);
  if (!name || !raw.state || typeof raw.state !== 'object' || Array.isArray(raw.state)) return null;

  // Une estimation est petite : cette limite évite d'utiliser l'endpoint comme
  // stockage générique tout en laissant de la marge pour les trois méthodes.
  let serialized;
  try { serialized = JSON.stringify(raw.state); } catch { return null; }
  if (Buffer.byteLength(serialized, 'utf8') > 100_000) return null;

  const savedAt = asFiniteNumber(raw.savedAt) || Date.now();
  const low = Number(raw.summary?.low);
  const high = Number(raw.summary?.high);
  return {
    id: crypto.randomUUID(),
    name,
    savedAt,
    summary: {
      method: String(raw.summary?.method || '').slice(0, 40),
      methodLabel: String(raw.summary?.methodLabel || '').slice(0, 80),
      valo: asFiniteNumber(raw.summary?.valo),
      low: Number.isFinite(low) ? low : null,
      high: Number.isFinite(high) ? high : null,
    },
    state: raw.state,
  };
}

async function pruneValuationHistory(userId) {
  const obsolete = await col('saas_valuation_estimations')
    .find({ user_id: userId }, { projection: { _id: 1 } })
    .sort({ savedAt: -1, created_at: -1 })
    .skip(VALUATION_HISTORY_MAX)
    .toArray();
  if (obsolete.length) {
    await col('saas_valuation_estimations').deleteMany({ _id: { $in: obsolete.map(entry => entry._id) } });
  }
}

app.get('/api/saas/valuation-estimations', requireAuth, async (req, res) => {
  const estimations = await col('saas_valuation_estimations')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0, created_at: 0 } })
    .sort({ savedAt: -1, created_at: -1 })
    .limit(VALUATION_HISTORY_MAX)
    .toArray();
  res.json({ estimations });
});

app.post('/api/saas/valuation-estimations', requireAuth, async (req, res) => {
  const estimation = normalizeValuationEstimation(req.body?.estimation);
  if (!estimation) return res.status(400).json({ error: 'Estimation invalide ou trop volumineuse.' });

  const record = { ...estimation, user_id: req.user.id, created_at: new Date().toISOString() };
  await col('saas_valuation_estimations').insertOne(record);
  await pruneValuationHistory(req.user.id);
  res.status(201).json({ estimation });
});

app.delete('/api/saas/valuation-estimations/:id', requireAuth, async (req, res) => {
  const result = await col('saas_valuation_estimations').deleteOne({ id: req.params.id, user_id: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Estimation introuvable.' });
  res.json({ success: true });
});

// ─── Simulations d'exit ──────────────────────────────────────────────────────
// Même principe que la dilution et la valorisation : l'historique est rattaché au
// compte, il survit donc à un changement d'appareil ou à un nettoyage du cache.
const EXIT_HISTORY_MAX = 30;

function normalizeExitSimulation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const name = String(raw.name || '').trim().slice(0, 160);
  if (!name || !raw.state || typeof raw.state !== 'object' || Array.isArray(raw.state)) return null;

  // Une simulation d'exit reste petite. Cette limite évite d'utiliser l'endpoint
  // comme stockage générique tout en laissant de la marge pour une cap table détaillée.
  let serialized;
  try { serialized = JSON.stringify(raw.state); } catch { return null; }
  if (Buffer.byteLength(serialized, 'utf8') > 100_000) return null;

  const savedAt = asFiniteNumber(raw.savedAt) || Date.now();
  const moic = Number(raw.summary?.moic);
  return {
    id: crypto.randomUUID(),
    name,
    savedAt,
    summary: {
      exitType: raw.summary?.exitType === 'partial' ? 'partial' : 'total',
      amount: asFiniteNumber(raw.summary?.amount),
      founderAmount: asFiniteNumber(raw.summary?.founderAmount),
      investAmount: asFiniteNumber(raw.summary?.investAmount),
      moic: Number.isFinite(moic) ? moic : null,
      buyerPct: asFiniteNumber(raw.summary?.buyerPct),
    },
    state: raw.state,
  };
}

async function pruneExitHistory(userId) {
  const obsolete = await col('saas_exit_simulations')
    .find({ user_id: userId }, { projection: { _id: 1 } })
    .sort({ savedAt: -1, created_at: -1 })
    .skip(EXIT_HISTORY_MAX)
    .toArray();
  if (obsolete.length) {
    await col('saas_exit_simulations').deleteMany({ _id: { $in: obsolete.map(entry => entry._id) } });
  }
}

app.get('/api/saas/exit-simulations', requireAuth, async (req, res) => {
  const simulations = await col('saas_exit_simulations')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0, created_at: 0 } })
    .sort({ savedAt: -1, created_at: -1 })
    .limit(EXIT_HISTORY_MAX)
    .toArray();
  res.json({ simulations });
});

app.post('/api/saas/exit-simulations', requireAuth, async (req, res) => {
  const simulation = normalizeExitSimulation(req.body?.simulation);
  if (!simulation) return res.status(400).json({ error: 'Simulation invalide ou trop volumineuse.' });

  const record = { ...simulation, user_id: req.user.id, created_at: new Date().toISOString() };
  await col('saas_exit_simulations').insertOne(record);
  await pruneExitHistory(req.user.id);
  res.status(201).json({ simulation });
});

app.delete('/api/saas/exit-simulations/:id', requireAuth, async (req, res) => {
  const result = await col('saas_exit_simulations').deleteOne({ id: req.params.id, user_id: req.user.id });
  if (!result.deletedCount) return res.status(404).json({ error: 'Simulation introuvable.' });
  res.json({ success: true });
});

app.get('/api/saas/feedback', requireAuth, async (req, res) => {
  const thread = await col('feedback_threads').findOne({ user_id: req.user.id });
  if (thread?.unread_by_user) {
    await col('feedback_threads').updateOne({ user_id: req.user.id }, { $set: { unread_by_user: false } });
  }
  res.json({ messages: thread?.messages || [] });
});

app.get('/api/saas/feedback/unread', requireAuth, async (req, res) => {
  const thread = await col('feedback_threads').findOne({ user_id: req.user.id }, { projection: { unread_by_user: 1 } });
  res.json({ unread: !!thread?.unread_by_user });
});

app.post('/api/saas/feedback', requireAuth, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const now     = new Date().toISOString();
  const message = { id: crypto.randomUUID(), from: 'user', text, created_at: now };
  const user    = await col('users').findOne({ id: req.user.id }, { projection: { full_name: 1, email: 1 } });
  const result  = await col('feedback_threads').updateOne(
    { user_id: req.user.id },
    {
      $push: { messages: message },
      $set: { unread_by_admin: true, updated_at: now, user_email: user?.email || req.user.email, user_name: user?.full_name || null },
      $setOnInsert: { id: crypto.randomUUID(), user_id: req.user.id, unread_by_user: false, created_at: now },
    },
    { upsert: true },
  );
  res.status(201).json({ success: true, message });
});

async function enrichFeedbackThreadIdentities(threads) {
  const userIds = [...new Set(threads.map(thread => Number(thread.user_id)).filter(Number.isFinite))];
  if (!userIds.length) return threads;
  const [users, lawyerProfiles, fundraisingProfiles] = await Promise.all([
    col('users').find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, email: 1, full_name: 1, account_types: 1 } }).toArray(),
    col('saas_lawyer_profiles').find({ user_id: { $in: userIds } }, { projection: { _id: 0, user_id: 1, first_name: 1, last_name: 1 } }).toArray(),
    col('saas_fundraising_profiles').find({ user_id: { $in: userIds } }, { projection: { _id: 0, user_id: 1, company_name: 1, founders: 1 } }).toArray(),
  ]);
  const usersById = new Map(users.map(user => [user.id, user]));
  const lawyersById = new Map(lawyerProfiles.map(profile => [profile.user_id, profile]));
  const fundraisingById = new Map(fundraisingProfiles.map(profile => [profile.user_id, profile]));
  return threads.map(thread => {
    const userId = Number(thread.user_id);
    const user = usersById.get(userId);
    const lawyerProfile = lawyersById.get(userId);
    const fundraisingProfile = fundraisingById.get(userId);
    const isLawyer = !!lawyerProfile || user?.account_types?.includes('avocat');
    const lawyerName = [lawyerProfile?.first_name, lawyerProfile?.last_name].filter(Boolean).join(' ').trim();
    const founderNames = Array.isArray(fundraisingProfile?.founders)
      ? fundraisingProfile.founders
        .filter(founder => founder && founder.status !== 'investor')
        .map(founder => shortText(founder.name, 120))
        .filter(Boolean)
      : [];
    if (!isLawyer && !founderNames.length && user?.full_name) founderNames.push(user.full_name);
    return {
      ...thread,
      user_email: user?.email || thread.user_email || '',
      account_kind: isLawyer ? 'lawyer' : 'startup',
      account_label: isLawyer ? 'Avocat' : 'Startup',
      display_name: isLawyer
        ? (lawyerName || user?.full_name || thread.user_name || thread.user_email || `Compte ${thread.user_id}`)
        : (fundraisingProfile?.company_name || user?.full_name || thread.user_name || thread.user_email || `Startup ${thread.user_id}`),
      people_names: isLawyer
        ? [lawyerName || user?.full_name || thread.user_name].filter(Boolean)
        : [...new Set(founderNames)],
    };
  });
}

app.get('/api/admin/feedback', requireAdmin, async (req, res) => {
  const threads = await col('feedback_threads')
    .find({}, { projection: { _id: 0, id: 1, user_id: 1, user_email: 1, user_name: 1, unread_by_admin: 1, updated_at: 1, messages: { $slice: -1 } } })
    .sort({ updated_at: -1 })
    .toArray();
  res.json({ threads: await enrichFeedbackThreadIdentities(threads) });
});

function feedbackThreadFilter(identifier) {
  return { $or: [{ id: identifier }, { user_id: identifier }] };
}

app.get('/api/admin/feedback/:identifier', requireAdmin, async (req, res) => {
  const filter = feedbackThreadFilter(req.params.identifier);
  const thread = await col('feedback_threads').findOne(filter, { projection: { _id: 0 } });
  if (!thread) return res.status(404).json({ error: 'Fil introuvable' });
  if (thread.unread_by_admin) {
    await col('feedback_threads').updateOne(filter, { $set: { unread_by_admin: false } });
  }
  res.json({ thread: (await enrichFeedbackThreadIdentities([thread]))[0] });
});

app.post('/api/admin/feedback/:identifier', requireAdmin, async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 4000);
  if (!text) return res.status(400).json({ error: 'Message vide' });
  const now     = new Date().toISOString();
  const message = { id: crypto.randomUUID(), from: 'admin', text, created_at: now };
  const result  = await col('feedback_threads').updateOne(
    feedbackThreadFilter(req.params.identifier),
    { $push: { messages: message }, $set: { unread_by_user: true, updated_at: now } },
  );
  if (!result.matchedCount) return res.status(404).json({ error: 'Fil introuvable' });
  res.status(201).json({ success: true, message });
});

// ─── SaaS : assistant IA Claude pour modifier une clause de term sheet ─────────
// Jour courant au format YYYY-MM-DD dans le fuseau de Paris : le « par jour » du
// plafond suit l'heure française et non UTC.
function parisDay(d = new Date()) {
  return d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
}

// Comptabilise les tokens IA consommés par un utilisateur (cumul + nb requêtes)
// ET dans le compteur GLOBAL du jour, qui sert de base au plafond quotidien.
async function recordClaudeUsage(userId, response) {
  try {
    const u = response?.usage || {};
    const input  = u.prompt_tokens ?? u.input_tokens ?? 0;
    const output = u.completion_tokens ?? u.output_tokens ?? 0;
    const inc = { requests: 1, input_tokens: input, output_tokens: output, total_tokens: input + output };
    const now = new Date().toISOString();
    await col('saas_claude_usage').updateOne(
      { user_id: userId },
      { $inc: inc, $set: { updated_at: now } },
      { upsert: true }
    );
    // Compteur global par jour (base du plafond DAILY_TOKEN_CAP).
    await col('saas_usage_daily').updateOne(
      { day: parisDay() },
      { $inc: inc, $set: { updated_at: now } },
      { upsert: true }
    );
  } catch (e) { console.error('recordClaudeUsage error:', e.message); }
}

// Total de tokens IA consommés aujourd'hui, tout le SaaS confondu.
async function globalTokensToday() {
  try {
    const d = await col('saas_usage_daily').findOne(
      { day: parisDay() }, { projection: { total_tokens: 1 } }
    );
    return d?.total_tokens || 0;
  } catch { return 0; }
}

// Middleware : refuse les appels IA une fois le plafond quotidien global atteint.
// En cas d'erreur de lecture du compteur, on laisse passer (fail-open) pour ne
// pas couper l'assistant sur un simple incident de base de données.
async function enforceDailyCap(req, res, next) {
  try {
    const used = await globalTokensToday();
    if (used >= DAILY_TOKEN_CAP) {
      return res.status(429).json({
        error: `Plafond quotidien de l'assistant IA atteint (${DAILY_TOKEN_CAP.toLocaleString('fr-FR')} tokens/jour). L'assistant sera de nouveau disponible demain.`,
        cap:  DAILY_TOKEN_CAP,
        used,
      });
    }
  } catch (e) { console.error('enforceDailyCap error:', e.message); }
  next();
}

// ─── Cache d'analyse IA par contenu ────────────────────────────────────────────
// Les modèles étant des documents identiques d'une génération à l'autre, on met en
// cache le résultat de l'analyse Claude par empreinte du contenu : un modèle n'est
// analysé qu'UNE fois, puis réutilisé sans rappeler Claude.
// (crypto est importé en tête de fichier.)
function aiHash(kind, parts) {
  return crypto.createHash('sha256').update(kind + '' + parts.join('')).digest('hex');
}
async function aiCacheGet(hash) {
  try { const r = await col('ai_cache').findOne({ hash }, { projection: { _id: 0, data: 1 } }); return r ? r.data : null; }
  catch { return null; }
}
async function aiCacheSet(hash, data) {
  try { await col('ai_cache').updateOne({ hash }, { $set: { hash, data, created_at: new Date().toISOString() } }, { upsert: true }); }
  catch (e) { console.error('aiCacheSet error:', e.message); }
}

app.post('/api/saas/clause-chat', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { clauseLabel, clauseHtml, plain, documentContext, attachedDocument, messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0)
    return res.status(400).json({ error: 'messages est requis' });

  // Une clause précise est sélectionnée (mode édition ciblée) ou non (mode conversation
  // générale sur tout le document). Le fondateur peut joindre le texte intégral du document.
  const hasClause = !!(clauseHtml && typeof clauseHtml === 'string');
  const attached  = (attachedDocument && typeof attachedDocument === 'string')
    ? attachedDocument.slice(0, 20000).trim() : '';
  const attachedBlock = attached
    ? `\n\nDocument complet joint par le fondateur (texte intégral, pour référence) :\n${attached}`
    : '';

  // On ne garde que les tours user/assistant textuels, plafonnés pour borner le contexte.
  const convo = messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-16)
    .map(m => ({ role: m.role, content: m.content }));
  if (!convo.length || convo[convo.length - 1].role !== 'user')
    return res.status(400).json({ error: 'Le dernier message doit provenir de l\'utilisateur' });

  const system = hasClause ?
`Tu es l'assistant juridique IA de « liquid + », un éditeur de term sheet pour fondateurs de startup.
Tu aides un fondateur à comprendre et à modifier UNE SEULE clause de sa term sheet — celle ci-dessous, et aucune autre.

Plan complet de la term sheet (CONTEXTE seulement, pour comprendre les renvois entre clauses — tu ne dois RIEN y modifier) :
${documentContext || '(non fourni)'}${attachedBlock}

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
- N'invente jamais de chiffres non demandés et ne touche pas aux autres clauses. Signale brièvement dans "reply" l'impact de ta modification (point de vigilance).`
  :
`Tu es l'assistant juridique IA de « liquid + », un éditeur de term sheet pour fondateurs de startup.
Le fondateur discute avec toi de l'ENSEMBLE de son document — aucune clause précise n'est sélectionnée.

Plan du document (contexte) :
${documentContext || '(non fourni)'}${attachedBlock}

Règles :
- Réponds en français, de façon claire et concise, du point de vue du fondateur (jamais de l'investisseur).
- Tu peux répondre aux questions, résumer, comparer des clauses, alerter sur des risques et donner des conseils de négociation sur l'ensemble du document.
- Tu ne peux PAS modifier le document depuis cette vue générale : pour qu'une modification soit applicable, invite le fondateur à cliquer dans la clause ou le paragraphe concerné avant de te la redemander. Ici, laisse TOUJOURS "edits" vide ([]) et "updatedClause" vide ("").`;

  try {
    const response = await glmChat({
      system,
      messages: convo,
      maxTokens: 8000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"reply":"texte","edits":[{"find":"extrait exact","replace":"remplacement"}],"updatedClause":""} — "edits" pour une modif ciblée, OU "updatedClause" pour une réécriture totale, jamais les deux.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
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
app.post('/api/saas/clause-explain', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

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
- Réponds UNIQUEMENT par le texte de l'explication, en français. 10 PHRASES MAXIMUM : sois concis et direct, va à l'essentiel.
- JAMAIS de tableau (ni HTML ni Markdown), jamais de liste, jamais de puce, jamais de titre, jamais de balise. UNIQUEMENT du texte brut continu.
- Sois fidèle aux valeurs réellement écrites dans la clause : si une durée, un montant ou un pourcentage change, l'explication doit changer en conséquence.
- Utilise une analogie simple et concrète de la vie quotidienne, du point de vue du fondateur. Pas de jargon juridique.`;

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Rédige le bloc « Pour bien comprendre » pour cette clause.' }],
      maxTokens: 600,
      thinking: false,
    });
    await recordClaudeUsage(req.user.id, response);
    const simple = glmText(response);
    res.json({ simple });
  } catch (err) {
    console.error('Claude clause-explain error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : vérification d'UNE clause + de ses contenus pédagogiques ────────────
app.post('/api/saas/clause-verify', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { clauseLabel, clauseHtml, plain, simple, watch } = req.body ?? {};
  if (!clauseHtml || typeof clauseHtml !== 'string')
    return res.status(400).json({ error: 'clauseHtml est requis' });

  const system =
`Tu es un expert juridique et pédagogique qui accompagne des fondateurs de startup dans la lecture de leur term sheet.
Tu reçois UNE clause d'une term sheet ainsi que les trois contenus pédagogiques affichés à côté dans l'éditeur :
- « En langage courant » (résumé)
- « Pour bien comprendre » (explication imagée)
- « Conseil fondateur » (point de vigilance)

Ta mission est double :
1. Analyser la clause elle-même — y a-t-il un déséquilibre, un risque caché, une formulation à clarifier ou à négocier ?
2. Évaluer la qualité pédagogique de ces trois explications — sont-elles fidèles au texte réel, utiles pour un fondateur non-juriste, ni trop alarmistes ni trop rassurantes ?

Clause : « ${clauseLabel || 'Clause'} »
Texte HTML de la clause :
${clauseHtml}

En langage courant : ${plain || '(non fourni)'}
Pour bien comprendre : ${simple || '(non généré)'}
Conseil fondateur : ${watch || '(non fourni)'}

Réponds en français, en texte continu, 3 à 6 phrases. Commence par un verdict sur la clause (OK / à surveiller / problématique), puis tes observations sur les explications pédagogiques, puis une suggestion concrète si nécessaire. Pas de titre, pas de liste, texte fluide.`;

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Analyse cette clause et ses contenus pédagogiques.' }],
      maxTokens: 800,
      thinking: false,
    });
    await recordClaudeUsage(req.user.id, response);
    const analysis = glmText(response);
    res.json({ analysis });
  } catch (err) {
    console.error('Claude clause-verify error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : explication d'un EXTRAIT sélectionné (contexte : toute la page) ────
// L'utilisateur sélectionne du texte dans l'éditeur et demande à l'IA de le lui
// expliquer. On envoie à Claude l'extrait + le contexte complet de la page pour
// qu'il interprète l'extrait en fonction du reste du document.
app.post('/api/saas/explain-selection', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { selection, documentContext } = req.body ?? {};
  if (!selection || typeof selection !== 'string' || !selection.trim())
    return res.status(400).json({ error: 'selection est requis' });

  const system =
`Tu es l'assistant juridique IA de « liquid + », un éditeur de documents juridiques pour fondateurs de startup.
L'utilisateur a SÉLECTIONNÉ un extrait précis dans son document et veut que tu le lui expliques.

Extrait sélectionné à expliquer :
"""
${String(selection).slice(0, 4000)}
"""

Contexte complet du document (pour interpréter l'extrait, les renvois et la cohérence) :
"""
${String(documentContext || '').slice(0, 12000)}
"""

Règles :
- Réponds en français, du point de vue du fondateur, en 2 à 5 phrases, texte fluide (pas de liste, pas de titre, pas de balises HTML).
- Explique d'abord ce que veut dire l'extrait en langage simple et concret.
- Précise, si utile, comment l'extrait s'articule avec le reste du document (utilise le contexte fourni).
- Termine par un point de vigilance ou un conseil court si l'extrait présente un risque ou une opportunité de négociation.`;

  const cacheHash = aiHash('explain-selection', [String(selection).slice(0, 4000), String(documentContext || '').slice(0, 12000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ explanation: cached, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Explique cet extrait au fondateur.' }],
      maxTokens: 800,
      thinking: false,
    });
    await recordClaudeUsage(req.user.id, response);
    const explanation = glmText(response);
    if (explanation) await aiCacheSet(cacheHash, explanation);
    res.json({ explanation });
  } catch (err) {
    console.error('Claude explain-selection error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : conseils d'amélioration SPÉCIFIQUES à un document ──────────────────
app.post('/api/saas/doc-advice', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { title, text } = req.body ?? {};
  if (!text || typeof text !== 'string')
    return res.status(400).json({ error: 'text est requis' });

  const system =
`Tu es l'assistant de « liquid + », un outil juridique pour fondateurs de startup en levée de fonds.
On te donne le contenu réel d'UN document juridique. Tu dois proposer des conseils CONCRETS et SPÉCIFIQUES À CE DOCUMENT pour l'améliorer / le compléter, du point de vue du fondateur.

Type / titre du document : « ${title || 'Document'} »

Contenu réel du document :
${String(text).slice(0, 12000)}

Règles :
- 3 à 5 conseils, propres à CE document précis (cite des éléments réels : un article, un champ à compléter, une valeur, une incohérence, une clause manquante typique de ce type de document).
- N'invente pas de conseils génériques applicables à n'importe quel document (ex. « faites relire par un avocat », « datez le document »). Sois spécifique au contenu.
- Chaque conseil : un "title" court (max ~6 mots) et un "body" d'une phrase, en français, ton clair et utile.`;

  // Cache par contenu : un même document n'est analysé qu'une fois.
  const cacheHash = aiHash('doc-advice', [title || '', String(text).slice(0, 12000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ tips: cached, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Donne les conseils d\'amélioration spécifiques à ce document.' }],
      maxTokens: 6000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"tips":[{"title":"titre court","body":"une phrase"}]} — 3 à 5 conseils.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const tips = Array.isArray(data.tips) ? data.tips.filter(t => t && t.title && t.body) : [];
    if (tips.length) await aiCacheSet(cacheHash, tips);
    res.json({ tips });
  } catch (err) {
    console.error('Claude doc-advice error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : clauses disponibles à ajouter (bibliothèque de l'éditeur) ──────────
// Reçoit les clauses actuelles du document ; l'IA propose des clauses MANQUANTES
// typiques de ce type de document, rédigées et prêtes à insérer.
app.post('/api/saas/doc-clauses', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { title, clauses, text } = req.body ?? {};
  const current = (Array.isArray(clauses) ? clauses : []).slice(0, 80).map(c => ({
    label: String(c && c.label ? c.label : '').slice(0, 200),
    group: String(c && c.group ? c.group : '').slice(0, 120),
  })).filter(c => c.label);

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne le titre d'UN document juridique, la liste de ses clauses/paragraphes ACTUELS et un extrait de son contenu. Tu proposes des clauses MANQUANTES, typiques de ce type de document, que le fondateur pourrait vouloir ajouter.

Type / titre du document : « ${title || 'Document'} »

Clauses déjà présentes :
${current.map(c => `- ${c.label}${c.group ? ' (' + c.group + ')' : ''}`).join('\n') || '(aucune)'}

Extrait du document :
${String(text || '').slice(0, 8000)}

Règles :
- Propose 4 à 8 clauses ABSENTES du document, réellement utiles pour CE type de document précis (aucun doublon avec les clauses présentes).
- Chaque clause : "label" (nom court, ≤ 8 mots), "group" (section du document où elle irait ; réutilise si possible un intitulé de section existant), "plain" (1 phrase en langage courant expliquant ce qu'elle fait), "watch" (1 phrase sur le point de vigilance côté fondateur), "html" (texte COMPLET de la clause, rédigé en français juridique, prêt à insérer, en HTML avec des balises <p> ; valeurs à personnaliser [entre crochets]).
- Rédige des clauses complètes et directement utilisables, pas des résumés.`;

  // Cache par contenu : mêmes clauses présentes + même texte → mêmes propositions.
  const cacheHash = aiHash('doc-clauses', [title || '', current.map(c => c.label).join('|'), String(text || '').slice(0, 8000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ clauses: cached, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Propose les clauses manquantes à ajouter à ce document.' }],
      maxTokens: 12000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"clauses":[{"label":"...","group":"...","plain":"...","watch":"...","html":"<p>...</p>"}]} — 4 à 8 clauses.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const out = (Array.isArray(data.clauses) ? data.clauses : [])
      .filter(c => c && c.label && c.html)
      .slice(0, 8)
      .map(c => ({
        label: String(c.label).slice(0, 120),
        group: String(c.group || 'Clauses proposées').slice(0, 120),
        plain: String(c.plain || '').slice(0, 300),
        watch: String(c.watch || '').slice(0, 400),
        html:  String(c.html),
      }));
    if (out.length) await aiCacheSet(cacheHash, out);
    res.json({ clauses: out });
  } catch (err) {
    console.error('Claude doc-clauses error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : analyse d'un document → liste des « choses à faire » ───────────────
app.post('/api/saas/doc-analyze', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { title, text } = req.body ?? {};
  if (!text || typeof text !== 'string')
    return res.status(400).json({ error: 'text est requis' });

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne le contenu réel d'UN document juridique. Tu dois l'analyser et lister TOUTES les « choses à faire » concrètes pour que ce document précis soit complet, exact et prêt à l'emploi, du point de vue du fondateur.

Type / titre du document : « ${title || 'Document'} »

Contenu réel du document :
${String(text).slice(0, 14000)}

Règles :
- Liste des actions concrètes et SPÉCIFIQUES À CE DOCUMENT : champs à compléter (cite-les), valeurs/dates/montants manquants, clauses à préciser ou à ajouter typiques de ce type de document, incohérences à corriger, vérifications à faire.
- N'invente pas d'actions génériques applicables à n'importe quel document (ex. « faire relire par un avocat »).
- Chaque item : une phrase d'action commençant par un verbe à l'infinitif, en français.
- Donne entre 4 et 12 items, ordonnés du plus important au moins important.`;

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Analyse ce document et liste les choses à faire.' }],
      maxTokens: 8000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"todos":["action 1","action 2", ...]} — 4 à 12 items, chaque action commençant par un verbe à l\'infinitif.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const todos = Array.isArray(data.todos) ? data.todos.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [];
    res.json({ todos });
  } catch (err) {
    console.error('Claude doc-analyze error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : comparaison IA de deux versions successives d'un document ──────────
// Reçoit l'id d'une ANCIENNE et d'une NOUVELLE version (documents de l'utilisateur),
// extrait le texte de chacune et demande à l'IA ce qui a changé, du point de vue
// du fondateur. Résultat mis en cache par empreinte des deux contenus.
app.post('/api/saas/doc-compare', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  // Chaque côté de la comparaison est soit un document (oldId / newId), soit une
  // version VALIDÉE stockée à part (oldVersionId / newVersionId, collection
  // saas_doc_versions — cf. l'historique des versions de l'éditeur).
  async function resolveSide(docIdRaw, versionIdRaw) {
    const versionId = Number(versionIdRaw);
    if (versionId) {
      const v = await col('saas_doc_versions').findOne({ id: versionId, user_id: req.user.id });
      if (!v) return null;
      const name = v.label || ('Version du ' + new Date(v.created_at).toLocaleDateString('fr-FR'));
      return { doc: { kind: 'termsheet', html: v.html, name }, meta: { id: versionId, version: true, name, date: v.created_at, kind: 'version' } };
    }
    const docId = Number(docIdRaw);
    if (!docId) return null;
    const d = await col('saas_documents').findOne({ id: docId, user_id: req.user.id });
    if (!d) return null;
    return { doc: d, meta: { id: docId, name: d.name, date: d.updated_at || d.created_at, kind: d.kind || 'file' } };
  }

  const [oldSide, newSide] = await Promise.all([
    resolveSide(req.body?.oldId, req.body?.oldVersionId),
    resolveSide(req.body?.newId, req.body?.newVersionId),
  ]);
  if (!oldSide || !newSide) {
    const provided = req.body && (req.body.oldId || req.body.newId || req.body.oldVersionId || req.body.newVersionId);
    return res.status(provided ? 404 : 400).json({ error: provided ? 'Une des versions est introuvable.' : 'oldId et newId (ou oldVersionId / newVersionId) requis' });
  }
  const oldDoc = oldSide.doc, newDoc = newSide.doc;
  const meta = { old: oldSide.meta, new: newSide.meta };

  const [oldText, newText] = await Promise.all([docPlainText(oldDoc), docPlainText(newDoc)]);
  if (!oldText || !newText)
    return res.status(422).json({ error: 'Impossible d\'extraire le texte d\'une des versions (format non supporté — image, tableur — ou fichier vide). La comparaison IA fonctionne pour les PDF, les Word et les documents éditables.' });

  const cacheHash = aiHash('doc-compare', [oldText.slice(0, 14000), newText.slice(0, 14000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ ...cached, meta, cached: true });

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne DEUX versions successives d'UN MÊME document juridique : une ANCIENNE version et une NOUVELLE version. Tu compares les deux et expliques, du point de vue du fondateur, ce qui a changé et pourquoi c'est important.

Titre du document : « ${newDoc.name || 'Document'} »

=== ANCIENNE VERSION ===
${oldText.slice(0, 14000)}

=== NOUVELLE VERSION ===
${newText.slice(0, 14000)}

Règles :
- Repère les changements RÉELS et concrets entre les deux versions : clauses ajoutées, supprimées, montants / dates / pourcentages / durées modifiés, formulations renforcées ou affaiblies, obligations nouvelles.
- Ignore les différences purement cosmétiques (mise en page, ponctuation) SAUF si elles changent le sens.
- Pour chaque changement : "heading" (titre court, ≤ 8 mots), "nature" ('ajout' | 'suppression' | 'modification'), "before" (ce que disait l'ancienne version, court ; "" si c'est un ajout), "after" (ce que dit la nouvelle version, court ; "" si c'est une suppression), "impact" (1 phrase sur la conséquence concrète côté fondateur), "severity" ('haute' | 'moyenne' | 'basse' selon l'importance du changement pour le fondateur).
- "summary" : 2 à 3 phrases de synthèse de l'évolution entre les deux versions.
- "verdict" : une expression courte parmi 'Favorable au fondateur', 'Plutôt neutre', 'Vigilance requise', 'Défavorable au fondateur'.
- "recommendation" : 1 à 2 phrases de conseil concret pour le fondateur au vu de ces changements.
- Classe les changements du plus important au moins important pour le fondateur.
- Si les deux versions sont identiques ou quasi identiques, indique-le dans "summary" et renvoie "changes" vide.`;

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Compare l\'ancienne et la nouvelle version, et détaille les changements.' }],
      maxTokens: 8000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"summary":"...","verdict":"Vigilance requise","changes":[{"heading":"...","nature":"modification","before":"...","after":"...","impact":"...","severity":"moyenne"}],"recommendation":"..."}',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const natures    = new Set(['ajout', 'suppression', 'modification']);
    const severities = new Set(['haute', 'moyenne', 'basse']);
    const result = {
      summary: typeof data.summary === 'string' ? data.summary : '',
      verdict: typeof data.verdict === 'string' ? data.verdict : '',
      changes: Array.isArray(data.changes) ? data.changes.filter(c => c && (c.heading || c.impact)).slice(0, 40).map(c => ({
        heading:  String(c.heading || '').slice(0, 160),
        nature:   natures.has(c.nature) ? c.nature : 'modification',
        before:   String(c.before || '').slice(0, 600),
        after:    String(c.after || '').slice(0, 600),
        impact:   String(c.impact || '').slice(0, 600),
        severity: severities.has(c.severity) ? c.severity : 'moyenne',
      })) : [],
      recommendation: typeof data.recommendation === 'string' ? data.recommendation : '',
    };
    if (result.summary || result.changes.length) await aiCacheSet(cacheHash, result);
    res.json({ ...result, meta });
  } catch (err) {
    console.error('Claude doc-compare error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// Texte lisible d'une cellule Excel, quel que soit son type (texte enrichi,
// lien hypertexte, formule, date, nombre…).
function xlsxCellText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toLocaleDateString('fr-FR');
  if (Array.isArray(value.richText)) return value.richText.map(r => r.text || '').join('').trim();
  if (typeof value.text === 'string') return value.text.trim();
  if (value.result != null) return xlsxCellText(value.result);
  return '';
}

// Aplati un classeur Excel (.xlsx) en texte, une ligne par ligne de tableur,
// pour réutiliser le même parseur de checklist que les PDF/Word.
async function xlsxToText(buf) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buf);
  const lines = [];
  workbook.eachSheet(sheet => {
    sheet.eachRow(row => {
      // On garde la cellule la plus longue de la ligne (la description), les
      // colonnes voisines (numéro, statut…) n'apportent que du bruit.
      let best = '';
      row.eachCell({ includeEmpty: false }, cell => {
        const text = xlsxCellText(cell.value);
        if (text.length > best.length) best = text;
      });
      if (best) lines.push(best);
    });
  });
  return lines.join('\n');
}

function decodeXmlText(text) {
  return String(text || '')
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

// Un ODT est une archive ZIP dont content.xml contient le texte du document.
// On conserve les limites de paragraphes, listes et tableaux pour produire un
// texte brut exploitable par la comparaison, l'autofill et les checklists.
async function odtToText(buf) {
  const zip = await JSZip.loadAsync(buf);
  const content = zip.file('content.xml');
  if (!content) throw new Error('content.xml absent du fichier ODT');
  let xml = await content.async('string');
  xml = xml
    .replace(/<text:s(?:\s+text:c="(\d+)")?[^>]*\/>/gi, (_m, count) => ' '.repeat(Math.min(Number(count) || 1, 50)))
    .replace(/<text:tab[^>]*\/>/gi, '\t')
    .replace(/<text:line-break[^>]*\/>/gi, '\n')
    .replace(/<\/text:(?:p|h|list-item)>/gi, '\n')
    .replace(/<\/table:table-row>/gi, '\n')
    .replace(/<\/table:table-cell>/gi, '\t')
    .replace(/<[^>]+>/g, ' ');
  return decodeXmlText(xml);
}

// ─── SaaS : remplissage automatique des champs depuis les documents importés ───
// Extrait (et met en cache dans le document) le texte brut d'un document importé
// (PDF, Word, OpenDocument, Excel ou TXT). Renvoie '' si inexploitable.
async function extractImportedText(doc) {
  if (typeof doc.extracted_text === 'string') return doc.extracted_text;

  const full = await col('saas_documents').findOne({ id: doc.id, user_id: doc.user_id }, { projection: { data: 1 } });
  const buf  = toBuffer(full && full.data);
  if (!buf) return '';

  const ext = path.extname(doc.originalname || doc.name || '').toLowerCase();
  let text = '';
  try {
    if (ext === '.pdf') {
      text = (await pdfParse(buf)).text || '';
    } else if (ext === '.docx' || ext === '.doc') {
      // Un .doc « de secours » peut en réalité contenir du HTML (voir /to-editor).
      const sample = buf.slice(0, 300).toString('utf8');
      if (/<html|<!DOCTYPE/i.test(sample)) text = buf.toString('utf8').replace(/<[^>]+>/g, ' ');
      else text = (await mammoth.extractRawText({ buffer: buf })).value || '';
    } else if (ext === '.xlsx') {
      text = await xlsxToText(buf);
    } else if (ext === '.odt') {
      text = await odtToText(buf);
    } else if (ext === '.txt') {
      text = buf.toString('utf8');
    }
  } catch (e) {
    // Erreur de parsing (fichier corrompu…) : on ne met PAS en cache, pour réessayer plus tard.
    console.error(`extraction texte du document ${doc.id} :`, e.message);
    return '';
  }

  text = text.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 20000);
  await col('saas_documents').updateOne(
    { id: doc.id, user_id: doc.user_id },
    { $set: { extracted_text: text, extracted_at: new Date().toISOString() } }
  );
  return text;
}

// Texte brut lisible d'un document, quel que soit son type : term sheet éditée
// (HTML → texte) ou fichier importé (PDF / Word / TXT via extractImportedText).
// Sert à la comparaison de versions par l'IA.
async function docPlainText(doc) {
  if (!doc) return '';
  if (doc.kind === 'termsheet') {
    return String(doc.html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ').trim().slice(0, 20000);
  }
  return await extractImportedText(doc);
}

// Reçoit la liste des champs [entre crochets] du document en cours d'édition,
// lit les documents importés de l'utilisateur, et demande à l'IA la valeur
// réelle de chaque champ trouvable dans ces documents (jamais d'invention).
app.post('/api/saas/autofill', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { title, fields } = req.body ?? {};
  if (!Array.isArray(fields) || !fields.length)
    return res.status(400).json({ error: 'fields requis' });

  const list = fields.slice(0, 80).map((f, i) => ({
    id:      Number.isInteger(f && f.id) ? f.id : i,
    text:    String((f && f.text) || '').slice(0, 120),
    clause:  String((f && f.clause) || '').slice(0, 160),
    context: String((f && f.context) || '').slice(0, 240),
  })).filter(f => f.text);
  if (!list.length) return res.status(400).json({ error: 'fields requis' });

  // Documents importés (fichiers, pas les documents de travail), du plus récent au plus ancien.
  const docs = await col('saas_documents')
    .find(
      { user_id: req.user.id, kind: { $ne: 'termsheet' } },
      { projection: { _id: 0, id: 1, user_id: 1, name: 1, originalname: 1, extracted_text: 1, created_at: 1 } }
    )
    .sort({ created_at: -1 })
    .limit(12)
    .toArray();

  if (!docs.length)
    return res.status(422).json({ error: 'Aucun document importé : ajoutez d\'abord vos documents (Kbis, statuts, pacte…) depuis la page Dossiers ou le bouton « + Ajouter un document ».' });

  const sources = [];
  const unsupported = [];
  for (const d of docs) {
    if (sources.length >= 8) break;
    const ext = path.extname(d.originalname || d.name || '').toLowerCase();
    if (!['.pdf', '.docx', '.doc', '.odt', '.xlsx', '.txt'].includes(ext)) { unsupported.push(d.name); continue; }
    const text = await extractImportedText(d);
    if (text) sources.push({ name: d.name, text });
    else unsupported.push(d.name);
  }

  if (!sources.length)
    return res.status(422).json({ error: 'Aucun texte exploitable dans vos documents importés : le remplissage automatique lit les PDF, Word, OpenDocument, Excel et TXT.' });

  // Budget de contexte réparti entre les documents.
  const PER_DOC = Math.max(2500, Math.floor(36000 / sources.length));
  const corpus  = sources
    .map(s => `=== DOCUMENT : « ${s.name} » ===\n${s.text.slice(0, PER_DOC)}`)
    .join('\n\n');

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
L'utilisateur rédige le document « ${String(title || 'Document').slice(0, 120)} », qui contient des champs à compléter (textes entre crochets).
On te fournit le contenu réel des documents qu'il a importés dans son espace (Kbis, statuts, pacte d'associés, term sheet, pièces administratives…). Ta mission : pour CHAQUE champ listé, trouver dans ces documents la valeur réelle qui doit remplacer le crochet.

Documents importés :
${corpus}

Champs à compléter (id | champ | paragraphe | contexte de la phrase) :
${list.map(f => `${f.id} | ${f.text} | ${f.clause}${f.context ? ' | …' + f.context + '…' : ''}`).join('\n')}

Règles :
- N'utilise QUE des informations réellement présentes dans les documents importés ci-dessus. Si l'information ne s'y trouve pas, OMETS le champ. N'invente JAMAIS de valeur.
- "value" : la valeur seule, prête à être insérée à la place du crochet dans la phrase (sans crochets, sans commentaire), adaptée au contexte (majuscules, singulier/pluriel). Conventions françaises : dates « 12 mars 2026 », montants « 500 000 € ».
- "source" : le nom exact du document d'où provient l'information.
- Si plusieurs documents se contredisent, privilégie le plus officiel puis le plus récent (Kbis > statuts > autres).`;

  // Cache par contenu : mêmes documents + mêmes champs → même réponse, sans rappeler l'IA.
  const cacheHash = aiHash('autofill-v1', [
    String(title || ''),
    ...sources.map(s => s.name + '|' + s.text.slice(0, PER_DOC)),
    ...list.map(f => f.id + '|' + f.text + '|' + f.clause + '|' + f.context),
  ]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ fills: cached, sources: sources.map(s => s.name), unsupported, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Remplis les champs à partir des documents importés.' }],
      maxTokens: 10000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"fills":[{"id":0,"value":"valeur à insérer","source":"nom du document"}]} — uniquement les champs dont la valeur est réellement trouvée dans les documents.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const byId = new Map(list.map(f => [f.id, f]));
    const fills = (Array.isArray(data.fills) ? data.fills : [])
      .filter(f => f && byId.has(Number(f.id)) && typeof f.value === 'string' && f.value.trim())
      .map(f => ({
        id:     Number(f.id),
        value:  f.value.trim().slice(0, 300),
        source: String(f.source || '').trim().slice(0, 120),
      }));
    if (fills.length) await aiCacheSet(cacheHash, fills);
    res.json({ fills, sources: sources.map(s => s.name), unsupported });
  } catch (err) {
    console.error('Claude autofill error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : explication « Pour bien comprendre » de TOUS les paragraphes (groupée) ─
app.post('/api/saas/clauses-explain', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { title, clauses } = req.body ?? {};
  if (!Array.isArray(clauses) || !clauses.length)
    return res.status(400).json({ error: 'clauses requis' });

  // On borne le nombre de paragraphes et la taille de chacun.
  const list = clauses.slice(0, 60).map((c, i) => ({
    key:   String(c && c.key != null ? c.key : 'c' + (i + 1)),
    label: String(c && c.label ? c.label : 'Paragraphe ' + (i + 1)).slice(0, 200),
    html:  String(c && c.html ? c.html : '').slice(0, 4000),
  }));

  const system =
`Tu es l'assistant pédagogique de « liquid + », un outil juridique pour fondateurs de startup en levée de fonds.
On te donne la liste des paragraphes d'UN document juridique. Pour CHAQUE paragraphe, tu produis 5 choses, du point de vue du FONDATEUR :

1. "plain" : une phrase TRÈS courte (20 mots max) qui résume ce que dit la clause en langage courant.
2. "simple" : explication « Pour bien comprendre », 10 phrases max, simples et imagées, fidèles aux valeurs réelles du texte (durées, montants, pourcentages), sans jargon. UNIQUEMENT du texte brut (jamais de tableau, liste, puce ou balise).
3. "bias" : un entier de 1 à 5 mesurant l'avantage pour l'investisseur : 1 = neutre/équilibré, 2 = légèrement favorable, 3 = favorable, 4 = très favorable, 5 = fortement favorable aux investisseurs.
4. "watch" : 1 à 3 phrases sur les points de vigilance et ce qu'il faut négocier, côté fondateur.
5. "conditions" : 0 à 2 variantes rédigées de cette clause (uniquement si pertinent : montant, durée, seuil, option, alternative). Chaque variante : "label" (≤ 6 mots), "preview" (1 phrase), "html" (texte de la variante en HTML, avec des balises <p> ; valeurs modifiables entourées de <mark class="cond-val">).

Type / titre du document : « ${title || 'Document'} »

Paragraphes (identifiant + libellé + contenu) :
${list.map(c => `--- ${c.key} | ${c.label}\n${c.html}`).join('\n\n')}

Renvoie un objet par identifiant fourni, avec les 5 champs (omets "conditions" ou mets [] s'il n'y a pas de variante pertinente).`;

  // Cache par contenu : on n'explique un même ensemble de paragraphes qu'une fois.
  const cacheHash = aiHash('clauses-explain-v4', [title || '', ...list.map(c => c.key + '|' + c.html)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ explanations: cached, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Analyse chaque paragraphe et remplis les 5 champs.' }],
      maxTokens: 20000,
      thinking: false,
      json: true,
      jsonHint: 'Format : {"items":[{"key":"<id>","plain":"phrase courte","simple":"explication 10 phrases max","bias":3,"watch":"points de vigilance","conditions":[{"label":"...","preview":"...","html":"<p>...</p>"}]}]} — un objet par identifiant fourni.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const explanations = {};
    if (Array.isArray(data.items)) {
      data.items.forEach(it => {
        if (!it || it.key == null) return;
        const k = String(it.key);
        const entry = {};
        if (typeof it.plain === 'string' && it.plain.trim()) entry.plain = it.plain.trim();
        if (typeof it.simple === 'string' && it.simple.trim()) entry.simple = it.simple.trim();
        if (Number.isInteger(it.bias)) entry.bias = Math.max(1, Math.min(5, it.bias));
        if (typeof it.watch === 'string' && it.watch.trim()) entry.watch = it.watch.trim();
        if (Array.isArray(it.conditions)) {
          const conds = it.conditions
            .filter(c => c && (c.html || c.label))
            .slice(0, 2)
            .map(c => ({
              label:   String(c.label || 'Variante').slice(0, 80),
              preview: String(c.preview || '').slice(0, 200),
              html:    String(c.html || '<p></p>'),
            }));
          if (conds.length) entry.conditions = conds;
        }
        if (Object.keys(entry).length) explanations[k] = entry;
      });
    }
    if (Object.keys(explanations).length) await aiCacheSet(cacheHash, explanations);
    res.json({ explanations });
  } catch (err) {
    console.error('Claude clauses-explain error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : explication des résultats d'un simulateur (cap table / waterfall) ──
// POINT NON NÉGOCIABLE : le calcul de la cap table, de la dilution et du waterfall
// est fait par le moteur DÉTERMINISTE en JavaScript (pages dilution.html / exit.html).
// Cet endpoint ne fait que COMMENTER des chiffres DÉJÀ CALCULÉS et transmis par le
// client. GLM ne produit, ne recalcule et n'invente JAMAIS un chiffre : c'est le seul
// endroit du flux où une hallucination serait à la fois probable et catastrophique.
const EXPLAIN_SIM_KINDS = {
  dilution: 'une simulation de DILUTION (répartition du capital / cap table avant et après un tour de financement)',
  exit:     'une simulation de SORTIE (exit) — répartition du produit d\'une cession via la cascade des préférences de liquidation (waterfall) ou une cession secondaire',
};

// Nettoie une valeur en chaîne courte (les nombres arrivent déjà FORMATÉS par le
// front : « 500 000 € », « 12,3 % », « 1,8× »… — on ne reformate ni ne recalcule rien).
function clampCell(v) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 60);
}

app.post('/api/saas/explain-simulation', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });

  const { kind, scenario, figures, table, notes } = req.body ?? {};
  if (!kind || !EXPLAIN_SIM_KINDS[kind])
    return res.status(400).json({ error: 'kind invalide (attendu : dilution ou exit)' });

  // On borne et on aplatit strictement tout ce qui vient du client : seuls des
  // libellés + valeurs déjà formatées atteignent le prompt, jamais de calcul à refaire.
  const figs = (Array.isArray(figures) ? figures : [])
    .slice(0, 12)
    .map(f => ({ label: clampCell(f && f.label), value: clampCell(f && f.value) }))
    .filter(f => f.label && f.value);

  const cols = (table && Array.isArray(table.columns) ? table.columns : []).slice(0, 8).map(clampCell);
  const rows = (table && Array.isArray(table.rows) ? table.rows : [])
    .slice(0, 40)
    .map(r => (Array.isArray(r) ? r : []).slice(0, 8).map(clampCell));
  const noteList = (Array.isArray(notes) ? notes : [])
    .slice(0, 6)
    .map(n => clampCell(n).slice(0, 240))
    .filter(Boolean);

  if (!figs.length && !rows.length)
    return res.status(400).json({ error: 'Aucun chiffre à expliquer.' });

  const scenarioLabel = kind === 'exit'
    ? (scenario === 'partial' ? 'Cession partielle (secondaire)' : 'Sortie totale (waterfall)')
    : '';

  const figuresBlock = figs.length
    ? 'CHIFFRES CLÉS (déjà calculés) :\n' + figs.map(f => `- ${f.label} : ${f.value}`).join('\n')
    : '';
  const tableBlock = rows.length
    ? 'DÉTAIL PAR LIGNE (déjà calculé) :\n'
      + (cols.length ? cols.join(' | ') + '\n' : '')
      + rows.map(r => r.join(' | ')).join('\n')
    : '';
  const notesBlock = noteList.length
    ? 'ALERTES DÉJÀ DÉTECTÉES PAR L\'OUTIL :\n' + noteList.map(n => `- ${n}`).join('\n')
    : '';

  const system =
`Tu es l'assistant pédagogique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te transmet les RÉSULTATS de ${EXPLAIN_SIM_KINDS[kind]}${scenarioLabel ? ` — scénario : ${scenarioLabel}` : ''}.

RÈGLE ABSOLUE, LA PLUS IMPORTANTE : ces chiffres ont été calculés par le moteur déterministe de l'application. Tu ne dois JAMAIS recalculer, corriger, arrondir, additionner, extrapoler ni inventer le moindre chiffre. Tu utilises EXCLUSIVEMENT les valeurs fournies ci-dessous, telles quelles. Si un montant, un pourcentage ou un multiple n'est pas dans les données, tu ne le mentionnes pas et tu ne le devines pas. Tu commentes, tu ne produis pas.

${figuresBlock}

${tableBlock}

${notesBlock}

Ta mission : expliquer ces résultats à un fondateur non financier, en français.
- 3 à 5 phrases par idée, en 2 ou 3 courts paragraphes de texte continu (pas de tableau, pas de liste à puces, pas de titre, pas de balise).
- Explique ce que ces chiffres signifient CONCRÈTEMENT pour le fondateur (ce qu'il garde, ce qu'il touche, qui est prioritaire, l'effet des préférences ou du pool).
- Quand tu cites un chiffre, reprends-le à l'identique depuis les données ci-dessus, sans le modifier.
- Termine par un point de vigilance ou un levier de négociation, si les données en révèlent un.
- Ton clair, direct, du point de vue du fondateur. N'invente aucune donnée absente.`;

  // Cache par contenu : mêmes chiffres → même explication, sans rappeler GLM.
  const cacheHash = aiHash('explain-simulation-v1', [
    kind, scenarioLabel,
    ...figs.map(f => f.label + '=' + f.value),
    cols.join('|'), ...rows.map(r => r.join('|')),
    ...noteList,
  ]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return res.json({ explanation: cached, cached: true });

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Explique ces résultats au fondateur, sans recalculer ni inventer de chiffre.' }],
      maxTokens: 1200,
      thinking: false,
    });
    await recordClaudeUsage(req.user.id, response);
    const explanation = glmText(response);
    if (explanation) await aiCacheSet(cacheHash, explanation);
    res.json({ explanation });
  } catch (err) {
    console.error('Claude explain-simulation error:', err.message);
    res.status(502).json({ error: 'L\'assistant IA est momentanément indisponible.' });
  }
});

// ─── SaaS : consommation IA Claude de l'utilisateur (tokens + nb requêtes) ─────
app.get('/api/saas/usage', requireAuth, async (req, res) => {
  const u = await col('saas_claude_usage').findOne(
    { user_id: req.user.id },
    { projection: { _id: 0, user_id: 0 } }
  );
  const dailyUsed = await globalTokensToday();
  res.json({
    requests:      u?.requests      || 0,
    input_tokens:  u?.input_tokens  || 0,
    output_tokens: u?.output_tokens || 0,
    total_tokens:  u?.total_tokens  || 0,
    updated_at:    u?.updated_at     || null,
    // Plafond quotidien GLOBAL (tout le SaaS) et consommation du jour.
    daily_cap:     DAILY_TOKEN_CAP,
    daily_used:    dailyUsed,
    daily_day:     parisDay(),
  });
});

// ─── SaaS : dossiers JURIDIQUES de levée de fonds (par utilisateur, en base) ───
// Le SaaS se concentre sur le volet juridique d'une levée. Chaque dossier
// correspond à une phase juridique de l'opération et porte la checklist des
// documents juridiques attendus à cette étape (droit français, SAS).
// Sur la levée classique, les premières étapes se concentrent sur les documents
// côté investisseurs ; l'étape closing intègre les actes rédigés/signés à ce
// moment (PV, attestations, registres, formalités). Le parcours BSA-AIR, lui,
// intègre aussi les actes d'émission et de souscription car ils rythment
// concrètement l'opération au fil de l'eau.
// `FOLDERS_SEED_VERSION` est incrémentée à chaque évolution de cette liste pour
// re-synchroniser automatiquement les dossiers système des utilisateurs.
const FOLDERS_SEED_VERSION = 16;
const ddDoc = (label, mark = 'req') => ({ label, mark });
const ddLabels = items => items.map(item => item.label);
const ddMarks = items => items.map(item => item.mark || '');
const DD_PRELIMINARY_ITEMS = [
  ddDoc('Extrait Kbis récent'),
  ddDoc('Statuts à jour'),
  ddDoc('Table de capitalisation (cap table) à date'),
  ddDoc("Registre des mouvements de titres et comptes d'actionnaires"),
  ddDoc('Registre des bénéficiaires effectifs (RBE)'),
  ddDoc('Attestation de régularité fiscale et attestation de vigilance URSSAF récentes', 'opt'),
  ddDoc('État des inscriptions de privilèges, nantissements et sûretés publiées', 'opt'),
  ddDoc('Organigramme juridique, filiales et participations', 'opt'),
  ddDoc('Organisation opérationnelle, organigramme management et contacts clés', 'opt'),
  ddDoc('Note marché, concurrence, risques clés et hypothèses de croissance', 'opt'),
  ddDoc("Pactes d'associés, promesses, side letters et accords d'investissement existants", 'opt'),
  ddDoc('Historique synthétique des levées, instruments convertibles et valorisations précédentes', 'opt'),
  ddDoc('PV des décisions collectives et décisions du président significatives', 'opt'),
  ddDoc('Questionnaire de due diligence préliminaire (réponses)'),
  ddDoc('Support de présentation investisseurs'),
  ddDoc('Business plan, prévisionnel financier et plan d’utilisation des fonds'),
  ddDoc('Note de réconciliation des chiffres du deck avec la comptabilité et les KPIs'),
  ddDoc('Comptes annuels des trois derniers exercices ou situation comptable récente'),
  ddDoc('Liasses fiscales récentes et déclarations TVA significatives', 'opt'),
  ddDoc('Balance générale, compte de résultat et situation de trésorerie récents'),
  ddDoc('Relevés bancaires et rapprochements bancaires récents', 'opt'),
  ddDoc('Tableau de trésorerie, runway et dettes à court terme'),
  ddDoc('Balance âgée clients/fournisseurs, créances douteuses et dettes échues', 'opt'),
  ddDoc('Récapitulatif MRR/ARR, churn, cohortes et métriques d’usage', 'opt'),
  ddDoc('État des dettes, emprunts, avances, subventions, aides et sûretés'),
  ddDoc("Contrats de dette, prêts, comptes courants d'associés, covenants et garanties", 'opt'),
  ddDoc('Liste des principaux clients, chiffre d’affaires par client et concentration du revenu'),
  ddDoc('Backlog, commandes signées, POC/pilotes, lettres d’intention et principaux renouvellements', 'opt'),
  ddDoc('Références clients, droit d’usage des logos et restrictions de communication', 'opt'),
  ddDoc('Pipeline commercial et contrats en cours de négociation', 'opt'),
  ddDoc('Principaux contrats clients signés'),
  ddDoc('Principaux contrats fournisseurs, partenaires et prestataires'),
  ddDoc('Liste des dépendances fournisseurs, cloud, hébergement et sous-traitants critiques', 'opt'),
  ddDoc("Conditions générales de vente, d'utilisation et contrats types"),
  ddDoc('Modèles de NDA, bons de commande, SOW, contrats de licence et contrats de partenariat', 'opt'),
  ddDoc('Contrats de travail des fondateurs, dirigeants et salariés clés'),
  ddDoc('Liste des salariés clés, mandataires sociaux et consultants stratégiques'),
  ddDoc('Grille des rémunérations, bonus, avantages et plan de recrutement', 'opt'),
  ddDoc('Contrats freelances/consultants et justificatifs de non-requalification', 'opt'),
  ddDoc('Plan BSPCE / BSA / AGA / stock-options et management package existant', 'opt'),
  ddDoc('Vesting, leavers, promesses d’attribution et communications aux bénéficiaires', 'opt'),
  ddDoc('Cessions de propriété intellectuelle fondateurs, salariés et prestataires clés'),
  ddDoc('Titres de propriété intellectuelle, noms de domaine et licences importantes', 'opt'),
  ddDoc('Inventaire des logiciels, dépendances techniques et actifs numériques critiques', 'opt'),
  ddDoc('Inventaire open-source, licences logicielles, dépôts de code et droits d’accès', 'opt'),
  ddDoc('Roadmap produit, architecture technique, sécurité, sauvegardes et incidents majeurs', 'opt'),
  ddDoc('Documentation RGPD synthétique : registre, politique de confidentialité, cookies et DPA'),
  ddDoc('Liste des sous-traitants RGPD, transferts hors UE, AIPD/DPIA et violations de données', 'opt'),
  ddDoc('Autorisations, agréments, certifications et contraintes réglementaires applicables', 'opt'),
  ddDoc('Procédures KYC/AML, sanctions, anti-corruption et conformité sectorielle', 'opt'),
  ddDoc('État des contentieux, litiges, réclamations et mises en demeure'),
  ddDoc('Courriers d’avocats, enquêtes administratives et réclamations menacées', 'opt'),
  ddDoc('Polices d’assurance principales et sinistres déclarés', 'opt'),
  ddDoc('Cartographie des risques et plan de continuité d’activité', 'opt'),
  ddDoc('Baux, domiciliation, contrats immobiliers et locaux significatifs', 'opt'),
  ddDoc('Liste des banques, comptes, moyens de paiement et engagements bancaires', 'opt'),
  ddDoc('Transactions avec parties liées, conventions intragroupe et engagements hors bilan', 'opt'),
  ddDoc('Q&A tracker, droits d’accès data room et journal des demandes investisseurs', 'opt'),
  ddDoc('Data room indexée et liste des documents non disponibles'),
];
const DD_PRELIMINARY_DOCUMENTS = ddLabels(DD_PRELIMINARY_ITEMS);
const DD_PRELIMINARY_MARKS = ddMarks(DD_PRELIMINARY_ITEMS);

const DD_PUSHED_CATEGORIES = [
  {
    key: 'corporate',
    title: 'Corporate, capital et gouvernance',
    items: [
      ddDoc('Extrait Kbis récent'),
      ddDoc('Statuts à jour et versions historiques pertinentes'),
      ddDoc('Certificats d’immatriculation, récépissés de formalités, annonces légales et dépôts au greffe/guichet unique'),
      ddDoc('Registre des mouvements de titres'),
      ddDoc("Comptes d'actionnaires / registre des valeurs mobilières"),
      ddDoc('Table de capitalisation actuelle et historique des émissions'),
      ddDoc('Registre des bénéficiaires effectifs (RBE)'),
      ddDoc('Déclarations des bénéficiaires effectifs historiques, pièces justificatives et accès RBE'),
      ddDoc('Organigramme juridique, filiales, participations et liens intragroupe', 'opt'),
      ddDoc('PV des décisions collectives, assemblées, conseils et décisions du président'),
      ddDoc('Registre des décisions, feuilles de présence et rapports sociaux obligatoires'),
      ddDoc("Pactes d'associés, promesses de cession/acquisition, side letters et accords d'investissement existants"),
      ddDoc('Conventions réglementées, conventions intragroupe et délégations de pouvoirs', 'opt'),
      ddDoc('Liste des mandataires sociaux, pouvoirs bancaires et délégations de signature'),
      ddDoc('Lettres de mission, rapports et correspondances des commissaires aux comptes', 'opt'),
      ddDoc('Justificatifs de siège, domiciliation, changements de siège/dirigeants et formalités associées', 'opt'),
      ddDoc('État des inscriptions de privilèges, nantissements, sûretés et procédures collectives', 'opt'),
      ddDoc('Dossier KYC corporate : pièces dirigeants, UBO, sanctions et organigramme de contrôle', 'opt'),
      ddDoc('Historique des opérations sur capital, émissions de titres et restructurations'),
    ],
  },
  {
    key: 'titres',
    title: 'Actionnariat, instruments dilutifs et opération',
    items: [
      ddDoc('Plans BSPCE / BSA / AGA / stock-options / actions gratuites et documents d’attribution', 'opt'),
      ddDoc('Obligations convertibles, BSA-AIR, avances en compte courant et instruments convertibles existants', 'opt'),
      ddDoc('Bulletins de souscription, ordres de mouvement, attestations d’inscription en compte et preuves de libération'),
      ddDoc('Simulation de dilution fully diluted avant et après opération'),
      ddDoc('Droits de préemption, agrément, inaliénabilité, drag/tag et clauses de sortie existantes', 'opt'),
      ddDoc('Renonciations au DPS, purges de préemption, agréments et adhésions aux pactes', 'opt'),
      ddDoc('Promesses d’attribution ou engagements oraux/écrits envers salariés, fondateurs ou investisseurs', 'opt'),
      ddDoc('Vesting schedules, exercices, caducités, départs de bénéficiaires et annulations de titres', 'opt'),
      ddDoc('Side letters : information rights, pro rata, anti-dilution, liquidation preference et MFN', 'opt'),
      ddDoc('Valorisations, avis fiscaux et communications bénéficiaires liés aux management packages', 'opt'),
      ddDoc('Liste des actionnaires, coordonnées et informations KYC disponibles'),
      ddDoc('Dossier KYC/AML des actionnaires actuels et investisseurs entrants', 'opt'),
      ddDoc('Historique des valorisations, tours précédents et documents de closing antérieurs', 'opt'),
    ],
  },
  {
    key: 'finance',
    title: 'Finance, comptabilité et performance',
    items: [
      ddDoc('Comptes annuels, annexes et rapports de gestion des trois derniers exercices'),
      ddDoc('Liasses fiscales des trois derniers exercices'),
      ddDoc('Situation comptable récente, balance générale et grand livre'),
      ddDoc('Reporting mensuel, P&L, bilan, cash-flow et rapprochements bancaires'),
      ddDoc('Relevés bancaires 12 mois, rapprochements bancaires détaillés et liste des comptes'),
      ddDoc('Budget annuel, business plan, prévisionnel de trésorerie et hypothèses détaillées'),
      ddDoc('MRR/ARR, churn, cohortes, marge brute, CAC, LTV et KPIs opérationnels pertinents', 'opt'),
      ddDoc('Détail du chiffre d’affaires par mois, client, produit, pays et règles de reconnaissance du revenu'),
      ddDoc('Backlog, revenu différé, commandes fermes, renouvellements et engagements de revenus', 'opt'),
      ddDoc('Analyse de marge brute, coûts d’hébergement, coût support et unit economics', 'opt'),
      ddDoc('Balance âgée clients, créances douteuses et politique de recouvrement'),
      ddDoc('Balance âgée fournisseurs, dettes échues et engagements hors bilan'),
      ddDoc('Grand livre clients/fournisseurs, cut-off, provisions, écritures d’inventaire, FNP, CCA et PCA', 'opt'),
      ddDoc("Contrats de dette, comptes courants d'associés, covenants, garanties, nantissements, leasing et affacturage", 'opt'),
      ddDoc('Inventaire des immobilisations, actifs significatifs et contrats de leasing', 'opt'),
      ddDoc('Tableau des immobilisations, amortissements, R&D activée et investissements prévus', 'opt'),
      ddDoc('Transactions avec parties liées, management fees, notes de frais dirigeants et refacturations intragroupe', 'opt'),
      ddDoc('Réconciliation deck / CRM / facturation / comptabilité pour les métriques clés'),
      ddDoc('Rapports d’audit, revue financière ou vendor due diligence existants', 'opt'),
      ddDoc('Plan d’utilisation des fonds levés et besoins de financement à 18-24 mois'),
    ],
  },
  {
    key: 'fiscal',
    title: 'Fiscalité, aides publiques et subventions',
    items: [
      ddDoc('Déclarations d’impôt sur les sociétés et justificatifs des déficits reportables'),
      ddDoc('Déclarations TVA, taxes locales, retenues à la source et autres déclarations fiscales significatives'),
      ddDoc('Attestations de régularité fiscale et échéancier des impôts/taxes à payer'),
      ddDoc('DAS2, CFE/CVAE, taxes sur salaires, retenues à la source et déclarations assimilées', 'opt'),
      ddDoc('Analyse TVA : territorialité, autoliquidation, OSS, exports/imports et ventes internationales', 'opt'),
      ddDoc('Crédit impôt recherche / innovation : déclarations, dossiers techniques, contrats, factures et feuilles de temps', 'opt'),
      ddDoc('Statut JEI/JEIC, rescrits fiscaux et échanges avec l’administration', 'opt'),
      ddDoc('Subventions, aides publiques, avances remboursables, PGE et conditions associées', 'opt'),
      ddDoc('Conditions de conservation des aides, clauses de remboursement et risques de clawback', 'opt'),
      ddDoc('Contrôles fiscaux, notifications, redressements, réclamations et transactions', 'opt'),
      ddDoc('Prix de transfert, conventions intragroupe et documentation associée', 'opt'),
      ddDoc('Analyse des déficits reportables, changements d’activité et pertes fiscales utilisables', 'opt'),
      ddDoc('Résidence fiscale, établissements stables, retenues à la source et flux internationaux', 'opt'),
      ddDoc('Régime fiscal des management packages et instruments d’intéressement', 'opt'),
    ],
  },
  {
    key: 'social',
    title: 'Social, RH et management',
    items: [
      ddDoc('Liste des salariés, mandataires sociaux, freelances et consultants clés'),
      ddDoc('Employee census complet : poste, ancienneté, rémunération, bonus, variable, localisation et statut'),
      ddDoc('Contrats de travail des fondateurs, dirigeants et salariés clés'),
      ddDoc('Modèles d’offres d’embauche, onboarding, offboarding et documents remis aux salariés', 'opt'),
      ddDoc('Avenants, clauses de non-concurrence, confidentialité, invention et propriété intellectuelle'),
      ddDoc('Bulletins de paie récents, charges sociales, DSN et attestations de régularité', 'opt'),
      ddDoc('Registre unique du personnel, DPAE, autorisations de travail et dossiers immigration', 'opt'),
      ddDoc('Rémunérations fixes/variables, bonus, commissions et avantages en nature'),
      ddDoc('Politique congés, RTT, temps de travail, forfait jours, heures supplémentaires et télétravail', 'opt'),
      ddDoc('Plan BSPCE / BSA / AGA / stock-options et communications aux bénéficiaires', 'opt'),
      ddDoc('Règlement intérieur, chartes, politiques télétravail et accords collectifs', 'opt'),
      ddDoc('CSE, élections, procès-verbaux, informations-consultations et affichages obligatoires', 'opt'),
      ddDoc('Procédures disciplinaires, ruptures, prud’hommes et litiges sociaux', 'opt'),
      ddDoc('Transactions, indemnités de départ, ruptures conventionnelles et severance plans', 'opt'),
      ddDoc('Recours à freelances, prestataires, portage salarial et risques de requalification', 'opt'),
      ddDoc('Contrats freelances, attestations de vigilance, preuves d’indépendance et livrables associés', 'opt'),
      ddDoc('Documents CSE, santé-sécurité et obligations sociales applicables', 'opt'),
      ddDoc('DUERP, médecine du travail, accidents du travail, formations sécurité et incidents RH', 'opt'),
    ],
  },
  {
    key: 'commercial',
    title: 'Clients, ventes et revenus',
    items: [
      ddDoc('Liste des principaux clients, revenus par client et concentration du chiffre d’affaires'),
      ddDoc('Master customer list : ARR/MRR, segment, date de début/fin, churn, expansion et responsable compte'),
      ddDoc('Contrats clients significatifs, bons de commande, SOW et renouvellements'),
      ddDoc('Contrats clients résiliés, arrivant à échéance ou en renégociation', 'opt'),
      ddDoc('Pipeline commercial, commandes engagées et prévisions de revenus'),
      ddDoc('Backlog commercial, POC, pilotes, lettres d’intention, appels d’offres et contrats-cadres', 'opt'),
      ddDoc("Conditions générales de vente, d’utilisation, contrats types et politique tarifaire"),
      ddDoc('Politique de remises, concessions tarifaires, avoirs, crédits clients et exceptions aux CGV', 'opt'),
      ddDoc('Clauses d’exclusivité, most-favored nation, pénalités, SLA et engagements de niveau de service', 'opt'),
      ddDoc('Réclamations clients, avoirs, remboursements, litiges commerciaux et churn significatif', 'opt'),
      ddDoc('Support tickets, incidents SLA, NPS, références clients et preuves de satisfaction', 'opt'),
      ddDoc('Partenariats de distribution, apporteurs d’affaires, revendeurs et intégrateurs', 'opt'),
      ddDoc('Références publiques, droits d’usage des logos clients et restrictions contractuelles', 'opt'),
      ddDoc('Études de marché, TAM/SAM/SOM, benchmark concurrence et hypothèses de pricing', 'opt'),
    ],
  },
  {
    key: 'operations',
    title: 'Fournisseurs, partenariats et opérations',
    items: [
      ddDoc('Contrats fournisseurs, prestataires, sous-traitants et partenaires stratégiques'),
      ddDoc('Contrats cloud, hébergement, infogérance, support et services critiques'),
      ddDoc('Liste des fournisseurs critiques : coûts, SLA, préavis, dépendances, accès et propriétaires internes'),
      ddDoc('Engagements minimums, exclusivités, pénalités, renouvellements automatiques et résiliations'),
      ddDoc('Dépendances opérationnelles clés et plan de continuité d’activité', 'opt'),
      ddDoc('Plan de reprise d’activité, tests de sauvegarde, RTO/RPO et procédures de crise', 'opt'),
      ddDoc('Contrats de licence, API, intégrations et marketplaces', 'opt'),
      ddDoc('Contrats logistiques, paiement, support, call center et prestations externalisées', 'opt'),
      ddDoc('Procédures achats, conformité fournisseurs et anti-corruption', 'opt'),
      ddDoc('Vendor due diligence, contrôles sous-traitants, attestations de vigilance et revues sécurité', 'opt'),
      ddDoc('Assurances liées aux opérations, responsabilité civile professionnelle et cyber', 'opt'),
    ],
  },
  {
    key: 'ip-tech',
    title: 'Propriété intellectuelle, produit et technologie',
    items: [
      ddDoc('Titres de propriété intellectuelle : marques, brevets, dessins, modèles et noms de domaine'),
      ddDoc('Certificats de dépôt, renouvellements, oppositions, recherches d’antériorité et calendrier des annuités', 'opt'),
      ddDoc('Cessions de propriété intellectuelle fondateurs, salariés, freelances et prestataires'),
      ddDoc('Chaîne de propriété intellectuelle par contributeur, inventeur, prestataire et société antérieure'),
      ddDoc('Contrats de licence, copropriété, open innovation, recherche et développement', 'opt'),
      ddDoc('Inventaire logiciels, librairies open-source, licences et obligations de conformité'),
      ddDoc('SBOM / scan open-source, notices, politique licences et plan de remédiation', 'opt'),
      ddDoc('Architecture technique, documentation produit, roadmap et dette technique significative', 'opt'),
      ddDoc('Accès au code source, procédures de développement, CI/CD et droits administrateurs', 'opt'),
      ddDoc('Dépôts de code, règles de revue, protections de branches, historique releases et incidents de production', 'opt'),
      ddDoc('Secrets d’affaires, know-how, documentation interne et journaux d’accès aux actifs sensibles', 'opt'),
      ddDoc('Escrow, sauvegardes, réversibilité et dépendances techniques critiques', 'opt'),
      ddDoc('Réclamations, oppositions, contrefaçon, atteintes à la PI ou licences non conformes', 'opt'),
      ddDoc('Droits sur bases de données, datasets, contenus, modèles IA et données d’entraînement', 'opt'),
      ddDoc('Contrats API/SDK, modèles IA tiers, datasets externes et restrictions d’usage produit', 'opt'),
      ddDoc('Développements spécifiques clients et titularité des livrables / améliorations', 'opt'),
    ],
  },
  {
    key: 'data-security',
    title: 'RGPD, données et cybersécurité',
    items: [
      ddDoc('Registre des activités de traitement'),
      ddDoc('Cartographie des données, flux, applications, responsables internes et propriétaires de traitement'),
      ddDoc('Désignation DPO/référent privacy, gouvernance RGPD et registre des décisions privacy', 'opt'),
      ddDoc('Politiques de confidentialité, cookies, consentement et mentions d’information'),
      ddDoc('Journal de consentement cookies, CMP, paramétrage traceurs et preuves de recueil', 'opt'),
      ddDoc('Contrats de sous-traitance RGPD (DPA), liste des sous-traitants et transferts hors UE'),
      ddDoc('Clauses contractuelles types, analyses d’impact de transfert (TIA/AITD) et mesures supplémentaires', 'opt'),
      ddDoc('Analyses d’impact (DPIA), bases légales et durées de conservation', 'opt'),
      ddDoc('Politique de conservation, suppression, anonymisation et purge des données'),
      ddDoc('Registre des violations de données, incidents de sécurité et notifications CNIL', 'opt'),
      ddDoc('Politiques de sécurité, gestion des accès, MFA, chiffrement et sauvegardes'),
      ddDoc('IAM, revues d’accès, gestion mots de passe/secrets, MDM/EDR et journalisation sécurité', 'opt'),
      ddDoc('Tests d’intrusion, audits sécurité, certifications ISO/SOC 2 et plans de remédiation', 'opt'),
      ddDoc('Vulnerability management, bug bounty, scans, patch management et exceptions de sécurité', 'opt'),
      ddDoc('Procédures d’exercice des droits, suppression, portabilité et gestion des demandes clients'),
      ddDoc('Cartographie des données sensibles, données de santé, mineurs ou données réglementées', 'opt'),
      ddDoc('Plan de réponse incident, continuité cyber, restaurations testées et sinistres cyber', 'opt'),
      ddDoc('Gouvernance IA : finalités, données d’entraînement, évaluations de risques et conformité AI Act', 'opt'),
    ],
  },
  {
    key: 'regulatory',
    title: 'Réglementaire et conformité sectorielle',
    items: [
      ddDoc('Autorisations, agréments, licences, certifications et déclarations sectorielles applicables', 'opt'),
      ddDoc('Conformité produit, marquage, sécurité, normes techniques et documentation réglementaire', 'opt'),
      ddDoc('Procédures KYC/AML, sanctions, export control et lutte anti-corruption', 'opt'),
      ddDoc('Politiques cadeaux, conflits d’intérêts, lanceur d’alerte, formations conformité et registres associés', 'opt'),
      ddDoc('Contrats publics, appels d’offres, aides réglementées et obligations associées', 'opt'),
      ddDoc('Droit de la consommation, publicité, pratiques commerciales et conditions d’abonnement', 'opt'),
      ddDoc('Droit de la concurrence, exclusivités, distribution sélective et clauses sensibles', 'opt'),
      ddDoc('Dossiers réglementaires sectoriels : fintech, santé, éducation, assurance ou mobilité le cas échéant', 'opt'),
      ddDoc('Échanges avec autorités administratives ou régulateurs et contrôles en cours', 'opt'),
      ddDoc('Registre des incidents réglementaires, non-conformités, plans correctifs et remédiations', 'opt'),
    ],
  },
  {
    key: 'litigation',
    title: 'Contentieux, assurances et risques',
    items: [
      ddDoc('État des contentieux, litiges, réclamations, mises en demeure et enquêtes'),
      ddDoc('Dossiers de procédure, correspondances d’avocats, transactions et provisions'),
      ddDoc('Litiges actionnaires, fondateurs, anciens salariés, clients ou fournisseurs', 'opt'),
      ddDoc('Réclamations menacées, lettres de mise en cause, settlements et engagements de non-recours', 'opt'),
      ddDoc('Avis juridiques, legal opinions, counsel letters et analyses de risques significatives', 'opt'),
      ddDoc('Contrôles administratifs, CNIL, URSSAF, fiscaux, concurrence ou sectoriels en cours', 'opt'),
      ddDoc('Polices d’assurance, attestations, garanties, exclusions et sinistres déclarés'),
      ddDoc('Déclarations de sinistre, refus de garantie, franchises et réserves assureur', 'opt'),
      ddDoc('Cartographie des risques, plans de mitigation et sujets bloquants identifiés'),
      ddDoc('Garanties données, cautions, lettres de confort et engagements d’indemnisation', 'opt'),
      ddDoc('Litigation hold, conservation des preuves et documents sous privilège/confidentialité', 'opt'),
    ],
  },
  {
    key: 'assets-esg',
    title: 'Immobilier, actifs matériels et ESG',
    items: [
      ddDoc('Baux, domiciliation, conventions d’occupation et contrats immobiliers', 'opt'),
      ddDoc('Dépôts de garantie, loyers, travaux, sous-location et litiges immobiliers', 'opt'),
      ddDoc('Inventaire des équipements, matériels, véhicules et actifs significatifs', 'opt'),
      ddDoc('Titres de propriété, contrats de maintenance, garanties, inventaire physique et assurances des actifs', 'opt'),
      ddDoc('Obligations environnementales, déchets, énergie, empreinte carbone et autorisations', 'opt'),
      ddDoc('Conformité locaux, accessibilité, sécurité incendie, baux verts et obligations propriétaire/locataire', 'opt'),
      ddDoc('Politiques ESG, diversité, éthique, achats responsables et reporting extra-financier', 'opt'),
      ddDoc('Indicateurs diversité, égalité professionnelle, empreinte carbone et chaîne d’approvisionnement responsable', 'opt'),
      ddDoc('Santé-sécurité, incidents, conformité locaux et obligations employeur', 'opt'),
    ],
  },
  {
    key: 'audit',
    title: 'Data room, Q&A et rapports d’audit',
    items: [
      ddDoc('Questionnaire de due diligence complet (réponses et pièces jointes)'),
      ddDoc('Index de data room, droits d’accès et historique des documents manquants'),
      ddDoc('Request list investisseurs, NDA d’accès, permissions, logs de consultation et exports de data room'),
      ddDoc('Rapport d’audit juridique'),
      ddDoc('Rapport d’audit financier / quality of earnings', 'opt'),
      ddDoc('Rapports d’audit fiscal, social, tech, cyber, commercial ou RH', 'opt'),
      ddDoc('Q&A tracker, réponses des fondateurs et synthèse des points ouverts'),
      ddDoc('Disclosure letter, schedules d’exceptions, documents retenus/expurgés et plan de remédiation'),
      ddDoc('Management presentations, comptes rendus d’expert sessions et call notes', 'opt'),
    ],
  },
];
const DD_COMPLETE_DOCUMENTS = DD_PUSHED_CATEGORIES.flatMap(category => ddLabels(category.items));
const DD_COMPLETE_MARKS = DD_PUSHED_CATEGORIES.flatMap(category => ddMarks(category.items));
const CLOSING_CATEGORIES = [
  {
    key: 'souscription-fonds',
    title: 'Souscription et versement des fonds',
    items: [
      ddDoc('Bulletins de souscription des investisseurs'),
      ddDoc('Contrats de souscription / investment agreements individuels', 'opt'),
      ddDoc('Ordres de virement et funds flow memo'),
      ddDoc('Attestations de versement des fonds par les investisseurs'),
      ddDoc('Certificat du dépositaire des fonds'),
    ],
  },
  {
    key: 'decisions-sociales',
    title: 'Décisions sociales et autorisations',
    items: [
      ddDoc("Rapport du président sur l'augmentation de capital et la suppression du DPS"),
      ddDoc('Rapport du commissaire aux comptes / commissaire aux avantages particuliers le cas échéant', 'opt'),
      ddDoc("PV de l'AGE / décisions collectives autorisant l'augmentation de capital"),
      ddDoc('Décisions du président constatant les souscriptions et le versement des fonds'),
      ddDoc("PV de constatation de la réalisation définitive de l'augmentation de capital"),
      ddDoc('Pouvoirs pour formalités et délégations de signature'),
    ],
  },
  {
    key: 'statuts-pacte',
    title: 'Statuts, pacte et gouvernance',
    items: [
      ddDoc('Statuts modifiés adoptés au closing'),
      ddDoc("Pacte d'associés signé / avenant au pacte"),
      ddDoc("Actes d'adhésion au pacte des nouveaux investisseurs"),
      ddDoc("Lettres d'investissement / side letters signées", 'opt'),
      ddDoc('Nomination des membres du board / comité stratégique / observateurs', 'opt'),
      ddDoc('Termes définitifs des actions de préférence ou valeurs mobilières émises'),
    ],
  },
  {
    key: 'registres-capital',
    title: 'Registres et capitalisation',
    items: [
      ddDoc('Cap table post-money mise à jour'),
      ddDoc('Registre des mouvements de titres mis à jour'),
      ddDoc("Comptes individuels d'actionnaires / fiches de comptes titres"),
      ddDoc('Registre des décisions mis à jour'),
      ddDoc('Tableau fully diluted post-closing (BSPCE, BSA, AIR, OC inclus)'),
    ],
  },
  {
    key: 'formalites',
    title: 'Formalités et dossier final',
    items: [
      ddDoc('Dossier de formalités au greffe (M2, statuts, PV, attestation de dépôt)'),
      ddDoc('Annonce légale de modification du capital'),
      ddDoc('Déclaration des bénéficiaires effectifs mise à jour', 'opt'),
      ddDoc('Notification aux investisseurs de la réalisation du closing'),
      ddDoc('Closing bible / dossier final signé archivé'),
    ],
  },
];
const CLOSING_DOCUMENTS = CLOSING_CATEGORIES.flatMap(category => ddLabels(category.items));
const CLOSING_MARKS = CLOSING_CATEGORIES.flatMap(category => ddMarks(category.items));
const FUNDRAISING_PHASES = [
  {
    key: 'mise-en-ordre',
    name: '0 · Ma levée',
    checklist: [
      'Support de présentation (deck) investisseurs',
      'Statuts à jour',
      'Table de capitalisation (cap table)',
      'Registre des mouvements de titres',
      'Registre des bénéficiaires effectifs (RBE)',
      'Cessions de propriété intellectuelle & dépôts (marques, brevets)',
      'Contrats de travail, BSPCE / BSA / management package',
    ],
  },
  {
    key: 'confidentialite',
    name: '1 · Investisseurs',
    checklist: [
      'Support de présentation (deck) investisseurs',
      'Accord de confidentialité (NDA)',
      'Engagement de confidentialité d’accès à la data room',
    ],
  },
  {
    key: 'due-diligence-preliminaire',
    name: '2 · Due diligence préliminaire',
    // Cette liste vient exclusivement de la request list envoyée par
    // l'investisseur : aucun document n'est présupposé par la plateforme.
    checklist: [],
  },
  {
    key: 'term-sheet',
    name: '3 · Lettre d’intention',
    checklist: [
      'Term sheet (lettre d’intention)',
      'Clause d’exclusivité / de négociation',
    ],
  },
  {
    key: 'due-diligence',
    name: '4 · Due diligence poussée',
    // Cette liste vient exclusivement de la request list envoyée par
    // l'investisseur : aucun document n'est présupposé par la plateforme.
    checklist: [],
  },
  {
    key: 'documentation',
    name: '5 · Négociation',
    checklist: [
      'Pacte d’associés (shareholders agreement)',
      'Statuts modifiés (actions de préférence)',
      'Déclarations & garanties — R&W (intégrées au pacte)',
      'Termes des valeurs mobilières émises (ADP, BSA, OC)',
      'Convention de garantie d’actif et de passif (GAP)',
      "Lettre d'investissement / side letter",
      'Convention entre investisseurs',
    ],
  },
  {
    key: 'closing',
    name: '6 · Closing',
    checklist: CLOSING_DOCUMENTS,
  },
  {
    key: 'post-closing',
    name: '7 · Post-closing',
    checklist: [
      'Information / reporting des investisseurs (info rights)',
      'Suivi des engagements du pacte (covenants)',
      'Déclaration des bénéficiaires effectifs — mise à jour',
    ],
  },
  {
    key: 'gouvernance',
    name: '8 · Gouvernance',
    checklist: [
      'PV de conseil / comité de surveillance',
      'Pacte d’associés (shareholders agreement)',
      'Statuts à jour',
    ],
  },
];

// Parcours BSA-AIR (Bon de Souscription d'Actions — Accord d'Investissement Rapide).
// Même structure que FUNDRAISING_PHASES.
// Ordre réel d'un BSA-AIR « au fil de l'eau » en France : le fondateur fixe les
// termes puis ÉMET les BSA-AIR (décision collective, au profit d'une catégorie de
// personnes) AVANT de rechercher les investisseurs, qui souscrivent ensuite à un
// instrument déjà émis. L'émission précède donc la recherche d'investisseurs.
const BSA_AIR_PHASES = [
  {
    key: 'air-preparation',
    name: '1 · Préparation & mise en ordre juridique (pré-levée)',
    checklist: [
      'Statuts à jour',
      'Table de capitalisation (cap table) actuelle',
      'Registre des mouvements de titres',
      'Registre des bénéficiaires effectifs (RBE)',
      'Cessions de propriété intellectuelle & dépôts (marques, brevets)',
      'BSPCE / BSA / management package existants',
    ],
  },
  {
    key: 'air-termes',
    name: '2 · Structuration & fixation des termes du BSA-AIR',
    checklist: [
      'Term sheet BSA-AIR (montant, décote, plafond et/ou plancher de valorisation)',
      'Tableau de simulation de la conversion et de la dilution',
    ],
  },
  {
    key: 'air-emission',
    name: '3 · Émission des BSA-AIR (décision collective)',
    checklist: [
      "Rapport du président et du commissaire aux comptes (le cas échéant) sur l'émission de BSA avec suppression du DPS",
      "PV de la décision collective (AGE) autorisant l'émission des BSA-AIR",
      "Contrat d'émission de BSA-AIR (termes et conditions des bons)",
    ],
  },
  {
    key: 'air-approche',
    name: '4 · Confidentialité & recherche des investisseurs',
    checklist: [
      'Accord de confidentialité (NDA)',
      'Support de présentation (deck) investisseurs',
    ],
  },
  {
    key: 'air-souscription',
    name: '5 · Souscription & versement des fonds (au fil de l’eau)',
    checklist: [
      'Bulletin de souscription des BSA-AIR',
      "Lettre d'investissement / side letter",
      'Convention entre investisseurs',
      'Attestation de versement des fonds par le(s) souscripteur(s)',
      'Constatation de la souscription des BSA-AIR par le président',
      'Inscription des BSA-AIR au registre des valeurs mobilières / mouvements de titres',
    ],
  },
  {
    key: 'air-suivi',
    name: '6 · Suivi jusqu’à la conversion',
    checklist: [
      'Information / reporting des investisseurs (info rights)',
      'Suivi des engagements BSA-AIR en cours (échéances, événements déclencheurs)',
    ],
  },
  {
    key: 'air-conversion',
    name: '7 · Conversion au tour qualifié (ou échéance / liquidité)',
    checklist: [
      'Calcul du prix de conversion (application de la décote et/ou du plafond)',
      'Bulletins de souscription des actions issues de la conversion',
      'Statuts modifiés (actions de préférence, le cas échéant)',
    ],
  },
];

// Marque chaque document attendu : 'req' = indispensable, 'opt' = le cas échéant,
// '' = standard. Tableau parallèle à la checklist de chaque phase (repéré par sa clé),
// pour afficher les badges côté front — sur la levée classique ET le BSA-AIR.
const PHASE_MARKS = {
  'mise-en-ordre':     ['req', 'req', 'req', 'req', 'req', 'req', 'opt'],
  'confidentialite':   ['', 'req', 'opt'],
  'due-diligence-preliminaire': [],
  'term-sheet':        ['req', 'opt'],
  'due-diligence':     [],
  'documentation':     ['req', 'req', 'opt', 'opt', 'opt', 'opt', 'opt'],
  'closing':           CLOSING_MARKS,
  'post-closing':      ['req', '', 'req'],
  'gouvernance':       ['req', '', ''],
  'air-preparation':   ['req', 'req', '', '', '', 'opt'],
  'air-termes':        ['req', ''],
  'air-emission':      ['req', 'req', 'req'],
  'air-approche':      ['req', ''],
  'air-souscription':  ['req', 'opt', 'opt', 'req', 'req', 'req'],
  'air-suivi':         ['req', ''],
  'air-conversion':    ['req', 'req', 'opt'],
};

// Liste combinée des phases à provisionner pour un compte, avec leur « track ».
function allSeedPhases() {
  return [
    ...FUNDRAISING_PHASES.map(p => ({ key: p.key, name: p.name, checklist: p.checklist, marks: PHASE_MARKS[p.key] || [], track: 'classic' })),
    ...BSA_AIR_PHASES.map(p => ({ key: p.key, name: p.name, checklist: p.checklist, marks: PHASE_MARKS[p.key] || [], track: 'bsa-air' })),
  ];
}

function publicFolder(f) {
  const { _id, user_id, ...rest } = f;
  return rest;
}

const FUNDRAISING_PROFILE_DEFAULT = {
  company_name: '',
  company_country: 'france',
  raise_type: 'classic',
  target_amount: '',
  target_valuation: '',
  max_dilution: '',
  target_date: '',
  raise_reason: '',
  investor_profile: '',
  other_financing: '',
  governance_conditions: '',
  founders: [],
};
const FUNDRAISING_COUNTRIES = new Set(['france', 'us', 'uk', 'germany', 'other']);
const FUNDRAISING_TYPES = new Set(['classic', 'bsa-air', 'unknown']);
const FOUNDER_STATUSES = new Set(['cofounder', 'late-cofounder', 'investor']);
function shortText(v, max = 240) {
  return String(v || '').trim().slice(0, max);
}
function publicFundraisingProfile(p) {
  if (!p) return { ...FUNDRAISING_PROFILE_DEFAULT };
  const { _id, user_id, ...rest } = p;
  return { ...FUNDRAISING_PROFILE_DEFAULT, ...rest };
}
function sanitizeFundraisingProfile(body) {
  const company_country = shortText(body?.company_country, 32);
  const raise_type = shortText(body?.raise_type, 32);
  if (!FUNDRAISING_COUNTRIES.has(company_country)) throw new Error('Pays de résidence requis');
  if (!FUNDRAISING_TYPES.has(raise_type)) throw new Error('Type de levée requis');

  const target_amount_raw = shortText(body?.target_amount, 32);
  if (target_amount_raw && (!/^\d+([.,]\d{1,2})?$/.test(target_amount_raw) || Number(target_amount_raw.replace(',', '.')) < 0)) {
    throw new Error('Montant visé invalide');
  }
  // Cible économique associée au montant : une valorisation pre-money visée
  // et/ou une dilution maximale acceptée (le fondateur exprime l'une, l'autre,
  // ou les deux — montant + valo impliquent la dilution, et inversement).
  const target_valuation_raw = shortText(body?.target_valuation, 32);
  if (target_valuation_raw && (!/^\d+([.,]\d{1,2})?$/.test(target_valuation_raw) || Number(target_valuation_raw.replace(',', '.')) < 0)) {
    throw new Error('Valorisation visée invalide');
  }
  const max_dilution_raw = shortText(body?.max_dilution, 16);
  if (max_dilution_raw) {
    const d = Number(max_dilution_raw.replace(',', '.'));
    if (!/^\d+([.,]\d{1,2})?$/.test(max_dilution_raw) || d < 0 || d > 100) {
      throw new Error('Dilution maximale invalide (0 à 100 %)');
    }
  }
  const target_date = shortText(body?.target_date, 24);
  if (target_date && !/^\d{4}-\d{2}-\d{2}$/.test(target_date)) throw new Error('Date cible invalide');

  const founders = Array.isArray(body?.founders) ? body.founders.slice(0, 20).map(f => ({
    name: shortText(f && f.name, 120),
    status: FOUNDER_STATUSES.has(f && f.status) ? f.status : 'cofounder',
    job: shortText(f && f.job, 160),
  })).filter(f => f.name || f.job) : [];

  return {
    company_name: shortText(body?.company_name, 160),
    company_country,
    raise_type,
    target_amount: target_amount_raw,
    target_valuation: target_valuation_raw,
    max_dilution: max_dilution_raw,
    target_date,
    raise_reason: shortText(body?.raise_reason, 1200),
    investor_profile: shortText(body?.investor_profile, 1200),
    other_financing: shortText(body?.other_financing, 1200),
    governance_conditions: shortText(body?.governance_conditions, 1200),
    founders,
  };
}

app.get('/api/saas/fundraising-profile', requireAuth, async (req, res) => {
  const profile = await col('saas_fundraising_profiles').findOne({ user_id: req.user.id });
  res.json({ profile: publicFundraisingProfile(profile) });
});

app.put('/api/saas/fundraising-profile', requireAuth, async (req, res) => {
  let profile;
  try { profile = sanitizeFundraisingProfile(req.body || {}); }
  catch (e) { return res.status(400).json({ error: e.message || 'Profil de levée invalide' }); }

  const now = new Date().toISOString();
  await col('saas_fundraising_profiles').updateOne(
    { user_id: req.user.id },
    { $set: { ...profile, updated_at: now }, $setOnInsert: { user_id: req.user.id, created_at: now } },
    { upsert: true },
  );
  const saved = await col('saas_fundraising_profiles').findOne({ user_id: req.user.id });
  res.json({ success: true, profile: publicFundraisingProfile(saved) });
});

// Profil professionnel demandé aux avocats avant l'accès à leur espace.
function publicLawyerProfile(profile) {
  if (!profile) return null;
  const { _id, user_id, ...rest } = profile;
  return rest;
}

function sanitizeLawyerProfile(body) {
  const first_name = shortText(body?.first_name, 100);
  const last_name = shortText(body?.last_name, 100);
  const oath_date = shortText(body?.oath_date, 10);
  const city = shortText(body?.city, 160);
  const specialty = shortText(body?.specialty, 240);
  if (!first_name || !last_name || !oath_date || !city || !specialty) {
    throw new Error('Tous les champs sont requis');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oath_date) || Number.isNaN(Date.parse(oath_date))) {
    throw new Error('Date de serment invalide');
  }
  if (oath_date > new Date().toISOString().slice(0, 10)) {
    throw new Error('La date de serment ne peut pas être dans le futur');
  }
  return { first_name, last_name, oath_date, city, specialty };
}

app.get('/api/saas/lawyer-profile', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { account_types: 1 } });
  if (!user?.account_types?.includes('avocat')) {
    return res.status(403).json({ error: 'Accès réservé aux comptes avocat' });
  }
  const profile = await col('saas_lawyer_profiles').findOne({ user_id: req.user.id });
  res.json({ profile: publicLawyerProfile(profile) });
});

app.put('/api/saas/lawyer-profile', requireAuth, async (req, res) => {
  const user = await col('users').findOne({ id: req.user.id }, { projection: { account_types: 1 } });
  if (!user?.account_types?.includes('avocat')) {
    return res.status(403).json({ error: 'Accès réservé aux comptes avocat' });
  }
  let profile;
  try { profile = sanitizeLawyerProfile(req.body || {}); }
  catch (e) { return res.status(400).json({ error: e.message || 'Profil avocat invalide' }); }

  const now = new Date().toISOString();
  await col('saas_lawyer_profiles').updateOne(
    { user_id: req.user.id },
    { $set: { ...profile, updated_at: now }, $setOnInsert: { user_id: req.user.id, created_at: now } },
    { upsert: true },
  );
  await updateUserById(req.user.id, {
    full_name: `${profile.first_name} ${profile.last_name}`,
    lawyer_profile_completed: true,
  });
  const saved = await col('saas_lawyer_profiles').findOne({ user_id: req.user.id });
  res.json({ success: true, profile: publicLawyerProfile(saved) });
});

// Synchronise les dossiers juridiques « système » de l'utilisateur avec la liste
// ci-dessus : crée/met à jour ceux attendus, retire les anciens devenus obsolètes
// (leurs fichiers redeviennent « non classés »). Les dossiers créés par
// l'utilisateur (non système) ne sont jamais touchés. Idempotent et sans écriture
// inutile une fois la dernière version appliquée.
async function ensureUserFolders(userId) {
  const PHASES = allSeedPhases();
  const testFolders = await col('saas_folders')
    .find({ user_id: userId, system: { $ne: true }, name: /^\s*test(?:\s+1)?\s*$/i }, { projection: { id: 1 } })
    .toArray();
  for (const f of testFolders) {
    await col('saas_folders').deleteOne({ id: f.id, user_id: userId, system: { $ne: true } });
    await col('saas_documents').updateMany({ user_id: userId, folder_id: f.id }, { $unset: { folder_id: '' } });
  }

  const sys = await col('saas_folders')
    .find({ user_id: userId, system: true }, {
      projection: {
        id: 1, key: 1, seed_version: 1,
        checklist: 1, marks: 1, items_state: 1,
        investor_checklist_document_id: 1, checklist_origin: 1,
        investor_checklists: 1,
      },
    })
    .toArray();

  // Les anciennes request lists n'avaient qu'un document source et une
  // checklist fusionnée. On les convertit au premier chargement vers le nouveau
  // tableau, pour qu'un second import s'ajoute à la première checklist au lieu
  // de la remplacer.
  for (const folder of sys) {
    const checklists = investorChecklistsForFolder(folder);
    if ((!Array.isArray(folder.investor_checklists) || !folder.investor_checklists.length) && checklists.length) {
      await col('saas_folders').updateOne(
        { id: folder.id, user_id: userId },
        { $set: { investor_checklists: checklists } },
      );
      folder.investor_checklists = checklists;
    }
  }

  const upToDate = sys.length === PHASES.length
    && PHASES.every(p => sys.some(f => f.key === p.key && f.seed_version === FOLDERS_SEED_VERSION));
  if (upToDate) return;

  const wantedKeys = new Set(PHASES.map(p => p.key));
  const byKey      = {};
  sys.forEach(f => { if (f.key) byKey[f.key] = f; });
  const now = new Date().toISOString();

  // Supprime les dossiers système obsolètes (anciens génériques sans clé inclus).
  const obsolete = sys.filter(f => !f.key || !wantedKeys.has(f.key));
  for (const f of obsolete) {
    await col('saas_folders').deleteOne({ id: f.id, user_id: userId });
    await col('saas_documents').updateMany({ user_id: userId, folder_id: f.id }, { $unset: { folder_id: '' } });
  }

  // Crée ou met à jour les dossiers juridiques attendus (classique + BSA-AIR), dans l'ordre.
  for (let i = 0; i < PHASES.length; i++) {
    const p   = PHASES[i];
    const cur = byKey[p.key];
    // Une checklist importée est propre à l'investisseur et ne doit jamais être
    // écrasée par une évolution des dossiers système.
    const keepsInvestorChecklist = !!(
      cur
      && cur.checklist_origin === 'investor'
      && (cur.investor_checklist_document_id != null
        || (Array.isArray(cur.investor_checklists) && cur.investor_checklists.length))
      && Array.isArray(cur.checklist)
    );
    const set = {
      name: p.name, order: i,
      checklist: keepsInvestorChecklist ? cur.checklist : p.checklist,
      marks: keepsInvestorChecklist ? (Array.isArray(cur.marks) ? cur.marks : []) : p.marks,
      track: p.track, system: true, seed_version: FOLDERS_SEED_VERSION,
    };
    if (cur) {
      // Lors de la migration des anciennes roadlists DD, les anciennes liaisons
      // deviennent des fichiers libres : elles ne doivent plus faire réapparaître
      // des documents qui ne sont pas sur la checklist de l'investisseur.
      const clearsLegacyDdState = !keepsInvestorChecklist
        && INVESTOR_CHECKLIST_FOLDER_KEYS.has(p.key)
        && cur.seed_version !== FOLDERS_SEED_VERSION;
      const nextSet = clearsLegacyDdState ? { ...set, items_state: {} } : set;
      await col('saas_folders').updateOne({ id: cur.id, user_id: userId }, { $set: nextSet, $unset: { required: '' } });
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

// ─── Tâches (checklist libre du fondateur, indépendante des dossiers) ────────
const TASK_PRIORITIES = ['basse', 'moyenne', 'haute'];

function publicTask(t) {
  const { _id, user_id, ...rest } = t;
  return rest;
}

app.get('/api/saas/tasks', requireAuth, async (req, res) => {
  const tasks = await col('saas_tasks')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } })
    .sort({ done: 1, order: 1, id: 1 })
    .toArray();
  res.json({ tasks });
});

app.post('/api/saas/tasks', requireAuth, async (req, res) => {
  const title = (req.body?.title || '').trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: 'Titre de la tâche requis' });
  const notes    = (req.body?.notes || '').toString().trim().slice(0, 2000);
  const priority = TASK_PRIORITIES.includes(req.body?.priority) ? req.body.priority : 'moyenne';
  const dueRaw   = req.body?.due_date;
  const dueDate  = dueRaw && !isNaN(Date.parse(dueRaw)) ? new Date(dueRaw).toISOString().slice(0, 10) : null;

  const id   = await nextId('saas_tasks');
  const last = await col('saas_tasks').findOne({ user_id: req.user.id }, { sort: { order: -1 }, projection: { order: 1 } });
  const task = {
    id, user_id: req.user.id, title, notes, priority, due_date: dueDate,
    done: false, order: (last?.order ?? -1) + 1, created_at: new Date().toISOString(),
  };
  await col('saas_tasks').insertOne(task);
  res.status(201).json({ task: publicTask(task) });
});

app.put('/api/saas/tasks/:id', requireAuth, async (req, res) => {
  const id   = Number(req.params.id);
  const task = await col('saas_tasks').findOne({ id, user_id: req.user.id });
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

  const body = req.body || {};
  const set = {};
  const unset = {};

  if ('title' in body) {
    const title = (body.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'Titre de la tâche requis' });
    set.title = title;
  }
  if ('notes' in body) set.notes = (body.notes || '').toString().trim().slice(0, 2000);
  if ('priority' in body && TASK_PRIORITIES.includes(body.priority)) set.priority = body.priority;
  if ('due_date' in body) {
    if (body.due_date && !isNaN(Date.parse(body.due_date))) set.due_date = new Date(body.due_date).toISOString().slice(0, 10);
    else unset.due_date = '';
  }
  if ('done' in body) {
    set.done = !!body.done;
    if (set.done) set.completed_at = new Date().toISOString();
    else unset.completed_at = '';
  }

  const update = {};
  if (Object.keys(set).length)   update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  if (Object.keys(update).length) await col('saas_tasks').updateOne({ id, user_id: req.user.id }, update);
  res.json({ success: true });
});

app.delete('/api/saas/tasks/:id', requireAuth, async (req, res) => {
  const id   = Number(req.params.id);
  const task = await col('saas_tasks').findOne({ id, user_id: req.user.id });
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  await col('saas_tasks').deleteOne({ id, user_id: req.user.id });
  res.json({ success: true });
});

// ─── SaaS : Avocat ────────────────────────────────────────────────────────────
// Mise en relation avec un avocat partenaire qui engage sa responsabilité sur les
// documents les plus sensibles de la levée. Modèle « hybride » retenu :
//   • par défaut, un avocat partenaire est ATTRIBUÉ au fondateur (zéro friction,
//     cohérent avec la promesse de gain de temps) ;
//   • l'avocat est toujours NOMMÉ — la déontologie l'impose (responsabilité
//     personnelle, vérification des conflits d'intérêts, secret professionnel,
//     assurance RCP) : pas d'avocat anonyme ;
//   • le fondateur peut CHANGER pour un autre partenaire, ou déclarer le sien.
// L'IA prépare et dégrossit ; l'avocat valide et engage sa responsabilité — la
// consultation juridique personnalisée reste du ressort de l'avocat (loi de 1971).

// Réseau d'avocats partenaires. ⚠️ Données d'EXEMPLE, à remplacer par les cabinets
// réellement partenaires (avec lettre de mission nominative et RCP). On ne stocke
// ici aucune donnée d'identification sensible (n° de toque, coordonnées directes) :
// la mise en relation nominative complète se fait à l'ouverture de la mission.
const AVOCAT_PARTNERS = [
  { id: 'novea', name: 'Cabinet Novéa', lead: 'Me Claire Vasseur',  barreau: 'Barreau de Paris', speciality: 'Venture & levées de fonds', bio: 'Accompagne les start-up de l’amorçage à la Série A. Spécialisée déclarations & garanties et pactes d’associés.' },
  { id: 'linea', name: 'Cabinet Linéa', lead: 'Me Thomas Béranger', barreau: 'Barreau de Lyon',  speciality: 'Private equity / M&A',     bio: 'Structuration d’opérations equity et instruments convertibles (BSA-AIR, obligations convertibles).' },
  { id: 'aria',  name: 'Cabinet Aria',  lead: 'Me Sarah Nkomo',     barreau: 'Barreau de Paris', speciality: 'Droit des sociétés / tech', bio: 'Négociation côté fondateurs : gouvernance, clauses de liquidité et de leaver.' },
];
function avocatPartner(id) { return AVOCAT_PARTNERS.find(p => p.id === id) || null; }

// Prestations forfaitisées. `critical` = documents où le recours à l'avocat est le
// plus recommandé (engagement le plus fort des fondateurs). Les tarifs sont
// indicatifs : ils s'appuient sur une grille négociée en amont avec les partenaires.
const AVOCAT_PRESTATIONS = [
  { key: 'garantie',  label: 'Déclarations & garanties (W&R)',   desc: 'Relecture avant signature du document le plus engageant pour les fondateurs.', critical: true,  price: 'à partir de 890 €',   delay: '72 h' },
  { key: 'pacte',     label: 'Pacte d’associés',                 desc: 'Revue des clauses sensibles : gouvernance, liquidité, leaver, préférence.',    critical: true,  price: 'à partir de 1 190 €', delay: '3–4 j' },
  { key: 'termsheet', label: 'Term sheet / lettre d’intention',  desc: 'Vérification avant de vous engager sur les grands équilibres de la levée.',     critical: false, price: 'à partir de 490 €',   delay: '48 h' },
  { key: 'bsa-air',   label: 'BSA-AIR / convertible',            desc: 'Contrôle de l’instrument d’investissement convertible.',                       critical: false, price: 'à partir de 590 €',   delay: '48 h' },
  { key: 'question',  label: 'Question juridique ponctuelle',    desc: 'Un point précis à sécuriser ? Échange court avec votre avocat.',                critical: false, price: 'à partir de 150 €',   delay: '24 h' },
];
const AVOCAT_PRESTATION_KEYS  = new Set(AVOCAT_PRESTATIONS.map(p => p.key));
const AVOCAT_REQUEST_STATUSES = ['demande', 'en_cours', 'relu', 'annule'];

// ── Classification de risque juridique par document ───────────────────────────
// Pilote le badge couleur (Documents) et la recommandation de relecture avocat.
// Règle : responsabilité personnelle du fondateur OU document difficilement
// réversible une fois signé → « critique » ; enjeu réel mais réversible /
// pré-engageant → « conseille » ; sinon « faible ». La clé de référence est le slug
// du modèle (template_source) ; à défaut (fichiers importés), on retombe sur des
// mots-clés du nom. « faible » = faible enjeu, pas garantie d'absence de risque.
const AVOCAT_RISK_CRITIQUE = new Set([
  'declarations-garanties-r-w-integrees-au-pacte',
  'convention-de-garantie-d-actif-et-de-passif-gap',
  'pacte-d-associes-shareholders-agreement',
  'statuts-a-jour',
  'statuts-modifies-actions-de-preference',
]);
const AVOCAT_RISK_CONSEILLE = new Set([
  'term-sheet-lettre-d-intention',
  'term-sheet-bsa-air-montant-decote-plafond-et-ou-plancher-de-valorisation',
  'contrat-d-emission-de-bsa-air-termes-et-conditions-des-bons',
  'contrat-bulletin-de-souscription',
  'bulletin-de-souscription-des-bsa-air',
  'lettre-d-investissement-side-letter',
  'clause-d-exclusivite-de-negociation',
  'convention-entre-investisseurs',
  'termes-des-valeurs-mobilieres-emises-adp-bsa-oc',
  'contrats-de-travail-bspce-bsa-management-package',
  'information-reporting-des-investisseurs-info-rights',
  'suivi-des-engagements-du-pacte-covenants',
  'cessions-de-propriete-intellectuelle-depots-marques-brevets',
]);
const AVOCAT_RISK_KW_CRITIQUE  = [/d[eé]clarations?.{0,4}garanties?/, /garantie d.?actif/, /\bgap\b/, /pacte.{0,4}associ/, /\bstatuts?\b/];
const AVOCAT_RISK_KW_CONSEILLE = [/term.?sheet/, /lettre d.?intention/, /bsa.?air/, /souscription/, /side.?letter/, /exclusivit/, /convention/, /cession/, /propri[eé]t[eé] intellectuelle/, /management package/, /bspce/];

function documentRiskLevel(doc) {
  const slug = shortText(doc && doc.template_source, 120).toLowerCase();
  if (slug) {
    if (AVOCAT_RISK_CRITIQUE.has(slug))  return 'critique';
    if (AVOCAT_RISK_CONSEILLE.has(slug)) return 'conseille';
    return 'faible';
  }
  const name = shortText(doc && doc.name, 200).toLowerCase();
  if (AVOCAT_RISK_KW_CRITIQUE.some(re => re.test(name)))  return 'critique';
  if (AVOCAT_RISK_KW_CONSEILLE.some(re => re.test(name))) return 'conseille';
  return 'faible';
}

// Prestation avocat la plus adaptée à un document (pré-remplit la demande de relecture).
const AVOCAT_PRESTA_BY_SLUG = {
  'declarations-garanties-r-w-integrees-au-pacte': 'garantie',
  'convention-de-garantie-d-actif-et-de-passif-gap': 'garantie',
  'pacte-d-associes-shareholders-agreement': 'pacte',
  'statuts-a-jour': 'pacte',
  'statuts-modifies-actions-de-preference': 'pacte',
  'suivi-des-engagements-du-pacte-covenants': 'pacte',
  'convention-entre-investisseurs': 'pacte',
  'term-sheet-lettre-d-intention': 'termsheet',
  'clause-d-exclusivite-de-negociation': 'termsheet',
  'lettre-d-investissement-side-letter': 'termsheet',
  'term-sheet-bsa-air-montant-decote-plafond-et-ou-plancher-de-valorisation': 'bsa-air',
  'contrat-d-emission-de-bsa-air-termes-et-conditions-des-bons': 'bsa-air',
  'bulletin-de-souscription-des-bsa-air': 'bsa-air',
  'contrat-bulletin-de-souscription': 'bsa-air',
  'termes-des-valeurs-mobilieres-emises-adp-bsa-oc': 'bsa-air',
};
function documentAvocatPresta(doc) {
  const slug = shortText(doc && doc.template_source, 120).toLowerCase();
  if (slug && AVOCAT_PRESTA_BY_SLUG[slug]) return AVOCAT_PRESTA_BY_SLUG[slug];
  const name = shortText(doc && doc.name, 200).toLowerCase();
  if (/garantie|d[eé]clarations?/.test(name))       return 'garantie';
  if (/pacte|statuts/.test(name))                   return 'pacte';
  if (/term.?sheet|lettre d.?intention/.test(name)) return 'termsheet';
  if (/bsa.?air|souscription|convertible/.test(name)) return 'bsa-air';
  return 'question';
}

function avocatPublicRequest(r) {
  if (!r) return null;
  const { _id, user_id, ...rest } = r;
  return rest;
}

// État avocat de l'utilisateur — créé à la volée avec un avocat attribué par défaut.
async function getOrInitAvocatState(userId) {
  let state = await col('saas_avocat').findOne({ user_id: userId });
  if (!state) {
    // Attribution déterministe (répartit les fondateurs sur le réseau) : stable d'une
    // visite à l'autre, contrairement à un tirage aléatoire.
    const n   = Number(userId) || 0;
    const idx = ((n % AVOCAT_PARTNERS.length) + AVOCAT_PARTNERS.length) % AVOCAT_PARTNERS.length;
    const now = new Date().toISOString();
    state = {
      user_id: userId, mode: 'assigned', partner_id: AVOCAT_PARTNERS[idx].id,
      own_lawyer: null, created_at: now, updated_at: now,
    };
    await col('saas_avocat').insertOne({ ...state });
  }
  return state;
}

function avocatPublicState(state) {
  return {
    mode: state.mode,
    partner: state.mode === 'own' ? null : avocatPartner(state.partner_id),
    own_lawyer: state.own_lawyer || null,
  };
}

async function platformLawyerPublic(userId) {
  const state = await col('saas_avocat').findOne({ user_id: userId });
  if (!state?.lawyer_user_id || state.mode !== 'platform') return null;
  const [user, profile] = await Promise.all([
    col('users').findOne({ id: state.lawyer_user_id }, { projection: { full_name: 1, email: 1, lawyer_status: 1 } }),
    col('saas_lawyer_profiles').findOne({ user_id: state.lawyer_user_id }, { projection: { _id: 0, user_id: 0 } }),
  ]);
  if (!user || user.lawyer_status !== 'active') return null;
  return { id: `platform-${state.lawyer_user_id}`, lead: user.full_name || user.email, name: profile?.city ? `Avocat à ${profile.city}` : 'Avocat Liquid+', barreau: profile?.city || '', speciality: profile?.specialty || '', bio: 'Avocat attribué à votre dossier par Liquid+.', email: user.email };
}

app.get('/api/saas/avocat/overview', requireAuth, async (req, res) => {
  const state = await getOrInitAvocatState(req.user.id);
  const platformLawyer = await platformLawyerPublic(req.user.id);
  const requests = await col('saas_avocat_requests')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } })
    .sort({ id: -1 }).toArray();
  res.json({
    prestations: AVOCAT_PRESTATIONS,
    partners:    AVOCAT_PARTNERS,
    statuses:    AVOCAT_REQUEST_STATUSES,
    ...(platformLawyer ? { mode: 'assigned', partner: platformLawyer, own_lawyer: null } : avocatPublicState(state)),
    requests,
  });
});

// Liste seule des demandes de relecture (sans initialiser d'état avocat : utilisé
// par la page Documents pour savoir quels documents ont été soumis à un avocat).
app.get('/api/saas/avocat/requests', requireAuth, async (req, res) => {
  const requests = await col('saas_avocat_requests')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } })
    .sort({ id: -1 }).toArray();
  res.json({ requests });
});

app.post('/api/saas/avocat/change-request', requireAuth, async (req, res) => {
  const state = await col('saas_avocat').findOne({ user_id: req.user.id, mode: 'platform' });
  if (!state?.lawyer_user_id) return res.status(409).json({ error: 'Aucun avocat Liquid+ ne vous est actuellement attribué' });
  const existing = await col('lawyer_change_requests').findOne({ client_id: req.user.id, status: 'pending' });
  if (existing) return res.status(409).json({ error: 'Une demande de changement est déjà en cours' });
  const [client, fundraisingProfile, lawyer] = await Promise.all([
    col('users').findOne({ id: req.user.id }, { projection: { email: 1, full_name: 1 } }),
    col('saas_fundraising_profiles').findOne({ user_id: req.user.id }, { projection: { company_name: 1 } }),
    col('users').findOne({ id: state.lawyer_user_id }, { projection: { email: 1, full_name: 1 } }),
  ]);
  const now = new Date().toISOString();
  const request = {
    id: crypto.randomUUID(), client_id: req.user.id,
    client_name: client?.full_name || client?.email || '', client_email: client?.email || '',
    startup_name: shortText(fundraisingProfile?.company_name, 200),
    current_lawyer_id: state.lawyer_user_id, current_lawyer_name: lawyer?.full_name || lawyer?.email || '',
    reason: shortText(req.body?.reason, 1000), status: 'pending', created_at: now, updated_at: now,
  };
  await col('lawyer_change_requests').insertOne(request);
  res.status(201).json({ request });
});

app.put('/api/saas/avocat/preference', requireAuth, async (req, res) => {
  const body = req.body || {};
  const mode = ['assigned', 'chosen', 'own'].includes(body.mode) ? body.mode : null;
  if (!mode) return res.status(400).json({ error: 'Mode invalide' });

  const state = await getOrInitAvocatState(req.user.id);
  const set   = { mode, updated_at: new Date().toISOString() };

  if (mode === 'assigned') {
    // On conserve l'avocat déjà attribué (ou on en attribue un si l'état venait de « own »).
    if (!avocatPartner(state.partner_id)) set.partner_id = AVOCAT_PARTNERS[0].id;
    set.own_lawyer = null;
  } else if (mode === 'chosen') {
    const partner = avocatPartner(body.partner_id);
    if (!partner) return res.status(400).json({ error: 'Avocat inconnu' });
    set.partner_id = partner.id;
    set.own_lawyer = null;
  } else { // own : le fondateur déclare son propre avocat
    const name = shortText(body?.own_lawyer?.name, 120);
    if (!name) return res.status(400).json({ error: 'Nom de l’avocat requis' });
    set.own_lawyer = {
      name,
      firm:  shortText(body?.own_lawyer?.firm, 120),
      email: shortText(body?.own_lawyer?.email, 160),
    };
  }
  await col('saas_avocat').updateOne({ user_id: req.user.id }, { $set: set });
  const updated = await col('saas_avocat').findOne({ user_id: req.user.id });
  res.json(avocatPublicState(updated));
});

app.post('/api/saas/avocat/requests', requireAuth, async (req, res) => {
  const body = req.body || {};
  const prestationKey = shortText(body.prestation_key, 40);
  if (!AVOCAT_PRESTATION_KEYS.has(prestationKey))
    return res.status(400).json({ error: 'Prestation inconnue' });

  const state = await getOrInitAvocatState(req.user.id);

  // Document rattaché (optionnel) : on vérifie qu'il appartient bien au fondateur.
  let documentId = null, documentName = null;
  if (body.document_id != null && body.document_id !== '') {
    const doc = await col('saas_documents').findOne(
      { id: Number(body.document_id), user_id: req.user.id },
      { projection: { id: 1, name: 1 } });
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    documentId = doc.id; documentName = doc.name || null;
  }

  const now = new Date().toISOString();
  const id  = await nextId('saas_avocat_requests');
  const request = {
    id, user_id: req.user.id,
    prestation_key: prestationKey,
    mode:       state.mode,
    partner_id: state.mode === 'own' ? null : state.partner_id,
    own_lawyer: state.mode === 'own' ? (state.own_lawyer || null) : null,
    document_id: documentId, document_name: documentName,
    note:   shortText(body.note, 1000),
    status: 'demande',
    created_at: now, updated_at: now,
  };
  await col('saas_avocat_requests').insertOne(request);
  res.status(201).json({ request: avocatPublicRequest(request) });
});

app.put('/api/saas/avocat/requests/:id', requireAuth, async (req, res) => {
  const id      = Number(req.params.id);
  const request = await col('saas_avocat_requests').findOne({ id, user_id: req.user.id });
  if (!request) return res.status(404).json({ error: 'Demande introuvable' });
  // Côté fondateur, seule l'annulation d'une demande encore ouverte est permise
  // (les transitions en_cours / relu relèvent du poste avocat).
  if (req.body?.status !== 'annule')
    return res.status(400).json({ error: 'Seule l’annulation est possible' });
  if (!['demande', 'en_cours'].includes(request.status))
    return res.status(409).json({ error: 'Cette demande ne peut plus être annulée' });
  await col('saas_avocat_requests').updateOne(
    { id, user_id: req.user.id },
    { $set: { status: 'annule', updated_at: new Date().toISOString() } });
  res.json({ success: true });
});

// ─── Journal d'activité ───────────────────────────────────────────────────────
// Historique unifié de TOUTES les actions du fondateur (pas seulement les
// documents) depuis la création de son compte. Il est reconstruit À LA LECTURE à
// partir des horodatages déjà présents dans chaque collection : aucune
// journalisation dédiée n'est nécessaire, et l'historique est donc rétroactif —
// il couvre tout ce qui existe encore, quelle que soit la date de l'action.
const ACTIVITY_MAX = 250;

// Certaines collections horodatent en millisecondes (savedAt), d'autres en chaîne
// ISO. On normalise tout en ISO ; les valeurs illisibles sont ignorées.
function activityIso(value) {
  if (value == null) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

app.get('/api/saas/activity', requireAuth, async (req, res) => {
  const uid = req.user.id;
  const events = [];
  const push = (at, type, action, label) => {
    const iso = activityIso(at);
    if (iso) events.push({ at: iso, type, action, label: label ? String(label).slice(0, 160) : '' });
  };
  // Deux horodatages sont « distincts » seulement s'ils sont espacés de plus d'une
  // minute : sinon la modification enregistrée à la création n'est qu'un doublon.
  const isDistinctUpdate = (created, updated) => {
    if (!updated || updated === created) return false;
    const c = new Date(created).getTime(), u = new Date(updated).getTime();
    return isNaN(c) || isNaN(u) || (u - c) > 60000;
  };

  const [docs, versions, folders, tasks, investors, dilutions, valuations, exits, compares, profile] = await Promise.all([
    col('saas_documents').find({ user_id: uid }, { projection: { name: 1, created_at: 1, updated_at: 1 } }).toArray(),
    col('saas_doc_versions').find({ user_id: uid }, { projection: { label: 1, created_at: 1 } }).toArray(),
    col('saas_folders').find({ user_id: uid }, { projection: { name: 1, key: 1, created_at: 1 } }).toArray(),
    col('saas_tasks').find({ user_id: uid }, { projection: { title: 1, created_at: 1, completed_at: 1, done: 1 } }).toArray(),
    col('saas_investors').find({ user_id: uid }, { projection: { name: 1, created_at: 1, updated_at: 1 } }).toArray(),
    col('saas_dilution_simulations').find({ user_id: uid }, { projection: { name: 1, savedAt: 1, created_at: 1 } }).toArray(),
    col('saas_valuation_estimations').find({ user_id: uid }, { projection: { name: 1, savedAt: 1, created_at: 1 } }).toArray(),
    col('saas_exit_simulations').find({ user_id: uid }, { projection: { name: 1, savedAt: 1, created_at: 1 } }).toArray(),
    col('saas_compare_history').find({ user_id: uid }, { projection: { title: 1, mode: 1, created_at: 1 } }).toArray(),
    col('saas_fundraising_profiles').findOne({ user_id: uid }, { projection: { updated_at: 1, created_at: 1 } }),
  ]);

  docs.forEach(d => {
    push(d.created_at, 'document', 'created', d.name);
    if (isDistinctUpdate(d.created_at, d.updated_at)) push(d.updated_at, 'document', 'updated', d.name);
  });
  versions.forEach(v => push(v.created_at, 'version', 'created', v.label));
  // Les dossiers « système » (étapes de la levée) sont créés automatiquement, pas
  // par le fondateur : on ne garde que les dossiers qu'il a lui-même ajoutés.
  folders.filter(f => !f.key).forEach(f => push(f.created_at, 'folder', 'created', f.name));
  tasks.forEach(t => {
    push(t.created_at, 'task', 'created', t.title);
    if (t.done && t.completed_at) push(t.completed_at, 'task', 'done', t.title);
  });
  investors.forEach(i => {
    push(i.created_at, 'investor', 'created', i.name);
    if (isDistinctUpdate(i.created_at, i.updated_at)) push(i.updated_at, 'investor', 'updated', i.name);
  });
  dilutions.forEach(s => push(s.savedAt || s.created_at, 'dilution', 'saved', s.name));
  valuations.forEach(s => push(s.savedAt || s.created_at, 'valuation', 'saved', s.name));
  exits.forEach(s => push(s.savedAt || s.created_at, 'exit', 'saved', s.name));
  compares.forEach(c => push(c.created_at, 'compare', c.mode === 'investors' ? 'investors' : 'versions', c.title));
  if (profile) push(profile.updated_at || profile.created_at, 'profile', 'updated', null);

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  res.json({ activity: events.slice(0, ACTIVITY_MAX) });
});

// ─── Pipeline investisseurs (suivi manuel des investisseurs par le fondateur) ─
const INVESTOR_STAGES = [
  'a_contacter',
  'contacte',
  'interesse',
  'due_diligence_preliminaire',
  'lettre_intention_negociation',
  'lettre_intention_signee',
  'due_diligence_poussee',
  'contrats_negociation',
  'contrats_signes',
  'gouvernance',
];
const INVESTOR_TYPES = ['ba', 'vc', 'love_money'];
const LEGACY_INVESTOR_STAGES = {
  due_diligence: 'due_diligence_preliminaire',
  negociation: 'lettre_intention_negociation',
  engage: 'contrats_signes',
  decline: 'a_contacter',
};

function publicInvestor(inv) {
  const { _id, user_id, ...rest } = inv;
  rest.stage = LEGACY_INVESTOR_STAGES[rest.stage] || rest.stage;
  return rest;
}

app.get('/api/saas/investors', requireAuth, async (req, res) => {
  const investors = await col('saas_investors')
    .find({ user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } })
    .sort({ order: 1, id: 1 })
    .toArray();
  res.json({ investors: investors.map(publicInvestor) });
});

app.post('/api/saas/investors', requireAuth, async (req, res) => {
  const name = (req.body?.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: "Nom de l'investisseur requis" });
  const firm    = (req.body?.firm || '').toString().trim().slice(0, 200);
  const investorType = INVESTOR_TYPES.includes(req.body?.investor_type) ? req.body.investor_type : null;
  const email   = (req.body?.email || '').toString().trim().slice(0, 200);
  const phone   = (req.body?.phone || '').toString().trim().slice(0, 60);
  const notes   = (req.body?.notes || '').toString().trim().slice(0, 2000);
  const stage   = INVESTOR_STAGES.includes(req.body?.stage) ? req.body.stage : 'a_contacter';
  const amountRaw = Number(req.body?.amount);
  const amount = Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;

  const id   = await nextId('saas_investors');
  const last = await col('saas_investors').findOne({ user_id: req.user.id }, { sort: { order: -1 }, projection: { order: 1 } });
  const investor = {
    id, user_id: req.user.id, name, firm, investor_type: investorType, email, phone, amount, stage, notes,
    order: (last?.order ?? -1) + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
  await col('saas_investors').insertOne(investor);
  res.status(201).json({ investor: publicInvestor(investor) });
});

app.put('/api/saas/investors/:id', requireAuth, async (req, res) => {
  const id       = Number(req.params.id);
  const investor = await col('saas_investors').findOne({ id, user_id: req.user.id });
  if (!investor) return res.status(404).json({ error: 'Investisseur introuvable' });

  const body  = req.body || {};
  const set   = {};
  const unset = {};

  if ('name' in body) {
    const name = (body.name || '').trim().slice(0, 200);
    if (!name) return res.status(400).json({ error: "Nom de l'investisseur requis" });
    set.name = name;
  }
  if ('firm' in body)  set.firm  = (body.firm || '').toString().trim().slice(0, 200);
  if ('investor_type' in body) {
    if (INVESTOR_TYPES.includes(body.investor_type)) set.investor_type = body.investor_type;
    else unset.investor_type = '';
  }
  if ('email' in body) set.email = (body.email || '').toString().trim().slice(0, 200);
  if ('phone' in body) set.phone = (body.phone || '').toString().trim().slice(0, 60);
  if ('notes' in body) set.notes = (body.notes || '').toString().trim().slice(0, 2000);
  if ('stage' in body && INVESTOR_STAGES.includes(body.stage)) set.stage = body.stage;
  if ('amount' in body) {
    const amountRaw = Number(body.amount);
    if (Number.isFinite(amountRaw) && amountRaw > 0) set.amount = amountRaw;
    else unset.amount = '';
  }

  if (Object.keys(set).length || Object.keys(unset).length) {
    set.updated_at = new Date().toISOString();
    const update = { $set: set };
    if (Object.keys(unset).length) update.$unset = unset;
    await col('saas_investors').updateOne({ id, user_id: req.user.id }, update);
  }
  const saved = await col('saas_investors').findOne({ id, user_id: req.user.id });
  res.json({ success: true, investor: publicInvestor(saved) });
});

app.delete('/api/saas/investors/:id', requireAuth, async (req, res) => {
  const id       = Number(req.params.id);
  const investor = await col('saas_investors').findOne({ id, user_id: req.user.id });
  if (!investor) return res.status(404).json({ error: 'Investisseur introuvable' });
  await col('saas_investors').deleteOne({ id, user_id: req.user.id });
  // Les documents rattachés à cet investisseur redeviennent « non classés ».
  await col('saas_documents').updateMany({ user_id: req.user.id, investor_id: id }, { $unset: { investor_id: '' } });
  res.json({ success: true });
});

// Range (ou retire) un document dans un dossier.
app.put('/api/saas/documents/:id/folder', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const raw = req.body?.folder_id;
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  if (raw === null || raw === '' || raw === undefined) {
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $unset: { folder_id: '', category_key: '' } });
  } else {
    const folderId = Number(raw);
    if (!(await col('saas_folders').findOne({ id: folderId, user_id: req.user.id })))
      return res.status(404).json({ error: 'Dossier introuvable' });
    const categoryKey = (req.body?.category_key || '').toString().trim().slice(0, 80);
    const update = categoryKey
      ? { $set: { folder_id: folderId, category_key: categoryKey } }
      : { $set: { folder_id: folderId }, $unset: { category_key: '' } };
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, update);
  }
  res.json({ success: true });
});

// Rattache (ou retire) un document à un investisseur du pipeline. Sert à la vue
// « Par investisseur » de l'outil Documents : un document sans investor_id
// apparaît dans le dossier « Non classés » de cette vue.
app.put('/api/saas/documents/:id/investor', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const raw = req.body?.investor_id;
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  if (raw === null || raw === '' || raw === undefined) {
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $unset: { investor_id: '' } });
  } else {
    const investorId = Number(raw);
    if (!(await col('saas_investors').findOne({ id: investorId, user_id: req.user.id })))
      return res.status(404).json({ error: 'Investisseur introuvable' });
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $set: { investor_id: investorId } });
  }
  res.json({ success: true });
});

// Niveaux d'avancement d'un document, du plus tôt au plus avancé. Sert à la vue
// « Par avancement » de l'outil Documents : généré → en cours de modification →
// modifié (non signé) → validé → signé → disponible en data room.
const SAAS_DOC_STATUSES = ['genere', 'en_cours', 'modifie', 'valide', 'signe', 'data_room'];

// Définit (ou retire) le niveau d'avancement d'un document. Un document sans
// statut explicite est déduit côté client (« généré » par défaut, « en cours de
// modification » dès qu'il a été retravaillé après sa création).
app.put('/api/saas/documents/:id/status', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const raw = req.body?.status;
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  if (raw === null || raw === '' || raw === undefined) {
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $unset: { status: '' } });
  } else {
    const status = String(raw);
    if (!SAAS_DOC_STATUSES.includes(status))
      return res.status(400).json({ error: 'Statut invalide' });
    await col('saas_documents').updateOne({ id, user_id: req.user.id }, { $set: { status } });
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
      // Remettre le document dans « Fichiers importés » (folder_id → null).
      if (cur.document_id != null) {
        await col('saas_documents').updateOne(
          { id: cur.document_id, user_id: req.user.id },
          { $set: { folder_id: null } }
        );
      }
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

  // Résultat de l'analyse Claude : liste des choses à faire.
  if ('todos' in (req.body || {})) {
    const t = req.body.todos;
    if (Array.isArray(t) && t.length) {
      cur.todos = t.slice(0, 60).map(x => String(x).slice(0, 500));
      cur.analysis_at = new Date().toISOString();
    } else {
      delete cur.todos;
      delete cur.analysis_at;
    }
  }

  if (cur.document_id == null && !cur.final) delete state[slug];
  else state[slug] = cur;

  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { items_state: state } });
  res.json({ success: true, items_state: state });
});

// Déposer une NOUVELLE VERSION d'un document sur un élément de la roadlist :
// l'ancien document lié est archivé dans `versions` (historique, le plus récent en
// tête) et le nouveau devient le document courant. La validation « final » et
// l'analyse précédente sont réinitialisées (le nouveau document est à re-vérifier).
// L'ancienne version reste stockée (marquée `is_version`) pour la comparaison IA.
app.put('/api/saas/folders/:id/checklist/version', requireAuth, async (req, res) => {
  const id     = Number(req.params.id);
  const slug   = (req.body?.slug ?? '').toString().trim();
  const rawDoc = req.body?.document_id;
  if (!slug) return res.status(400).json({ error: 'Élément de checklist requis' });
  if (rawDoc == null || rawDoc === '') return res.status(400).json({ error: 'Document requis' });

  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });

  const newId  = Number(rawDoc);
  const newDoc = await col('saas_documents').findOne({ id: newId, user_id: req.user.id });
  if (!newDoc) return res.status(404).json({ error: 'Document introuvable' });

  const state = { ...(folder.items_state || {}) };
  const cur   = { ...(state[slug] || {}) };
  const oldId = cur.document_id;

  const versions = Array.isArray(cur.versions) ? cur.versions.slice() : [];
  if (oldId != null && oldId !== newId) {
    const oldDoc = await col('saas_documents').findOne(
      { id: oldId, user_id: req.user.id }, { projection: { name: 1, lineage_id: 1 } });
    versions.unshift({
      document_id: oldId,
      name: oldDoc ? oldDoc.name : ('Document #' + oldId),
      archived_at: new Date().toISOString(),
    });
    // L'ancienne version reste rangée dans la phase mais marquée pour ne pas
    // réapparaître comme fichier libre ni dans les sélecteurs.
    await col('saas_documents').updateOne(
      { id: oldId, user_id: req.user.id }, { $set: { is_version: true, folder_id: id } });
    // Un remplacement depuis la roadlist rejoint la même lignée globale.
    await col('saas_documents').updateOne(
      { id: newId, user_id: req.user.id },
      { $set: {
        lineage_id: (oldDoc && oldDoc.lineage_id) || oldId,
        parent_document_id: oldId,
        origin: newDoc.origin || 'founder',
        version_type: newDoc.version_type || 'revision',
      } },
    );
  }

  cur.document_id = newId;
  cur.versions    = versions.slice(0, 30);
  cur.final       = false;
  delete cur.todos;
  delete cur.analysis_at;
  state[slug] = cur;

  await col('saas_documents').updateOne(
    { id: newId, user_id: req.user.id }, { $set: { folder_id: id }, $unset: { is_version: '' } });
  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { items_state: state } });
  res.json({ success: true, items_state: state });
});

// ─── SaaS : stockage de documents (par utilisateur) ───────────────────────────
function publicDoc(d) {
  const { _id, filename, user_id, data, ...rest } = d;
  return rest;
}

app.get('/api/saas/documents', requireAuth, async (req, res) => {
  // On exclut html (term sheets), data (binaire importé) et extracted_text (cache
  // du remplissage automatique) : trop volumineux pour la liste.
  const docs = await col('saas_documents')
    .find({ user_id: req.user.id }, { projection: { _id: 0, filename: 0, user_id: 0, html: 0, data: 0, extracted_text: 0 } })
    .sort({ updated_at: -1, created_at: -1 })
    .toArray();
  // Niveau de risque juridique + prestation avocat suggérée (badge « Documents »
  // et pré-remplissage de la demande de relecture).
  docs.forEach(d => { d.risk = documentRiskLevel(d); d.avocat_presta = documentAvocatPresta(d); });
  res.json({ documents: docs });
});

// ─── SaaS : historique des comparaisons IA ────────────────────────────────────
// Deux historiques distincts (paramètre ?mode=versions|investors) : évolution
// d'un document au fil de la négociation, et comparaison de propositions de
// plusieurs investisseurs. Sans mode, on renvoie les deux mélangés.
app.get('/api/saas/compare-history', requireAuth, async (req, res) => {
  const mode = req.query.mode === 'investors' ? 'investors'
             : req.query.mode === 'versions'  ? 'versions'  : null;
  const filter = { user_id: req.user.id };
  if (mode) filter.mode = mode;
  const history = await col('saas_compare_history')
    .find(filter, { projection: { _id: 0, user_id: 0, result: 0 } })
    .sort({ id: -1 }).limit(100).toArray();
  res.json({ history });
});

// Détail complet d'une comparaison archivée (pour ré-afficher le résultat).
app.get('/api/saas/compare-history/:id', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const row = await col('saas_compare_history').findOne(
    { id, user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } });
  if (!row) return res.status(404).json({ error: 'Comparaison introuvable' });
  res.json(row);
});

app.delete('/api/saas/compare-history/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const r  = await col('saas_compare_history').deleteOne({ id, user_id: req.user.id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Comparaison introuvable' });
  res.json({ success: true });
});

// ─── SaaS : term sheets éditées (stockées en base, pas de fichier) ────────────
// Produit un premier brouillon structuré pour les documents qui dépendent trop
// de la situation de la société pour qu'un modèle figé soit suffisamment fiable.
// Le modèle ne renvoie que du texte JSON : le HTML est construit et échappé ici.
app.post('/api/saas/guided-document-draft', requireAuth, enforceDailyCap, async (req, res) => {
  if (!zaiClient) return res.status(503).json({ error: 'Assistant IA non configuré.' });
  const title = shortText(req.body?.title, 180);
  const context = shortText(req.body?.context, 4000);
  if (!title) return res.status(400).json({ error: 'Titre du document requis.' });

  const system =
`Tu aides un fondateur de startup française, généralement une SAS, à préparer un brouillon de document pour une levée de fonds ou une due diligence.
Document demandé : « ${title} ».
Contexte fourni par le fondateur : « ${context || 'aucun contexte fourni'} ».

Crée un brouillon prudent, concret et exploitable, sans inventer aucun nom, montant, date, fait, conformité ou engagement. Utilise [À COMPLÉTER] dès qu'une information manque. Ne prétends jamais qu'une formalité a été accomplie. Pour une liste, un registre, une cartographie, un tableau de suivi ou une politique, propose les rubriques réellement utiles. Pour un acte juridique engageant, reste conservateur et signale les choix qui nécessitent validation.
Réponds en français avec un objet JSON contenant "intro" (2 phrases maximum) et "sections" (3 à 10 objets avec "title" et "content"). Le contenu de chaque section est du texte brut, éventuellement avec des lignes commençant par "- ", sans HTML.`;

  try {
    const response = await glmChat({
      system,
      messages: [{ role: 'user', content: 'Prépare le brouillon structuré.' }],
      maxTokens: 3500,
      thinking: true,
      json: true,
      jsonHint: 'Format : {"intro":"...","sections":[{"title":"...","content":"..."}]}.',
    });
    await recordClaudeUsage(req.user.id, response);
    const data = glmJson(response);
    const sections = Array.isArray(data.sections) ? data.sections.slice(0, 10) : [];
    if (!sections.length) return res.status(502).json({ error: 'Le brouillon généré est incomplet. Réessayez.' });
    const paragraphize = value => escapeHtml(shortText(value, 6000))
      .split(/\r?\n/).filter(Boolean).map(line => `<p>${line}</p>`).join('');
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>`
      + `<h1>${escapeHtml(title)}</h1>`
      + `<p><strong>Brouillon guidé Liquid+ — à vérifier et personnaliser avant utilisation ou signature.</strong></p>`
      + (data.intro ? `<p>${escapeHtml(shortText(data.intro, 1200))}</p>` : '')
      + sections.map(section => `<h2>${escapeHtml(shortText(section?.title, 180) || 'Section')}</h2>${paragraphize(section?.content || '[À COMPLÉTER]')}`).join('')
      + '</body></html>';
    res.json({ html });
  } catch (err) {
    console.error('guided-document-draft error:', err.message);
    res.status(502).json({ error: 'Impossible de générer le brouillon pour le moment.' });
  }
});

// Gestion administrateur des comptes avocat et de leur portefeuille clients.
const LAWYER_ACCOUNT_STATUSES = ['pending', 'active', 'suspended', 'rejected'];

async function proposalsWithStartupNames(proposals) {
  const clientIds = [...new Set(proposals.map(item => item.client_id).filter(Number.isFinite))];
  if (!clientIds.length) return proposals;
  const profiles = await col('saas_fundraising_profiles')
    .find({ user_id: { $in: clientIds } }, { projection: { _id: 0, user_id: 1, company_name: 1 } })
    .toArray();
  const names = new Map(profiles.map(profile => [profile.user_id, profile.company_name]));
  return proposals.map(item => ({ ...item, startup_name: item.startup_name || names.get(item.client_id) || '' }));
}

app.get('/api/admin/lawyers', requireAdmin, async (_req, res) => {
  const users = await col('users').find({ account_types: 'avocat' }, { projection: { _id: 0, password: 0, totp_secret: 0 } }).sort({ created_at: -1 }).toArray();
  const ids = users.map(u => u.id);
  const [profiles, assignments] = await Promise.all([
    col('saas_lawyer_profiles').find({ user_id: { $in: ids } }, { projection: { _id: 0 } }).toArray(),
    col('saas_avocat').find({ mode: 'platform', lawyer_user_id: { $in: ids } }, { projection: { _id: 0, user_id: 1, lawyer_user_id: 1 } }).toArray(),
  ]);
  const byUser = new Map(profiles.map(p => [p.user_id, p]));
  const clientIds = assignments.map(item => item.user_id);
  const [clients, fundraisingProfiles] = await Promise.all([
    col('users').find({ id: { $in: clientIds } }, { projection: { _id: 0, id: 1, email: 1, full_name: 1 } }).toArray(),
    col('saas_fundraising_profiles').find({ user_id: { $in: clientIds } }, { projection: { _id: 0, user_id: 1, company_name: 1 } }).toArray(),
  ]);
  const clientsById = new Map(clients.map(client => [client.id, client]));
  const companiesById = new Map(fundraisingProfiles.map(profile => [profile.user_id, profile.company_name]));
  const startupsByLawyer = new Map(ids.map(id => [id, []]));
  assignments.forEach(item => {
    const client = clientsById.get(item.user_id);
    if (!client) return;
    startupsByLawyer.get(item.lawyer_user_id)?.push({
      id: client.id,
      name: companiesById.get(client.id) || client.full_name || client.email,
      email: client.email,
    });
  });
  res.json({ lawyers: users.map(u => ({ ...u, lawyer_status: u.lawyer_status || 'pending', profile: byUser.get(u.id) || null, assigned_startups: startupsByLawyer.get(u.id) || [] })) });
});

app.patch('/api/admin/lawyers/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id), status = String(req.body?.status || '');
  if (!LAWYER_ACCOUNT_STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const result = await col('users').updateOne({ id, account_types: 'avocat' }, { $set: { lawyer_status: status, lawyer_status_updated_at: new Date().toISOString() } });
  if (!result.matchedCount) return res.status(404).json({ error: 'Avocat introuvable' });
  res.json({ success: true, status });
});

app.get('/api/admin/founders', requireAdmin, async (_req, res) => {
  const users = await col('users').find({ account_types: 'fondateur' }, { projection: { _id: 0, id: 1, email: 1, full_name: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray();
  const userIds = users.map(u => u.id);
  const [profiles, assignments, openProposals] = await Promise.all([
    col('saas_fundraising_profiles').find({ user_id: { $in: userIds } }, { projection: { _id: 0, user_id: 1, company_name: 1 } }).toArray(),
    col('saas_avocat').find({ user_id: { $in: userIds }, mode: 'platform' }, { projection: { _id: 0, user_id: 1, lawyer_user_id: 1 } }).toArray(),
    col('lawyer_client_proposals').find({ client_id: { $in: userIds }, status: { $in: ['proposed', 'accepted'] } }, { projection: { _id: 0, client_id: 1 } }).toArray(),
  ]);
  const companies = new Map(profiles.map(p => [p.user_id, p.company_name]));
  const lawyerIds = [...new Set(assignments.map(item => item.lawyer_user_id).filter(Number.isFinite))];
  const lawyers = await col('users').find({ id: { $in: lawyerIds } }, { projection: { _id: 0, id: 1, email: 1, full_name: 1 } }).toArray();
  const lawyersById = new Map(lawyers.map(lawyer => [lawyer.id, lawyer]));
  const assignmentsByClient = new Map(assignments.map(item => [item.user_id, item.lawyer_user_id]));
  const clientsWithProposal = new Set(openProposals.map(item => item.client_id));
  res.json({ founders: users.map(u => {
    const lawyerId = assignmentsByClient.get(u.id) || null;
    const lawyer = lawyersById.get(lawyerId);
    return { ...u, company_name: companies.get(u.id) || '', lawyer_id: lawyerId, lawyer_name: lawyer ? (lawyer.full_name || lawyer.email) : '', has_open_proposal: clientsWithProposal.has(u.id) };
  }) });
});

app.get('/api/admin/lawyer-change-requests', requireAdmin, async (_req, res) => {
  const requests = await col('lawyer_change_requests').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
  res.json({ requests });
});

app.get('/api/admin/client-proposals', requireAdmin, async (_req, res) => {
  const proposals = await col('lawyer_client_proposals').find({}, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
  res.json({ proposals: await proposalsWithStartupNames(proposals) });
});

app.post('/api/admin/client-proposals', requireAdmin, async (req, res) => {
  const lawyerId = Number(req.body?.lawyer_id), clientId = Number(req.body?.client_id);
  const [lawyer, client, fundraisingProfile] = await Promise.all([
    col('users').findOne({ id: lawyerId, account_types: 'avocat', lawyer_status: 'active' }),
    col('users').findOne({ id: clientId, account_types: 'fondateur' }),
    col('saas_fundraising_profiles').findOne({ user_id: clientId }, { projection: { company_name: 1 } }),
  ]);
  if (!lawyer) return res.status(404).json({ error: 'Avocat actif introuvable' });
  if (!client) return res.status(404).json({ error: 'Client fondateur introuvable' });
  const duplicate = await col('lawyer_client_proposals').findOne({ lawyer_id: lawyerId, client_id: clientId, status: { $in: ['proposed', 'accepted', 'assigned'] } });
  if (duplicate) return res.status(409).json({ error: 'Une proposition est déjà ouverte pour ce binôme' });
  const now = new Date().toISOString();
  const proposal = { id: crypto.randomUUID(), lawyer_id: lawyerId, lawyer_name: lawyer.full_name || lawyer.email, client_id: clientId, startup_name: shortText(fundraisingProfile?.company_name, 200), client_name: client.full_name || client.email, client_email: client.email, message: shortText(req.body?.message, 1000), status: 'proposed', created_at: now, updated_at: now };
  await col('lawyer_client_proposals').insertOne(proposal);
  res.status(201).json({ proposal });
});

app.post('/api/admin/client-proposals/:id/assign', requireAdmin, async (req, res) => {
  const proposal = await col('lawyer_client_proposals').findOne({ id: req.params.id });
  if (!proposal) return res.status(404).json({ error: 'Proposition introuvable' });
  if (proposal.status !== 'accepted') return res.status(409).json({ error: "L’avocat doit accepter la proposition avant l’attribution" });
  const now = new Date().toISOString();
  await Promise.all([
    col('lawyer_client_proposals').updateOne({ id: proposal.id }, { $set: { status: 'assigned', assigned_at: now, updated_at: now } }),
    col('saas_avocat').updateOne({ user_id: proposal.client_id }, { $set: { mode: 'platform', lawyer_user_id: proposal.lawyer_id, partner_id: null, own_lawyer: null, updated_at: now }, $setOnInsert: { created_at: now } }, { upsert: true }),
  ]);
  res.json({ success: true });
});

app.get('/api/lawyer/client-proposals', requireAuth, requireLawyer, async (req, res) => {
  const proposals = await col('lawyer_client_proposals').find({ lawyer_id: req.user.id }, { projection: { _id: 0 } }).sort({ created_at: -1 }).toArray();
  res.json({ proposals: await proposalsWithStartupNames(proposals) });
});

app.patch('/api/lawyer/client-proposals/:id', requireAuth, requireLawyer, async (req, res) => {
  const status = String(req.body?.status || '');
  if (!['accepted', 'declined'].includes(status)) return res.status(400).json({ error: 'Réponse invalide' });
  const result = await col('lawyer_client_proposals').updateOne({ id: req.params.id, lawyer_id: req.user.id, status: 'proposed' }, { $set: { status, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
  if (!result.matchedCount) return res.status(409).json({ error: 'Cette proposition a déjà été traitée' });
  res.json({ success: true, status });
});

app.get('/api/lawyer/clients', requireAuth, requireLawyer, async (req, res) => {
  const clients = await col('lawyer_client_proposals').find({ lawyer_id: req.user.id, status: 'assigned' }, { projection: { _id: 0 } }).sort({ assigned_at: -1 }).toArray();
  res.json({ clients: await proposalsWithStartupNames(clients) });
});

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
  // Rangement direct dans une phase (utilisé par les modèles de la roadlist).
  if (req.body && req.body.folder_id) {
    const folderId = Number(req.body.folder_id);
    if (await col('saas_folders').findOne({ id: folderId, user_id: req.user.id })) {
      doc.folder_id = folderId;
      const categoryKey = (req.body.category_key || '').toString().trim().slice(0, 80);
      if (categoryKey) doc.category_key = categoryKey;
    }
  }
  const templateSource = shortText(req.body?.template_source, 120);
  if (templateSource) {
    doc.template_source = templateSource;
    doc.is_personalized = false;
  }
  await col('saas_documents').insertOne(doc);
  res.status(201).json({ id, document: publicDoc({ ...doc, html: undefined }) });
});

app.put('/api/saas/termsheets/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { name, html } = req.body ?? {};
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id, kind: 'termsheet' });
  if (!doc) return res.status(404).json({ error: 'Term sheet introuvable' });
  const set = { updated_at: new Date().toISOString() };
  if (typeof html === 'string') {
    set.html = html;
    set.size = Buffer.byteLength(html, 'utf8');
    if (doc.template_source && html !== (doc.html || '')) set.is_personalized = true;
  }
  if (typeof name === 'string' && name.trim()) {
    set.name = name.trim();
    if (doc.template_source && name.trim() !== doc.name) set.is_personalized = true;
  }
  // Si le doc n'a pas encore de dossier et qu'un folder_id est fourni, on l'assigne.
  if (req.body?.folder_id != null && !doc.folder_id) {
    const fid = Number(req.body.folder_id);
    if (await col('saas_folders').findOne({ id: fid, user_id: req.user.id })) set.folder_id = fid;
  }
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

// ─── SaaS : versions VALIDÉES d'un document de travail ────────────────────────
// Une version n'est créée QUE sur action explicite de l'utilisateur (bouton
// « Valider la version » de l'éditeur) — jamais à chaque enregistrement. Les
// instantanés sont stockés À PART (collection saas_doc_versions), pas parmi les
// documents classiques : ils n'apparaissent ni dans « Mes documents », ni dans
// les dossiers, ni dans les sélecteurs.

// Liste des versions d'un document (métadonnées seulement, la plus récente en tête).
app.get('/api/saas/termsheets/:id/versions', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id, kind: 'termsheet' }, { projection: { id: 1 } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const versions = await col('saas_doc_versions')
    .find({ user_id: req.user.id, document_id: id }, { projection: { _id: 0, id: 1, label: 1, size: 1, created_at: 1 } })
    .sort({ id: -1 })
    .toArray();
  res.json({ versions });
});

// Valider une version : instantané du contenu actuel (html transmis par l'éditeur,
// sinon contenu enregistré en base), avec un libellé optionnel.
app.post('/api/saas/termsheets/:id/versions', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id, kind: 'termsheet' });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const html = typeof req.body?.html === 'string' && req.body.html.trim() ? req.body.html : (doc.html || '');
  if (!html.trim()) return res.status(422).json({ error: 'Document vide : rien à versionner.' });
  const label = String(req.body?.label || '').trim().slice(0, 120);

  // Pas de doublon : si la dernière version validée a exactement le même contenu,
  // on la renvoie au lieu d'en créer une nouvelle.
  const last = await col('saas_doc_versions')
    .findOne({ user_id: req.user.id, document_id: id }, { sort: { id: -1 } });
  if (last && last.html === html) {
    const { _id, user_id, html: _h, ...meta } = last;
    return res.json({ version: meta, duplicate: true });
  }

  const vid = await nextId('saas_doc_versions');
  const version = {
    id: vid, user_id: req.user.id, document_id: id,
    label, html, size: Buffer.byteLength(html, 'utf8'),
    created_at: new Date().toISOString(),
  };
  await col('saas_doc_versions').insertOne(version);
  const { _id, user_id, html: _h2, ...meta } = version;
  res.status(201).json({ version: meta });
});

// Contenu d'une version (pour la restaurer dans l'éditeur).
app.get('/api/saas/termsheets/:id/versions/:vid', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const vid = Number(req.params.vid);
  const v = await col('saas_doc_versions').findOne(
    { id: vid, user_id: req.user.id, document_id: id },
    { projection: { _id: 0, user_id: 0 } }
  );
  if (!v) return res.status(404).json({ error: 'Version introuvable' });
  res.json(v);
});

// Supprimer une version validée de l'historique.
app.delete('/api/saas/termsheets/:id/versions/:vid', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const vid = Number(req.params.vid);
  const r = await col('saas_doc_versions').deleteOne({ id: vid, user_id: req.user.id, document_id: id });
  if (!r.deletedCount) return res.status(404).json({ error: 'Version introuvable' });
  res.json({ success: true });
});

// Pour toute la liste en un seul appel : nombre d'instantanés validés par document
// (`counts`) ET taille de la lignée de chaque document (`lineageSizes`). Le bouton
// « Versions » s'affiche dès qu'un document a des instantanés OU appartient à une
// lignée de plus d'un document (une version reçue/envoyée y est rattachée). Chemin
// distinct (pas /termsheets/…) pour ne pas entrer en collision avec /:id/versions/:vid.
app.get('/api/saas/doc-versions/counts', requireAuth, async (req, res) => {
  const rows = await col('saas_doc_versions').aggregate([
    { $match: { user_id: req.user.id } },
    { $group: { _id: '$document_id', count: { $sum: 1 } } },
  ]).toArray();
  const counts = {};
  rows.forEach(r => { if (r._id != null) counts[r._id] = r.count; });

  // Taille de chaque lignée : on regroupe les documents par racine (lineage_id, ou
  // l'id du document pour les anciens documents sans champ), puis on reporte la
  // taille du groupe sur chacun de ses membres.
  const docs = await col('saas_documents')
    .find({ user_id: req.user.id }, { projection: { _id: 0, id: 1, lineage_id: 1 } })
    .toArray();
  const groups = {};
  docs.forEach(d => { const root = d.lineage_id || d.id; (groups[root] = groups[root] || []).push(d.id); });
  const lineageSizes = {};
  Object.values(groups).forEach(ids => { ids.forEach(docId => { lineageSizes[docId] = ids.length; }); });

  res.json({ counts, lineageSizes });
});

// Aperçu d'une version en LECTURE SEULE : rendu autonome et stylé de l'instantané
// (même mise en forme que l'export). Ouvert dans un nouvel onglet depuis la page
// Documents ; ne modifie jamais le document de travail.
app.get('/api/saas/termsheets/:id/versions/:vid/preview', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const vid = Number(req.params.vid);
  const v = await col('saas_doc_versions').findOne({ id: vid, user_id: req.user.id, document_id: id });
  if (!v || !v.html) return res.status(404).send('Version introuvable.');
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id }, { projection: { name: 1 } });
  const title = (v.label || (doc && doc.name) || 'Version').replace(/\.[^.]+$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildExportHtml(v.html, title));
});

// ─── SaaS : lignée / graphe d'échanges des documents (Phase 1 : filiation) ─────
// Un document peut être une NOUVELLE VERSION d'un autre. Tous les documents d'un
// même fil partagent `lineage_id` (l'id du document racine). `parent_document_id`
// relie chaque version à son prédécesseur direct (arbre, pour gérer les branches :
// une même v2 renvoyée différemment par plusieurs investisseurs). `origin` dit qui
// a produit la version : le fondateur, un investisseur ou l'avocat. Les échanges
// « reçu de / envoyé à » sont consignés dans saas_doc_transmissions.
const DOC_ORIGINS = new Set(['founder', 'investor', 'lawyer']);
const DOC_VERSION_TYPES = new Set(['counterproposal', 'revision', 'signed']);

// Racine (lineage_id) d'un document parent ; null si le parent n'existe pas.
async function lineageRootOf(userId, parentId) {
  if (!parentId) return null;
  const parent = await col('saas_documents').findOne(
    { id: Number(parentId), user_id: userId },
    { projection: { id: 1, lineage_id: 1 } }
  );
  if (!parent) return null;
  return parent.lineage_id || parent.id;
}

// Empêche un cycle : le parent proposé ne doit pas déjà descendre du document.
async function wouldCreateCycle(userId, docId, parentId) {
  let cur = Number(parentId);
  const seen = new Set();
  while (cur) {
    if (cur === Number(docId)) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    const p = await col('saas_documents').findOne({ id: cur, user_id: userId }, { projection: { parent_document_id: 1 } });
    cur = p && p.parent_document_id ? Number(p.parent_document_id) : 0;
  }
  return false;
}

// Normalise la provenance transmise par le client vers { origin, origin_party_id }.
async function resolveOrigin(userId, originRaw, partyIdRaw) {
  const origin = String(originRaw || 'founder');
  if (!DOC_ORIGINS.has(origin) || origin === 'founder') return { origin: 'founder', origin_party_id: null };
  const pid = partyIdRaw ? Number(partyIdRaw) : null;
  if (origin === 'investor') {
    if (pid && await col('saas_investors').findOne({ id: pid, user_id: userId })) return { origin, origin_party_id: pid };
    // La provenance reste utile à l'arbre des versions même si la fiche précise
    // de l'investisseur n'a pas encore été créée.
    return { origin: 'investor', origin_party_id: null };
  }
  // avocat : identité facultative (prestataire générique accepté)
  return { origin: 'lawyer', origin_party_id: pid || null };
}

// Consigne une transmission « reçu de » quand une version vient d'un tiers.
async function recordReceivedTransmission(userId, doc) {
  if (doc.origin !== 'investor' && doc.origin !== 'lawyer') return;
  await col('saas_doc_transmissions').insertOne({
    id: await nextId('saas_doc_transmissions'),
    user_id: userId, document_id: doc.id, lineage_id: doc.lineage_id,
    direction: 'received',
    counterparty_type: doc.origin, counterparty_id: doc.origin_party_id || null,
    date: doc.created_at, created_at: doc.created_at,
  });
}

// Consigne séparément un envoi déclaré par le fondateur. Le type de version
// (révision, contreproposition, version signée) ne présume jamais du sens de
// l'échange : une contreproposition peut partir ou revenir.
async function recordSentTransmission(userId, doc, recipientIdRaw) {
  const recipientId = Number(recipientIdRaw);
  if (!recipientId) return;
  const investor = await col('saas_investors').findOne(
    { id: recipientId, user_id: userId }, { projection: { id: 1, name: 1, firm: 1 } });
  if (!investor) return;
  await col('saas_doc_transmissions').insertOne({
    id: await nextId('saas_doc_transmissions'),
    user_id: userId, document_id: doc.id, lineage_id: doc.lineage_id,
    direction: 'sent', counterparty_type: 'investor', counterparty_id: investor.id,
    counterparty_label: investor.firm ? `${investor.name} — ${investor.firm}` : investor.name,
    date: doc.updated_at || doc.created_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
}

// ---- Suggestion de filiation (rattachement « nouvelle version de… ») ----
// Nom de fichier normalisé : retire extension, numéros de version, mentions
// « final / vf / copie », dates et séparateurs, pour comparer les intitulés.
function normalizeDocName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/\d{1,4}[-_/.]\d{1,2}[-_/.]\d{1,4}/g, ' ')
    .replace(/\bv?\d+([.\-]\d+)*\b/g, ' ')
    .replace(/\b(final|def|definitif|vf|vdef|copie|copy|draft|brouillon|version|revised|revise|revisee|markup|clean|signe|signed|relu|relue)\b/g, ' ')
    .replace(/\(\s*\d+\s*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function nameTokenSet(name) {
  return new Set(normalizeDocName(name).split(' ').filter(w => w.length > 2));
}
function textTokenSet(text) {
  return new Set(String(text || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w.length > 3).slice(0, 4000));
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach(x => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}

// Suggestion RAPIDE (nom + étape + type, sans lire le contenu) : sert au nudge
// immédiat après import. La version enrichie par le contenu vit dans l'endpoint
// /version-suggestions (appelé à la demande).
async function heuristicParentSuggestions(userId, doc, limit = 3) {
  const L = doc.lineage_id || doc.id;
  const others = await col('saas_documents')
    .find({ user_id: userId, id: { $ne: doc.id } }, { projection: { _id: 0, id: 1, name: 1, folder_id: 1, kind: 1, originalname: 1, lineage_id: 1 } })
    .toArray();
  const myTokens = nameTokenSet(doc.name);
  const myType = doc.kind === 'termsheet' ? 'termsheet' : path.extname(doc.originalname || doc.name || '').toLowerCase();
  return others
    .filter(o => (o.lineage_id || o.id) !== L)
    .map(o => {
      const otype = o.kind === 'termsheet' ? 'termsheet' : path.extname(o.originalname || o.name || '').toLowerCase();
      const nsim = jaccard(myTokens, nameTokenSet(o.name));
      let score = 0; const reasons = [];
      if (nsim > 0) { score += nsim * 0.6; if (nsim >= 0.4) reasons.push('nom proche'); }
      if (doc.folder_id && o.folder_id === doc.folder_id) { score += 0.2; reasons.push('même étape'); }
      if (otype && otype === myType) { score += 0.1; reasons.push('même type'); }
      return { document_id: o.id, name: o.name, score, reasons };
    })
    .filter(s => s.score >= 0.3)   // seuil prudent : on ne propose que du plausible
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Candidats « ce document est probablement une nouvelle version de… ». Combine des
// heuristiques (nom, étape, type) et la similarité de CONTENU (texte extrait, déjà
// mis en cache pour la comparaison IA). Ne décide jamais : propose, l'utilisateur confirme.
app.get('/api/saas/documents/:id/version-suggestions', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id }, { projection: { data: 0 } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const L = doc.lineage_id || doc.id;
  const others = await col('saas_documents')
    .find({ user_id: req.user.id, id: { $ne: id } }, { projection: { data: 0, html: 0, extracted_text: 0 } })
    .toArray();
  // On ne propose pas un document déjà dans la même lignée.
  const candidates = others.filter(o => (o.lineage_id || o.id) !== L);
  const myTokens = nameTokenSet(doc.name);
  const myType = doc.kind === 'termsheet' ? 'termsheet' : path.extname(doc.originalname || doc.name || '').toLowerCase();

  let scored = candidates.map(o => {
    const otype = o.kind === 'termsheet' ? 'termsheet' : path.extname(o.originalname || o.name || '').toLowerCase();
    const nsim = jaccard(myTokens, nameTokenSet(o.name));
    let score = 0; const reasons = [];
    if (nsim > 0) { score += nsim * 0.6; if (nsim >= 0.4) reasons.push('nom proche'); }
    if (doc.folder_id && o.folder_id === doc.folder_id) { score += 0.2; reasons.push('même étape'); }
    if (otype && otype === myType) { score += 0.1; reasons.push('même type'); }
    return { document_id: o.id, name: o.name, score, reasons, folder_id: o.folder_id || null };
  }).sort((a, b) => b.score - a.score).slice(0, 8);

  // Affinage par le contenu : sur la petite liste de tête, on compare le texte réel.
  // Coûteux (extraction), donc limité aux 5 meilleurs candidats.
  try {
    const myText = await docPlainText(doc);
    const myTextTokens = textTokenSet(myText);
    if (myTextTokens.size) {
      for (const s of scored.slice(0, 5)) {
        const cand = candidates.find(c => c.id === s.document_id);
        const ctext = await docPlainText(cand);
        const tsim = jaccard(myTextTokens, textTokenSet(ctext));
        if (tsim > 0) {
          s.score += tsim * 0.8;
          if (tsim >= 0.35 && !s.reasons.includes('contenu proche')) s.reasons.push('contenu proche');
        }
      }
    }
  } catch (e) { /* contenu illisible : on garde le score heuristique */ }

  scored = scored.filter(s => s.score > 0.15).sort((a, b) => b.score - a.score).slice(0, 5);
  res.json({ suggestions: scored });
});

// Thread complet de la lignée d'un document : documents rattachés + instantanés de
// l'éditeur + transmissions, avec les libellés des acteurs. Sert au bouton
// « Versions » (portion d'arbre d'un fichier) et, plus tard, à l'arbre global.
app.get('/api/saas/documents/:id/lineage', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id }, { projection: { data: 0, html: 0, extracted_text: 0 } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  const L = doc.lineage_id || doc.id;
  const docsInLineage = await col('saas_documents')
    .find({ user_id: req.user.id, $or: [{ lineage_id: L }, { id: L }] }, { projection: { data: 0, html: 0, extracted_text: 0 } })
    .toArray();
  const docIds = docsInLineage.map(d => d.id);
  const [snapshots, transmissions, investors] = await Promise.all([
    col('saas_doc_versions').find({ user_id: req.user.id, document_id: { $in: docIds } },
      { projection: { _id: 0, id: 1, document_id: 1, label: 1, created_at: 1, size: 1 } }).toArray(),
    col('saas_doc_transmissions').find({ user_id: req.user.id, document_id: { $in: docIds } },
      { projection: { _id: 0 } }).toArray(),
    col('saas_investors').find({ user_id: req.user.id }, { projection: { _id: 0, id: 1, name: 1, firm: 1 } }).toArray(),
  ]);

  const docNodes = docsInLineage.map(d => ({
    node_type: 'document', doc_id: d.id, kind: d.kind === 'termsheet' ? 'termsheet' : 'file',
    name: d.name, created_at: d.created_at, date: d.updated_at || d.created_at,
    parent_document_id: d.parent_document_id || null,
    version_type: DOC_VERSION_TYPES.has(d.version_type) ? d.version_type : (d.parent_document_id ? 'revision' : null),
    origin: d.origin || 'founder', origin_party_id: d.origin_party_id || null,
    is_root: (d.lineage_id || d.id) === L && (!d.parent_document_id),
  }));
  const snapNodes = snapshots.map(s => ({
    node_type: 'snapshot', version_id: s.id, doc_id: s.document_id,
    name: s.label || '', created_at: s.created_at, date: s.created_at,
    parent_document_id: s.document_id, origin: 'founder', origin_party_id: null, size: s.size,
  }));
  res.json({
    lineage_id: L, focus_id: id,
    nodes: [...docNodes, ...snapNodes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    transmissions, investors,
  });
});

// Carte globale, strictement limitée au compte connecté : toutes les lignées,
// leurs instantanés enregistrés et les événements d'envoi/réception. L'outil
// Comparer l'utilise pour afficher une forêt complète en une seule requête.
app.get('/api/saas/document-lineages', requireAuth, async (req, res) => {
  const [documents, snapshots, transmissions, investors, folders] = await Promise.all([
    col('saas_documents').find(
      { user_id: req.user.id },
      { projection: { _id: 0, user_id: 0, data: 0, html: 0, extracted_text: 0, filename: 0 } },
    ).toArray(),
    col('saas_doc_versions').find(
      { user_id: req.user.id }, { projection: { _id: 0, user_id: 0, html: 0 } },
    ).toArray(),
    col('saas_doc_transmissions').find(
      { user_id: req.user.id }, { projection: { _id: 0, user_id: 0 } },
    ).sort({ date: 1, created_at: 1 }).toArray(),
    col('saas_investors').find(
      { user_id: req.user.id }, { projection: { _id: 0, id: 1, name: 1, firm: 1 } },
    ).toArray(),
    col('saas_folders').find(
      { user_id: req.user.id }, { projection: { _id: 0, id: 1, name: 1 } },
    ).toArray(),
  ]);
  const docIds = new Set(documents.map(d => d.id));
  const docById = new Map(documents.map(d => [d.id, d]));
  const nodes = documents.map(d => ({
    node_type: 'document', doc_id: d.id, lineage_id: d.lineage_id || d.id,
    kind: d.kind === 'termsheet' ? 'termsheet' : 'file',
    name: d.name, created_at: d.created_at, date: d.updated_at || d.created_at,
    parent_document_id: d.parent_document_id || null,
    version_type: DOC_VERSION_TYPES.has(d.version_type) ? d.version_type : (d.parent_document_id ? 'revision' : null),
    origin: d.origin || 'founder', origin_party_id: d.origin_party_id || null,
    folder_id: d.folder_id || null,
  }));
  snapshots.filter(s => docIds.has(s.document_id)).forEach(s => {
    const owner = docById.get(s.document_id);
    nodes.push({
      node_type: 'snapshot', version_id: s.id, doc_id: s.document_id,
      lineage_id: (owner && owner.lineage_id) || s.document_id,
      name: s.label || '', created_at: s.created_at, date: s.created_at,
      parent_document_id: s.document_id, version_type: 'snapshot',
      origin: 'founder', origin_party_id: null, size: s.size,
    });
  });
  res.json({
    nodes: nodes.sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date)),
    transmissions, investors, folders,
  });
});

// Rattache (ou détache) un document à une lignée + fixe sa provenance. Sert à
// corriger/confirmer après import (flux « nouvelle version de… »).
app.patch('/api/saas/documents/:id/lineage', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id }, { projection: { data: 0, html: 0 } });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const detach = req.body?.detach === true || req.body?.parent_document_id === null;
  if (detach) {
    // Le document redevient une racine indépendante. (Ses éventuels descendants
    // gardent leur lineage_id actuel ; en Phase 1 le détachement vise un document
    // fraîchement importé, sans descendance.)
    await col('saas_documents').updateOne(
      { id, user_id: req.user.id },
      { $set: { lineage_id: id }, $unset: { parent_document_id: '', origin: '', origin_party_id: '', version_type: '' } }
    );
    await col('saas_doc_transmissions').deleteMany({ user_id: req.user.id, document_id: id, direction: 'received' });
    return res.json({ success: true, lineage_id: id });
  }

  const parentId = Number(req.body?.parent_document_id);
  if (!parentId || parentId === id) return res.status(400).json({ error: 'Parent invalide.' });
  const root = await lineageRootOf(req.user.id, parentId);
  if (!root) return res.status(404).json({ error: 'Document parent introuvable.' });
  if (await wouldCreateCycle(req.user.id, id, parentId))
    return res.status(400).json({ error: 'Rattachement impossible : cela créerait une boucle.' });

  const { origin, origin_party_id } = await resolveOrigin(req.user.id, req.body?.origin, req.body?.origin_party_id);
  const versionType = DOC_VERSION_TYPES.has(String(req.body?.version_type || ''))
    ? String(req.body.version_type) : 'revision';
  // Toute la sous-lignée du document rejoint la racine du parent.
  const oldRoot = doc.lineage_id || doc.id;
  await col('saas_documents').updateMany(
    { user_id: req.user.id, $or: [{ lineage_id: oldRoot }, { id: oldRoot }] },
    { $set: { lineage_id: root } }
  );
  await col('saas_documents').updateOne(
    { id, user_id: req.user.id },
    { $set: { lineage_id: root, parent_document_id: parentId, origin, origin_party_id, version_type: versionType } }
  );
  await col('saas_doc_transmissions').deleteMany({ user_id: req.user.id, document_id: id });
  await recordReceivedTransmission(req.user.id, { id, lineage_id: root, origin, origin_party_id, created_at: doc.created_at || new Date().toISOString() });
  if (origin === 'founder') await recordSentTransmission(req.user.id, { id, lineage_id: root, created_at: doc.created_at }, req.body?.sent_to_party_id);
  res.json({ success: true, lineage_id: root, parent_document_id: parentId, origin, origin_party_id, version_type: versionType });
});

function googleDocIdFromShortcut(file) {
  let shortcut;
  try { shortcut = JSON.parse(file.buffer.toString('utf8')); }
  catch { return null; }
  const directId = String(shortcut.doc_id || shortcut.resource_id || '').replace(/^document:/, '').trim();
  if (/^[\w-]{10,}$/.test(directId)) return directId;
  const url = String(shortcut.url || '');
  const match = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/i);
  return match ? match[1] : null;
}

// Un fichier .gdoc n'embarque pas le document : c'est un petit raccourci JSON.
// On exporte donc le document Google en DOCX avec le compte Drive connecté avant
// de le stocker, afin que le téléchargement et les fonctions IA restent utiles.
async function materializeGoogleDocUpload(file, userId) {
  if (path.extname(file.originalname || '').toLowerCase() !== '.gdoc') return file;
  const fileId = googleDocIdFromShortcut(file);
  if (!fileId) {
    const err = new Error('Ce raccourci Google Docs est invalide. Ouvrez le document dans Google Docs puis téléchargez-le en Word (.docx) ou OpenDocument (.odt).');
    err.status = 422;
    throw err;
  }
  const connection = await col('saas_dataroom_connections').findOne({
    user_id: userId, provider: 'google_drive', status: { $ne: 'disabled' },
  });
  if (!connection) {
    const err = new Error('Pour importer un fichier .gdoc, connectez d’abord votre compte Google Drive depuis Mon compte. Vous pouvez aussi télécharger le document en .docx ou .odt depuis Google Docs.');
    err.status = 422;
    throw err;
  }
  try {
    const drive = await driveClientFor(connection);
    const response = await drive.files.export(
      { fileId, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(response.data);
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) {
      const err = new Error('Le document Google exporté est vide ou dépasse la limite de 15 Mo. Téléchargez-le manuellement en .docx ou .odt avant de l’importer.');
      err.status = 422;
      throw err;
    }
    file.buffer = buffer;
    file.size = buffer.length;
    file.originalname = file.originalname.replace(/\.gdoc$/i, '.docx');
    file.mimetype = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return file;
  } catch (error) {
    if (error.status === 422) throw error;
    const err = new Error('Impossible de lire ce Google Docs avec le compte Drive connecté. Reconnectez Google Drive, vérifiez vos droits d’accès, ou téléchargez le document en .docx/.odt.');
    err.status = 422;
    throw err;
  }
}

app.post('/api/saas/documents', requireAuth, saasUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu ou format non supporté (max 15 Mo)' });
  try { await materializeGoogleDocUpload(req.file, req.user.id); }
  catch (error) { return res.status(error.status || 422).json({ error: error.message }); }
  const id  = await nextId('saas_documents');
  const doc = {
    id, user_id: req.user.id,
    name: (req.body.name || req.file.originalname).trim(),
    originalname: req.file.originalname,
    mimetype: req.file.mimetype, size: req.file.size,
    data: req.file.buffer,     // binaire stocké dans MongoDB Atlas
    created_at: new Date().toISOString(),
  };
  if (req.body.folder_id) {
    const folderId = Number(req.body.folder_id);
    if (await col('saas_folders').findOne({ id: folderId, user_id: req.user.id })) {
      doc.folder_id = folderId;
      const categoryKey = (req.body.category_key || '').toString().trim().slice(0, 80);
      if (categoryKey) doc.category_key = categoryKey;
    }
  }
  // Filiation optionnelle : ce fichier est une nouvelle version d'un document
  // existant (envoyé/reçu). On hérite alors de la lignée du parent et on note la
  // provenance (créé par vous / reçu d'un investisseur / de l'avocat).
  const parentId = req.body.parent_document_id ? Number(req.body.parent_document_id) : null;
  const root = parentId ? await lineageRootOf(req.user.id, parentId) : null;
  if (parentId && !root) return res.status(400).json({ error: 'Document parent introuvable.' });
  if (root) { doc.parent_document_id = parentId; doc.lineage_id = root; }
  else { doc.lineage_id = doc.id; }        // racine d'un nouveau fil
  const { origin, origin_party_id } = await resolveOrigin(req.user.id, req.body.origin, req.body.origin_party_id);
  const versionType = DOC_VERSION_TYPES.has(String(req.body.version_type || ''))
    ? String(req.body.version_type) : (parentId ? 'revision' : null);
  doc.origin = origin;
  if (versionType) doc.version_type = versionType;
  if (origin_party_id != null) doc.origin_party_id = origin_party_id;

  await col('saas_documents').insertOne(doc);
  await recordReceivedTransmission(req.user.id, doc);
  if (origin === 'founder') await recordSentTransmission(req.user.id, doc, req.body.sent_to_party_id);

  // Si l'utilisateur n'a PAS déjà rattaché ce fichier, on propose un nudge : ce
  // document ressemble-t-il à un existant ? (heuristique rapide, confirmation côté
  // client via PATCH /lineage). Ne bloque jamais l'import en cas d'échec.
  let versionSuggestions = [];
  if (!parentId) {
    try { versionSuggestions = await heuristicParentSuggestions(req.user.id, doc, 2); }
    catch { versionSuggestions = []; }
  }
  res.status(201).json({ document: publicDoc(doc), versionSuggestions });
});

// ─── SaaS : checklist de due diligence envoyée par l'investisseur ────────────
// Les deux étapes de due diligence ne contiennent volontairement aucun document
// par défaut. Le fondateur importe la request list de l'investisseur ; son texte
// devient alors la seule checklist affichée et la seule source de modèles proposés.
const INVESTOR_CHECKLIST_FOLDER_KEYS = new Set(['due-diligence-preliminaire', 'due-diligence']);

function checklistSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isChecklistHeading(value) {
  const line = String(value || '').trim();
  if (!line) return true;
  if (/[:：]$/.test(line) && line.length < 120) return true;
  return /^(?:checklist|request\s*list|liste\s+des\s+(?:documents|demandes)|documents?\s+(?:demandés|requis)|due\s+diligence|annexe|section|sommaire|table\s+des\s+matières|corporate|finance|financial|fiscal(?:ité)?|social|rh|commercial|contrats?|propriété\s+intellectuelle|pi|données|rgpd|contentieux|litiges?)$/i.test(line);
}

// Extraction volontairement déterministe : le fondateur reste maître de la liste
// réellement reçue, sans dépendre d'un appel IA ni d'un modèle générique.
function investorChecklistItemsFromText(text) {
  const raw = String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[•▪◦●]/g, '\n• ')
    .replace(/\s+(?=(?:\d{1,3}[.)]|[a-zA-Z][.)]|\[[ xX]?\])\s+)/g, '\n');
  const seen = new Set();
  const items = [];

  raw.split(/\n+/).forEach(source => {
    let item = source
      .replace(/^\s*(?:[•▪◦●\-–—]+|\[[ xX]?\]|\(?\d{1,3}(?:\.\d+)*[.)]|[a-zA-Z][.)])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (item.length < 3 || item.length > 320 || isChecklistHeading(item)) return;
    // Les en-têtes et notes de bas de page fréquents ne sont pas des pièces à fournir.
    if (/^(?:page\s+\d+|confidentiel|strictement\s+confidentiel|prepared\s+for|préparé\s+pour)\b/i.test(item)) return;
    const key = checklistSlug(item);
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  });
  return items.slice(0, 160);
}

const MAX_INVESTOR_CHECKLISTS = 20;

// Compatibilité avec l'ancien modèle : avant les checklists multiples, une
// étape ne conservait que le document source et la liste extraite. Cette entrée
// synthétique permet de préserver cette première checklist quand une seconde
// est ajoutée après la migration.
function investorChecklistsForFolder(folder) {
  const current = Array.isArray(folder?.investor_checklists) ? folder.investor_checklists : [];
  if (current.length) return current;
  if (folder?.checklist_origin !== 'investor' || folder.investor_checklist_document_id == null) return [];

  const items = Array.isArray(folder.checklist)
    ? folder.checklist.filter(item => !!checklistSlug(item))
    : [];
  return [{
    id: 1,
    name: '',
    document_id: Number(folder.investor_checklist_document_id),
    created_at: folder.checklist_updated_at || folder.created_at || '',
    items,
    item_slugs: items.map(checklistSlug),
  }];
}

// Identifiant stable d'une checklist investisseur au sein d'un dossier.
function nextInvestorChecklistId(list) {
  return (Array.isArray(list) ? list : [])
    .reduce((max, c) => Math.max(max, Number(c && c.id) || 0), 0) + 1;
}

// Roadlist fusionnée (union dédupliquée par slug, dans l'ordre d'import des
// checklists) à partir des checklists investisseurs conservées. Chaque ligne
// n'apparaît qu'une fois même si plusieurs investisseurs la demandent : la
// provenance (« demandé par ») est portée par investor_checklists[].item_slugs.
function mergedInvestorChecklist(investorChecklists) {
  const seen = new Set();
  const checklist = [];
  (investorChecklists || []).forEach(c => {
    (c.items || []).forEach(item => {
      const slug = checklistSlug(item);
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      checklist.push(item);
    });
  });
  return { checklist, marks: checklist.map(() => '') };
}

// Nettoie items_state après un changement de checklists : ne garde que les
// slugs encore demandés et purge les références « envoyé à » vers des
// investisseurs supprimés.
function pruneInvestorItemsState(itemsState, allowedSlugs, allowedChecklistIds) {
  const out = {};
  for (const [slug, st] of Object.entries(itemsState || {})) {
    if (!allowedSlugs.has(slug)) continue;
    if (Array.isArray(st.sent)) {
      const sent = st.sent.filter(cid => allowedChecklistIds.has(Number(cid)));
      out[slug] = sent.length === st.sent.length ? st : { ...st, sent };
    } else {
      out[slug] = st;
    }
  }
  return out;
}

app.post('/api/saas/folders/:id/investor-checklist', requireAuth, saasUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Importez la checklist de l’investisseur au format PDF, Word, OpenDocument ou Excel (max. 15 Mo).' });

  const id = Number(req.params.id);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!INVESTOR_CHECKLIST_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Cette action est réservée aux étapes de due diligence.' });

  const existing = investorChecklistsForFolder(folder);
  if (existing.length >= MAX_INVESTOR_CHECKLISTS)
    return res.status(409).json({ error: `Vous ne pouvez pas dépasser ${MAX_INVESTOR_CHECKLISTS} checklists sur une étape.` });

  try { await materializeGoogleDocUpload(req.file, req.user.id); }
  catch (error) { return res.status(error.status || 422).json({ error: error.message }); }

  const sourceExt = path.extname(req.file.originalname || '').toLowerCase();
  if (!['.pdf', '.doc', '.docx', '.odt', '.xlsx'].includes(sourceExt))
    return res.status(422).json({ error: 'La checklist doit être un PDF, un document Word/OpenDocument ou un fichier Excel (.xlsx) lisible.' });

  const now = new Date().toISOString();
  const investorName = shortText(req.body?.investor_name, 120);
  const doc = {
    id: await nextId('saas_documents'), user_id: req.user.id,
    name: (req.body?.name || req.file.originalname).trim(),
    originalname: req.file.originalname,
    mimetype: req.file.mimetype, size: req.file.size, data: req.file.buffer,
    folder_id: id, is_investor_checklist: true,
    checklist_phase_key: folder.key, created_at: now,
  };
  await col('saas_documents').insertOne(doc);

  const extracted = await extractImportedText(doc);
  const items = investorChecklistItemsFromText(extracted);
  if (!items.length) {
    await col('saas_documents').deleteOne({ id: doc.id, user_id: req.user.id });
    return res.status(422).json({ error: 'La liste de documents n’a pas pu être lue. Importez un PDF, Word, OpenDocument ou Excel contenant une liste sélectionnable.' });
  }

  // Nouvelle checklist ajoutée à la suite des précédentes (jamais un remplacement) :
  // chaque investisseur garde sa liste et son nom, la roadlist affichée est l'union.
  const entry = {
    id: nextInvestorChecklistId(existing),
    name: investorName,
    document_id: doc.id,
    created_at: now,
    items,
    item_slugs: items.map(checklistSlug),
  };
  const investorChecklists = [...existing, entry];
  const merged = mergedInvestorChecklist(investorChecklists);
  const allowedSlugs = new Set(merged.checklist.map(checklistSlug));
  const allowedIds = new Set(investorChecklists.map(c => Number(c.id)));
  const itemsState = pruneInvestorItemsState(folder.items_state, allowedSlugs, allowedIds);
  const update = {
    checklist: merged.checklist,
    marks: merged.marks,
    items_state: itemsState,
    investor_checklists: investorChecklists,
    investor_checklist_document_id: doc.id,
    checklist_origin: 'investor',
    checklist_updated_at: now,
  };
  // La request list devient la source de vérité : le mode temporaire « modèles
  // Liquid+ » est automatiquement désactivé sans supprimer les documents créés.
  await col('saas_folders').updateOne(
    { id, user_id: req.user.id },
    { $set: update, $unset: { dd_fallback_models: '', dd_fallback_scope: '' } },
  );
  const saved = await col('saas_folders').findOne({ id, user_id: req.user.id });
  res.status(201).json({ folder: publicFolder(saved), document: publicDoc(doc), items, checklist_id: entry.id });
});

// Renomme l'investisseur associé à une checklist importée.
app.patch('/api/saas/folders/:id/investor-checklist/:checklistId', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const cid = Number(req.params.checklistId);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!INVESTOR_CHECKLIST_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Cette action est réservée aux étapes de due diligence.' });
  const list = Array.isArray(folder.investor_checklists) ? folder.investor_checklists : [];
  if (!list.some(c => Number(c.id) === cid))
    return res.status(404).json({ error: 'Checklist introuvable.' });

  const name = shortText(req.body?.name, 120);
  const next = list.map(c => (Number(c.id) === cid ? { ...c, name } : c));
  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { investor_checklists: next } });
  const saved = await col('saas_folders').findOne({ id, user_id: req.user.id });
  res.json({ success: true, folder: publicFolder(saved) });
});

// Retire une checklist investisseur : la roadlist est recalculée sur les
// checklists restantes (les lignes que plus personne ne demande disparaissent),
// et le fichier source est supprimé.
app.delete('/api/saas/folders/:id/investor-checklist/:checklistId', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const cid = Number(req.params.checklistId);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!INVESTOR_CHECKLIST_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Cette action est réservée aux étapes de due diligence.' });
  const list = Array.isArray(folder.investor_checklists) ? folder.investor_checklists : [];
  const entry = list.find(c => Number(c.id) === cid);
  if (!entry) return res.status(404).json({ error: 'Checklist introuvable.' });

  if (entry.document_id != null) {
    await col('saas_documents').deleteOne({ id: entry.document_id, user_id: req.user.id });
    await col('saas_doc_versions').deleteMany({ user_id: req.user.id, document_id: entry.document_id });
  }

  const remaining = list.filter(c => Number(c.id) !== cid);
  const now = new Date().toISOString();
  if (!remaining.length) {
    // Plus aucune checklist : l'étape revient à son état initial (aucune pièce ni
    // modèle proposé par défaut), comme après la suppression de la dernière request list.
    await col('saas_folders').updateOne(
      { id, user_id: req.user.id },
      {
        $set: { checklist: [], marks: [], items_state: {} },
        $unset: {
          investor_checklists: '', investor_checklist_document_id: '',
          checklist_origin: '', checklist_updated_at: '', dd_fallback_models: '',
          dd_fallback_scope: '',
        },
      },
    );
  } else {
    const merged = mergedInvestorChecklist(remaining);
    const allowedSlugs = new Set(merged.checklist.map(checklistSlug));
    const allowedIds = new Set(remaining.map(c => Number(c.id)));
    const itemsState = pruneInvestorItemsState(folder.items_state, allowedSlugs, allowedIds);
    await col('saas_folders').updateOne(
      { id, user_id: req.user.id },
      {
        $set: {
          checklist: merged.checklist, marks: merged.marks, items_state: itemsState,
          investor_checklists: remaining,
          investor_checklist_document_id: remaining[remaining.length - 1].document_id,
          checklist_origin: 'investor', checklist_updated_at: now,
        },
      },
    );
  }
  const saved = await col('saas_folders').findOne({ id, user_id: req.user.id });
  res.json({ success: true, folder: publicFolder(saved) });
});

// Marque (ou annule) l'envoi d'un document à un investisseur donné, pour suivre
// « ce qu'il reste à envoyer et à qui ».
app.put('/api/saas/folders/:id/checklist-item-sent', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!INVESTOR_CHECKLIST_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Cette action est réservée aux étapes de due diligence.' });

  const slug = checklistSlug(req.body?.slug);
  const cid  = Number(req.body?.checklist_id);
  const sent = !!req.body?.sent;
  if (!slug || !cid) return res.status(400).json({ error: 'Requête incomplète.' });
  if (!(folder.checklist || []).some(it => checklistSlug(it) === slug))
    return res.status(404).json({ error: 'Élément introuvable sur cette étape.' });
  if (!(folder.investor_checklists || []).some(c => Number(c.id) === cid))
    return res.status(404).json({ error: 'Investisseur introuvable sur cette étape.' });

  const state = { ...(folder.items_state || {}) };
  const cur   = { ...(state[slug] || {}) };
  const arr   = Array.isArray(cur.sent) ? cur.sent.map(Number).filter(Number.isFinite) : [];
  const has   = arr.includes(cid);
  if (sent && !has) arr.push(cid);
  if (!sent && has) arr.splice(arr.indexOf(cid), 1);
  cur.sent = arr;
  state[slug] = cur;
  await col('saas_folders').updateOne({ id, user_id: req.user.id }, { $set: { items_state: state } });

  // Le statut de checklist alimente également le journal factuel des échanges.
  // On conserve le destinataire lisible même si aucune fiche investisseur formelle
  // ne lui correspond encore dans le pipeline.
  const sourceKey = `${id}:${slug}:${cid}`;
  await col('saas_doc_transmissions').deleteMany({
    user_id: req.user.id, direction: 'sent', source: 'investor_checklist', source_key: sourceKey,
  });
  if (sent && cur.document_id != null) {
    const checklist = (folder.investor_checklists || []).find(c => Number(c.id) === cid);
    const label = shortText(checklist && checklist.name, 120) || 'un investisseur';
    const investor = await col('saas_investors').findOne({
      user_id: req.user.id,
      $or: [{ name: label }, { firm: label }],
    }, { projection: { id: 1, name: 1, firm: 1 } });
    const document = await col('saas_documents').findOne(
      { id: Number(cur.document_id), user_id: req.user.id },
      { projection: { id: 1, lineage_id: 1 } });
    if (document) {
      const now = new Date().toISOString();
      await col('saas_doc_transmissions').insertOne({
        id: await nextId('saas_doc_transmissions'), user_id: req.user.id,
        document_id: document.id, lineage_id: document.lineage_id || document.id,
        direction: 'sent', counterparty_type: 'investor',
        counterparty_id: investor ? investor.id : null,
        counterparty_label: investor
          ? (investor.firm ? `${investor.name} — ${investor.firm}` : investor.name)
          : label,
        source: 'investor_checklist', source_key: sourceKey,
        date: now, created_at: now,
      });
    }
  }
  const saved = await col('saas_folders').findOne({ id, user_id: req.user.id });
  res.json({ success: true, folder: publicFolder(saved) });
});

// Active ou masque, à la demande du fondateur, la checklist exhaustive de
// préparation Liquid+ en attendant la request list de l'investisseur. Les
// documents déjà générés restent dans le dossier ; seul leur affichage change.
app.put('/api/saas/folders/:id/dd-fallback', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const folder = await col('saas_folders').findOne({ id, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!INVESTOR_CHECKLIST_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Cette action est réservée aux étapes de due diligence.' });
  if (folder.checklist_origin === 'investor' && folder.investor_checklist_document_id != null)
    return res.status(409).json({ error: 'La checklist de l’investisseur est déjà la source de vérité pour cette étape.' });

  const enabled = !!req.body?.enabled;
  const scopeRaw = String(req.body?.scope || 'all');
  const scope = ['all', 'required', 'optional'].includes(scopeRaw) ? scopeRaw : 'all';
  await col('saas_folders').updateOne(
    { id, user_id: req.user.id },
    enabled
      ? { $set: { dd_fallback_models: true, dd_fallback_scope: scope } }
      : { $unset: { dd_fallback_models: '', dd_fallback_scope: '' } },
  );
  const saved = await col('saas_folders').findOne({ id, user_id: req.user.id });
  res.json({ success: true, folder: publicFolder(saved) });
});

app.get('/api/saas/documents/:id/download', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  // Term sheet : pas de fichier binaire, on génère un HTML téléchargeable.
  if (doc.kind === 'termsheet') {
    if (!doc.html) return res.status(404).json({ error: 'Document vide.' });
    const baseName = (doc.name || 'document').replace(/\.[^.]+$/, '');
    const html = buildExportHtml(doc.html, baseName);
    const filename = encodeURIComponent(baseName + '.html');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
    return res.send(html);
  }

  const buf = toBuffer(doc.data);
  if (!buf) return res.status(404).json({ error: 'Fichier introuvable' });

  const filename = encodeURIComponent(doc.originalname || doc.name || 'document');
  res.setHeader('Content-Type', doc.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
  res.setHeader('Content-Length', buf.length);
  res.send(buf);
});

app.delete('/api/saas/documents/:id', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  await col('saas_documents').deleteOne({ id, user_id: req.user.id });
  // Purge les versions validées de ce document (stockées à part).
  await col('saas_doc_versions').deleteMany({ user_id: req.user.id, document_id: id });
  // Purge les échanges consignés pour ce document.
  await col('saas_doc_transmissions').deleteMany({ user_id: req.user.id, document_id: id });
  // Reparente les enfants directs sur le parent du document supprimé (on ne casse
  // pas le fil) ; s'il était racine, ils deviennent chacun leur propre racine.
  const grandParent = doc.parent_document_id || null;
  if (grandParent) {
    await col('saas_documents').updateMany(
      { user_id: req.user.id, parent_document_id: id },
      { $set: { parent_document_id: grandParent } }
    );
  } else {
    const remainingLineage = await col('saas_documents')
      .find({ user_id: req.user.id, lineage_id: (doc.lineage_id || id), id: { $ne: id } },
        { projection: { _id: 0, id: 1, parent_document_id: 1 } }).toArray();
    const children = remainingLineage.filter(d => d.parent_document_id === id);
    for (const c of children) {
      // Chaque enfant direct devient la racine de sa propre branche. On propage
      // cette nouvelle racine à tous ses descendants, pas seulement à l'enfant.
      const subtree = new Set([c.id]);
      let grew = true;
      while (grew) {
        grew = false;
        remainingLineage.forEach(d => {
          if (!subtree.has(d.id) && subtree.has(d.parent_document_id)) {
            subtree.add(d.id);
            grew = true;
          }
        });
      }
      await col('saas_documents').updateMany(
        { user_id: req.user.id, id: { $in: [...subtree] } },
        { $set: { lineage_id: c.id } }
      );
      await col('saas_documents').updateOne(
        { id: c.id, user_id: req.user.id },
        { $unset: { parent_document_id: '' } }
      );
    }
  }
  // Détache le document de toute checklist de phase qui le référence.
  const folders = await col('saas_folders').find({ user_id: req.user.id }).toArray();
  for (const f of folders) {
    // Suppression directe d'un fichier source de checklist investisseur : on
    // retire l'entrée correspondante et on recalcule la roadlist sur les
    // checklists restantes (ou on réinitialise l'étape s'il n'en reste aucune).
    const invList = Array.isArray(f.investor_checklists) ? f.investor_checklists : [];
    const removedEntry = invList.find(c => c.document_id === id);
    if (removedEntry || f.investor_checklist_document_id === id) {
      const remaining = invList.filter(c => c.document_id !== id);
      if (!remaining.length) {
        await col('saas_folders').updateOne(
          { id: f.id, user_id: req.user.id },
          {
            $set: { checklist: [], marks: [], items_state: {} },
            $unset: {
              investor_checklists: '', investor_checklist_document_id: '',
              checklist_origin: '', checklist_updated_at: '', dd_fallback_models: '',
              dd_fallback_scope: '',
            },
          },
        );
      } else {
        const merged = mergedInvestorChecklist(remaining);
        const allowedSlugs = new Set(merged.checklist.map(checklistSlug));
        const allowedIds = new Set(remaining.map(c => Number(c.id)));
        await col('saas_folders').updateOne(
          { id: f.id, user_id: req.user.id },
          {
            $set: {
              checklist: merged.checklist, marks: merged.marks,
              items_state: pruneInvestorItemsState(f.items_state, allowedSlugs, allowedIds),
              investor_checklists: remaining,
              investor_checklist_document_id: remaining[remaining.length - 1].document_id,
              checklist_origin: 'investor',
            },
          },
        );
      }
      continue;
    }
    if (!f.items_state) continue;
    let changed = false;
    const st = { ...f.items_state };
    for (const k of Object.keys(st)) {
      if (!st[k]) continue;
      if (st[k].document_id === id) { delete st[k]; changed = true; continue; }
      // Retire aussi ce document de l'historique des versions le cas échéant.
      if (Array.isArray(st[k].versions)) {
        const kept = st[k].versions.filter(v => v && v.document_id !== id);
        if (kept.length !== st[k].versions.length) {
          st[k] = { ...st[k], versions: kept };
          changed = true;
        }
      }
    }
    if (changed) await col('saas_folders').updateOne({ id: f.id, user_id: req.user.id }, { $set: { items_state: st } });
  }
  res.json({ success: true });
});

// Insère « (copie) » avant l'extension éventuelle (« contrat.pdf » → « contrat (copie).pdf »).
function duplicateDocName(name) {
  const s = String(name || 'Document').trim() || 'Document';
  const m = /^(.*?)(\.[a-z0-9]+)$/i.exec(s);
  return m ? `${m[1]} (copie)${m[2]}` : `${s} (copie)`;
}

// ─── SaaS : dupliquer un document ─────────────────────────────────────────────
// Crée une copie indépendante (term sheet éditable OU fichier importé) rangée dans
// le même dossier, jamais liée à un point de la roadlist : elle apparaît comme un
// « fichier libre ». Le nom reçoit le suffixe « (copie) ». La copie ne conserve ni
// le lien de modèle, ni l'historique de versions de l'original.
app.post('/api/saas/documents/:id/duplicate', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const src = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!src) return res.status(404).json({ error: 'Document introuvable' });

  const now   = new Date().toISOString();
  const newId = await nextId('saas_documents');

  // Term sheet : on recopie le HTML de travail (pas de binaire).
  if (src.kind === 'termsheet') {
    const html = src.html || '';
    const copy = {
      id: newId, user_id: req.user.id, kind: 'termsheet',
      name: duplicateDocName(src.name || 'Term sheet'),
      html, size: Buffer.byteLength(html, 'utf8'),
      created_at: now, updated_at: now,
    };
    if (src.folder_id != null) copy.folder_id = src.folder_id;
    if (src.category_key) copy.category_key = src.category_key;
    await col('saas_documents').insertOne(copy);
    return res.status(201).json({ document: publicDoc({ ...copy, html: undefined }) });
  }

  // Fichier importé : on recopie le binaire stocké en base.
  const buf = toBuffer(src.data);
  if (!buf) return res.status(404).json({ error: 'Fichier introuvable' });
  const copy = {
    id: newId, user_id: req.user.id,
    name: duplicateDocName(src.name || src.originalname || 'Document'),
    originalname: duplicateDocName(src.originalname || src.name || 'Document'),
    mimetype: src.mimetype, size: buf.length, data: buf,
    created_at: now,
  };
  if (src.folder_id != null) copy.folder_id = src.folder_id;
  if (src.category_key) copy.category_key = src.category_key;
  await col('saas_documents').insertOne(copy);
  res.status(201).json({ document: publicDoc(copy) });
});

// ─── SaaS : conversion PDF ⇄ DOCX via CloudConvert ────────────────────────────
async function convertViaCloudConvert(inputBuffer, inputFilename, outputFormat) {
  let job = await cloudConvert.jobs.create({
    tasks: {
      'upload-file':  { operation: 'import/upload' },
      'convert-file': { operation: 'convert', input: 'upload-file', output_format: outputFormat },
      'export-file':  { operation: 'export/url', input: 'convert-file' },
    },
  });
  const uploadTask = job.tasks.find(t => t.name === 'upload-file');
  // cloudconvert v3 ne sait pas deviner la taille d'un Readable : il faut la passer
  // explicitement (sinon : "Could not determine the number of bytes").
  const size = inputBuffer.length || inputBuffer.byteLength || inputBuffer.size;
  await cloudConvert.tasks.upload(uploadTask, Readable.from(inputBuffer), inputFilename, size);
  job = await cloudConvert.jobs.wait(job.id);
  const exportTask = job.tasks.find(t => t.name === 'export-file');
  if (!exportTask || exportTask.status !== 'finished' || !exportTask.result?.files?.length)
    throw new Error('export task non terminée');
  return exportTask.result.files[0]; // { filename, url, size }
}

async function downloadToBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`téléchargement échoué (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
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

  const srcExt = path.extname(doc.originalname || doc.name || '').toLowerCase();
  if (srcExt === '.' + target)
    return res.status(400).json({ error: `Ce document est déjà au format ${target.toUpperCase()}.` });

  const inputBuf = toBuffer(doc.data);
  if (!inputBuf) return res.status(404).json({ error: 'Fichier introuvable' });

  try {
    const out      = await convertViaCloudConvert(inputBuf, doc.originalname || doc.name, target);
    const baseName = (doc.name || doc.originalname || 'document').replace(/\.[^.]+$/, '');
    const fileBuf  = await downloadToBuffer(out.url);

    const newId  = await nextId('saas_documents');
    const newDoc = {
      id: newId, user_id: req.user.id,
      name: `${baseName}.${target}`, originalname: `${baseName}.${target}`,
      mimetype: target === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: fileBuf.length, data: fileBuf,
      created_at: new Date().toISOString(),
      converted_from: doc.id,
    };
    if (doc.folder_id != null) newDoc.folder_id = doc.folder_id;
    await col('saas_documents').insertOne(newDoc);
    res.status(201).json({ document: publicDoc(newDoc) });
  } catch (err) {
    console.error('CloudConvert error:', err.message);
    res.status(502).json({ error: 'La conversion a échoué. Réessayez.' });
  }
});

// ─── SaaS : data room externe (Google Drive / Dropbox / export ZIP) ──────────
// Envoi direct des fichiers de due diligence (préliminaire ou poussée) vers un
// compte cloud connecté par l'utilisateur, ou export ZIP pour les data rooms
// professionnelles (Datasite, Intralinks…) qui n'ont pas d'API self-service.
const DATAROOM_PROVIDERS = new Set(['google_drive', 'dropbox']);
const DATAROOM_ALLOWED_FOLDER_KEYS = new Set(['due-diligence-preliminaire', 'due-diligence']);

function dataroomProviderConfigured(provider) {
  return provider === 'google_drive' ? !!GOOGLE_DRIVE_CLIENT_ID : !!DROPBOX_APP_KEY;
}
function dataroomProviderLabel(provider) {
  return provider === 'google_drive' ? 'Google Drive' : 'Dropbox';
}
function sanitizePathPart(s, max = 120) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, max) || 'Dossier';
}
function publicDataroomConnection(c) {
  return { provider: c.provider, account_label: c.account_label, status: c.status || 'active', connected_at: c.connected_at };
}

// Fichiers « libres » d'une catégorie (même logique que looseDocsFor côté client) :
// rattachés au dossier + à la catégorie, pas une version archivée, pas déjà lié à
// un slot de checklist (sinon le fichier apparaît en double dans l'UI).
function isDataroomExportableDoc(doc) {
  // Un modèle vient des ressources statiques et n'entre dans les documents de
  // l'utilisateur qu'au moment où il est ouvert dans l'éditeur. Tant qu'il n'a
  // pas été modifié, ce n'est pas un document de data room.
  return !doc.is_version
    && !doc.is_investor_checklist
    && !(doc.kind === 'termsheet' && doc.template_source && doc.is_personalized === false);
}

async function dataroomLooseDocs(userId, folder, categoryKey) {
  const linkedIds = new Set(Object.values(folder.items_state || {}).map(s => s.document_id).filter(id => id != null));
  const key  = categoryKey || '';
  const docs = await col('saas_documents').find({ user_id: userId, folder_id: folder.id }).toArray();
  return docs.filter(d => isDataroomExportableDoc(d) && !linkedIds.has(d.id) && String(d.category_key || '') === key);
}

async function dataroomFolderDocs(userId, folder) {
  const docs = await col('saas_documents').find({ user_id: userId, folder_id: folder.id }).toArray();
  return docs.filter(isDataroomExportableDoc);
}

function dataroomZipCategory(folder, doc) {
  const linkedItem = Object.entries(folder.items_state || {})
    .find(([, state]) => Number(state?.document_id) === Number(doc.id));
  const key = linkedItem?.[0] || String(doc.category_key || '');
  const title = (folder.checklist || []).find(item => checklistSlug(item) === key);
  return sanitizePathPart(title || key || 'Fichiers généraux', 100);
}

// ─── État OAuth éphémère (10 min) : associe le `state` renvoyé par le fournisseur
// à l'utilisateur qui a initié la connexion (même rôle que totpSetupStore).
const dataroomOAuthState = new Map();
const DATAROOM_RETURN_PATHS = new Set(['/saas/tableau-de-bord.html', '/saas/data-room.html', '/saas/compte.html']);
function dataroomReturnPath(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, BASE_URL);
    return url.origin === new URL(BASE_URL).origin && DATAROOM_RETURN_PATHS.has(url.pathname)
      ? url.pathname
      : null;
  } catch { return null; }
}
function dataroomCallbackUrl(entry, params = {}) {
  const target = entry?.return_to || '/saas/data-room.html';
  const url = new URL(target, BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.pathname + url.search;
}

function createDataroomState(userId, provider, returnTo = null) {
  const state = crypto.randomBytes(24).toString('hex');
  dataroomOAuthState.set(state, { user_id: userId, provider, return_to: returnTo, created_at: Date.now() });
  return state;
}
function consumeDataroomState(state) {
  const entry = dataroomOAuthState.get(state);
  if (!entry) return null;
  dataroomOAuthState.delete(state);
  if (Date.now() - entry.created_at > 10 * 60 * 1000) return null; // expiré
  return entry;
}

function driveOAuthClient() {
  return new google.auth.OAuth2(GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, `${BASE_URL}/api/saas/dataroom/google_drive/callback`);
}

async function upsertDataroomConnection(userId, provider, { account_label, refresh_token }) {
  const now = new Date().toISOString();
  const set = { account_label, status: 'active', updated_at: now, refresh_token_enc: encryptSecret(refresh_token) };
  const existing = await col('saas_dataroom_connections').findOne({ user_id: userId, provider });
  if (existing) {
    await col('saas_dataroom_connections').updateOne({ id: existing.id }, { $set: set });
  } else {
    const id = await nextId('saas_dataroom_connections');
    await col('saas_dataroom_connections').insertOne({ id, user_id: userId, provider, connected_at: now, folder_map: {}, ...set });
  }
}

app.get('/api/saas/dataroom/connections', requireAuth, async (req, res) => {
  const rows = await col('saas_dataroom_connections').find({ user_id: req.user.id }).toArray();
  res.json({ connections: rows.map(publicDataroomConnection) });
});

app.get('/api/saas/dataroom/:provider/connect', requireAuth, (req, res) => {
  const provider = req.params.provider;
  if (!DATAROOM_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Fournisseur inconnu' });
  if (!dataroomProviderConfigured(provider))
    return res.status(503).json({ error: `Connexion ${dataroomProviderLabel(provider)} non configurée sur le serveur.` });

  const state = createDataroomState(req.user.id, provider, dataroomReturnPath(req.query.return_to));
  if (provider === 'google_drive') {
    const url = driveOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // force le renvoi d'un refresh_token à chaque connexion
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
      ],
      state,
    });
    return res.redirect(url);
  }
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY, response_type: 'code',
    redirect_uri: `${BASE_URL}/api/saas/dataroom/dropbox/callback`,
    token_access_type: 'offline', state,
  });
  res.redirect(`https://www.dropbox.com/oauth2/authorize?${params}`);
});

async function dropboxTokenExchange(params) {
  const body = new URLSearchParams({ ...params, client_id: DROPBOX_APP_KEY, client_secret: DROPBOX_APP_SECRET });
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.error || 'Échange de token Dropbox échoué');
  return data;
}

app.get('/api/saas/dataroom/:provider/callback', async (req, res) => {
  const provider = req.params.provider;
  const { code, state, error } = req.query;
  const entry = state ? consumeDataroomState(String(state)) : null;
  if (!DATAROOM_PROVIDERS.has(provider) || !entry || entry.provider !== provider)
    return res.redirect(dataroomCallbackUrl(null, { dataroom_error: 'state' }));
  if (error || !code)
    return res.redirect(dataroomCallbackUrl(entry, { dataroom_error: 'cancelled' }));

  try {
    if (provider === 'google_drive') {
      const oauth2Client = driveOAuthClient();
      const { tokens } = await oauth2Client.getToken(String(code));
      if (!tokens.refresh_token)
        return res.redirect(dataroomCallbackUrl(entry, { dataroom_error: 'no_refresh_token' }));
      oauth2Client.setCredentials(tokens);
      const { data: profile } = await google.oauth2({ version: 'v2', auth: oauth2Client }).userinfo.get();
      await upsertDataroomConnection(entry.user_id, provider, {
        account_label: profile.email || 'Compte Google Drive',
        refresh_token: tokens.refresh_token,
      });
    } else {
      const tokenData = await dropboxTokenExchange({
        code: String(code), grant_type: 'authorization_code',
        redirect_uri: `${BASE_URL}/api/saas/dataroom/dropbox/callback`,
      });
      if (!tokenData.refresh_token)
        return res.redirect(dataroomCallbackUrl(entry, { dataroom_error: 'no_refresh_token' }));
      const dbx = new Dropbox({ accessToken: tokenData.access_token, fetch });
      const account = await dbx.usersGetCurrentAccount();
      await upsertDataroomConnection(entry.user_id, provider, {
        account_label: account.result.email || 'Compte Dropbox',
        refresh_token: tokenData.refresh_token,
      });
    }
    res.redirect(dataroomCallbackUrl(entry, { dataroom_connected: provider }));
  } catch (err) {
    console.error(`Dataroom OAuth callback error (${provider}):`, err.message);
    res.redirect(dataroomCallbackUrl(entry, { dataroom_error: 'exchange_failed' }));
  }
});

app.delete('/api/saas/dataroom/connections/:provider', requireAuth, async (req, res) => {
  const provider = req.params.provider;
  if (!DATAROOM_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Fournisseur inconnu' });
  const conn = await col('saas_dataroom_connections').findOne({ user_id: req.user.id, provider });
  if (!conn) return res.status(404).json({ error: 'Aucune connexion à ce fournisseur' });

  // Révocation best-effort côté fournisseur : on ne bloque jamais la déconnexion locale dessus.
  try {
    const refreshToken = decryptSecret(conn.refresh_token_enc);
    if (provider === 'google_drive') {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST' });
    } else {
      const dbx = new Dropbox({ refreshToken, clientId: DROPBOX_APP_KEY, clientSecret: DROPBOX_APP_SECRET, fetch });
      await dbx.authTokenRevoke();
    }
  } catch (err) {
    console.error('Dataroom revoke error:', err.message);
  }
  await col('saas_dataroom_connections').deleteOne({ user_id: req.user.id, provider });
  res.json({ success: true });
});

// ─── Google Drive : résolution/cache des dossiers (Drive n'a pas de chemins,
// seulement des ID de parents — il faut les trouver ou les créer). Dropbox n'a
// pas besoin de cet équivalent : filesUpload crée les dossiers intermédiaires
// implicitement à partir d'un chemin.
async function driveClientFor(connection) {
  const oauth2Client = driveOAuthClient();
  oauth2Client.setCredentials({ refresh_token: decryptSecret(connection.refresh_token_enc) });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function resolveDriveFolder(drive, connection, pathParts) {
  let parentId = 'root';
  let pathKey  = '';
  const folderMap = { ...(connection.folder_map || {}) };
  let changed = false;
  for (const part of pathParts) {
    pathKey = pathKey ? `${pathKey}/${part}` : part;
    let folderId = folderMap[pathKey];
    if (folderId) {
      try {
        const { data } = await drive.files.get({ fileId: folderId, fields: 'id,trashed' });
        if (data.trashed) folderId = null;
      } catch { folderId = null; } // supprimé côté Drive entre-temps : on le recrée
    }
    if (!folderId) {
      const q = `name='${part.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const found = await drive.files.list({ q, fields: 'files(id,name)', spaces: 'drive' });
      if (found.data.files && found.data.files.length) {
        folderId = found.data.files[0].id;
      } else {
        const created = await drive.files.create({
          requestBody: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
          fields: 'id',
        });
        folderId = created.data.id;
      }
      folderMap[pathKey] = folderId;
      changed = true;
    }
    parentId = folderId;
  }
  if (changed) {
    await col('saas_dataroom_connections').updateOne({ id: connection.id }, { $set: { folder_map: folderMap, updated_at: new Date().toISOString() } });
  }
  return parentId;
}

function dataroomFileNameFor(doc) {
  if (doc.kind === 'termsheet') return `${(doc.name || 'document').replace(/\.[^.]+$/, '')}.html`;
  return doc.originalname || doc.name || 'document';
}
function dataroomFileBufferFor(doc) {
  if (doc.kind === 'termsheet') return Buffer.from(buildExportHtml(doc.html, (doc.name || 'document').replace(/\.[^.]+$/, '')), 'utf8');
  return toBuffer(doc.data);
}

async function uploadToDrive(drive, parentId, doc) {
  const { data } = await drive.files.create({
    requestBody: { name: dataroomFileNameFor(doc), parents: [parentId] },
    media: { mimeType: doc.kind === 'termsheet' ? 'text/html' : (doc.mimetype || 'application/octet-stream'), body: Readable.from(dataroomFileBufferFor(doc)) },
    fields: 'id, webViewLink',
  });
  return { external_id: data.id, external_url: data.webViewLink || null };
}

async function uploadToDropbox(dbx, pathParts, doc) {
  const fullPath = '/' + [...pathParts.map(p => sanitizePathPart(p, 100)), sanitizePathPart(dataroomFileNameFor(doc), 150)].join('/');
  const { result } = await dbx.filesUpload({ path: fullPath, contents: dataroomFileBufferFor(doc), mode: { '.tag': 'add' }, autorename: true });
  return { external_id: result.id, external_url: null };
}

// Envoi d'un document vers le fournisseur connecté, avec bascule en statut
// « revoked » si le token a été révoqué côté fournisseur (l'utilisateur devra
// reconnecter son compte). Met à jour `dataroom_links` sur le document (un seul
// lien par fournisseur : un renvoi remplace le précédent plutôt que d'empiler).
async function pushDocumentToDataroom(userId, provider, doc, pathParts) {
  const connection = await col('saas_dataroom_connections').findOne({ user_id: userId, provider });
  if (!connection || connection.status === 'revoked') {
    const err = new Error(`${dataroomProviderLabel(provider)} n'est pas connecté. Connectez votre compte avant d'envoyer un fichier.`);
    err.statusCode = 409; throw err;
  }

  let result;
  try {
    if (provider === 'google_drive') {
      const drive    = await driveClientFor(connection);
      const parentId = await resolveDriveFolder(drive, connection, pathParts);
      result = await uploadToDrive(drive, parentId, doc);
    } else {
      const dbx = new Dropbox({ refreshToken: decryptSecret(connection.refresh_token_enc), clientId: DROPBOX_APP_KEY, clientSecret: DROPBOX_APP_SECRET, fetch });
      result = await uploadToDropbox(dbx, pathParts, doc);
    }
  } catch (err) {
    if (/invalid_grant|unauthorized|expired_access_token/i.test(err.message || '')) {
      await col('saas_dataroom_connections').updateOne({ id: connection.id }, { $set: { status: 'revoked', updated_at: new Date().toISOString() } });
      const e = new Error(`Connexion ${dataroomProviderLabel(provider)} expirée. Reconnectez votre compte.`);
      e.statusCode = 409; throw e;
    }
    throw err;
  }

  const link = { provider, external_id: result.external_id, external_url: result.external_url, account_label: connection.account_label, pushed_at: new Date().toISOString() };
  await col('saas_documents').updateOne({ id: doc.id, user_id: userId }, { $pull: { dataroom_links: { provider } } });
  await col('saas_documents').updateOne({ id: doc.id, user_id: userId }, { $push: { dataroom_links: link } });
  return link;
}

app.post('/api/saas/dataroom/:provider/push/document/:id', requireAuth, async (req, res) => {
  const provider = req.params.provider;
  if (!DATAROOM_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Fournisseur inconnu' });
  if (!dataroomProviderConfigured(provider))
    return res.status(503).json({ error: `${dataroomProviderLabel(provider)} non configuré sur le serveur.` });

  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!isDataroomExportableDoc(doc))
    return res.status(422).json({ error: 'Personnalisez ce modèle avant de l’envoyer dans la data room.' });
  if (doc.folder_id == null) return res.status(400).json({ error: "Ce document n'est rattaché à aucun dossier de due diligence." });

  const folder = await col('saas_folders').findOne({ id: doc.folder_id, user_id: req.user.id });
  if (!folder || !DATAROOM_ALLOWED_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Envoi vers la data room disponible uniquement pour les phases de due diligence.' });

  const categoryTitle = shortText(req.body?.category_title, 120) || doc.category_key || 'Fichiers généraux';
  try {
    await pushDocumentToDataroom(req.user.id, provider, doc, ['Liquid+', folder.name, categoryTitle]);
    const updated = await col('saas_documents').findOne({ id, user_id: req.user.id });
    res.json({ document: publicDoc(updated) });
  } catch (err) {
    console.error('Dataroom push error:', err.message);
    res.status(err.statusCode || 502).json({ error: err.statusCode ? err.message : 'Envoi vers la data room échoué. Réessayez.' });
  }
});

app.post('/api/saas/dataroom/:provider/push/category', requireAuth, async (req, res) => {
  const provider = req.params.provider;
  if (!DATAROOM_PROVIDERS.has(provider)) return res.status(400).json({ error: 'Fournisseur inconnu' });
  if (!dataroomProviderConfigured(provider))
    return res.status(503).json({ error: `${dataroomProviderLabel(provider)} non configuré sur le serveur.` });

  const folderId    = Number(req.body?.folder_id);
  const categoryKey = (req.body?.category_key || '').toString();
  const folder = await col('saas_folders').findOne({ id: folderId, user_id: req.user.id });
  if (!folder || !DATAROOM_ALLOWED_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Envoi vers la data room disponible uniquement pour les phases de due diligence.' });

  const docs = await dataroomLooseDocs(req.user.id, folder, categoryKey);
  if (!docs.length) return res.status(404).json({ error: 'Aucun fichier à envoyer dans cette catégorie.' });

  const categoryTitle = shortText(req.body?.category_title, 120) || categoryKey || 'Fichiers généraux';
  const succeeded = [], failed = [];
  for (const doc of docs) {
    try {
      await pushDocumentToDataroom(req.user.id, provider, doc, ['Liquid+', folder.name, categoryTitle]);
      succeeded.push(doc.id);
    } catch (err) {
      failed.push({ id: doc.id, error: err.message });
    }
  }
  res.json({ succeeded, failed });
});

// ─── Export ZIP (fallback data room « pro » sans API self-service) ───────────
app.get('/api/saas/dataroom/zip', requireAuth, async (req, res) => {
  const folderId    = Number(req.query.folder_id);
  const folder = await col('saas_folders').findOne({ id: folderId, user_id: req.user.id });
  if (!folder) return res.status(404).json({ error: 'Dossier introuvable' });
  if (!DATAROOM_ALLOWED_FOLDER_KEYS.has(folder.key))
    return res.status(403).json({ error: 'Export ZIP disponible uniquement pour les phases de due diligence.' });

  // Le ZIP représente la data room du dossier, pas seulement la catégorie depuis
  // laquelle le modal a été ouvert : il contient donc aussi les documents de
  // checklist. Les modèles non personnalisés sont filtrés par la fonction ci-dessus.
  const docs = await dataroomFolderDocs(req.user.id, folder);
  if (!docs.length) return res.status(404).json({ error: 'Aucun fichier à exporter dans ce dossier.' });

  const zipName = sanitizePathPart(folder.name, 100) + '.zip';
  res.attachment(zipName);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    console.error('Dataroom zip error:', err.message);
    if (!res.headersSent) res.status(500);
    res.end();
  });
  archive.pipe(res);

  const usedPaths = new Set();
  for (const d of docs) {
    const buf = dataroomFileBufferFor(d);
    if (!buf) continue;
    const base = sanitizePathPart(dataroomFileNameFor(d), 150);
    const category = dataroomZipCategory(folder, d);
    let finalName = base, finalPath = category + '/' + finalName, n = 2;
    while (usedPaths.has(finalPath)) {
      finalName = base.replace(/(\.[^.]+)?$/, (m) => ' (' + n + ')' + (m || ''));
      finalPath = category + '/' + finalName;
      n++;
    }
    usedPaths.add(finalPath);
    archive.append(buf, { name: finalPath });
  }
  await archive.finalize();
});

// ─── SaaS : export direct d'une term sheet / document HTML → DOCX ou PDF ───────
// On exporte DEPUIS le HTML structuré (titre, sections, clauses), ce qui conserve
// la mise en page — au lieu de passer par un PDF (qui perd toute structure).
// Transforme le HTML de l'éditeur (divs .ts-group / .ts-clause / .ts-label /
// .ts-content) en HTML SÉMANTIQUE (titre = <h1>, sections = <h1>, clauses = <h2>),
// pour que la conversion en DOCX produise de vrais styles de titre Word — et donc
// que la ré-importation puisse redécouper le document à l'identique.
function editorHtmlToSemantic(html) {
  let s = String(html || '');
  // Retire les blocs techniques de l'analyse bakée (conditions / conseils embarqués)
  // pour qu'ils n'apparaissent pas dans le fichier exporté.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Clause : label -> <h2>, contenu déballé.
  s = s.replace(/<div class="ts-clause"[^>]*>\s*<div class="ts-label">([\s\S]*?)<\/div>\s*<div class="ts-content">([\s\S]*?)<\/div>\s*<\/div>/gi,
    (m, label, body) => `<h2>${label}</h2>\n${body}`);
  // Section -> <h1>.
  s = s.replace(/<div class="ts-group"[^>]*>([\s\S]*?)<\/div>/gi, (m, t) => `<h1>${t}</h1>`);
  // Titre du document -> <h1> (premier titre du document).
  s = s.replace(/<h1 class="doc-title">([\s\S]*?)<\/h1>/i, (m, t) => `<h1>${t}</h1>`);
  // Bloc signature -> paragraphe simple.
  s = s.replace(/<div class="ts-sign">([\s\S]*?)<\/div>/gi, (m, t) => `<div class="t-sign">${t}</div>`);
  return s;
}

function buildExportHtml(inner, title) {
  const body = editorHtmlToSemantic(inner);
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  body { font-family: 'Calibri','Liberation Sans',Arial,sans-serif; font-size: 11pt; color:#14171f; line-height:1.5; margin:2.2cm; }
  h1 { font-size: 14pt; font-weight:bold; margin:18pt 0 8pt; }
  h1:first-of-type { font-size: 20pt; text-align:center; margin:0 0 6pt; border:0; }
  h2 { font-size: 12pt; font-weight:bold; margin:10pt 0 3pt; }
  p { margin:4pt 0; }
  p.doc-sub, .doc-sub { text-align:center; color:#555; font-size:11pt; margin:0 0 18pt; }
  ul, ol { margin:4pt 0 4pt 20pt; }
  .t-sign { margin-top:26pt; }
  .doc-note { margin-top:18pt; font-size:9.5pt; color:#666; }
  table { border-collapse:collapse; width:100%; margin:6pt 0; }
  th,td { border:1px solid #999999; padding:4pt 6pt; font-size:10.5pt; text-align:left; vertical-align:top; }
  th { background:#f0f0f0; }
  mark { background:#fff3c4; }
</style></head><body>${body}</body></html>`;
}

async function convertHtmlToFile(html, baseName, outputFormat) {
  const buffer = Buffer.from(html, 'utf8');
  return convertViaCloudConvert(buffer, baseName + '.html', outputFormat);
}

// Enregistre un fichier exporté comme document de l'utilisateur et renvoie sa vue publique.
async function saveExportedDoc(userId, srcDoc, baseName, ext, mimetype, fileBuf) {
  const newId  = await nextId('saas_documents');
  const newDoc = {
    id: newId, user_id: userId, folder_id: srcDoc.folder_id,
    name: `${baseName}.${ext}`, originalname: `${baseName}.${ext}`,
    mimetype, size: fileBuf.length, data: fileBuf,
    created_at: new Date().toISOString(), exported_from: srcDoc.id,
  };
  await col('saas_documents').insertOne(newDoc);
  return publicDoc(newDoc);
}

app.post('/api/saas/termsheets/:id/export', requireAuth, async (req, res) => {
  const id     = Number(req.params.id);
  const target = String(req.body?.to || '').toLowerCase();
  if (!['pdf', 'docx'].includes(target))
    return res.status(400).json({ error: 'Format cible invalide (pdf ou docx).' });

  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id, kind: 'termsheet' });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });
  if (!doc.html) return res.status(400).json({ error: 'Document vide.' });

  const baseName = (doc.name || 'document').replace(/\.[^.]+$/, '').trim() || 'document';
  const html     = buildExportHtml(doc.html, baseName);

  // PDF : nécessite CloudConvert (le bouton « Exporter en PDF » de l'éditeur passe,
  // lui, par l'impression du navigateur et ne dépend pas de cet endpoint).
  if (target === 'pdf') {
    if (!cloudConvert)
      return res.status(503).json({ error: 'Export PDF serveur non configuré : utilisez le bouton « Exporter en PDF ».' });
    try {
      const out     = await convertHtmlToFile(html, baseName, 'pdf');
      const fileBuf = await downloadToBuffer(out.url);
      return res.status(201).json({ document: await saveExportedDoc(req.user.id, doc, baseName, 'pdf', 'application/pdf', fileBuf) });
    } catch (err) {
      console.error('CloudConvert export error (pdf):', err.message);
      return res.status(502).json({ error: 'L\'export PDF a échoué. Réessayez.' });
    }
  }

  // Word : vrai .docx via CloudConvert si disponible (ré-importable dans l'éditeur)…
  if (cloudConvert) {
    try {
      const out     = await convertHtmlToFile(html, baseName, 'docx');
      const fileBuf = await downloadToBuffer(out.url);
      return res.status(201).json({
        document: await saveExportedDoc(req.user.id, doc, baseName, 'docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileBuf),
      });
    } catch (err) {
      console.error('CloudConvert export error (docx → repli .doc):', err.message);
      // on bascule vers le repli ci-dessous plutôt que d'échouer
    }
  }

  // … sinon repli sans dépendance externe : fichier .doc (HTML balisé) que Word ouvre
  // nativement en conservant titres, tableaux et mise en forme.
  try {
    const fileBuf = Buffer.from(html, 'utf8');
    return res.status(201).json({ document: await saveExportedDoc(req.user.id, doc, baseName, 'doc', 'application/msword', fileBuf) });
  } catch (err) {
    console.error('Export .doc error:', err.message);
    return res.status(502).json({ error: 'L\'export Word a échoué. Réessayez.' });
  }
});

// ─── SaaS : éditer un DOCX dans l'éditeur (conversion DOCX → HTML « clausé ») ──
// L'éditeur travaille sur du HTML structuré en clauses (.ts-clause / .ts-content).
// On convertit le DOCX en HTML avec mammoth, puis on le découpe en clauses (une
// par titre, ou par article numéroté à défaut de styles Titre Word) pour que le
// décrypteur et l'assistant IA fonctionnent paragraphe par paragraphe.
function stripHtml(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Découpe le HTML « plat » produit par mammoth en blocs de premier niveau, en
// suivant la profondeur d'imbrication (listes/tableaux restent entiers).
function topLevelBlocks(html) {
  const blocks = [];
  const tagRe = /<(\/?)(p|h[1-6]|ul|ol|table|blockquote|pre|div)\b[^>]*?(\/?)>/gi;
  let depth = 0, startIdx = -1, m;
  while ((m = tagRe.exec(html))) {
    if (m[3] === '/') continue;                         // balise auto-fermante
    if (m[1] !== '/') { if (depth === 0) startIdx = m.index; depth++; }
    else { depth--; if (depth === 0 && startIdx >= 0) { blocks.push(html.slice(startIdx, m.index + m[0].length)); startIdx = -1; } }
  }
  return blocks;
}

// Début d'article numéroté (fallback : « ARTICLE 5 », « 5. », « 5.1 », « III. »).
const SECTION_RE = /^\s*(ARTICLE\s+\d+|TITRE\s+[IVXLC\d]+|\d+(?:\.\d+)*[.)]\s|[IVXLC]+[.)]\s)/i;

// Paragraphe court entièrement en gras = titre « visuel » (DOCX sans styles Titre
// Word, typiquement issu d'une conversion PDF → DOCX) : traité comme un titre de
// clause pour que ces titres ne tombent pas dans le corps du texte.
function boldHeadingText(block) {
  const m = /^<p\b[^>]*>([\s\S]*)<\/p>\s*$/i.exec(String(block).trim());
  if (!m) return null;
  const inner = m[1];
  if (/<(img|br|table)\b/i.test(inner)) return null;
  // Rien ne doit rester une fois les segments en gras retirés.
  if (stripHtml(inner.replace(/<(strong|b)\b[^>]*>[\s\S]*?<\/\1>/gi, ''))) return null;
  const text = stripHtml(inner);
  if (!text || text.length > 100) return null;
  // Une phrase complète (ponctuation finale) n'est pas un titre — sauf numérotée.
  if (/[.;!?]$/.test(text) && !SECTION_RE.test(text)) return null;
  return text;
}

// Niveau de titre effectif d'un bloc : 1-6 pour <h1>-<h6>, 2 pour un pseudo-titre
// en gras, 0 pour le corps de texte.
function headingLevel(block) {
  const hm = /^<h([1-6])\b/i.exec(block);
  if (hm) return +hm[1];
  return boldHeadingText(block) ? 2 : 0;
}

function clauseBlock(key, label, bodyHtml) {
  const safeLabel = escapeHtml(label || 'Clause').slice(0, 120) || 'Clause';
  return `<div class="ts-clause" data-key="${key}">` +
         `<div class="ts-label">${safeLabel}</div>` +
         `<div class="ts-content">${bodyHtml || '<p></p>'}</div></div>`;
}

function docxHtmlToEditorPage(rawHtml, docName) {
  const baseName = String(docName || 'Document').replace(/\.[^.]+$/, '').trim() || 'Document';
  const blocks = topLevelBlocks(rawHtml).filter(b => stripHtml(b) || /<(img|table)/i.test(b));
  if (!blocks.length) return clauseBlock('c1', baseName, '<p></p>');

  let cur = null, n = 0;
  const levels = blocks.map(headingLevel);

  if (levels.some(l => l > 0)) {
    // Document structuré. Le 1er bloc, s'il est un titre, devient le titre du
    // document, et le paragraphe qui le suit son sous-titre. Un niveau de titre ne
    // devient un bandeau de section que si des titres PLUS PROFONDS existent aussi
    // (export de l'éditeur : <h1> sections + <h2> clauses) ; si le document
    // n'utilise qu'un seul niveau (Word « tout en Titre 1 », DOCX issu d'un PDF),
    // chaque titre est un titre de clause — jamais le nom du fichier.
    const hasDocTitle = levels[0] > 0;
    const bodyLevels = [...new Set(levels.slice(hasDocTitle ? 1 : 0).filter(l => l > 0))];
    const groupLevel = bodyLevels.length > 1 ? Math.min(...bodyLevels) : 0;

    const out = [];
    let subSet = false;
    const flush = () => { if (cur) { out.push(clauseBlock(cur.key, cur.label, cur.body.join('\n'))); cur = null; } };
    blocks.forEach((b, i) => {
      const lvl = levels[i];
      if (lvl > 0) {
        const text = stripHtml(b) || 'Section';
        if (i === 0 && hasDocTitle) { out.push(`<h1 class="doc-title">${escapeHtml(text)}</h1>`); return; }
        flush();
        if (lvl === groupLevel) out.push(`<div class="ts-group" contenteditable="false">${escapeHtml(text)}</div>`);
        else { n++; cur = { key: 'c' + n, label: text, body: [] }; }
      } else {
        if (hasDocTitle && !subSet && !cur && out.length === 1) { out.push(`<p class="doc-sub">${escapeHtml(stripHtml(b))}</p>`); subSet = true; return; }
        if (!cur) { n++; cur = { key: 'c' + n, label: 'Préambule', body: [] }; }
        cur.body.push(b);
      }
    });
    flush();
    return out.join('\n');
  }

  // Pas de styles Titre : on coupe aux articles numérotés, sinon une seule clause.
  const clauses = [];
  const push = (label, firstBody) => { n++; cur = { key: 'c' + n, label, body: firstBody ? [firstBody] : [] }; clauses.push(cur); };
  blocks.forEach(b => {
    const txt = stripHtml(b);
    if (!cur || SECTION_RE.test(txt)) {
      const label = txt.split(/[.:—–]/)[0].split(/\s+/).slice(0, 9).join(' ');
      // N'inclure le bloc dans le corps que s'il contient plus que le seul titre
      // (évite d'afficher le titre à la fois dans la colonne label et dans le texte).
      const hasBody = txt.length > label.length + 5;
      push(label || ('Paragraphe ' + (n + 1)), hasBody ? b : null);
    } else cur.body.push(b);
  });
  return clauses.map(c => clauseBlock(c.key, c.label, c.body.join('\n'))).join('\n');
}

app.post('/api/saas/documents/:id/to-editor', requireAuth, async (req, res) => {
  const id  = Number(req.params.id);
  const doc = await col('saas_documents').findOne({ id, user_id: req.user.id });
  if (!doc) return res.status(404).json({ error: 'Document introuvable' });

  const srcExt = path.extname(doc.originalname || doc.name || '').toLowerCase();
  if (srcExt !== '.docx' && srcExt !== '.doc')
    return res.status(400).json({ error: 'Seuls les fichiers Word (.docx / .doc) peuvent être édités. Convertissez d\'abord le document en DOCX.' });
  if (!doc.data) return res.status(400).json({ error: 'Ce document n\'est pas éditable.' });

  // Déjà ouvert dans l'éditeur ? On rouvre la term sheet existante (pas de doublon).
  const existing = await col('saas_documents').findOne({ user_id: req.user.id, kind: 'termsheet', editor_source: id });
  if (existing) return res.json({ id: existing.id, reused: true });

  let docBuf;
  try { docBuf = toBuffer(doc.data); } catch (e) { docBuf = null; }
  if (!docBuf) return res.status(404).json({ error: 'Fichier introuvable en base.' });

  try {
    let rawHtml = '';

    // Détecter si le fichier est en réalité du HTML (export .doc de secours sans CloudConvert).
    const sample = docBuf.slice(0, 300).toString('utf8');
    if (/<html|<!DOCTYPE/i.test(sample)) {
      const fullHtml = docBuf.toString('utf8');
      const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(fullHtml);
      rawHtml = m ? m[1] : fullHtml;
    } else {
      // Vrai DOCX/DOC binaire → conversion via mammoth.
      const result = await mammoth.convertToHtml({ buffer: docBuf });
      rawHtml = result.value || '';
    }

    if (!rawHtml.trim())
      return res.status(422).json({ error: 'Le fichier est vide ou illisible.' });

    const pageHtml  = docxHtmlToEditorPage(rawHtml, doc.name);
    const baseName  = (doc.name || doc.originalname || 'Document').replace(/\.[^.]+$/, '');
    const now       = new Date().toISOString();
    const newId     = await nextId('saas_documents');
    const newDoc = {
      id: newId, user_id: req.user.id, kind: 'termsheet',
      name: baseName, html: pageHtml, size: Buffer.byteLength(pageHtml, 'utf8'),
      editor_source: id, created_at: now, updated_at: now,
    };
    if (doc.folder_id != null) newDoc.folder_id = doc.folder_id;
    await col('saas_documents').insertOne(newDoc);
    res.status(201).json({ id: newId });
  } catch (err) {
    console.error('DOCX→éditeur error:', err.message);
    res.status(502).json({ error: 'La conversion du document a échoué : ' + err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Tâches IA de fond (« se balader pendant l'analyse ») ──────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
// Toute analyse IA lancée depuis le SaaS peut tourner en TÂCHE DE FOND côté serveur.
// L'onglet du navigateur n'a plus besoin de rester ouvert : chaque page charge un
// petit widget (tasks.js) qui interroge /api/saas/jobs et affiche l'avancement, avec
// annulation, barre de progression et bouton « aller à l'endroit ». Comme le travail
// vit dans le processus serveur, il survit à la navigation entre pages (rechargement).
//
// Stockage en mémoire (instance unique) : les tâches sont éphémères, purgées après
// leur fin. Le résultat est conservé jusqu'à ce que la page d'origine le récupère
// (GET /api/saas/jobs/:id) ou que l'utilisateur ferme la carte (dismiss), puis TTL.
const AI_JOBS = new Map();               // id -> job interne
const JOB_DONE_TTL   = 30 * 60 * 1000;   // 30 min après la fin
const JOB_MAX_AGE    = 2  * 60 * 60 * 1000; // 2 h quoi qu'il arrive
const JOB_MAX_PER_USER = 40;

// Vue publique d'une tâche (sans le résultat, potentiellement lourd, ni l'interne).
function publicJob(j) {
  return {
    id: j.id, type: j.type, label: j.label, max: !!j.max,
    status: j.status, progress: j.progress, indeterminate: !!j.indeterminate,
    steps: j.steps || [], location: j.location || null,
    error: j.error || null, resultReady: j.status === 'done',
    created_at: j.created_at, updated_at: j.updated_at,
  };
}
function jobTouch(j)             { j.updated_at = new Date().toISOString(); }
function jobProgress(j, pct)     { j.progress = Math.max(0, Math.min(100, Math.round(pct))); jobTouch(j); }
function jobStep(j, key, state, detail) {
  if (!j.steps) j.steps = [];
  let s = j.steps.find(x => x.key === key);
  if (!s) { s = { key, label: key, state: 'pending', detail: '' }; j.steps.push(s); }
  if (state != null)  s.state = state;
  if (detail != null) s.detail = detail;
  jobTouch(j);
}
// Lève une AbortError si l'utilisateur a demandé l'annulation entre deux appels IA.
function jobBailIfCancelled(j) {
  if (j.cancelRequested) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
}
function pruneJobs() {
  const now = Date.now();
  for (const [id, j] of AI_JOBS) {
    const age = now - new Date(j.created_at).getTime();
    const finishedAge = (j.status === 'done' || j.status === 'error' || j.status === 'cancelled')
      ? now - new Date(j.updated_at).getTime() : 0;
    if (age > JOB_MAX_AGE || finishedAge > JOB_DONE_TTL) AI_JOBS.delete(id);
  }
}
setInterval(pruneJobs, 5 * 60 * 1000).unref?.();

// ─── Fonctions de calcul réutilisables (mêmes prompts que les endpoints) ───────
// Chacune renvoie une Promise du résultat structuré ; `signal` interrompt l'appel.

async function computeDocAnalyze(userId, { title, text }, signal, thinking) {
  // Cache par contenu ET par mode (rapide / approfondi « Max ») : un même document
  // n'est analysé qu'une fois par mode, puis servi instantanément.
  const cacheHash = aiHash('doc-analyze-' + (thinking ? 'max' : 'fast'), [title || '', String(text).slice(0, 14000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return cached;
  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne le contenu réel d'UN document juridique. Tu dois l'analyser et lister TOUTES les « choses à faire » concrètes pour que ce document précis soit complet, exact et prêt à l'emploi, du point de vue du fondateur.

Type / titre du document : « ${title || 'Document'} »

Contenu réel du document :
${String(text).slice(0, 14000)}

Règles :
- Liste des actions concrètes et SPÉCIFIQUES À CE DOCUMENT : champs à compléter (cite-les), valeurs/dates/montants manquants, clauses à préciser ou à ajouter typiques de ce type de document, incohérences à corriger, vérifications à faire.
- N'invente pas d'actions génériques applicables à n'importe quel document (ex. « faire relire par un avocat »).
- Chaque item : une phrase d'action commençant par un verbe à l'infinitif, en français.
- Donne entre 4 et 12 items, ordonnés du plus important au moins important.`;
  const response = await glmChat({
    system, messages: [{ role: 'user', content: 'Analyse ce document et liste les choses à faire.' }],
    maxTokens: 8000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"todos":["action 1","action 2", ...]} — 4 à 12 items, chaque action commençant par un verbe à l\'infinitif.',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);
  const todos = Array.isArray(data.todos) ? data.todos.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [];
  if (todos.length) await aiCacheSet(cacheHash, todos);
  return todos;
}

async function computeDocAdvice(userId, { title, text }, signal, thinking) {
  const cacheHash = aiHash('doc-advice-' + (thinking ? 'max' : 'fast'), [title || '', String(text).slice(0, 12000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return cached;
  const system =
`Tu es l'assistant de « liquid + », un outil juridique pour fondateurs de startup en levée de fonds.
On te donne le contenu réel d'UN document juridique. Tu dois proposer des conseils CONCRETS et SPÉCIFIQUES À CE DOCUMENT pour l'améliorer / le compléter, du point de vue du fondateur.

Type / titre du document : « ${title || 'Document'} »

Contenu réel du document :
${String(text).slice(0, 12000)}

Règles :
- 3 à 5 conseils, propres à CE document précis (cite des éléments réels : un article, un champ à compléter, une valeur, une incohérence, une clause manquante typique de ce type de document).
- N'invente pas de conseils génériques applicables à n'importe quel document (ex. « faites relire par un avocat », « datez le document »). Sois spécifique au contenu.
- Chaque conseil : un "title" court (max ~6 mots) et un "body" d'une phrase, en français, ton clair et utile.`;
  const response = await glmChat({
    system, messages: [{ role: 'user', content: 'Donne les conseils d\'amélioration spécifiques à ce document.' }],
    maxTokens: 6000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"tips":[{"title":"titre court","body":"une phrase"}]} — 3 à 5 conseils.',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);
  const tips = Array.isArray(data.tips) ? data.tips.filter(t => t && t.title && t.body) : [];
  if (tips.length) await aiCacheSet(cacheHash, tips);
  return tips;
}

async function computeDocClauses(userId, { title, clauses, text }, signal, thinking) {
  const current = (Array.isArray(clauses) ? clauses : []).slice(0, 80).map(c => ({
    label: String(c && c.label ? c.label : '').slice(0, 200),
    group: String(c && c.group ? c.group : '').slice(0, 120),
  })).filter(c => c.label);
  const cacheHash = aiHash('doc-clauses-' + (thinking ? 'max' : 'fast'), [title || '', current.map(c => c.label).join('|'), String(text || '').slice(0, 8000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return cached;
  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne le titre d'UN document juridique, la liste de ses clauses/paragraphes ACTUELS et un extrait de son contenu. Tu proposes des clauses MANQUANTES, typiques de ce type de document, que le fondateur pourrait vouloir ajouter.

Type / titre du document : « ${title || 'Document'} »

Clauses déjà présentes :
${current.map(c => `- ${c.label}${c.group ? ' (' + c.group + ')' : ''}`).join('\n') || '(aucune)'}

Extrait du document :
${String(text || '').slice(0, 8000)}

Règles :
- Propose 4 à 8 clauses ABSENTES du document, réellement utiles pour CE type de document précis (aucun doublon avec les clauses présentes).
- Chaque clause : "label" (nom court, ≤ 8 mots), "group" (section du document où elle irait ; réutilise si possible un intitulé de section existant), "plain" (1 phrase en langage courant expliquant ce qu'elle fait), "watch" (1 phrase sur le point de vigilance côté fondateur), "html" (texte COMPLET de la clause, rédigé en français juridique, prêt à insérer, en HTML avec des balises <p> ; valeurs à personnaliser [entre crochets]).
- Rédige des clauses complètes et directement utilisables, pas des résumés.`;
  const response = await glmChat({
    system, messages: [{ role: 'user', content: 'Propose les clauses manquantes à ajouter à ce document.' }],
    maxTokens: 12000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"clauses":[{"label":"...","group":"...","plain":"...","watch":"...","html":"<p>...</p>"}]} — 4 à 8 clauses.',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);
  const out = (Array.isArray(data.clauses) ? data.clauses : [])
    .filter(c => c && c.label && c.html)
    .slice(0, 8)
    .map(c => ({
      label: String(c.label).slice(0, 120),
      group: String(c.group || 'Clauses proposées').slice(0, 120),
      plain: String(c.plain || '').slice(0, 300),
      watch: String(c.watch || '').slice(0, 400),
      html:  String(c.html),
    }));
  if (out.length) await aiCacheSet(cacheHash, out);
  return out;
}

async function computeClausesExplain(userId, { title, clauses }, signal, thinking) {
  const list = (Array.isArray(clauses) ? clauses : []).slice(0, 60).map((c, i) => ({
    key:   String(c && c.key != null ? c.key : 'c' + (i + 1)),
    label: String(c && c.label ? c.label : 'Paragraphe ' + (i + 1)).slice(0, 200),
    html:  String(c && c.html ? c.html : '').slice(0, 4000),
  }));
  if (!list.length) return {};
  const cacheHash = aiHash('clauses-explain-v4-' + (thinking ? 'max' : 'fast'), [title || '', ...list.map(c => c.key + '|' + c.html)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return cached;
  const system =
`Tu es l'assistant pédagogique de « liquid + », un outil juridique pour fondateurs de startup en levée de fonds.
On te donne la liste des paragraphes d'UN document juridique. Pour CHAQUE paragraphe, tu produis 5 choses, du point de vue du FONDATEUR :

1. "plain" : une phrase TRÈS courte (20 mots max) qui résume ce que dit la clause en langage courant.
2. "simple" : explication « Pour bien comprendre », 10 phrases max, simples et imagées, fidèles aux valeurs réelles du texte (durées, montants, pourcentages), sans jargon. UNIQUEMENT du texte brut (jamais de tableau, liste, puce ou balise).
3. "bias" : un entier de 1 à 5 mesurant l'avantage pour l'investisseur : 1 = neutre/équilibré, 2 = légèrement favorable, 3 = favorable, 4 = très favorable, 5 = fortement favorable aux investisseurs.
4. "watch" : 1 à 3 phrases sur les points de vigilance et ce qu'il faut négocier, côté fondateur.
5. "conditions" : 0 à 2 variantes rédigées de cette clause (uniquement si pertinent : montant, durée, seuil, option, alternative). Chaque variante : "label" (≤ 6 mots), "preview" (1 phrase), "html" (texte de la variante en HTML, avec des balises <p> ; valeurs modifiables entourées de <mark class="cond-val">).

Type / titre du document : « ${title || 'Document'} »

Paragraphes (identifiant + libellé + contenu) :
${list.map(c => `--- ${c.key} | ${c.label}\n${c.html}`).join('\n\n')}

Renvoie un objet par identifiant fourni, avec les 5 champs (omets "conditions" ou mets [] s'il n'y a pas de variante pertinente).`;
  const response = await glmChat({
    system, messages: [{ role: 'user', content: 'Analyse chaque paragraphe et remplis les 5 champs.' }],
    maxTokens: 20000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"items":[{"key":"<id>","plain":"phrase courte","simple":"explication 10 phrases max","bias":3,"watch":"points de vigilance","conditions":[{"label":"...","preview":"...","html":"<p>...</p>"}]}]} — un objet par identifiant fourni.',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);
  const explanations = {};
  if (Array.isArray(data.items)) {
    data.items.forEach(it => {
      if (!it || it.key == null) return;
      const k = String(it.key);
      const entry = {};
      if (typeof it.plain === 'string' && it.plain.trim()) entry.plain = it.plain.trim();
      if (typeof it.simple === 'string' && it.simple.trim()) entry.simple = it.simple.trim();
      if (Number.isInteger(it.bias)) entry.bias = Math.max(1, Math.min(5, it.bias));
      if (typeof it.watch === 'string' && it.watch.trim()) entry.watch = it.watch.trim();
      if (Array.isArray(it.conditions)) {
        const conds = it.conditions.filter(c => c && (c.html || c.label)).slice(0, 2).map(c => ({
          label:   String(c.label || 'Variante').slice(0, 80),
          preview: String(c.preview || '').slice(0, 200),
          html:    String(c.html || '<p></p>'),
        }));
        if (conds.length) entry.conditions = conds;
      }
      if (Object.keys(entry).length) explanations[k] = entry;
    });
  }
  if (Object.keys(explanations).length) await aiCacheSet(cacheHash, explanations);
  return explanations;
}

// Comparaison de deux versions : résout chaque côté (document ou version validée),
// extrait le texte, appelle l'IA. Renvoie { ...result, meta } ou lève {status,message}.
async function computeDocCompare(userId, body, signal, thinking) {
  async function resolveSide(docIdRaw, versionIdRaw) {
    const versionId = Number(versionIdRaw);
    if (versionId) {
      const v = await col('saas_doc_versions').findOne({ id: versionId, user_id: userId });
      if (!v) return null;
      const name = v.label || ('Version du ' + new Date(v.created_at).toLocaleDateString('fr-FR'));
      return { doc: { kind: 'termsheet', html: v.html, name }, meta: { id: versionId, version: true, name, date: v.created_at, kind: 'version' } };
    }
    const docId = Number(docIdRaw);
    if (!docId) return null;
    const d = await col('saas_documents').findOne({ id: docId, user_id: userId });
    if (!d) return null;
    return { doc: d, meta: { id: docId, name: d.name, date: d.updated_at || d.created_at, kind: d.kind || 'file' } };
  }
  const [oldSide, newSide] = await Promise.all([
    resolveSide(body?.oldId, body?.oldVersionId),
    resolveSide(body?.newId, body?.newVersionId),
  ]);
  if (!oldSide || !newSide) {
    const provided = body && (body.oldId || body.newId || body.oldVersionId || body.newVersionId);
    const e = new Error(provided ? 'Une des versions est introuvable.' : 'oldId et newId (ou oldVersionId / newVersionId) requis');
    e.status = provided ? 404 : 400; throw e;
  }
  const oldDoc = oldSide.doc, newDoc = newSide.doc;
  const meta = { old: oldSide.meta, new: newSide.meta };
  const [oldText, newText] = await Promise.all([docPlainText(oldDoc), docPlainText(newDoc)]);
  if (!oldText || !newText) {
    const e = new Error('Impossible d\'extraire le texte d\'une des versions (format non supporté — image, tableur — ou fichier vide). La comparaison IA fonctionne pour les PDF, les Word et les documents éditables.');
    e.status = 422; throw e;
  }
  const cacheHash = aiHash('doc-compare-' + (thinking ? 'max' : 'fast'), [oldText.slice(0, 14000), newText.slice(0, 14000)]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return { ...cached, meta, cached: true };
  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne DEUX versions successives d'UN MÊME document juridique : une ANCIENNE version et une NOUVELLE version. Tu compares les deux et expliques, du point de vue du fondateur, ce qui a changé et pourquoi c'est important.

Titre du document : « ${newDoc.name || 'Document'} »

=== ANCIENNE VERSION ===
${oldText.slice(0, 14000)}

=== NOUVELLE VERSION ===
${newText.slice(0, 14000)}

Règles :
- Repère les changements RÉELS et concrets entre les deux versions : clauses ajoutées, supprimées, montants / dates / pourcentages / durées modifiés, formulations renforcées ou affaiblies, obligations nouvelles.
- Ignore les différences purement cosmétiques (mise en page, ponctuation) SAUF si elles changent le sens.
- Pour chaque changement : "heading" (titre court, ≤ 8 mots), "nature" ('ajout' | 'suppression' | 'modification'), "before" (ce que disait l'ancienne version, court ; "" si c'est un ajout), "after" (ce que dit la nouvelle version, court ; "" si c'est une suppression), "impact" (1 phrase sur la conséquence concrète côté fondateur), "severity" ('haute' | 'moyenne' | 'basse' selon l'importance du changement pour le fondateur).
- "summary" : 2 à 3 phrases de synthèse de l'évolution entre les deux versions.
- "verdict" : une expression courte parmi 'Favorable au fondateur', 'Plutôt neutre', 'Vigilance requise', 'Défavorable au fondateur'.
- "recommendation" : 1 à 2 phrases de conseil concret pour le fondateur au vu de ces changements.
- Classe les changements du plus important au moins important pour le fondateur.
- Si les deux versions sont identiques ou quasi identiques, indique-le dans "summary" et renvoie "changes" vide.`;
  const response = await glmChat({
    system, messages: [{ role: 'user', content: 'Compare l\'ancienne et la nouvelle version, et détaille les changements.' }],
    maxTokens: 8000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"summary":"...","verdict":"Vigilance requise","changes":[{"heading":"...","nature":"modification","before":"...","after":"...","impact":"...","severity":"moyenne"}],"recommendation":"..."}',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);
  const natures    = new Set(['ajout', 'suppression', 'modification']);
  const severities = new Set(['haute', 'moyenne', 'basse']);
  const result = {
    summary: typeof data.summary === 'string' ? data.summary : '',
    verdict: typeof data.verdict === 'string' ? data.verdict : '',
    changes: Array.isArray(data.changes) ? data.changes.filter(c => c && (c.heading || c.impact)).slice(0, 40).map(c => ({
      heading:  String(c.heading || '').slice(0, 160),
      nature:   natures.has(c.nature) ? c.nature : 'modification',
      before:   String(c.before || '').slice(0, 600),
      after:    String(c.after || '').slice(0, 600),
      impact:   String(c.impact || '').slice(0, 600),
      severity: severities.has(c.severity) ? c.severity : 'moyenne',
    })) : [],
    recommendation: typeof data.recommendation === 'string' ? data.recommendation : '',
  };
  if (result.summary || result.changes.length) await aiCacheSet(cacheHash, result);
  return { ...result, meta };
}

// Comparaison de PLUSIEURS versions successives d'un même document de levée
// (term sheet, pacte, BSA-AIR, SAFE…). Chaque entrée est soit un document
// (docId), soit une version validée (versionId). On les ordonne CHRONOLOGIQUEMENT
// (par défaut), on extrait le texte de chacune, puis on demande à l'IA :
//   • toutes les modifications réelles à chaque étape (v1→v2, v2→v3, …) ;
//   • QUI a probablement rédigé chaque version — déduit du SENS des changements
//     (protections investisseur renforcées ⇒ côté investisseur ; assouplissements
//     ou protections fondateur ⇒ côté fondateur ; rédaction/définitions ⇒ conseil) ;
//   • les INTENTIONS derrière chaque lot de modifications, expliquées au fondateur.
async function computeDocCompareMulti(userId, body, signal, thinking) {
  async function resolveEntry(entry) {
    const versionId = Number(entry?.versionId);
    if (versionId) {
      const v = await col('saas_doc_versions').findOne({ id: versionId, user_id: userId });
      if (!v) return null;
      const name = v.label || ('Version du ' + new Date(v.created_at).toLocaleDateString('fr-FR'));
      return { doc: { kind: 'termsheet', html: v.html, name }, meta: { id: versionId, version: true, name, label: v.label || '', date: v.created_at, kind: 'version' } };
    }
    const docId = Number(entry?.docId);
    if (!docId) return null;
    const d = await col('saas_documents').findOne({ id: docId, user_id: userId });
    if (!d) return null;
    return { doc: d, meta: { id: docId, version: false, name: d.name, label: String(entry?.label || ''), date: d.updated_at || d.created_at, kind: d.kind || 'file' } };
  }

  const entries = Array.isArray(body?.versions) ? body.versions.slice(0, 40) : [];
  if (entries.length < 2) { const e = new Error('Sélectionnez au moins deux versions à comparer.'); e.status = 400; throw e; }

  let sides = (await Promise.all(entries.map(resolveEntry))).filter(Boolean);
  // Dédoublonnage (une même version / un même document listé deux fois).
  const seen = new Set();
  sides = sides.filter(s => { const k = (s.meta.version ? 'v' : 'd') + s.meta.id; if (seen.has(k)) return false; seen.add(k); return true; });
  if (sides.length < 2) { const e = new Error('Au moins deux des versions sélectionnées sont introuvables.'); e.status = 404; throw e; }

  // Ordre chronologique (par défaut). Tri stable : à date égale, l'ordre d'entrée
  // est préservé (Array.prototype.sort est stable).
  sides.sort((a, b) => new Date(a.meta.date || 0) - new Date(b.meta.date || 0));

  // Bornage : au-delà de MAX versions, échantillonnage chronologique en gardant
  // toujours la toute première et la toute dernière (l'arc de négociation complet).
  const MAX = 8;
  const totalCount = sides.length;
  if (sides.length > MAX) {
    const step = (sides.length - 1) / (MAX - 1);
    const picked = [sides[0]];
    for (let i = 1; i < MAX - 1; i++) picked.push(sides[Math.round(i * step)]);
    picked.push(sides[sides.length - 1]);
    sides = [...new Set(picked)];
  }

  // Texte brut de chaque version (budget de caractères partagé entre les versions).
  const texts = await Promise.all(sides.map(s => docPlainText(s.doc)));
  const usable = sides.map((s, i) => ({ side: s, text: (texts[i] || '').trim() })).filter(x => x.text);
  if (usable.length < 2) { const e = new Error('Impossible d\'extraire le texte d\'au moins deux versions (format non supporté — image, tableur — ou fichiers vides). La comparaison IA fonctionne pour les PDF, les Word et les documents éditables.'); e.status = 422; throw e; }

  const perBudget = Math.max(2500, Math.floor(46000 / usable.length));
  const title = String(body?.title || usable[usable.length - 1].side.meta.name || 'Document');
  const metas = usable.map((x, i) => ({ ...x.side.meta, num: i + 1 }));

  const cacheHash = aiHash('doc-compare-multi-' + (thinking ? 'max' : 'fast'), [title, ...usable.map(x => x.text.slice(0, perBudget))]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return { ...cached, meta: { title, versions: metas, total: totalCount }, cached: true };

  const n = usable.length;
  const versionsBlock = usable.map((x, i) => {
    const m = x.side.meta;
    const when = m.date ? new Date(m.date).toLocaleDateString('fr-FR') : 'date inconnue';
    const lab = m.label ? ` — « ${m.label} »` : '';
    return `═══ VERSION ${i + 1} (${when}${lab}) ═══\n${x.text.slice(0, perBudget)}`;
  }).join('\n\n');

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne ${n} versions SUCCESSIVES d'UN MÊME document juridique de levée (term sheet, pacte d'associés, BSA-AIR, SAFE, contrat de cession…), classées de la PLUS ANCIENNE (VERSION 1) à la PLUS RÉCENTE (VERSION ${n}). Tu analyses l'évolution du document au fil de la négociation et tu l'expliques du point de vue du fondateur.

Titre du document : « ${title} »

${versionsBlock}

Ta mission — trois volets :

1) MODIFICATIONS À CHAQUE ÉTAPE. Pour chaque transition (VERSION 1 → VERSION 2, VERSION 2 → VERSION 3, …, soit ${n - 1} transitions), repère les changements RÉELS et concrets : clauses ajoutées / supprimées, montants, valorisations, pourcentages, dates, durées modifiés, formulations renforcées ou affaiblies, obligations ou protections nouvelles. Ignore les différences purement cosmétiques (mise en page, ponctuation) SAUF si elles changent le sens juridique.

2) QUI A RÉDIGÉ CHAQUE VERSION. Déduis, du SENS des modifications, quelle partie est probablement à l'origine de chaque version (tu ne disposes pas des métadonnées d'auteur : c'est une INFÉRENCE motivée, pas une certitude). Repères juridiques usuels en levée de fonds :
   • Vont dans le sens de l'INVESTISSEUR (probablement rédigé par le fonds ou son avocat) : préférence de liquidation introduite/augmentée (1x → x2, non-participating → participating), anti-dilution (full ratchet, weighted average), clauses de véto / matières réservées, sièges au board / contrôle, drag-along élargi, bad leaver durci, vesting rallongé, pool d'options placé en pre-money, valorisation revue à la baisse, déclarations & garanties étendues, non-concurrence, reporting renforcé, liquidation preference cumulative.
   • Vont dans le sens du FONDATEUR (probablement rédigé par le fondateur ou son avocat) : préférence ramenée à 1x non-participating, plafonnement de la garantie de passif, valorisation revue à la hausse, carve-out sur le vesting (accélération single/double trigger), pool réduit ou basculé en post-money, véto assoupli, good leaver élargi, pro-rata limité.
   • Rédaction purement technique (définitions, renvois, mise en cohérence, boilerplate) sans camp gagnant clair : probablement un CONSEIL / avocat.
   Pour la VERSION 1, indique qui a vraisemblablement produit le document de départ (souvent le term sheet de l'investisseur, ou le brouillon du fondateur selon le ton). Choisis "author" parmi : 'Fondateur', 'Avocat du fondateur', 'Investisseur', 'Avocat de l'investisseur', 'Indéterminé'. Donne "authorConfidence" ('élevée' | 'moyenne' | 'faible') et "authorRationale" (1 phrase justifiant l'inférence à partir des changements observés).

3) INTENTIONS. Pour chaque transition, explique en 2 à 4 phrases, dans un langage clair pour un fondateur non-juriste, le POURQUOI et les intentions derrière ce lot de modifications : ce que la partie cherche à obtenir ou à se protéger, et ce que cela implique concrètement pour le fondateur (contrôle, dilution, argent en cas de sortie, gouvernance, risques).

Renvoie aussi :
- "overallSummary" : 2 à 4 phrases retraçant l'arc global de la négociation, de la VERSION 1 à la VERSION ${n}.
- "verdict" : l'effet NET pour le fondateur entre la première et la dernière version, une expression parmi 'Favorable au fondateur', 'Plutôt neutre', 'Vigilance requise', 'Défavorable au fondateur'.
- "recommendation" : 1 à 3 phrases de conseil concret et actionnable pour le fondateur au vu de cette évolution.

Règles de forme :
- Pour chaque changement : "heading" (titre court, ≤ 8 mots), "nature" ('ajout' | 'suppression' | 'modification'), "before" (ce que disait la version précédente, court ; "" si ajout), "after" (ce que dit la nouvelle version, court ; "" si suppression), "impact" (1 phrase sur la conséquence concrète côté fondateur), "severity" ('haute' | 'moyenne' | 'basse').
- Dans chaque transition, classe les changements du plus important au moins important pour le fondateur.
- Si deux versions consécutives sont identiques ou quasi identiques, renvoie une transition avec "changes" vide et un "intent" qui le signale.`;

  const response = await glmChat({
    system,
    messages: [{ role: 'user', content: `Analyse l'évolution de ce document sur ses ${n} versions : qui a rédigé chaque version, ce qui a changé à chaque étape et les intentions derrière.` }],
    maxTokens: 16000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"overallSummary":"...","verdict":"Vigilance requise","versions":[{"index":1,"author":"Investisseur","authorConfidence":"moyenne","authorRationale":"..."}],"transitions":[{"from":1,"to":2,"intent":"...","changes":[{"heading":"...","nature":"modification","before":"...","after":"...","impact":"...","severity":"moyenne"}]}],"recommendation":"..."}',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);

  const natures     = new Set(['ajout', 'suppression', 'modification']);
  const severities  = new Set(['haute', 'moyenne', 'basse']);
  const confidences = new Set(['élevée', 'moyenne', 'faible']);

  const rawVersions = Array.isArray(data.versions) ? data.versions : [];
  const versionsOut = [];
  for (let i = 0; i < n; i++) {
    const rv = rawVersions.find(v => v && Number(v.index) === i + 1) || rawVersions[i] || {};
    versionsOut.push({
      num: i + 1,
      author:           String(rv.author || '').slice(0, 60) || 'Indéterminé',
      authorConfidence: confidences.has(rv.authorConfidence) ? rv.authorConfidence : 'faible',
      authorRationale:  String(rv.authorRationale || '').slice(0, 400),
    });
  }

  const rawTrans = Array.isArray(data.transitions) ? data.transitions : [];
  const transitionsOut = [];
  for (let i = 0; i < n - 1; i++) {
    const rt = rawTrans.find(t => t && Number(t.from) === i + 1 && Number(t.to) === i + 2) || rawTrans[i] || {};
    const changes = Array.isArray(rt.changes) ? rt.changes.filter(c => c && (c.heading || c.impact)).slice(0, 30).map(c => ({
      heading:  String(c.heading || '').slice(0, 160),
      nature:   natures.has(c.nature) ? c.nature : 'modification',
      before:   String(c.before || '').slice(0, 600),
      after:    String(c.after || '').slice(0, 600),
      impact:   String(c.impact || '').slice(0, 600),
      severity: severities.has(c.severity) ? c.severity : 'moyenne',
    })) : [];
    transitionsOut.push({ from: i + 1, to: i + 2, intent: String(rt.intent || '').slice(0, 800), changes });
  }

  const result = {
    overallSummary: typeof data.overallSummary === 'string' ? data.overallSummary : (typeof data.summary === 'string' ? data.summary : ''),
    verdict:        typeof data.verdict === 'string' ? data.verdict : '',
    versions:       versionsOut,
    transitions:    transitionsOut,
    recommendation: typeof data.recommendation === 'string' ? data.recommendation : '',
  };
  const anyChange = transitionsOut.some(t => t.changes.length);
  if (result.overallSummary || anyChange) await aiCacheSet(cacheHash, result);
  return { ...result, meta: { title, versions: metas, total: totalCount } };
}

// Comparaison de PLUSIEURS documents INDÉPENDANTS du même type (typiquement des
// term sheets envoyées par des investisseurs DIFFÉRENTS). Contrairement à
// computeDocCompareMulti, ce ne sont pas des versions successives d'un même
// document : pas de tri chronologique, pas d'inférence d'auteur. On demande à
// l'IA une comparaison CRITÈRE PAR CRITÈRE (valorisation, préférence de
// liquidation, anti-dilution, gouvernance…) pour aider le fondateur à choisir
// avec quel investisseur avancer.
async function computeDocCompareInvestors(userId, body, signal, thinking) {
  async function resolveEntry(entry) {
    const docId = Number(entry?.docId);
    if (!docId) return null;
    const d = await col('saas_documents').findOne({ id: docId, user_id: userId });
    if (!d) return null;
    const investor = shortText(entry?.investor, 80) || d.name || 'Investisseur';
    return { doc: d, meta: { id: docId, name: d.name, investor } };
  }

  const entries = Array.isArray(body?.docs) ? body.docs.slice(0, 8) : [];
  if (entries.length < 2) { const e = new Error('Sélectionnez au moins deux documents à comparer.'); e.status = 400; throw e; }

  let sides = (await Promise.all(entries.map(resolveEntry))).filter(Boolean);
  const seen = new Set();
  sides = sides.filter(s => { const k = 'd' + s.meta.id; if (seen.has(k)) return false; seen.add(k); return true; });
  if (sides.length < 2) { const e = new Error('Au moins deux des documents sélectionnés sont introuvables.'); e.status = 404; throw e; }

  const texts = await Promise.all(sides.map(s => docPlainText(s.doc)));
  const usable = sides.map((s, i) => ({ side: s, text: (texts[i] || '').trim() })).filter(x => x.text);
  if (usable.length < 2) { const e = new Error('Impossible d\'extraire le texte d\'au moins deux documents (format non supporté — image, tableur — ou fichiers vides). La comparaison IA fonctionne pour les PDF, les Word et les documents éditables.'); e.status = 422; throw e; }

  const n = usable.length;
  const perBudget = Math.max(2500, Math.floor(46000 / n));
  const title = String(body?.title || 'Term sheets');
  const metas = usable.map(x => x.side.meta);

  const cacheHash = aiHash('doc-compare-investors-' + (thinking ? 'max' : 'fast'), [title, ...usable.map(x => x.text.slice(0, perBudget))]);
  const cached = await aiCacheGet(cacheHash);
  if (cached) return { ...cached, meta: { title, docs: metas }, cached: true };

  const docsBlock = usable.map((x, i) => `═══ PROPOSITION ${i + 1} — ${x.side.meta.investor} ═══\n${x.text.slice(0, perBudget)}`).join('\n\n');

  const system =
`Tu es l'assistant juridique de « liquid + », un outil pour fondateurs de startup en levée de fonds.
On te donne ${n} documents INDÉPENDANTS du même type (term sheets, ou autres documents de levée comparables), chacun proposé par un investisseur DIFFÉRENT — ce ne sont PAS des versions successives d'un même document, mais des propositions concurrentes que le fondateur doit comparer pour choisir avec qui avancer.

Titre / contexte : « ${title} »

${docsBlock}

Ta mission :

1) CRITÈRES CLÉS. Identifie les critères de négociation qui apparaissent dans au moins un des documents (parmi, sans s'y limiter : valorisation pre/post-money, montant levé, type d'instrument, préférence de liquidation, anti-dilution, board/gouvernance, matières réservées, vesting/leaver, pro-rata, exclusivité, conditions suspensives, frais). Pour chaque critère, indique CE QUE PROPOSE CHAQUE INVESTISSEUR (une valeur courte par proposition ; "Non précisé" si absent) et lequel est le PLUS FAVORABLE AU FONDATEUR sur ce point précis.

2) SYNTHÈSE PAR INVESTISSEUR. Pour chaque proposition, un verdict global ('Favorable au fondateur' | 'Plutôt neutre' | 'Vigilance requise' | 'Défavorable au fondateur'), un résumé (1-2 phrases), 1 à 3 points forts et 1 à 3 points de vigilance pour le fondateur.

3) RECOMMANDATION. 2 à 4 phrases : quelle(s) proposition(s) semblent les plus intéressantes pour le fondateur et pourquoi, et quels points précis négocier avec les autres.

Renvoie aussi "overallSummary" (1-2 phrases situant l'écart global entre les propositions).

Règles de forme :
- Pour chaque critère : "name" (court), "values" un tableau de ${n} chaînes (une par proposition, DANS L'ORDRE des propositions ci-dessus), "bestIndex" (index 0-based de la proposition la plus favorable au fondateur sur ce critère, ou null si équivalent/non comparable).
- Classe les critères du plus structurant au moins structurant pour le fondateur.`;

  const response = await glmChat({
    system,
    messages: [{ role: 'user', content: `Compare ces ${n} propositions d'investisseurs critère par critère et donne une recommandation au fondateur.` }],
    maxTokens: 16000, thinking: !!thinking, json: true,
    jsonHint: 'Format : {"overallSummary":"...","criteria":[{"name":"Valorisation pre-money","values":["8M€","6M€"],"bestIndex":0}],"perInvestor":[{"verdict":"Vigilance requise","summary":"...","strengths":["..."],"concerns":["..."]}],"recommendation":"..."}',
    signal,
  });
  await recordClaudeUsage(userId, response);
  const data = glmJson(response);

  const verdictsSet = new Set(['Favorable au fondateur', 'Plutôt neutre', 'Vigilance requise', 'Défavorable au fondateur']);

  const rawCriteria = Array.isArray(data.criteria) ? data.criteria : [];
  const criteria = rawCriteria.slice(0, 24).map(c => {
    const values = Array.isArray(c?.values) ? c.values : [];
    const vals = [];
    for (let i = 0; i < n; i++) vals.push(String(values[i] || '').slice(0, 200) || 'Non précisé');
    const bi = Number.isInteger(c?.bestIndex) && c.bestIndex >= 0 && c.bestIndex < n ? c.bestIndex : null;
    return { name: String(c?.name || 'Critère').slice(0, 100), values: vals, bestIndex: bi };
  }).filter(c => c.name);

  const rawPer = Array.isArray(data.perInvestor) ? data.perInvestor : [];
  const perInvestor = [];
  for (let i = 0; i < n; i++) {
    const rp = rawPer[i] || {};
    perInvestor.push({
      verdict: verdictsSet.has(rp.verdict) ? rp.verdict : '',
      summary: String(rp.summary || '').slice(0, 400),
      strengths: Array.isArray(rp.strengths) ? rp.strengths.slice(0, 5).map(s => String(s).slice(0, 200)) : [],
      concerns: Array.isArray(rp.concerns) ? rp.concerns.slice(0, 5).map(s => String(s).slice(0, 200)) : [],
    });
  }

  const result = {
    overallSummary: typeof data.overallSummary === 'string' ? data.overallSummary : '',
    criteria,
    perInvestor,
    recommendation: typeof data.recommendation === 'string' ? data.recommendation : '',
  };
  if (result.overallSummary || criteria.length) await aiCacheSet(cacheHash, result);
  return { ...result, meta: { title, docs: metas } };
}

// ─── Historique des comparaisons IA ────────────────────────────────────────────
// Chaque comparaison terminée (versions d'un même document, ou term sheets de
// plusieurs investisseurs) est archivée pour que le fondateur puisse la retrouver
// plus tard sans relancer l'analyse. Deux historiques distincts selon le "mode" :
//   'versions'  → évolution d'un document entre le fondateur et un investisseur ;
//   'investors' → propositions de plusieurs investisseurs comparées entre elles.
const COMPARE_HISTORY_MAX = 50; // par utilisateur ET par mode
async function saveCompareHistory(userId, mode, result) {
  try {
    if (!userId || !result || (mode !== 'versions' && mode !== 'investors')) return;
    const meta = result.meta || {};
    const list = mode === 'investors'
      ? (Array.isArray(meta.docs) ? meta.docs : [])
      : (Array.isArray(meta.versions) ? meta.versions : []);
    // Rien d'exploitable (toutes les versions identiques, aucune comparaison) :
    // on n'archive pas une coquille vide.
    const hasContent = mode === 'investors'
      ? !!(result.overallSummary || (Array.isArray(result.criteria) && result.criteria.length))
      : !!(result.overallSummary || (Array.isArray(result.transitions) && result.transitions.some(t => t && Array.isArray(t.changes) && t.changes.length)));
    if (!hasContent) return;

    const id = await nextId('saas_compare_history');
    const entry = {
      id, user_id: userId, mode,
      title: String(meta.title || 'Comparaison').slice(0, 200),
      summary: String(result.overallSummary || '').slice(0, 600),
      verdict: String(result.verdict || '').slice(0, 60),
      item_count: list.length,
      items: list.map(x => String((mode === 'investors' ? (x.investor || x.name) : (x.label || x.name)) || '').slice(0, 120)).filter(Boolean),
      result,
      created_at: new Date().toISOString(),
    };
    await col('saas_compare_history').insertOne(entry);

    // Bornage : on ne conserve que les COMPARE_HISTORY_MAX plus récentes par mode.
    const stale = await col('saas_compare_history')
      .find({ user_id: userId, mode }, { projection: { id: 1 } })
      .sort({ id: -1 }).skip(COMPARE_HISTORY_MAX).toArray();
    if (stale.length) await col('saas_compare_history').deleteMany({ user_id: userId, id: { $in: stale.map(s => s.id) } });
  } catch (e) { console.error('saveCompareHistory:', e.message); }
}

// ─── Exécuteurs par type de tâche ──────────────────────────────────────────────
const JOB_RUNNERS = {
  // Analyse « choses à faire » d'un document (depuis la liste des dossiers).
  async 'doc-analyze'(job) {
    const { title, text, folderId, slug } = job.payload || {};
    job.indeterminate = true;
    jobStep(job, 'analyse', 'progress', 'Analyse du document…');
    jobProgress(job, 12);
    const todos = await computeDocAnalyze(job.userId, { title, text }, job._abort.signal, job.max);
    jobBailIfCancelled(job);
    if (!todos.length) { const e = new Error('Analyse indisponible pour le moment.'); throw e; }
    // Sauvegarde côté serveur : la checklist du dossier est mise à jour même si
    // l'utilisateur a navigué ailleurs pendant l'analyse.
    if (folderId != null && slug) {
      try {
        const folder = await col('saas_folders').findOne({ id: Number(folderId), user_id: job.userId });
        if (folder) {
          const state = { ...(folder.items_state || {}) };
          const cur   = { ...(state[slug] || {}) };
          cur.todos = todos.slice(0, 60).map(x => String(x).slice(0, 500));
          cur.analysis_at = new Date().toISOString();
          state[slug] = cur;
          await col('saas_folders').updateOne({ id: Number(folderId), user_id: job.userId }, { $set: { items_state: state } });
        }
      } catch (e) { console.error('doc-analyze job checklist save:', e.message); }
    }
    job.result = { todos };
    jobStep(job, 'analyse', 'done', `${todos.length} chose${todos.length > 1 ? 's' : ''} à faire`);
    jobProgress(job, 100);
  },

  // Comparaison IA de deux versions.
  async 'doc-compare'(job) {
    job.indeterminate = true;
    jobStep(job, 'compare', 'progress', 'Comparaison des deux versions…');
    jobProgress(job, 12);
    const result = await computeDocCompare(job.userId, job.payload || {}, job._abort.signal, job.max);
    jobBailIfCancelled(job);
    job.result = result;
    const n = (result.changes || []).length;
    jobStep(job, 'compare', 'done', n ? `${n} changement${n > 1 ? 's' : ''}` : 'Aucun changement notable');
    jobProgress(job, 100);
  },

  // Comparaison IA de PLUSIEURS versions (frise chronologique + auteurs + intentions).
  async 'doc-compare-multi'(job) {
    job.indeterminate = true;
    jobStep(job, 'compare', 'progress', 'Comparaison des versions…');
    jobProgress(job, 12);
    const result = await computeDocCompareMulti(job.userId, job.payload || {}, job._abort.signal, job.max);
    jobBailIfCancelled(job);
    job.result = result;
    await saveCompareHistory(job.userId, 'versions', result);
    const nv = (result.meta && Array.isArray(result.meta.versions)) ? result.meta.versions.length : 0;
    const nc = (result.transitions || []).reduce((s, t) => s + ((t.changes && t.changes.length) || 0), 0);
    jobStep(job, 'compare', 'done', nc ? `${nv} versions · ${nc} changement${nc > 1 ? 's' : ''}` : `${nv} versions comparées`);
    jobProgress(job, 100);
  },

  // Comparaison IA de PLUSIEURS documents indépendants (ex. term sheets de
  // différents investisseurs) : tableau critère par critère + verdict par proposition.
  async 'doc-compare-investors'(job) {
    job.indeterminate = true;
    jobStep(job, 'compare', 'progress', 'Comparaison des propositions…');
    jobProgress(job, 12);
    const result = await computeDocCompareInvestors(job.userId, job.payload || {}, job._abort.signal, job.max);
    jobBailIfCancelled(job);
    job.result = result;
    await saveCompareHistory(job.userId, 'investors', result);
    const nd = (result.meta && Array.isArray(result.meta.docs)) ? result.meta.docs.length : 0;
    jobStep(job, 'compare', 'done', `${nd} propositions comparées`);
    jobProgress(job, 100);
  },

  // Analyse complète d'un document dans l'éditeur : explication de chaque paragraphe
  // (par lots), clauses proposées, colonne « À vérifier ». Le résultat brut est
  // renvoyé ; l'éditeur applique la fusion dans la page à son retour.
  async 'full-analyze'(job) {
    const p = job.payload || {};
    const explainClauses = Array.isArray(p.explainClauses) ? p.explainClauses : [];
    const total = explainClauses.length;
    job.result = { explanations: {}, suggested: null, tips: null };
    jobStep(job, 'par',   total ? 'progress' : 'done', `0 / ${total}`);
    jobStep(job, 'lib',   p.suggest ? 'pending' : 'done', p.suggest ? 'En attente' : 'Pré-remplie');
    jobStep(job, 'verif', p.advice  ? 'pending' : 'done', p.advice  ? 'En attente' : 'Pré-remplie');

    const title = p.title || 'Document';

    // 1) Explication des paragraphes, par lots de 6 traités EN PARALLÈLE (pool borné
    //    pour ne pas saturer l'API). Progression réelle 0 → 75 % au fil des lots.
    const CHUNK = 6;
    const CONCURRENCY = 3;
    const chunks = [];
    for (let i = 0; i < total; i += CHUNK) chunks.push(explainClauses.slice(i, i + CHUNK));
    let done = 0, next = 0;
    async function explainWorker() {
      while (next < chunks.length) {
        const slice = chunks[next++];
        jobBailIfCancelled(job);
        const explanations = await computeClausesExplain(job.userId, { title, clauses: slice }, job._abort.signal, job.max);
        Object.assign(job.result.explanations, explanations);
        done = Math.min(total, done + slice.length);
        jobStep(job, 'par', done >= total ? 'done' : 'progress', `${done} / ${total}`);
        jobProgress(job, Math.round((done / total) * 75));
      }
    }
    if (total) await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, explainWorker));
    else jobProgress(job, 75);

    // 2) Clauses proposées + colonne « À vérifier » (documents libres) : les deux
    //    dernières étapes tournent EN PARALLÈLE l'une de l'autre.
    const suggestPhase = (async () => {
      if (!p.suggest) return;
      jobBailIfCancelled(job);
      jobStep(job, 'lib', 'progress', 'Recherche…');
      const suggested = await computeDocClauses(job.userId, { title, clauses: p.suggest.clauses, text: p.suggest.text }, job._abort.signal, job.max);
      job.result.suggested = suggested;
      jobStep(job, 'lib', 'done', suggested.length ? `${suggested.length} proposée${suggested.length > 1 ? 's' : ''}` : 'Aucune proposition');
    })();
    const advicePhase = (async () => {
      if (!p.advice) return;
      jobBailIfCancelled(job);
      jobStep(job, 'verif', 'progress', 'Analyse…');
      const tips = await computeDocAdvice(job.userId, { title, text: p.advice.text }, job._abort.signal, job.max);
      job.result.tips = tips;
      jobStep(job, 'verif', 'done', tips.length ? 'Remplie' : 'Vide');
    })();
    jobProgress(job, 88);
    await Promise.all([suggestPhase, advicePhase]);
    jobProgress(job, 100);
  },
};
const JOB_TYPES = new Set(Object.keys(JOB_RUNNERS));

// Lance l'exécuteur d'une tâche (non attendu) et met à jour son statut final.
function startJob(job) {
  const runner = JOB_RUNNERS[job.type];
  Promise.resolve()
    .then(() => runner(job))
    .then(() => {
      if (job.status === 'running') { job.status = 'done'; jobProgress(job, 100); }
    })
    .catch(err => {
      const cancelled = err && (err.name === 'AbortError' || job.cancelRequested);
      job.status = cancelled ? 'cancelled' : 'error';
      if (!cancelled) {
        job.error = 'L\'analyse a échoué. Réessayez dans un instant.';
        console.error(`Job ${job.type} error:`, err.message);
      }
      (job.steps || []).forEach(s => { if (s.state === 'progress' || s.state === 'pending') s.state = cancelled ? 'cancelled' : 'error'; });
      jobTouch(job);
    });
}

// ─── Endpoints des tâches IA ───────────────────────────────────────────────────
// Créer une tâche : renvoie son id ; le travail tourne en fond.
app.post('/api/saas/jobs', requireAuth, enforceDailyCap, (req, res) => {
  if (!zaiClient)
    return res.status(503).json({ error: 'Assistant IA non configuré : ajoutez ZAI_API_KEY dans le .env du serveur.' });
  const { type, payload, label, location, max } = req.body ?? {};
  if (!JOB_TYPES.has(type)) return res.status(400).json({ error: 'Type de tâche inconnu.' });

  // Plafond par utilisateur : on purge d'abord, puis on refuse au-delà de la limite.
  pruneJobs();
  const mine = [...AI_JOBS.values()].filter(j => j.userId === req.user.id);
  if (mine.filter(j => j.status === 'running').length >= 8)
    return res.status(429).json({ error: 'Trop d\'analyses en cours. Attendez qu\'elles se terminent.' });
  if (mine.length >= JOB_MAX_PER_USER) {
    // Retire les plus anciennes tâches terminées de cet utilisateur.
    mine.filter(j => j.status !== 'running')
      .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))
      .slice(0, mine.length - JOB_MAX_PER_USER + 1)
      .forEach(j => AI_JOBS.delete(j.id));
  }

  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(), userId: req.user.id, type, max: !!max,
    label: (typeof label === 'string' && label.trim()) ? label.trim().slice(0, 140) : 'Analyse IA',
    status: 'running', progress: 0, indeterminate: false, steps: [],
    location: (location && typeof location.url === 'string') ? { url: location.url.slice(0, 300) } : null,
    payload: payload || {}, result: null, error: null,
    cancelRequested: false, _abort: new AbortController(),
    created_at: now, updated_at: now,
  };
  AI_JOBS.set(job.id, job);
  startJob(job);
  res.status(201).json({ id: job.id, job: publicJob(job) });
});

// Liste des tâches de l'utilisateur (widget de suivi). Actives + terminées récentes.
app.get('/api/saas/jobs', requireAuth, (req, res) => {
  pruneJobs();
  const jobs = [...AI_JOBS.values()]
    .filter(j => j.userId === req.user.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, JOB_MAX_PER_USER)
    .map(publicJob);
  res.json({ jobs });
});

// Détail d'une tâche AVEC son résultat (récupéré par la page d'origine).
app.get('/api/saas/jobs/:id', requireAuth, (req, res) => {
  const job = AI_JOBS.get(req.params.id);
  if (!job || job.userId !== req.user.id) return res.status(404).json({ error: 'Tâche introuvable.' });
  res.json({ ...publicJob(job), result: job.result });
});

// Annuler une tâche en cours.
app.post('/api/saas/jobs/:id/cancel', requireAuth, (req, res) => {
  const job = AI_JOBS.get(req.params.id);
  if (!job || job.userId !== req.user.id) return res.status(404).json({ error: 'Tâche introuvable.' });
  if (job.status === 'running') {
    job.cancelRequested = true;
    try { job._abort.abort(); } catch {}
  }
  res.json({ ok: true, job: publicJob(job) });
});

// Fermer une tâche terminée (retire sa carte du widget).
app.post('/api/saas/jobs/:id/dismiss', requireAuth, (req, res) => {
  const job = AI_JOBS.get(req.params.id);
  if (!job || job.userId !== req.user.id) return res.status(404).json({ error: 'Tâche introuvable.' });
  if (job.status === 'running') { job.cancelRequested = true; try { job._abort.abort(); } catch {} }
  AI_JOBS.delete(req.params.id);
  res.json({ ok: true });
});

// ─── Démarrage ────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Erreur route Express:', req.method, req.originalUrl || req.url, err && (err.stack || err.message || err));
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Erreur serveur' });
});

assertSecretsOrExit();
connectDB().then(async () => {
  await seedCatalogIfEmpty();
  app.listen(PORT, () => console.log(`\n  ✓  LIQUID+  →  http://localhost:${PORT}\n`));
}).catch(err => {
  console.error('Impossible de se connecter à MongoDB :', err.message);
  process.exit(1);
});
