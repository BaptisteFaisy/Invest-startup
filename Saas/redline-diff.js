/* =========================================================
   liquid + — Moteur de « redline » (fidélité différentielle)
   Compare deux états d'un document de l'éditeur (HTML clausé
   .ts-clause / .ts-label / .ts-content) et produit :
   - le document annoté <ins>/<del> mot à mot, clause par clause ;
   - le récapitulatif des modifications (statut par clause).
   Module partagé : chargé par le navigateur (window.RedlineDiff)
   ET par le serveur Node (require) pour l'export DOCX/PDF.
   ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RedlineDiff = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- Utilitaires texte ---------- */
  function stripTags(html) {
    return String(html || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function normText(html) { return stripTags(html).toLowerCase(); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- Tokenisation : balise | espace | mot ---------- */
  // Les balises restent des jetons insécables : le diff ne casse jamais le HTML.
  function tokenize(html) {
    const s = String(html || '');
    const tokens = [];
    const re = /<[^>]+>|\s+|[^<\s]+/g;
    let m;
    while ((m = re.exec(s))) tokens.push(m[0]);
    return tokens;
  }
  const isTag = t => t.charCodeAt(0) === 60; /* '<' */
  const isWs  = t => !isTag(t) && !/\S/.test(t);
  // Clé d'égalité : les espaces sont interchangeables entre eux.
  const tkey  = t => (isWs(t) ? ' ' : t);

  /* ---------- Diff LCS (plus longue sous-séquence commune) ---------- */
  // Renvoie une liste d'opérations fusionnées : {type:'eq'|'del'|'ins', tokens:[…]}.
  function diffTokens(a, b) {
    // Préfixe / suffixe communs retirés d'abord (rapide et borne le DP).
    let start = 0;
    while (start < a.length && start < b.length && tkey(a[start]) === tkey(b[start])) start++;
    let endA = a.length, endB = b.length;
    while (endA > start && endB > start && tkey(a[endA - 1]) === tkey(b[endB - 1])) { endA--; endB--; }

    const ops = [];
    const push = (type, tokens) => {
      if (!tokens.length) return;
      const last = ops[ops.length - 1];
      if (last && last.type === type) last.tokens.push(...tokens);
      else ops.push({ type, tokens: tokens.slice() });
    };
    if (start) push('eq', b.slice(0, start));
    lcsOps(a.slice(start, endA), b.slice(start, endB), push);
    if (endA < a.length) push('eq', b.slice(endB));
    return ops;
  }

  function lcsOps(a, b, push) {
    const n = a.length, m = b.length;
    if (!n && !m) return;
    if (!n) return push('ins', b);
    if (!m) return push('del', a);
    // Garde-fou mémoire : au-delà, remplacement en bloc (cas pathologique).
    if (n * m > 4000000) { push('del', a); push('ins', b); return; }

    const ka = a.map(tkey), kb = b.map(tkey);
    const cols = m + 1;
    const dp = new Uint32Array((n + 1) * cols);
    for (let i = n - 1; i >= 0; i--) {
      const row = i * cols, next = (i + 1) * cols;
      for (let j = m - 1; j >= 0; j--) {
        dp[row + j] = ka[i] === kb[j]
          ? dp[next + j + 1] + 1
          : Math.max(dp[next + j], dp[row + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (ka[i] === kb[j]) { push('eq', [b[j]]); i++; j++; }
      else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) { push('del', [a[i]]); i++; }
      else { push('ins', [b[j]]); j++; }
    }
    if (i < n) push('del', a.slice(i));
    if (j < m) push('ins', b.slice(j));
  }

  /* ---------- Rendu <ins>/<del> ---------- */
  // Les balises de structure (p, ul, table…) ne sont jamais enfermées dans
  // <ins>/<del> : seuls le texte et les balises « vides » (br, img) le sont.
  // Un paragraphe supprimé garde donc son <p>, avec son texte barré.
  function renderOps(ops) {
    let out = '';
    let insWords = 0, delWords = 0;
    for (const op of ops) {
      if (op.type === 'eq') { out += op.tokens.join(''); continue; }
      const el = op.type === 'del' ? 'del' : 'ins';
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const seg = run.join('');
        out += /\S/.test(stripTags(seg)) || /<(img|br|hr)\b/i.test(seg)
          ? `<${el} class="rl-${op.type}">${seg}</${el}>`
          : seg; /* espaces seuls : pas de marquage */
        run = [];
      };
      for (const t of op.tokens) {
        if (isTag(t) && !/^<(img|br|hr)\b/i.test(t)) { flush(); out += t; }
        else {
          run.push(t);
          if (!isTag(t) && !isWs(t)) { if (op.type === 'del') delWords++; else insWords++; }
        }
      }
      flush();
    }
    return { html: out, ins: insWords, del: delWords };
  }

  // Diff HTML → HTML annoté + volumes de mots insérés / supprimés.
  function diffHtml(oldHtml, newHtml) {
    if (String(oldHtml || '') === String(newHtml || ''))
      return { html: String(newHtml || ''), ins: 0, del: 0 };
    return renderOps(diffTokens(tokenize(oldHtml), tokenize(newHtml)));
  }

  /* ---------- Découpage d'une page éditeur en blocs de premier niveau ---------- */
  const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'col', 'wbr', 'area', 'source']);
  function topBlocks(html) {
    const s = String(html || '');
    const blocks = [];
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
    let depth = 0, start = -1, m;
    while ((m = re.exec(s))) {
      const name = m[2].toLowerCase();
      if (VOID_TAGS.has(name) || m[3] === '/') {
        if (depth === 0) blocks.push(m[0]);
        continue;
      }
      if (m[1] !== '/') { if (depth === 0) start = m.index; depth++; }
      else {
        depth--;
        if (depth === 0 && start >= 0) { blocks.push(s.slice(start, m.index + m[0].length)); start = -1; }
        if (depth < 0) depth = 0;
      }
    }
    return blocks;
  }

  function attrOf(openTag, name) {
    const m = new RegExp(name + '="([^"]*)"', 'i').exec(openTag);
    return m ? m[1] : '';
  }
  function hasClass(openTag, cls) {
    const c = attrOf(openTag, 'class');
    return (' ' + c + ' ').indexOf(' ' + cls + ' ') !== -1;
  }
  function openTagOf(block) {
    const m = /^<[a-zA-Z][^>]*>/.exec(block);
    return m ? m[0] : '';
  }
  function innerOf(block) {
    const open = openTagOf(block);
    const closeIdx = block.lastIndexOf('</');
    if (!open || closeIdx < 0) return block;
    return block.slice(open.length, closeIdx);
  }

  // Premier <div class="…cls…"> ENFANT direct d'un bloc, avec son contenu.
  function childDiv(blockInner, cls) {
    const re = /<(\/?)div\b[^>]*?>/gi;
    let depth = 0, m, start = -1, open = '';
    while ((m = re.exec(blockInner))) {
      if (m[1] !== '/') {
        if (depth === 0 && hasClass(m[0], cls)) { start = m.index; open = m[0]; }
        depth++;
      } else {
        depth--;
        if (depth === 0 && start >= 0) {
          const outer = blockInner.slice(start, m.index + m[0].length);
          return { outer, open, inner: blockInner.slice(start + open.length, m.index) };
        }
      }
    }
    return null;
  }

  /* ---------- Lecture structurée d'un document de l'éditeur ---------- */
  // Renvoie la liste ordonnée des éléments : titre, sous-titre, sections
  // (ts-group), clauses (ts-clause), scripts techniques et blocs libres.
  function parseEditorDoc(html) {
    const items = [];
    for (const block of topBlocks(html)) {
      const open = openTagOf(block);
      if (/^<h1\b/i.test(open) && hasClass(open, 'doc-title')) {
        items.push({ type: 'title', html: block, inner: innerOf(block) });
      } else if (/^<p\b/i.test(open) && hasClass(open, 'doc-sub')) {
        items.push({ type: 'sub', html: block, inner: innerOf(block) });
      } else if (/^<div\b/i.test(open) && hasClass(open, 'ts-group')) {
        items.push({ type: 'group', html: block, text: stripTags(block) });
      } else if (/^<div\b/i.test(open) && hasClass(open, 'ts-clause')) {
        const inner = innerOf(block);
        const label = childDiv(inner, 'ts-label');
        const content = childDiv(inner, 'ts-content');
        items.push({
          type: 'clause', html: block, openTag: open,
          key:  attrOf(open, 'data-key'),
          skey: attrOf(open, 'data-skey'),
          label: label ? stripTags(label.inner) : '',
          labelInner: label ? label.inner : '',
          content: content ? content.inner : inner,
          contentOpen: content ? content.open : '<div class="ts-content">',
          labelOpen: label ? label.open : '<div class="ts-label">',
        });
      } else if (/^<script\b/i.test(open)) {
        items.push({ type: 'script', html: block });
      } else {
        items.push({ type: 'other', html: block, text: stripTags(block) });
      }
    }
    return items;
  }

  /* ---------- Redline document entier ---------- */
  // Marqueur de statut porté par la clause : data-rl (les classes CSS de
  // l'éditeur et les regex d'export exigent class="ts-clause" inchangée).
  function withRl(openTag, status) {
    const cleaned = openTag.replace(/\sdata-rl="[^"]*"/i, '');
    return cleaned.replace(/>$/, ` data-rl="${status}">`);
  }

  function clauseChangeEntry(bClause, aClause, status, d) {
    return {
      key: (bClause || aClause).key || '',
      skey: (bClause || aClause).skey || '',
      label: (bClause || aClause).label || 'Clause',
      oldLabel: aClause ? aClause.label : '',
      status,
      ins: d ? d.ins : 0,
      del: d ? d.del : 0,
    };
  }

  // Compare la version de référence (oldHtml — document reçu / importé) et la
  // version de travail (newHtml). Renvoie { html, changes, stats }.
  function diffEditorDocs(oldHtml, newHtml) {
    const A = parseEditorDoc(oldHtml);
    const B = parseEditorDoc(newHtml);
    const aClauses = A.filter(x => x.type === 'clause');
    const bClauses = B.filter(x => x.type === 'clause');

    // Appariement : d'abord par data-key (stable depuis l'import), puis par
    // libellé normalisé pour les clauses recréées.
    const pairOfB = new Map(), usedA = new Set();
    const aByKey = new Map();
    aClauses.forEach(a => { if (a.key && !aByKey.has(a.key)) aByKey.set(a.key, a); });
    bClauses.forEach(b => {
      const a = b.key && aByKey.get(b.key);
      if (a && !usedA.has(a)) { pairOfB.set(b, a); usedA.add(a); }
    });
    bClauses.forEach(b => {
      if (pairOfB.has(b)) return;
      const nb = normText(b.labelInner || b.label);
      if (!nb) return;
      const a = aClauses.find(x => !usedA.has(x) && normText(x.labelInner || x.label) === nb);
      if (a) { pairOfB.set(b, a); usedA.add(a); }
    });

    // Clauses supprimées : réinsérées à leur position d'origine (après la
    // dernière clause précédente encore présente).
    const removedAfter = new Map(); // aClause appariée -> [clauses supprimées]
    const removedFirst = [];
    let lastPaired = null;
    aClauses.forEach(a => {
      if (usedA.has(a)) { lastPaired = a; return; }
      if (lastPaired) {
        if (!removedAfter.has(lastPaired)) removedAfter.set(lastPaired, []);
        removedAfter.get(lastPaired).push(a);
      } else removedFirst.push(a);
    });

    const changes = [];
    const out = [];

    function emitRemoved(a) {
      const dl = diffHtml(a.labelInner || escapeHtml(a.label), '');
      const dc = diffHtml(a.content, '');
      out.push(
        withRl(a.openTag, 'removed') +
        a.labelOpen + dl.html + '</div>' +
        a.contentOpen + dc.html + '</div>' +
        '</div>'
      );
      changes.push(clauseChangeEntry(null, a, 'removed', { ins: 0, del: dc.del + dl.del }));
    }

    function emitClause(b) {
      // Les clauses supprimées AVANT la première clause conservée s'affichent
      // en tête, à leur place d'origine.
      if (removedFirst.length) {
        removedFirst.forEach(emitRemoved);
        removedFirst.length = 0;
      }
      const a = pairOfB.get(b);
      if (!a) {
        const dl = diffHtml('', b.labelInner || escapeHtml(b.label));
        const dc = diffHtml('', b.content);
        out.push(
          withRl(b.openTag, 'added') +
          b.labelOpen + dl.html + '</div>' +
          b.contentOpen + dc.html + '</div>' +
          '</div>'
        );
        changes.push(clauseChangeEntry(b, null, 'added', { ins: dc.ins + dl.ins, del: 0 }));
        return;
      }
      const sameLabel = normText(a.labelInner || a.label) === normText(b.labelInner || b.label);
      const sameBody  = normText(a.content) === normText(b.content);
      if (sameLabel && sameBody) {
        out.push(
          withRl(b.openTag, 'unchanged') +
          b.labelOpen + b.labelInner + '</div>' +
          b.contentOpen + b.content + '</div>' +
          '</div>'
        );
        changes.push(clauseChangeEntry(b, a, 'unchanged', null));
      } else {
        const dl = sameLabel
          ? { html: b.labelInner, ins: 0, del: 0 }
          : diffHtml(a.labelInner || escapeHtml(a.label), b.labelInner || escapeHtml(b.label));
        const dc = sameBody
          ? { html: b.content, ins: 0, del: 0 }
          : diffHtml(a.content, b.content);
        out.push(
          withRl(b.openTag, 'modified') +
          b.labelOpen + dl.html + '</div>' +
          b.contentOpen + dc.html + '</div>' +
          '</div>'
        );
        changes.push(clauseChangeEntry(b, a, 'modified', { ins: dc.ins + dl.ins, del: dc.del + dl.del }));
      }
      const rem = removedAfter.get(a);
      if (rem) rem.forEach(emitRemoved);
    }

    const aTitle = A.find(x => x.type === 'title');
    const aSub   = A.find(x => x.type === 'sub');
    B.forEach(item => {
      if (item.type === 'clause') return emitClause(item);
      if (item.type === 'title' && aTitle) {
        return out.push('<h1 class="doc-title">' + diffHtml(aTitle.inner, item.inner).html + '</h1>');
      }
      if (item.type === 'sub' && aSub) {
        return out.push('<p class="doc-sub">' + diffHtml(aSub.inner, item.inner).html + '</p>');
      }
      out.push(item.html);
    });
    // Document réduit à zéro clause conservée : les suppressions restent visibles.
    if (removedFirst.length) { removedFirst.forEach(emitRemoved); removedFirst.length = 0; }

    const stats = { modified: 0, added: 0, removed: 0, unchanged: 0, ins: 0, del: 0 };
    changes.forEach(c => { stats[c.status]++; stats.ins += c.ins; stats.del += c.del; });
    return { html: out.join('\n'), changes, stats };
  }

  /* ---------- Récapitulatif clause par clause (annexe) ---------- */
  const STATUS_FR = { modified: 'Modifiée', added: 'Ajoutée', removed: 'Supprimée', unchanged: 'Inchangée' };
  function amplitude(c) {
    if (c.status === 'unchanged') return '—';
    const parts = [];
    if (c.ins) parts.push('+' + c.ins + ' mot' + (c.ins > 1 ? 's' : ''));
    if (c.del) parts.push('−' + c.del + ' mot' + (c.del > 1 ? 's' : ''));
    return parts.join(' / ') || '—';
  }

  // Annexe HTML « Récapitulatif des modifications » : intégrée à la vue redline
  // de l'éditeur ET à l'export. Les clauses inchangées sont comptées, pas listées.
  function changesAnnexHtml(changes, opts) {
    const o = opts || {};
    const touched = changes.filter(c => c.status !== 'unchanged');
    const untouched = changes.length - touched.length;
    const intro = o.intro ||
      'Contreproposition établie à partir du document de référence. ' +
      'Les insertions apparaissent <ins class="rl-ins">soulignées</ins>, les suppressions <del class="rl-del">barrées</del>. ' +
      'La structure et la numérotation du document d’origine sont conservées.';
    let rows = '';
    touched.forEach(c => {
      rows += '<tr>' +
        `<td>${escapeHtml(c.label)}${c.oldLabel && c.oldLabel !== c.label ? ' <span class="rl-annex__was">(anciennement : ' + escapeHtml(c.oldLabel) + ')</span>' : ''}</td>` +
        `<td>${STATUS_FR[c.status] || c.status}</td>` +
        `<td>${amplitude(c)}</td>` +
        '</tr>';
    });
    const empty = !touched.length
      ? '<p class="rl-annex__empty">Aucune modification par rapport au document de référence.</p>' : '';
    const table = touched.length
      ? '<table class="rl-annex__table"><thead><tr><th>Clause</th><th>Statut</th><th>Ampleur</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '';
    return '<div class="rl-annex" contenteditable="false">' +
      '<h2 class="rl-annex__title">Récapitulatif des modifications</h2>' +
      '<p class="rl-annex__intro">' + intro + '</p>' +
      empty + table +
      (untouched > 0 ? `<p class="rl-annex__rest">${untouched} clause${untouched > 1 ? 's' : ''} inchangée${untouched > 1 ? 's' : ''}.</p>` : '') +
      '</div>';
  }

  return { diffHtml, parseEditorDoc, diffEditorDocs, changesAnnexHtml, stripTags, STATUS_FR, amplitude };
});
