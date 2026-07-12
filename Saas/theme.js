/* ════════════════════════════════════════════════════════════════════════
   Bascule de thème partagée des outils SaaS.

   - Injecte un bouton clair/sombre dans la topbar (.topbar__actions).
   - Applique le thème (attribut data-theme sur <html>) et mémorise le choix
     en localStorage (« liquidTheme ») ET sur le compte
     (PUT /api/auth/preferences), donc il suit l'utilisateur d'un appareil
     à l'autre.
   - Réconcilie avec le compte au chargement : la préférence enregistrée fait
     foi ; sinon on garde le défaut de la page (déjà appliqué en ligne).

   L'application « au plus tôt » (anti-flash) est faite par un court script en
   ligne dans le <head> de chaque page ; ce fichier gère le reste.
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  var KEY = 'liquidTheme';

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'paper' ? 'paper' : 'dark';
  }

  function apply(theme, persistRemote) {
    var t = theme === 'paper' ? 'paper' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (e) {}
    var btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      var label = t === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre';
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    }
    if (persistRemote) {
      // Best-effort : ne bloque pas l'interface si l'appel échoue.
      fetch('/api/auth/preferences', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: t }),
      }).catch(function () {});
    }
  }

  function injectToggle() {
    var actions = document.querySelector('.topbar__actions');
    if (!actions || document.getElementById('theme-toggle-btn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'theme-toggle-btn';
    btn.className = 'hamburger theme-toggle';
    btn.innerHTML =
      '<svg class="theme-toggle__moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>' +
      '<svg class="theme-toggle__sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
    actions.insertBefore(btn, actions.firstChild);
    btn.addEventListener('click', function () { apply(current() === 'dark' ? 'paper' : 'dark', true); });
    apply(current(), false); // fixe le libellé du bouton
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

  function init() { injectToggle(); reconcile(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
