#!/usr/bin/env node
// Rend chaque page dans jsdom avec l'anglais actif, puis liste les textes
// restés en français. À lancer après avoir ajouté du texte au site :
//
//   node i18n/check.js
//
// Les scripts de page sont retirés avant le rendu (ils appellent le réseau) :
// le contrôle porte donc sur le HTML statique, pas sur les fragments injectés
// par l'application. Pour ceux-là, le dictionnaire reste la seule garantie.
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'uploads', 'ressourcegraphique', 'ressource tech', 'docs', 'test', 'i18n', 'liquid-uploader-extension']);
// Les modèles d'actes sont des documents juridiques français : hors périmètre.
const SKIP_PATH = /Saas[\/\\]ressources[\/\\]modeles/;

// Doit rester aligné sur SKIP_TAGS + SKIP_SELECTOR de i18n.js.
const PROTECTED = 'script, style, noscript, textarea, code, pre, svg, #page, .rl-doc, ' +
  '[contenteditable], [data-i18n-skip], [translate="no"], .notranslate';

const FRENCH = /[àâäçéèêëîïôöùûüÿœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸŒ]|\b(le|la|les|un|une|des|du|de|au|aux|et|ou|est|sont|vous|votre|vos|nous|notre|pour|par|sur|dans|avec|sans|plus|tout|tous|cette|ces|qui|que|pas|non|mon|ma|ses|son|elle|il|mais|donc|chez|entre|vers|aucun|aucune|autre|autres|bien|encore|jamais|toujours|peut|doit|faire|fait|voir)\b/i;
// Anglais qui déclenche à tort l'heuristique (« à la carte », « Paris »…).
const ENGLISH = /\b(the|and|with|your|for|this|that|are|is|of|to|in|on|not|every|from|fees|lawyer|round|shares)\b/i;
const ACCENTED = /[àâçéèêëîïôùûœÀÉÈÊÎÔÛ]/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.html$/.test(e.name) && !SKIP_PATH.test(p)) out.push(p);
  }
  return out;
}

const dict = fs.readFileSync(path.join(ROOT, 'i18n-en.js'), 'utf8');
const engine = fs.readFileSync(path.join(ROOT, 'i18n.js'), 'utf8');

// Une traduction déjà produite peut contenir un mot que l'heuristique croit
// français (« à la carte », « senior »…). On les reconnaît pour ne pas les
// signaler : ce sont précisément les textes qui ont fait leur travail.
const translated = new Set();
{
  const body = dict.slice(dict.indexOf('strings:') + 8).trim().replace(/\};?\s*$/, '');
  for (const value of Object.values(JSON.parse(body))) translated.add(value);
}

const missing = new Map();
const failed = [];
let rendered = 0;

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8')
    .replace(/<script\b(?![^>]*i18n)[^>]*>[\s\S]*?<\/script>/gi, '');

  let win;
  try {
    win = new JSDOM(html, {
      runScripts: 'outside-only',
      virtualConsole: new VirtualConsole(),
      url: 'https://liquidplus.fr/'
    }).window;
    win.localStorage.setItem('liquidLang', 'en');
    win.eval(dict);
    win.eval(engine);
  } catch (e) {
    failed.push(rel + ' — ' + e.message);
    continue;
  }

  const walker = win.document.createTreeWalker(win.document.body, win.NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest(PROTECTED)) continue;
    const text = node.nodeValue.replace(/\s+/g, ' ').trim();
    if (text.length < 3 || text.length > 400) continue;
    if (!FRENCH.test(text)) continue;
    if (translated.has(text)) continue;                        // déjà traduit
    if (ENGLISH.test(text) && !ACCENTED.test(text)) continue;
    if (!missing.has(text)) missing.set(text, new Set());
    missing.get(text).add(rel);
  }
  rendered++;
}

console.log('Pages contrôlées :', rendered);
failed.forEach(f => console.log('  ✗', f));
if (!missing.size) {
  console.log('Aucun texte français résiduel.');
} else {
  console.log('Textes à traduire :', missing.size);
  for (const [text, files] of missing) {
    console.log('  •', [...files].join(', '), '\n      ' + text);
  }
}
process.exit(failed.length ? 1 : 0);
