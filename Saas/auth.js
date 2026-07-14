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
  if (user.access?.blocked) {
    showFounderPaywall();
    return null;
  }
  if (options.requireAccountType && !user.is_admin && !hasAccountType(user)) {
    window.location.replace(options.onboarding || 'onboarding.html');
    return null;
  }
  return user;
}

function showFounderPaywall() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', showFounderPaywall, { once: true });
    return;
  }
  if (document.getElementById('liquid-founder-paywall')) return;
  const style = document.createElement('style');
  style.textContent = `
    body.liquid-paywall-open > *:not(#liquid-founder-paywall):not(script):not(style){filter:blur(8px);pointer-events:none;user-select:none}
    body.liquid-paywall-open{overflow:hidden}
    #liquid-founder-paywall{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:22px;background:rgba(0,24,57,.42);font-family:Arial,sans-serif}
    .liquid-paywall__box{width:min(780px,100%);max-height:calc(100vh - 44px);overflow:auto;background:#fff;border-radius:20px;padding:30px;box-shadow:0 28px 90px rgba(0,0,0,.35);color:#101828}
    .liquid-paywall__eyebrow{color:#087f6c;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.liquid-paywall__box h2{margin:9px 0;font-size:30px}.liquid-paywall__lead{margin:0;color:#667085;line-height:1.55}
    .liquid-paywall__plans{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:24px}.liquid-paywall__plan{padding:20px;border:1px solid #e4e7ec;border-radius:14px}.liquid-paywall__plan--main{border:2px solid #2de0bc}.liquid-paywall__plan h3{margin:8px 0}.liquid-paywall__price{font-size:23px;font-weight:800}.liquid-paywall__plan ul{padding-left:18px;color:#475467;line-height:1.6}
    .liquid-paywall__choose{width:100%;padding:12px;border:0;border-radius:9px;background:#001839;color:#fff;font-weight:800;cursor:pointer}.liquid-paywall__plan--main .liquid-paywall__choose{background:#087f6c}.liquid-paywall__message{min-height:20px;margin-top:14px;color:#b42318;text-align:center}.liquid-paywall__logout{display:block;margin:12px auto 0;border:0;background:none;color:#667085;text-decoration:underline;cursor:pointer}@media(max-width:650px){.liquid-paywall__plans{grid-template-columns:1fr}.liquid-paywall__box{padding:22px}.liquid-paywall__box h2{font-size:25px}}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'liquid-founder-paywall';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `<div class="liquid-paywall__box"><div class="liquid-paywall__eyebrow">Vos 2 heures d’essai gratuit sont terminées</div><h2>Choisissez votre offre pour continuer.</h2><p class="liquid-paywall__lead">Votre travail est conservé, mais aucune action ni aucun export n’est possible avant l’activation de votre offre.</p><div class="liquid-paywall__plans"><article class="liquid-paywall__plan liquid-paywall__plan--main"><h3>Liquid+</h3><div class="liquid-paywall__price">700 € HT</div><ul><li>Plateforme, IA et data room</li><li>Documents, simulations et exports</li><li>Suivi jusqu’au closing</li></ul><button class="liquid-paywall__choose" data-liquid-plan="plateforme">Choisir cette offre</button></article><article class="liquid-paywall__plan"><h3>Liquid+ avec avocat</h3><div class="liquid-paywall__price">Sur mesure</div><ul><li>Tout Liquid+</li><li>Relecture des actes sélectionnés</li><li>Avocat partenaire</li></ul><button class="liquid-paywall__choose" data-liquid-plan="accompagnement">Choisir cette offre</button></article></div><div class="liquid-paywall__message" role="alert"></div><button class="liquid-paywall__logout">Se déconnecter</button></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('liquid-paywall-open');
  overlay.querySelectorAll('[data-liquid-plan]').forEach((button) => button.addEventListener('click', async () => {
    const message = overlay.querySelector('.liquid-paywall__message');
    message.textContent = '';
    button.disabled = true;
    try {
      const response = await fetch('/api/billing/checkout', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: button.dataset.liquidPlan }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Paiement indisponible');
      window.location.href = data.checkout_url;
    } catch (error) {
      message.textContent = error.message + ' Vous pouvez aussi nous écrire à liquidplus.contact@gmail.com.';
      button.disabled = false;
    }
  }));
  overlay.querySelector('.liquid-paywall__logout').addEventListener('click', logout);
  overlay.querySelector('.liquid-paywall__choose')?.focus();
}

function enableFounderCopyProtection() {
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', enableFounderCopyProtection, { once: true });
    return;
  }
  if (document.documentElement.dataset.liquidCopyProtected === 'true') return;
  document.documentElement.dataset.liquidCopyProtected = 'true';
  const style = document.createElement('style');
  style.textContent = `html[data-liquid-copy-protected="true"] body{user-select:text!important;-webkit-user-select:text!important} .liquid-copy-notice{position:fixed;z-index:2147483646;left:50%;bottom:24px;transform:translateX(-50%);padding:10px 16px;border-radius:999px;background:#001839;color:#fff;font:600 13px Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2);opacity:0;transition:opacity .18s;pointer-events:none}.liquid-copy-notice.is-visible{opacity:1}`;
  document.head.appendChild(style);
  const notice = document.createElement('div');
  notice.className = 'liquid-copy-notice';
  notice.textContent = 'La copie est disponible après activation d’une offre.';
  notice.setAttribute('role', 'status');
  document.body.appendChild(notice);
  let noticeTimer;
  const refuseCopy = (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTimeout(noticeTimer);
    notice.classList.add('is-visible');
    noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 2200);
    return false;
  };
  document.addEventListener('copy', refuseCopy, true);
  document.addEventListener('cut', refuseCopy, true);
  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === 'c' || key === 'x')) refuseCopy(event);
  }, true);
}

// Garde automatique, y compris sur les pages qui n'appellent pas requireAuth.
fetchMe().then((user) => {
  if (user?.access?.status === 'trial') enableFounderCopyProtection();
  if (user?.access?.blocked) showFounderPaywall();
  else if (user?.access?.status === 'trial' && user.access.remaining_ms > 0) {
    window.setTimeout(showFounderPaywall, user.access.remaining_ms);
  }
});
window.setInterval(() => {
  fetchMe().then((user) => {
    if (user?.access?.status === 'trial') enableFounderCopyProtection();
    if (user?.access?.blocked) showFounderPaywall();
  });
}, 30_000);

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
    ctaBtn.href = user.account_types?.includes('avocat')
      ? (user.lawyer_profile_completed ? 'tableau-de-bord-avocat.html' : 'onboarding-avocat.html')
      : 'tableau-de-bord.html';
  }
}
