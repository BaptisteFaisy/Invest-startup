'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  buildPartyCandidates,
  sanitizeParties,
  missionGate,
  publicMissionAcceptance,
  validateConflictInput,
  validateFeeAgreementInput,
  validateDecisionInput,
} = require('../lib/mission-acceptance');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const encryptionSource = fs.readFileSync(path.join(root, 'lib', 'document-encryption.js'), 'utf8');

const COMPANY = {
  company_name: 'Acme SAS',
  siren: '123456789',
  legal_representative_name: 'Marie Dupont',
  legal_representative_title: 'Présidente',
};

// Une acceptation arrivée au bout du parcours : conflit contrôlé, vigilance
// attestée, mission acceptée, convention confirmée.
function acceptanceComplete(overrides = {}) {
  return {
    status: 'accepted',
    conflict_outcome: 'aucun_conflit',
    conflict_checked_at: '2026-07-15T10:00:00.000Z',
    vigilance_attested_at: '2026-07-15T10:01:00.000Z',
    fee_agreement_reference: 'CONV-2026-014',
    fee_agreement_signed_on: '2026-07-15',
    fee_agreement_amount_cents: 180_000,
    fee_agreement_confirmed_at: '2026-07-15T10:02:00.000Z',
    decided_at: '2026-07-15T10:03:00.000Z',
    ...overrides,
  };
}

test('les parties sont pré-remplies depuis la société vérifiée, les fondateurs et le pipeline', () => {
  const parties = buildPartyCandidates({
    companySnapshot: COMPANY,
    founders: [{ name: 'Marie Dupont', status: 'cofounder', job: 'CEO' }, { name: 'Karim Aziz', status: 'cofounder', job: 'CTO' }],
    investors: [{ name: 'Léa Martin', firm: 'Alpha Ventures', investor_type: 'vc', stage: 'lettre_intention_signee' }],
  });
  const names = parties.map(p => p.name);
  assert.deepEqual(names, ['Acme SAS', 'Marie Dupont', 'Karim Aziz', 'Léa Martin']);

  // L'identité de la société et de son représentant est contrôlée par Liquid+ ;
  // tout le reste n'est qu'une déclaration du fondateur. L'avocat doit voir la
  // différence pour savoir sur quoi il s'appuie.
  assert.equal(parties[0].verified, true);
  assert.equal(parties[1].verified, true);
  assert.equal(parties[2].verified, false);
  assert.equal(parties[3].verified, false);
  assert.equal(parties[0].detail, 'SIREN 123456789');
  assert.equal(parties[3].role, 'Fonds');
});

test('une même personne représentante et fondatrice n’apparaît qu’une fois, au titre le plus probant', () => {
  const parties = buildPartyCandidates({
    companySnapshot: COMPANY,
    // Accents et casse différents : c'est la même personne.
    founders: [{ name: 'marie dupont', status: 'cofounder', job: 'CEO' }],
    investors: [],
  });
  assert.equal(parties.filter(p => p.name.toLowerCase().includes('dupont')).length, 1);
  assert.equal(parties[1].source, 'representant_legal');
  assert.equal(parties[1].verified, true);
});

test('une ligne de fondateur sans nom n’est pas une partie', () => {
  // `founders[]` accepte une ligne qui ne porte qu'un poste (filtre OU côté
  // serveur) : elle n'a rien à faire dans un contrôle de conflit.
  const parties = buildPartyCandidates({
    companySnapshot: null,
    founders: [{ name: '', status: 'cofounder', job: 'CTO' }, { name: '   ', job: 'CFO' }],
    investors: [],
  });
  assert.deepEqual(parties, []);
});

test('un investisseur simplement repéré est proposé mais pas pré-coché', () => {
  // Sur-inclure coûte quelques secondes à l'avocat ; sous-inclure coûte un
  // conflit manqué. On propose donc tout le pipeline, en ne pré-cochant que ce
  // qui a dépassé le premier contact.
  const parties = buildPartyCandidates({
    investors: [
      { name: 'Prospect Capital', investor_type: 'vc', stage: 'a_contacter' },
      { name: 'Bêta Angels', investor_type: 'ba', stage: 'contacte' },
    ],
  });
  assert.equal(parties.length, 2);
  assert.equal(parties[0].prechecked, false);
  assert.equal(parties[1].prechecked, true);
});

