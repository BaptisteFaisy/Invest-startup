const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { productionConfigurationProblems } = require('../lib/runtime-config');

const root = path.resolve(__dirname, '..');

test('les scripts des pages inscription et connexion restent syntaxiquement valides', () => {
  for (const filename of ['register.html', 'login.html']) {
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];

    assert.ok(scripts.length > 0, `${filename} doit contenir un script`);
    scripts.forEach((match, index) => {
      assert.doesNotThrow(
        () => new vm.Script(match[1], { filename: `${filename}#script-${index + 1}` }),
      );
    });
  }
});

test('les deux pages permettent de renvoyer un lien de confirmation', () => {
  const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
  const login = fs.readFileSync(path.join(root, 'login.html'), 'utf8');

  assert.match(register, /id="resend-link"/);
  assert.match(register, /fetch\('\/api\/auth\/resend-verification'/);
  assert.match(login, /id="login-resend-link"/);
  assert.match(login, /fetch\('\/api\/auth\/resend-verification'/);
});

test('le lien de confirmation ouvre la session et mène au choix du type de compte', () => {
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

  // La bascule est arbitrée par le filtre de l'updateOne, pas par la lecture qui
  // précède : sans cela, deux clics simultanés ouvriraient deux sessions.
  assert.match(serverSource, /\{ id: user\.id, email_verified: false \},\s*\n\s*\{ \$set: \{ email_verified: true, email_verified_at: new Date\(\)\.toISOString\(\) \} \},/);
  assert.match(serverSource, /if \(claim\.modifiedCount === 1\) \{\s*\n\s*user\.email_verified = true;\s*\n\s*setAuthCookie\(res, user\);\s*\n\s*return res\.redirect\(await authLandingPath\(user\)\);/);
  // Un lien rejoué ne redonne pas de session : il retombe sur la connexion.
  assert.match(serverSource, /return res\.redirect\('\/login\.html\?email_verification=success'\);/);
});

test('la production reste disponible sans intégrations externes', () => {
  const problems = productionConfigurationProblems({
    JWT_SECRET: 'j'.repeat(32),
    ENCRYPTION_KEY: 'e'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    BASE_URL: 'https://www.liquidplus.fr',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    STRIPE_CONNECT_WEBHOOK_SECRET: '',
  });

  assert.deepEqual(problems, []);
});

test('la configuration email de production complète est acceptée', () => {
  const problems = productionConfigurationProblems({
    JWT_SECRET: 'j'.repeat(32),
    ENCRYPTION_KEY: 'e'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    BASE_URL: 'https://www.liquidplus.fr',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'Liquid Plus <comptes@liquidplus.fr>',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_platform',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
  });

  assert.deepEqual(problems, []);
});
