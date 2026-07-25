'use strict';

// ─── Import d'un document en conservant sa mise en page ───────────────────────
// Un document importé (PDF, Word, OpenDocument) est converti en HTML par
// LibreOffice (via CloudConvert). Ce convertisseur rend un document HTML COMPLET :
// une feuille de styles dans <head>, des styles en ligne, et les images dans des
// fichiers séparés à côté du .html.
//
// L'éditeur, lui, n'affiche que le contenu du <body> à l'intérieur de sa propre
// page. Tel quel, le résultat serait donc amputé : la feuille de styles serait
// perdue (polices, tailles, alignements, retraits) et les <img> pointeraient vers
// des fichiers inexistants.
//
// Ce module recompose un fragment autonome, fidèle à l'original :
//   • les règles de la feuille de styles sont poussées sur chaque balise (juice) ;
//   • les images sont encapsulées en data URI ;
//   • le balisage est nettoyé de tout ce qui entrerait en conflit avec l'éditeur
//     (scripts, classes, identifiants) ou avec la sécurité (URL javascript:).
// Ce qui reste — style, colspan, align, width… — est conservé intact : c'est
// précisément ce qui porte la mise en page.

// juice 12 est transpilé depuis de l'ESM : en CommonJS, la fonction est sur
// `.default`. Sans ce déballage, l'appel échouerait silencieusement et tous les
// documents importés perdraient leur feuille de styles.
const juiceModule = require('juice');
const juice = typeof juiceModule === 'function' ? juiceModule : juiceModule.default;

// Poids total des images encapsulées en base64. Le HTML produit est stocké DEUX
// fois par document (version de travail + version de référence du redline) : le
// plafond doit rester loin de la limite de 16 Mo d'un document MongoDB.
const MAX_INLINE_IMAGE_BYTES = 2_500_000;

const IMAGE_MIME_BY_EXT = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg',
  gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
  tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon',
};

// Attributs retirés du document importé : ils n'apportent aucune mise en page et
// se télescoperaient avec l'éditeur (les classes/identifiants de LibreOffice
// croiseraient les siens, data-key/data-skey sont posés par le découpage en
// clauses, on* exécuterait du script).
const DROPPED_ATTR_RE = /^(?:class|id|on\w+|contenteditable|spellcheck|draggable|tabindex|role|xmlns(?::\w+)?|data-[\w-]*)$/i;

// Propriétés conservées du style de <body> : celles qui décrivent la typographie
// du document. Les marges/dimensions sont écartées — la feuille de l'éditeur pose
// déjà les siennes, les cumuler décalerait tout le texte.
const BASE_STYLE_PROPS = new Set([
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'color', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'direction',
]);

const TAG_RE  = /<([a-zA-Z][\w:.-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s">]+))?)*)\s*(\/?)>/g;
const ATTR_RE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+)))?/g;

function attrValue(attrs, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s">]+))', 'i');
  const m = re.exec(String(attrs || ''));
  if (!m) return '';
  return (m[1] ?? m[2] ?? m[3] ?? '').trim();
}

// Isole le contenu du <body> et le style de base que le convertisseur y a posé.
function extractBody(html) {
  const s = String(html || '');
  const m = /<body\b([^>]*)>([\s\S]*?)<\/body>/i.exec(s);
  if (!m) return { body: s.replace(/<\/?(?:html|head|body)\b[^>]*>/gi, ''), bodyStyle: '' };
  return { body: m[2], bodyStyle: attrValue(m[1], 'style') };
}

// Pousse les règles de la feuille de styles sur chaque balise. Sans cela, le
// <style> serait perdu à l'extraction du <body> — ou, pire, s'il était conservé,
// il repeindrait toute l'application autour du document.
function inlineStyleSheets(html) {
  try {
    return juice(String(html || ''), { removeStyleTags: true, preserveImportant: true });
  } catch {
    // Feuille de styles illisible : on garde le document tel quel, les styles
    // déjà en ligne suffisent à un rendu approchant.
    return String(html || '');
  }
}

function stripDangerousMarkup(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|title|noscript|iframe|object|embed|applet)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:html|head|body|meta|link|base|script|style|title|noscript|iframe|object|embed|applet)\b[^>]*>/gi, '');
}

