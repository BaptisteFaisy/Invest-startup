'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildAdminDashboardStats, countUnreadAdminMessages, parisDayKey, parisPeriodKeys } = require('../lib/admin-dashboard');

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

test('calcule les périodes du tableau de bord selon le calendrier de Paris', () => {
  const now = new Date('2026-07-15T10:00:00.000Z');
  assert.deepEqual(parisPeriodKeys(now), {
    today: '2026-07-15',
    week_start: '2026-07-13',
    month: '2026-07',
  });
  assert.equal(parisDayKey('2026-07-12T22:30:00.000Z'), '2026-07-13');
});

test('agrège les encaissements, startups, avocats et messages non lus', () => {
  const stats = buildAdminDashboardStats({
    now: new Date('2026-07-15T10:00:00.000Z'),
    founders: [
      { id: 1, subscription_status: 'active' },
      { id: 2, subscription_status: 'inactive' },
      { id: 3, subscription_status: 'active' },
    ],
    lawyers: [
      { id: 10 },
      { id: 11, lawyer_status: 'active' },
      { id: 12, lawyer_status: 'rejected' },
      { id: 13, lawyer_status: 'suspended' },
      { id: 14, lawyer_status: 'pending' },
    ],
    payments: [
      { user_id: 1, status: 'paid', amount_total: 70000, currency: 'eur', paid_at: '2026-07-13T08:00:00.000Z' },
      { user_id: 2, status: 'paid', amount_total: 55000, currency: 'eur', paid_at: '2026-07-01T08:00:00.000Z' },
      { user_id: 3, status: 'paid', amount_total: 70000, currency: 'eur', paid_at: '2026-06-20T08:00:00.000Z' },
      { user_id: 1, status: 'pending', amount_total: 99999, currency: 'eur', paid_at: '2026-07-14T08:00:00.000Z' },
      { user_id: 999, status: 'paid', amount_total: 99999, currency: 'eur', paid_at: '2026-07-14T08:00:00.000Z' },
      { user_id: 1, status: 'paid', amount_total: 99999, currency: 'eur' },
    ],
    unreadMessages: 4,
  });

  assert.deepEqual(stats.revenue, {
    currency: 'EUR',
    week_amount_cents: 70000,
    month_amount_cents: 125000,
  });
  assert.deepEqual(stats.startups, { registered: 3, paid: 3, active: 2 });
  assert.deepEqual(stats.lawyers, { registered: 5, pending: 2, active: 1, rejected: 1, suspended: 1 });
  assert.deepEqual(stats.messages, { unread: 4 });
});

test('compte chaque message non lu et conserve la compatibilité avec les anciens fils', () => {
  assert.equal(countUnreadAdminMessages([
    { unread_by_admin: true, unread_admin_count: 3 },
    { unread_by_admin: true },
    { unread_by_admin: false, unread_admin_count: 8 },
  ]), 4);
});

test('la page admin ouvre le tableau de bord par défaut et son script reste valide', () => {
  assert.match(adminHtml, /href="#dashboard" data-admin-view="dashboard"/);
  assert.match(adminHtml, /data-admin-view-panel="dashboard"/);
  assert.match(adminHtml, /showAdminView\(window\.location\.hash\.slice\(1\) \|\| 'dashboard', false\)/);
  const inlineScripts = [...adminHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach(match => assert.doesNotThrow(() => new Function(match[1])));
});
