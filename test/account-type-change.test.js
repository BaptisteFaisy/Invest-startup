'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const compteHtml = fs.readFileSync(path.join(root, 'Saas', 'compte.html'), 'utf8');
const onboardingHtml = fs.readFileSync(path.join(root, 'Saas', 'onboarding.html'), 'utf8');

test('le plafond IA gratuit ne dépend pas du rôle auto-déclaré', () => {
  // Le rôle s'écrit soi-même à l'onboarding : le plafond ne peut pas s'y adosser.
  // Seul l'avocat activé par un admin en est exempté — le seul rôle qu'un compte
  // ne peut pas s'attribuer. /api/saas n'étant gardé que par requireAuth, un
  // plafond adossé au rôle déclaré se contournerait en se déclarant avocat.
  assert.match(serverSource, /const activeLawyer = user\?\.account_types\?\.includes\('avocat'\) && user\.lawyer_status === 'active';/);
  assert.match(serverSource, /if \(!activeLawyer && user\?\.subscription_status !== 'active' && !hasComplimentaryAccess\(user\?\.email\)\) \{/);
  // La lecture doit ramener lawyer_status, sans quoi l'exemption serait toujours fausse.
  assert.match(serverSource, /projection: \{ email: 1, account_types: 1, subscription_status: 1, lawyer_status: 1 \}/);
});

test('le type de compte ne s’écrit qu’une fois', () => {
  // Fondateur et avocat ouvrent deux produits distincts, avec des obligations
  // envers des tiers. Le choix est définitif : la route refuse toute réécriture.
  assert.match(serverSource, /if \(hasAccountTypes\(current\)\)\s*\n\s*return res\.status\(409\)\.json\(\{/);
  assert.match(serverSource, /code: 'ACCOUNT_TYPE_LOCKED'/);
  // Et plus aucune logique de bascule ne subsiste.
  assert.doesNotMatch(serverSource, /accountTypeChangeBlockers/);
});

test('« Mon compte » ne propose pas de changer de type de compte', () => {
  assert.doesNotMatch(compteHtml, /data-switch-account-type/);
  assert.doesNotMatch(compteHtml, /fetch\('\/api\/auth\/account-type'/);
});

test('« Mon compte » propose bien de changer de type de levée', () => {
  // C'est le seul basculement offert au fondateur, et il doit le rester.
  assert.match(compteHtml, /data-switch-raise-type/);
  assert.match(compteHtml, /fetch\('\/api\/saas\/fundraising-profile\/switch-type'/);
});

test('l’onboarding annonce un choix définitif', () => {
  assert.doesNotMatch(onboardingHtml, /Vous pourrez le modifier plus tard/);
  assert.match(onboardingHtml, /Ce choix est définitif/);
});

test('le script de « Mon compte » reste syntaxiquement valide', () => {
  const scripts = [...compteHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  scripts.forEach((match, index) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `compte.html#script-${index + 1}` }));
  });
});
