'use strict';

// Montants Liquid+ exprimés en centimes et TOUJOURS HT, alignés sur la grille
// tarifaire de la homepage : le prix dépend du TYPE DE LEVÉE du compte (BSA-AIR
// ou levée classique). Le montant est imposé côté serveur : ni le navigateur, ni
// un Payment Link mal configuré ne peuvent le modifier.
//   • list     : prix de référence, affiché barré (490 € / 1 490 €) ;
//   • standard : tarif fondateur réellement facturé (290 € / 790 €) ;
//   • promo    : tarif « RAISE SUMMIT » (~ -25 %), contre témoignage + post LinkedIn.
const LIQUID_PLUS_PRICING_CENTS = {
  'bsa-air': { list: 49_000, standard: 29_000, promo: 22_000 },
  classic: { list: 149_000, standard: 79_000, promo: 59_000 },
};
const LIQUID_PLUS_ACCESS_CURRENCY = 'eur';

// Tout type inconnu ou absent retombe sur la levée classique — le défaut du
// profil de levée côté serveur.
function liquidPlusPricingForRaiseType(raiseType) {
  return LIQUID_PLUS_PRICING_CENTS[raiseType] || LIQUID_PLUS_PRICING_CENTS.classic;
}

// Bornes de sécurité pour un montant d'honoraires d'avocat saisi manuellement.
const LAWYER_PAYMENT_MIN_CENTS = 100;          // 1 € minimum
const LAWYER_PAYMENT_MAX_CENTS = 10_000_000;   // 100 000 € maximum

// Le code promo « RAISE SUMMIT » applique le tarif réduit ; toute autre valeur
// (ou l'absence de code) applique le tarif fondateur du type de levée.
function liquidPlusAccessAmountCents({ raiseType, promotion } = {}) {
  const pricing = liquidPlusPricingForRaiseType(raiseType);
  return promotion === 'RAISE SUMMIT' ? pricing.promo : pricing.standard;
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
  LIQUID_PLUS_PRICING_CENTS,
  liquidPlusPricingForRaiseType,
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
