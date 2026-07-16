'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

// L'environnement de déploiement pose MODE_ENV, pas NODE_ENV. Sans cette lecture,
// IS_PROD restait faux en production : cookies d'auth non marqués Secure sur un site
// HTTPS, et contrôle des secrets au démarrage court-circuité.
test('la production est détectée via NODE_ENV ou MODE_ENV', () => {
  assert.match(
    serverSource,
    /const IS_PROD\s*=\s*process\.env\.NODE_ENV === 'production' \|\| process\.env\.MODE_ENV === 'production';/,
  );
});

test('plus aucune détection de production ne lit NODE_ENV seul, hors de la définition d’IS_PROD', () => {
  // Toute autre lecture directe de NODE_ENV rendrait la détection incohérente selon
  // l'endroit : cookies d'un côté, garde de démarrage de l'autre.
  const occurrences = serverSource.match(/process\.env\.NODE_ENV/g) || [];
  assert.equal(occurrences.length, 1, 'NODE_ENV ne doit être lu que dans la définition d’IS_PROD');
  // Et les cookies s'appuient bien sur IS_PROD.
  assert.match(serverSource, /secure:\s*IS_PROD/);
  assert.doesNotMatch(serverSource, /secure:\s*process\.env\.NODE_ENV/);
});

// La logique elle-même, vérifiée hors de server.js (qui démarre un serveur au require).
test('MODE_ENV=production suffit à activer le mode production', () => {
  const isProd = (env) => env.NODE_ENV === 'production' || env.MODE_ENV === 'production';
  assert.equal(isProd({ MODE_ENV: 'production' }), true);
  assert.equal(isProd({ NODE_ENV: 'production' }), true);
  assert.equal(isProd({ MODE_ENV: 'dev' }), false);
  assert.equal(isProd({}), false);
});
