'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  LAWYER_PARTNERSHIP_VERSION,
  buildPartnershipDocument,
  partnershipDocumentHash,
  partnershipAccepted,
  validatePartnershipAcceptance,
  partnershipAcceptanceRecord,
  publicPartnership,
} = require('../lib/lawyer-partnership.js');

// Grille de test figée : le pin d'empreinte ci-dessous ne doit pas dépendre de
// l'évolution du catalogue réel, seulement du texte des clauses.
const PRESTATIONS = [
  { key: 'pacte', label: 'Pacte d’associés', price: null, fee_cap_cents: null, delay: 'À convenir' },
];

const SIGNED = { lawyer_partnership_version: LAWYER_PARTNERSHIP_VERSION };

// ─── Le pin ───────────────────────────────────────────────────────────────────
// Ce test échoue dès que le texte de la convention change. C'est voulu : une
// clause modifiée sans incrément de version, ce sont des avocats liés par un
// texte qu'ils n'ont jamais lu. Pour le mettre à jour légitimement : incrémenter
// LAWYER_PARTNERSHIP_VERSION, puis reporter la nouvelle empreinte ici.
test('l’empreinte fige le texte : le modifier sans changer de version casse la CI', () => {
  const hash = partnershipDocumentHash(buildPartnershipDocument(PRESTATIONS));
  assert.equal(hash, '39d7a231fdc3512dd22d8162f79c7b8fc3c4eccd88b8b46db65d61e2c93e5bed');
  assert.equal(LAWYER_PARTNERSHIP_VERSION, 2);
});

test('l’empreinte suit la grille, pas seulement les clauses', () => {
  const base = partnershipDocumentHash(buildPartnershipDocument(PRESTATIONS));
  const withCap = partnershipDocumentHash(buildPartnershipDocument([{ ...PRESTATIONS[0], fee_cap_cents: 90000 }]));
  assert.notEqual(base, withCap, 'un plafond publié doit changer le document signé');
});

// L'ancien confirm() affichait « Pacte d'associés : null » faute de tarif publié.
// On n'adhère pas à une grille fantôme : l'absence de tarif se dit.
test('une prestation sans tarif publié l’écrit, au lieu d’afficher un vide', () => {
  const grille = buildPartnershipDocument(PRESTATIONS).sections.find(s => s.key === 'grille');
  const ligne = grille.clauses.find(clause => clause.startsWith('Pacte'));
  assert.match(ligne, /tarif non publié à ce jour/);
  for (const clause of grille.clauses) {
    assert.doesNotMatch(clause, /null|undefined|NaN/);
  }
});

test('un plafond publié s’affiche en euros TTC', () => {
  const grille = buildPartnershipDocument([{ ...PRESTATIONS[0], fee_cap_cents: 90000 }])
    .sections.find(s => s.key === 'grille');
  assert.match(grille.clauses.find(c => c.startsWith('Pacte')), /plafond\s.*900.*TTC/);
});

// ─── L'engagement ─────────────────────────────────────────────────────────────
test('seule la version en vigueur vaut acceptation', () => {
  assert.equal(partnershipAccepted(SIGNED), true);
  assert.equal(partnershipAccepted({ lawyer_partnership_version: LAWYER_PARTNERSHIP_VERSION - 1 }), false);
  assert.equal(partnershipAccepted({}), false);
  assert.equal(partnershipAccepted(null), false);
});

test('accepter une version qui n’est plus celle affichée ne signe rien', () => {
  const result = validatePartnershipAcceptance(
    { version: LAWYER_PARTNERSHIP_VERSION - 1, accepted: true, signed_name: 'Camille Roy' },
    'Camille Roy',
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PARTNERSHIP_VERSION_STALE');
});

test('la case non cochée ne signe rien', () => {
  const result = validatePartnershipAcceptance(
    { version: LAWYER_PARTNERSHIP_VERSION, accepted: false, signed_name: 'Camille Roy' },
    'Camille Roy',
  );
  assert.equal(result.ok, false);
});

test('le nom signé doit être celui du profil, à la casse et aux accents près', () => {
  const ok = validatePartnershipAcceptance(
    { version: LAWYER_PARTNERSHIP_VERSION, accepted: true, signed_name: '  camille   ROY ' },
    'Camille Roy',
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.value.signed_name, 'camille ROY');

  const ko = validatePartnershipAcceptance(
    { version: LAWYER_PARTNERSHIP_VERSION, accepted: true, signed_name: 'Le stagiaire' },
    'Camille Roy',
  );
  assert.equal(ko.ok, false);
});

// Sans nom de référence, il n'y a rien à confronter : accepter n'importe quelle
// saisie reviendrait à conserver une preuve qui ne prouve rien.
test('un profil sans nom ne peut pas signer', () => {
  const result = validatePartnershipAcceptance(
    { version: LAWYER_PARTNERSHIP_VERSION, accepted: true, signed_name: 'Camille Roy' },
    '',
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, 'LAWYER_PROFILE_REQUIRED');
});

test('le faisceau de preuve retient version, date, nom et empreinte du texte', () => {
  const hash = partnershipDocumentHash(buildPartnershipDocument(PRESTATIONS));
  const record = partnershipAcceptanceRecord({
    signedName: 'Camille Roy',
    documentHash: hash,
    ip: '203.0.113.7',
    userAgent: 'Mozilla/5.0',
    now: '2026-07-16T10:00:00.000Z',
  });
  assert.equal(record.lawyer_partnership_version, LAWYER_PARTNERSHIP_VERSION);
  assert.equal(record.lawyer_partnership_accepted_at, '2026-07-16T10:00:00.000Z');
  assert.equal(record.lawyer_partnership_signed_name, 'Camille Roy');
  assert.equal(record.lawyer_partnership_document_hash, hash);
  assert.equal(record.lawyer_partnership_ip, '203.0.113.7');
});

test('la vue avocat n’expose ni IP ni user-agent', () => {
  const view = publicPartnership(
    { ...SIGNED, lawyer_partnership_signed_name: 'Camille Roy', lawyer_partnership_ip: '203.0.113.7', lawyer_partnership_user_agent: 'Mozilla/5.0' },
    buildPartnershipDocument(PRESTATIONS),
  );
  assert.equal(view.accepted, true);
  assert.equal(view.signed_name, 'Camille Roy');
  const serialized = JSON.stringify(view);
  assert.doesNotMatch(serialized, /203\.0\.113\.7/);
  assert.doesNotMatch(serialized, /Mozilla/);
});
