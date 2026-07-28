// Bascule FR / EN pour le site et l'outil.
//
// Le site compte une quarantaine de pages dont les textes sont pour partie
// écrits dans le HTML, pour partie injectés par les scripts (éditeur, tableau
// de bord) et pour partie renvoyés par l'API. Plutôt que de baliser chaque
// élément, ce moteur traduit le DOM à partir d'un dictionnaire FR → EN
// (i18n-en.js) et surveille les mutations : un texte arrivé après coup est
// traduit dès son insertion, quelle que soit sa provenance.
//
// Rien n'est traduit qui ne figure au dictionnaire : les données saisies par
// l'utilisateur (noms de société, de documents, contenu des actes) traversent
// donc le moteur sans être touchées.
(function () {
  'use strict';

  var STORAGE_KEY = 'liquidLang';
  var DEFAULT_LANG = 'fr';
  var LANGS = ['fr', 'en'];

  function readLang() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return DEFAULT_LANG;
  }

  var lang = readLang();
  // Le dictionnaire pèse plusieurs centaines de kilo-octets : il n'est chargé
  // que si l'anglais est actif (voir loadDictionary plus bas).
  var dict = null;
  var patterns = [];
  var active = false;

  function adoptDictionary() {
    var data = window.LIQUID_I18N_EN;
    if (!data || !data.strings) return false;
    dict = data.strings;
    patterns = data.patterns || [];
    active = lang === 'en';
    return active;
  }

  // ─── Normalisation ────────────────────────────────────────────────────────
  // La clé de recherche ignore les espaces multiples, les insécables et les
  // apostrophes typographiques : le même libellé écrit « l'IA » ici et
  // « l’IA » là ne réclame qu'une seule entrée.
  function norm(value) {
    return String(value)
      .replace(/[   ]/g, ' ')
      .replace(/[’‘]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ─── Dates ────────────────────────────────────────────────────────────────
  // Les dates sont produites par toLocaleDateString('fr-FR') un peu partout.
  // Plutôt que d'inventorier chaque phrase datée, on traduit les noms de mois
  // et de jours partout où ils apparaissent, y compris dans un libellé sinon
  // absent du dictionnaire.
  var DATE_WORDS = {
    janvier: 'January', février: 'February', mars: 'March', avril: 'April',
    mai: 'May', juin: 'June', juillet: 'July', août: 'August',
    septembre: 'September', octobre: 'October', novembre: 'November', décembre: 'December',
    lundi: 'Monday', mardi: 'Tuesday', mercredi: 'Wednesday', jeudi: 'Thursday',
    vendredi: 'Friday', samedi: 'Saturday', dimanche: 'Sunday'
  };
  var DATE_RE = /\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/gi;

  function localizeDates(value) {
    if (!DATE_RE.test(value)) { DATE_RE.lastIndex = 0; return null; }
    DATE_RE.lastIndex = 0;
    return value.replace(DATE_RE, function (word) {
      var en = DATE_WORDS[word.toLowerCase()];
      if (!en) return word;
      // « 12 Juillet » garde sa capitale, « le juillet » n'en prend pas.
      return word[0] === word[0].toUpperCase() ? en : en.toLowerCase();
    });
  }

  var lookupCache = Object.create(null);

  function lookup(key) {
    if (!active || !key) return null;
    if (key in lookupCache) return lookupCache[key];

    var hit = dict[key];
    if (hit === undefined) {
      // Un libellé peut porter une ponctuation finale variable selon l'endroit
      // où il est affiché (« Enregistrer » / « Enregistrer… »). On réessaie
      // sans elle avant d'abandonner, puis on la remet sur la traduction.
      var m = key.match(/^(.*?)([\s]*[:：…\.!?]+)$/);
      if (m && m[1]) {
        var base = dict[m[1]];
        if (base !== undefined) hit = base + m[2].replace(/\s+/g, '');
      }
    }
    if (hit === undefined) {
      for (var i = 0; i < patterns.length; i++) {
        var rule = patterns[i];
        if (rule[0].test(key)) {
          rule[0].lastIndex = 0;
          hit = key.replace(rule[0], rule[1]);
          break;
        }
        rule[0].lastIndex = 0;
      }
    }

    // Un mois français peut subsister dans la traduction (motif à date) comme
    // dans un libellé introuvable : on le traduit dans les deux cas.
    var dated = localizeDates(hit === undefined ? key : hit);
    if (dated !== null) hit = dated;

    lookupCache[key] = hit === undefined ? null : hit;
    return lookupCache[key];
  }

  // ─── Zones protégées ──────────────────────────────────────────────────────
  // Le corps du document de l'éditeur (#page) contient les actes de
  // l'utilisateur : les traduire reviendrait à altérer des pièces juridiques.
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1, IFRAME: 1, CANVAS: 1 };
  var SKIP_SELECTOR = '#page, .rl-doc, [contenteditable="true"], [contenteditable=""], [translate="no"], [data-i18n-skip], .notranslate';

  function isProtected(node) {
    var el = node.nodeType === 1 ? node : node.parentNode;
    while (el && el.nodeType === 1) {
      if (SKIP_TAGS[el.nodeName]) return true;
      if (el.matches && el.matches(SKIP_SELECTOR)) return true;
      el = el.parentNode;
    }
    return false;
  }

  // ─── Application ──────────────────────────────────────────────────────────
  var TRANSLATABLE_ATTRS = [
    'placeholder', 'title', 'aria-label', 'aria-placeholder', 'aria-description',
    'alt', 'data-label', 'data-tooltip', 'data-empty', 'data-placeholder',
    'data-title', 'data-hint', 'data-confirm'
  ];

  var applying = false;

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw || raw.length > 3000) return;
    var key = norm(raw);
    if (key.length < 2) return;
    var out = lookup(key);
    if (out == null || out === key) return;
    // Les espaces de bord portent la mise en forme (« Bonjour » suivi d'un
    // nom) : on ne remplace que le contenu utile.
    node.nodeValue = raw.match(/^\s*/)[0] + out + raw.match(/\s*$/)[0];
  }

  function translateAttrs(el) {
    for (var i = 0; i < TRANSLATABLE_ATTRS.length; i++) {
      var name = TRANSLATABLE_ATTRS[i];
      if (!el.hasAttribute(name)) continue;
      var out = lookup(norm(el.getAttribute(name)));
      if (out != null) el.setAttribute(name, out);
    }
    if (el.nodeName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type || '')) {
      var v = lookup(norm(el.value));
      if (v != null) el.value = v;
    }
    if (el.nodeName === 'OPTION' || el.nodeName === 'OPTGROUP') {
      var lbl = el.getAttribute('label');
      if (lbl) {
        var t = lookup(norm(lbl));
        if (t != null) el.setAttribute('label', t);
      }
    }
  }

  function translateTree(root) {
    if (!active || !root) return;

    if (root.nodeType === 3) {
      if (!isProtected(root)) translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && isProtected(root)) return;

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.nodeType === 1) {
          if (SKIP_TAGS[node.nodeName]) return NodeFilter.FILTER_REJECT;
          if (node.matches && node.matches(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    if (root.nodeType === 1) translateAttrs(root);
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) translateAttrs(node);
      else translateTextNode(node);
    }
  }

  function translateHead() {
    if (!active) return;
    document.documentElement.setAttribute('lang', 'en');
    if (document.title) {
      var t = lookup(norm(document.title));
      if (t != null) document.title = t;
    }
    var metas = document.querySelectorAll(
      'meta[name="description"], meta[property="og:title"], meta[property="og:description"], meta[name="twitter:title"], meta[name="twitter:description"]'
    );
    for (var i = 0; i < metas.length; i++) {
      var c = lookup(norm(metas[i].getAttribute('content') || ''));
      if (c != null) metas[i].setAttribute('content', c);
    }
  }

  function run(root) {
    if (applying) return;
    applying = true;
    try { translateTree(root || document.body); } finally { applying = false; }
  }

  // ─── Observation ──────────────────────────────────────────────────────────
  // L'éditeur et le tableau de bord réécrivent de grands fragments après le
  // chargement ; les lots sont regroupés dans une même image pour éviter de
  // reparcourir l'arbre à chaque nœud inséré.
  var pending = [];
  var scheduled = false;
  var observer = null;

  function flush() {
    scheduled = false;
    var batch = pending;
    pending = [];
    if (!batch.length) return;
    applying = true;
    try {
      for (var i = 0; i < batch.length; i++) {
        var node = batch[i];
        if (node && (node.nodeType === 1 || node.nodeType === 3) && node.isConnected !== false) {
          translateTree(node);
        }
      }
    } finally {
      applying = false;
      if (observer) observer.takeRecords();
    }
  }

  function schedule(node) {
    pending.push(node);
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(flush, 0);
  }

  function observe() {
    if (!active || !window.MutationObserver) return;
    observer = new MutationObserver(function (records) {
      if (applying) return;
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === 'childList') {
          for (var j = 0; j < r.addedNodes.length; j++) schedule(r.addedNodes[j]);
        } else if (r.type === 'characterData') {
          schedule(r.target);
        } else if (r.type === 'attributes') {
          schedule(r.target);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRS
    });
  }

  // ─── Bouton de bascule ────────────────────────────────────────────────────
  // Le bouton s'insère dans des bandeaux clairs comme sombres : il n'impose
  // aucune couleur propre et se contente de currentColor, avec un gris neutre
  // pour marquer la langue active — lisible sur les deux fonds.
  var SWITCH_CSS = [
    '.i18n-switch{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:999px;',
    'border:1px solid currentColor;color:inherit;opacity:.6;line-height:1;flex:none;vertical-align:middle;',
    'transition:opacity .15s}',
    '.i18n-switch:hover,.i18n-switch:focus-within{opacity:1}',
    '.i18n-switch__btn{appearance:none;border:0;background:transparent;color:inherit;cursor:pointer;',
    'font:700 11px/1 "Archivo",system-ui,sans-serif;letter-spacing:.06em;padding:5px 9px;border-radius:999px;',
    'opacity:.55;transition:background .15s,opacity .15s}',
    '.i18n-switch__btn:hover{opacity:1}',
    '.i18n-switch__btn:focus-visible{outline:2px solid currentColor;outline-offset:1px}',
    '.i18n-switch__btn[aria-pressed="true"]{background:rgba(128,128,128,.3);opacity:1;font-weight:800}',
    '.i18n-switch--float{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#08090c;color:#fff;',
    'border-color:rgba(255,255,255,.4);opacity:1;box-shadow:0 6px 20px rgba(0,0,0,.35)}',
    // Colonnes centrées (connexion, onboarding) : le gap du conteneur est large,
    // on ramène le bouton sous le logo.
    '.auth-wrap>.i18n-switch,main.wrap>.i18n-switch{margin:-18px 0 -10px}',
    // Sur mobile le bandeau est trop serré : le bouton passe en pastille flottante.
    '@media (max-width:720px){.site-header .i18n-switch{display:none}}'
  ].join('');

  function buildSwitch(extraClass) {
    var wrap = document.createElement('div');
    wrap.className = 'i18n-switch' + (extraClass ? ' ' + extraClass : '');
    wrap.setAttribute('data-i18n-skip', '');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', lang === 'en' ? 'Language' : 'Langue');

    LANGS.forEach(function (code) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'i18n-switch__btn';
      btn.setAttribute('aria-pressed', String(code === lang));
      btn.setAttribute('title', code === 'fr' ? (lang === 'en' ? 'French' : 'Français') : 'English');
      btn.innerHTML = '<span>' + code.toUpperCase() + '</span>';
      btn.addEventListener('click', function () { setLang(code); });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function setLang(code) {
    if (code === lang || LANGS.indexOf(code) === -1) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
    // Le moteur modifie le DOM en place : recharger est le moyen le plus sûr
    // de revenir à des libellés propres, y compris ceux déjà rendus par les
    // scripts de page.
    location.reload();
  }

  // Emplacements connus, du plus intégré au plus générique. « before » place le
  // bouton juste avant l'élément visé — c'est ce qui l'amène à droite du
  // bandeau, près de l'appel à l'action, plutôt qu'au milieu : sur la page
  // d'accueil, .nav-primary est centré en absolu et l'y insérer décalerait le
  // menu.
  var MOUNTS = [
    // Outil SaaS : barre du haut, côté droit.
    { sel: '.topbar__actions', where: 'prepend' },
    { sel: '.topbar__side--right', where: 'prepend' },   // espace avocat
    // Site : à gauche de l'appel à l'action, ou dans le groupe de liens.
    { sel: '.nav-signup', where: 'before' },
    { sel: '#nav-links', where: 'prepend' },
    { sel: '.site-header .nav-links', where: 'prepend' },   // espace startup
    { sel: '#nav-hamburger', where: 'before' },
    // Connexion, création de compte et onboarding : pas de bandeau, mais une
    // colonne centrée sous le logo. Le choix de langue doit y être offert
    // d'emblée — c'est là que se décide la langue de tout le parcours.
    { sel: '.auth-wrap > .auth-logo', where: 'after' },
    { sel: 'main.wrap > .logo', where: 'after' },
    // Pages à en-tête propre : dossier de relecture, projets, plaquette,
    // fiches d'offre.
    { sel: 'header.top', where: 'append' },
    { sel: '.projects-header__top', where: 'append' },
    { sel: '.cover__nav', where: 'append' },
    { sel: '.hero > .brand', where: 'after' }
  ];

  // Le bouton du bandeau n'est pas toujours à l'écran : certaines pages posent
  // leur bandeau à display:none — définitivement (« Comment ça marche ») ou le
  // temps d'une vérification (« Nos startups » le révèle par script) — et une
  // media query le replie sur mobile. On mesure donc si le bouton est
  // réellement dans le flux ; sinon la pastille flottante prend le relais.
  function isOutOfLayout(el) {
    if (!window.getComputedStyle) return false;
    for (var node = el; node && node.nodeType === 1; node = node.parentElement) {
      var style = window.getComputedStyle(node);
      if (style && style.display === 'none') return true;
    }
    return false;
  }

  // Tout bouton posé dans le flux de la page, quel que soit son emplacement.
  var INLINE_SWITCH = '.i18n-switch:not(.i18n-switch--float)';

  function mountSwitch() {
    var existing = document.querySelector(INLINE_SWITCH);
    if (existing) return existing;
    for (var i = 0; i < MOUNTS.length; i++) {
      var host = document.querySelector(MOUNTS[i].sel);
      if (!host) continue;
      var sw = buildSwitch();
      var where = MOUNTS[i].where;
      if (where === 'before' && host.parentNode) host.parentNode.insertBefore(sw, host);
      else if (where === 'after' && host.parentNode) host.parentNode.insertBefore(sw, host.nextSibling);
      else if (where === 'prepend' && host.firstChild) host.insertBefore(sw, host.firstChild);
      else host.appendChild(sw);
      return sw;
    }
    return null;
  }

  function mountFloat() {
    if (document.querySelector('.i18n-switch--float')) return;
    document.body.appendChild(buildSwitch('i18n-switch--float'));
  }

  function removeFloat() {
    var f = document.querySelector('.i18n-switch--float');
    if (f && f.parentNode) f.parentNode.removeChild(f);
  }

  // La pastille flottante n'apparaît que si le bouton du bandeau n'est pas
  // exploitable, et disparaît dès qu'il le redevient.
  function syncFloat() {
    var sw = document.querySelector(INLINE_SWITCH);
    if (!sw || isOutOfLayout(sw)) mountFloat();
    else removeFloat();
  }

  function mountAll() {
    mountSwitch();
    syncFloat();
  }

  // L'outil bascule des classes en permanence (tiroirs, dossiers pliés). On
  // regroupe les vérifications au lieu d'en lancer une par mutation.
  var mountScheduled = false;
  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    window.setTimeout(function () { mountScheduled = false; mountAll(); }, 120);
  }

  function injectStyle() {
    if (document.getElementById('i18n-switch-style')) return;
    var s = document.createElement('style');
    s.id = 'i18n-switch-style';
    s.textContent = SWITCH_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── Démarrage ────────────────────────────────────────────────────────────
  function start() {
    injectStyle();
    translateHead();
    run(document.body);
    mountAll();
    observe();
    // La barre d'outils est parfois reconstruite après la vérification de
    // session : on remet le bouton en place si besoin. Les pages qui révèlent
    // leur bandeau après coup le font en modifiant style/class : on suit donc
    // aussi ces attributs, pour retirer la pastille devenue inutile.
    if (window.MutationObserver) {
      new MutationObserver(scheduleMount).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }
    window.addEventListener('resize', scheduleMount);
  }

  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  // ─── Chargement du dictionnaire ───────────────────────────────────────────
  // En anglais, le rendu est retenu le temps du chargement pour éviter que la
  // page ne s'affiche d'abord en français. Le dévoilement est déclenché par
  // trois voies indépendantes (succès, échec, délai maximal) : la page ne peut
  // pas rester masquée, même si le fichier ne répond pas.
  var HOLD_ID = 'i18n-hold';
  var HOLD_MAX_MS = 2500;

  function holdPaint() {
    if (document.getElementById(HOLD_ID)) return;
    var s = document.createElement('style');
    s.id = HOLD_ID;
    s.textContent = 'body{visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(s);
  }

  function releasePaint() {
    var s = document.getElementById(HOLD_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function dictionaryUrl() {
    var self = document.currentScript;
    if (self && self.src) return self.src.replace(/i18n\.js/, 'i18n-en.js');
    return '/i18n-en.js';
  }

  if (lang !== 'en') {
    whenReady(start);                       // français : rien à charger
  } else if (window.LIQUID_I18N_EN) {
    adoptDictionary();                      // dictionnaire déjà en page
    whenReady(start);
  } else {
    holdPaint();
    window.setTimeout(releasePaint, HOLD_MAX_MS);
    var tag = document.createElement('script');
    tag.src = dictionaryUrl();
    tag.onload = function () {
      adoptDictionary();
      whenReady(function () { start(); releasePaint(); });
    };
    // Dictionnaire injoignable : on affiche la page telle quelle, en français.
    tag.onerror = function () { whenReady(start); releasePaint(); };
    (document.head || document.documentElement).appendChild(tag);
  }

  // ─── API publique ─────────────────────────────────────────────────────────
  window.LiquidI18n = {
    lang: lang,
    isEnglish: function () { return active; },
    set: setLang,
    // Permet à un script de traduire une chaîne qu'il s'apprête à insérer.
    t: function (value) {
      var out = lookup(norm(value));
      return out == null ? value : out;
    },
    refresh: function (root) { run(root); }
  };
})();
