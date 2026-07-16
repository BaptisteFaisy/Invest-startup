'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dashboard = fs.readFileSync(path.join(root, 'Saas', 'tableau-de-bord-avocat.html'), 'utf8');
const drawerMenu = fs.readFileSync(path.join(root, 'Saas', 'drawer-menu.js'), 'utf8');

const inlineScript = [...dashboard.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(code => code.includes('function setMenuCount'));

// Deux menus rivaux définissaient les mêmes liens : celui de la page (avec compteurs
// et liens de vue) et celui injecté par drawer-menu.js (sans). Le second écrasait le
// premier, `setMenuCount` recevait null, et le catch renvoyait au login en boucle.
test('le menu de la page avocat n’est pas écrasé par le menu partagé', () => {
  // La page se déclare porteuse du menu avocat : applyLawyerDrawers doit s’abstenir.
  assert.match(dashboard, /id="nav-drawer"[^>]*data-account-menu="lawyer"/);
  // Et le garde-fou correspondant existe toujours côté script partagé.
  assert.match(drawerMenu, /navDrawer\.dataset\.accountMenu === 'lawyer'\) return;/);
});

test('les éléments manipulés par le menu existent dans la page qui les rend', () => {
  for (const id of ['proposal-menu-count', 'client-menu-count', 'current-menu-count',
    'past-menu-count', 'mission-lock-badge', 'logout-btn']) {
    assert.ok(dashboard.includes(`id="${id}"`), `identifiant absent du markup : ${id}`);
  }
  // Les liens de vue portent bien l’attribut que le script interroge.
  for (const view of ['dashboard', 'propositions', 'clients', 'en-cours', 'passees']) {
    assert.ok(dashboard.includes(`data-lawyer-view="${view}"`), `lien de vue absent : ${view}`);
  }
});

test('un compteur absent ne fait pas tomber le chargement', () => {
  assert.ok(inlineScript, 'script inline introuvable');
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'tableau-de-bord-avocat.html' }));
  const setMenuCount = inlineScript.slice(
    inlineScript.indexOf('function setMenuCount'),
    inlineScript.indexOf('function renderNotifications'),
  );
  assert.match(setMenuCount, /if\(!el\)return;/);
});

// Une panne d'affichage n'est pas une perte de session : renvoyer au login masquait la
// cause et faisait tourner l'avocat en rond, sans jamais lui dire pourquoi.
test('une erreur d’affichage ne renvoie plus l’avocat au login', () => {
  const load = inlineScript.slice(inlineScript.indexOf('async function load()'), inlineScript.indexOf('load();'));
  assert.ok(load, 'load() introuvable');
  assert.doesNotMatch(load, /\}\s*catch\s*\{\s*location\.replace\('login\.html'\);\s*\}/);
  // Seule une session réellement invalide (401 sur /api/auth/me) renvoie au login.
  assert.match(load, /if \(!meRes\.ok\) \{ location\.replace\('login\.html'\); return; \}/);
  // Le catch montre la page au lieu de la fuir.
  const critique = load.slice(load.lastIndexOf('} catch'));
  assert.match(critique, /app\.classList\.add\('ready'\)/);
  assert.doesNotMatch(critique, /location\.replace/);
});

// L'avocat entre chez lui dès sa 2FA : la candidature en cours ferme les missions,
// pas la porte. Le badge dit pourquoi, faute de quoi il croit à une panne.
test('une candidature en cours affiche le badge et verrouille les missions, sans fermer le compte', () => {
  assert.match(dashboard, /id="mission-lock-badge"[^>]*hidden/);
  assert.match(inlineScript, /lockBadge\.hidden=active/);
  // Le tableau de bord reste accessible ; seules les vues missions sont fermées.
  assert.match(inlineScript, /if\(link\.dataset\.lawyerView==='dashboard'\)return;/);
  assert.match(inlineScript, /link\.classList\.toggle\('is-locked',locked\)/);
  // Un avocat non activé n'appelle aucune API réservée aux avocats actifs.
  assert.match(inlineScript, /if\(!active\)\{renderProposals\(\[\]\)/);
});

// `opacity` seule ne ferme rien : le lien resterait cliquable à la souris et
// atteignable au clavier, et mènerait à une vue vide sans explication.
test('un lien de mission verrouillé n’est cliquable ni à la souris ni au clavier', () => {
  const style = dashboard.slice(dashboard.indexOf('.drawer__link.is-locked'), dashboard.indexOf('.drawer__sep'));
  assert.match(style, /pointer-events:\s*none/);
  assert.match(inlineScript, /link\.setAttribute\('aria-disabled',String\(locked\)\)/);
  assert.match(inlineScript, /link\.setAttribute\('tabindex','-1'\)/);
  // L'état se lève aussi : un avocat activé retrouve un lien pleinement utilisable.
  assert.match(inlineScript, /link\.removeAttribute\('tabindex'\)/);
});

// L'adhésion à la grille s'arrachait dans un confirm() natif, au clic sur le premier
// client — et affichait « Pacte d'associés : null », aucun tarif n'étant publié. C'est
// désormais l'article 4 de la convention de partenariat, signée à l'entrée du réseau.
test('la grille ne s’accepte plus dans une boîte de dialogue au dernier moment', () => {
  // Les commentaires ont le droit de parler du confirm() disparu ; le code, non.
  const code = inlineScript.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /confirm\(/, 'plus aucun confirm() dans le parcours avocat');
  assert.doesNotMatch(code, /ensureCatalogueAccepted|api\/lawyer\/catalogue/);
});

// Un avocat activé mais non signataire n'a accès à aucune mission : le serveur le
// verrouille, la page doit l'emmener au texte plutôt que d'afficher un espace vide.
test('le verrou convention du serveur emmène l’avocat au texte, pas dans le vide', () => {
  assert.match(inlineScript, /function goToPartnership\(\) \{ location\.replace\('convention-partenariat-avocat\.html'\); \}/);
  const loadTools = inlineScript.slice(
    inlineScript.indexOf('async function loadClientTools'),
    inlineScript.indexOf('async function logout'),
  );
  assert.match(loadTools, /err\.code==='LAWYER_PARTNERSHIP_REQUIRED'/);
  assert.match(loadTools, /goToPartnership\(\);return;/);
  // Toute autre panne remonte : elle ne doit pas être avalée par la redirection.
  assert.match(loadTools, /throw err;/);
  // Le refus d'une proposition passe par le même aiguillage.
  assert.match(inlineScript, /else if\(err\.code==='LAWYER_PARTNERSHIP_REQUIRED'\)goToPartnership\(\);/);
});

// Le tiroir passe sur fond papier en thème clair : un badge blanc translucide y
// devient illisible. Les compteurs souffraient déjà du même défaut, encore invisible
// faute de propositions à afficher.
test('badge et compteurs restent lisibles en thème clair', () => {
  assert.match(dashboard, /:root\[data-theme="paper"\] \.drawer__lock \{[^}]*color:#3f3b34/);
  assert.match(dashboard, /:root\[data-theme="paper"\] \.drawer__count \{[^}]*color:#3f3b34/);
  // La pastille d'alerte garde son vert de marque, lisible sur les deux thèmes.
  assert.match(dashboard, /:root\[data-theme="paper"\] \.drawer__count--alert \{[^}]*color:#fff/);
});
