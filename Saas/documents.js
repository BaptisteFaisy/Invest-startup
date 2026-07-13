/* =========================================================
   liquid + — Ajouter un document
   Le bouton « + Ajouter un document » de l'éditeur ouvre une
   fenêtre (modal) : glisser-déposer ou Parcourir, aperçu du
   fichier, puis téléversement vers l'espace de l'utilisateur
   (/api/saas/documents). La gestion/conversion se fait ensuite
   depuis la page Dossiers.
   ========================================================= */
(function () {
  const btn       = document.getElementById('docs-btn');
  const fileInput = document.getElementById('docs-file');
  if (!btn || !fileInput) return;

  const ACCEPT = fileInput.getAttribute('accept') || '';

  /* ---- Styles du modal (injectés pour rester autonome) ---- */
  const css = `
  .docmodal{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:24px}
  .docmodal.is-open{display:flex}
  .docmodal__backdrop{position:absolute;inset:0;background:rgba(8,9,12,0.45);backdrop-filter:blur(2px)}
  .docmodal__dialog{position:relative;width:100%;max-width:460px;background:var(--card,#fff);border-radius:var(--radius,16px);
    box-shadow:0 24px 60px rgba(8,9,12,0.28);border:1px solid var(--line-card,rgba(8,9,12,0.06));overflow:hidden;
    animation:docmodal-in .18s ease}
  @keyframes docmodal-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
  .docmodal__head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line,rgba(8,9,12,0.08))}
  .docmodal__title{margin:0;font:600 16px/1.2 'Archivo',sans-serif;color:var(--text,#08090c)}
  .docmodal__close{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--text-2,#6b6b78);padding:2px 6px;border-radius:8px}
  .docmodal__close:hover{background:var(--bg,#f4f2ee);color:var(--text,#08090c)}
  .docmodal__body{padding:20px}
  .docmodal__drop{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
    padding:28px 18px;border:2px dashed var(--line,rgba(8,9,12,0.18));border-radius:12px;cursor:pointer;
    transition:border-color .15s,background .15s;color:var(--text-2,#6b6b78)}
  .docmodal__drop:hover{border-color:var(--blue,#3b82f6);background:rgba(59,130,246,0.04)}
  .docmodal__drop.is-drag{border-color:var(--blue,#3b82f6);background:rgba(59,130,246,0.08)}
  .docmodal__icon{font-size:30px}
  .docmodal__hint{font-size:13px;color:var(--text-3,#a8a8b3)}
  .docmodal__file{display:none;align-items:center;gap:12px;padding:14px 16px;background:var(--bg,#f4f2ee);border-radius:12px}
  .docmodal__file.is-shown{display:flex}
  .docmodal__file-icon{font-size:24px}
  .docmodal__file-meta{flex:1;min-width:0}
  .docmodal__file-name{font:600 14px/1.3 'Libre Franklin',sans-serif;color:var(--text,#08090c);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .docmodal__file-size{font-size:12px;color:var(--text-2,#6b6b78)}
  .docmodal__file-x{border:0;background:none;cursor:pointer;color:var(--text-2,#6b6b78);font-size:18px;padding:4px}
  .docmodal__error{display:none;margin-top:12px;color:#b91c1c;font-size:13px}
  .docmodal__error.is-shown{display:block}
  .docmodal__dest{display:none;margin-top:16px}
  .docmodal__dest.is-shown{display:block}
  .docmodal__dest-label{display:block;font:600 13px/1.3 'Libre Franklin',sans-serif;color:var(--text,#08090c);margin-bottom:7px}
  .docmodal__dest-select{width:100%;box-sizing:border-box;background:var(--card,#fff);border:1px solid var(--line,rgba(8,9,12,0.18));border-radius:10px;color:var(--text,#08090c);font:500 14px/1.2 'Libre Franklin',sans-serif;padding:11px 12px;cursor:pointer}
  .docmodal__dest-select:focus{outline:none;border-color:var(--blue,#3b82f6)}
  .docmodal__foot{display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid var(--line,rgba(8,9,12,0.08))}
  .docmodal__foot .btn[disabled]{opacity:.5;cursor:not-allowed}
  .docmodal__ver{display:none;margin-top:16px;padding-top:14px;border-top:1px solid var(--line,rgba(8,9,12,0.08))}
  .docmodal__ver.is-shown{display:block}
  .docmodal__ver-toggle{display:flex;align-items:center;gap:9px;cursor:pointer;font:500 13.5px/1.35 'Libre Franklin',sans-serif;color:var(--text,#08090c)}
  .docmodal__ver-toggle input{width:16px;height:16px;flex:none;cursor:pointer}
  .docmodal__ver-fields{display:none;margin-top:12px}
  .docmodal__ver-fields.is-shown{display:block}
  .docmodal__ver-hint{font-size:12px;color:var(--text-2,#6b6b78);margin:2px 0 12px}
  .docmodal__ver-callout{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(167,139,250,.09);border:1px solid rgba(167,139,250,.22);font-size:12px;line-height:1.45;color:var(--text-2,#6b6b78)}
  .docmodal__nudge{display:none;margin-top:14px;padding:12px 14px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.28);border-radius:12px}
  .docmodal__nudge.is-shown{display:block}
  .docmodal__nudge-txt{font:500 13px/1.45 'Libre Franklin',sans-serif;color:var(--text,#08090c)}
  .docmodal__nudge-txt b{font-weight:700}
  .docmodal__nudge-grid{display:grid;gap:8px;margin-top:10px}
  .docmodal__nudge-grid .docmodal__dest-select{padding:9px 10px;font-size:12.5px}
  .docmodal__nudge-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .docmodal__nudge-acts .btn{padding:7px 12px;font-size:12.5px}
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---- Construction du modal ---- */
  const modal = document.createElement('div');
  modal.className = 'docmodal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'docmodal-title');
  modal.innerHTML = `
    <div class="docmodal__backdrop" data-close></div>
    <div class="docmodal__dialog">
      <div class="docmodal__head">
        <h2 class="docmodal__title" id="docmodal-title">Ajouter un document</h2>
        <button class="docmodal__close" type="button" data-close aria-label="Fermer">×</button>
      </div>
      <div class="docmodal__body">
        <div class="docmodal__drop" id="docmodal-drop" tabindex="0" role="button"
             aria-label="Glisser un fichier ou parcourir">
          <span><strong>Glissez un fichier ici</strong> ou cliquez pour parcourir</span>
          <span class="docmodal__hint" id="docmodal-format-hint">PDF, Word, Excel ou image</span>
        </div>
        <div class="docmodal__file" id="docmodal-file">
          <div class="docmodal__file-meta">
            <div class="docmodal__file-name" id="docmodal-file-name"></div>
            <div class="docmodal__file-size" id="docmodal-file-size"></div>
          </div>
          <button class="docmodal__file-x" type="button" id="docmodal-file-x" aria-label="Retirer le fichier">×</button>
        </div>
        <div class="docmodal__dest" id="docmodal-dest">
          <label class="docmodal__dest-label" for="docmodal-dest-select">Ranger dans une étape</label>
          <select class="docmodal__dest-select" id="docmodal-dest-select">
            <option value="">— Non classé —</option>
          </select>
        </div>
        <div class="docmodal__ver" id="docmodal-ver">
          <label class="docmodal__ver-toggle">
            <input type="checkbox" id="docmodal-ver-check" />
            <span>Ce fichier est une nouvelle version ou une contreproposition</span>
          </label>
          <div class="docmodal__ver-fields" id="docmodal-ver-fields">
            <div class="docmodal__ver-callout">Liquid+ conservera les deux fichiers dans le même fil et vous permettra de comparer précisément ce qui a changé.</div>
            <label class="docmodal__dest-label" for="docmodal-ver-type">Nature du fichier</label>
            <select class="docmodal__dest-select" id="docmodal-ver-type">
              <option value="">— Choisir —</option>
              <option value="counterproposal">Contreproposition de négociation</option>
              <option value="revision">Révision personnelle</option>
              <option value="signed">Version signée</option>
            </select>
            <label class="docmodal__dest-label" for="docmodal-ver-parent" style="margin-top:12px">Ce fichier répond à</label>
            <select class="docmodal__dest-select" id="docmodal-ver-parent"></select>
            <label class="docmodal__dest-label" for="docmodal-ver-origin" style="margin-top:12px">Qui a produit ce fichier ?</label>
            <select class="docmodal__dest-select" id="docmodal-ver-origin">
              <option value="founder">Créée par moi</option>
              <option value="investor">Reçue d'un investisseur</option>
              <option value="lawyer">Reçue de l'avocat</option>
            </select>
            <select class="docmodal__dest-select" id="docmodal-ver-investor" hidden style="margin-top:10px"></select>
            <select class="docmodal__dest-select" id="docmodal-ver-recipient" style="margin-top:10px"></select>
          </div>
        </div>
        <div class="docmodal__nudge" id="docmodal-nudge">
          <div class="docmodal__nudge-txt" id="docmodal-nudge-txt"></div>
          <div class="docmodal__nudge-grid">
            <select class="docmodal__dest-select" id="docmodal-nudge-type" aria-label="Nature du fichier">
              <option value="">— Est-ce une contreproposition ? —</option>
              <option value="counterproposal">Une contreproposition de négociation</option>
              <option value="revision">Une révision personnelle</option>
              <option value="signed">Non, une version signée</option>
            </select>
            <select class="docmodal__dest-select" id="docmodal-nudge-origin" aria-label="Auteur du fichier">
              <option value="founder">Créée par moi</option>
              <option value="investor">Reçue d'un investisseur</option>
              <option value="lawyer">Reçue de l'avocat</option>
            </select>
            <select class="docmodal__dest-select" id="docmodal-nudge-investor" aria-label="Investisseur à l'origine du fichier" hidden></select>
            <select class="docmodal__dest-select" id="docmodal-nudge-recipient" aria-label="Destinataire du fichier"></select>
          </div>
          <div class="docmodal__nudge-acts">
            <button class="btn btn--primary" type="button" id="docmodal-nudge-yes">Rattacher au fil</button>
            <button class="btn btn--ghost" type="button" id="docmodal-nudge-no">Non, document distinct</button>
          </div>
        </div>
        <div class="docmodal__error" id="docmodal-error"></div>
      </div>
      <div class="docmodal__foot">
        <button class="btn btn--ghost" type="button" data-close>Annuler</button>
        <button class="btn btn--primary" type="button" id="docmodal-submit" disabled>Téléverser</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#docmodal-format-hint').textContent =
    fileInput.dataset.importHint || 'PDF, Word, Excel ou image';

  const drop     = modal.querySelector('#docmodal-drop');
  const fileBox  = modal.querySelector('#docmodal-file');
  const fileName = modal.querySelector('#docmodal-file-name');
  const fileSize = modal.querySelector('#docmodal-file-size');
  const fileX    = modal.querySelector('#docmodal-file-x');
  const errBox   = modal.querySelector('#docmodal-error');
  const submit   = modal.querySelector('#docmodal-submit');
  const destBox  = modal.querySelector('#docmodal-dest');
  const destSel  = modal.querySelector('#docmodal-dest-select');
  const verBox   = modal.querySelector('#docmodal-ver');
  const verCheck = modal.querySelector('#docmodal-ver-check');
  const verFields = modal.querySelector('#docmodal-ver-fields');
  const verType = modal.querySelector('#docmodal-ver-type');
  const verParent = modal.querySelector('#docmodal-ver-parent');
  const verOrigin = modal.querySelector('#docmodal-ver-origin');
  const verInvestor = modal.querySelector('#docmodal-ver-investor');
  const verRecipient = modal.querySelector('#docmodal-ver-recipient');
  const nudgeBox = modal.querySelector('#docmodal-nudge');
  const nudgeTxt = modal.querySelector('#docmodal-nudge-txt');
  const nudgeType = modal.querySelector('#docmodal-nudge-type');
  const nudgeOrigin = modal.querySelector('#docmodal-nudge-origin');
  const nudgeInvestor = modal.querySelector('#docmodal-nudge-investor');
  const nudgeRecipient = modal.querySelector('#docmodal-nudge-recipient');
  const nudgeYes = modal.querySelector('#docmodal-nudge-yes');
  const nudgeNo  = modal.querySelector('#docmodal-nudge-no');

  let selected = null;
  let busy = false;
  let verCtxDocs = [];       // documents existants proposables comme parent
  let pendingNudge = null;   // { docId, suggestion } après un import non rattaché

  function fmtSize(b) {
    if (b < 1024) return b + ' o';
    if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' Ko';
    return (b / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  function accepts(file) {
    if (!ACCEPT) return true;
    const exts = ACCEPT.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const name = file.name.toLowerCase();
    return exts.some((e) => name.endsWith(e));
  }

  function showError(msg) {
    errBox.textContent = msg;
    errBox.classList.add('is-shown');
  }
  function clearError() {
    errBox.textContent = '';
    errBox.classList.remove('is-shown');
  }

  function setFile(file) {
    clearError();
    if (!file) return;
    if (!accepts(file)) {
      showError('Format non pris en charge. Formats acceptés : ' + ACCEPT);
      return;
    }
    selected = file;
    fileName.textContent = file.name;
    fileSize.textContent = fmtSize(file.size);
    fileBox.classList.add('is-shown');
    submit.disabled = false;
  }

  function resetFile() {
    selected = null;
    fileInput.value = '';
    fileBox.classList.remove('is-shown');
    submit.disabled = true;
  }

  // Remplit le sélecteur de destination avec les étapes du parcours actif,
  // fournies par la page (window.liquidImportDestinations). Absente ailleurs
  // (ex. éditeur) : le champ reste masqué et l'import se fait « non classé ».
  function populateDest() {
    destSel.innerHTML = '<option value="">— Non classé —</option>';
    let ctx = null;
    try { ctx = typeof window.liquidImportDestinations === 'function' ? window.liquidImportDestinations() : null; } catch { ctx = null; }
    const folders = (ctx && Array.isArray(ctx.folders)) ? ctx.folders : [];
    if (!folders.length) { destBox.classList.remove('is-shown'); return; }
    folders.forEach((f) => {
      const o = document.createElement('option');
      o.value = String(f.id);
      o.textContent = f.name;
      destSel.appendChild(o);
    });
    if (ctx && ctx.defaultFolderId != null) destSel.value = String(ctx.defaultFolderId);
    destBox.classList.add('is-shown');
  }

  // Remplit la section « nouvelle version de… » depuis le contexte fourni par la
  // page (window.liquidImportContext) : documents existants + investisseurs. Absente
  // ailleurs (ex. éditeur) : la section reste masquée.
  async function populateVersionCtx() {
    verCheck.checked = false;
    verFields.classList.remove('is-shown');
    verInvestor.hidden = true;
    verRecipient.hidden = false;
    verOrigin.value = 'founder';
    verType.value = '';
    let ctx = null;
    try { ctx = typeof window.liquidImportContext === 'function' ? window.liquidImportContext() : null; } catch { ctx = null; }
    // La page Documents fournit déjà ce contexte. L'éditeur, lui, ne charge pas
    // ces listes : on les récupère directement afin que les trois métadonnées de
    // l'arbre des versions restent pleinement utilisables partout.
    if (!ctx) {
      try {
        const [docsResponse, investorsResponse] = await Promise.all([
          fetch('/api/saas/documents', { credentials: 'include' }),
          fetch('/api/saas/investors', { credentials: 'include' }),
        ]);
        const docsData = docsResponse.ok ? await docsResponse.json() : {};
        const investorsData = investorsResponse.ok ? await investorsResponse.json() : {};
        ctx = {
          documents: (Array.isArray(docsData.documents) ? docsData.documents : [])
            .filter((d) => !d.is_version)
            .map((d) => ({ id: d.id, name: d.name })),
          investors: (Array.isArray(investorsData.investors) ? investorsData.investors : [])
            .map((inv) => ({ id: inv.id, name: inv.name, firm: inv.firm || '' })),
        };
      } catch { ctx = null; }
    }
    verCtxDocs = (ctx && Array.isArray(ctx.documents)) ? ctx.documents : [];
    const investors = (ctx && Array.isArray(ctx.investors)) ? ctx.investors : [];

    // Ces listes servent aussi au « nudge » affiché après l'import. Dans
    // l'éditeur, aucun contexte de versions n'est fourni : on doit néanmoins
    // leur laisser une option neutre, sinon la troisième liste est vide et le
    // formulaire paraît impossible à compléter.
    verInvestor.innerHTML = '<option value="">— Quel investisseur ? —</option>';
    nudgeInvestor.innerHTML = '<option value="">— Quel investisseur ? —</option>';
    verRecipient.innerHTML = '<option value="">— Version interne, pas encore envoyée —</option>';
    nudgeRecipient.innerHTML = '<option value="">— Version interne, pas encore envoyée —</option>';
    investors.forEach((inv) => {
      const o = document.createElement('option');
      o.value = String(inv.id);
      o.textContent = inv.firm ? inv.name + ' — ' + inv.firm : inv.name;
      verInvestor.appendChild(o);
      nudgeInvestor.appendChild(o.cloneNode(true));
      const recipientOption = o.cloneNode(true);
      recipientOption.textContent = 'Envoyée à ' + recipientOption.textContent;
      verRecipient.appendChild(recipientOption);
      nudgeRecipient.appendChild(recipientOption.cloneNode(true));
    });

    // La provenance « investisseur » reste valable même avant la création de la
    // fiche du contact. Comparer l'affichera alors comme « un investisseur ».
    if (!investors.length) {
      const genericInvestor = document.createElement('option');
      genericInvestor.value = 'unknown';
      genericInvestor.textContent = 'Un investisseur (non renseigné)';
      verInvestor.appendChild(genericInvestor);
      nudgeInvestor.appendChild(genericInvestor.cloneNode(true));
    }

    if (!verCtxDocs.length) { verBox.classList.remove('is-shown'); return; }
    verParent.innerHTML = '<option value="">— Choisir le document —</option>';
    verCtxDocs.forEach((d) => {
      const o = document.createElement('option');
      o.value = String(d.id);
      o.textContent = d.name;
      verParent.appendChild(o);
    });
    verBox.classList.add('is-shown');
  }

  function hideNudge() { nudgeBox.classList.remove('is-shown'); pendingNudge = null; }

  async function openModal() {
    clearError();
    resetFile();
    hideNudge();
    populateDest();
    modal.classList.add('is-open');
    drop.focus();
    await populateVersionCtx();
  }

  function closeModal() {
    if (busy) return;
    modal.classList.remove('is-open');
    resetFile();
    hideNudge();
    submit.textContent = 'Téléverser';
  }

  /* ---- Section « nouvelle version de… » ---- */
  verCheck.addEventListener('change', () => {
    verFields.classList.toggle('is-shown', verCheck.checked);
  });
  verOrigin.addEventListener('change', () => {
    verInvestor.hidden = verOrigin.value !== 'investor';
    verRecipient.hidden = verOrigin.value !== 'founder';
  });
  nudgeOrigin.addEventListener('change', () => {
    nudgeInvestor.hidden = nudgeOrigin.value !== 'investor';
    nudgeRecipient.hidden = nudgeOrigin.value !== 'founder';
  });

  /* ---- Ouverture / fermeture ---- */
  btn.addEventListener('click', openModal);
  modal.addEventListener('click', (e) => {
    if (e.target.hasAttribute('data-close')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });

  /* ---- Parcourir ---- */
  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => {
    setFile(fileInput.files && fileInput.files[0]);
  });
  fileX.addEventListener('click', resetFile);

  /* ---- Glisser-déposer ---- */
  ['dragenter', 'dragover'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) setFile(f);
  });

  /* ---- Téléversement ---- */
  submit.addEventListener('click', async () => {
    if (!selected || busy) return;
    const versionRequested = verBox.classList.contains('is-shown') && verCheck.checked;
    if (versionRequested && !verParent.value) {
      showError('Choisissez le document dont ce fichier est une nouvelle version.');
      return;
    }
    if (versionRequested && !verType.value) {
      showError('Indiquez s’il s’agit d’une contreproposition, d’une révision ou d’une version signée.');
      return;
    }
    if (versionRequested && verOrigin.value === 'investor' && !verInvestor.value) {
      showError('Choisissez l’investisseur à l’origine de cette version.');
      return;
    }
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Ajout…';
    clearError();
    const fd = new FormData();
    fd.append('file', selected);
    // Étape de destination choisie (facultative) : le serveur range le document
    // dans ce dossier s'il appartient à l'utilisateur.
    if (destBox.classList.contains('is-shown') && destSel.value) fd.append('folder_id', destSel.value);
    // Rattachement explicite « nouvelle version de… » (facultatif).
    const linking = versionRequested && verParent.value;
    if (linking) {
      fd.append('parent_document_id', verParent.value);
      fd.append('version_type', verType.value);
      fd.append('origin', verOrigin.value);
      if (verOrigin.value === 'investor' && verInvestor.value) fd.append('origin_party_id', verInvestor.value);
      if (verOrigin.value === 'founder' && verRecipient.value) fd.append('sent_to_party_id', verRecipient.value);
    }
    try {
      const r = await fetch('/api/saas/documents', { method: 'POST', credentials: 'include', body: fd });
      if (r.status === 401) { window.location.href = 'login.html'; return; }
      if (r.ok) {
        submit.textContent = 'Ajouté';
        busy = false;
        // Prévient les pages qui affichent la liste (ex. l'outil Documents) pour
        // qu'elles se rafraîchissent sans rechargement complet.
        const data = await r.json().catch(() => ({}));
        window.dispatchEvent(new CustomEvent('liquid:document-added', { detail: data.document || null }));
        // Nudge : si l'utilisateur n'a pas rattaché lui-même et que le serveur
        // détecte une ressemblance, on propose de lier plutôt que de fermer.
        const sugg = !linking && data.document && Array.isArray(data.versionSuggestions) && data.versionSuggestions.length
          ? data.versionSuggestions[0] : null;
        if (sugg) { showNudge(data.document.id, sugg); }
        else { setTimeout(closeModal, 900); }
      } else {
        const data = await r.json().catch(() => ({}));
        busy = false;
        submit.textContent = 'Téléverser';
        submit.disabled = false;
        showError(data.error || 'Échec du téléversement.');
      }
    } catch {
      busy = false;
      submit.textContent = 'Téléverser';
      submit.disabled = false;
      showError('Erreur réseau. Réessayez.');
    }
  });

  /* ---- Nudge : rattacher un import ressemblant à un document existant ---- */
  function escN(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showNudge(docId, suggestion) {
    pendingNudge = { docId, suggestion };
    nudgeType.value = '';
    nudgeOrigin.value = 'founder';
    nudgeInvestor.value = '';
    nudgeInvestor.hidden = true;
    nudgeRecipient.value = '';
    nudgeRecipient.hidden = false;
    nudgeTxt.innerHTML = 'Ce fichier ressemble à <b>' + escN(suggestion.name) + '</b>. Indiquez sa nature et son auteur pour le rattacher au bon fil.';
    nudgeBox.classList.add('is-shown');
  }
  nudgeYes.addEventListener('click', async () => {
    if (!pendingNudge) return;
    if (!nudgeType.value) { showError('Indiquez la nature du fichier avant de le rattacher.'); return; }
    if (nudgeOrigin.value === 'investor' && !nudgeInvestor.value) {
      showError('Choisissez l’investisseur à l’origine de cette version.'); return;
    }
    nudgeYes.disabled = true; nudgeNo.disabled = true;
    try {
      const response = await fetch('/api/saas/documents/' + pendingNudge.docId + '/lineage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          parent_document_id: pendingNudge.suggestion.document_id,
          version_type: nudgeType.value,
          origin: nudgeOrigin.value,
          origin_party_id: nudgeOrigin.value === 'investor' ? Number(nudgeInvestor.value) : null,
          sent_to_party_id: nudgeOrigin.value === 'founder' && nudgeRecipient.value ? Number(nudgeRecipient.value) : null,
        }),
      });
      if (!response.ok) throw new Error('Rattachement impossible');
      window.dispatchEvent(new CustomEvent('liquid:document-added', { detail: null }));
    } catch { /* le document reste importé, simplement non rattaché */ }
    nudgeYes.disabled = false; nudgeNo.disabled = false;
    hideNudge();
    closeModal();
  });
  nudgeNo.addEventListener('click', () => { hideNudge(); closeModal(); });
})();
