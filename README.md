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
  8. [SaaS — Intégration GLM-5.2 (Z.AI)](#8-saas--intégration-glm-52-zai)
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
| `openai` | IA juridique (GLM-5.2 via Z.AI, endpoint Coding Plan OpenAI-compatible) |
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
    ├── tableau-de-bord.html   # Page centrale du SaaS (~1 400 lignes HTML+JS inline)
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

`FOLDERS_SEED_VERSION = 6` — incrémenter pour forcer la re-sync chez tous les utilisateurs.

Les checklists ne listent que les documents côté investisseurs : ceux que les VC demandent (due diligence) ou qui sont négociés avec eux. Les formalités internes (PV, dépôts au greffe, registres, attestations) n'y figurent plus.

### Les 7 phases (clés de référence)
```
mise-en-ordre      → 10 documents (statuts, Kbis, cap table, RBE…)
confidentialite    → 2  documents (NDA, engagement data room)
term-sheet         → 2  documents (term sheet, clause exclusivité)
due-diligence      → 3  documents (data room, DD questionnaire, contentieux)
documentation      → 5  documents (pacte, statuts modifiés, bulletin souscription…)
closing            → 1  document  (cap table post-money)
post-closing       → 1  document  (reporting investisseurs / info rights)
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

### Ordre d'affichage dans `tableau-de-bord.html`

```
1. « Document en cours » (dernier termsheet modifié, carte sombre dynamique)
2. Section « À faire »   (récap tâches restantes)
3. Phases 1→7            (dossiers système)
4. « Fichiers importés » (PDF/DOCX non classés — les termsheets en sont exclus)
```

Le "Document en cours" est rendu dynamiquement en tête de `render()` : il trouve le termsheet avec le `updated_at` le plus récent parmi tous les docs du user.

### Anti-doublon dans le rendu
`tableau-de-bord.html` construit pour chaque dossier un `Set checklistLinked` à partir des `items_state[*].document_id`. La liste de fichiers du dossier filtre ensuite ces IDs pour éviter l'affichage double. Les termsheets non classés sont en plus exclus du dossier "Fichiers importés" (ils s'affichent dans "Document en cours").

```js
const checklistLinked = new Set(
  Object.values(f.items_state || {}).map(st => st.document_id).filter(id => id != null)
);
const inFolder = docs.filter(d =>
  (f.id == null ? d.folder_id == null : d.folder_id === f.id)
  && !checklistLinked.has(d.id)
  && !(f.virtual && d.kind === 'termsheet')  // termsheets → "Document en cours"
);
```

### Correspondance slug ↔ fichier template
`tableau-de-bord.html` contient un dictionnaire `MODELS` (Set de slugs) indiquant quels points de checklist ont un fichier template dans `Saas/ressources/modeles/`. La conversion nom → slug utilise `slugify()` (accents normalisés, espaces→tirets, caractères spéciaux→vides).

---

## 7. SaaS — Éditeur de documents

### Flux de création depuis un modèle (`useTemplate`)
```
1. tableau-de-bord.html : fetch('/saas/ressources/modeles/<slug>.html')
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

## 8. SaaS — Intégration GLM-5.2 (Z.AI)

**Modèle :** `glm-5.2` via Z.AI, avec `thinking: { type: 'enabled' }` + `reasoning_effort: 'high'` (raisonnement activé sur les routes qui en bénéficient).

**Endpoint :** `https://api.z.ai/api/coding/paas/v4` (abonnement *GLM Coding Plan*, compatible SDK OpenAI). Clé : variable d'environnement `ZAI_API_KEY`.

**Output structuré :** les routes IA renvoient du JSON via le mode `response_format: { type: 'json_object' }` + une instruction de format injectée dans le prompt système, puis un parsing robuste (gestion des éventuels fences markdown). Le thinking consommant des tokens de sortie, `max_tokens` est dimensionné en conséquence.

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

### Stockage des fichiers — tout dans MongoDB

Tous les fichiers binaires du SaaS (imports, conversions, exports) sont stockés dans MongoDB sous le champ `data` (BSON Binary). Aucun fichier n'est écrit sur le disque du serveur Railway.

| Multer config | Usage | Stockage |
|---|---|---|
| `saasUpload` (memoryStorage, 15 Mo) | Imports SaaS | `doc.data` en MongoDB |
| `upload` (diskStorage, 20 Mo) | Portail startup (collection `documents`) | `uploads/` sur disque |
| `imageUpload` (diskStorage, 5 Mo) | Images admin publiques | `uploads/public/` sur disque |

Les contenus des comptes fondateur et avocat sont chiffrés par l'application en AES-256-GCM avant leur écriture dans MongoDB : binaires `data`, HTML éditables, versions validées et caches `extracted_text`. À chaque démarrage, une migration idempotente chiffre les anciens contenus encore en clair. La clé est dérivée de `ENCRYPTION_KEY` et ne doit jamais être modifiée sans procédure de rotation, sous peine de rendre les documents illisibles.

### Export termsheet (HTML → DOCX ou PDF)
```
POST /api/saas/termsheets/:id/export { to: "docx" | "pdf" }
```
1. Charge le HTML depuis la base
2. `buildExportHtml()` l'enveloppe dans un squelette CSS print-friendly
3. `convertHtmlToFile()` encode en Buffer UTF-8 et soumet à CloudConvert via `Readable.from(buffer)`
4. `downloadToBuffer(url)` récupère le résultat en mémoire (pas d'écriture disque)
5. Crée un `saas_documents` avec `data: fileBuf, exported_from: originalId`
6. Renvoie `{ document }` (sans le champ `data`)

### Conversion import DOCX → éditeur
```
POST /api/saas/documents/:id/to-editor
```
1. Lit `doc.data` (BSON Binary) depuis MongoDB, convertit en Buffer via `toBuffer()`
2. `mammoth.convertToHtml({ buffer })` produit du HTML brut
3. `topLevelBlocks()` découpe le HTML (parser de balises maison, sans DOM)
4. Chaque bloc wrappé en `.ts-clause` si précédé d'un heading ou d'un `SECTION_RE`
5. Crée un termsheet (`kind: 'termsheet'`, `editor_source: originalId`), renvoie `{ id }`

### Conversion PDF → DOCX (ou DOCX → PDF)
```
POST /api/saas/documents/:id/convert { to: "docx" | "pdf" }
```
1. Lit `doc.data` depuis MongoDB
2. Upload vers CloudConvert via `Readable.from(buffer)`
3. Résultat téléchargé en mémoire → `data: fileBuf` dans un nouveau `saas_documents`

---

## 10. Frontend — Architecture sans framework

Pas de bundler, pas de build step. Les pages sont des fichiers HTML servis statiquement. Le JS est chargé via `<script src="…">` classique.

### Pattern d'authentification côté client
`auth.js` est inclus en premier dans le `<head>` de toutes les pages SaaS :
```js
// Vérifie GET /api/auth/me — si 401, redirige vers login.html
// Sinon injecte le nom de l'utilisateur dans le DOM
```

### État applicatif dans `tableau-de-bord.html`
Pas de store centralisé. L'état est maintenu dans des variables de module et le DOM est rechargé par une fonction `render()` après chaque mutation. Les données sont fetché une seule fois au chargement via `Promise.all([fetch('/api/saas/folders'), fetch('/api/saas/documents')])`.

### Frise — états des pastilles (`renderFrise`)
Chaque étape n'a que **deux apparences** : neutre (gris) ou **verte**. Il n'y a plus d'état bleu « en cours ». Une pastille passe au vert (`is-done`) uniquement quand **tous les documents de l'étape sont terminés** *et* que toutes les étapes précédentes le sont aussi (vert « séquentiel » : `green = i < sealed`, où `sealed` est la longueur du préfixe d'étapes validées d'affilée depuis le début). Une étape complète mais « en avance » (une étape antérieure manque encore) reste donc neutre tant que la progression n'est pas continue.

### État dans `editor.js`
```js
let currentDocId = null;          // null → POST sur save, sinon PUT
const urlFolderId = new URLSearchParams(location.search).get('folder');
```

L'éditeur expose ses fonctions sur `window` pour l'interopérabilité (certains handlers HTML appellent des fonctions globales).

### Drag & drop
`tableau-de-bord.html` implémente un drag & drop natif (`dragstart`, `dragover`, `drop`) pour :
- Réordonner les points de checklist (ordre local uniquement, non persisté)
- Déposer des fichiers locaux sur un dossier ou un point de checklist

### Import de fichiers (multi-fichiers)
Les `<input type="file">` (`#file-input` du bouton « Importer des fichiers », `#pick-file` du sélecteur d'un point de checklist) portent l'attribut `multiple` : on peut sélectionner plusieurs fichiers d'un coup, comme le glisser-déposer. `uploadFiles(fileList, folderId)` téléverse chaque fichier en série (une requête `POST /api/saas/documents` par fichier) avec une ligne « Import en cours… » optimiste. Pour le sélecteur d'un point de checklist, le **premier** fichier importé remplit l'emplacement (lien/nouvelle version) et les suivants restent rangés dans la même phase.

---

## 11. Déploiement Railway

Railway lit `package.json#scripts.start` et exécute `node server.js`. Le port est injecté via `process.env.PORT`.

### Variables à configurer dans Railway
```
MONGODB_URI           # URI standard (non-SRV) — voir note ci-dessous
ZAI_API_KEY            # Clé Z.AI (GLM Coding Plan) — endpoint /api/coding/paas/v4
CLOUDCONVERT_API_KEY
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_DRIVE_CLIENT_ID      # Data room : par défaut = GOOGLE_CLIENT_ID (même client OAuth)
GOOGLE_DRIVE_CLIENT_SECRET  # Data room : par défaut = GOOGLE_CLIENT_SECRET
DROPBOX_APP_KEY             # Data room : App key Dropbox (console Dropbox)
DROPBOX_APP_SECRET          # Data room : App secret Dropbox
BASE_URL              # https://votre-domaine.railway.app ou domaine custom
JWT_SECRET            # Longue chaîne aléatoire (openssl rand -hex 32)
ENCRYPTION_KEY         # Clé racine du chiffrement applicatif (min. 32 caractères)
NODE_ENV              # production
```

**Note MongoDB SRV :** Railway résout correctement les SRV (`mongodb+srv://`) mais le réseau de développement local ne le fait pas. La `MONGODB_URI` dans `.env` liste donc les 3 hôtes Atlas explicitement. En production sur Railway, on peut utiliser l'URI SRV standard.

**Fichiers SaaS :** Les fichiers importés et exportés par les utilisateurs du SaaS sont stockés dans MongoDB Atlas (champ `data` Binary, 15 Mo max). Ils survivent aux redéploiements Railway sans configuration supplémentaire.

**Fichiers portail startup :** Les uploads du portail startup (collection `documents`) utilisent encore `multer.diskStorage` → `uploads/`. Ces fichiers sont éphémères sur Railway. Si la feature devient critique, migrer vers S3/Cloudflare R2.

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
| `ZAI_API_KEY` | IA | — | Clé Z.AI (GLM Coding Plan). Si absent, routes `/api/saas/*-chat`, `*-explain`, `*-analyze` renvoient 503 |
| `CLOUDCONVERT_API_KEY` | Export | — | Si absent, export DOCX/PDF et conversion renvoient 503 |
| `GOOGLE_CLIENT_ID` | OAuth | — | |
| `GOOGLE_CLIENT_SECRET` | OAuth | — | Non utilisé côté serveur (flow token-only) |
| `GOOGLE_DRIVE_CLIENT_ID` | Data room | `GOOGLE_CLIENT_ID` | OAuth self-service Google Drive (envoi de fichiers depuis Mes dossiers). Ajouter `${BASE_URL}/api/saas/dataroom/google_drive/callback` comme redirect URI autorisée dans la console Google Cloud |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Data room | `GOOGLE_CLIENT_SECRET` | |
| `DROPBOX_APP_KEY` | Data room | — | Si absent, connexion Dropbox indisponible (503). Ajouter `${BASE_URL}/api/saas/dataroom/dropbox/callback` comme redirect URI dans la console Dropbox |
| `DROPBOX_APP_SECRET` | Data room | — | |
| `BASE_URL` | — | `http://localhost:3000` | Utilisé dans les redirects OAuth |
| `JWT_SECRET` | — | `invest_bg_dev_secret_CHANGE_IN_PROD` | Changer en prod |
| `ENCRYPTION_KEY` | ✅ en production | `JWT_SECRET` en développement | Chiffrement AES-256-GCM des documents et secrets ; ne jamais changer sans rotation |
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
