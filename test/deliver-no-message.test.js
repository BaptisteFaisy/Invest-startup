'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const caseHtml = fs.readFileSync(path.join(root, 'Saas', 'dossier-avocat.html'), 'utf8');

// La messagerie Liquid+ est désactivée : les autres routes renvoient 410 et
// l'interface promet « Liquid+ ne conserve aucun message ». La remise d'un
// document ne doit donc pas rouvrir une porte en écrivant un message en base.
test('la remise d’un document n’écrit aucun message en base', () => {
  const start = serverSource.indexOf("app.post('/api/lawyer/review-requests/:id/deliver'");
  assert.ok(start > 0, 'route /deliver introuvable');
  const end = serverSource.indexOf('app.', start + 1);
  const route = serverSource.slice(start, end);
  // Aucune insertion de message, et le mot de remise n'est plus lu du tout.
  assert.doesNotMatch(route, /saas_avocat_messages/);
  assert.doesNotMatch(route, /req\.body\?\.message/);
});

// Le formulaire de remise ne collecte plus de message : un champ dont la saisie
// serait aussitôt jetée (ou pire, stockée) contredirait la promesse affichée.
test('le formulaire de remise ne collecte plus de message', () => {
  assert.ok(!caseHtml.includes('id="delivery-message"'), 'le champ message subsiste dans le formulaire');
  assert.ok(!caseHtml.includes("fd.append('message'"), 'le script envoie encore un message à /deliver');
});