test('le navigateur ne peut pas s’auto-décerner le statut « vérifié »', () => {
  // Une partie ajoutée à la main qui prétendrait venir du dossier KYC vérifié
  // serait un contournement du contrôle d'identité.
  const parties = sanitizeParties([
    { name: 'Société Fantôme', source: 'ajout_fondateur', verified: true },
    { name: 'Vraie Société', source: 'societe' },
  ]);
  assert.equal(parties[0].verified, false);
  assert.equal(parties[1].verified, true);
});

test('le verrou impose l’ordre déontologique : conflit, vigilance, décision, convention', () => {
  const request = { status: 'soumise' };

  let gate = missionGate(request, { status: 'pending' });
  assert.equal(gate.step, 'conflit');
  assert.equal(gate.can_decide, false);
  assert.equal(gate.can_work, false);
  assert.equal(gate.code, 'CONFLICT_CHECK_REQUIRED');

  gate = missionGate(request, { status: 'pending', conflict_outcome: 'aucun_conflit', conflict_checked_at: 'x' });
  assert.equal(gate.step, 'vigilance');
  assert.equal(gate.can_decide, false);

  gate = missionGate(request, {
    status: 'pending', conflict_outcome: 'aucun_conflit', conflict_checked_at: 'x', vigilance_attested_at: 'y',
  });
  assert.equal(gate.step, 'decision');
  assert.equal(gate.can_decide, true);   // l'avocat peut enfin décider
  assert.equal(gate.can_work, false);    // mais toujours pas travailler

  gate = missionGate(request, acceptanceComplete({ fee_agreement_confirmed_at: null }));
  assert.equal(gate.step, 'convention');
  assert.equal(gate.can_work, false);
  assert.equal(gate.code, 'FEE_AGREEMENT_REQUIRED');

  gate = missionGate(request, acceptanceComplete());
  assert.equal(gate.step, 'diligences');
  assert.equal(gate.can_work, true);
  assert.equal(gate.code, null);
  assert.deepEqual(gate.missing, []);
});

test('une mission refusée ne rouvre jamais', () => {
  const gate = missionGate({ status: 'refusee' }, { status: 'declined', decline_reason_code: 'conflit_interets' });
  assert.equal(gate.can_work, false);
  assert.equal(gate.can_decide, false);
  assert.equal(gate.code, 'MISSION_DECLINED');
});

test('une mission annulée ou clôturée ne laisse plus passer de diligence', () => {
  for (const status of ['annule', 'cloturee']) {
    const gate = missionGate({ status }, acceptanceComplete());
    assert.equal(gate.can_work, false, `statut ${status}`);
  }
});

test('une mission engagée avant le process n’est pas interrompue en plein dossier', () => {
  // Reprise de l'existant : sans cette soupape, la mise en place du verrou
  // bloquerait un avocat au milieu d'un dossier déjà commencé.
  const gate = missionGate({ status: 'en_cours' }, { status: 'accepted', legacy: true });
  assert.equal(gate.can_work, true);
  assert.deepEqual(gate.missing, []);
  // L'état doit être cohérent : pas de « travail autorisé » affiché comme bloqué
  // à l'étape « conflit ».
  assert.equal(gate.step, 'diligences');
  assert.equal(gate.code, null);
});

test('une mission reprise mais jamais commencée suit le process complet', () => {
  // Une mission « soumise » à la reprise n'a rien engagé : aucune raison de la
  // dispenser du contrôle des conflits.
  const gate = missionGate({ status: 'soumise' }, { status: 'pending', legacy: false });
  assert.equal(gate.step, 'conflit');
  assert.equal(gate.can_work, false);
});

test('un conflit identifié interdit d’accepter la mission', () => {
  // Sans ce verrou, le contrôle de conflit ne serait qu'un formulaire.
  const refus = validateDecisionInput({ decision: 'accepted' }, { conflict_outcome: 'conflit_identifie' });
  assert.equal(refus.ok, false);
  assert.equal(refus.code, 'CONFLICT_BLOCKS_ACCEPTANCE');

  const ok = validateDecisionInput({ decision: 'accepted' }, { conflict_outcome: 'aucun_conflit' });
  assert.equal(ok.ok, true);
});

test('un conflit identifié doit être documenté', () => {
  const sansNote = validateConflictInput({
    outcome: 'conflit_identifie',
    parties_reviewed: [{ name: 'Alpha Ventures' }],
  });
  assert.equal(sansNote.ok, false);

  const avecNote = validateConflictInput({
    outcome: 'conflit_identifie',
    parties_reviewed: [{ name: 'Alpha Ventures' }],
    note: 'Le cabinet conseille déjà Alpha Ventures sur un autre dossier.',
  });
  assert.equal(avecNote.ok, true);
});

