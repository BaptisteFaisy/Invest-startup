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
    link.href = '/saas/tableau-de-bord.html';
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

// Ouvre le menu mobile avec un glissement depuis le bord de l'ecran.
// Le geste ne s'active qu'apres un mouvement clairement horizontal afin de ne
// pas perturber le defilement normal de la page.
(function () {
  const EDGE_ZONE = 28;
  const MIN_SWIPE_DISTANCE = 64;
  const HORIZONTAL_RATIO = 1.5;

  document.addEventListener('DOMContentLoaded', () => {
    const menuButton = document.getElementById('nav-hamburger');
    const mobileMenu = document.getElementById('mobile-menu');
    if (!menuButton || !mobileMenu) return;

    let gesture = null;

    const isMobileMenuAvailable = () =>
      window.matchMedia('(max-width: 720px)').matches &&
      window.getComputedStyle(menuButton).display !== 'none';

    const resetGesture = () => { gesture = null; };

    document.addEventListener('touchstart', (event) => {
      if (!isMobileMenuAvailable() || mobileMenu.classList.contains('open')) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const startsAtLeftEdge = touch.clientX <= EDGE_ZONE;
      const startsAtRightEdge = touch.clientX >= window.innerWidth - EDGE_ZONE;
      if (!startsAtLeftEdge && !startsAtRightEdge) return;

      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        direction: startsAtLeftEdge ? 1 : -1,
        isHorizontal: false,
      };
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
      if (!gesture) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const movesTowardScreen = deltaX * gesture.direction > 0;

      if (!gesture.isHorizontal) {
        if (!movesTowardScreen || Math.abs(deltaY) > Math.abs(deltaX) / HORIZONTAL_RATIO) {
          resetGesture();
          return;
        }
        if (Math.abs(deltaX) >= 12) gesture.isHorizontal = true;
      }

      if (gesture.isHorizontal && event.cancelable) event.preventDefault();
    }, { passive: false });

    document.addEventListener('touchend', (event) => {
      if (!gesture) return;
      const touch = event.changedTouches[0];
      if (!touch) return resetGesture();

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const opensMenu = gesture.isHorizontal &&
        deltaX * gesture.direction >= MIN_SWIPE_DISTANCE &&
        Math.abs(deltaX) >= Math.abs(deltaY) * HORIZONTAL_RATIO;
      resetGesture();

      if (opensMenu) menuButton.click();
    }, { passive: true });

    document.addEventListener('touchcancel', resetGesture, { passive: true });
  });
})();
