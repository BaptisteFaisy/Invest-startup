'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  LIQUID_PLUS_STANDARD_PRICE_CENTS,
  LIQUID_PLUS_PROMO_PRICE_CENTS,
  liquidPlusAccessAmountCents,
  parseEuroAmountToCents,
  isValidLawyerAmountCents,
  publicLawyerPayment,
  stripeObjectId,
} = require('../lib/payments');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const accountHtml = fs.readFileSync(path.join(root, 'Saas', 'compte.html'), 'utf8');
const caseHtml = fs.readFileSync(path.join(root, 'Saas', 'dossier-avocat.html'), 'utf8');

test('Liquid+ : accès unique à 600 € TTC, 450 € TTC avec le code promo', () => {
  assert.equal(LIQUID_PLUS_STANDARD_PRICE_CENTS, 60_000);
  assert.equal(LIQUID_PLUS_PROMO_PRICE_CENTS, 45_000);
  assert.equal(liquidPlusAccessAmountCents({}), 60_000);
  assert.equal(liquidPlusAccessAmountCents({ promotion: null }), 60_000);
  assert.equal(liquidPlusAccessAmountCents({ promotion: 'RAISE SUMMIT' }), 45_000);
});

test('le Checkout Liquid+ est un paiement unique généré côté serveur, montant TTC imposé', () => {
  assert.match(serverSource, /mode: 'payment'/);
  assert.match(serverSource, /payment_kind: 'liquid_plus_access'/);
  assert.match(serverSource, /tax_behavior: 'inclusive'/);
  assert.match(serverSource, /unit_amount: amountCents/);
  assert.doesNotMatch(serverSource, /mode: 'subscription'/);
  // Le montant est revalidé contre la session en attente enregistrée.
  assert.match(serverSource, /session\.amount_total !== pending\.amount_total/);
  assert.match(accountHtml, /Payer 600 € TTC/);
  assert.match(accountHtml, /Accepter et payer 450 € TTC/);
});

test('les webhooks Stripe lisent le corps brut avant le parseur JSON et vérifient la signature', () => {
  const platformWebhook = serverSource.indexOf("app.post('/api/billing/stripe-webhook'");
  const jsonParser = serverSource.indexOf("app.use(express.json(");
  assert.ok(platformWebhook > 0 && jsonParser > platformWebhook);
  assert.match(serverSource, /stripe\.webhooks\.constructEvent/);
});

test('les montants avocat en euros sont convertis en centimes sans erreur flottante', () => {
  assert.equal(parseEuroAmountToCents('1 234,56'), 123_456);
  assert.equal(parseEuroAmountToCents('600'), 60_000);
  assert.equal(parseEuroAmountToCents('12.345'), null);
  assert.equal(parseEuroAmountToCents('-10'), null);
  assert.equal(parseEuroAmountToCents('abc'), null);
  assert.equal(isValidLawyerAmountCents(100), true);
  assert.equal(isValidLawyerAmountCents(99), false);
  assert.equal(isValidLawyerAmountCents(10_000_001), false);
});

test('un identifiant Stripe développé ou string est réduit à son id', () => {
  assert.equal(stripeObjectId('pi_123'), 'pi_123');
  assert.equal(stripeObjectId({ id: 'pi_456' }), 'pi_456');
  assert.equal(stripeObjectId(null), null);
});

test('le dossier avocat expose les honoraires et son script reste valide', () => {
  const scripts = [...caseHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'dossier-avocat.html' }));
  for (const id of ['payment-card', 'payment-body', 'payment-error', 'fee-form', 'fee-amount',
    'fee-reference', 'fee-description', 'fee-confirm', 'fee-submit']) {
    assert.ok(caseHtml.includes(`id="${id}"`), `identifiant absent du markup : ${id}`);
  }
  // Chaque rôle appelle sa propre route : le fondateur paie, le cabinet publie le montant.
  assert.match(scripts[0], /\/api\/saas\/avocat\/requests\/'\+id\+'\/payment\/checkout/);
  assert.match(scripts[0], /\/api\/lawyer\/payments\/connect\/onboard/);
  assert.match(scripts[0], /method:'PUT'/);
});

test('le fondateur ne peut pas payer tant que le cabinet n’a pas publié de montant', () => {
  const founderView = caseHtml.match(/function founderPaymentHtml\(\)\{[\s\S]*?return rows\.join\(''\)\}/);
  assert.ok(founderView, 'founderPaymentHtml introuvable');
  // Sans paiement enregistré, la fonction sort avant de rendre le bouton de paiement.
  const beforePayButton = founderView[0].slice(0, founderView[0].indexOf('id="pay-btn"'));
  assert.match(beforePayButton, /if\(!payment\)return/);
  // Le bouton n'est rendu que pour un paiement encore dû.
  assert.match(founderView[0], /\['awaiting_payment','checkout_open'\]\.includes\(payment\.status\)/);
});

test('la vue publique d’un paiement avocat n’expose aucun identifiant Stripe', () => {
  const pub = publicLawyerPayment({
    id: 'pay-1', request_id: 42, amount_total: 120_000, currency: 'eur',
    status: 'awaiting_payment', stripe_connect_account_id: 'acct_secret',
    stripe_checkout_session_id: 'cs_secret', stripe_payment_intent_id: 'pi_secret',
    created_at: '2026-07-15T00:00:00.000Z', updated_at: '2026-07-15T00:00:00.000Z',
  });
  assert.equal(pub.amount_total, 120_000);
  assert.equal('stripe_connect_account_id' in pub, false);
  assert.equal('stripe_checkout_session_id' in pub, false);
  assert.equal('stripe_payment_intent_id' in pub, false);
});
