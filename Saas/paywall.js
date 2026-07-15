/* Verrou freemium LIQUID+ — couche UX côté client.
   S'active UNIQUEMENT si le compte n'est pas « activé » ET que le paywall est activé côté
   serveur (user.paywall_enabled). Sinon : ne fait strictement rien.
   Le vrai verrou est côté serveur (endpoints export / conversion / téléchargement renvoient
   402). Ceci ajoute : filigrane « brouillon », blocage copier / couper / impression, et
   interception des boutons d'export pour afficher un rappel d'activation. */
(function () {
  'use strict';
  var UPSELL_URL = 'offre.html';

  function fetchUser() {
    return fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { return d && d.user ? d.user : null; })
      .catch(function () { return null; });
  }

  function isGated(u) {
    return !!(u && u.paywall_enabled && u.plan !== 'active' && !u.is_admin);
  }

  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  function toast(msg) {
    var b = document.getElementById('liquid-gate-banner');
    if (!b) {
      b = document.createElement('div');
      b.id = 'liquid-gate-banner';
      var span = document.createElement('span');
      var a = document.createElement('a');
      a.href = UPSELL_URL;
      a.textContent = 'Activer LIQUID+ →';
      b.appendChild(span);
      b.appendChild(a);
      document.body.appendChild(b);
    }
    b.querySelector('span').textContent = '🔒 ' + msg;
    b.classList.add('show');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.remove('show'); }, 4000);
  }

  function injectStyles() {
    var wmText = 'BROUILLON · LIQUID+ NON ACTIVÉ';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">'
      + '<text x="0" y="120" transform="rotate(-24 180 100)" fill="rgba(120,120,120,0.16)" '
      + 'font-family="Arial, sans-serif" font-size="22" font-weight="700">' + wmText + '</text></svg>';
    var css = ''
      + '#liquid-gate-wm{position:fixed;inset:0;z-index:9998;pointer-events:none;'
      + 'background-image:url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '");'
      + 'background-repeat:repeat;}'
      + '#liquid-gate-banner{position:fixed;left:50%;bottom:22px;'
      + 'transform:translateX(-50%) translateY(20px);z-index:9999;display:flex;align-items:center;'
      + 'gap:14px;background:#111318;color:#fff;border:1px solid rgba(255,255,255,0.14);'
      + 'border-radius:12px;padding:12px 16px;font:600 13px/1.3 system-ui,-apple-system,sans-serif;'
      + 'box-shadow:0 20px 50px rgba(0,0,0,0.5);opacity:0;pointer-events:none;'
      + 'transition:opacity .2s,transform .2s;max-width:calc(100vw - 32px);}'
      + '#liquid-gate-banner.show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto;}'
      + '#liquid-gate-banner a{color:#60a5fa;text-decoration:none;white-space:nowrap;font-weight:700;}'
      + '@media print{#liquid-gate-wm{display:block !important;}}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function install() {
    injectStyles();
    var wm = document.createElement('div');
    wm.id = 'liquid-gate-wm';
    document.body.appendChild(wm);

    // Blocage copier / couper.
    ['copy', 'cut'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        toast('Copie désactivée — activez LIQUID+ pour copier vos documents.');
      }, true);
    });

    // Blocage impression (Ctrl/Cmd + P) = export PDF navigateur.
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        toast('Impression désactivée — activez LIQUID+ pour exporter.');
      }
    }, true);

    // Interception des boutons d'export connus (avant que window.print() / le fetch ne parte).
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('#export-pdf-item,#export-docx-item,[data-requires-active]');
      if (t) {
        e.preventDefault();
        e.stopPropagation();
        toast('Export réservé aux comptes activés.');
      }
    }, true);
  }

  fetchUser().then(function (u) {
    if (isGated(u)) whenReady(install);
  });
})();
