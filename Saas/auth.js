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

let welcomeOfferHandled = false;

async function dismissFounderWelcomeOffer() {
  try {
    await fetch('/api/billing/welcome-offer/dismiss', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
    });
  } catch {
    // La fenêtre reste fermée pour cette page ; le serveur la reproposera à la
    // prochaine connexion si l'accusé de réception n'a pas pu être enregistré.
  }
}

async function showFounderWelcomeOffer(user) {
  if (welcomeOfferHandled || !user?.welcome_offer_pending || user.access?.status !== 'free') return;
  if (!document.body) {
    document.addEventListener('DOMContentLoaded', () => showFounderWelcomeOffer(user), { once: true });
    return;
  }
  if (document.getElementById('liquid-founder-welcome')) return;

  // Les montants suivent la grille tarifaire (type de levée du compte) : ils
  // viennent du serveur. Sans tarif, pas de fenêtre — on ne promet pas un prix faux.
  let pricing;
  try {
    const response = await fetch('/api/billing/status', { credentials: 'include' });
    pricing = (await response.json())?.liquid_plus;
  } catch { return; }
  if (!pricing?.price || welcomeOfferHandled || document.getElementById('liquid-founder-welcome')) return;
  const euros = (cents) => (cents / 100).toLocaleString('fr-FR') + ' €';
  const standardLabel = 'Payer ' + euros(pricing.price.amount_cents) + ' HT maintenant';

  const style = document.createElement('style');
  style.id = 'liquid-founder-welcome-style';
  style.textContent = `
    body.liquid-welcome-open{overflow:hidden}
    #liquid-founder-welcome,#liquid-founder-welcome *{box-sizing:border-box}
    #liquid-founder-welcome{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:22px;background:rgba(0,17,40,.58);font-family:"Libre Franklin",Arial,sans-serif}
    .liquid-welcome__box{position:relative;width:min(620px,100%);max-height:calc(100vh - 44px);overflow:auto;padding:34px;border:1px solid rgba(255,255,255,.18);border-radius:22px;background:#fff;color:#08090c;box-shadow:0 30px 100px rgba(0,0,0,.4)}
    .liquid-welcome__close{position:absolute;top:14px;right:14px;display:grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:50%;background:#f0f1f3;color:#344054;font-size:25px;line-height:1;cursor:pointer}.liquid-welcome__close:hover,.liquid-welcome__close:focus-visible{background:#e4e7ec;outline:2px solid #15803d;outline-offset:2px}
    .liquid-welcome__eyebrow{margin:0 48px 9px 0;color:#15803d;font:800 11px Archivo,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}.liquid-welcome__box h2{max-width:520px;margin:0;font:800 clamp(26px,5vw,36px)/1.12 Archivo,Arial,sans-serif;letter-spacing:-.035em}.liquid-welcome__lead{margin:15px 0 0;color:#475467;font-size:15px;line-height:1.6}
    .liquid-welcome__offer{margin-top:22px;padding:20px;border:1px solid rgba(21,128,61,.18);border-radius:16px;background:#d1fae5}.liquid-welcome__offer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.liquid-welcome__offer-label{color:#15803d;font:800 11px Archivo,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}.liquid-welcome__price{margin-top:5px;font:800 27px Archivo,Arial,sans-serif;letter-spacing:-.03em}.liquid-welcome__price s{margin-left:6px;color:#98a2b3;font-size:15px;font-weight:600}.liquid-welcome__code{flex:none;padding:9px 11px;border-radius:9px;background:#001839;color:#fff;font:800 12px Archivo,Arial,sans-serif;letter-spacing:.08em}
    .liquid-welcome__terms{position:relative;display:inline-block;margin-top:10px;color:#667085;font-size:11px}.liquid-welcome__terms-trigger{padding:0;border:0;border-bottom:1px dotted currentColor;background:none;color:inherit;font:inherit;cursor:help}.liquid-welcome__terms-tooltip{position:absolute;z-index:2;left:0;bottom:calc(100% + 8px);width:min(360px,calc(100vw - 88px));padding:11px 12px;border-radius:9px;background:#001839;color:#fff;font-size:12px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.22);opacity:0;visibility:hidden;transform:translateY(4px);transition:opacity .15s,transform .15s,visibility .15s}.liquid-welcome__terms:hover .liquid-welcome__terms-tooltip,.liquid-welcome__terms:focus-within .liquid-welcome__terms-tooltip,.liquid-welcome__terms.is-open .liquid-welcome__terms-tooltip{opacity:1;visibility:visible;transform:translateY(0)}
    .liquid-welcome__actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}.liquid-welcome__button{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px 15px;border:1px solid #001839;border-radius:10px;font:800 13px Archivo,Arial,sans-serif;text-align:center;cursor:pointer}.liquid-welcome__button:disabled{opacity:.58;cursor:wait}.liquid-welcome__button--promo{background:#15803d;border-color:#15803d;color:#fff}.liquid-welcome__button--standard{background:#fff;color:#001839}.liquid-welcome__message{min-height:18px;margin-top:10px;color:#b42318;font-size:12px;text-align:center}.liquid-welcome__free{margin:4px 0 0;color:#667085;font-size:11px;text-align:center}
    @media(max-width:600px){.liquid-welcome__box{padding:27px 21px}.liquid-welcome__offer-top{display:block}.liquid-welcome__code{display:inline-block;margin-top:12px}.liquid-welcome__actions{grid-template-columns:1fr}.liquid-welcome__terms-tooltip{position:fixed;left:22px;right:22px;bottom:22px;width:auto}}
  `;
  if (!document.getElementById(style.id)) document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'liquid-founder-welcome';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'liquid-welcome-title');
  overlay.innerHTML = `<div class="liquid-welcome__box"><button type="button" class="liquid-welcome__close" aria-label="Fermer cette proposition">&times;</button><p class="liquid-welcome__eyebrow">Bienvenue dans Liquid+</p><h2 id="liquid-welcome-title">Pilotez dès maintenant le volet juridique de votre levée.</h2><p class="liquid-welcome__lead">Votre accès gratuit n’expire pas : préparez toute votre levée sans rien payer. Liquid+ s’active le jour où vous voulez exporter, copier et sécuriser vos documents.</p><div class="liquid-welcome__offer"><div class="liquid-welcome__offer-top"><div><div class="liquid-welcome__offer-label">Votre offre de bienvenue</div><div class="liquid-welcome__price">${euros(pricing.promo_price.amount_cents)} HT <s>${euros(pricing.price.amount_cents)} HT</s></div></div><span class="liquid-welcome__code">RAISE SUMMIT</span></div><span class="liquid-welcome__terms">Offre soumise à <button type="button" class="liquid-welcome__terms-trigger" aria-expanded="false" aria-describedby="liquid-welcome-conditions">certaines conditions</button><span class="liquid-welcome__terms-tooltip" id="liquid-welcome-conditions" role="tooltip">Réduction accordée en échange d’un témoignage publié sur notre site et d’un post LinkedIn de votre part parlant de Liquid+.</span></span></div><div class="liquid-welcome__actions"><button type="button" class="liquid-welcome__button liquid-welcome__button--promo">Utiliser mon code promo</button><button type="button" class="liquid-welcome__button liquid-welcome__button--standard">${standardLabel}</button></div><div class="liquid-welcome__message" role="alert"></div><p class="liquid-welcome__free">Vous pouvez aussi fermer cette fenêtre et continuer gratuitement.</p></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('liquid-welcome-open');

  const closeButton = overlay.querySelector('.liquid-welcome__close');
  const promoButton = overlay.querySelector('.liquid-welcome__button--promo');
  const standardButton = overlay.querySelector('.liquid-welcome__button--standard');
  const terms = overlay.querySelector('.liquid-welcome__terms');
  const termsTrigger = overlay.querySelector('.liquid-welcome__terms-trigger');
  const message = overlay.querySelector('.liquid-welcome__message');

  const closeOffer = () => {
    if (welcomeOfferHandled) return;
    welcomeOfferHandled = true;
    document.body.classList.remove('liquid-welcome-open');
    overlay.remove();
    dismissFounderWelcomeOffer();
  };

  closeButton.addEventListener('click', closeOffer);
  termsTrigger.addEventListener('click', () => {
    const open = terms.classList.toggle('is-open');
    termsTrigger.setAttribute('aria-expanded', String(open));
  });
  promoButton.addEventListener('click', async () => {
    welcomeOfferHandled = true;
    promoButton.disabled = true;
    promoButton.textContent = 'Ouverture de Facturation…';
    await dismissFounderWelcomeOffer();
    window.location.href = '/saas/compte.html?tab=billing&promo=RAISE%20SUMMIT';
  });
  standardButton.addEventListener('click', async () => {
    message.textContent = '';
    standardButton.disabled = true;
    standardButton.textContent = 'Redirection…';
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: 'plateforme' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Paiement indisponible.');
      welcomeOfferHandled = true;
      window.location.href = data.checkout_url;
    } catch (error) {
      message.textContent = error.message || 'Paiement indisponible.';
      standardButton.disabled = false;
      standardButton.textContent = standardLabel;
    }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeOffer();
  });
  closeButton.focus();
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
// Freemium : un compte gratuit n'est jamais fermé, on installe seulement le
// verrou de copie et, une fois, l'offre de bienvenue. Le relevé périodique sert
// aux onglets déjà ouverts quand le compte devient fondateur ailleurs.
function applyFounderFreeState(user) {
  if (user?.access?.status !== 'free') return;
  enableFounderCopyProtection();
  showFounderWelcomeOffer(user);
}
fetchMe().then(applyFounderFreeState);
window.setInterval(() => { fetchMe().then(applyFounderFreeState); }, 30_000);

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
