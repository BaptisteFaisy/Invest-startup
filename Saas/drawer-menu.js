// Menus hamburger partagés par les pages outils : tiroir gauche (navigation)
// et tiroir droit (compte & outils), repris du tableau de bord.
(function exposeLawyerDrawers() {
  window.applyLawyerDrawers = function applyLawyerDrawers() {
    const navDrawer = document.getElementById('nav-drawer');
    const actionsDrawer = document.getElementById('actions-drawer');
    if (!navDrawer || !actionsDrawer || navDrawer.dataset.accountMenu === 'lawyer') return;

    navDrawer.dataset.accountMenu = 'lawyer';
    navDrawer.setAttribute('data-hide-experience-mode', '');
    navDrawer.setAttribute('aria-label', 'Navigation avocat');
    navDrawer.querySelector('.drawer__head').innerHTML = '<span class="drawer__title">Navigation</span>';
    navDrawer.querySelector('.drawer__body').innerHTML = `
      <a class="drawer__link" href="tableau-de-bord-avocat.html"><svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9H3Z"/><path d="M9 20v-6h6v6"/></svg>Tableau de bord</a>
      <div class="drawer__sep"></div>
      <div class="drawer__section-title">Mes missions</div>
      <a class="drawer__link" href="propositions-avocat.html"><svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3Z"/><path d="M8 9h8M8 13h5"/></svg>Propositions de clients</a>
      <a class="drawer__link" href="clients-attribues-avocat.html"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2"/><path d="M3 20c0-4 2.5-7 6-7s6 3 6 7M15 14c3 0 5 2 5 5"/></svg>Clients attribués</a>
      <a class="drawer__link" href="missions-en-cours-avocat.html"><svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3Z"/><path d="M8 12h8M8 16h5"/></svg>Missions en cours</a>
      <a class="drawer__link" href="missions-passees-avocat.html"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>Missions passées</a>`;

    actionsDrawer.dataset.accountMenu = 'lawyer';
    actionsDrawer.setAttribute('aria-label', 'Menu avocat');
    actionsDrawer.querySelector('.drawer__head').innerHTML = '<span class="drawer__title">Menu</span>';
    actionsDrawer.querySelector('.drawer__body').innerHTML = `
      <a class="drawer__link is-current" href="editor.html"><svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Éditeur</a>
      <a class="drawer__link" href="feedback.html"><svg viewBox="0 0 24 24"><path d="M4 5h16v12H8l-4 3Z"/><path d="M8 9h8M8 13h5"/></svg>Feedback</a>
      <a class="drawer__link" href="compte.html"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/></svg>Mon compte</a>
      <div class="drawer__sep"></div>
      <button class="drawer__link" type="button" id="drawer-logout"><svg viewBox="0 0 24 24"><path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/></svg>Me déconnecter</button>`;

    actionsDrawer.querySelector('#drawer-logout')?.addEventListener('click', () => {
      if (typeof logout === 'function') logout(); else location.href = 'login.html';
    });
  };

  // Le menu détermine aussi lui-même le type de compte. Cette vérification
  // rend la navigation avocat indépendante de l'ordre de chargement propre à
  // chaque page outil (notamment l'éditeur, dont les scripts sont différés).
  const userRequest = typeof fetchMe === 'function'
    ? fetchMe()
    : fetch('/api/auth/me', { credentials: 'include' })
        .then(response => response.ok ? response.json() : null)
        .then(data => data?.user || null)
        .catch(() => null);
  Promise.resolve(userRequest).then(user => {
    if (user?.account_types?.includes('avocat')) window.applyLawyerDrawers();
  });
})();

