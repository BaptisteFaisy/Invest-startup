'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const accountHtml = fs.readFileSync(path.join(root, 'Saas', 'compte.html'), 'utf8');

// L'onglet Facturation affichait un « Bientôt disponible » figé pour tout avocat,
// même quand son compte Stripe était actif. Il doit désormais refléter l'état réel.
test('la facturation expose le vrai statut Connect de l’avocat', () => {
  // Le statut est calculé depuis le profil (tenu à jour par les webhooks)…
  assert.ok(
    serverSource.includes("publicLawyerConnectStatus(await col('saas_lawyer_profiles')"),
    'le statut Connect n’est pas calculé pour l’avocat dans /api/billing/status',
  );
  // …et renvoyé dans la réponse, juste avant lawyer_payments_enabled.
  assert.match(serverSource, /connect,\s*\n\s*lawyer_payments_enabled:/);
});

test('la facturation avocat rend l’état réel et non un placeholder figé', () => {
  const scripts = [...accountHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  // La branche avocat lit data.connect et distingue les états.
  assert.match(scripts, /data\.role === 'avocat'/);
  assert.match(scripts, /connect\.ready_for_payments/);
  assert.match(scripts, /connect\.connected/);
  assert.match(scripts, /account-status__badge--active/);
  // L'ampoule d'aide et son guide en 4 étapes sont présents.
  assert.ok(accountHtml.includes('id="billing-help-btn"'), 'bouton ampoule absent');
  assert.ok(accountHtml.includes('id="help-billing"'), 'encart d’aide absent');
  const guide = accountHtml.slice(accountHtml.indexOf('id="help-billing"'));
  const steps = (guide.slice(0, guide.indexOf('</ol>')).match(/<li>/g) || []).length;
  assert.equal(steps, 4, 'le guide doit compter 4 étapes');
});
