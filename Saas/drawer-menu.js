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
})();

// Recherche partagée : elle est ajoutée aux barres supérieures des pages outils.
// Le tableau de bord conserve sa recherche dédiée, qui connaît également les
// éléments de chaque étape et les modèles de documents.
(function setupGlobalSearch() {
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
    { type: 'Outil', label: 'Comparer', href: 'compare.html', keywords: ['comparaison', 'versions', 'contrat'] },
    { type: 'Outil', label: 'Tâches', href: 'taches.html', keywords: ['tache', 'todo', 'checklist', 'organisation'] },
    { type: 'Outil', label: 'Valorisation', href: 'valorisation.html', keywords: ['estimation', 'berkus', 'scorecard', 'pre money', 'prix'] },
    { type: 'Outil', label: 'Dilution', href: 'dilution.html', keywords: ['cap table', 'simulation', 'actions'] },
    { type: 'Outil', label: 'Exit', href: 'exit.html', keywords: ['sortie', 'cession', 'liquidation', 'waterfall'] },
    { type: 'Outil', label: 'Documents', href: 'documents.html', keywords: ['fichiers', 'pieces', 'pièces'] },
    { type: 'Outil', label: 'Data room', href: 'data-room.html', keywords: ['dataroom', 'audit', 'due diligence'] },
    { type: 'Outil', label: 'Avocat', href: 'avocat.html', keywords: ['juridique', 'legal', 'juriste', 'conseil', 'contrat'] },
    { type: 'Page', label: 'Mon compte', href: 'compte.html', keywords: ['profil', 'abonnement', 'securite', 'sécurité'] },
    { type: 'Page', label: 'Feedback', href: 'feedback.html', keywords: ['support', 'aide', 'message', 'bug'] },
    { type: 'Outil', label: 'Benchmark', href: 'benchmark.html', keywords: ['benchmark', 'marche', 'marché', 'repères', 'reperes', 'valorisation', 'dilution', 'termes', 'clauses', 'bsa-air', 'safe', 'levée', 'levee'] },
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

  function dashboardTarget(folderId, documentId) {
    const params = new URLSearchParams();
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
      const [foldersResponse, documentsResponse] = await Promise.all([
        fetch('/api/saas/folders', { credentials: 'include' }),
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
