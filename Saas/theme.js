/* ════════════════════════════════════════════════════════════════════════
   Thème clair/sombre partagé des outils SaaS.

   Le thème peut être basculé depuis un bouton (soleil/lune) posé dans la
   topbar de chaque page, OU depuis « Mon compte » — les deux écrivent la même
   préférence (localStorage + compte), qui s'applique ensuite à tout le site.
   Ce script, sur chaque page :
   - applique le thème mémorisé (l'attribut data-theme est déjà posé au plus
     tôt par un court script en ligne, pour éviter le flash) ;
   - injecte le bouton bascule dans la topbar ;
   - réconcilie avec le compte au chargement (la préférence enregistrée fait
     foi ; sinon on garde le défaut de la page).

   Il expose window.LiquidTheme.apply(theme, persistRemote) pour que la page
   « Mon compte » pilote aussi le choix.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'liquidTheme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'paper';
  }

  function apply(theme, persistRemote) {
    var t = theme === 'paper' ? 'paper' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    if (persistRemote) {
      // Best-effort : ne bloque pas l'interface si l'appel échoue.
      fetch('/api/auth/preferences', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      }).catch(function () {});
    }
    try { document.dispatchEvent(new CustomEvent('liquidthemechange', { detail: { theme: t } })); } catch (e) {}
  }

  function reconcile() {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        var t = d && d.user && d.user.theme;
        if (t === 'paper' || t === 'dark') apply(t, false);
      })
      .catch(function () {});
  }

  // Injecte le bouton bascule (soleil/lune) dans la topbar, à gauche de la
  // recherche et du menu. Fonctionne quelle que soit la structure de la barre.
  function mountToggle() {
    if (document.body && document.body.hasAttribute('data-no-theme-toggle')) return;
    if (document.querySelector('.topbar .theme-toggle')) return;
    var host = document.querySelector('.topbar__actions') ||
               document.querySelector('.topbar__side--right') ||
               document.querySelector('.topbar');
    if (!host) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.setAttribute('aria-label', 'Basculer le thème clair ou sombre');
    btn.title = 'Thème clair / sombre';
    btn.innerHTML =
      '<svg class="theme-toggle__sun" viewBox="0 0 24 24" aria-hidden="true">' +
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' +
      '</svg>' +
      '<svg class="theme-toggle__moon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>' +
      '</svg>';
    btn.addEventListener('click', function () {
      apply(current() === 'paper' ? 'dark' : 'paper', true);
    });
    host.insertBefore(btn, host.firstChild);
  }

  window.LiquidTheme = { apply: apply, current: current };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountToggle);
  } else {
    mountToggle();
  }
  reconcile();
})();