test('un contrôle de conflit sans partie contrôlée n’a pas de sens', () => {
  const vide = validateConflictInput({ outcome: 'aucun_conflit', parties_reviewed: [] });
  assert.equal(vide.ok, false);
});

test('un refus doit porter un motif connu', () => {
  assert.equal(validateDecisionInput({ decision: 'declined' }, {}).ok, false);
  assert.equal(validateDecisionInput({ decision: 'declined', reason_code: 'inventé' }, {}).ok, false);
  assert.equal(validateDecisionInput({ decision: 'declined', reason_code: 'capacite' }, {}).ok, true);
});

test('la convention exige une référence, une date de signature et un montant', () => {
  assert.equal(validateFeeAgreementInput({ confirmed: false, reference: 'C-1', signed_on: '2026-07-15' }, 180_000).ok, false);
  assert.equal(validateFeeAgreementInput({ confirmed: true, reference: '', signed_on: '2026-07-15' }, 180_000).ok, false);
  assert.equal(validateFeeAgreementInput({ confirmed: true, reference: 'C-1', signed_on: '15/07/2026' }, 180_000).ok, false);
  assert.equal(validateFeeAgreementInput({ confirmed: true, reference: 'C-1', signed_on: '2026-07-15' }, null).ok, false);
  assert.equal(validateFeeAgreementInput({ confirmed: true, reference: 'C-1', signed_on: '2026-07-15' }, 180_000).ok, true);
});

test('le fondateur voit que le contrôle a eu lieu, jamais le travail de l’avocat', () => {
  const acceptance = acceptanceComplete({
    id: 'acc-1',
    request_id: 42,
    conflict_parties: [{ name: 'Alpha Ventures' }],
    conflict_note: 'Vérifié contre la base clients du cabinet.',
    decline_reason_note: 'Note interne.',
  });

  const founderView = publicMissionAcceptance(acceptance, 'founder');
  // Ce qui le protège : la preuve que le contrôle a eu lieu, et quand.
  assert.equal(founderView.conflict_checked_at, '2026-07-15T10:00:00.000Z');
  assert.equal(founderView.vigilance_attested_at, '2026-07-15T10:01:00.000Z');
  assert.equal(founderView.fee_agreement_amount_cents, 180_000);
  // Ce qui ne le regarde pas : le travail et les sources du cabinet.
  assert.equal('conflict_note' in founderView, false);
  assert.equal('conflict_parties' in founderView, false);
  assert.equal('decline_reason_note' in founderView, false);
  assert.equal('fee_agreement_reference' in founderView, false);

  const lawyerView = publicMissionAcceptance(acceptance, 'lawyer');
  assert.equal(lawyerView.conflict_note, 'Vérifié contre la base clients du cabinet.');
  assert.equal(lawyerView.conflict_parties.length, 1);
});

test('le fondateur connaît la catégorie d’un refus, pas sa justification', () => {
  const view = publicMissionAcceptance(
    { status: 'declined', decided_at: 'z', decline_reason_code: 'conflit_interets', decline_reason_note: 'Détail interne.' },
    'founder',
  );
  assert.equal(view.decline_reason_code, 'conflit_interets');
  assert.equal('decline_reason_note' in view, false);
});

// ── Câblage serveur ───────────────────────────────────────────────────────────
// Ces tests lisent le TEXTE de server.js : ils ne prouvent pas que le code
// s'exécute, mais que le verrou n'a pas été retiré par un refactor distrait.

test('aucune diligence ne s’écrit sans passer par le verrou de mission', () => {
  // Éditer un document, le remettre au fondateur ou faire avancer le dossier sont
  // trois diligences. Chacune doit consulter missionWorkBlock AVANT d'écrire.
  const routes = [
    ["app.put('/api/lawyer/review-requests/:id/documents/:docId/editor'", "col('saas_documents').updateOne"],
    ["app.post('/api/lawyer/review-requests/:id/deliver'", "col('saas_documents').insertOne"],
    ["app.patch('/api/lawyer/review-requests/:id'", "col('saas_avocat_requests').updateOne"],
  ];
  for (const [route, write] of routes) {
    const start = serverSource.indexOf(route);
    assert.ok(start > 0, `route introuvable : ${route}`);
    const guard = serverSource.indexOf('missionWorkBlock', start);
    const writeAt = serverSource.indexOf(write, start);
    assert.ok(guard > 0 && guard < writeAt, `le verrou doit précéder l'écriture : ${route}`);
  }
});

