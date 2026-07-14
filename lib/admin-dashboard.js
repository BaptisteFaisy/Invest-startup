'use strict';

const PARIS_TIME_ZONE = 'Europe/Paris';
const PARIS_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const LAWYER_STATUSES = new Set(['pending', 'active', 'rejected', 'suspended']);

function parisDayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(
    PARIS_DATE_FORMATTER.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parisPeriodKeys(now = new Date()) {
  const today = parisDayKey(now);
  const calendarDate = new Date(`${today}T12:00:00Z`);
  const isoWeekday = calendarDate.getUTCDay() || 7;
  calendarDate.setUTCDate(calendarDate.getUTCDate() - isoWeekday + 1);
  return {
    today,
    week_start: calendarDate.toISOString().slice(0, 10),
    month: today.slice(0, 7),
  };
}

function idKey(value) {
  return value == null ? '' : String(value);
}

function countUnreadAdminMessages(threads = []) {
  return threads.reduce((total, thread) => {
    if (!thread?.unread_by_admin) return total;
    const storedCount = Number(thread.unread_admin_count);
    return total + (Number.isFinite(storedCount) && storedCount > 0 ? storedCount : 1);
  }, 0);
}

function buildAdminDashboardStats({ founders = [], lawyers = [], payments = [], unreadMessages = 0, now = new Date() } = {}) {
  const generatedAt = now instanceof Date ? now : new Date(now);
  const periods = parisPeriodKeys(generatedAt);
  const founderIds = new Set(founders.map(founder => idKey(founder.id)).filter(Boolean));
  const paidFounderIds = new Set();
  let weekAmountCents = 0;
  let monthAmountCents = 0;

  payments.forEach(payment => {
    if (payment?.status !== 'paid') return;
    const paymentFounderId = idKey(payment.user_id);
    if (!founderIds.has(paymentFounderId)) return;
    paidFounderIds.add(paymentFounderId);

    const amountCents = Number(payment.amount_total);
    const currency = String(payment.currency || 'EUR').toUpperCase();
    const paymentDay = payment.paid_at ? parisDayKey(payment.paid_at) : null;
    if (!Number.isFinite(amountCents) || amountCents <= 0 || currency !== 'EUR' || !paymentDay || paymentDay > periods.today) return;
    if (paymentDay >= periods.week_start) weekAmountCents += amountCents;
    if (paymentDay.startsWith(periods.month)) monthAmountCents += amountCents;
  });

  const lawyerStats = { registered: lawyers.length, pending: 0, active: 0, rejected: 0, suspended: 0 };
  lawyers.forEach(lawyer => {
    const status = LAWYER_STATUSES.has(lawyer?.lawyer_status) ? lawyer.lawyer_status : 'pending';
    lawyerStats[status] += 1;
  });

  return {
    generated_at: generatedAt.toISOString(),
    periods,
    revenue: {
      currency: 'EUR',
      week_amount_cents: Math.round(weekAmountCents),
      month_amount_cents: Math.round(monthAmountCents),
    },
    startups: {
      registered: founders.length,
      paid: paidFounderIds.size,
      active: founders.filter(founder => founder.subscription_status === 'active').length,
    },
    lawyers: lawyerStats,
    messages: {
      unread: Math.max(0, Number(unreadMessages) || 0),
    },
  };
}

module.exports = {
  buildAdminDashboardStats,
  countUnreadAdminMessages,
  parisDayKey,
  parisPeriodKeys,
};
