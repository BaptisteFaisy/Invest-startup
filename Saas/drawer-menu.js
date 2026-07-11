// Menus hamburger partagés par les pages outils : tiroir gauche (navigation)
// et tiroir droit (compte & outils), repris du tableau de bord.
(function () {
  function setupDrawer(btnId, drawerId, backdropId) {
    const btn = document.getElementById(btnId);
    const drawer = document.getElementById(drawerId);
    const backdrop = document.getElementById(backdropId);
    if (!btn || !drawer || !backdrop) return null;
    const close = () => {
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    };
    const open = () => {
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    };
    btn.addEventListener('click', () =>
      drawer.classList.contains('is-open') ? close() : open());
    backdrop.addEventListener('click', close);
    drawer.querySelectorAll('[data-drawer-close]').forEach(el =>
      el.addEventListener('click', close));
    return { open, close };
  }
  const navDrawer = setupDrawer('nav-menu-btn', 'nav-drawer', 'nav-backdrop');
  const actionsDrawer = setupDrawer('actions-menu-btn', 'actions-drawer', 'actions-backdrop');

  // Marque le lien correspondant à la page en cours dans les deux tiroirs.
  (function highlightCurrentLink() {
    const here = location.pathname.split('/').pop() || 'tableau-de-bord.html';
    document.querySelectorAll('.drawer__link[href]').forEach(a => {
      if (a.getAttribute('href') === here) a.classList.add('is-current');
    });
  })();

  // Sur telephone, les deux tiroirs sont aussi accessibles par glissement :
  // bord gauche vers le centre pour la navigation, bord droit vers le centre
  // pour les actions. Le defilement vertical reste prioritaire.
  (function setupEdgeSwipeDrawers() {
    const EDGE_ZONE = 28;
    const MIN_SWIPE_DISTANCE = 64;
    const HORIZONTAL_RATIO = 1.5;
    let gesture = null;

    const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
    const resetGesture = () => { gesture = null; };

    document.addEventListener('touchstart', (event) => {
      if (!isPhone()) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      if (touch.clientX <= EDGE_ZONE) {
        gesture = { side: 'left', startX: touch.clientX, startY: touch.clientY, isHorizontal: false };
      } else if (touch.clientX >= window.innerWidth - EDGE_ZONE) {
        gesture = { side: 'right', startX: touch.clientX, startY: touch.clientY, isHorizontal: false };
      }
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
      if (!gesture) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const direction = gesture.side === 'left' ? 1 : -1;
      const movesTowardScreen = deltaX * direction > 0;

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
      const direction = gesture.side === 'left' ? 1 : -1;
      const opensDrawer = gesture.isHorizontal &&
        deltaX * direction >= MIN_SWIPE_DISTANCE &&
        Math.abs(deltaX) >= Math.abs(deltaY) * HORIZONTAL_RATIO;
      const side = gesture.side;
      resetGesture();

      if (!opensDrawer) return;
      if (side === 'left') {
        actionsDrawer && actionsDrawer.close();
        navDrawer && navDrawer.open();
      } else {
        navDrawer && navDrawer.close();
        actionsDrawer && actionsDrawer.open();
      }
    }, { passive: true });

    document.addEventListener('touchcancel', resetGesture, { passive: true });
  })();

  // Largeur des menus (tiroirs) librement ajustable, mémorisée par tiroir
  // (mêmes clés que le tableau de bord, pour une largeur cohérente partout).
  (function setupDrawerResize() {
    const DEFAULT_W = 280;
    const MIN_W = 220;

    function bind(drawerId, storeKey, side) {
      const drawer = document.getElementById(drawerId);
      const handle = drawer && drawer.querySelector('.drawer__resize');
      if (!drawer || !handle) return;

      let width = DEFAULT_W;
      try {
        const stored = parseInt(localStorage.getItem(storeKey), 10);
        if (stored) width = stored;
      } catch {}

      function maxW() { return Math.max(MIN_W, Math.min(720, window.innerWidth - 64)); }
      function apply(w) {
        width = Math.max(MIN_W, Math.min(maxW(), Math.round(w)));
        drawer.style.setProperty('--drawer-w', width + 'px');
        handle.setAttribute('aria-valuemin', String(MIN_W));
        handle.setAttribute('aria-valuemax', String(Math.round(maxW())));
        handle.setAttribute('aria-valuenow', String(width));
      }
      function persist() { try { localStorage.setItem(storeKey, String(width)); } catch {} }
      apply(width);

      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        handle.classList.add('is-drag');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        try { handle.setPointerCapture(e.pointerId); } catch {}
        const startX = e.clientX;
        const startW = width;
        let rafId = 0, lastW = startW;
        const move = (ev) => {
          if (ev.buttons === 0) { up(); return; }
          const dx = ev.clientX - startX;
          lastW = side === 'left' ? startW + dx : startW - dx;
          if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; apply(lastW); });
        };
        const up = () => {
          if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
          handle.classList.remove('is-drag');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          handle.removeEventListener('pointermove', move);
          handle.removeEventListener('pointerup', up);
          handle.removeEventListener('pointercancel', up);
          try { handle.releasePointerCapture(e.pointerId); } catch {}
          apply(lastW);
          persist();
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
      });

      handle.addEventListener('dblclick', () => {
        try { localStorage.removeItem(storeKey); } catch {}
        apply(DEFAULT_W);
      });

      handle.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = e.shiftKey ? 50 : 10;
        const dir = (e.key === 'ArrowRight' ? 1 : -1) * (side === 'left' ? 1 : -1);
        apply(width + dir * step);
        persist();
      });

      window.addEventListener('resize', () => apply(width));
    }

    bind('nav-drawer', 'liquid_nav_drawer_w', 'left');
    bind('actions-drawer', 'liquid_actions_drawer_w', 'right');
  })();

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { navDrawer && navDrawer.close(); actionsDrawer && actionsDrawer.close(); }
  });

  const drawerLogout = document.getElementById('drawer-logout');
  if (drawerLogout) drawerLogout.addEventListener('click', () => {
    if (typeof logout === 'function') logout(); else location.href = 'login.html';
  });
})();
