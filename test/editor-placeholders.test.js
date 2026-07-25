'use strict';

// Les champs « à remplir » d'un document importé sont répartis sur plusieurs
// balises par le convertisseur : ces tests montent un vrai DOM (jsdom) et
// exécutent le code réel de Saas/editor.js sur du balisage fragmenté.
//
// jsdom n'est pas une dépendance du projet (installé en local avec --no-save) :
// en son absence, les tests sont ignorés plutôt que de faire échouer la suite.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const editorSource = fs.readFileSync(path.join(root, 'Saas', 'editor.js'), 'utf8');

let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch { /* absent : voir ci-dessus */ }
const jsdomAbsent = !JSDOM;

// Extrait du code réel les fonctions à tester, puis les évalue dans le contexte
// d'un document jsdom. Le fichier entier ne peut pas être chargé : il s'attache
// au chargement à des éléments de page qui n'existent pas ici.
function loadEditorFns(html) {
  const dom = new JSDOM(`<!DOCTYPE html><body><div id="page" contenteditable>${html}</div></body>`);
  const slice = (from, to) => {
    const a = editorSource.indexOf(from);
    const b = editorSource.indexOf(to, a);
    assert.ok(a > 0 && b > a, `tranche introuvable dans editor.js : ${from}`);
    return editorSource.slice(a, b);
  };
  const code =
    slice('const PLACEHOLDER_RE', 'function findPlaceholders') +
    slice('function findPlaceholders', 'function renderAdvice') +
    slice('function applyAutofill', '\nfunction undoAutofill');

  const sandbox = {
    document: dom.window.document,
    NodeFilter: dom.window.NodeFilter,
    page: dom.window.document.getElementById('page'),
    _looseFieldLabel: () => 'Document',
    setTimeout: () => 0,
    window: dom.window,
  };
  const fn = new Function(
    ...Object.keys(sandbox),
    code + '\n;return { findPlaceholders, applyAutofill, flatText, flatRange };'
  );
  const api = fn(...Object.values(sandbox));
  return { ...api, page: sandbox.page, dom };
}

// Ce qu'un convertisseur produit : chaque changement de police ouvre une balise,
// si bien que « [Nom de la société] » est coupé en trois nœuds de texte.
const FRAGMENTE =
  '<div class="ts-clause ts-clause--imported" data-key="c1">' +
  '<div class="ts-label">Identification</div>' +
  '<div class="ts-content">' +
  '<p><font face="Times"><font size="2">La société </font></font>' +
  '<font face="Times"><font size="2">[</font></font>' +
  '<font face="Times"><font size="2"><b>Nom de la société</b></font></font>' +
  '<font face="Times"><font size="2">]</font></font>' +
  '<font face="Times"><font size="2">, au capital de [montant] euros.</font></font></p>' +
  '</div></div>';

test('un champ coupé par la mise en forme est retrouvé', { skip: jsdomAbsent }, () => {
  const { findPlaceholders } = loadEditorFns(FRAGMENTE);
  const ph = findPlaceholders();
  assert.deepEqual(ph.map(p => p.text), ['[Nom de la société]', '[montant]'],
    'le champ éclaté sur trois nœuds doit être trouvé comme les autres');
  assert.equal(ph[0].clauseLabel, 'Identification');
  assert.equal(ph[0].key, 'c1');
});

test('l’étiquette d’une clause importée ne crée pas de doublon', { skip: jsdomAbsent }, () => {
  const html =
    '<div class="ts-clause ts-clause--imported" data-key="c1">' +
    '<div class="ts-label">Article [n]</div>' +
    '<div class="ts-content"><p>Article [n] — objet</p></div></div>';
  const { findPlaceholders } = loadEditorFns(html);
  // L'étiquette recopie le titre : sans exclusion, « [n] » compterait deux fois.
  assert.equal(findPlaceholders().length, 1);
});

test('l’étiquette d’une clause classique reste scannée', { skip: jsdomAbsent }, () => {
  const html =
    '<div class="ts-clause" data-key="c1">' +
    '<div class="ts-label">[Titre]</div>' +
    '<div class="ts-content"><p>Texte.</p></div></div>';
  const { findPlaceholders } = loadEditorFns(html);
  assert.deepEqual(findPlaceholders().map(p => p.text), ['[Titre]']);
});

test('remplir un champ éclaté insère la valeur au bon endroit', { skip: jsdomAbsent }, () => {
  const { findPlaceholders, applyAutofill, page } = loadEditorFns(FRAGMENTE);
  const ph = findPlaceholders();
  const fields = ph.map((p, i) => ({ id: i, text: p.text, clause: p.clauseLabel, context: '' }));
  const applied = applyAutofill([{ id: 0, value: 'ACME SAS' }], fields);

  assert.equal(applied.length, 1);
  assert.equal(applied[0].value, 'ACME SAS');
  const txt = page.querySelector('.ts-content').textContent;
  assert.equal(txt, 'La société ACME SAS, au capital de [montant] euros.',
    'le crochet ouvrant et le crochet fermant, dans d’autres balises, doivent disparaître aussi');
  assert.equal(page.querySelectorAll('span.af-flash').length, 1);
});

test('plusieurs champs remplis d’un coup ne se décalent pas', { skip: jsdomAbsent }, () => {
  const { findPlaceholders, applyAutofill, page } = loadEditorFns(FRAGMENTE);
  const ph = findPlaceholders();
  const fields = ph.map((p, i) => ({ id: i, text: p.text, clause: p.clauseLabel, context: '' }));
  applyAutofill([{ id: 0, value: 'ACME SAS' }, { id: 1, value: '10 000' }], fields);
  assert.equal(page.querySelector('.ts-content').textContent,
    'La société ACME SAS, au capital de 10 000 euros.');
});

test('deux occurrences du même champ sont remplies chacune à leur tour', { skip: jsdomAbsent }, () => {
  const html = '<div class="ts-content"><p>De [partie] à <b>[partie]</b>.</p></div>';
  const { applyAutofill, page } = loadEditorFns(html);
  const fields = [
    { id: 0, text: '[partie]', clause: 'x', context: '' },
    { id: 1, text: '[partie]', clause: 'x', context: '' },
  ];
  applyAutofill([{ id: 1, value: 'Bob' }], fields);
  assert.equal(page.textContent, 'De [partie] à Bob.', 'seule la seconde occurrence est remplie');
  applyAutofill([{ id: 0, value: 'Alice' }], [fields[0]]);
  assert.equal(page.textContent, 'De Alice à Bob.');
});

test('un champ absent n’altère pas le document', { skip: jsdomAbsent }, () => {
  const { applyAutofill, page } = loadEditorFns('<div class="ts-content"><p>Rien à remplir.</p></div>');
  const applied = applyAutofill([{ id: 0, value: 'X' }], [{ id: 0, text: '[absent]', clause: '', context: '' }]);
  assert.equal(applied.length, 0);
  assert.equal(page.textContent, 'Rien à remplir.');
});
