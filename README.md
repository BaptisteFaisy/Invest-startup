# LIQUID+ — Guide complet du projet

> **Pour qui ?** Ce document explique le projet de zéro, sans prérequis technique. Tu peux le lire même si tu n'as jamais écrit une ligne de code.

---

## Table des matières

1. [C'est quoi LIQUID+ ?](#1-cest-quoi-liquid-)
2. [Architecture générale — vue d'ensemble](#2-architecture-générale--vue-densemble)
3. [Les deux faces du produit](#3-les-deux-faces-du-produit)
4. [La pile technique (stack)](#4-la-pile-technique-stack)
5. [Structure des fichiers](#5-structure-des-fichiers)
6. [La base de données (MongoDB)](#6-la-base-de-données-mongodb)
7. [Le serveur (server.js)](#7-le-serveur-serverjs)
8. [Les pages publiques](#8-les-pages-publiques)
9. [Le SaaS — gestion des dossiers](#9-le-saas--gestion-des-dossiers)
10. [L'éditeur de documents](#10-léditeur-de-documents)
11. [L'assistant IA (Claude)](#11-lassistant-ia-claude)
12. [Authentification & sécurité](#12-authentification--sécurité)
13. [Les modèles de documents juridiques](#13-les-modèles-de-documents-juridiques)
14. [Variables d'environnement (.env)](#14-variables-denvironnement-env)
15. [Déploiement sur Railway](#15-déploiement-sur-railway)
16. [Lancer le projet en local](#16-lancer-le-projet-en-local)
17. [Flux utilisateur — parcours type](#17-flux-utilisateur--parcours-type)
18. [Lexique technique](#18-lexique-technique)
13. [Les modèles de documents juridiques](#13-les-modèles-de-documents-juridiques)
14. [Variables d'environnement (.env)](#14-variables-denvironnement-env)
15. [Lancer le projet en local](#15-lancer-le-projet-en-local)
16. [Flux utilisateur — parcours type](#16-flux-utilisateur--parcours-type)
17. [Lexique technique](#17-lexique-technique)

---

## 1. C'est quoi LIQUID+ ?

**LIQUID+** est une plateforme en ligne qui aide les startups françaises à lever des fonds. Le service se décompose en deux parties :

### La partie "service" (public)
Un site vitrine qui présente LIQUID+ comme un accompagnateur de levée de fonds. Le modèle commercial est simple : **LIQUID+ ne se rémunère que si la startup lève effectivement des fonds** (success fee). La plateforme promet un accès à plus de 3 000 VCs (fonds de capital-risque) et business angels, ainsi qu'une aide à la préparation du pitch deck et de l'analyse financière.

### La partie SaaS (outil payant)
Un **outil de gestion documentaire juridique** accessible après connexion. Concrètement, quand une startup prépare une levée de fonds, elle doit produire des dizaines de documents juridiques (NDA, term sheet, pacte d'associés, statuts…). Le SaaS de LIQUID+ :
- Organise ces documents en 7 phases chronologiques de la levée
- Fournit des modèles pré-rédigés pour chaque document
- Intègre un éditeur de texte pour rédiger/modifier les documents
- Intègre un assistant IA (Claude d'Anthropic) pour aider à rédiger et négocier les clauses

---

## 2. Architecture générale — vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                   Navigateur de l'utilisateur            │
│  (Chrome, Firefox, Safari — aucune installation requise) │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTP (requêtes web)
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    server.js (Node.js)                   │
│   Le "cerveau" : gère les connexions, les fichiers,      │
│   les droits d'accès et toutes les données.              │
│                                                          │
│   Port : 3000 (local) / 443 (production HTTPS)          │
└──────┬──────────────────────┬───────────────────────────┘
       │                      │
       ▼                      ▼
┌─────────────┐      ┌────────────────────┐
│  MongoDB    │      │  Services externes  │
│  (Atlas)    │      │  • Claude (IA)      │
│  Base de    │      │  • CloudConvert     │
│  données    │      │    (PDF ↔ DOCX)     │
│  cloud      │      │  • Google OAuth     │
└─────────────┘      └────────────────────┘
```

**En résumé :** Le navigateur parle au serveur, le serveur parle à la base de données et aux services externes, et renvoie les réponses au navigateur.

---

## 3. Les deux faces du produit

### Face 1 — Site public (`/`)
Accessible à tout le monde, sans connexion. Pages : accueil, présentation du marché, catalogue des startups.

### Face 2 — SaaS (`/saas`)
Accessible uniquement après connexion. C'est l'outil de travail. Il est servi à l'adresse `/saas` sur le même serveur que le site public, ce qui permet de partager la même session utilisateur sans complication.

### Portail Startup (pages `startup-*.html`)
Un espace séparé où les startups peuvent créer un compte et déposer leurs documents pour qu'un investisseur (connecté côté investisseur) puisse les consulter.

### Panel Admin (`admin.html`)
Réservé aux emails `baptiste.faisy@gmail.com` et `bg.fsg.invest@gmail.com`. Permet de gérer le catalogue des startups, télécharger des images, etc.

---

## 4. La pile technique (stack)

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Serveur | **Node.js + Express** | Reçoit les requêtes HTTP, sert les fichiers, expose l'API |
| Hébergement | **Railway** | Plateforme cloud qui héberge et fait tourner le serveur Node.js en production |
| Base de données | **MongoDB Atlas** | Stockage de toutes les données (cloud) |
| Frontend | **HTML + CSS + JS vanilla** | Pages web, sans framework (pas de React, pas de Vue) |
| Auth | **JWT + bcrypt** | Connexion sécurisée, mots de passe chiffrés |
| Auth sociale | **Google OAuth 2.0** | Connexion avec un compte Google |
| Double auth | **TOTP (speakeasy)** | Authentification à deux facteurs (code temporaire type Google Authenticator) |
| IA | **Anthropic Claude** | Assistant de rédaction juridique |
| Conversion | **CloudConvert** | Convertit les documents entre PDF et DOCX |
| Parsing DOCX | **mammoth** | Lit les fichiers Word et les convertit en HTML |
| QR codes | **qrcode** | Génère les QR codes pour la configuration 2FA |
| Uploads | **multer** | Gère les fichiers envoyés par les utilisateurs |

**Pourquoi du vanilla JS ?** Pas de framework front-end signifie moins de dépendances, un déploiement ultra-simple (un seul dossier), et des pages qui se chargent vite.

---

## 5. Structure des fichiers

```
invest-startup/
│
├── server.js              ← Le serveur (toute la logique backend)
├── package.json           ← Dépendances Node.js
├── .env                   ← Clés API et secrets (NE PAS PARTAGER)
├── start.bat              ← Script de démarrage Windows
│
├── styles.css             ← CSS du site public
├── index.html             ← Page d'accueil publique
├── login.html             ← Connexion investisseur
├── register.html          ← Inscription investisseur
├── investments.html       ← Suivi des investissements
├── marche.html            ← Page marché / analyse
├── startups.html          ← Catalogue des startups
├── admin.html             ← Panel administrateur
├── settings.html          ← Paramètres compte (2FA, mot de passe)
├── startup-*.html         ← Portail startups (login, dashboard)
├── comment-ca-marche.html ← Page explicative
├── nav.js                 ← Navigation commune
│
├── uploads/               ← Fichiers envoyés par les utilisateurs
│   └── public/            ← Images publiques (logos, etc.)
│
└── Saas/                  ← L'outil SaaS (accessible via /saas)
    ├── index.html         ← Accueil SaaS
    ├── login.html         ← Connexion SaaS (même compte)
    ├── register.html      ← Inscription SaaS
    ├── dossiers.html      ← Gestion des dossiers et documents ★
    ├── editor.html        ← Interface de l'éditeur
    ├── editor.js          ← Logique de l'éditeur (~2 700 lignes) ★
    ├── editor.css         ← Style de l'éditeur
    ├── styles.css         ← Style général du SaaS
    ├── auth.js            ← Vérification de session côté client
    ├── documents.js       ← Gestion des fichiers importés
    └── ressources/
        └── modeles/       ← 35+ modèles de documents juridiques
            ├── accord-de-confidentialite-nda.html
            ├── term-sheet-lettre-d-intention.html
            ├── pacte-d-associes-shareholders-agreement.html
            └── ... (35 fichiers au total)
```

---

## 6. La base de données (MongoDB)

MongoDB est une base de données "NoSQL" : au lieu de tables avec des colonnes fixes (comme Excel), elle stocke des **documents JSON** (des objets clé-valeur flexibles).

### Collections (= tables)

| Collection | Contenu |
|------------|---------|
| `users` | Comptes investisseurs (email, mot de passe haché, nom, 2FA…) |
| `startup_accounts` | Comptes startups |
| `documents` | Fichiers déposés par les startups pour les investisseurs |
| `catalog` | Catalogue public des startups présentées sur le site |
| `news` | Actualités affichées aux utilisateurs connectés |
| `saas_documents` | Documents créés/importés par l'utilisateur dans le SaaS |
| `saas_folders` | Dossiers (phases de levée) de l'utilisateur dans le SaaS |

### Exemple d'un document `saas_documents`
```json
{
  "id": 42,
  "user_id": 7,
  "name": "Mon NDA avec InvestCorp",
  "kind": "termsheet",
  "html": "<h1>ACCORD DE CONFIDENTIALITÉ...</h1>",
  "folder_id": 3,
  "size": 18420,
  "created_at": "2026-05-12T10:23:00Z",
  "updated_at": "2026-06-20T14:05:00Z"
}
```

### Connexion MongoDB
La base est hébergée sur **MongoDB Atlas** (cloud). La connexion passe par une URI standard (pas SRV) car le réseau local ne résout pas les enregistrements SRV :
```
mongodb://user:password@hote1:27017,hote2:27017,hote3:27017/liquidplus?...
```

---

## 7. Le serveur (server.js)

`server.js` est le cœur du projet. Ce fichier unique de ~2 000 lignes fait tout :
- Sert les fichiers HTML/CSS/JS au navigateur
- Gère la connexion des utilisateurs
- Expose une API REST pour toutes les actions

### Routes API principales

#### Authentification
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/register` | Créer un compte |
| POST | `/api/auth/login` | Se connecter |
| POST | `/api/auth/logout` | Se déconnecter |
| GET | `/api/auth/me` | Profil de l'utilisateur connecté |
| POST | `/api/auth/google/token` | Connexion Google OAuth |
| GET | `/api/auth/2fa/status` | Vérifier si 2FA activée |
| POST | `/api/auth/2fa/setup` | Configurer la 2FA |

#### SaaS — Dossiers
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/saas/folders` | Lister les dossiers (crée les 7 phases auto) |
| POST | `/api/saas/folders` | Créer un dossier personnalisé |
| PUT | `/api/saas/folders/:id` | Renommer un dossier |
| DELETE | `/api/saas/folders/:id` | Supprimer un dossier |
| PUT | `/api/saas/folders/:id/checklist` | Lier un document à un point de checklist |
| PUT | `/api/saas/documents/:id/folder` | Déplacer un document dans un dossier |

#### SaaS — Documents
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/saas/documents` | Lister tous les documents |
| POST | `/api/saas/termsheets` | Créer un nouveau document (term sheet) |
| PUT | `/api/saas/termsheets/:id` | Sauvegarder les modifications |
| GET | `/api/saas/termsheets/:id` | Charger un document |
| POST | `/api/saas/documents` | Importer un fichier (PDF, DOCX, XLSX…) |
| GET | `/api/saas/documents/:id/download` | Télécharger un fichier |
| DELETE | `/api/saas/documents/:id` | Supprimer un document |
| POST | `/api/saas/documents/:id/convert` | Convertir PDF ↔ DOCX |
| POST | `/api/saas/termsheets/:id/export` | Exporter en DOCX/PDF |
| POST | `/api/saas/documents/:id/to-editor` | Ouvrir un fichier importé dans l'éditeur |

#### SaaS — Intelligence artificielle
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/saas/clause-chat` | L'assistant réécrit une clause (streaming) |
| POST | `/api/saas/clause-explain` | Explique une clause en langage simple |
| POST | `/api/saas/clause-verify` | Vérifie si une clause est favorable |
| POST | `/api/saas/doc-advice` | Conseils globaux sur le document |
| POST | `/api/saas/doc-analyze` | Analyse complète du document (bibliothèque + conseils) |
| POST | `/api/saas/clauses-explain` | Explique toutes les clauses d'un coup |
| GET | `/api/saas/usage` | Compteur d'utilisation de l'IA |

---

## 8. Les pages publiques

### `index.html` — Page d'accueil
La page principale de LIQUID+. Sections : héro (accroche), proposition de valeur, statistiques (3 000+ investisseurs, 0 € si vous ne levez pas…), étapes du service, témoignages, plans tarifaires, prise de contact via Calendly.

### `marche.html` — Analyse de marché
Grande page (~140 Ko) avec une analyse détaillée du marché de la levée de fonds en France : données statistiques, types d'investisseurs, étapes d'une levée, clauses types. Sert de contenu éducatif pour les startups.

### `startups.html` — Catalogue
Liste des startups disponibles dans le catalogue LIQUID+ pour les investisseurs.

### `admin.html` — Panel administrateur
Interface réservée aux admins pour gérer le catalogue de startups : ajouter, modifier, supprimer, télécharger des images.

---

## 9. Le SaaS — gestion des dossiers

**Fichier clé : `Saas/dossiers.html`**

C'est la page centrale du SaaS. Elle affiche :

### Les 7 phases de levée (dossiers système)
Chaque fois que l'utilisateur ouvre cette page, le serveur **crée automatiquement** ces 7 dossiers s'ils n'existent pas encore, dans l'ordre chronologique d'une levée de fonds :

| Phase | Contenu de la checklist |
|-------|------------------------|
| **1 · Mise en ordre juridique** | Statuts, Kbis, cap table, RBE, PV d'AG, pacte existant… |
| **2 · Confidentialité & approche** | NDA, engagement de confidentialité data room |
| **3 · Lettre d'intention / Term sheet** | Term sheet, clause d'exclusivité |
| **4 · Audit juridique (due diligence)** | Data room, questionnaire DD, rapport d'audit, litiges |
| **5 · Documentation de l'opération** | Pacte d'associés, statuts modifiés, bulletin de souscription, GAP… |
| **6 · Closing** | PV d'AGE, certificat dépositaire, registre mis à jour, cap table post-money |
| **7 · Formalités & post-closing** | Dépôt au greffe, RBE mis à jour, reporting investisseurs… |

### Comment fonctionne la checklist
Chaque dossier contient une liste de points à compléter. Pour chaque point, l'utilisateur peut :
1. **Créer un document depuis un modèle** ("Modèle") → ouvre l'éditeur avec le template pré-rempli
2. **Importer un fichier existant** (glisser-déposer ou sélection)
3. **Marquer comme finalisé** (coche verte)

Une fois un document lié à un point, il apparaît **uniquement** sur ce point (et non pas en double dans la liste de fichiers du dossier).

### Dossiers personnalisés
L'utilisateur peut aussi créer ses propres dossiers (sans checklist), pour organiser librement ses autres documents.

### "Fichiers importés"
Un dossier virtuel qui regroupe tous les documents sans dossier assigné.

---

## 10. L'éditeur de documents

**Fichiers clés : `Saas/editor.html` + `Saas/editor.js`**

`editor.js` fait ~2 700 lignes. C'est un éditeur de texte riche complet.

### Fonctionnalités de l'éditeur

**Mise en forme**
- Styles de paragraphe : Normal, Titre 1/2/3, Citation
- Polices : Libre Franklin, Archivo, Georgia, Times New Roman, Arial, Courier New
- Taille, gras, italique, souligné, barré
- Couleur du texte, surlignage
- Alignement (gauche, centre, droite, justifié)
- Listes à puces et numérotées
- Annuler / Rétablir

**Documents juridiques**
- **Bibliothèque** : liste toutes les clauses du document actif ; clic sur une clause pour y aller
- **Priorités** : liste des points à négocier par ordre de priorité, côté fondateur
- **Bouton Analyser** : envoie le document à Claude pour remplir la bibliothèque et les priorités

**Sauvegarde & export**
- Sauvegarde automatique en base de données
- Export en **DOCX** (Word, via CloudConvert)
- Export en **PDF** (impression navigateur)

**Import**
- Importer un PDF, DOCX, XLSX, JPG/PNG
- Les DOCX peuvent être convertis en HTML et ouverts dans l'éditeur
- Les PDF peuvent être convertis en DOCX via CloudConvert

### Comment l'éditeur charge un document
1. L'URL contient `?doc=ID` (et optionnellement `?folder=ID`)
2. L'éditeur fait `GET /api/saas/termsheets/ID` et affiche le HTML dans la zone éditable
3. Quand l'utilisateur clique "Enregistrer", l'éditeur fait `PUT /api/saas/termsheets/ID`

### Le contenu éditable
Le texte est directement éditable dans le navigateur grâce à `contenteditable`. Le HTML produit est stocké tel quel dans MongoDB.

---

## 11. L'assistant IA (Claude)

Le SaaS intègre **Claude** (d'Anthropic) dans deux contextes différents.

### Assistant de clause (panneau de gauche)
Dans l'éditeur, si l'utilisateur sélectionne une clause et clique sur "Réécrire" :
- Le texte sélectionné + une instruction (ex. "rends cette clause plus favorable au fondateur") sont envoyés à l'API Claude
- La réponse arrive **en streaming** (mot par mot, comme ChatGPT) et remplace la clause dans l'éditeur

Routes concernées :
- `/api/saas/clause-chat` — Réécriture interactive
- `/api/saas/clause-explain` — Explication en langage simple
- `/api/saas/clause-verify` — Vérification de la balance des pouvoirs

### Analyse globale du document
Bouton "Analyser" dans la topbar :
- Envoie le HTML complet du document à Claude
- Claude identifie les clauses, les explique, les note (favorable / neutre / défavorable au fondateur) et génère des priorités de négociation
- Résultat : la bibliothèque de clauses et le panneau "Priorités" se remplissent

Routes concernées :
- `/api/saas/doc-analyze` — Analyse complète (streaming)
- `/api/saas/doc-advice` — Conseils spécifiques
- `/api/saas/clauses-explain` — Explication de toutes les clauses

### Modèle utilisé
Claude Sonnet (le modèle par défaut d'Anthropic). Si la clé `ANTHROPIC_API_KEY` n'est pas définie dans `.env`, toutes les fonctionnalités IA sont désactivées silencieusement.

### Compteur d'utilisation
`GET /api/saas/usage` retourne le nombre d'appels IA du mois en cours pour l'utilisateur connecté. Permet d'afficher un indicateur de consommation.

---

## 12. Authentification & sécurité

### Mot de passe classique
1. L'utilisateur entre email + mot de passe
2. Le serveur vérifie le mot de passe avec **bcrypt** (algorithme de hachage : le mot de passe n'est jamais stocké en clair)
3. Si correct, le serveur génère un **JWT** (JSON Web Token) — un jeton signé qui prouve l'identité
4. Ce jeton est stocké dans un **cookie HTTP-only** (inaccessible au JavaScript, protège contre les attaques XSS)
5. Le cookie dure **7 jours**

### Connexion Google OAuth
1. L'utilisateur clique "Continuer avec Google"
2. Google renvoie un token d'identité
3. Le serveur vérifie le token auprès de Google, récupère l'email, et connecte ou crée le compte

### Double authentification (2FA — TOTP)
Optionnelle. L'utilisateur peut l'activer dans ses paramètres :
1. Le serveur génère un **secret TOTP** (code 32 caractères)
2. Un QR code est affiché — l'utilisateur le scanne avec Google Authenticator ou Authy
3. À chaque connexion, un code à 6 chiffres (valable 30 secondes) est demandé

### Niveaux d'accès
| Niveau | Condition | Pages accessibles |
|--------|-----------|-------------------|
| Anonyme | Pas connecté | Site public, page de connexion |
| Utilisateur | JWT valide | SaaS complet, investments, settings |
| Startup | Cookie `startup_token` valide | Portail startup uniquement |
| Admin | JWT + email dans `ADMIN_EMAILS` | Panel admin |

---

## 13. Les modèles de documents juridiques

**Dossier : `Saas/ressources/modeles/`**

Il y a **35+ modèles** de documents juridiques pré-rédigés, un pour chaque point de checklist des 7 phases. Chaque modèle est un fichier HTML avec une structure spéciale.

### Structure d'un modèle
```html
<!-- Titre du document -->
<h1 class="doc-title">ACCORD DE CONFIDENTIALITÉ (NDA)</h1>
<p class="doc-sub">Accord de non-divulgation bilatéral — droit français</p>

<!-- Groupe de clauses (section) -->
<div class="ts-group">Entre les soussignés</div>

<!-- Clause individuelle -->
<div class="ts-clause" data-key="duree"
     data-plain="Le secret tient pendant 3 ou 5 ans...">
  <div class="ts-label">Article 8 — Durée</div>
  <div class="ts-content">
    <p>Les obligations... [DURÉE] ans...</p>
  </div>
</div>

<!-- Options alternatives (remplacements de clauses) -->
<script type="application/json" data-conditions>
{
  "duree": [
    {"id": "nda_duree_3", "label": "3 ans", "html": "..."},
    {"id": "nda_duree_5", "label": "5 ans", "html": "..."}
  ]
}
</script>

<!-- Priorités spécifiques à CE document -->
<script type="application/json" data-advice>
[
  {"title": "Choisir la durée", "body": "Fixez 3 ou 5 ans..."},
  {"title": "Compléter les parties", "body": "..."}
]
</script>
```

### Attributs importants
- `data-key` : identifie les clauses qui ont des variantes alternatives
- `data-plain` : explication en langage courant (affichée dans la bulle d'info)
- `data-conditions` : variantes alternatives (ex. durée 3 ans vs 5 ans)
- `data-advice` : priorités de négociation pré-baked pour ce modèle spécifique

### Liste des modèles disponibles
- Accord de confidentialité (NDA)
- Term sheet / lettre d'intention
- Pacte d'associés (shareholders agreement)
- Statuts à jour / modifiés
- Cap table / registre des mouvements de titres
- Convention de GAP (garantie d'actif et passif)
- PV d'AGE, PV de constatation
- Questionnaire de due diligence
- Data room structurée
- Bulletin de souscription
- … et 25+ autres

---

## 14. Variables d'environnement (.env)

Le fichier `.env` contient tous les secrets. **Il ne doit jamais être partagé ni mis sur Git.**

| Variable | Valeur par défaut | Description |
|----------|------------------|-------------|
| `MONGODB_URI` | *(obligatoire)* | URI de connexion MongoDB Atlas |
| `ANTHROPIC_API_KEY` | *(vide = IA désactivée)* | Clé API Claude pour l'assistant IA |
| `CLOUDCONVERT_API_KEY` | *(vide = conversion désactivée)* | Clé CloudConvert pour PDF ↔ DOCX |
| `GOOGLE_CLIENT_ID` | *(obligatoire pour OAuth)* | Client ID Google OAuth |
| `GOOGLE_CLIENT_SECRET` | *(obligatoire pour OAuth)* | Secret Google OAuth |
| `BASE_URL` | `http://localhost:3000` | URL de base du site |
| `JWT_SECRET` | `invest_bg_dev_secret_CHANGE_IN_PROD` | Secret de signature des JWT — **changer en prod !** |
| `STARTUP_SECRET` | `startup_post_secret_2026` | Secret pour l'API startup |
| `PORT` | `3000` | Port d'écoute du serveur |

---

## 15. Déploiement sur Railway

**Railway** est la plateforme cloud qui fait tourner le projet en production. C'est l'équivalent de "l'ordinateur dans le cloud" qui tourne 24h/24 et rend le site accessible à tous.

### Pourquoi Railway ?
- Déploiement en **un clic** depuis le dépôt Git : dès qu'on pousse du code, Railway reconstruit et redémarre le serveur automatiquement
- Gère le **HTTPS** et le **nom de domaine** personnalisé sans configuration manuelle
- Injecte les **variables d'environnement** (clés API, secrets) de façon sécurisée, sans toucher au code
- Facture à l'usage — pas de serveur à gérer, pas de VPS à maintenir

### Comment Railway lance le projet
Railway lit `package.json` et exécute la commande `start` :
```json
"scripts": {
  "start": "node server.js"
}
```
Il suffit que le serveur écoute sur `process.env.PORT` (Railway injecte ce port automatiquement), ce qui est déjà le cas :
```javascript
const PORT = process.env.PORT || 3000;
```

### Variables d'environnement sur Railway
Toutes les variables du fichier `.env` local doivent être **saisies dans le panel Railway** (section "Variables" du service) :

| Variable Railway | Valeur |
|-----------------|--------|
| `MONGODB_URI` | L'URI MongoDB Atlas (non-SRV) |
| `ANTHROPIC_API_KEY` | Clé Anthropic pour l'IA |
| `CLOUDCONVERT_API_KEY` | Clé CloudConvert |
| `GOOGLE_CLIENT_ID` | Client ID Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Secret Google OAuth |
| `BASE_URL` | L'URL publique Railway (ex. `https://liquidplus.up.railway.app`) |
| `JWT_SECRET` | Une longue chaîne aléatoire secrète |
| `NODE_ENV` | `production` |

> **Important :** Quand `NODE_ENV=production`, le cookie de session passe en `secure: true` et `sameSite: none`, ce qui est requis pour fonctionner en HTTPS.

### Domaine personnalisé
Dans Railway > Settings > Networking, on peut lier un domaine comme `www.liquidplus.fr`. Railway gère le certificat SSL automatiquement.

### Fichiers uploadés
Les fichiers déposés par les utilisateurs (dossier `uploads/`) sont **éphémères sur Railway** : ils disparaissent à chaque redéploiement. Si des uploads persistants sont nécessaires, il faut migrer vers un stockage externe (ex. AWS S3, Cloudflare R2).

---

## 16. Lancer le projet en local

### Prérequis
- **Node.js** version 18+ ([nodejs.org](https://nodejs.org))
- Un compte **MongoDB Atlas** avec une base nommée `liquidplus`
- Accès internet (pour MongoDB Atlas et les APIs externes)

### Installation

```bash
# 1. Aller dans le dossier du projet
cd "invest-startup"

# 2. Installer les dépendances Node.js
npm install

# 3. Remplir le fichier .env avec tes vraies clés

# 4. Démarrer le serveur
node server.js
# ou en mode développement (redémarre automatiquement à chaque modification) :
npx nodemon server.js
```

### Sur Windows
Double-cliquer sur `start.bat` — il lance le serveur et configure automatiquement le port pour les tests sur émulateur Android.

### Accès
- Site public : `http://localhost:3000`
- SaaS : `http://localhost:3000/saas`
- Panel admin : `http://localhost:3000/admin.html` (email admin requis)

---

## 16. Flux utilisateur — parcours type

### Scénario : une startup prépare son NDA

```
1. L'utilisateur ouvre http://localhost:3000/saas/login.html
   → Entre son email + mot de passe
   → Le serveur vérifie et pose un cookie "auth_token"

2. Redirection vers /saas/dossiers.html
   → Le serveur crée automatiquement les 7 dossiers de phases (si premier accès)
   → La page affiche les 7 dossiers pliés

3. L'utilisateur ouvre le dossier "2 · Confidentialité & approche"
   → Il voit la checklist : "Accord de confidentialité (NDA)" et "Engagement data room"

4. Il clique sur "Modèle" à côté de "Accord de confidentialité (NDA)"
   → dossiers.html récupère le template HTML du NDA
   → Crée un nouveau document en base : POST /api/saas/termsheets
   → Lie ce document au point de checklist : PUT /api/saas/folders/2/checklist
   → Redirige vers editor.html?doc=42&folder=2

5. L'éditeur s'ouvre avec le NDA pré-rempli
   → L'utilisateur remplace les [CROCHETS] par les vraies informations
   → Il peut cliquer "Analyser" pour que Claude lise le document et
     génère les priorités de négociation

6. L'utilisateur clique "Enregistrer"
   → PUT /api/saas/termsheets/42 envoie le HTML en base de données

7. Retour sur dossiers.html
   → Le point "Accord de confidentialité (NDA)" affiche maintenant
     "Mon NDA avec InvestCorp" avec un bouton "Éditer"
   → Le document n'apparaît PAS en double dans la liste de fichiers du dossier
```

---

## 17. Lexique technique

| Terme | Explication simple |
|-------|--------------------|
| **API REST** | Un ensemble d'URLs que le navigateur peut appeler pour obtenir ou envoyer des données (ex. `GET /api/saas/documents` retourne la liste des documents en JSON) |
| **JSON** | Format de données texte lisible par les humains et les machines : `{"nom": "Alice", "age": 30}` |
| **JWT** | Jeton numérique signé qui prouve l'identité d'un utilisateur. Comme un badge magnétique. |
| **Cookie HTTP-only** | Petit fichier stocké dans le navigateur, inaccessible au JavaScript — plus sécurisé |
| **bcrypt** | Algorithme qui transforme un mot de passe en une suite incompréhensible. Même le serveur ne peut pas retrouver le mot de passe original. |
| **TOTP** | "Time-based One-Time Password" — les codes à 6 chiffres qui changent toutes les 30 secondes (Google Authenticator) |
| **MongoDB** | Base de données qui stocke les données sous forme de documents JSON plutôt que de lignes/colonnes |
| **Atlas** | La version cloud hébergée de MongoDB (pas besoin d'installer MongoDB sur le serveur) |
| **contenteditable** | Attribut HTML qui rend une zone de texte directement éditable dans le navigateur |
| **streaming** | Technique où la réponse de l'IA arrive mot par mot plutôt qu'en un seul bloc, comme si quelqu'un tapait en direct |
| **NDA** | Non-Disclosure Agreement = Accord de confidentialité |
| **Term sheet** | Lettre d'intention d'investissement, résume les conditions de la levée avant les contrats définitifs |
| **Cap table** | Tableau de capitalisation : qui détient combien de % de la startup |
| **Due diligence** | Audit de vérification que fait l'investisseur avant d'investir |
| **Closing** | Le jour où les fonds sont officiellement virés et l'augmentation de capital constatée |
| **GAP** | Convention de garantie d'actif et de passif : le fondateur garantit qu'il n'a pas caché de dettes |
| **BSPCE / BSA** | Bons de souscription de parts de créateur d'entreprise / Bons de souscription d'actions — options pour les salariés |
| **ADP** | Actions de préférence — actions avec des droits spéciaux pour les investisseurs |
| **RBE** | Registre des bénéficiaires effectifs — document légal qui identifie qui contrôle vraiment la société |
| **greffe** | Tribunal de commerce — où on dépose les actes officiels de la société |
| **success fee** | Commission payée uniquement en cas de succès (ici : LIQUID+ est payé seulement si la startup lève) |
| **SaaS** | "Software as a Service" — logiciel accessible via un navigateur, sans installation |
| **multer** | Bibliothèque Node.js qui gère les envois de fichiers depuis le navigateur |
| **CloudConvert** | Service externe qui convertit des fichiers entre formats (PDF, DOCX, etc.) via une API |
| **OAuth** | Protocole qui permet de se connecter avec un compte Google/Facebook sans donner son mot de passe au site |

---

*README généré le 26 juin 2026 — reflète l'état du code à cette date.*
