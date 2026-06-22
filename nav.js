// Injecte le lien Admin dans la nav si l'utilisateur est admin
(function () {
  let fetching = false; // empêche deux fetches simultanés

  function injectAdminIfNeeded() {
    const navLinks = document.getElementById('nav-links');
    if (!navLinks || !navLinks.querySelector('a.nav-link')) return;
    if (navLinks.querySelector('.admin-nav-link')) return; // déjà présent
    if (fetching) return; // fetch déjà en cours
    fetching = true;

    fetch('/api/admin/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        fetching = false;
        if (!data?.admin) return;
        const nl = document.getElementById('nav-links');
        if (!nl || nl.querySelector('.admin-nav-link')) return; // double-check
        const link = document.createElement('a');
        link.href = 'admin.html';
        link.className = 'nav-link admin-nav-link';
        link.textContent = 'Admin';
        const anchor = nl.querySelector('.nav-user-name') || nl.querySelector('button');
        if (anchor) nl.insertBefore(link, anchor);
        else nl.appendChild(link);
      })
      .catch(() => { fetching = false; });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;

    // Continue à observer même après injection (l'auth check peut rebuild le nav)
    new MutationObserver(injectAdminIfNeeded).observe(navLinks, { childList: true, subtree: true });
    injectAdminIfNeeded();
  });
})();

// Injecte l'onglet « liquid + SaaS » dans la nav pour les utilisateurs connectés
(function () {
  let checked = false;     // une seule requête /api/auth/me
  let isUser  = null;      // null = pas encore vérifié, true/false ensuite

  function insertSaasLink() {
    const nl = document.getElementById('nav-links');
    if (!nl || !nl.querySelector('a.nav-link')) return;
    if (nl.querySelector('.saas-nav-link')) return; // déjà présent
    const link = document.createElement('a');
    link.href = '/saas/dossiers.html';
    link.className = 'nav-link saas-nav-link';
    link.textContent = 'liquid + SaaS';
    // On l'insère juste avant le nom d'utilisateur (ou le bouton de déconnexion)
    const anchor = nl.querySelector('.nav-user-name') || nl.querySelector('button');
    if (anchor) nl.insertBefore(link, anchor);
    else nl.appendChild(link);
  }

  function injectSaasIfNeeded() {
    const nl = document.getElementById('nav-links');
    if (!nl || !nl.querySelector('a.nav-link')) return;
    if (nl.querySelector('.saas-nav-link')) return; // déjà présent
    if (isUser === true)  { insertSaasLink(); return; }
    if (isUser === false) return;                    // pas un utilisateur SaaS
    if (checked) return;                             // requête déjà en cours
    checked = true;

    // Réservé aux comptes utilisateurs (cookie auth_token) — pas aux comptes startup
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        isUser = !!(data && data.user);
        if (isUser) insertSaasLink();
      })
      .catch(() => { checked = false; });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.getElementById('nav-links');
    if (!navLinks) return;
    new MutationObserver(injectSaasIfNeeded).observe(navLinks, { childList: true, subtree: true });
    injectSaasIfNeeded();
  });
})();
