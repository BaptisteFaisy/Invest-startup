'use strict';

function adminLiquidPayment(payment) {
  if (!payment) {
    return {
      status: 'none',
      paid_amount: 0,
      due_amount: 0,
      currency: 'EUR',
    };
  }

  const amountTotal = Number(payment.amount_total);
  return {
    status: 'paid',
    paid_amount: Number.isFinite(amountTotal) && amountTotal > 0 ? amountTotal / 100 : 0,
    due_amount: 0,
    currency: String(payment.currency || 'EUR').toUpperCase(),
  };
}

module.exports = { adminLiquidPayment };
