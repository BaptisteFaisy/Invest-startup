'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const {
  LIQUID_PLUS_PRICING_CENTS,
  liquidPlusPricingForRaiseType,
  liquidPlusAccessAmountCents,
  parseEuroAmountToCents,
  isValidLawyerAmountCents,
  publicLawyerPayment,
  stripeObjectId,
  bankTransferReference,
  userIdFromTransferReference,
} = require('../lib/payments');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const accountHtml = fs.readFileSync(path.join(root, 'Saas', 'compte.html'), 'utf8');
const caseHtml = fs.readFileSync(path.join(root, 'Saas', 'dossier-avocat.html'), 'utf8');

test('la référence de virement identifie le compte et refuse toute forme approximative', () => {
  assert.equal(bankTransferReference(4, 'a1b2c3'), 'LQP-4-A1B2C3');
  assert.equal(userIdFromTransferReference('LQP-4-A1B2C3'), 4);
  // Tolérances utiles au rapprochement : casse et espaces d'un relevé bancaire.
  assert.equal(userIdFromTransferReference('  lqp-4-a1b2c3 '), 4);
  // Un libellé fantaisiste ne doit JAMAIS désigner un compte : sans quoi un
  // virement mal référencé activerait l'accès de quelqu'un d'autre.
  for (const bogus of ['LQP-4', 'LQP--A1B2C3', 'LQP-0-A1B2C3', 'LQP-04-A1B2C3', 'LQP-4-ZZZZZZ', 'LQP-4-A1B2C', 'virement liquid plus', '', null]) {
    assert.equal(userIdFromTransferReference(bogus), null, `référence acceptée à tort : ${bogus}`);
  }
  assert.throws(() => bankTransferReference(0, 'a1b2c3'), /Identifiant utilisateur invalide/);
  assert.throws(() => bankTransferReference(4, 'xyz'), /Suffixe de référence invalide/);
});

// `assert.match` déverserait les 500 Ko de server.js au moindre échec : on teste
// la regex à la main pour n'afficher que le message.
const has = (source, pattern, message) => assert.ok(pattern.test(source), message);
const lacks = (source, pattern, message) => assert.ok(!pattern.test(source), message);

test('les coordonnées bancaires ne sont pas dans le dépôt et se désactivent si absentes', () => {
  // L'IBAN vit dans l'environnement, jamais en dur : un dépôt public ne doit
  // pas porter de coordonnées d'encaissement.
  has(serverSource, /LIQUIDPLUS_IBAN = \(process\.env\.LIQUIDPLUS_IBAN/, 'IBAN non lu depuis l’environnement');
  lacks(serverSource, /\bFR\d{2}\s?[0-9A-Z]{10,}/, 'un IBAN semble codé en dur dans server.js');
  // Sans coordonnées, on refuse explicitement plutôt que d'afficher un IBAN vide.
  has(serverSource, /bankTransferEnabled = \(\) => !!\(LIQUIDPLUS_IBAN && LIQUIDPLUS_ACCOUNT_HOLDER\)/, 'garde bankTransferEnabled absente');
  has(serverSource, /if \(!bankTransferEnabled\(\)\) return res\.status\(503\)/, 'pas de 503 quand l’IBAN manque');
});

test('le virement Liquid+ impose le montant côté serveur et se réutilise', () => {
  const endpoint = serverSource.slice(serverSource.indexOf("app.post('/api/billing/bank-transfer'"));
  // Le montant vient de la grille et du type de levée, jamais du navigateur.
  has(endpoint, /liquidPlusAccessAmountCents\(\{ raiseType, promotion \}\)/, 'montant non calculé côté serveur');
  lacks(endpoint.slice(0, endpoint.indexOf('publicBankTransfer')), /req\.body\?\.amount/, 'le montant est lu depuis le body');
  // Une demande en attente est réutilisée : la référence déjà donnée à la banque
  // ne doit pas changer d'un affichage à l'autre.
  has(endpoint, /status: 'awaiting_transfer' \}/, 'pas de réutilisation de la demande en attente');
  has(endpoint, /existing\.amount_total !== amountCents/, 'un changement de tarif ne périme pas la référence');
  // Un accès déjà réglé ne peut pas être re-payé.
  has(endpoint, /Votre accès Liquid\+ est déjà actif/, 'un accès actif peut être re-payé');
});

test('l’activation manuelle est réservée à l’admin et solde le virement en attente', () => {
  const endpoint = serverSource.slice(serverSource.indexOf("app.patch('/api/admin/founders/:id/plan'"));
  has(endpoint.slice(0, 120), /requireAdmin/, 'activation non protégée par requireAdmin');
  has(endpoint, /liquid_plus_access_status: 'paid'/, 'l’activation ne marque pas l’accès payé');
  has(endpoint, /status: 'received', received_at: now/, 'le virement en attente n’est pas soldé');
  // Le booléen est exigé : un body vide ne doit pas activer un accès par défaut.
  has(endpoint, /typeof activate !== 'boolean'/, 'un body vide pourrait activer un accès');
});

