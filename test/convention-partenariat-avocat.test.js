'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'Saas', 'convention-partenariat-avocat.html'), 'utf8');
const inlineScript = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(match => match[1])
  .find(code => code.includes('function renderDocument'));

test('le script de la page est valide et les éléments qu’il manipule existent', () => {
  assert.ok(inlineScript, 'script inline introuvable');
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'convention-partenariat-avocat.html' }));
  for (const id of ['card', 'doc', 'draft-banner', 'sign-form', 'accept', 'signed-name', 'submit', 'print', 'error', 'signed-notice', 'doc-meta', 'name-hint']) {
    assert.ok(page.includes(`id="${id}"`), `identifiant absent du markup : ${id}`);
  }
});

// Un brouillon signé serait pire que pas de convention du tout : l'avocat croirait
// être lié, Liquid+ aussi, et le texte n'aurait été relu par personne.
test('un texte encore en brouillon le dit à l’écran', () => {
  assert.match(page, /id="draft-banner"[^>]*hidden/);
  assert.match(inlineScript, /draft-banner'\)\.hidden = state\.status !== 'draft'/);
  assert.match(page, /Texte en cours de validation juridique/);
});

// Le document vient du serveur, mais il s'affiche via textContent : une clause ne
// doit jamais pouvoir injecter de markup dans la page qui sert à la signer.
test('le texte de la convention est rendu sans interprétation de markup', () => {
  const render = inlineScript.slice(
    inlineScript.indexOf('function renderDocument'),
    inlineScript.indexOf('function renderSigned'),
  );
  assert.ok(render, 'renderDocument introuvable');
  assert.doesNotMatch(render, /innerHTML/);
  assert.match(render, /textContent = clause/);
});

test('signer exige la case cochée ET le nom saisi', () => {
  assert.match(inlineScript, /submitBtn\.disabled = !\(acceptEl\.checked && nameEl\.value\.trim\(\)\.length > 1\)/);
  assert.match(page, /id="submit" disabled/);
});

// Signer une version qui n'est plus celle affichée n'engage sur rien : le serveur
// renvoie PARTNERSHIP_VERSION_STALE, la page doit remontrer le texte à jour.
test('un texte modifié en cours de lecture est reproposé, pas contourné', () => {
  assert.match(inlineScript, /error\.code === 'PARTNERSHIP_VERSION_STALE'.*location\.reload\(\)/s);
});

// L'avocat dont la candidature est en cours n'a pas à signer : il n'est pas encore
// dans le réseau. Le serveur répond 403, la page ne l'y laisse pas coincé.
test('un compte non activé est renvoyé à son tableau de bord', () => {
  assert.match(inlineScript, /error\.status === 403.*tableau-de-bord-avocat\.html/s);
});

test('un avocat ayant déjà signé consulte sa copie au lieu de resigner', () => {
  const signed = inlineScript.slice(
    inlineScript.indexOf('function renderSigned'),
    inlineScript.indexOf('function syncSubmit'),
  );
  assert.match(signed, /form\.hidden = true/);
  assert.match(signed, /Convention signée/);
  // Le contrat s'emporte : un partenaire garde une copie de ce qu'il a signé.
  assert.match(signed, /window\.print\(\)/);
  assert.match(page, /@media print/);
});
