'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const authScript = fs.readFileSync(path.join(root, 'Saas', 'auth.js'), 'utf8');
const accountHtml = fs.readFileSync(path.join(root, 'Saas', 'compte.html'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('la proposition de bienvenue reste fermable et son script est valide', () => {
  assert.doesNotThrow(() => new vm.Script(authScript, { filename: 'Saas/auth.js' }));
  assert.match(authScript, /aria-label="Fermer cette proposition"/);
  assert.match(authScript, /#liquid-founder-welcome,#liquid-founder-welcome \*\{box-sizing:border-box\}/);
  assert.match(authScript, /RAISE SUMMIT/);
  assert.match(authScript, /témoignage publié sur notre site/);
  assert.match(authScript, /post LinkedIn de votre part parlant de Liquid\+/);
  assert.match(authScript, /Payer 600 € TTC maintenant/);
});

test('la facturation permet le paiement et préremplit le code de bienvenue', () => {
  const inlineScripts = [...accountHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((match, index) => {
    assert.doesNotThrow(() => new vm.Script(match[1], { filename: `Saas/compte.html#script-${index + 1}` }));
  });
  assert.match(accountHtml, /Payer 600 € TTC/);
  assert.match(accountHtml, /Votre accès gratuit n’expire pas/);
  assert.match(accountHtml, /data\.role === 'avocat' && !data\.liquid_plus/);
  assert.match(accountHtml, /accountParams\.get\('promo'\)/);
  assert.match(accountHtml, /Accepter et payer 450 € TTC/);
});

test('le serveur ne propose la fenêtre qu’au premier essai fondateur', () => {
  assert.match(serverSource, /updates\.welcome_offer_pending = true/);
  assert.match(serverSource, /welcome_offer_pending: isFounder && access\.status === 'trial'/);
  assert.match(serverSource, /\/api\/billing\/welcome-offer\/dismiss/);
  assert.match(serverSource, /app\.post\('\/api\/billing\/checkout', requireAuth/);
});