test('la transition implicite « soumise → en_cours » a disparu', () => {
  // C'était la seule acceptation de mission qui existait : sauvegarder dans
  // l'éditeur faisait démarrer le dossier tout seul. Une mission ne démarre
  // désormais qu'après avoir été explicitement acceptée.
  assert.doesNotMatch(serverSource, /status: request\.status === 'soumise' \? 'en_cours'/);
  assert.match(serverSource, /status: request\.status === 'acceptee' \? 'en_cours'/);
});

test('les missions déjà ouvertes sont reprises sans couper un avocat en plein dossier', () => {
  // Sans reprise, le verrou bloquerait toutes les missions antérieures : elles
  // n'ont pas de dossier d'acceptation. Une mission « soumise » n'a rien commencé
  // et suit le process normal ; une mission déjà engagée est marquée `legacy`.
  const start = serverSource.indexOf('async function backfillMissionAcceptances()');
  assert.ok(start > 0, 'backfillMissionAcceptances introuvable');
  const body = serverSource.slice(start, serverSource.indexOf('\n}', start));
  assert.match(body, /const started = r\.status !== 'soumise'/);
  assert.match(body, /status: started \? 'accepted' : 'pending'/);
  assert.match(body, /legacy: started/);
  // La reprise ne réécrit jamais un dossier existant.
  assert.match(body, /known\.has\(r\.id\)/);
  assert.ok(serverSource.indexOf('await backfillMissionAcceptances()') > 0, 'reprise jamais appelée au démarrage');
});

test('clôturer n’est pas une diligence, mais suppose d’avoir accepté', () => {
  // Un avocat qui s'arrête avant la convention doit pouvoir fermer son dossier ;
  // clôturer une mission jamais acceptée reviendrait à la refuser sans motif.
  const start = serverSource.indexOf("app.patch('/api/lawyer/review-requests/:id'");
  const body = serverSource.slice(start, serverSource.indexOf('\n});', start));
  assert.match(body, /if \(status === 'cloturee'\)/);
  assert.match(body, /acceptance\?\.status !== 'accepted'/);
  assert.match(body, /MISSION_ACCEPTANCE_REQUIRED/);
});

test('les nouveaux statuts de mission existent et le refus est terminal', () => {
  const statuses = serverSource.match(/const AVOCAT_REQUEST_STATUSES = \[([^\]]+)\]/);
  assert.ok(statuses, 'AVOCAT_REQUEST_STATUSES introuvable');
  assert.match(statuses[1], /'acceptee'/);
  assert.match(statuses[1], /'refusee'/);
});

test('la note de conflit et le motif de refus sont chiffrés au repos', () => {
  // Ils peuvent révéler qui d'autre le cabinet conseille : c'est du secret
  // professionnel, pas de la métadonnée.
  const entry = encryptionSource.match(/lawyer_mission_acceptances: Object\.freeze\(\{([\s\S]*?)\}\)/);
  assert.ok(entry, 'lawyer_mission_acceptances absent de DEFAULT_FIELDS');
  assert.match(entry[1], /conflict_note: 'utf8'/);
  assert.match(entry[1], /decline_reason_note: 'utf8'/);
  assert.match(entry[1], /fee_agreement_reference: 'utf8'/);
});

test('une demande ne part pas sans parties déclarées ni confirmation du fondateur', () => {
  const start = serverSource.indexOf("app.post('/api/saas/avocat/requests'");
  const insert = serverSource.indexOf("col('saas_avocat_requests').insertOne", start);
  const body = serverSource.slice(start, insert);
  assert.match(body, /PARTIES_REQUIRED/);
  assert.match(body, /PARTIES_CONFIRMATION_REQUIRED/);
});

test('le journal de mission est alimenté aux étapes qui engagent le cabinet', () => {
  // C'est ce journal qui permet à l'avocat de prouver, des années plus tard,
  // qu'il a contrôlé les conflits avant d'accepter.
  for (const type of ['mission_soumise', 'parties_declarees', 'conflit_controle', 'vigilance_attestee',
    'mission_acceptee', 'mission_refusee', 'convention_confirmee', 'travaux_commences', 'documents_remis',
    'mission_cloturee']) {
    assert.ok(serverSource.includes(`'${type}'`), `événement jamais enregistré : ${type}`);
  }
  assert.match(serverSource, /col\('lawyer_mission_events'\)\.insertOne/);
});
