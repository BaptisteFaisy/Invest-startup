/* ════════════════════════════════════════════════════════════════════════
   Thème clair/sombre partagé des outils SaaS.

   Le CHOIX du thème se fait uniquement dans « Mon compte » (pas de bouton sur
   chaque page). Ce script se contente donc, sur chaque page :
   - d'appliquer le thème mémorisé (l'attribut data-theme est déjà posé au plus
     tôt par un court script en ligne, pour éviter le flash) ;
   - de réconcilier avec le compte au chargement (la préférence enregistrée fait
     foi ; sinon on garde le défaut de la page).

   Il expose window.LiquidTheme.apply(theme, persistRemote) pour que la page
   « Mon compte » pilote le choix.
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

  window.LiquidTheme = { apply: apply, current: current };
  reconcile();
})();