test('Liquid+ : le tarif suit la grille de la homepage, par type de levée', () => {
  // Grille homepage (HT) : Intégral BSA-AIR 490 € barré → 290 € fondateur ;
  // levée classique 1 490 € barré → 790 € fondateur.
  assert.deepEqual(LIQUID_PLUS_PRICING_CENTS['bsa-air'], { list: 49_000, standard: 29_000, promo: 22_000 });
  assert.deepEqual(LIQUID_PLUS_PRICING_CENTS.classic, { list: 149_000, standard: 79_000, promo: 59_000 });
  assert.equal(liquidPlusAccessAmountCents({ raiseType: 'bsa-air' }), 29_000);
  assert.equal(liquidPlusAccessAmountCents({ raiseType: 'classic' }), 79_000);
  assert.equal(liquidPlusAccessAmountCents({ raiseType: 'bsa-air', promotion: 'RAISE SUMMIT' }), 22_000);
  assert.equal(liquidPlusAccessAmountCents({ raiseType: 'classic', promotion: 'RAISE SUMMIT' }), 59_000);
  // Type absent ou inconnu : on retombe sur la levée classique, jamais sur un prix nul.
  assert.equal(liquidPlusAccessAmountCents({}), 79_000);
  assert.equal(liquidPlusAccessAmountCents({ raiseType: 'autre', promotion: null }), 79_000);
  assert.equal(liquidPlusPricingForRaiseType('bsa-air').standard, 29_000);
  assert.equal(liquidPlusPricingForRaiseType(undefined).standard, 79_000);
});

test('le Checkout Liquid+ est un paiement unique généré côté serveur, montant TTC imposé', () => {
  assert.match(serverSource, /mode: 'payment'/);
  assert.match(serverSource, /payment_kind: 'liquid_plus_access'/);
  assert.match(serverSource, /tax_behavior: 'inclusive'/);
  assert.match(serverSource, /unit_amount: amountCents/);
  assert.doesNotMatch(serverSource, /mode: 'subscription'/);
  // Le montant est revalidé contre la session en attente enregistrée.
  assert.match(serverSource, /session\.amount_total !== pending\.amount_total/);
  // Le checkout dépend du type de levée du compte, jamais d'un montant du navigateur.
  assert.match(serverSource, /liquidPlusAccessAmountCents\(\{ raiseType, promotion \}\)/);
  // La page Facturation affiche les montants servis par l'API, plus aucun prix en dur.
  assert.match(accountHtml, /fmtEuros\(data\.liquid_plus\.price\.amount_cents\)/);
  assert.match(accountHtml, /fmtEuros\(BILLING_PRICING\.promo_price\.amount_cents\)/);
  assert.doesNotMatch(accountHtml, /600 € TTC|450 € TTC/);
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
  for (const id of ['payment-card', 'payment-body', 'payment-error', 'fee-form', 'fee-source',
    'fee-description', 'fee-submit']) {
    assert.ok(caseHtml.includes(`id="${id}"`), `identifiant absent du markup : ${id}`);
  }
  // Chaque rôle appelle sa propre route : le fondateur paie, le cabinet publie le montant.
  assert.match(scripts[0], /\/api\/saas\/avocat\/requests\/'\+id\+'\/payment\/checkout/);
  assert.match(scripts[0], /\/api\/lawyer\/payments\/connect\/onboard/);
  assert.match(scripts[0], /method:'PUT'/);
});

test('le montant des honoraires vient de la convention, jamais d’une saisie libre au paiement', () => {
  // La convention d'honoraires est un fait juridique entre la société et l'avocat.
  // La saisir dans le formulaire de paiement la soudait à Stripe Connect : un
  // cabinet sans compte Stripe n'aurait jamais pu la confirmer, donc jamais
  // travailler. Elle appartient à l'acceptation de la mission.
  for (const id of ['convention-form', 'convention-reference', 'convention-date',
    'convention-amount', 'convention-confirm', 'convention-submit']) {
    assert.ok(caseHtml.includes(`id="${id}"`), `identifiant absent du markup : ${id}`);
  }
  // Le formulaire de paiement ne collecte plus ni montant, ni référence, ni confirmation.
  assert.equal(caseHtml.includes('id="fee-amount"'), false);
  assert.equal(caseHtml.includes('id="fee-reference"'), false);
  assert.equal(caseHtml.includes('id="fee-confirm"'), false);

  // Côté serveur, PUT /payment LIT la convention au lieu de la collecter.
  const paymentRoute = serverSource.indexOf("app.put('/api/lawyer/review-requests/:id/payment'");
  const nextRoute = serverSource.indexOf('app.get(', paymentRoute);
  const body = serverSource.slice(paymentRoute, nextRoute);
  assert.match(body, /acceptance\.fee_agreement_amount_cents/);
  assert.match(body, /acceptance\.fee_agreement_reference/);
  assert.doesNotMatch(body, /req\.body\?\.amount_eur/);
  assert.doesNotMatch(body, /req\.body\?\.fee_agreement_confirmed/);
  // Et le verrou de mission est consulté AVANT toute écriture du paiement.
  assert.ok(body.indexOf('missionGate') < body.indexOf("col('lawyer_payment_requests').updateOne"));
});

test('confirmer la convention d’honoraires n’exige pas Stripe Connect', () => {
  // Sinon un cabinet qui facture par virement serait interdit de travail.
  const route = serverSource.indexOf("app.put('/api/lawyer/review-requests/:id/acceptance/fee-agreement'");
  assert.ok(route > 0, 'route de convention introuvable');
  const nextRoute = serverSource.indexOf('app.post(', route);
  const body = serverSource.slice(route, nextRoute);
  assert.doesNotMatch(body, /ready_for_payments/);
  assert.doesNotMatch(body, /refreshLawyerConnectProfile/);
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
