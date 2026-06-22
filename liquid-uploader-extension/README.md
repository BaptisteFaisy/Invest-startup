# liquid + — Extension d'upload de documents

Extension Chrome (Manifest V3) qui permet de **glisser-déposer un fichier** pour l'envoyer
directement dans votre espace « Mes documents » du site liquid + (collection `saas_documents`).

## Installation (mode développeur)

1. Ouvrez Chrome → `chrome://extensions`
2. Activez **Mode développeur** (en haut à droite)
3. Cliquez **Charger l'extension non empaquetée**
4. Sélectionnez le dossier `liquid-uploader-extension/`
5. Épinglez l'icône « liquid + — Upload » dans la barre d'outils

## Utilisation

1. Cliquez sur l'icône → **connectez-vous** avec votre email / mot de passe liquid +
   (le code 2FA est demandé si activé sur votre compte).
2. **Glissez-déposez** un fichier sur la zone (ou cliquez pour parcourir).
3. Le fichier est téléversé immédiatement dans votre espace ; il apparaît dans
   « Documents récents » et sur la page Dossiers du site.

Formats acceptés : PDF, DOCX, DOC, XLSX, XLS, PNG, JPG.

## Réglage du serveur

Par défaut l'extension cible `http://localhost:3000`. Pour pointer vers un autre
serveur (production), cliquez sur ⚙ et renseignez l'URL, puis **Enregistrer**.

> Si vous changez l'URL pour un domaine de production, ajoutez ce domaine dans
> `host_permissions` du `manifest.json` (ou laissez `https://*/*`).

## Comment ça marche

- Authentification par **token JWT** : `POST /api/auth/login` (et `…/2fa/verify` si 2FA),
  token conservé dans `chrome.storage.local`.
- Upload : `POST /api/saas/documents` en `multipart/form-data` (champ `file`),
  avec l'en-tête `Authorization: Bearer <token>` — exactement l'endpoint utilisé
  par la page « Mes documents ».
