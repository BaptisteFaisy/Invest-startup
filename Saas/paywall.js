/* Verrou freemium LIQUID+ — couche UX côté client.
   S'active UNIQUEMENT si le compte n'est pas « activé » ET que le paywall est activé côté
   serveur (user.paywall_enabled). Sinon : ne fait strictement rien.
   Le vrai verrou est côté serveur (endpoints export / conversion / téléchargement renvoient
   402). Ceci ajoute : filigrane « brouillon », blocage copier / couper / impression, et —
   au lieu d'une erreur — une MODALE qui présente l'offre pour passer au niveau du dessus. */
(function () {
  'use strict';
  var UPSELL_URL = 'offre.html';
  var lastShown = 0;

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

  function injectStyles() {
    var wmText = 'BROUILLON · LIQUID+ NON ACTIVÉ';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200">'
      + '<text x="0" y="120" transform="rotate(-24 180 100)" fill="rgba(120,120,120,0.16)" '
      + 'font-family="Arial, sans-serif" font-size="22" font-weight="700">' + wmText + '</text></svg>';
    var css = ''
      + '#liquid-gate-wm{position:fixed;inset:0;z-index:9998;pointer-events:none;'
      + 'background-image:url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '");'
      + 'background-repeat:repeat;}'
      + '@media print{#liquid-gate-wm{display:block !important;}}'
      + '#liquid-gate-modal{position:fixed;inset:0;z-index:10000;display:none;align-items:center;'
      + 'justify-content:center;padding:20px;background:rgba(8,9,12,0.62);backdrop-filter:blur(3px);'
      + 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}'
      + '#liquid-gate-modal.show{display:flex;}'
      + '.lgm{width:100%;max-width:440px;background:#111318;color:#fff;border:1px solid rgba(255,255,255,0.12);'
      + 'border-radius:18px;padding:26px 26px 22px;box-shadow:0 30px 70px rgba(0,0,0,0.6);}'
      + '.lgm__eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#60a5fa;}'
      + '.lgm__h{font-size:20px;font-weight:800;letter-spacing:-.01em;margin:8px 0 6px;}'
      + '.lgm__reason{font-size:13.5px;color:rgba(255,255,255,0.6);line-height:1.5;margin-bottom:16px;}'
      + '.lgm__card{border:1px solid rgba(59,130,246,0.35);background:linear-gradient(135deg,#0f1524,#111318);'
      + 'border-radius:12px;padding:15px 16px;margin-bottom:16px;}'
      + '.lgm__price{font-size:24px;font-weight:800;} .lgm__price span{color:#3b82f6;}'
      + '.lgm__list{list-style:none;margin:9px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}'
      + '.lgm__list li{position:relative;padding-left:20px;font-size:13px;color:rgba(255,255,255,0.82);line-height:1.45;}'
      + '.lgm__list li::before{content:"";position:absolute;left:0;top:5px;width:6px;height:6px;border-radius:50%;background:#60a5fa;}'
      + '.lgm__act{display:flex;gap:10px;}'
      + '.lgm__btn{flex:1;text-align:center;font:700 14px/1 system-ui,sans-serif;padding:13px 16px;border-radius:10px;'
      + 'border:1px solid transparent;cursor:pointer;text-decoration:none;}'
      + '.lgm__btn--primary{background:#fff;color:#08090c;} .lgm__btn--primary:hover{background:#e9edf2;}'
      + '.lgm__btn--ghost{background:transparent;color:#fff;border-color:rgba(255,255,255,0.28);}'
      + '.lgm__btn--ghost:hover{border-color:rgba(255,255,255,0.55);}'
      + '.lgm__foot{font-size:11.5px;color:rgba(255,255,255,0.4);margin-top:14px;line-height:1.5;text-align:center;}'
      // Hook « teaser flou » : on voit qu'il y a des points à corriger (nombre visible),
      // mais le texte est flouté et cliquer ouvre l'offre. Le niveau de risque reste, lui,
      // affiché en clair (gratuit) ailleurs.
      + '.cli-todos li{filter:blur(4.5px)!important;-webkit-user-select:none;user-select:none;}'
      + '.cli-todos{position:relative;cursor:pointer;padding-bottom:42px!important;}'
      + '.cli-todos::after{content:"🔒 Activez LIQUID+ pour voir comment corriger";position:absolute;'
      + 'left:8px;right:8px;bottom:8px;text-align:center;font:700 11px/1.4 system-ui,-apple-system,sans-serif;'
      + 'color:#fff;background:rgba(17,19,24,0.88);border:1px solid rgba(96,165,250,0.55);border-radius:8px;'
      + 'padding:7px 8px;pointer-events:none;}';
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildModal() {
    var m = document.createElement('div');
    m.id = 'liquid-gate-modal';
    m.innerHTML =
      '<div class="lgm" role="dialog" aria-modal="true" aria-label="Activer LIQUID+">'
      + '<div class="lgm__eyebrow">Passer au niveau du dessus</div>'
      + '<div class="lgm__h">Activez LIQUID+ pour finaliser</div>'
      + '<div class="lgm__reason" id="lgm-reason"></div>'
      + '<div class="lgm__card"><div class="lgm__price">600 <span>€</span></div>'
      + '<ul class="lgm__list">'
      + '<li>Exporter (PDF / Word) et copier vos documents</li>'
      + '<li>La levée guidée complète + la data room</li>'
      + '<li>Analyse &amp; édition IA illimitées</li>'
      + '<li>Accès aux packages avocat</li>'
      + '</ul></div>'
      + '<div class="lgm__act">'
      + '<a class="lgm__btn lgm__btn--primary" href="' + UPSELL_URL + '">Voir les offres →</a>'
      + '<button type="button" class="lgm__btn lgm__btn--ghost" data-lgm-close>Plus tard</button>'
      + '</div>'
      + '<div class="lgm__foot">Vous gardez tout votre travail. Les validations d\'avocat sont facturées à part par l\'avocat (dès 150 €), sans commission.</div>'
      + '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) {
      if (e.target === m || (e.target.closest && e.target.closest('[data-lgm-close]'))) hideUpgrade();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideUpgrade(); });
    return m;
  }

  function showUpgrade(reason) {
    var m = document.getElementById('liquid-gate-modal') || buildModal();
    if (m.classList.contains('show')) return;          // déjà ouverte → pas d'empilement
    if (Date.now() - lastShown < 400) return;           // anti-rebond (spam Ctrl+C)
    lastShown = Date.now();
    document.getElementById('lgm-reason').textContent =
      reason || 'Vous avez tout préparé gratuitement. Pour aller plus loin, activez votre accès.';
    m.classList.add('show');
  }
  function hideUpgrade() {
    var m = document.getElementById('liquid-gate-modal');
    if (m) m.classList.remove('show');
  }

  // Interception globale : toute réponse 402 { code:'PAYWALL' } → modale d'offre (au lieu
  // d'une erreur), sur n'importe quelle page (IA, data room, création de doc, avocat…).
  function wrapFetch() {
    if (window.__lgFetchWrapped) return;
    window.__lgFetchWrapped = true;
    var _fetch = window.fetch;
    window.fetch = function () {
      return _fetch.apply(this, arguments).then(function (res) {
        if (res && res.status === 402) {
          res.clone().json().then(function (d) {
            if (d && d.code === 'PAYWALL') showUpgrade(d.error);
          }).catch(function () {});
        }
        return res;
      });
    };
  }

  function install() {
    injectStyles();
    wrapFetch();
    // Filigrane uniquement là où le contenu d'un document est affiché (éditeur / aperçu),
    // pas sur les pages de liste ou les simulateurs (qui restent gratuits et « propres »).
    if (document.querySelector('[contenteditable]') || document.documentElement.hasAttribute('data-gate-watermark') || document.body.hasAttribute('data-gate-watermark')) {
      var wm = document.createElement('div');
      wm.id = 'liquid-gate-wm';
      document.body.appendChild(wm);
    }

    // Copier / couper → offre.
    ['copy', 'cut'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        e.preventDefault();
        showUpgrade('La copie est réservée aux comptes activés — activez LIQUID+ pour copier vos documents.');
      }, true);
    });

    // Impression (Ctrl/Cmd + P = export PDF navigateur) → offre.
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        showUpgrade('L\'export PDF est réservé aux comptes activés.');
      }
    }, true);

    // Boutons d'export connus (avant que window.print() / le fetch ne parte) → offre.
    document.addEventListener('click', function (e) {
      if (!e.target.closest) return;
      if (e.target.closest('#export-pdf-item,#export-docx-item,[data-requires-active]')) {
        e.preventDefault();
        e.stopPropagation();
        showUpgrade('L\'export de vos documents est réservé aux comptes activés.');
        return;
      }
      // Hook : clic sur les points à corriger floutés → offre.
      if (e.target.closest('.cli-todos')) {
        e.preventDefault();
        e.stopPropagation();
        showUpgrade('Activez LIQUID+ pour voir les points à corriger et comment les traiter.');
      }
    }, true);
  }

  fetchUser().then(function (u) {
    if (isGated(u)) whenReady(install);
  });

  // Exposé pour d'autres pages : afficher l'offre au lieu d'une erreur sur une action payante.
  window.LIQUID_GATE = { show: showUpgrade, hide: hideUpgrade };
})();
