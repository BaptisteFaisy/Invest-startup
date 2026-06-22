/* =========================================================
   liquid + — Mes documents : stockage + conversion PDF ⇄ DOCX
   Autonome (n'utilise rien de editor.js). Appelle le backend
   invest-startup via /api/saas/documents*.
   ========================================================= */
(function () {
  const btn      = document.getElementById('docs-btn');
  const modal    = document.getElementById('docs-modal');
  if (!btn || !modal) return;

  const closeBtn  = document.getElementById('docs-close');
  const closeBg   = document.getElementById('docs-close-bg');
  const fileInput = document.getElementById('docs-file');
  const listEl    = document.getElementById('docs-list');
  const errEl     = document.getElementById('docs-error');

  function openModal()  { modal.hidden = false; load(); }
  function closeModal() { modal.hidden = true; }
  btn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  closeBg.addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

  function showErr(msg) { errEl.textContent = msg || ''; errEl.hidden = !msg; }
  function fmtSize(b) { if (b < 1024) return b + ' o'; if (b < 1048576) return Math.round(b / 1024) + ' Ko'; return (b / 1048576).toFixed(1) + ' Mo'; }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } }
  function ext(name) { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  async function load() {
    showErr('');
    listEl.innerHTML = '<p class="docs-empty">Chargement…</p>';
    try {
      const r = await fetch('/api/saas/documents', { credentials: 'include' });
      if (r.status === 401) { window.location.href = 'login.html'; return; }
      const data = await r.json();
      render(data.documents || []);
    } catch {
      listEl.innerHTML = '';
      showErr('Impossible de charger vos documents.');
    }
  }

  function render(docs) {
    if (!docs.length) {
      listEl.innerHTML = '<p class="docs-empty">Aucun document. Importez un PDF ou un DOCX pour commencer.</p>';
      return;
    }
    listEl.innerHTML = '';
    docs.forEach(d => {
      const e = ext(d.originalname || d.name);
      const target = e === 'pdf' ? 'docx' : (e === 'docx' || e === 'doc') ? 'pdf' : null;

      const row = document.createElement('div');
      row.className = 'docrow';
      row.innerHTML = `
        <div class="docrow__main">
          <span class="docrow__ext docrow__ext--${e || 'file'}">${(e || '?').toUpperCase()}</span>
          <div class="docrow__meta">
            <div class="docrow__name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
            <div class="docrow__sub">${fmtSize(d.size)} · ${fmtDate(d.created_at)}${d.converted_from ? ' · converti' : ''}</div>
          </div>
        </div>
        <div class="docrow__actions"></div>`;

      const actions = row.querySelector('.docrow__actions');
      if (target) {
        const cv = document.createElement('button');
        cv.className = 'docbtn docbtn--convert';
        cv.textContent = '→ ' + target.toUpperCase();
        cv.title = 'Convertir en ' + target.toUpperCase();
        cv.addEventListener('click', () => convert(d.id, target, cv));
        actions.appendChild(cv);
      }
      const dl = document.createElement('a');
      dl.className = 'docbtn';
      dl.textContent = 'Télécharger';
      dl.href = '/api/saas/documents/' + d.id + '/download';
      actions.appendChild(dl);

      const del = document.createElement('button');
      del.className = 'docbtn docbtn--del';
      del.textContent = 'Suppr.';
      del.addEventListener('click', () => remove(d.id, del));
      actions.appendChild(del);

      listEl.appendChild(row);
    });
  }

  async function convert(id, to, btnEl) {
    showErr('');
    const old = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = 'Conversion…';
    try {
      const r = await fetch('/api/saas/documents/' + id + '/convert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ to }),
      });
      const data = await r.json();
      if (!r.ok) { showErr(data.error || 'Conversion échouée.'); btnEl.disabled = false; btnEl.textContent = old; return; }
      load();
    } catch {
      showErr('Impossible de joindre le serveur.');
      btnEl.disabled = false; btnEl.textContent = old;
    }
  }

  async function remove(id, btnEl) {
    btnEl.disabled = true;
    try {
      const r = await fetch('/api/saas/documents/' + id, { method: 'DELETE', credentials: 'include' });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showErr(d.error || 'Suppression échouée.'); btnEl.disabled = false; return; }
      load();
    } catch {
      showErr('Impossible de joindre le serveur.');
      btnEl.disabled = false;
    }
  }

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    showErr('');
    const fd = new FormData();
    fd.append('file', f);
    listEl.insertAdjacentHTML('afterbegin', '<p class="docs-empty">Import en cours…</p>');
    try {
      const r = await fetch('/api/saas/documents', { method: 'POST', credentials: 'include', body: fd });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) showErr(data.error || 'Import échoué.');
    } catch {
      showErr('Impossible de joindre le serveur.');
    }
    fileInput.value = '';
    load();
  });
})();
