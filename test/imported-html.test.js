'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  importedDocumentHtml,
  cleanAttributes,
  inlineImageAssets,
  unwrapWrapperDiv,
  filterBaseStyle,
} = require('../lib/imported-html');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const editorCss = fs.readFileSync(path.join(root, 'Saas', 'editor.css'), 'utf8');

// Document type produit par LibreOffice pour un PDF converti en Word.
const CONVERTER_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Term sheet</title>
<style type="text/css">
  p { margin-bottom: 0.08in; font-family: "Times New Roman", serif; font-size: 11pt }
  h1 { font-size: 16pt; text-align: center }
</style></head>
<body lang="fr-FR" style="margin: 2cm; font-family: 'Times New Roman', serif; font-size: 11pt; color: #1a1a1a">
<h1 class="Titre1">PROTOCOLE D'INVESTISSEMENT</h1>
<p class="Standard" style="text-align: justify">Entre les <b>soussignés</b>&nbsp;:</p>
<p>Article 1. Valorisation</p>
</body></html>`;

test('la feuille de styles du convertisseur est reportée sur chaque balise', () => {
  const { html } = importedDocumentHtml(CONVERTER_HTML, []);
  assert.match(html, /<h1[^>]*style="[^"]*16pt/i, 'la taille du titre doit survivre');
  assert.match(html, /<p[^>]*style="[^"]*Times New Roman/i, 'la police des paragraphes doit survivre');
  assert.match(html, /<p[^>]*style="[^"]*text-align:\s*justify/i, 'le style en ligne d’origine est conservé');
  assert.doesNotMatch(html, /<style/i, 'aucune feuille de styles ne doit fuir dans l’éditeur');
  assert.doesNotMatch(html, /<(?:html|head|body|title|meta)\b/i, 'seul le contenu du body est repris');
  assert.match(html, /<b>soussignés<\/b>/, 'le contenu reste intact');
});

test('la typographie du body devient le style de base, sans ses marges', () => {
  const { baseStyle } = importedDocumentHtml(CONVERTER_HTML, []);
  assert.match(baseStyle, /font-family/);
  assert.match(baseStyle, /color:\s*#1a1a1a/);
  // Les marges du fichier s'ajouteraient à celles de la feuille de l'éditeur.
  assert.doesNotMatch(baseStyle, /margin/);
});

test('les classes et identifiants du convertisseur sont retirés, les styles gardés', () => {
  const { html } = importedDocumentHtml(CONVERTER_HTML, []);
  assert.doesNotMatch(html, /class="Standard"/, 'les classes croiseraient celles de l’éditeur');
  assert.doesNotMatch(html, /class="Titre1"/);
  assert.match(html, /style="/, 'les styles, eux, portent la mise en page');
});

test('les attributs dangereux ou en conflit avec l’éditeur sont écartés', () => {
  const sale = '<p id="p1" class="x" onclick="alert(1)" data-key="c9" style="color:red">Texte</p>'
             + '<a href="javascript:alert(1)">lien</a>'
             + '<td colspan="2" align="right" width="120">Cellule</td>';
  const propre = cleanAttributes(sale);
  for (const interdit of ['id=', 'class=', 'onclick=', 'data-key=', 'javascript:']) {
    assert.ok(!propre.includes(interdit), `${interdit} devrait être retiré`);
  }
  for (const garde of ['style="color:red"', 'colspan="2"', 'align="right"', 'width="120"']) {
    assert.ok(propre.includes(garde), `${garde} porte la mise en page et doit rester`);
  }
  assert.ok(propre.includes('>Texte</p>') && propre.includes('>lien</a>'), 'le texte est intact');
});

test('les images sont encapsulées en data URI, les liens morts retirés', () => {
  const html = '<p><img src="image1.png" width="200"></p><p><img src="absente.png"></p>';
  const out = inlineImageAssets(html, [{ filename: 'image1.png', buffer: Buffer.from('PNGDATA') }]);
  assert.match(out, /src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  assert.match(out, /width="200"/, 'les dimensions d’origine sont conservées');
  assert.equal((out.match(/<img/g) || []).length, 1, 'une image sans fichier afficherait une vignette cassée');
});

test('le plafond d’images évite de faire exploser la taille du document stocké', () => {
  const html = '<p><img src="a.png"></p><p><img src="b.png"></p>';
  const gros = Buffer.alloc(1000, 1);
  const out = inlineImageAssets(html, [
    { filename: 'a.png', buffer: gros },
    { filename: 'b.png', buffer: gros },
  ], { maxTotalBytes: 1400 });
  assert.equal((out.match(/<img/g) || []).length, 1, 'seule la première image tient dans le budget');
});

test('un document entièrement enveloppé dans un <div> est rouvert', () => {
  const { html, style } = unwrapWrapperDiv(
    '<div style="font-size: 12pt"><p>Un</p><div><p>Deux</p></div></div>'
  );
  assert.equal(html, '<p>Un</p><div><p>Deux</p></div>', 'sinon tout le document ne ferait qu’une clause');
  assert.equal(style, 'font-size: 12pt', 'la typographie du conteneur est récupérée');
});

test('deux <div> frères ne sont pas confondus avec un conteneur unique', () => {
  const fragment = '<div><p>Un</p></div><div><p>Deux</p></div>';
  assert.equal(unwrapWrapperDiv(fragment).html, fragment);
});

test('filterBaseStyle ne retient que la typographie', () => {
  const out = filterBaseStyle('margin: 2cm; font-size: 11pt; width: 21cm; text-align: justify; background: #fff');
  assert.equal(out, 'font-size: 11pt; text-align: justify');
});

test('un HTML illisible ne fait pas échouer l’import', () => {
  const { html } = importedDocumentHtml('<style>@@ cassé {{{</style><p>Texte</p>', []);
  assert.match(html, /<p>Texte<\/p>/);
});

// ─── Découpage en clauses, sur le code réel du serveur ────────────────────────
// server.js démarre le serveur et ouvre MongoDB au chargement : on ne peut pas le
// require ici. On évalue donc la tranche de source qui porte la mise en page du
// document importé, pour tester le code réellement livré plutôt qu'une copie.
const { docxHtmlToEditorPage, boldHeadingText } = (() => {
  const { decodeHTML } = require('entities');
  const from = serverSource.indexOf('function stripHtml(s) {');
  const to   = serverSource.indexOf('// ─── Classification sémantique');
  assert.ok(from > 0 && to > from, 'la tranche de server.js doit être localisable');
  void decodeHTML; // utilisé par le code évalué
  return eval(serverSource.slice(from, to) + '\n;({ docxHtmlToEditorPage, boldHeadingText })');
})();

const CLAUSE_HTML =
  '<h1 style="font-size: 16pt; text-align: center">PROTOCOLE</h1>' +
  '<p style="text-align: justify">Entre les soussignés&nbsp;:</p>' +
  '<h1 style="font-size: 16pt">ARTICLE 1 &ndash; VALORISATION</h1>' +
  '<p style="margin-left: 0.5in">Quatre millions d’euros.</p>' +
  '<table><tr><td style="border: 1px solid #000">Montant</td></tr></table>' +
  '<hr>';

test('le mode fidèle laisse chaque bloc à sa place, avec ses styles', () => {
  const page = docxHtmlToEditorPage(CLAUSE_HTML, 'Protocole.pdf', {
    preserveLayout: true, baseStyle: "font-family: 'Times New Roman'",
  });
  // Les titres restent DANS le texte : les déplacer en colonne d'étiquette ou en
  // bandeau de section est précisément ce qui cassait la mise en page.
  assert.equal((page.match(/<h1 /g) || []).length, 2, 'les deux titres restent dans le corps');
  assert.ok(!page.includes('doc-title') && !page.includes('ts-group'));
  assert.match(page, /text-align: center/, 'le centrage du titre survit');
  assert.match(page, /margin-left: 0\.5in/, 'le retrait du paragraphe survit');
  assert.match(page, /<table>/, 'le tableau survit');
  assert.match(page, /<hr>/, 'le filet de séparation survit');
  assert.match(page, /<div class="ts-clause ts-clause--imported" data-key="c1" style="font-family: 'Times New Roman'">/,
    'la typographie de base est posée sur la clause, le texte en hérite');
  // Le découpage en clauses reste fait : décrypteur, redline et IA en dépendent.
  assert.equal((page.match(/ts-clause ts-clause--imported/g) || []).length, 2);
  assert.match(page, /data-key="c1"/);
});

test('le libellé d’une clause importée décode les entités du convertisseur', () => {
  const page = docxHtmlToEditorPage(CLAUSE_HTML, 'Protocole.pdf', { preserveLayout: true });
  assert.match(page, /<div class="ts-label">ARTICLE 1 – VALORISATION<\/div>/,
    'un « &ndash; » non décodé ressortirait en « &amp;ndash; »');
});

test('sans mode fidèle, le découpage historique en clauses est inchangé', () => {
  const page = docxHtmlToEditorPage(
    '<h1>PROTOCOLE</h1><p>Sous-titre</p><h2>Objet</h2><p>Texte</p>', 'Doc.docx'
  );
  assert.match(page, /<h1 class="doc-title">PROTOCOLE<\/h1>/);
  assert.match(page, /<p class="doc-sub">Sous-titre<\/p>/);
  assert.match(page, /<div class="ts-clause" data-key="c1">/, 'pas de classe « import » ici');
  assert.ok(!page.includes('ts-clause--imported'));
});

test('un article numéroté sans style Titre reste découpé et libellé', () => {
  const page = docxHtmlToEditorPage(
    '<p>Préambule.</p><p>ARTICLE 5. Valorisation retenue par les parties</p>', 'Doc.pdf'
  );
  assert.equal((page.match(/ts-clause/g) || []).length, 2, 'l’article ouvre une clause');
  // Le numéro seul ne ferait pas un libellé lisible : on lui adjoint l'intitulé.
  assert.match(page, /<div class="ts-label">ARTICLE 5\. Valorisation retenue par les parties<\/div>/);
});

test('un titre en gras est reconnu quelle que soit la balise du convertisseur', () => {
  const titres = {
    'balise sémantique':        '<p><strong>Valorisation</strong></p>',
    'balise <b>':               '<p><b>Valorisation</b></p>',
    'imbriqué dans <font>':     '<p><font face="Arial"><font size="4"><b>Valorisation</b></font></font></p>',
    'style en ligne':           '<p><span style="font-weight: bold">Valorisation</span></p>',
    'graisse numérique':        '<p><span style="font-size:12pt; font-weight:700">Valorisation</span></p>',
    'graisse sur le <p>':       '<p style="font-weight: bold">Valorisation</p>',
    'deux segments en gras':    '<p><b>Article 1</b><span style="font-weight:800"> — Valorisation</span></p>',
  };
  for (const [cas, html] of Object.entries(titres)) {
    assert.ok(boldHeadingText(html), `« ${cas} » devrait être reconnu comme un titre`);
  }
});

test('un paragraphe seulement partiellement en gras n’est pas un titre', () => {
  const nonTitres = {
    'gras en début de phrase': '<p><b>Valorisation</b> : la société est valorisée à 4 M€</p>',
    'gras au milieu':          '<p><span style="font-weight:bold">Le prix</span> est fixé ainsi</p>',
    'aucun gras':              '<p>La valorisation retenue est de quatre millions</p>',
    'graisse normale':         '<p><span style="font-weight: 400">Valorisation</span></p>',
  };
  for (const [cas, html] of Object.entries(nonTitres)) {
    assert.equal(boldHeadingText(html), null, `« ${cas} » ne devrait pas être un titre`);
  }
});

test('des titres en gras stylé découpent le document en clauses', () => {
  // Cas réel d'un PDF converti : aucun style Titre Word, les sections ne sont
  // que des paragraphes en gras. Sans détection, tout tomberait en une clause.
  const html =
    '<p><span style="font-weight:bold">VALORISATION</span></p>' +
    '<p>La société est valorisée à 4 M€.</p>' +
    '<p><span style="font-weight:bold">GOUVERNANCE</span></p>' +
    '<p>Un comité stratégique est institué.</p>';
  const page = docxHtmlToEditorPage(html, 'Term sheet.pdf', { preserveLayout: true });
  assert.equal((page.match(/ts-clause--imported/g) || []).length, 2, 'une clause par section');
  assert.match(page, /<div class="ts-label">VALORISATION<\/div>/);
  assert.match(page, /<div class="ts-label">GOUVERNANCE<\/div>/);
});

test('en mode fidèle, le texte d’un article n’est jamais absorbé par son libellé', () => {
  // Le découpage historique retire du corps un bloc qui se réduit à son titre —
  // le texte reste visible dans la colonne d'étiquette. En mode fidèle,
  // l'étiquette est masquée : le bloc doit rester dans le document.
  const page = docxHtmlToEditorPage('<p>ARTICLE 5. Valorisation</p>', 'Doc.pdf', { preserveLayout: true });
  assert.match(page, /<div class="ts-content"><p>ARTICLE 5\. Valorisation<\/p><\/div>/);
});

// ─── Câblage côté serveur et éditeur ──────────────────────────────────────────

test('l’import passe par le rendu fidèle, mammoth ne servant que de repli', () => {
  assert.match(serverSource, /async function docxToFidelityHtml\(/);
  assert.match(serverSource, /repli mammoth/);
  // Le DOCX importé directement ne doit plus court-circuiter le rendu fidèle.
  assert.match(serverSource, /raw = await docxBufferToEditorHtml\(docBuf/);
});

test('une clause de document importé porte sa classe et n’est pas reformatée', () => {
  assert.match(serverSource, /ts-clause ts-clause--imported/);
  assert.match(serverSource, /preserveLayout: raw\.layoutPreserved/);
  // Le mode fidèle ne doit extraire ni titre de document, ni bandeau de section :
  // ce sont des déplacements de contenu qui changent la mise en page.
  const fidelite = serverSource.slice(
    serverSource.indexOf('if (preserveLayout) {'),
    serverSource.indexOf('if (levels.some(l => l > 0)) {')
  );
  assert.ok(fidelite.length > 0, 'la branche « import fidèle » doit exister');
  for (const interdit of ['doc-title', 'doc-sub', 'ts-group']) {
    assert.ok(!fidelite.includes(interdit), `le mode fidèle ne doit pas produire ${interdit}`);
  }
});

test('l’export ne duplique pas le titre d’une clause importée', () => {
  assert.match(serverSource, /<div class="ts-clause ts-clause--imported"\[\^>\]\*>\)\\s\*<div class="ts-label">/);
});

test('l’éditeur laisse le document importé imposer sa typographie', () => {
  assert.match(editorCss, /\.ts-clause--imported \.ts-content \{[^}]*font-size: inherit/);
  assert.match(editorCss, /\.ts-clause--imported \+ \.ts-clause--imported \{ border-top: 0/);
});
