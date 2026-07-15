'use strict';

function adminTrialProgress(founder, totalMs) {
  const durationMs = Math.max(0, Number(totalMs) || 0);
  if (!founder?.trial_started_at) {
    return {
      tracked: false,
      status: 'legacy',
      used_ms: 0,
      remaining_ms: durationMs,
      total_ms: durationMs,
    };
  }

  const usedMs = Math.min(durationMs, Math.max(0, Number(founder.trial_used_ms) || 0));
  const status = founder.subscription_status === 'active'
    ? 'converted'
    : usedMs >= durationMs
      ? 'expired'
      : 'active';

  return {
    tracked: true,
    status,
    used_ms: usedMs,
    remaining_ms: Math.max(0, durationMs - usedMs),
    total_ms: durationMs,
  };
}

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

module.exports = { adminLiquidPayment, adminTrialProgress };
