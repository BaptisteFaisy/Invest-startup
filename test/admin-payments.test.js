'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { adminLiquidPayment } = require('../lib/admin-payments');

test('un paiement Liquid+ est paye ou absent, jamais du', () => {
  assert.deepEqual(adminLiquidPayment(null), {
    status: 'none', paid_amount: 0, due_amount: 0, currency: 'EUR',
  });
  assert.deepEqual(adminLiquidPayment({ amount_total: 55000, currency: 'eur' }), {
    status: 'paid', paid_amount: 550, due_amount: 0, currency: 'EUR',
  });
});