(function () {
  let lockedScrollY = 0;

  // Un tiroir peut rester ouvert pendant que l'autre se ferme. Le verrou est
  // donc synchronise avec l'ensemble des tiroirs, et non avec un seul bouton.
  function syncPageScrollLock() {
    const root = document.documentElement;
    const shouldLock = !!document.querySelector('.drawer.is-open');
    const isLocked = root.classList.contains('drawer-open');

    if (shouldLock && !isLocked) {
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      root.classList.add('drawer-open');
      document.body.style.position = 'fixed';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    } else if (!shouldLock && isLocked) {
      root.classList.remove('drawer-open');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      const previousScrollBehavior = root.style.scrollBehavior;
      root.style.scrollBehavior = 'auto';
      window.scrollTo(0, lockedScrollY);
      root.style.scrollBehavior = previousScrollBehavior;
    }
  }

  function setupDrawer(btnId, drawerId, backdropId) {
    const btn = document.getElementById(btnId);
    const drawer = document.getElementById(drawerId);
    const backdrop = document.getElementById(backdropId);
    if (!btn || !drawer || !backdrop) return null;
    const close = () => {
      drawer.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      syncPageScrollLock();
    };
    const open = () => {
      drawer.classList.add('is-open');
      backdrop.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      syncPageScrollLock();
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

  (function setupExperienceMode() {
    const drawer = document.getElementById('nav-drawer');
    const body = drawer && drawer.querySelector('.drawer__body');
    if (!drawer || !body || drawer.hasAttribute('data-hide-experience-mode') || drawer.querySelector('.drawer__mode')) return;
    const control = document.createElement('div');
    control.className = 'drawer__mode';
    control.innerHTML = `<span class="drawer__mode-label" id="drawer-mode-label">Mode</span><div class="drawer__mode-options" role="group" aria-labelledby="drawer-mode-label"><button class="drawer__mode-option" type="button" data-mode="autonome" aria-pressed="false">Autonome</button><button class="drawer__mode-option" type="button" data-mode="guide" aria-pressed="false" disabled aria-disabled="true" title="Bientôt disponible">Guidé<span class="drawer__mode-soon">Bientôt</span></button></div>`;
    // Placé à la fin de la liste de navigation (juste sous la dernière étape,
    // « Gouvernance », avec un petit espace) : en bas du menu, mais sans être
    // collé au tout dernier pixel du tiroir.
    body.appendChild(control);
    let currentMode = 'autonome';
    try { currentMode = localStorage.getItem('liquid_experience_mode') || currentMode; } catch {}
    // Le mode « Guidé » n'est pas encore disponible : on force « Autonome »
    // (y compris si une ancienne valeur « guide » avait été mémorisée).
    if (currentMode !== 'autonome') currentMode = 'autonome';
    function applyMode(mode, notify) {
      mode = 'autonome';
      document.documentElement.dataset.experienceMode = mode;
      control.querySelectorAll('[data-mode]').forEach(button => {
        const active = button.dataset.mode === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      try { localStorage.setItem('liquid_experience_mode', mode); } catch {}
      if (notify) window.dispatchEvent(new CustomEvent('liquid:mode-change', { detail: { mode } }));
    }
    control.addEventListener('click', event => {
      const button = event.target.closest('[data-mode]');
      // Ignore les options désactivées (ex. « Guidé », pas encore disponible).
      if (button && !button.disabled) applyMode(button.dataset.mode, true);
    });
    applyMode('autonome', false);
  })();

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
        navDrawer && navDrawer.open();
      } else {
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

  // Pastille du hamburger droit : plusieurs sources peuvent l'allumer (feedback,
  // avocat). On les combine, sinon la dernière rafraîchie éteindrait l'autre.
  const notifySources = {};
  function setHamburgerNotify(source, on) {
    notifySources[source] = !!on;
    const btn = document.getElementById('actions-menu-btn');
    if (btn) btn.classList.toggle('hamburger--notify', Object.keys(notifySources).some(k => notifySources[k]));
  }

  // Interroge `url` toutes les 20 s (et au retour sur l'onglet) et allume la
  // pastille `dotId` + celle du hamburger. `read` extrait le booléen. La
  // pastille est relue à chaque tour : applyLawyerDrawers remplace le tiroir
  // fondateur après coup, et écrire dans le nœud détaché ne servirait à rien.
  function pollUnread(source, url, dotId, read) {
    async function refresh() {
      const dot = document.getElementById(dotId);
      if (!dot) { setHamburgerNotify(source, false); return; }
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const unread = !!read(await res.json());
        dot.hidden = !unread;
        setHamburgerNotify(source, unread);
      } catch {}
    }
    refresh();
    setInterval(refresh, 20000);
    // Retour sur l'onglet (après avoir lu ailleurs) : on revérifie.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
  }

  // Notification « feedback » : tant qu'une réponse du fondateur n'a pas été
  // lue, une pastille verte s'affiche sur le hamburger droit (visible menu
  // fermé) et sur le lien Feedback (visible menu ouvert). L'état vient de
  // /api/saas/feedback/unread ; il se vide côté serveur dès que la page
  // Feedback est ouverte, donc la pastille disparaît au prochain rafraîchissement.
  (function setupFeedbackNotification() {
    if (!document.getElementById('feedback-unread-dot')) return; // pages sans lien Feedback
    pollUnread('feedback', '/api/saas/feedback/unread', 'feedback-unread-dot', d => d && d.unread);
  })();
})();

// Recherche partagée : elle est ajoutée aux barres supérieures des pages outils.
// Le tableau de bord conserve sa recherche dédiée, qui connaît également les
// éléments de chaque étape et les modèles de documents.
(function setupGlobalSearch() {
  // L'éditeur n'affiche pas la recherche partagée : sa barre supérieure est
  // réservée aux actions du document (Analyser, Signer, Exporter…).
  if (/(?:^|\/)editor\.html$/i.test(location.pathname)) return;
  const actions = document.querySelector('.topbar__actions');
  if (!actions || document.getElementById('dashboard-search') || actions.querySelector('.global-search')) return;

  const search = document.createElement('form');
  search.className = 'global-search';
  search.setAttribute('role', 'search');
  search.innerHTML = `
    <label class="global-search__field" for="global-search-input">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path></svg>
      <input class="global-search__input" id="global-search-input" type="search" placeholder="Rechercher" autocomplete="off" aria-controls="global-search-results" />
      <kbd class="global-search__shortcut" aria-hidden="true">⌘K</kbd>
    </label>
    <div class="global-search__results" id="global-search-results" aria-live="polite" hidden></div>`;

  const menuButton = actions.querySelector('#actions-menu-btn');
  actions.insertBefore(search, menuButton || null);

  const input = search.querySelector('.global-search__input');
  const resultsEl = search.querySelector('.global-search__results');
  const tools = [
    { type: 'Page', label: 'Tableau de bord', href: 'tableau-de-bord.html', keywords: ['accueil', 'dossiers', 'levee', 'levée', 'roadmap'] },
    { type: 'Outil', label: 'Éditeur', href: 'editor.html', keywords: ['rediger', 'rédiger', 'clauses', 'term sheet', 'document'] },
    { type: 'Outil', label: 'Documents', href: 'documents.html', keywords: ['fichiers', 'pieces', 'pièces'] },
    { type: 'Outil', label: 'Data room', href: 'data-room.html', keywords: ['dataroom', 'audit', 'due diligence'] },
    { type: 'Page', label: 'Mon compte', href: 'compte.html', keywords: ['profil', 'abonnement', 'securite', 'sécurité'] },
    { type: 'Page', label: 'Feedback', href: 'feedback.html', keywords: ['support', 'aide', 'message', 'bug'] },
  ];
  let documents = [];
  let folders = [];
  let dataLoaded = false;
  let dataLoading = false;
  let currentMatches = [];

  const normalize = value => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
  const esc = value => String(value == null ? '' : value).replace(/[&<>\"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  function close({ clear = false } = {}) {
    if (clear) input.value = '';
    currentMatches = [];
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
  }

  // Le projet ouvert (« Mes projets ») : quand cette page connaît un project_id
  // (elle est déjà sur le tableau de bord, ou une page outil l'a repris), la
  // recherche reste dans ce projet plutôt que de retomber sur le projet par défaut.
  let currentProjectId = '';
  try { currentProjectId = new URLSearchParams(location.search).get('project_id') || ''; } catch {}

  function dashboardTarget(folderId, documentId) {
    const params = new URLSearchParams();
    if (currentProjectId) params.set('project_id', currentProjectId);
    if (folderId != null) params.set('targetFolder', String(folderId));
    if (documentId != null) params.set('targetDocument', String(documentId));
    return 'tableau-de-bord.html?' + params.toString();
  }

  function entries() {
    const folderById = new Map(folders.map(folder => [String(folder.id), folder]));
    const documentEntries = documents.map(document => {
      const folder = folderById.get(String(document.folder_id));
      const name = document.name || 'Document sans titre';
      return {
        type: 'Document', label: name,
        detail: folder && folder.name ? folder.name : 'Mes documents',
        href: document.kind === 'termsheet'
          ? 'editor.html?doc=' + encodeURIComponent(document.id)
          : dashboardTarget(document.folder_id, document.id),
        keywords: [name, document.kind, folder && folder.name],
      };
    });
    const folderEntries = folders.map(folder => ({
      type: 'Dossier', label: folder.name || 'Dossier sans titre', detail: 'Tableau de bord',
      href: dashboardTarget(folder.id),
      keywords: [folder.name, folder.key, folder.track, ...(folder.checklist || [])],
    }));
    return [...tools, ...documentEntries, ...folderEntries];
  }

  function find(query) {
    const needle = normalize(query).trim();
    if (!needle) return [];
    return entries()
      .map(entry => {
        const label = normalize(entry.label);
        const values = [entry.label, entry.detail, ...(entry.keywords || [])].map(normalize);
        const position = label.indexOf(needle);
        const matches = values.some(value => value.includes(needle));
        return { entry, matches, score: position === 0 ? 0 : position >= 0 ? 1 : 2 };
      })
      .filter(result => result.matches)
      .sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label, 'fr'))
      .slice(0, 10)
      .map(result => result.entry);
  }

  function render() {
    const query = input.value.trim();
    if (!query) { close(); return; }
    currentMatches = find(query);
    resultsEl.hidden = false;
    if (!currentMatches.length) {
      resultsEl.innerHTML = `<p class="global-search__empty">Aucun résultat pour « ${esc(query)} ».</p>`;
      return;
    }
    resultsEl.innerHTML = `
      <p class="global-search__summary">${currentMatches.length} résultat${currentMatches.length > 1 ? 's' : ''}</p>
      ${currentMatches.map((match, index) => `
        <button class="global-search__result" type="button" data-global-search-result="${index}">
          <span class="global-search__kind">${esc(match.type)}</span>
          <span class="global-search__copy"><span class="global-search__name">${esc(match.label)}</span>${match.detail ? `<span class="global-search__detail">${esc(match.detail)}</span>` : ''}</span>
        </button>`).join('')}`;
  }

  function go(match) {
    if (!match || !match.href) return;
    close({ clear: true });
    window.location.href = match.href;
  }

  async function loadData() {
    if (dataLoaded || dataLoading) return;
    dataLoading = true;
    try {
      const foldersUrl = '/api/saas/folders' + (currentProjectId ? '?project_id=' + encodeURIComponent(currentProjectId) : '');
      const [foldersResponse, documentsResponse] = await Promise.all([
        fetch(foldersUrl, { credentials: 'include' }),
        fetch('/api/saas/documents', { credentials: 'include' }),
      ]);
      if (foldersResponse.ok) folders = (await foldersResponse.json()).folders || [];
      if (documentsResponse.ok) documents = (await documentsResponse.json()).documents || [];
      dataLoaded = true;
      if (input.value.trim()) render();
    } catch {
      // La recherche de navigation reste disponible même si les documents ne sont pas joignables.
    } finally {
      dataLoading = false;
    }
  }

  search.addEventListener('submit', event => {
    event.preventDefault();
    go(currentMatches[0]);
  });
  input.addEventListener('focus', loadData);
  input.addEventListener('input', () => {
    render();
    loadData();
  });
  resultsEl.addEventListener('click', event => {
    const button = event.target.closest('[data-global-search-result]');
    if (button) go(currentMatches[Number(button.dataset.globalSearchResult)]);
  });
  document.addEventListener('pointerdown', event => {
    if (!search.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      input.focus();
    }
    if (event.key === 'Escape' && document.activeElement === input) {
      close({ clear: true });
      input.blur();
    }
  });
})();
