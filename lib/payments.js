'use strict';

// Montants Liquid+ exprimés en centimes et TOUJOURS TTC. Le montant est imposé
// côté serveur : ni le navigateur, ni un Payment Link mal configuré ne peuvent le
// modifier. Standard 600 € TTC ; tarif promotionnel « RAISE SUMMIT » 450 € TTC.
const LIQUID_PLUS_STANDARD_PRICE_CENTS = 60_000;
const LIQUID_PLUS_PROMO_PRICE_CENTS = 45_000;
const LIQUID_PLUS_ACCESS_CURRENCY = 'eur';

// Bornes de sécurité pour un montant d'honoraires d'avocat saisi manuellement.
const LAWYER_PAYMENT_MIN_CENTS = 100;          // 1 € minimum
const LAWYER_PAYMENT_MAX_CENTS = 10_000_000;   // 100 000 € maximum

// Le code promo « RAISE SUMMIT » applique le tarif réduit ; toute autre valeur
// (ou l'absence de code) applique le tarif standard.
function liquidPlusAccessAmountCents({ promotion } = {}) {
  return promotion === 'RAISE SUMMIT'
    ? LIQUID_PLUS_PROMO_PRICE_CENTS
    : LIQUID_PLUS_STANDARD_PRICE_CENTS;
}

// Convertit un montant saisi en euros (« 1 234,56 » ou « 1234.5 ») en centimes
// entiers. Retourne null si la saisie n'est pas un montant décimal valide, pour
// éviter toute erreur de virgule flottante lors d'un règlement.
function parseEuroAmountToCents(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function isValidLawyerAmountCents(cents) {
  return Number.isSafeInteger(cents)
    && cents >= LAWYER_PAYMENT_MIN_CENTS
    && cents <= LAWYER_PAYMENT_MAX_CENTS;
}

// Vue publique d'un paiement d'honoraires : jamais d'identifiant Stripe ni de
// référence de compte connecté exposés au navigateur.
function publicLawyerPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    request_id: payment.request_id,
    amount_total: payment.amount_total,
    amount_refunded: payment.amount_refunded || 0,
    currency: String(payment.currency || LIQUID_PLUS_ACCESS_CURRENCY).toUpperCase(),
    status: payment.status,
    description: payment.description || '',
    fee_agreement_reference: payment.fee_agreement_reference || '',
    fee_agreement_confirmed_at: payment.fee_agreement_confirmed_at || null,
    paid_at: payment.paid_at || null,
    refunded_at: payment.refunded_at || null,
    disputed_at: payment.disputed_at || null,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  };
}

// Un paiement unique confirmé : session Checkout en mode « payment » et réglée.
function isPaidStripeCheckoutSession(session) {
  return !!session
    && session.mode === 'payment'
    && session.payment_status === 'paid';
}

// Certains champs Stripe (payment_intent, customer…) sont soit une chaîne (id),
// soit un objet développé. On ne veut stocker que l'identifiant.
function stripeObjectId(value) {
  return typeof value === 'string' ? value : (value && value.id) || null;
}

module.exports = {
  LIQUID_PLUS_STANDARD_PRICE_CENTS,
  LIQUID_PLUS_PROMO_PRICE_CENTS,
  LIQUID_PLUS_ACCESS_CURRENCY,
  LAWYER_PAYMENT_MIN_CENTS,
  LAWYER_PAYMENT_MAX_CENTS,
  liquidPlusAccessAmountCents,
  parseEuroAmountToCents,
  isValidLawyerAmountCents,
  publicLawyerPayment,
  isPaidStripeCheckoutSession,
  stripeObjectId,
};
