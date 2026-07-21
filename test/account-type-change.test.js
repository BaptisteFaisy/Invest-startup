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

test('le plafond IA gratuit ne dépend plus du rôle auto-déclaré', () => {
  // Le rôle s'écrit soi-même : un compte gratuit qui se déclarait « avocat »
  // sortait du plafond tout en gardant l'assistant (/api/saas n'est gardé que
  // par requireAuth). Seul l'avocat activé par un admin en est exempté.
  assert.match(serverSource, /const activeLawyer = user\?\.account_types\?\.includes\('avocat'\) && user\.lawyer_status === 'active';/);
  assert.match(serverSource, /if \(!activeLawyer && user\?\.subscription_status !== 'active' && !hasComplimentaryAccess\(user\?\.email\)\) \{/);
  // La lecture doit ramener lawyer_status, sans quoi l'exemption serait toujours fausse.
  assert.match(serverSource, /projection: \{ email: 1, account_types: 1, subscription_status: 1, lawyer_status: 1 \}/);
});

test('abandonner un rôle engagé est refusé, en ajouter un reste libre', () => {
  assert.match(serverSource, /const abandonne = \(role\) => had\.includes\(role\) && !nextTypes\.includes\(role\);/);
  // Côté avocat : activation, convention, clients, honoraires.
  assert.match(serverSource, /if \(user\.lawyer_status === 'active'\)/);
  assert.match(serverSource, /if \(partnershipAccepted\(user\)\)/);
  assert.match(serverSource, /col\('lawyer_client_proposals'\)\.findOne\(\s*\n?\s*\{ lawyer_id: id, status: \{ \$in: \['proposed', 'accepted', 'assigned'\] \} \}/);
  assert.match(serverSource, /col\('lawyer_payment_requests'\)\.findOne\(\s*\n?\s*\{ lawyer_id: id, status: \{ \$ne: 'refunded' \} \}/);
  // Côté fondateur : avocat attribué, accès payé, virement, honoraires.
  assert.match(serverSource, /if \(await assignedLawyerForClient\(id\)\)/);
  assert.match(serverSource, /user\.subscription_status === 'active' \|\| user\.liquid_plus_access_status === 'paid'/);
  assert.match(serverSource, /col\('billing_bank_transfers'\)\.findOne\(\s*\n?\s*\{ user_id: id, status: 'awaiting_transfer' \}/);
  assert.match(serverSource, /col\('lawyer_payment_requests'\)\.findOne\(\s*\n?\s*\{ client_id: id, status: \{ \$ne: 'refunded' \} \}/);
  // Et le refus est un 409 nommant l'engagement.
  assert.match(serverSource, /code: 'ACCOUNT_TYPE_LOCKED'/);
});

test('quitter le rôle avocat remet la candidature à zéro', () => {
  // Sinon lawyer_status resterait 'active' pendant l'intermède, hors de portée
  // de l'admin (qui ne voit que les comptes de type avocat), et un retour au
  // rôle restaurerait un avocat actif sans nouvelle validation.
  assert.match(serverSource, /if \(current\.account_types\?\.includes\('avocat'\) && !clean\.includes\('avocat'\)\) \{\s*\n\s*updates\.lawyer_status = 'pending';/);
});

test('un aller-retour entre rôles ne ré-arme pas l’offre de bienvenue', () => {
  assert.match(serverSource, /&& !current\.welcome_offer_dismissed_at && !current\.welcome_offer_checkout_at\) \{\s*\n\s*updates\.welcome_offer_pending = true;/);
});

test('« Mon compte » propose le changement, et seulement entre les deux rôles ouverts', () => {
  assert.match(compteHtml, /data-switch-account-type/);
  assert.match(compteHtml, /types\.length === 1 && types\[0\] === 'fondateur' \? 'avocat'/);
  assert.match(compteHtml, /fetch\('\/api\/auth\/account-type'/);
  // L'avertissement doit dire la vérité : rien n'est supprimé, tout devient inaccessible.
  assert.match(compteHtml, /Rien n'est supprimé, mais tout ce qui dépend de votre rôle actuel devient inaccessible/);
});

test('l’onboarding ne promet plus un changement inconditionnel', () => {
  assert.doesNotMatch(onboardingHtml, /Vous pourrez le modifier plus tard/);
  assert.match(onboardingHtml, /tant qu'aucun dossier n'est engagé/);
});

test('le script de « Mon compte » reste syntaxiquement valide', () => {
  const scripts = [...compteHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  scripts.forEach((match, index) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `compte.html#script-${index + 1}` }));
  });
});
