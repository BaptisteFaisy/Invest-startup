'use strict';

// ─── Acceptation d'une mission par l'avocat ───────────────────────────────────
// La déontologie impose un ORDRE, et c'est tout l'objet de ce module :
//   1. contrôle des conflits d'intérêts  (RIN art. 4 et 7) — avant toute chose,
//      et à refaire à chaque mission : les parties adverses changent ;
//   2. vigilance LCB-FT                  (art. L561-2 CMF) — obligation
//      PERSONNELLE de l'avocat : Liquid+ ne peut pas la faire à sa place et n'en
//      conserve que l'attestation horodatée, jamais le contenu ;
//   3. décision d'accepter ou de refuser (liberté de choix, refus toujours possible) ;
//   4. convention d'honoraires écrite    (loi n° 71-1130 art. 10) ;
//   5. diligences.
//
// `missionGate` est la SEULE source de vérité du verrou. Tout endpoint qui laisse
// l'avocat travailler doit la consulter AVANT d'écrire.
//
// Accepter le CLIENT (lawyer_client_proposals) et accepter la MISSION sont deux
// décisions distinctes : la première ouvre la relation, la seconde engage sur un
// dossier précis. Ce module ne traite que la seconde.

const MISSION_ACCEPTANCE_STATUSES = ['pending', 'accepted', 'declined'];

// Motifs de refus. L'avocat refuse librement et n'a pas à se justifier ; la
// catégorie sert seulement à dire au fondateur s'il doit trouver un autre cabinet
// (conflit) ou corriger son dossier.
const MISSION_DECLINE_REASONS = ['conflit_interets', 'deontologique', 'capacite', 'competence', 'autre'];

// Deux issues, pas trois : un conflit « potentiel » n'est pas un état stable. Soit
// l'avocat le lève et il n'y a pas de conflit, soit il en identifie un et refuse.
const CONFLICT_OUTCOMES = ['aucun_conflit', 'conflit_identifie'];

const PARTY_SOURCES = ['societe', 'representant_legal', 'fondateur', 'investisseur', 'ajout_fondateur', 'ajout_avocat'];

// Un investisseur au stade « à contacter » n'est encore lié à rien : ce n'est pas
// une partie en présence. Dès le premier contact, il en devient une. Le seuil est
// volontairement bas : sur-inclure coûte quelques secondes de vérification à
// l'avocat, sous-inclure coûte un conflit manqué.
const INVESTOR_STAGE_NOT_A_PARTY = 'a_contacter';

const FOUNDER_STATUS_LABELS = {
  cofounder: 'Co-fondateur',
  'late-cofounder': 'Late co-fondateur',
  investor: 'Investisseur au capital',
};

const INVESTOR_TYPE_LABELS = {
  ba: 'Business angel',
  vc: 'Fonds',
  love_money: 'Love money',
};

const MAX_PARTIES = 60;
const MAX_PARTY_NAME = 160;
const MAX_PARTY_DETAIL = 160;
const MAX_NOTE = 2000;
const MAX_FEE_REFERENCE = 160;

