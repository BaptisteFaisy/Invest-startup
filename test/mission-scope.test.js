'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  FOUNDER_PERSONAL_CLAUSES,
  FOUNDER_PERSONAL_INTEREST_NOTICE,
  FOUNDER_INDEPENDENT_COUNSEL_NOTICE,
  buildMissionScope,
} = require('../lib/mission-scope');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const avocatSource = fs.readFileSync(path.join(root, 'Saas', 'avocat.html'), 'utf8');

const RECORDED_AT = '2026-07-16T09:00:00.000Z';

test('sans intérêt personnel : périmètre société pur, aucune note personnelle', () => {
  const scope = buildMissionScope({ founderPersonalInterest: false, recordedAt: RECORDED_AT });
  assert.equal(scope.client, 'company');
  assert.equal(scope.founder_personal_interest_flagged, false);
  assert.equal(scope.personal_interest_excluded, false);
  assert.deepEqual(scope.personal_clauses, []);
  assert.equal(scope.personal_interest_notice, null);
  assert.equal(scope.independent_counsel_notice, null);
  assert.equal(scope.recorded_at, RECORDED_AT);
});

test('intérêt personnel signalé : on TRACE le périmètre au lieu de bloquer', () => {
  const scope = buildMissionScope({ founderPersonalInterest: true, recordedAt: RECORDED_AT });
  assert.equal(scope.client, 'company');
  assert.equal(scope.founder_personal_interest_flagged, true);
  // Les clauses personnelles sont exclues du mandat de la société, mais la
  // mission n'est PAS refusée : la demande passe.
  assert.equal(scope.personal_interest_excluded, true);
  assert.deepEqual(scope.personal_clauses, FOUNDER_PERSONAL_CLAUSES);
  assert.equal(scope.personal_interest_notice, FOUNDER_PERSONAL_INTEREST_NOTICE);
  assert.equal(scope.independent_counsel_notice, FOUNDER_INDEPENDENT_COUNSEL_NOTICE);
  assert.equal(scope.recorded_at, RECORDED_AT);
});

test('la note « avocat indépendant » nomme la règle déontologique clé', () => {
  // Le cœur du sujet : le conseil personnel ne peut pas venir de l'avocat de la
  // société, et l'avocat indépendant doit être distinct de son cabinet.
  assert.match(FOUNDER_INDEPENDENT_COUNSEL_NOTICE, /à titre personnel/);
  assert.match(FOUNDER_INDEPENDENT_COUNSEL_NOTICE, /indépendant/);
  assert.match(FOUNDER_INDEPENDENT_COUNSEL_NOTICE, /cabinet/);
});

test('le module reste pur : recorded_at vient de l’appelant, jamais de Date.now', () => {
  const scope = buildMissionScope({ founderPersonalInterest: true, recordedAt: null });
  assert.equal(scope.recorded_at, null);
  const src = fs.readFileSync(path.join(root, 'lib', 'mission-scope.js'), 'utf8');
  // On vérifie le CODE, pas les commentaires (qui, eux, mentionnent la règle).
  const codeOnly = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(codeOnly, /new Date\(/, 'lib/mission-scope.js doit rester pur (pas de new Date())');
});

test('server.js ne bloque plus la soumission sur l’intérêt personnel', () => {
  // Le 409 FOUNDER_PERSONAL_ADVICE_REQUIRED est retiré : un fondateur honnête
  // cocherait toujours la case sur une term sheet et ne pourrait jamais soumettre.
  assert.doesNotMatch(serverSource, /FOUNDER_PERSONAL_ADVICE_REQUIRED/);
  // Le périmètre est bien figé sur la demande via le module pur.
  assert.match(serverSource, /mission_scope:\s*buildMissionScope\(/);
});

test('le client fondateur dit que cocher ne bloque pas la demande', () => {
  assert.match(avocatSource, /Votre demande reste possible/);
});
