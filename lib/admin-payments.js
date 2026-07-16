'use strict';

// Consommation de l'assistant IA sur l'enveloppe gratuite. En freemium, c'est ce
// compteur — et non un temps d'essai — qui borne un compte fondateur non payant.
// `used_tokens` est un cumul à vie du compte, il peut donc dépasser l'enveloppe
// (le dernier appel autorisé n'est pas tronqué) : on ne le plafonne pas dans les
// chiffres, seulement dans le pourcentage de la barre.
function adminFreeAiUsage(founder, usage, capTokens) {
  const total = Math.max(0, Number(capTokens) || 0);
  const used = Math.max(0, Number(usage?.total_tokens) || 0);
  const status = founder?.subscription_status === 'active'
    ? 'converted'
    : used >= total && total > 0
      ? 'exhausted'
      : 'active';

  return {
    status,
    used_tokens: used,
    remaining_tokens: Math.max(0, total - used),
    total_tokens: total,
    requests: Math.max(0, Number(usage?.requests) || 0),
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

module.exports = { adminLiquidPayment, adminFreeAiUsage };
