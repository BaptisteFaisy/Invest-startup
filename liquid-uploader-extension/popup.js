/* Extension liquid + — upload de documents par glisser-déposer.
   Auth par token JWT (Bearer) obtenu via /api/auth/login ; le token est stocké
   dans chrome.storage.local. Les fichiers partent vers /api/saas/documents,
   le même endpoint que la page « Mes documents » du site. */

const DEFAULT_BASE = 'http://localhost:3000';
const ACCEPT = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'];

const $ = id => document.getElementById(id);
const store = {
  get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
  set: obj => new Promise(r => chrome.storage.local.set(obj, r)),
  remove: keys => new Promise(r => chrome.storage.local.remove(keys, r)),
};

let baseUrl = DEFAULT_BASE;
let token = null;
let tempToken = null;

/* ---------- Helpers ---------- */
function setStatus(el, msg, kind = 'info') {
  el.hidden = false;
  el.textContent = msg;
  el.className = 'status status--' + kind;
}
function clearStatus(el) { el.hidden = true; el.textContent = ''; }

function api(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (!isForm && body) headers['Content-Type'] = 'application/json';
  return fetch(baseUrl.replace(/\/$/, '') + path, {
    method,
    headers,
    body: isForm ? body : (body ? JSON.stringify(body) : undefined),
  });
}

function showView(which) {
  $('view-auth').hidden = which !== 'auth';
  $('view-main').hidden = which !== 'main';
}

/* ---------- Démarrage ---------- */
async function init() {
  const data = await store.get(['baseUrl', 'token']);
  baseUrl = data.baseUrl || DEFAULT_BASE;
  token = data.token || null;
  $('base-url').value = baseUrl;

  if (token) {
    // Vérifie que le token est encore valide.
    try {
      const res = await api('/api/auth/me');
      if (res.ok) {
        const me = await res.json();
        $('account-email').textContent = (me.user && me.user.email) || me.email || '';
        showView('main');
        loadRecent();
        return;
      }
    } catch {}
    token = null;
    await store.remove('token');
  }
  showView('auth');
}

/* ---------- Réglages ---------- */
$('settings-toggle').addEventListener('click', () => {
  $('settings').hidden = !$('settings').hidden;
});
$('settings-save').addEventListener('click', async () => {
  baseUrl = ($('base-url').value || DEFAULT_BASE).trim();
  await store.set({ baseUrl });
  $('settings').hidden = true;
});

/* ---------- Connexion ---------- */
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = $('auth-status');
  const btn = $('login-btn');
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const code = $('login-2fa').value.trim();

  btn.disabled = true;
  setStatus(status, 'Connexion…', 'info');

  try {
    let res, data;
    if (tempToken) {
      // 2ᵉ étape : vérification du code 2FA.
      res = await api('/api/auth/2fa/verify', { method: 'POST', body: { tempToken, code } });
      data = await res.json();
    } else {
      res = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      data = await res.json();
      if (res.ok && data.requires2FA) {
        tempToken = data.tempToken;
        $('twofa-field').hidden = false;
        $('login-2fa').focus();
        setStatus(status, 'Entrez le code à 6 chiffres de votre application.', 'info');
        btn.disabled = false;
        return;
      }
    }

    if (!res.ok || !data.token) {
      setStatus(status, data.error || 'Connexion impossible.', 'err');
      btn.disabled = false;
      return;
    }

    token = data.token;
    tempToken = null;
    await store.set({ token });
    $('account-email').textContent = (data.user && data.user.email) || email;
    $('twofa-field').hidden = true;
    $('login-2fa').value = '';
    clearStatus(status);
    showView('main');
    loadRecent();
  } catch {
    setStatus(status, 'Impossible de joindre le serveur. Vérifiez l\'URL dans ⚙.', 'err');
  } finally {
    btn.disabled = false;
  }
});

$('logout-btn').addEventListener('click', async () => {
  token = null;
  tempToken = null;
  await store.remove('token');
  showView('auth');
});

/* ---------- Glisser-déposer + upload ---------- */
const dropzone = $('dropzone');
const fileInput = $('file-input');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { if (fileInput.files.length) uploadFiles(fileInput.files); fileInput.value = ''; });

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('is-drag'); }));
['dragleave', 'dragend'].forEach(ev =>
  dropzone.addEventListener(ev, () => dropzone.classList.remove('is-drag')));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-drag');
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

function accepted(file) {
  const name = (file.name || '').toLowerCase();
  return ACCEPT.some(ext => name.endsWith(ext));
}

async function uploadFiles(fileList) {
  const status = $('upload-status');
  const files = Array.from(fileList);
  let ok = 0, fail = 0;

  for (const file of files) {
    if (!accepted(file)) {
      fail++;
      setStatus(status, `« ${file.name} » : format non supporté.`, 'err');
      continue;
    }
    setStatus(status, `Envoi de « ${file.name} »…`, 'info');
    try {
      const form = new FormData();
      form.append('file', file, file.name);
      form.append('name', file.name);
      const res = await api('/api/saas/documents', { method: 'POST', body: form, isForm: true });
      if (res.ok) {
        ok++;
      } else {
        fail++;
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) {
          setStatus(status, 'Session expirée — reconnectez-vous.', 'err');
          token = null; await store.remove('token'); showView('auth');
          return;
        }
        setStatus(status, data.error || `Échec de l'envoi de « ${file.name} ».`, 'err');
      }
    } catch {
      fail++;
      setStatus(status, 'Impossible de joindre le serveur.', 'err');
    }
  }

  if (ok) {
    setStatus(status, `${ok} fichier${ok > 1 ? 's' : ''} ajouté${ok > 1 ? 's' : ''} à votre espace${fail ? ` · ${fail} échec(s)` : ''}.`, fail ? 'err' : 'ok');
    loadRecent();
  }
}

/* ---------- Documents récents ---------- */
async function loadRecent() {
  const list = $('recent-list');
  list.innerHTML = '';
  try {
    const res = await api('/api/saas/documents');
    if (!res.ok) return;
    const data = await res.json();
    const docs = (data.documents || data || []).slice(0, 8);
    if (!docs.length) {
      list.innerHTML = '<li class="recent__empty">Aucun document pour le moment.</li>';
      return;
    }
    list.innerHTML = docs.map(d => {
      const kb = d.size ? Math.max(1, Math.round(d.size / 1024)) + ' Ko' : '';
      return `<li><span class="name">${escapeHtml(d.name || d.originalname || 'Document')}</span><span class="meta">${kb}</span></li>`;
    }).join('');
  } catch {}
}

$('refresh-btn').addEventListener('click', loadRecent);

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

init();
