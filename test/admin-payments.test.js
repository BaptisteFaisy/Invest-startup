'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { adminLiquidPayment, adminFreeAiUsage } = require('../lib/admin-payments');

const CAP = 300_000;

test('présente les tokens IA réellement consommés sur l’enveloppe gratuite', () => {
  assert.deepEqual(adminFreeAiUsage(
    { subscription_status: 'inactive' },
    { total_tokens: 120_000, requests: 34 },
    CAP,
  ), {
    status: 'active',
    used_tokens: 120_000,
    remaining_tokens: 180_000,
    total_tokens: CAP,
    requests: 34,
  });
});

test('un fondateur qui n’a jamais utilisé l’IA n’a rien consommé', () => {
  const untouched = adminFreeAiUsage({ subscription_status: 'inactive' }, undefined, CAP);
  assert.equal(untouched.status, 'active');
  assert.equal(untouched.used_tokens, 0);
  assert.equal(untouched.remaining_tokens, CAP);
});

test('signale l’enveloppe épuisée et distingue un passage au paiement', () => {
  assert.equal(adminFreeAiUsage(
    { subscription_status: 'inactive' }, { total_tokens: CAP }, CAP,
  ).status, 'exhausted');

  // Le dernier appel autorisé n'est pas tronqué : le cumul peut dépasser
  // l'enveloppe, le chiffre affiché doit rester le cumul réel.
  const overshoot = adminFreeAiUsage({ subscription_status: 'inactive' }, { total_tokens: 312_400 }, CAP);
  assert.equal(overshoot.status, 'exhausted');
  assert.equal(overshoot.used_tokens, 312_400);
  assert.equal(overshoot.remaining_tokens, 0);

  const converted = adminFreeAiUsage({ subscription_status: 'active' }, { total_tokens: 20_000 }, CAP);
  assert.equal(converted.status, 'converted');
  assert.equal(converted.used_tokens, 20_000);
});

test('un paiement Liquid+ est payé ou absent, jamais dû', () => {
  assert.deepEqual(adminLiquidPayment(null), {
    status: 'none', paid_amount: 0, due_amount: 0, currency: 'EUR',
  });
  assert.deepEqual(adminLiquidPayment({ amount_total: 55000, currency: 'eur' }), {
    status: 'paid', paid_amount: 550, due_amount: 0, currency: 'EUR',
  });
});

test('place la consommation IA avant le paiement Liquid+ dans le tableau', () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.match(adminHtml, /<th>Assistant IA gratuit<\/th><th>Paiements Liquid\+<\/th>/);
  assert.match(adminHtml, /freeAiValue\(payment\.free_ai\).*liquidPaymentValue\(payment\.liquid_plus\)/);
});
