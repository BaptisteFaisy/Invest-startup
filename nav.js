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
