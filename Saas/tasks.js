/* ═══════════════════════════════════════════════════════════════════════════
   Suivi des analyses IA — widget flottant partagé (toutes les pages du SaaS)
   ───────────────────────────────────────────────────────────────────────────
   Affiche, en haut à gauche, une fenêtre qui suit l'avancement des analyses IA
   lancées en tâche de fond côté serveur. On peut donc se balader dans le SaaS
   pendant qu'une analyse tourne : la fenêtre la suit d'une page à l'autre.
   Chaque carte : libellé, barre de progression, étapes, bouton « Annuler » et
   bouton « Aller à l'endroit » (là où l'analyse a été lancée).

   API publique (window.LiquidTasks) :
     launch({ type, payload, label, location }) -> Promise<{ id }>
     list()               -> Promise<[job]>          (toutes les tâches de l'utilisateur)
     fetchResult(id)      -> Promise<job+result>      (détail avec résultat)
     cancel(id) / dismiss(id)
     on('finished'|'updated'|'goto', cb)              (événements)

   Événements (document) :
     liquid-task-finished  detail = job (transition vers done/error/cancelled vue par CE widget)
     liquid-task-updated   detail = [job]  (à chaque rafraîchissement)
     liquid-task-goto      detail = job    (clic « Aller à l'endroit » quand on y est déjà)
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.LiquidTasks) return;

  var ACTIVE_MS = 1600, IDLE_MS = 7000;
  var STEP_LABELS = {
    par: 'Paragraphes', lib: 'Clauses proposées', verif: 'À vérifier',
    analyse: 'Analyse', compare: 'Comparaison',
  };
  var els = {};                 // références DOM du widget
  var built = false;            // widget monté ?
  var lastSeen = {};            // id -> status (détection des transitions)
  var pollTimer = null;
  var authOff = false;          // 401 : on cesse toute activité
  var collapsed = false;

  /* ---------- Mode « Max » (réflexion approfondie vs rapidité) ----------
     Préférence globale, mémorisée, partagée entre toutes les pages. Le raisonnement
     approfondi est plus lent : par défaut OFF (rapide). Chaque bouton `[data-aimax-toggle]`
     de la page reflète et bascule cette préférence ; `launch()` l'envoie au serveur. */
  var MAX_KEY = 'liquid_ai_max';
  function maxMode() { try { return localStorage.getItem(MAX_KEY) === '1'; } catch (e) { return false; } }
  function setMaxMode(on) { try { localStorage.setItem(MAX_KEY, on ? '1' : '0'); } catch (e) {} syncMaxToggles(); }
  function syncMaxToggles() {
    var on = maxMode();
    var list = document.querySelectorAll('[data-aimax-toggle]');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on
        ? 'Analyse approfondie activée (plus lente mais plus fouillée). Cliquez pour revenir au mode rapide.'
        : 'Mode rapide activé. Cliquez pour une analyse approfondie « Max » (plus lente mais plus fouillée).';
    }
  }
  function wireMaxToggles() {
    var list = document.querySelectorAll('[data-aimax-toggle]');
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b._aimaxWired) continue;
      b._aimaxWired = true;
      b.addEventListener('click', function (e) { e.preventDefault(); setMaxMode(!maxMode()); });
    }
    syncMaxToggles();
  }

  /* ---------- réseau ---------- */
  function api(path, opts) {
    return fetch(path, Object.assign({ credentials: 'include' }, opts || {}))
      .then(function (r) {
        if (r.status === 401) { authOff = true; hide(); throw new Error('unauth'); }
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; })
                       .catch(function () { return { ok: r.ok, status: r.status, data: {} }; });
      });
  }

  function launch(opts) {
    opts = opts || {};
    // Mode « Max » (analyse approfondie) : par défaut, on suit la préférence globale
    // du bouton Max ; un appelant peut forcer via opts.max.
    var wantMax = (opts.max != null) ? !!opts.max : maxMode();
    return api('/api/saas/jobs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: opts.type, payload: opts.payload || {}, label: opts.label || '', location: opts.location || null, max: wantMax }),
    }).then(function (r) {
      if (!r.ok) throw new Error((r.data && r.data.error) || 'Impossible de lancer l\'analyse.');
      collapsed = false;
      if (r.data.job) mergeJobs([r.data.job]);
      schedule(50);
      return { id: r.data.id, job: r.data.job };
    });
  }
  function list()          { return api('/api/saas/jobs').then(function (r) { return (r.data && r.data.jobs) || []; }); }
  function fetchResult(id) { return api('/api/saas/jobs/' + id).then(function (r) { return r.ok ? r.data : null; }); }
  function cancel(id)      { return api('/api/saas/jobs/' + id + '/cancel',  { method: 'POST' }).then(function () { schedule(50); }); }
  function dismiss(id)     { delete lastSeen[id]; return api('/api/saas/jobs/' + id + '/dismiss', { method: 'POST' }).then(function () { schedule(50); }); }

  /* ---------- état + transitions ---------- */
  var current = [];             // dernière liste connue
  function mergeJobs(jobs) {
    // Conserve l'ordre serveur ; remplace/insère par id.
    var byId = {};
    current.forEach(function (j) { byId[j.id] = j; });
    jobs.forEach(function (j) { byId[j.id] = j; });
    // Recompose dans l'ordre reçu (les nouvelles listes serveur font foi).
    var ids = jobs.map(function (j) { return j.id; });
    current.forEach(function (j) { if (ids.indexOf(j.id) < 0) ids.push(j.id); });
    current = ids.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  function poll() {
    if (authOff) return;
    list().then(function (jobs) {
      current = jobs;
      // Détection des transitions vers un état terminal.
      jobs.forEach(function (j) {
        var prev = lastSeen[j.id];
        var terminal = (j.status === 'done' || j.status === 'error' || j.status === 'cancelled');
        if (terminal && prev && prev !== j.status) emit('finished', j);
        else if (terminal && prev === undefined) { /* déjà terminée avant ce chargement : pas d'événement, la page d'origine réconcilie au chargement */ }
        lastSeen[j.id] = j.status;
      });
      // Purge des ids disparus.
      Object.keys(lastSeen).forEach(function (id) {
        if (!jobs.some(function (j) { return j.id === id; })) delete lastSeen[id];
      });
      emit('updated', jobs);
      render();
      var anyRunning = jobs.some(function (j) { return j.status === 'running'; });
      schedule(anyRunning ? ACTIVE_MS : IDLE_MS);
    }).catch(function () { schedule(IDLE_MS); });
  }
  function schedule(ms) { if (authOff) return; clearTimeout(pollTimer); pollTimer = setTimeout(poll, ms); }

  /* ---------- événements ---------- */
  function emit(name, detail) {
    document.dispatchEvent(new CustomEvent('liquid-task-' + name, { detail: detail }));
  }
  function on(name, cb) { document.addEventListener('liquid-task-' + name, function (e) { cb(e.detail, e); }); }

  /* ---------- rendu ---------- */
  function samePage(url) {
    try { var u = new URL(url, location.href); return u.pathname === location.pathname && u.search === location.search; }
    catch (e) { return false; }
  }
  function statusText(j) {
    if (j.status === 'done')      return 'Terminée';
    if (j.status === 'error')     return j.error || 'Échec';
    if (j.status === 'cancelled') return 'Annulée';
    return 'En cours…';
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function render() {
    if (authOff) return;
    if (!current.length) { hide(); return; }
    build();
    els.root.hidden = false;
    els.root.classList.toggle('lqt--collapsed', collapsed);

    var running = current.filter(function (j) { return j.status === 'running'; }).length;
    els.count.textContent = String(current.length);
    els.pillCount.textContent = String(current.length);
    els.root.classList.toggle('lqt--busy', running > 0);

    if (collapsed) return;

    els.list.innerHTML = current.map(function (j) {
      var pct = j.indeterminate && j.status === 'running' ? 100 : (j.progress || 0);
      var barCls = 'lqt-bar' + (j.indeterminate && j.status === 'running' ? ' lqt-bar--indet' : '')
        + (j.status === 'error' ? ' lqt-bar--err' : '') + (j.status === 'done' ? ' lqt-bar--done' : '');
      var steps = (j.steps || []).filter(function (s) { return s && s.state; }).map(function (s) {
        return '<li class="lqt-step lqt-step--' + esc(s.state) + '"><span class="lqt-dot"></span>'
          + '<span class="lqt-step__l">' + esc(STEP_LABELS[s.key] || s.label || s.key) + '</span>'
          + '<span class="lqt-step__d">' + esc(s.detail || '') + '</span></li>';
      }).join('');
      var canGoto = j.location && j.location.url;
      var actions = '';
      if (j.status === 'running') {
        actions += '<button class="lqt-b lqt-b--cancel" data-act="cancel" data-id="' + esc(j.id) + '">Annuler</button>';
      } else {
        actions += '<button class="lqt-b" data-act="dismiss" data-id="' + esc(j.id) + '">Fermer</button>';
      }
      if (canGoto) {
        var here = samePage(j.location.url);
        actions += '<button class="lqt-b lqt-b--go" data-act="goto" data-id="' + esc(j.id) + '">'
          + (here ? 'Voir le résultat' : 'Aller à l\'endroit') + '</button>';
      }
      return '<div class="lqt-card lqt-card--' + esc(j.status) + '">'
        + '<div class="lqt-card__top">'
        +   '<span class="lqt-card__label" title="' + esc(j.label) + '">' + esc(j.label) + '</span>'
        +   (j.max ? '<span class="lqt-max" title="Analyse approfondie">Max</span>' : '')
        +   '<span class="lqt-card__status">' + esc(statusText(j)) + '</span>'
        + '</div>'
        + '<div class="lqt-track"><div class="' + barCls + '" style="width:' + pct + '%"></div></div>'
        + (steps ? '<ul class="lqt-steps">' + steps + '</ul>' : '')
        + '<div class="lqt-card__act">' + actions + '</div>'
        + '</div>';
    }).join('');
  }

  function onListClick(e) {
    var btn = e.target.closest('button[data-act]'); if (!btn) return;
    var id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
    var job = current.filter(function (j) { return j.id === id; })[0];
    if (act === 'cancel')  { btn.disabled = true; btn.textContent = 'Annulation…'; cancel(id); }
    if (act === 'dismiss') { dismiss(id); }
    if (act === 'goto' && job && job.location && job.location.url) {
      if (samePage(job.location.url)) emit('goto', job);
      else window.location.href = job.location.url;
    }
  }

  /* ---------- montage (DOM + styles injectés une fois) ---------- */
  function build() {
    if (built) return;
    built = true;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.className = 'lqt';
    root.hidden = true;
    root.innerHTML =
      '<button class="lqt-pill" type="button" aria-label="Analyses IA">'
      +   '<span class="lqt-pill__spin"></span><span class="lqt-pill__n"></span></button>'
      + '<div class="lqt-panel">'
      +   '<div class="lqt-head">'
      +     '<span class="lqt-head__dot"></span>'
      +     '<span class="lqt-head__t">Analyses IA</span>'
      +     '<span class="lqt-head__n"></span>'
      +     '<button class="lqt-min" type="button" aria-label="Réduire" title="Réduire">–</button>'
      +   '</div>'
      +   '<div class="lqt-list"></div>'
      + '</div>';
    document.body.appendChild(root);

    els.root      = root;
    els.list      = root.querySelector('.lqt-list');
    els.count     = root.querySelector('.lqt-head__n');
    els.pillCount = root.querySelector('.lqt-pill__n');
    els.list.addEventListener('click', onListClick);
    root.querySelector('.lqt-min').addEventListener('click', function () { collapsed = true;  render(); });
    root.querySelector('.lqt-pill').addEventListener('click', function () { collapsed = false; render(); });
  }
  function hide() { if (els.root) els.root.hidden = true; }

  /* ---------- styles ---------- */
  var CSS = [
    '.lqt{position:fixed;top:14px;left:14px;z-index:2147482000;font-family:"Libre Franklin",system-ui,-apple-system,Segoe UI,Roboto,sans-serif}',
    '.lqt[hidden]{display:none}',
    '.lqt-panel{width:320px;max-width:calc(100vw - 28px);background:#fff;border:1px solid #e7e3db;border-radius:14px;box-shadow:0 12px 34px rgba(8,9,12,.16),0 2px 6px rgba(8,9,12,.06);overflow:hidden}',
    '.lqt--collapsed .lqt-panel{display:none}',
    '.lqt-pill{display:none;align-items:center;gap:8px;background:#08090c;color:#f4f2ee;border:0;border-radius:999px;padding:9px 14px;cursor:pointer;box-shadow:0 8px 22px rgba(8,9,12,.22);font:inherit;font-weight:600;font-size:13px}',
    '.lqt--collapsed .lqt-pill{display:inline-flex}',
    '.lqt-pill__n{background:#3b82f6;color:#fff;border-radius:999px;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;padding:0 4px}',
    '.lqt-pill__spin{width:13px;height:13px;border:2px solid rgba(244,242,238,.35);border-top-color:#f4f2ee;border-radius:50%;animation:lqt-spin .8s linear infinite}',
    '.lqt:not(.lqt--busy) .lqt-pill__spin{display:none}',
    '.lqt-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #f0ece4;background:#faf9f6}',
    '.lqt-head__dot{width:9px;height:9px;border-radius:50%;background:#c9c6bf;flex:0 0 auto}',
    '.lqt--busy .lqt-head__dot{background:#3b82f6;box-shadow:0 0 0 0 rgba(59,130,246,.5);animation:lqt-pulse 1.4s ease-out infinite}',
    '.lqt-head__t{font-weight:700;font-size:13px;color:#08090c;letter-spacing:.01em}',
    '.lqt-head__n{margin-left:2px;background:#eef1f6;color:#3b5b93;border-radius:999px;font-size:11px;font-weight:700;min-width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}',
    '.lqt-min{margin-left:auto;background:transparent;border:0;color:#6b6862;font-size:20px;line-height:1;cursor:pointer;padding:0 4px;border-radius:6px}',
    '.lqt-min:hover{background:#efece6;color:#08090c}',
    '.lqt-list{max-height:min(64vh,520px);overflow:auto;padding:8px}',
    '.lqt-card{border:1px solid #eee9e0;border-radius:11px;padding:10px 11px;margin:4px 2px}',
    '.lqt-card + .lqt-card{margin-top:8px}',
    '.lqt-card--error{border-color:#f3c9c9;background:#fff7f7}',
    '.lqt-card--done{border-color:#cfe8d6}',
    '.lqt-card__top{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}',
    '.lqt-card__label{font-weight:600;font-size:13px;color:#08090c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.lqt-max{flex:0 0 auto;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#3b5b93;background:#eef1f6;border-radius:999px;padding:2px 6px}',
    '.lqt-card__status{margin-left:auto;font-size:11px;color:#8a867e;white-space:nowrap;flex:0 0 auto}',
    '.lqt-card--error .lqt-card__status{color:#c0392b}',
    '.lqt-card--done .lqt-card__status{color:#15803d}',
    '.lqt-track{height:6px;background:#efece6;border-radius:999px;overflow:hidden}',
    '.lqt-bar{height:100%;background:#3b82f6;border-radius:999px;transition:width .35s ease}',
    '.lqt-bar--done{background:#16a34a}',
    '.lqt-bar--err{background:#dc2626}',
    '.lqt-bar--indet{width:40%!important;animation:lqt-indet 1.15s ease-in-out infinite}',
    '.lqt-steps{list-style:none;margin:9px 0 2px;padding:0;display:flex;flex-direction:column;gap:5px}',
    '.lqt-step{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#6b6862}',
    '.lqt-step__l{flex:0 0 auto}',
    '.lqt-step__d{margin-left:auto;color:#9a968e;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.lqt-dot{width:7px;height:7px;border-radius:50%;background:#cfccc4;flex:0 0 auto}',
    '.lqt-step--progress .lqt-dot{background:#3b82f6;animation:lqt-blink 1s ease-in-out infinite}',
    '.lqt-step--progress{color:#08090c}',
    '.lqt-step--done .lqt-dot{background:#16a34a}',
    '.lqt-step--error .lqt-dot{background:#dc2626}',
    '.lqt-step--cancelled .lqt-dot{background:#c9c6bf}',
    '.lqt-card__act{display:flex;gap:7px;margin-top:10px}',
    '.lqt-b{flex:1;border:1px solid #e2ded6;background:#fff;color:#08090c;border-radius:8px;padding:6px 8px;font:inherit;font-size:12px;font-weight:600;cursor:pointer}',
    '.lqt-b:hover{background:#f4f2ee}',
    '.lqt-b--go{background:#08090c;color:#f4f2ee;border-color:#08090c}',
    '.lqt-b--go:hover{background:#20222a}',
    '.lqt-b--cancel{color:#c0392b;border-color:#eccaca}',
    '.lqt-b--cancel:hover{background:#fdeeee}',
    '.lqt-b:disabled{opacity:.55;cursor:default}',
    '@keyframes lqt-spin{to{transform:rotate(360deg)}}',
    '@keyframes lqt-blink{0%,100%{opacity:1}50%{opacity:.35}}',
    '@keyframes lqt-pulse{0%{box-shadow:0 0 0 0 rgba(59,130,246,.5)}70%{box-shadow:0 0 0 7px rgba(59,130,246,0)}100%{box-shadow:0 0 0 0 rgba(59,130,246,0)}}',
    '@keyframes lqt-indet{0%{margin-left:-42%}100%{margin-left:102%}}',
    '@media (max-width:640px){.lqt{top:8px;left:8px}}',
  ].join('\n');

  // Styles du bouton « Max » — injectés dès le chargement (indépendamment du widget,
  // qui n'est monté qu'à l'apparition d'une tâche).
  var TOGGLE_CSS = [
    '.aimax{display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-weight:600;font-size:13px;line-height:1;padding:8px 12px;border-radius:999px;border:1px solid rgba(128,128,128,.45);background:transparent;color:inherit;cursor:pointer;transition:background .15s,border-color .15s,color .15s;-webkit-appearance:none}',
    '.aimax:hover{border-color:rgba(128,128,128,.85)}',
    '.aimax .aimax__i{font-size:12px;line-height:1;opacity:.6}',
    '.aimax.is-on{background:#3b82f6;border-color:#3b82f6;color:#fff}',
    '.aimax.is-on .aimax__i{opacity:1}',
    '.aimax:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}',
    // Bouton « Max » dans la bannière sombre (.topbar) : deux états nets et lisibles.
    //  - Inactif  → bouton NOIR (pas d'animation).
    //  - Actif    → bouton BLANC + animation (halo pulsé + étincelle) pour signaler l'activation.
    '.topbar .aimax{background:#000;border-color:rgba(255,255,255,.30);color:#fff}',
    '.topbar .aimax:hover{background:#161616;border-color:rgba(255,255,255,.6)}',
    '.topbar .aimax .aimax__i{opacity:.7}',
    '.topbar .aimax.is-on{background:#fff;border-color:#fff;color:#0a0a0a;animation:aimax-glow 1.8s ease-in-out infinite}',
    '.topbar .aimax.is-on:hover{background:#f0f0f0;border-color:#fff}',
    '.topbar .aimax.is-on .aimax__i{opacity:1;animation:aimax-spark 1.8s ease-in-out infinite}',
    '@keyframes aimax-glow{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}50%{box-shadow:0 0 0 6px rgba(255,255,255,0)}}',
    '@keyframes aimax-spark{0%,100%{transform:scale(1) rotate(0deg);opacity:1}50%{transform:scale(1.22) rotate(12deg);opacity:.7}}',
    '@media (prefers-reduced-motion:reduce){.topbar .aimax.is-on,.topbar .aimax.is-on .aimax__i{animation:none}}',
  ].join('\n');
  function injectToggleCSS() {
    if (document.getElementById('lqt-toggle-css')) return;
    var s = document.createElement('style');
    s.id = 'lqt-toggle-css';
    s.textContent = TOGGLE_CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- API + démarrage ---------- */
  window.LiquidTasks = {
    launch: launch, list: list, fetchResult: fetchResult,
    cancel: cancel, dismiss: dismiss, on: on,
    maxMode: maxMode, setMaxMode: setMaxMode,
    refresh: function () { schedule(50); },
  };

  function start() { injectToggleCSS(); wireMaxToggles(); poll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
