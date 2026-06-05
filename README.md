# Invest BG — Guide de démarrage

Ce guide explique comment lancer le site sur ton ordinateur, étape par étape.

---

## Ce dont tu as besoin (à faire une seule fois)

### 1. Installer Node.js

Node.js est le programme qui fait tourner le site en local.

1. Va sur **https://nodejs.org**
2. Clique sur le gros bouton vert **"LTS"** (la version stable recommandée)
3. Télécharge et installe le fichier — clique sur "Suivant" à chaque étape, ne change rien

Pour vérifier que l'installation a fonctionné :
- Appuie sur `Windows + R`, tape `cmd`, appuie sur Entrée
- Dans la fenêtre noire qui s'ouvre, tape : `node --version` puis Entrée
- Tu dois voir un numéro de version s'afficher (ex : `v24.0.0`) — c'est bon ✓

---

### 2. Installer les dépendances du projet (une seule fois)

1. Ouvre l'explorateur de fichiers et navigue jusqu'au dossier du projet :
   ```
   C:\Users\jeanp\Documents\invest-startup
   ```
2. Dans la barre d'adresse en haut, clique dessus, tape `cmd` et appuie sur Entrée
3. Une fenêtre noire s'ouvre **dans le bon dossier**
4. Tape la commande suivante et appuie sur Entrée :
   ```
   npm install
   ```
5. Attends que ça se termine (quelques secondes). Tu verras des textes défiler — c'est normal.

---

## Lancer le site

### Méthode simple — double-cliquer sur le fichier

Dans le dossier du projet, double-clique sur le fichier **`start.bat`**

Une fenêtre noire s'ouvre et affiche quelque chose comme :
```
  ✓  Invest BG  →  http://localhost:3000
```

**C'est bon, le site tourne.**

---

## Accéder au site

Ouvre ton navigateur (Chrome, Firefox, Edge…) et tape dans la barre d'adresse :

```
http://localhost:3000
```

Appuie sur Entrée. Le site s'affiche.

> ⚠️ **Important** : ne pas ouvrir les fichiers `.html` directement depuis l'explorateur de fichiers (les fonctions de connexion/inscription ne marcheraient pas). Toujours passer par `http://localhost:3000`.

---

## Créer un compte

1. Clique sur **"Se connecter"** en haut à droite
2. Clique sur **"Créer un compte"**
3. Remplis ton prénom, email et un mot de passe (8 caractères minimum)
4. Tu es connecté et redirigé vers la page d'accueil

---

## Arrêter le site

Clique dans la fenêtre noire et appuie sur **`Ctrl + C`**, puis ferme la fenêtre.

---

## Structure des pages

| Adresse | Page |
|---|---|
| `http://localhost:3000` | Page d'accueil |
| `http://localhost:3000/performance.html` | Page Performance |
| `http://localhost:3000/login.html` | Connexion |
| `http://localhost:3000/register.html` | Créer un compte |
| `http://localhost:3000/investments.html` | Mes investissements (connexion requise) |

---

## En cas de problème

**"La page ne s'affiche pas"**
→ Vérifie que la fenêtre noire (`start.bat`) est bien ouverte. Si elle est fermée, relance-la.

**"Erreur au démarrage"**
→ Assure-toi d'avoir bien fait l'étape `npm install` (étape 2 ci-dessus).

**"Mon mot de passe ne fonctionne pas"**
→ Les comptes sont enregistrés dans le fichier `data/users.json`. Si tu veux repartir de zéro, supprime ce fichier — il se recréera automatiquement.
