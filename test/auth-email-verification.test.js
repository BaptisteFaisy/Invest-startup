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

test('la production reste disponible sans configuration email', () => {
  const problems = productionConfigurationProblems({
    JWT_SECRET: 'j'.repeat(32),
    ENCRYPTION_KEY: 'e'.repeat(32),
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
    BASE_URL: 'https://www.liquidplus.fr',
    RESEND_API_KEY: '',
    EMAIL_FROM: '',
    STRIPE_SECRET_KEY: 'sk_test_example',
    STRIPE_WEBHOOK_SECRET: 'whsec_platform',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect',
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
