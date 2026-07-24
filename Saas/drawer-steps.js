// Menu gauche des pages outils : les étapes de la levée (parcours « Levée
// classique » ou « BSA-AIR »), avec leur avancement, reprises du tableau de bord.
// Chaque étape ouvre l'étape correspondante sur le tableau de bord.
//
// Source de vérité : le tableau de bord calcule les étapes et sérialise un
// instantané dans localStorage['liquid_nav_steps'] (raiseType + steps). Ce
// module l'affiche tel quel, se met à jour en direct quand le tableau de bord
// le réécrit (événement « storage »), et — si aucun instantané n'existe encore
// (page outil ouverte sans passer par le tableau de bord) — recalcule à partir
// des dossiers/documents de l'API.
(function () {
  const host = document.getElementById('nav-steps');
  if (!host) return;

  const SNAPSHOT_KEY = 'liquid_nav_steps';
  const friseCheckPath = '<path d="M5 12l5 5l10 -10"/>';

  // Le chevron des pages outils ne suit pas l'historique du navigateur : une
  // page intermédiaire (connexion, autre outil, lien externe...) pourrait alors
  // éloigner l'utilisateur de son parcours. Le tableau de bord sérialise déjà
  // l'étape consultée dans l'instantané partagé ; on revient directement dessus.
  function lastConsultedStepUrl() {
    const snapshot = readSnapshot();
    const type = snapshot && snapshot.raiseType === 'bsa-air' ? 'bsa-air' : (snapshot && snapshot.raiseType === 'ordinary' ? 'ordinary' : 'classic');
    const steps = snapshot && Array.isArray(snapshot.steps) ? snapshot.steps : [];
    const step = steps.find(item => item && item.active)
      || steps.find(item => item && item.current)
      || steps[0];
    const params = new URLSearchParams({ raise: type });
    if (step && step.key) params.set('step', step.key);
    return 'tableau-de-bord.html?' + params.toString();
  }

  function isToolBackButton(target) {
    return !!(target && target.closest && target.closest(
      '#page-back-btn, #account-back-btn, #fb-back-btn'
    ));
  }

  // Capture l'événement avant les anciens gestionnaires propres à chaque page.
  // stopImmediatePropagation évite notamment qu'un history.back() soit aussi
  // exécuté après la redirection explicite.
  document.addEventListener('click', event => {
    if (!isToolBackButton(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.href = lastConsultedStepUrl();
  }, true);

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Rend la liste d'étapes {raiseType, steps:[{key,label,num,done,current,soon,pct}]}.
  function renderSteps(data) {
    const steps = data && Array.isArray(data.steps) ? data.steps : [];
    const type = (data && data.raiseType) || 'classic';
    const displayedStep = new URLSearchParams(location.search).get('step');
    if (!steps.length) {
      host.innerHTML = '<p class="drawer__steps-empty">Ouvrez votre '
        + '<a href="tableau-de-bord.html">tableau de bord</a> pour afficher '
        + 'les étapes de votre levée.</p>';
      return;
    }
    host.innerHTML = steps.map(s => {
      const cls = 'drawer__link drawer__link--step'
        + (s.done ? ' is-done' : '') + (s.current ? ' is-current' : '')
        + (s.active || s.key === displayedStep ? ' is-active' : '');
      const badge = s.done
        ? '<svg viewBox="0 0 24 24" aria-hidden="true">' + friseCheckPath + '</svg>'
        : String(s.num);
      const soon = s.soon && s.key !== 'confidentialite'
        ? '<span class="drawer__soon-tag">Bientôt</span>'
        : '';
      const pct = (s.pct == null) ? null : Math.max(0, Math.min(100, Math.round(s.pct)));
      const bar = (pct == null) ? '' :
        '<span class="drawer__step-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'
        + pct + '"><span style="width:' + pct + '%"></span></span>';
      const href = 'tableau-de-bord.html?raise=' + encodeURIComponent(type)
        + '&step=' + encodeURIComponent(s.key);
      return '<a class="' + cls + '" href="' + href + '">'
        + '<span class="drawer__step-row"><span class="drawer__step-num">' + badge + '</span>'
        + esc(s.label) + soon + '</span>' + bar + '</a>';
    }).join('');
  }

  function readSnapshot() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null'); }
    catch { return null; }
  }

  // ---- Repli : recalcul autonome quand aucun instantané n'est disponible ----
  // (miroir de la logique du tableau de bord ; server.js définit les phases).
  const CLASSIC_UNAVAILABLE = new Set(['confidentialite', 'gouvernance']);
  const CLASSIC_SOON_BADGES = new Set(['confidentialite', 'gouvernance', 'post-closing']);
  const FRISE_LABELS = {
    'mise-en-ordre': 'La levée',
    'confidentialite': 'Investisseurs',
    'due-diligence-preliminaire': 'Due diligence préliminaire',
    'term-sheet': "Lettre d'intention",
    'due-diligence': 'Due diligence poussée',
    'documentation': 'Négociation',
    'closing': 'Closing',
    'post-closing': 'Post-closing',
    'gouvernance': 'Gouvernance',
    'air-preparation': 'Ma levée', 'air-approche': 'Investisseurs',
    'air-termes': 'Rédaction des BSA-AIR', 'air-emission': "Autorisation de l'émission",
    'air-souscription': 'Émission des BSA-AIR', 'air-postemission': 'Post-émission',
    'air-suivi': 'Suivi des bons', 'air-conversion': 'Conversion',
  };
  function slugify(s) {
    return String(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function friseLabel(f) {
    if (FRISE_LABELS[f.key]) return FRISE_LABELS[f.key];
    return String(f.name || '').replace(/^\s*\d+\s*[·.\-—]\s*/, '').split(/\s*[(—]/)[0].trim();
  }
  function friseStepNumber(f, fallback) {
    const match = String(f && f.name || '').match(/^\s*(\d+)/);
    return match ? Number(match[1]) : fallback;
  }
  // Étapes de négociation : documents propres à chaque investisseur du pipeline
  // (statut ≥ seuil), rangés sous une clé composite inv<id>::<slug>. Miroir du
  // tableau de bord (voir tableau-de-bord.html).
  const INVESTOR_STAGE_ORDER = [
    'a_contacter', 'contacte', 'interesse', 'due_diligence_preliminaire',
    'lettre_intention_negociation', 'lettre_intention_signee', 'due_diligence_poussee',
    'contrats_negociation', 'contrats_signes', 'gouvernance',
  ];
  const NEGOTIATION_PHASE_MIN_STAGE = {
    'term-sheet': 'lettre_intention_negociation',
    'documentation': 'contrats_negociation',
  };
  function stageIndex(stage) {
    const i = INVESTOR_STAGE_ORDER.indexOf(stage);
    return i === -1 ? 0 : i;
  }
  function investorsForPhase(f, investors) {
    const min = NEGOTIATION_PHASE_MIN_STAGE[f && f.key];
    if (!min) return [];
    const minIdx = stageIndex(min);
    return (investors || []).filter(inv => stageIndex(inv.stage) >= minIdx);
  }
  function phaseStatus(f, docs, investors) {
    const state = f.items_state || {};
    const items = Array.isArray(f.checklist) ? f.checklist : [];
    const marks = f.marks || [];
    let total = 0, done = 0, linked = 0;
    // Pour une étape de négociation, chaque investisseur concerné a sa propre copie
    // de la checklist. Sinon, une seule liste commune (clés simples).
    const groups = NEGOTIATION_PHASE_MIN_STAGE[f.key]
      ? investorsForPhase(f, investors).map(inv => 'inv' + inv.id + '::')
      : [''];
    groups.forEach(prefix => {
      items.forEach((item, idx) => {
        const st = state[prefix + slugify(item)] || {};
        const isLinked = st.document_id != null && docs.some(d => d.id === st.document_id);
        const final = isLinked && !!st.final;
        const skippable = marks[idx] === 'opt' && !isLinked;
        if (!skippable) total++;
        if (final) done++;
        if (isLinked) linked++;
      });
    });
    return { total, done, linked, complete: total > 0 && done === total };
  }
  // Doit rester alignée avec HIDDEN_CLASSIC_PHASE_KEYS / isClassicPhaseVisible
  // dans tableau-de-bord.html (menu de gauche de la levée de fonds classique).
  const HIDDEN_CLASSIC_PHASE_KEYS = ['confidentialite', 'due-diligence-preliminaire', 'due-diligence', 'documentation', 'post-closing', 'gouvernance'];
  function buildSteps(type, folders, docs, investors) {
    const isSys = f => !!(f && f.system === true && f.key);
    const trackType = (type === 'ordinary') ? 'classic' : type;
    let phases = folders.filter(f => isSys(f) && (f.track || 'classic') === trackType);
    if (type === 'classic' || type === 'ordinary') {
      phases = phases.filter(f => !String(f && f.name || '').trim().startsWith('9') && !HIDDEN_CLASSIC_PHASE_KEYS.includes(f.key));
    }
    if (!phases.length) return { raiseType: type, steps: [] };
    const stats = phases.map(f => phaseStatus(f, docs, investors));
    const currentIdx = stats.findIndex(s => !s.complete);
    const globalFrac = stats.length ? stats.filter(s => s.complete).length / stats.length : 0;
    const steps = [];
    // BSA-AIR : « 0 · Ma levée » (air-preparation) est une vraie étape, rendue par la
    // boucle comme les autres ; son numéro (0) vient du nom de la phase.
    phases.forEach((f, i) => {
      const s = stats[i];
      const done = s.complete;
      // « Ma levée » (classique : mise-en-ordre ; BSA-AIR : air-preparation) reste
      // visuellement neutre : pas de fond indigo « étape courante ».
      const isCurrent = i === currentIdx
        && f.key !== 'mise-en-ordre' && f.key !== 'air-preparation';
      const num = friseStepNumber(f, i);
      const soon = type === 'classic' && CLASSIC_SOON_BADGES.has(f.key);
      const unavailable = type === 'classic' && CLASSIC_UNAVAILABLE.has(f.key);
      const stepFrac = s.total > 0 ? s.done / s.total : (done ? 1 : 0);
      const barFrac = (f.key === 'mise-en-ordre' || f.key === 'air-preparation') ? globalFrac : stepFrac;
      const pct = Math.max(0, Math.min(100, Math.round(barFrac * 100)));
      steps.push({ key: f.key, label: friseLabel(f), num, done, current: isCurrent, soon, pct: unavailable ? null : pct });
    });
    return { raiseType: type, steps };
  }
  async function computeFallback() {
    let user = null;
    try { if (typeof fetchMe === 'function') user = await fetchMe(); } catch {}
    const raiseUser = (user && (user.id || user.email)) || 'me';
    // Repris de tableau-de-bord.html : quand cette page outil connaît elle-même
    // le projet ouvert (project_id dans son URL), on lit la même clé que le
    // tableau de bord et on scope l'appel /folders sur ce projet.
    let projectId = '';
    try { projectId = new URLSearchParams(location.search).get('project_id') || ''; } catch {}
    let type = 'classic';
    try {
      const t = localStorage.getItem('liquid_raise_type_' + raiseUser + (projectId ? '_' + projectId : ''));
      if (t === 'classic' || t === 'ordinary' || t === 'bsa-air') type = t;
    } catch {}
    let folders = [], docs = [], investors = [];
    try {
      const foldersUrl = '/api/saas/folders' + (projectId ? '?project_id=' + encodeURIComponent(projectId) : '');
      const [fr, dr, ir] = await Promise.all([
        fetch(foldersUrl, { credentials: 'include' }),
        fetch('/api/saas/documents', { credentials: 'include' }),
        fetch('/api/saas/investors', { credentials: 'include' }).catch(() => null),
      ]);
      if (fr.ok) folders = (await fr.json()).folders || [];
      if (dr.ok) docs = (await dr.json()).documents || [];
      if (ir && ir.ok) investors = (await ir.json().catch(() => ({}))).investors || [];
    } catch {}
    renderSteps(buildSteps(type, folders, docs, investors));
  }

  // ---- Amorçage ----
  const snap = readSnapshot();
  if (snap && Array.isArray(snap.steps) && snap.steps.length) renderSteps(snap);
  else computeFallback();

  // Mise à jour en direct quand le tableau de bord (autre onglet) réécrit l'instantané.
  window.addEventListener('storage', (e) => {
    if (e.key === SNAPSHOT_KEY) renderSteps(readSnapshot());
  });
})();
