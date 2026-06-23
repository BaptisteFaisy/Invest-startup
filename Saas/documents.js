/* =========================================================
   liquid + — Ajouter un document
   Le bouton « + Ajouter un document » de l'éditeur ouvre direct
   le sélecteur de fichier et téléverse vers l'espace de l'utilisateur
   (/api/saas/documents). Rien d'autre : la gestion/conversion se fait
   depuis la page Dossiers.
   ========================================================= */
(function () {
  const btn       = document.getElementById('docs-btn');
  const fileInput = document.getElementById('docs-file');
  if (!btn || !fileInput) return;

  const LABEL = btn.textContent;
  let busy = false;

  function flash(text, ms = 1800) {
    btn.textContent = text;
    setTimeout(() => { btn.textContent = LABEL; btn.disabled = false; busy = false; }, ms);
  }

  btn.addEventListener('click', () => { if (!busy) fileInput.click(); });

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    busy = true;
    btn.disabled = true;
    btn.textContent = 'Ajout…';
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch('/api/saas/documents', { method: 'POST', credentials: 'include', body: fd });
      if (r.status === 401) { window.location.href = 'login.html'; return; }
      if (r.ok) {
        flash('✓ Ajouté');
      } else {
        const data = await r.json().catch(() => ({}));
        flash('✕ Échec');
        if (data.error) alert(data.error);
      }
    } catch {
      flash('✕ Erreur réseau');
    } finally {
      fileInput.value = '';
    }
  });
})();
