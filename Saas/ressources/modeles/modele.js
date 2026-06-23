/* =========================================================
   liquid + — Édition en place des modèles juridiques
   Ajoute une barre d'outils à chaque modèle :
     • Éditer  : rend le document modifiable (contenteditable)
     • Imprimer / PDF : impression navigateur (→ PDF)
     • Télécharger : enregistre le document édité en .html
   Les modifications sont sauvegardées automatiquement dans
   le navigateur (localStorage), par modèle.
   ========================================================= */
(function () {
  const doc = document.querySelector('.doc');
  if (!doc) return;

  const KEY = 'liquidplus:modele:' + location.pathname;

  // Restaure une version éditée précédemment.
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) doc.innerHTML = saved;
  } catch (_) {}

  // ---- Barre d'outils ----
  const bar = document.createElement('div');
  bar.className = 'mbar no-print';
  bar.innerHTML = `
    <button type="button" id="m-edit">✎ Activer l'édition</button>
    <button type="button" id="m-print">🖨 Imprimer / PDF</button>
    <button type="button" id="m-dl">⤓ Télécharger</button>
    <span class="mbar__state" id="m-state"></span>`;
  document.body.insertBefore(bar, document.body.firstChild);

  const css = document.createElement('style');
  css.textContent = `
    .mbar{position:sticky;top:0;z-index:50;display:flex;gap:8px;align-items:center;
      background:#14171f;color:#f4f2ee;padding:10px 16px;font-family:'Archivo',sans-serif;font-size:13px}
    .mbar button{font:600 13px/1 'Archivo',sans-serif;color:#14171f;background:#f4f2ee;border:0;
      border-radius:8px;padding:8px 12px;cursor:pointer}
    .mbar button:hover{background:#fff}
    .mbar button.is-on{background:#1f8e7a;color:#fff}
    .mbar__state{margin-left:auto;font-size:12px;color:#9aa0ad}
    .doc[contenteditable="true"]{outline:2px dashed #1f8e7a;outline-offset:8px}
    .doc[contenteditable="true"] .fill{background:#fff3d6;border-radius:3px;padding:0 2px}
  `;
  document.head.appendChild(css);

  const editBtn  = bar.querySelector('#m-edit');
  const printBtn = bar.querySelector('#m-print');
  const dlBtn    = bar.querySelector('#m-dl');
  const stateEl  = bar.querySelector('#m-state');

  let saveTimer = null;
  function persist() {
    try { localStorage.setItem(KEY, doc.innerHTML); stateEl.textContent = 'Enregistré ' + new Date().toLocaleTimeString('fr-FR'); }
    catch (_) { stateEl.textContent = ''; }
  }

  editBtn.addEventListener('click', () => {
    const on = doc.getAttribute('contenteditable') !== 'true';
    doc.setAttribute('contenteditable', on ? 'true' : 'false');
    editBtn.classList.toggle('is-on', on);
    editBtn.textContent = on ? '✓ Édition active' : "✎ Activer l'édition";
    stateEl.textContent = on ? 'Cliquez dans le texte pour modifier · enregistrement auto' : '';
    if (on) doc.focus();
  });

  doc.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 600);
  });

  printBtn.addEventListener('click', () => window.print());

  dlBtn.addEventListener('click', () => {
    const title = (document.title || 'modele').replace(/[^a-zA-Z0-9._-]+/g, '_');
    const html = '<!DOCTYPE html>\n<html lang="fr"><head><meta charset="UTF-8">' +
      '<title>' + document.title + '</title>' +
      '<link rel="stylesheet" href="modele.css"></head><body>' +
      doc.outerHTML + '</body></html>';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + '.html';
    a.click();
    URL.revokeObjectURL(a.href);
  });
})();
