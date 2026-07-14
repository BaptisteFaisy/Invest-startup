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
  const editorImport = fileInput.dataset.importMode === 'editor';

  /* ---- Styles du modal (injectés pour rester autonome) ---- */
  const css = `
  .docmodal{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:24px}
  .docmodal.is-open{display:flex}
  .docmodal__backdrop{position:absolute;inset:0;background:rgba(8,9,12,0.45);backdrop-filter:blur(2px)}
  .docmodal__dialog{position:relative;display:flex;flex-direction:column;width:100%;max-width:460px;max-height:calc(100vh - 48px);max-height:calc(100dvh - 48px);background:var(--card,#fff);border-radius:var(--radius,16px);
    box-shadow:0 24px 60px rgba(8,9,12,0.28);border:1px solid var(--line-card,rgba(8,9,12,0.06));overflow:hidden;
    animation:docmodal-in .18s ease}
  @keyframes docmodal-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
  .docmodal__head{display:flex;flex:none;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line,rgba(8,9,12,0.08))}
  .docmodal__title{margin:0;font:600 16px/1.2 'Archivo',sans-serif;color:var(--text,#08090c)}
  .docmodal__close{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:var(--text-2,#6b6b78);padding:2px 6px;border-radius:8px}
  .docmodal__close:hover{background:var(--bg,#f4f2ee);color:var(--text,#08090c)}
  .docmodal__body{min-height:0;padding:20px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable}
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
  .docmodal__ver-search{margin:0 0 7px}
  .docmodal__foot{display:flex;flex:none;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid var(--line,rgba(8,9,12,0.08))}
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
  @media(max-height:620px),(max-width:520px){
    .docmodal{padding:12px}
    .docmodal__dialog{max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px)}
  }
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
          <span class="docmodal__hint" id="docmodal-format-hint">PDF, Word, OpenDocument, Google Docs, Excel ou image</span>
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
        <div class="docmodal__dest" id="docmodal-category">
          <label class="docmodal__dest-label" for="docmodal-category-select">Ranger dans un dossier</label>
          <select class="docmodal__dest-select" id="docmodal-category-select">
            <option value="">— Choisir d’abord une étape —</option>
          </select>
        </div>
        <div class="docmodal__ver" id="docmodal-ver">
          <label class="docmodal__ver-toggle">
            <input type="checkbox" id="docmodal-ver-check" />
            <span>Une ancienne version existe-t-elle déjà sur Liquid+ ?</span>
          </label>
          <div class="docmodal__ver-fields" id="docmodal-ver-fields">
            <div class="docmodal__ver-callout">Oui : choisissez la version précédente ci-dessous, puis indiquez la nature de cette nouvelle version. Non : le fichier sera ajouté comme document distinct.</div>
            <label class="docmodal__dest-label" for="docmodal-ver-parent-search" style="margin-top:12px">Version précédente de ce document</label>
            <input class="docmodal__dest-select docmodal__ver-search" id="docmodal-ver-parent-search" type="search" placeholder="Rechercher la version précédente…" autocomplete="off" aria-label="Rechercher la version précédente" />
            <select class="docmodal__dest-select" id="docmodal-ver-parent"></select>
            <label class="docmodal__dest-label" for="docmodal-ver-type" style="margin-top:12px">Nature de cette nouvelle version</label>
            <select class="docmodal__dest-select" id="docmodal-ver-type">
              <option value="">— Choisir —</option>
              <option value="counterproposal">Contreproposition de négociation</option>
              <option value="revision">Révision personnelle</option>
              <option value="signed">Version signée</option>
            </select>
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
    fileInput.dataset.importHint || 'PDF, Word, OpenDocument, Google Docs, Excel ou image';

  const drop     = modal.querySelector('#docmodal-drop');
  const fileBox  = modal.querySelector('#docmodal-file');
  const fileName = modal.querySelector('#docmodal-file-name');
  const fileSize = modal.querySelector('#docmodal-file-size');
  const fileX    = modal.querySelector('#docmodal-file-x');
  const errBox   = modal.querySelector('#docmodal-error');
  const submit   = modal.querySelector('#docmodal-submit');
  const destBox  = modal.querySelector('#docmodal-dest');
  const destSel  = modal.querySelector('#docmodal-dest-select');
  const categoryBox = modal.querySelector('#docmodal-category');
  const categorySel = modal.querySelector('#docmodal-category-select');
  const verBox   = modal.querySelector('#docmodal-ver');
  const verCheck = modal.querySelector('#docmodal-ver-check');
  const verFields = modal.querySelector('#docmodal-ver-fields');
  const verType = modal.querySelector('#docmodal-ver-type');
  const verParentSearch = modal.querySelector('#docmodal-ver-parent-search');
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
  let importFolders = [];
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

  function updateSubmitState() {
    submit.disabled = busy || !selected || (editorImport && (!destSel.value || !categorySel.value));
  }

  const IMPORT_CATEGORY_DEFS = {
    confidentialite: [['presentation', 'Présentation investisseurs'], ['confidentialite', 'Confidentialité et accès data room']],
    'due-diligence-preliminaire': [['corporate-prelim', 'Corporate, capital et gouvernance'], ['strategie-prelim', 'Présentation, marché et organisation'], ['finance-prelim', 'Finance, comptabilité et dettes'], ['commercial-prelim', 'Clients, revenus et contrats commerciaux'], ['operations-prelim', 'Fournisseurs, partenaires et opérations'], ['social-prelim', 'Social, RH et management package'], ['ip-tech-prelim', 'Propriété intellectuelle, tech et données'], ['conformite-prelim', 'Réglementaire, conformité et risques'], ['actifs-prelim', 'Actifs, banques et engagements'], ['data-room-prelim', 'Data room, Q&A et suivi']],
    'term-sheet': [['accord-principal', 'Accord principal'], ['clauses-annexes', 'Clauses annexes']],
    'due-diligence': [['corporate', 'Corporate, capital et gouvernance'], ['finance', 'Finance, comptabilité et fiscalité'], ['social', 'Social, RH et management'], ['commercial', 'Clients, ventes et revenus'], ['operations', 'Fournisseurs, partenariats et opérations'], ['ip-tech', 'Propriété intellectuelle, produit et technologie'], ['data-security', 'RGPD, données et cybersécurité'], ['regulatory', 'Réglementaire et conformité sectorielle'], ['litigation', 'Contentieux, assurances et risques'], ['assets-esg', 'Immobilier, actifs matériels et ESG'], ['audit', 'Data room, Q&A et rapports d’audit'], ['autres', 'Autres documents demandés']],
    documentation: [['pacte-statuts', 'Pacte, statuts et gouvernance'], ['garanties-valeurs', 'Garanties et valeurs mobilières'], ['accords-investisseurs', 'Accords investisseurs']],
    closing: [['souscription-fonds', 'Souscription et versement des fonds'], ['decisions-sociales', 'Décisions sociales et autorisations'], ['statuts-pacte', 'Statuts, pacte et gouvernance'], ['registres-capital', 'Registres et capitalisation'], ['formalites', 'Formalités et dossier final']],
    'post-closing': [['reporting-covenants', 'Reporting et engagements'], ['formalites-post', 'Formalités post-closing']],
    gouvernance: [['gouvernance-sociale', 'Gouvernance sociale'], ['documents-reference', 'Documents de référence']],
    'air-preparation': [['societe-capital', 'Société et capital'], ['ip-management', 'PI et management package']],
    'air-termes': [['termes-economiques', 'Termes économiques et dilution']],
    'air-emission': [['decisions-sociales', 'Décisions sociales'], ['instrument-air', 'Instrument BSA-AIR']],
    'air-approche': [['confidentialite', 'Confidentialité'], ['presentation', 'Présentation investisseurs']],
    'air-souscription': [['souscription-investisseurs', 'Souscription investisseurs'], ['versement-fonds', 'Versement des fonds'], ['constatation-registres', 'Constatation et registres']],
    'air-suivi': [['reporting-suivi', 'Reporting et suivi des engagements']],
    'air-conversion': [['conversion-souscription', 'Conversion et souscription'], ['statuts-conversion', 'Statuts de conversion']],
  };

  function populateCategories() {
    const folder = importFolders.find((item) => String(item.id) === destSel.value);
    const categories = folder ? (IMPORT_CATEGORY_DEFS[folder.key] || []) : [];
    categorySel.innerHTML = '<option value="">— Choisir un dossier —</option>';
    categories.forEach(([key, title]) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = title;
      categorySel.appendChild(option);
    });
    if (folder) {
      const uncategorized = document.createElement('option');
      uncategorized.value = '__uncategorized__';
      uncategorized.textContent = 'Non classés';
      categorySel.appendChild(uncategorized);
    }
    categorySel.disabled = !folder;
    categoryBox.classList.toggle('is-shown', editorImport && !!folder);
    if (folder && !categories.length) showError('Aucun dossier n’est disponible dans cette étape.');
    updateSubmitState();
  }

  function filterVersionParents() {
    const normalize = (value) => String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
    const query = normalize(verParentSearch.value);
    const previousValue = verParent.value;
    const matches = verCtxDocs.filter((doc) => !query || normalize(doc.searchText).includes(query));
    verParent.innerHTML = '<option value="">— Choisir la version précédente —</option>';
    matches.forEach((doc) => {
      const option = document.createElement('option');
      option.value = String(doc.id);
      option.textContent = doc.label;
      verParent.appendChild(option);
    });
    if (matches.some((doc) => String(doc.id) === previousValue)) verParent.value = previousValue;
    if (!matches.length) {
      const option = document.createElement('option');
      option.disabled = true;
      option.textContent = 'Aucun document ne correspond à cette recherche';
      verParent.appendChild(option);
    }
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
    updateSubmitState();
  }

  function resetFile() {
    selected = null;
    fileInput.value = '';
    fileBox.classList.remove('is-shown');
    updateSubmitState();
  }

  // Remplit le sélecteur de destination avec les étapes du parcours actif,
  // fournies par la page. Dans l'éditeur, elles sont chargées directement et
  // le choix d'une étape est obligatoire avant l'import.
  async function populateDest() {
    destSel.innerHTML = editorImport
      ? '<option value="">— Choisir une étape —</option>'
      : '<option value="">— Non classé —</option>';
    destSel.required = editorImport;
    const destLabel = modal.querySelector('label[for="docmodal-dest-select"]');
    if (destLabel) destLabel.textContent = editorImport ? 'Ranger dans une étape *' : 'Ranger dans une étape';

    let ctx = null;
    try { ctx = typeof window.liquidImportDestinations === 'function' ? window.liquidImportDestinations() : null; } catch { ctx = null; }
    if (!ctx && editorImport) {
      try {
        const [foldersResponse, profileResponse] = await Promise.all([
          fetch('/api/saas/folders', { credentials: 'include' }),
          fetch('/api/saas/fundraising-profile', { credentials: 'include' }),
        ]);
        const foldersData = foldersResponse.ok ? await foldersResponse.json() : {};
        const profileData = profileResponse.ok ? await profileResponse.json() : {};
        const raiseType = (profileData.profile || {}).raise_type || 'classic';
        ctx = {
          folders: (Array.isArray(foldersData.folders) ? foldersData.folders : [])
            .filter((folder) => !folder.track || folder.track === raiseType)
            .map((folder) => ({ id: folder.id, name: folder.name, key: folder.key || '' })),
        };
      } catch { ctx = null; }
    }

    const folders = (ctx && Array.isArray(ctx.folders)) ? ctx.folders.filter((folder) => folder.key !== 'mise-en-ordre' && !/^\s*0\s*[·.-]/.test(folder.name || '')) : [];
    importFolders = folders;
    if (!folders.length) {
      destBox.classList.toggle('is-shown', editorImport);
      if (editorImport) showError('Impossible de charger les étapes. Fermez cette fenêtre puis réessayez.');
      updateSubmitState();
      return;
    }
    folders.forEach((f) => {
      const o = document.createElement('option');
      o.value = String(f.id);
      o.textContent = f.name;
      destSel.appendChild(o);
    });
    if (ctx && ctx.defaultFolderId != null) destSel.value = String(ctx.defaultFolderId);
    destBox.classList.add('is-shown');
    populateCategories();
    updateSubmitState();
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
    verParentSearch.value = '';
    let ctx = null;
    try { ctx = typeof window.liquidImportContext === 'function' ? window.liquidImportContext() : null; } catch { ctx = null; }
    // La version précédente peut être une version archivée ou appartenir à une
    // autre étape. On recharge donc la liste complète du compte, même si la page
    // courante fournit déjà un contexte filtré pour son propre affichage.
    try {
      const [docsResponse, investorsResponse] = await Promise.all([
        fetch('/api/saas/documents', { credentials: 'include' }),
        fetch('/api/saas/investors', { credentials: 'include' }),
      ]);
      const docsData = docsResponse.ok ? await docsResponse.json() : {};
      const investorsData = investorsResponse.ok ? await investorsResponse.json() : {};
      ctx = {
        documents: Array.isArray(docsData.documents) ? docsData.documents : (ctx?.documents || []),
        investors: Array.isArray(investorsData.investors) ? investorsData.investors : (ctx?.investors || []),
      };
    } catch { /* le contexte fourni par la page reste utilisable hors ligne */ }
    verCtxDocs = ((ctx && Array.isArray(ctx.documents)) ? ctx.documents : [])
      .slice()
      .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
      .map((doc) => {
        const dateValue = doc.updated_at || doc.created_at;
        const date = dateValue ? new Date(dateValue).toLocaleDateString('fr-FR') : '';
        const suffix = [doc.is_version ? 'ancienne version' : '', date].filter(Boolean).join(' · ');
        const label = (doc.name || doc.originalname || 'Document sans titre') + (suffix ? ' — ' + suffix : '');
        return { ...doc, label, searchText: label.toLocaleLowerCase() };
      });
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

    if (!verCtxDocs.length) {
      verParent.innerHTML = '<option value="">Aucune version précédente disponible</option>';
      verParent.disabled = true;
      verBox.classList.add('is-shown');
      return;
    }
    verParent.disabled = false;
    filterVersionParents();
    verBox.classList.add('is-shown');
  }

  function hideNudge() { nudgeBox.classList.remove('is-shown'); pendingNudge = null; }

  async function openModal() {
    clearError();
    resetFile();
    hideNudge();
    modal.classList.add('is-open');
    drop.focus();
    await Promise.all([populateDest(), populateVersionCtx()]);
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
  ['input', 'search', 'keyup'].forEach((eventName) => {
    verParentSearch.addEventListener(eventName, filterVersionParents);
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
  destSel.addEventListener('change', () => {
    clearError();
    populateCategories();
  });
  categorySel.addEventListener('change', () => { clearError(); updateSubmitState(); });

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
    if (editorImport && !destSel.value) {
      showError('Choisissez l’étape dans laquelle ranger ce document.');
      destSel.focus();
      return;
    }
    if (editorImport && !categorySel.value) {
      showError('Choisissez le dossier de l’étape dans lequel ranger ce document.');
      categorySel.focus();
      return;
    }
    const versionRequested = verBox.classList.contains('is-shown') && verCheck.checked;
    if (versionRequested && !verParent.value) {
      showError('Choisissez la version précédente de ce document.');
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
    if (editorImport && categorySel.value && categorySel.value !== '__uncategorized__') fd.append('category_key', categorySel.value);
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
        // Depuis l'éditeur, l'import Word est immédiatement converti en document
        // éditable puis ouvert dans la page courante.
        if (editorImport && data.document && data.document.id) {
          submit.textContent = 'Ouverture…';
          busy = true;
          updateSubmitState();
          const editorResponse = await fetch('/api/saas/documents/' + data.document.id + '/to-editor', {
            method: 'POST', credentials: 'include',
          });
          const editorData = await editorResponse.json().catch(() => ({}));
          if (!editorResponse.ok || !editorData.id) {
            busy = false;
            submit.textContent = 'Téléverser';
            updateSubmitState();
            showError(editorData.error || 'Le document a été importé, mais son ouverture dans l’éditeur a échoué.');
            return;
          }
          window.location.href = 'editor.html?doc=' + encodeURIComponent(editorData.id);
          return;
        }
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
