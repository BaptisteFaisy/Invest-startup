'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const avocatHtml = fs.readFileSync(path.join(root, 'Saas', 'avocat.html'), 'utf8');

const scripts = [...avocatHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
const inline = scripts.find(code => code.includes('function renderDocPicker'));

test('les documents se choisissent par cases à cocher, pas par un select multiple', () => {
  assert.ok(inline, 'renderDocPicker introuvable');
  // L'ancien <select multiple id="req-doc"> exigeait le Ctrl+clic, ne montrait ni
  // l'enjeu juridique ni l'avancement, et perdait toute la sélection au premier
  // clic nu.
  assert.ok(!avocatHtml.includes('id="req-doc"'), 'le select multiple est encore là');
  assert.doesNotMatch(inline, /selectedOptions/);
  for (const id of ['req-doc-list', 'req-doc-search', 'req-doc-count', 'req-doc-clear']) {
    assert.ok(avocatHtml.includes(`id="${id}"`), `le sélecteur ne rend pas ${id}`);
  }
  assert.match(inline, /type="checkbox" data-doc-id=/);
  // Ce qui part réellement dans la demande est la sélection cochée.
  assert.match(inline, /document_ids: \[\.\.\.SELECTED_DOCS\]/);
});

test('la demande ne peut pas partir sans document', () => {
  const submit = inline.slice(inline.indexOf('async function submitRequest'), inline.indexOf('async function cancelRequest'));
  const guard = submit.indexOf('if (!SELECTED_DOCS.size)');
  const post = submit.indexOf('jsonPost');
  assert.ok(guard > 0, 'aucune garde sur la sélection vide');
  assert.ok(post > guard, 'la garde doit précéder l’envoi');
});

// Le serveur tronque à 20 sans le dire (`.slice(0, 20)`) : une demande partirait
// amputée de ses documents suivants. Le plafond de l'interface doit donc coller
// exactement à celui du serveur, et refuser au lieu de tronquer.
test('le plafond de documents de l’interface est celui du serveur', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/saas/avocat/requests'"),
    serverSource.indexOf("app.put('/api/saas/avocat/requests/:id'"),
  );
  assert.ok(route, 'route de création de demande introuvable');
  const serverCap = route.match(/\.slice\(0, (\d+)\)/);
  assert.ok(serverCap, 'le serveur ne plafonne plus la liste des documents');
  const clientCap = inline.match(/const MAX_REVIEW_DOCS = (\d+);/);
  assert.ok(clientCap, 'MAX_REVIEW_DOCS introuvable');
  assert.equal(clientCap[1], serverCap[1], 'le plafond de l’interface a divergé de celui du serveur');
});

// Une version archivée, une checklist investisseur ou un modèle jamais ouvert ne
// sont pas des documents que l'on confie à un avocat. Le serveur applique déjà
// cette règle (isDataroomExportableDoc) ; l'outil avocat doit dire la même chose.
test('les documents qui ne sont pas de vrais documents ne sont pas proposables', () => {
  const filter = inline.slice(inline.indexOf('function isRealDoc'), inline.indexOf('async function loadDocs'));
  assert.ok(filter, 'isRealDoc introuvable');
  for (const rule of ['is_version', 'is_investor_checklist', 'is_personalized === false']) {
    assert.ok(filter.includes(rule), `isRealDoc ne filtre pas ${rule}`);
  }
  assert.match(inline, /\.filter\(isRealDoc\)/);

  const serverFilter = serverSource.slice(
    serverSource.indexOf('function isDataroomExportableDoc'),
    serverSource.indexOf('async function dataroomLooseDocs'),
  );
  for (const rule of ['is_version', 'is_investor_checklist', 'is_personalized === false']) {
    assert.ok(serverFilter.includes(rule), `le serveur a changé de règle : ${rule}`);
  }
});

// Reconstruire la liste à chaque clic détache la case cochée : le focus clavier
// retombe sur <body> et l'utilisateur repart de la première ligne.
test('cocher un document ne reconstruit pas la liste', () => {
  const toggle = inline.slice(inline.indexOf('function toggleDoc'), inline.indexOf('function renderSecureDocs'));
  assert.ok(toggle, 'toggleDoc introuvable');
  assert.doesNotMatch(toggle, /renderDocPicker\(\)/, 'toggleDoc reconstruit la liste et perd le focus');
  assert.match(toggle, /row\.classList\.toggle\('is-sel'/);
  assert.match(toggle, /renderDocPickerFoot\(\)/);
});