function clip(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// Comparaison de noms insensible à la casse et aux accents, pour dédupliquer
// « René Léger » et « rene leger » sans les traiter comme deux parties.
function nameFingerprint(value) {
  return clip(value, MAX_PARTY_NAME)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function partyKeyFor(source, name) {
  const slug = nameFingerprint(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${source}:${slug}`;
}

// Construit la liste des parties proposées au fondateur à partir de ce que
// Liquid+ sait DÉJÀ. Fonction pure : c'est elle qui décide de ce qui est présenté
// comme « vérifié » (identité contrôlée par Liquid+) ou « déclaré » (le fondateur
// l'a saisi, personne ne l'a contrôlé). Cette différence de statut probatoire est
// visible par l'avocat, qui doit savoir sur quoi il s'appuie.
//
// Les sources sont poussées par ordre de valeur probante décroissante : en cas de
// doublon (le représentant légal est souvent aussi un fondateur déclaré), la
// première occurrence gagne.
function buildPartyCandidates({ companySnapshot, investors, founders } = {}) {
  const candidates = [];
  const seen = new Set();

  const push = ({ name, detail, role, source, verified, prechecked }) => {
    const cleanName = clip(name, MAX_PARTY_NAME);
    if (!cleanName) return; // un nom vide n'est pas une partie
    const fingerprint = nameFingerprint(cleanName);
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    candidates.push({
      key: partyKeyFor(source, cleanName),
      name: cleanName,
      detail: clip(detail, MAX_PARTY_DETAIL),
      role,
      source,
      verified: !!verified,
      prechecked: !!prechecked,
    });
  };

  // 1. La société cliente et son représentant légal : seules données dont
  //    l'identité a été vérifiée par Liquid+ (KYC + preuve d'immatriculation).
  if (companySnapshot) {
    push({
      name: companySnapshot.company_name,
      detail: companySnapshot.siren ? `SIREN ${companySnapshot.siren}` : '',
      role: 'Société cliente',
      source: 'societe',
      verified: true,
      prechecked: true,
    });
    push({
      name: companySnapshot.legal_representative_name,
      detail: companySnapshot.legal_representative_title || '',
      role: 'Représentant légal',
      source: 'representant_legal',
      verified: true,
      prechecked: true,
    });
  }

  // 2. Fondateurs et associés déclarés au profil de levée. `name` y est facultatif
  //    (une ligne peut ne porter qu'un poste) : on écarte les lignes sans nom.
  for (const founder of Array.isArray(founders) ? founders : []) {
    push({
      name: founder?.name,
      detail: clip(founder?.job, MAX_PARTY_DETAIL),
      role: FOUNDER_STATUS_LABELS[founder?.status] || 'Associé déclaré',
      source: 'fondateur',
      verified: false,
      prechecked: true,
    });
  }

  // 3. Pipeline investisseurs. C'est un outil de prospection : tout le monde n'y
  //    est pas une partie. On les propose tous, mais seuls ceux qui ont dépassé le
  //    premier contact sont pré-cochés — le fondateur tranche.
  for (const investor of Array.isArray(investors) ? investors : []) {
    const firm = clip(investor?.firm, MAX_PARTY_DETAIL);
    push({
      name: investor?.name,
      detail: firm,
      role: INVESTOR_TYPE_LABELS[investor?.investor_type] || 'Investisseur',
      source: 'investisseur',
      verified: false,
      prechecked: investor?.stage !== INVESTOR_STAGE_NOT_A_PARTY,
    });
  }

  return candidates.slice(0, MAX_PARTIES);
}

// Normalise les parties telles que le fondateur les valide au moment de la
// demande. Toute partie ajoutée à la main est marquée comme déclarée : rien de ce
// que saisit un fondateur n'est « vérifié ».
function sanitizeParties(input) {
  const parties = [];
  const seen = new Set();
  for (const raw of Array.isArray(input) ? input : []) {
    const name = clip(raw?.name, MAX_PARTY_NAME);
    if (!name) continue;
    const fingerprint = nameFingerprint(name);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const source = PARTY_SOURCES.includes(raw?.source) ? raw.source : 'ajout_fondateur';
    parties.push({
      key: partyKeyFor(source, name),
      name,
      detail: clip(raw?.detail, MAX_PARTY_DETAIL),
      role: clip(raw?.role, MAX_PARTY_DETAIL) || 'Partie déclarée',
      source,
      // Seules la société et son représentant légal sortent du dossier vérifié par
      // Liquid+. Le navigateur ne peut pas s'auto-décerner ce statut.
      verified: ['societe', 'representant_legal'].includes(source),
    });
    if (parties.length >= MAX_PARTIES) break;
  }
  return parties;
}

function conflictChecked(acceptance) {
  return !!acceptance?.conflict_checked_at && CONFLICT_OUTCOMES.includes(acceptance?.conflict_outcome);
}

function vigilanceAttested(acceptance) {
  return !!acceptance?.vigilance_attested_at;
}

function feeAgreementConfirmed(acceptance) {
  return !!acceptance?.fee_agreement_confirmed_at
    && !!acceptance?.fee_agreement_reference
    && Number.isSafeInteger(acceptance?.fee_agreement_amount_cents);
}

// Une mission close, annulée ou refusée ne rouvre pas : plus aucune diligence.
const REQUEST_STATUSES_WITHOUT_WORK = ['refusee', 'cloturee', 'annule'];

// Le verrou. `payment` n'entre volontairement PAS dans le calcul : la convention
// d'honoraires est un fait juridique entre la société et l'avocat, indépendant du
// moyen de paiement. Un cabinet qui facture par virement et n'a jamais ouvert de
// compte Stripe doit pouvoir travailler normalement — seul l'encaissement par
// carte via Liquid+ lui reste fermé.
function missionGate(request, acceptance) {
  const missing = [];
  const status = acceptance?.status || 'pending';

  if (request && REQUEST_STATUSES_WITHOUT_WORK.includes(request.status)) {
    return {
      step: status === 'declined' ? 'refusee' : 'close',
      can_decide: false,
      can_work: false,
      missing: [],
      code: status === 'declined' ? 'MISSION_DECLINED' : null,
    };
  }

  if (status === 'declined') {
    return { step: 'refusee', can_decide: false, can_work: false, missing: [], code: 'MISSION_DECLINED' };
  }

  // Mission engagée avant la mise en place du process : on ne coupe pas un avocat
  // au milieu d'un dossier. Sa convention existe hors Liquid+ ; les missions
  // suivantes du même cabinet suivront le parcours complet.
  if (acceptance?.legacy && status === 'accepted') {
    return { step: 'diligences', can_decide: false, can_work: true, missing: [], code: null };
  }

  if (!conflictChecked(acceptance)) missing.push('conflict_check');
  if (!vigilanceAttested(acceptance)) missing.push('vigilance_attestation');

  const canDecide = status === 'pending' && missing.length === 0;

  if (status !== 'accepted') missing.push('mission_decision');
  // Reprise de l'existant : une mission déjà engagée avant la mise en place du
  // process n'est pas interrompue en plein dossier (cf. `legacy` au backfill).
  const conventionRequired = !acceptance?.legacy;
  if (conventionRequired && !feeAgreementConfirmed(acceptance)) missing.push('fee_agreement');

  const canWork = status === 'accepted' && (!conventionRequired || feeAgreementConfirmed(acceptance));

  let step = 'diligences';
  if (!conflictChecked(acceptance)) step = 'conflit';
  else if (!vigilanceAttested(acceptance)) step = 'vigilance';
  else if (status !== 'accepted') step = 'decision';
  else if (!canWork) step = 'convention';

  const CODE_BY_STEP = {
    conflit: 'CONFLICT_CHECK_REQUIRED',
    vigilance: 'VIGILANCE_ATTESTATION_REQUIRED',
    decision: 'MISSION_ACCEPTANCE_REQUIRED',
    convention: 'FEE_AGREEMENT_REQUIRED',
  };

  return { step, can_decide: canDecide, can_work: canWork, missing, code: CODE_BY_STEP[step] || null };
}

// Vue d'une acceptation. Le fondateur a le droit de savoir QUE le contrôle a eu
// lieu et QUAND — c'est ce qui le protège. Il n'a pas à voir le travail de
// l'avocat : ni la note de contrôle, ni les parties effectivement vérifiées (qui
// peuvent révéler ce que le cabinet sait par ailleurs), ni la justification
// interne d'un refus. Seule la catégorie du refus lui est due.
function publicMissionAcceptance(acceptance, role) {
  if (!acceptance) return null;
  const shared = {
    status: acceptance.status,
    conflict_checked_at: acceptance.conflict_checked_at || null,
    vigilance_attested_at: acceptance.vigilance_attested_at || null,
    fee_agreement_confirmed_at: acceptance.fee_agreement_confirmed_at || null,
    fee_agreement_signed_on: acceptance.fee_agreement_signed_on || null,
    fee_agreement_amount_cents: Number.isSafeInteger(acceptance.fee_agreement_amount_cents)
      ? acceptance.fee_agreement_amount_cents
      : null,
    decided_at: acceptance.decided_at || null,
    decline_reason_code: acceptance.decline_reason_code || null,
    legacy: !!acceptance.legacy,
  };
  if (role !== 'lawyer') return shared;
  return {
    ...shared,
    id: acceptance.id,
    request_id: acceptance.request_id,
    conflict_outcome: acceptance.conflict_outcome || null,
    conflict_parties: Array.isArray(acceptance.conflict_parties) ? acceptance.conflict_parties : [],
    conflict_note: acceptance.conflict_note || '',
    fee_agreement_reference: acceptance.fee_agreement_reference || '',
    decline_reason_note: acceptance.decline_reason_note || '',
    created_at: acceptance.created_at,
    updated_at: acceptance.updated_at,
  };
}

function validateConflictInput(body) {
  const outcome = String(body?.outcome || '');
  if (!CONFLICT_OUTCOMES.includes(outcome)) {
    return { ok: false, error: 'Indiquez le résultat du contrôle des conflits d’intérêts.' };
  }
  const parties = sanitizeParties(body?.parties_reviewed);
  if (!parties.length) {
    return { ok: false, error: 'Indiquez au moins une partie contrôlée.' };
  }
  const note = clip(body?.note, MAX_NOTE);
  // Un conflit identifié doit être documenté : c'est la trace qui justifie le refus.
  if (outcome === 'conflit_identifie' && !note) {
    return { ok: false, error: 'Décrivez le conflit identifié : cette note justifie le refus de la mission.' };
  }
  return { ok: true, value: { outcome, parties, note } };
}

function validateFeeAgreementInput(body, amountCents) {
  if (body?.confirmed !== true) {
    return { ok: false, error: 'Confirmez que la convention d’honoraires est signée par la société.' };
  }
  const reference = clip(body?.reference, MAX_FEE_REFERENCE);
  if (!reference) {
    return { ok: false, error: 'Indiquez la référence de la convention d’honoraires signée.' };
  }
  const signedOn = String(body?.signed_on || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signedOn)) {
    return { ok: false, error: 'Indiquez la date de signature de la convention (AAAA-MM-JJ).' };
  }
  if (!Number.isSafeInteger(amountCents) || amountCents < 100) {
    return { ok: false, error: 'Indiquez le montant total TTC prévu par la convention.' };
  }
  return { ok: true, value: { reference, signed_on: signedOn, amount_cents: amountCents } };
}

// Verrou métier central : un conflit identifié ne laisse pas le choix. L'avocat
// qui a constaté un conflit ne peut pas accepter la mission — sinon le contrôle ne
// serait qu'un formulaire.
function validateDecisionInput(body, acceptance) {
  const decision = String(body?.decision || '');
  if (!['accepted', 'declined'].includes(decision)) {
    return { ok: false, error: 'Décision invalide.' };
  }
  if (decision === 'accepted') {
    if (acceptance?.conflict_outcome === 'conflit_identifie') {
      return {
        ok: false,
        error: 'Vous avez identifié un conflit d’intérêts : cette mission ne peut pas être acceptée.',
        code: 'CONFLICT_BLOCKS_ACCEPTANCE',
      };
    }
    return { ok: true, value: { decision } };
  }
  const reasonCode = String(body?.reason_code || '');
  if (!MISSION_DECLINE_REASONS.includes(reasonCode)) {
    return { ok: false, error: 'Indiquez le motif du refus.' };
  }
  return {
    ok: true,
    value: { decision, reason_code: reasonCode, reason_note: clip(body?.reason_note, MAX_NOTE) },
  };
}

module.exports = {
  MISSION_ACCEPTANCE_STATUSES,
  MISSION_DECLINE_REASONS,
  CONFLICT_OUTCOMES,
  PARTY_SOURCES,
  INVESTOR_STAGE_NOT_A_PARTY,
  MAX_PARTIES,
  buildPartyCandidates,
  sanitizeParties,
  missionGate,
  publicMissionAcceptance,
  validateConflictInput,
  validateFeeAgreementInput,
  validateDecisionInput,
};
