'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { companyNameKey, identityHash } = require('../lib/founder-identity');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const registerHtml = fs.readFileSync(path.join(root, 'Saas', 'register.html'), 'utf8');

test('deux écritures du même nom de startup donnent la même clé', () => {
  const attendu = 'acmesas';
  for (const variante of ['Acme SAS', 'acme sas', '  ACME   SAS  ', 'Acme-SAS', 'acme.s.a.s', 'AcmeSAS']) {
    assert.equal(companyNameKey(variante), attendu, `« ${variante} » devrait valoir ${attendu}`);
  }
});

test('les accents ne permettent pas de contourner l’unicité', () => {
  assert.equal(companyNameKey('Créa Tech'), companyNameKey('Crea Tech'));
  assert.equal(companyNameKey('Zébulon'), 'zebulon');
  assert.equal(companyNameKey('Über Éats'), 'ubereats');
});

test('un nom sans lettre ni chiffre ne produit aucune clé', () => {
  // Le serveur s'appuie dessus pour refuser « !!! » ou « --- » à l'inscription.
  for (const vide of ['', '   ', '!!!', '---', null, undefined]) {
    assert.equal(companyNameKey(vide), '');
  }
});

test('l’empreinte est stable, dépend du secret, et sépare email et nom', () => {
  assert.equal(identityHash('s3cret', 'email', 'a@b.fr'), identityHash('s3cret', 'email', 'a@b.fr'));
  assert.notEqual(identityHash('s3cret', 'email', 'a@b.fr'), identityHash('autre', 'email', 'a@b.fr'));
  // Même valeur, deux registres distincts : un nom ne doit pas brûler un email.
  assert.notEqual(identityHash('s3cret', 'email', 'acme'), identityHash('s3cret', 'company', 'acme'));
  assert.match(identityHash('s3cret', 'email', 'a@b.fr'), /^[0-9a-f]{64}$/);
});

test('l’empreinte ne laisse pas fuiter la valeur d’origine', () => {
  const empreinte = identityHash('s3cret', 'email', 'fondateur@exemple.fr');
  assert.ok(!empreinte.includes('fondateur'));
  assert.ok(!empreinte.includes('exemple'));
});

test('le registre survit au compte et n’est alimenté qu’à la suppression', () => {
  // burnIdentities est appelé APRÈS la suppression, avec l'email lu avant.
  assert.match(serverSource, /const user = await col\('users'\)\.findOne\(\{ id \}, \{ projection: \{ email: 1, company_name_key: 1 \} \}\)/);
  assert.match(serverSource, /await col\('users'\)\.deleteOne\(\{ id \}\);\s*\n\s*await burnIdentities\(/);
  // L'inscription non confirmée est nettoyée par un deleteOne direct : elle ne
  // doit PAS brûler l'email, sinon un envoi d'email raté condamnerait l'adresse.
  assert.match(serverSource, /col\('users'\)\.deleteOne\(\{ id: user\.id, email_verified: false \}\)/);
});

test('l’inscription refuse un email ou un nom déjà utilisé, vivant ou brûlé', () => {
  assert.match(serverSource, /if \(await isIdentityBurnt\('email', emailClean\)\)/);
  assert.match(serverSource, /if \(await isIdentityBurnt\('company', companyKey\)\)/);
  assert.match(serverSource, /col\('users'\)\.findOne\(\{ company_name_key: companyKey \}/);
  // Course entre deux inscriptions simultanées : l'index unique doit trancher.
  assert.match(serverSource, /err\?\.code === 11000/);
  assert.match(serverSource, /partialFilterExpression: \{ company_name_key: \{ \$type: 'string' \} \}/);
});

test('Google ne contourne pas le registre', () => {
  const passages = serverSource.match(/if \(!user && await isIdentityBurnt\('email', emailClean\)\)/g) || [];
  assert.equal(passages.length, 2, 'les deux entrées Google (callback + token) doivent vérifier le registre');
});

test('le formulaire d’inscription demande le nom de la startup et l’envoie', () => {
  assert.match(registerHtml, /name="company_name"[^>]*required/);
  assert.match(registerHtml, /JSON\.stringify\(\{ email, password, full_name, company_name \}\)/);
});
