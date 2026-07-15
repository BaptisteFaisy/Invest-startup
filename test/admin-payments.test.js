'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { adminLiquidPayment, adminTrialProgress } = require('../lib/admin-payments');

const TWO_HOURS = 2 * 60 * 60 * 1000;

test('présente le temps réellement consommé sur les deux heures d’essai', () => {
  assert.deepEqual(adminTrialProgress({
    trial_started_at: '2026-07-15T08:00:00.000Z',
    trial_used_ms: 75 * 60 * 1000,
    subscription_status: 'inactive',
  }, TWO_HOURS), {
    tracked: true,
    status: 'active',
    used_ms: 75 * 60 * 1000,
    remaining_ms: 45 * 60 * 1000,
    total_ms: TWO_HOURS,
  });
});

test('plafonne l’essai à deux heures et distingue un passage au paiement', () => {
  assert.equal(adminTrialProgress({
    trial_started_at: '2026-07-15T08:00:00.000Z',
    trial_used_ms: 3 * 60 * 60 * 1000,
    subscription_status: 'inactive',
  }, TWO_HOURS).status, 'expired');

  const converted = adminTrialProgress({
    trial_started_at: '2026-07-15T08:00:00.000Z',
    trial_used_ms: 20 * 60 * 1000,
    subscription_status: 'active',
  }, TWO_HOURS);
  assert.equal(converted.status, 'converted');
  assert.equal(converted.used_ms, 20 * 60 * 1000);
});

test('un paiement Liquid+ est payé ou absent, jamais dû', () => {
  assert.deepEqual(adminLiquidPayment(null), {
    status: 'none', paid_amount: 0, due_amount: 0, currency: 'EUR',
  });
  assert.deepEqual(adminLiquidPayment({ amount_total: 55000, currency: 'eur' }), {
    status: 'paid', paid_amount: 550, due_amount: 0, currency: 'EUR',
  });
});

test('place la progression de l’essai avant le paiement Liquid+ dans le tableau', () => {
  const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.match(adminHtml, /<th>Essai gratuit de 2 h<\/th><th>Paiements Liquid\+<\/th>/);
  assert.match(adminHtml, /freeTrialValue\(payment\.free_trial\).*liquidPaymentValue\(payment\.liquid_plus\)/);
});
