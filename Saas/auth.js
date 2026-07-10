// Helpers d'authentification partagés — le SaaS s'appuie sur le backend
// invest-startup (même origine /api/auth/*), donc même base utilisateurs.

async function fetchMe() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.user || null;
  } catch {
    return null;
  }
}

async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
  window.location.href = '/index.html';
}

function hasAccountType(user) {
  return !!(user && Array.isArray(user.account_types) && user.account_types.length);
}

// Garde de page : redirige vers la connexion si l'utilisateur n'est pas authentifié.
async function requireAuth(redirect = 'login.html', options = {}) {
  const user = await fetchMe();
  if (!user) { window.location.replace(redirect); return null; }
  if (options.requireAccountType && !user.is_admin && !hasAccountType(user)) {
    window.location.replace(options.onboarding || 'onboarding.html');
    return null;
  }
  return user;
}

// Met à jour la barre de navigation de la landing selon l'état de connexion.
async function refreshNav() {
  const loginLink = document.getElementById('nav-login');
  const ctaBtn    = document.getElementById('nav-cta-primary');
  if (!loginLink && !ctaBtn) return;
  const user = await fetchMe();
  if (!user) return;
  if (loginLink) {
    loginLink.textContent = 'Déconnexion';
    loginLink.href = '#';
    loginLink.addEventListener('click', (e) => { e.preventDefault(); logout(); });
  }
  if (ctaBtn) {
    ctaBtn.textContent = 'Mon espace';
    ctaBtn.href = 'dossiers.html';
  }
}