function cleanAttributes(html) {
  return String(html || '').replace(TAG_RE, (full, tag, attrs, selfClose) => {
    if (!attrs || !attrs.trim()) return full;
    const kept = [];
    let a;
    ATTR_RE.lastIndex = 0;
    while ((a = ATTR_RE.exec(attrs))) {
      const name  = a[1];
      const value = a[2] ?? a[3] ?? a[4] ?? null;
      if (DROPPED_ATTR_RE.test(name)) continue;
      if (/^(?:href|src|xlink:href|action|background)$/i.test(name) &&
          /^\s*(?:javascript|vbscript|data:text\/html|file):/i.test(value || '')) continue;
      kept.push(value == null ? name : `${name}="${value.replace(/"/g, '&quot;')}"`);
    }
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${selfClose ? ' /' : ''}>`;
  });
}

function mimeForFilename(filename) {
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] || 'application/octet-stream';
}

function assetKey(name) {
  let s = String(name || '').split(/[?#]/)[0];
  s = s.split('/').pop().split('\\').pop();
  try { s = decodeURIComponent(s); } catch { /* nom déjà littéral */ }
  return s.toLowerCase();
}

// Remplace chaque <img src="image1.png"> par son data URI. Une image dont le
// fichier manque, ou qui ferait dépasser le plafond, est retirée : un lien mort
// afficherait une vignette cassée au milieu du document.
function inlineImageAssets(html, assets, { maxTotalBytes = MAX_INLINE_IMAGE_BYTES } = {}) {
  const byName = new Map();
  for (const asset of assets || []) {
    if (!asset || !asset.filename || !asset.buffer) continue;
    byName.set(assetKey(asset.filename), asset);
  }
  let used = 0;
  return String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
    const m = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/i.exec(tag);
    const src = m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
    if (/^data:/i.test(src)) return tag;
    const asset = byName.get(assetKey(src));
    if (!asset) return '';
    const base64 = Buffer.from(asset.buffer).toString('base64');
    if (used + base64.length > maxTotalBytes) return '';
    used += base64.length;
    const mime = asset.mimetype || mimeForFilename(asset.filename);
    return tag.replace(m[0], `src="data:${mime};base64,${base64}"`);
  });
}

// Vrai si le premier <div> du fragment ne se referme qu'à la toute fin, donc
// s'il enveloppe l'intégralité du document.
function divWrapsWholeFragment(s) {
  const re = /<(\/?)div\b[^>]*>/gi;
  let depth = 0, m;
  while ((m = re.exec(s))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex === s.length;
    if (depth < 0) return false;
  }
  return false;
}

// LibreOffice enveloppe parfois tout le document dans un <div>. Laissé en place,
// ce conteneur unique ferait du document entier une seule clause (plus aucun
// découpage pour le décrypteur ni pour le redline). On l'ouvre, en récupérant au
// passage le style typographique qu'il portait.
function unwrapWrapperDiv(html) {
  let s = String(html || '').trim();
  let style = '';
  for (let i = 0; i < 4; i++) {
    if (!/^<div\b/i.test(s) || !divWrapsWholeFragment(s)) break;
    const m = /^<div\b([^>]*)>([\s\S]*)<\/div>$/i.exec(s);
    if (!m) break;
    const inner = attrValue(m[1], 'style');
    if (inner) style = style ? `${style};${inner}` : inner;
    s = m[2].trim();
  }
  return { html: s, style };
}

// Ne garde du style de base que la typographie (voir BASE_STYLE_PROPS).
function filterBaseStyle(style) {
  return String(style || '')
    .split(';')
    .map(d => d.trim())
    .filter(Boolean)
    .filter(d => BASE_STYLE_PROPS.has(d.split(':')[0].trim().toLowerCase()))
    .join('; ');
}

// Point d'entrée : document HTML complet du convertisseur + fichiers joints
// ([{ filename, buffer, mimetype }]) → fragment autonome pour l'éditeur.
// Renvoie { html, baseStyle } — baseStyle porte la typographie du document,
// à poser sur le conteneur pour que le texte l'hérite.
function importedDocumentHtml(fullHtml, assets, opts = {}) {
  const { body, bodyStyle } = extractBody(inlineStyleSheets(fullHtml));
  let out = stripDangerousMarkup(body);
  out = cleanAttributes(out);
  out = inlineImageAssets(out, assets, opts);
  const unwrapped = unwrapWrapperDiv(out);
  return {
    html: unwrapped.html.trim(),
    baseStyle: filterBaseStyle([bodyStyle, unwrapped.style].filter(Boolean).join(';')),
  };
}

module.exports = {
  importedDocumentHtml,
  extractBody,
  inlineStyleSheets,
  stripDangerousMarkup,
  cleanAttributes,
  inlineImageAssets,
  unwrapWrapperDiv,
  filterBaseStyle,
  MAX_INLINE_IMAGE_BYTES,
};
