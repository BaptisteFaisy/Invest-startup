#!/usr/bin/env node
// Assemble les dictionnaires de i18n/fr-en/*.json en un seul i18n-en.js,
// chargé par les pages avant i18n.js.
//
//   node i18n/build.js
//
// Les fichiers source sont de simples objets { "texte français": "english text" }.
// Une valeur vide signale une entrée encore à traduire : elle est ignorée à la
// génération et comptée dans le récapitulatif.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'fr-en');
const PATTERNS = path.join(__dirname, 'patterns.js');
const OUT = path.join(__dirname, '..', 'i18n-en.js');

// Doit rester identique à norm() dans i18n.js : le moteur cherche une clé
// normalisée, une clé source écrite avec une apostrophe typographique ou une
// espace insécable ne serait jamais trouvée.
function norm(value) {
  return String(value)
    .replace(/[   ]/g, ' ')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.json')).sort();
const merged = {};
let todo = 0;
let dupes = 0;

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  let kept = 0;
  for (const [rawFr, en] of Object.entries(raw)) {
    if (!en) { todo++; continue; }
    const fr = norm(rawFr);
    if (merged[fr] !== undefined && merged[fr] !== en) dupes++;
    merged[fr] = en;
    kept++;
  }
  console.log(String(kept).padStart(5), file);
}

const patterns = fs.existsSync(PATTERNS) ? fs.readFileSync(PATTERNS, 'utf8').trim() : '[]';

const body = [
  '// Fichier généré par i18n/build.js — ne pas modifier à la main.',
  '// Source : i18n/fr-en/*.json et i18n/patterns.js',
  'window.LIQUID_I18N_EN = {',
  '  patterns: ' + patterns + ',',
  '  strings: ' + JSON.stringify(merged, null, 1),
  '};',
  ''
].join('\n');

fs.writeFileSync(OUT, body);
console.log('---');
console.log('Entrées traduites :', Object.keys(merged).length);
if (todo) console.log('Entrées en attente :', todo);
if (dupes) console.log('Doublons divergents :', dupes);
console.log('Écrit :', path.relative(process.cwd(), OUT));
