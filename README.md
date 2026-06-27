# LIQUID+ — Architecture technique

Plateforme d'accompagnement à la levée de fonds pour startups françaises. Deux produits dans un seul déploiement : un site marketing public et un SaaS de gestion documentaire juridique avec IA.

---

## Sommaire

1. [Stack & dépendances](#1-stack--dépendances)
2. [Architecture du dépôt](#2-architecture-du-dépôt)
3. [Modèle de données (MongoDB)](#3-modèle-de-données-mongodb)
4. [Serveur Express — organisation des routes](#4-serveur-express--organisation-des-routes)
5. [Authentification](#5-authentification)
6. [SaaS — Gestion des dossiers & checklist](#6-saas--gestion-des-dossiers--checklist)
7. [SaaS — Éditeur de documents](#7-saas--éditeur-de-documents)
8. [SaaS — Intégration Claude (Anthropic)](#8-saas--intégration-claude-anthropic)
9. [SaaS — Export / conversion de fichiers](#9-saas--export--conversion-de-fichiers)
10. [Frontend — Architecture sans framework](#10-frontend--architecture-sans-framework)
11. [Déploiement Railway](#11-déploiement-railway)
12. [Variables d'environnement](#12-variables-denvironnement)
13. [Lancer en local](#13-lancer-en-local)

---

## 1. Stack & dépendances

**Runtime :** Node.js 18+ / Express 4

**Base de données :** MongoDB Atlas (driver natif `mongodb` v6 — pas d'ODM)

**Frontend :** HTML/CSS/JS vanilla, zéro bundler, zéro framework

**Services tiers :**

| Package | Usage |
|---------|-------|
| `@anthropic-ai/sdk` | IA juridique (Claude Opus 4.8 avec extended thinking) |
| `cloudconvert` | Conversion HTML→DOCX, PDF→DOCX, DOCX→PDF |
| `mammoth` | Parse DOCX → HTML brut pour l'éditeur |
| `bcryptjs` | Hachage des mots de passe (10 rounds) |
| `jsonwebtoken` | Sessions via JWT signé (cookie HTTP-only, 7j) |
| `speakeasy` | TOTP 2FA (compatible Google Authenticator) |
| `qrcode` | Génération QR pour la config 2FA |
| `multer` | Upload multipart SaaS en mémoire (15 Mo max) + portail startup sur disque (20 Mo max) |
| `cookie-parser` | Lecture des cookies dans Express |
| `dotenv` | Variables d'environnement depuis `.env` |

**Hébergement :** Railway (PaaS, déploiement continu depuis Git)

---

## 2. Architecture du dépôt

```
invest-startup/
├── server.js           # Serveur unique (~2 100 lignes) — tout le backend
├── package.json
├── .env                # Secrets (gitignored)
├── start.bat           # Raccourci Windows + adb reverse pour émulateur Android
│
├── *.html              # Site public (index, login, register, startups, admin…)
├── styles.css          # CSS du site public
├── nav.js              # Barre de nav partagée
│
├── uploads/            # Fichiers uploadés (éphémères sur Railway — voir §11)
│   └── public/         # Images publiques (logos catalog)
│
└── Saas/               # Servi sous /saas par express.static
    ├── dossiers.html   # Page centrale du SaaS (~1 400 lignes HTML+JS inline)
    ├── editor.html     # Shell de l'éditeur
    ├── editor.js       # Éditeur (~2 700 lignes)
    ├── editor.css
    ├── styles.css
    ├── auth.js         # Guard côté client (redirect si pas de cookie)
    ├── documents.js    # Logique d'upload / liste de fichiers importés
    └── ressources/
        └── modeles/    # 35+ templates HTML de documents juridiques
            ├── accord-de-confidentialite-nda.html
            ├── term-sheet-lettre-d-intention.html
            └── …
```

**Principe de routing :**
```js
app.use('/saas', express.static(path.join(__dirname, 'Saas')));
app.use(express.static(__dirname));
```
Le SaaS est servi sous `/saas` sur la même origine que l'API, donc les cookies de session fonctionnent sans CORS. Toutes les routes API sont sous `/api/*`.

---

## 3. Modèle de données (MongoDB)

Pas d'ODM — accès direct via `db.collection(name)`. Helper `nextId(colName)` pour les IDs auto-incrémentés (pas d'ObjectId exposé en API).

### `users`
```json
{
  "id": 7,
  "email": "alice@startup.fr",
  "password": "$2b$10$...",         // bcrypt, vide si OAuth
  "full_name": "Alice Martin",
  "created_at": "2026-01-10T09:00:00Z",
  "twofa_method": "totp",           // undefined si 2FA désactivée
  "totp_secret": "BASE32SECRET"     // jamais renvoyé en API
}
```

### `saas_folders`
```json
{
  "id": 3,
  "user_id": 7,
  "name": "2 · Confidentialité & approche",
  "key": "confidentialite",         // slug unique (dossiers système)
  "system": true,                   // false pour les dossiers créés par l'user
  "seed_version": 2,                // permet la re-sync si FUNDRAISING_PHASES évolue
  "items_state": {
    "accord-de-confidentialite-nda": {
      "document_id": 42,            // saas_documents.id lié
      "final": false,
      "todos": ["Compléter les parties", "…"],
      "analysis_at": "2026-06-20T14:05:00Z"
    }
  },
  "created_at": "2026-01-10T09:00:00Z"
}
```

### `saas_documents`

Deux sous-types coexistent dans la même collection, distingués par le champ `kind` :

**Termsheet (document éditable, HTML stocké en base) :**
```json
{
  "id": 42,
  "user_id": 7,
  "kind": "termsheet",
  "name": "NDA — InvestCorp",
  "html": "<h1>ACCORD…</h1>",      // HTML complet, stocké en base
  "folder_id": 3,                   // null = non classé
  "size": 18420,
  "editor_source": 11,              // présent si ouvert depuis un fichier DOCX importé
  "created_at": "…",
  "updated_at": "…"
}
```

**Fichier importé (PDF, DOCX, XLSX…, binaire stocké en base) :**
```json
{
  "id": 43,
  "user_id": 7,
  "name": "contrat.pdf",
  "originalname": "contrat.pdf",
  "mimetype": "application/pdf",
  "size": 245120,
  "data": "<Binary>",              // contenu binaire du fichier, stocké dans MongoDB
  "folder_id": 3,
  "converted_from": 42,            // présent si issu d'une conversion CloudConvert
  "exported_from": 42,             // présent si issu d'un export de termsheet
  "created_at": "…"
}
```

> **Stockage binaire :** Les fichiers importés et les exports CloudConvert sont stockés directement dans MongoDB sous le champ `data` (BSON Binary). Limite : 15 Mo par fichier (en dessous du plafond de 16 Mo par document MongoDB). Le champ `data` est systématiquement exclu des réponses JSON par `publicDoc()` — seules les métadonnées sont envoyées au client.

### `saas_claude_usage`
```json
{
  "user_id": 7,
  "requests": 24,
  "input_tokens": 145000,
  "output_tokens": 38000,
  "total_tokens": 183000,
  "updated_at": "2026-06-25T11:00:00Z"
}
```

### Autres collections
- `startup_accounts` — comptes startups (portail séparé)
- `documents` — fichiers partagés startup→investisseur
- `catalog` — startups présentées sur le site public
- `news` — flux d'actualité investisseur

---

## 4. Serveur Express — organisation des routes

`server.js` est un fichier unique sans découpe en modules. Les routes sont regroupées logiquement par blocs de commentaires.

```
/api/auth/*          → Auth investisseur (register, login, logout, me, 2FA, Google OAuth)
/api/startup/*       → Auth & actions portail startup
/api/investor/*      → Documents visibles par les investisseurs
/api/documents/*     → Download sécurisé des fichiers startup
/api/admin/*         → Panel admin (requireAdmin middleware)
/api/news            → Flux d'actualité
/api/investments     → Données de portefeuille (statique pour l'instant)
/api/startups        → Catalogue public
/api/saas/clause-*   → IA : chat, explain, verify sur une clause
/api/saas/doc-*      → IA : analyse et conseils sur le document entier
/api/saas/clauses-*  → IA : explication groupée de toutes les clauses
/api/saas/usage      → Compteur de tokens Claude par user
/api/saas/folders    → CRUD dossiers + checklist
/api/saas/documents  → CRUD documents importés (upload, download, delete)
/api/saas/termsheets → CRUD documents édités (create, save, load)
```

**Middlewares globaux :**
```js
app.use(express.json());
app.use(cookieParser());
app.use('/uploads/public', express.static(PUBLIC_IMG_DIR));
app.use('/saas', express.static(path.join(__dirname, 'Saas')));
app.use(express.static(__dirname));
```

**Guards :**
- `requireAuth` — vérifie `cookie auth_token` OU header `Authorization: Bearer <token>`
- `requireAdmin` — vérifie requireAuth + email dans `ADMIN_EMAILS`
- `requireStartupAuth` — vérifie `cookie startup_token`

---

## 5. Authentification

### Flux email/password
```
POST /api/auth/login
  → bcrypt.compare(password, user.password)
  → si 2FA inactive : jwt.sign({id, email}, JWT_SECRET, {expiresIn:'7d'})
                      → res.cookie('auth_token', token, {httpOnly, secure (prod), sameSite})
  → si 2FA active : jwt.sign({id, email, purpose:'verify_2fa'}, JWT_SECRET, {expiresIn:'5m'})
                    → { requires2FA: true, tempToken }
POST /api/auth/2fa/verify  (tempToken + code TOTP 6 chiffres)
  → speakeasy.totp.verify(secret, token, window=1)
  → si ok : pose le cookie auth_token long durée
```

### Google OAuth (implicit flow modifié)
Le front récupère un `id_token` Google via la librairie Google Identity Services, puis :
```
POST /api/auth/google/token { token }
  → fetch https://oauth2.googleapis.com/tokeninfo?id_token=
  → vérifie aud === GOOGLE_CLIENT_ID
  → createUser si inexistant, puis pose le cookie auth_token
```

### 2FA (TOTP)
```
POST /api/auth/2fa/setup
  → speakeasy.generateSecret({ name: 'LIQUID+:email' })
  → stocke base32 en mémoire (totpSetupStore Map)
  → renvoie { otpauth, secret, qr } (QR code data-URL)
POST /api/auth/2fa/confirm { code }
  → vérifie le code TOTP avec le secret en mémoire
  → si ok : persiste totp_secret (chiffré base32) + twofa_method:'totp' en base
```

### JWT structure
```json
{ "id": 7, "email": "alice@startup.fr", "iat": 1718000000, "exp": 1718604800 }
```
Le secret (`JWT_SECRET`) doit être changé en production.

---

## 6. SaaS — Gestion des dossiers & checklist

### Initialisation automatique des dossiers système

À chaque `GET /api/saas/folders`, la fonction `ensureUserFolders(userId)` s'exécute. Elle compare les dossiers `system: true` existants avec `FUNDRAISING_PHASES` (tableau constant dans server.js). Si un dossier manque ou a un `seed_version` périmé, il est créé/mis à jour. Les dossiers utilisateur (`system: false`) ne sont jamais touchés.

`FOLDERS_SEED_VERSION = 2` — incrémenter pour forcer la re-sync chez tous les utilisateurs.

### Les 7 phases (clés de référence)
```
mise-en-ordre      → 10 documents (statuts, Kbis, cap table, RBE…)
confidentialite    → 2  documents (NDA, engagement data room)
term-sheet         → 2  documents (term sheet, clause exclusivité)
due-diligence      → 4  documents (data room, DD questionnaire, rapport, contentieux)
documentation      → 6  documents (pacte, statuts modifiés, bulletin souscription…)
closing            → 5  documents (PV AGE, certificat dépositaire, registre MàJ…)
post-closing       → 5  documents (greffe, RBE MàJ, reporting investors, covenants…)
```

### Linking checklist ↔ document
```
PUT /api/saas/folders/:id/checklist
Body: { slug: "accord-de-confidentialite-nda", document_id: 42 }
```
Le `slug` est la clé de l'item dans `items_state`. Lors du link :
1. Vérifie que `document_id` appartient au user
2. `$set` `saas_documents.folder_id = id` (range le doc dans la phase)
3. `$set` `saas_folders.items_state[slug].document_id = docId`

Pour délier : `{ document_id: null }` → supprime le champ `document_id` et remet `final: false`.

### Anti-doublon dans le rendu
`dossiers.html` construit pour chaque dossier un `Set checklistLinked` à partir des `items_state[*].document_id`. La liste de fichiers du dossier filtre ensuite ces IDs pour éviter l'affichage double.

```js
const checklistLinked = new Set(
  Object.values(f.items_state || {}).map(st => st.document_id).filter(id => id != null)
);
const inFolder = docs.filter(d =>
  (f.id == null ? d.folder_id == null : d.folder_id === f.id) && !checklistLinked.has(d.id)
);
```

### Correspondance slug ↔ fichier template
`dossiers.html` contient un dictionnaire `MODELS` (Set de slugs) indiquant quels points de checklist ont un fichier template dans `Saas/ressources/modeles/`. La conversion nom → slug utilise `slugify()` (accents normalisés, espaces→tirets, caractères spéciaux→vides).

---

## 7. SaaS — Éditeur de documents

### Flux de création depuis un modèle (`useTemplate`)
```
1. dossiers.html : fetch('/saas/ressources/modeles/<slug>.html')
2. POST /api/saas/termsheets { name, html, folder_id }
   → stocke le doc en base, renvoie { id }
3. PUT /api/saas/folders/:folderId/checklist { slug, document_id: id }
4. window.location.href = 'editor.html?doc=' + id + '&folder=' + folderId
```

### Flux de sauvegarde (`saveTermsheet`)
```js
// editor.js
const urlFolderId = new URLSearchParams(location.search).get('folder');
const body = { name, html };
if (urlFolderId) body.folder_id = Number(urlFolderId);

currentDocId
  ? PUT  /api/saas/termsheets/:id  { name, html, folder_id }
  : POST /api/saas/termsheets      { name, html, folder_id }
```

Côté serveur, le `PUT` n'écrase `folder_id` que si le document n'en a pas encore un (évite de le déplacer accidentellement lors des sauvegardes suivantes).

### Éditeur de texte riche
Zone `contenteditable` pilotée par `document.execCommand` (gras, listes, alignement…). Le HTML résultant est stocké brut en base. L'éditeur parse aussi la structure spécifique des templates (`.ts-clause`, `.ts-label`, `.ts-content`, `.ts-group`) pour alimenter la bibliothèque de clauses dans le panneau latéral.

### Structure d'un document juridique édité
```html
<h1 class="doc-title">ACCORD DE CONFIDENTIALITÉ (NDA)</h1>
<p class="doc-sub">Accord de non-divulgation bilatéral — droit français</p>

<div class="ts-group" contenteditable="false">Entre les soussignés</div>

<div class="ts-clause" data-key="duree" data-plain="Explication en langage courant…">
  <div class="ts-label">Article 8 — Durée</div>
  <div class="ts-content"><p>…[3 / 5] ans…</p></div>
</div>

<!-- Options alternatives embarquées dans le template -->
<script type="application/json" data-conditions>
{ "duree": [{"id":"nda_duree_3","label":"3 ans","html":"…"}, …] }
</script>

<!-- Priorités de négociation spécifiques à ce type de document -->
<script type="application/json" data-advice>
[{"title":"Choisir la durée","body":"…"}, …]
</script>
```

`data-key` : référence une clé dans `data-conditions` pour les variantes alternatives.
`data-plain` : explication pré-baked affichée dans l'encart "Pour bien comprendre" (avant l'appel IA).

---

## 8. SaaS — Intégration Claude (Anthropic)

**Modèle :** `claude-opus-4-8` avec `thinking: { type: 'adaptive' }` (extended thinking activé).

**Output structuré :** Toutes les routes IA utilisent `output_config.format.type = 'json_schema'` (structured outputs d'Anthropic) plutôt que du parsing regex fragile.

### `POST /api/saas/clause-chat` — Assistant de clause

Entrée :
```json
{
  "clauseLabel": "Article 8 — Durée",
  "clauseHtml": "<p>…[3/5] ans…</p>",
  "plain": "Le secret tient pendant 3 ou 5 ans…",
  "documentContext": "Plan complet de la term sheet…",
  "messages": [
    { "role": "user", "content": "Passe à 5 ans" }
  ]
}
```

Output structuré Claude :
```json
{
  "reply": "J'ai modifié la durée de 3 à 5 ans…",
  "edits": [{ "find": "[3 / 5] ans", "replace": "5 ans" }],
  "updatedClause": ""
}
```

Logique de patch côté client : si `edits` est non-vide, l'éditeur fait des find/replace ciblés dans le HTML de la clause. Si `updatedClause` est non-vide, il remplace la clause entière. Les deux ne sont jamais remplis simultanément.

L'historique de conversation est limité aux 16 derniers tours (`messages.slice(-16)`) pour borner le contexte.

### `POST /api/saas/doc-analyze` — Analyse du document

Entrée : `{ title, text }` (texte brut extrait du HTML, tronqué à 14 000 caractères).
Output : `{ todos: ["Compléter les parties…", "…"] }` (4 à 12 items ordonnés).

Les `todos` sont persistés dans `items_state[slug].todos` lors de l'appel suivant à `/api/saas/folders/:id/checklist`.

### `POST /api/saas/clauses-explain` — Explication groupée

Entrée : `{ title, clauses: [{key, label, html}, …] }` (max 60 clauses, HTML tronqué à 4 000 chars chacun).
Output : `{ explanations: [{key, plain}, …] }`.

Utilisé lors du bouton "Analyser" pour pré-remplir les `data-plain` de chaque clause dans le DOM.

### Compteur d'usage — `recordClaudeUsage`

Après chaque appel Claude, la fonction incrémente `saas_claude_usage` :
```js
await col('saas_claude_usage').updateOne(
  { user_id },
  { $inc: { requests: 1, input_tokens, output_tokens, total_tokens }, $set: { updated_at } },
  { upsert: true }
);
```

---

## 9. SaaS — Export / conversion de fichiers

### Export termsheet (HTML → DOCX ou PDF)
```
POST /api/saas/termsheets/:id/export { to: "docx" | "pdf" }
```
1. Charge le HTML du document depuis la base
2. `buildExportHtml()` enveloppe le HTML dans un squelette de page complet avec CSS print-friendly
3. Soumet un job CloudConvert (HTML→DOCX ou HTML→PDF)
4. Télécharge le fichier résultant dans `uploads/`
5. Crée un nouveau `saas_documents` avec `exported_from: originalId`
6. Renvoie `{ document }` au client

### Conversion import DOCX → éditeur
```
POST /api/saas/documents/:id/to-editor
```
1. mammoth convertit le fichier DOCX en HTML brut
2. `topLevelBlocks()` découpe le HTML en blocs de premier niveau (parser de balises maison, pas de DOM)
3. Chaque bloc est wrappé en `.ts-clause` si précédé d'un heading ou d'un titre d'article (`SECTION_RE`)
4. Renvoie `{ id, name, html }` — le client redirige vers `editor.html?doc=id`

### Conversion PDF → DOCX
```
POST /api/saas/documents/:id/convert { to: "docx" }
```
Soumet un job CloudConvert. Le fichier converti est stocké dans `uploads/` et un nouveau `saas_documents` est créé.

---

## 10. Frontend — Architecture sans framework

Pas de bundler, pas de build step. Les pages sont des fichiers HTML servis statiquement. Le JS est chargé via `<script src="…">` classique.

### Pattern d'authentification côté client
`auth.js` est inclus en premier dans le `<head>` de toutes les pages SaaS :
```js
// Vérifie GET /api/auth/me — si 401, redirige vers login.html
// Sinon injecte le nom de l'utilisateur dans le DOM
```

### État applicatif dans `dossiers.html`
Pas de store centralisé. L'état est maintenu dans des variables de module et le DOM est rechargé par une fonction `render()` après chaque mutation. Les données sont fetché une seule fois au chargement via `Promise.all([fetch('/api/saas/folders'), fetch('/api/saas/documents')])`.

### État dans `editor.js`
```js
let currentDocId = null;          // null → POST sur save, sinon PUT
const urlFolderId = new URLSearchParams(location.search).get('folder');
```

L'éditeur expose ses fonctions sur `window` pour l'interopérabilité (certains handlers HTML appellent des fonctions globales).

### Drag & drop
`dossiers.html` implémente un drag & drop natif (`dragstart`, `dragover`, `drop`) pour :
- Réordonner les points de checklist (ordre local uniquement, non persisté)
- Déposer des fichiers locaux sur un dossier ou un point de checklist

---

## 11. Déploiement Railway

Railway lit `package.json#scripts.start` et exécute `node server.js`. Le port est injecté via `process.env.PORT`.

### Variables à configurer dans Railway
```
MONGODB_URI           # URI standard (non-SRV) — voir note ci-dessous
ANTHROPIC_API_KEY
CLOUDCONVERT_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
BASE_URL              # https://votre-domaine.railway.app ou domaine custom
JWT_SECRET            # Longue chaîne aléatoire (openssl rand -hex 32)
NODE_ENV              # production
```

**Note MongoDB SRV :** Railway résout correctement les SRV (`mongodb+srv://`) mais le réseau de développement local ne le fait pas. La `MONGODB_URI` dans `.env` liste donc les 3 hôtes Atlas explicitement. En production sur Railway, on peut utiliser l'URI SRV standard.

**Uploads éphémères :** Railway ne persiste pas le système de fichiers entre déploiements. Les fichiers dans `uploads/` disparaissent à chaque push. Pour une persistance réelle, migrer vers un stockage objet (S3, Cloudflare R2) et remplacer `multer.diskStorage` par un upload direct en mémoire (`multer.memoryStorage`) avec un client S3.

### Domaine personnalisé
Railway Settings → Networking → Custom Domain. Certificat TLS géré automatiquement. Penser à mettre à jour `BASE_URL` et la redirect URI dans la console Google OAuth.

### HTTPS & cookies
```js
const isProd = process.env.NODE_ENV === 'production';
res.cookie('auth_token', token, {
  httpOnly: true,
  secure:   isProd,         // HTTPS obligatoire en prod
  sameSite: isProd ? 'none' : 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
});
```
`sameSite: 'none'` est requis si le SaaS est servi sur un sous-domaine différent de l'API. Ici ils sont sur la même origine, `'lax'` suffirait — mais `'none'` fonctionne aussi avec `secure: true`.

---

## 12. Variables d'environnement

| Variable | Requis | Défaut | Note |
|----------|--------|--------|------|
| `MONGODB_URI` | ✅ | `mongodb://localhost:27017` | URI non-SRV en local |
| `ANTHROPIC_API_KEY` | IA | — | Si absent, routes `/api/saas/*-chat`, `*-explain`, `*-analyze` renvoient 503 |
| `CLOUDCONVERT_API_KEY` | Export | — | Si absent, export DOCX/PDF et conversion renvoient 503 |
| `GOOGLE_CLIENT_ID` | OAuth | — | |
| `GOOGLE_CLIENT_SECRET` | OAuth | — | Non utilisé côté serveur (flow token-only) |
| `BASE_URL` | — | `http://localhost:3000` | Utilisé dans les redirects OAuth |
| `JWT_SECRET` | — | `invest_bg_dev_secret_CHANGE_IN_PROD` | Changer en prod |
| `STARTUP_SECRET` | — | `startup_post_secret_2026` | Auth portail startup |
| `PORT` | — | `3000` | Injecté par Railway |
| `NODE_ENV` | — | — | `production` active HTTPS cookies |

---

## 13. Lancer en local

```bash
# Prérequis : Node.js 18+, accès MongoDB Atlas

cd invest-startup
npm install

# Éditer .env avec les bonnes valeurs (copier depuis .env.example si présent)

# Développement (hot reload)
npx nodemon server.js

# Ou production locale
node server.js
```

Accès :
- `http://localhost:3000` → site public
- `http://localhost:3000/saas` → SaaS (connexion requise)
- `http://localhost:3000/admin.html` → panel admin (email `ADMIN_EMAILS` requis)

**Windows :** `start.bat` lance `node server.js` + `adb reverse tcp:3000 tcp:3000` si un émulateur Android est connecté.
