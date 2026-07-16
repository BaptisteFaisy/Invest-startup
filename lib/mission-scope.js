'use strict';

// ─── Périmètre de la mission avocat ───────────────────────────────────────────
// Le client est TOUJOURS la société (client_policy.lawyer_client = 'company').
// Or une term sheet engage aussi le fondateur À TITRE PERSONNEL : vesting,
// good/bad leaver, non-concurrence, lock-up, promesses de cession, garantie
// d'actif et de passif. Un fondateur honnête coche donc toujours « intérêts
// personnels » — bloquer la soumission sur ce seul motif rendrait TOUTE term
// sheet impossible à soumettre (et ne laisserait passer que ceux qui n'ont pas
// coché). On ne bloque donc plus : on FIGE le périmètre à la soumission, comme
// company_snapshot, et on rappelle la règle déontologique — l'avocat de la
// société ne peut pas conseiller le fondateur sur ces clauses (RIN art. 4 et 7),
// il lui faut un avocat indépendant. La note protège les trois parties :
//   • le fondateur sait, daté, quelles clauses l'engagent lui et pas la société ;
//   • l'avocat peut prouver que son mandat n'a jamais couvert ces clauses ;
//   • Liquid+ produit une trace probante sans jamais donner de conseil.
//
// Ce module reste PUR (aucun new Date(), aucun accès store) : `recorded_at` est
// fourni par l'appelant, exactement comme le reste de la logique métier testable.

// Clauses-types qui engagent le fondateur personne physique, hors mandat société.
const FOUNDER_PERSONAL_CLAUSES = [
  'vesting',
  'good/bad leaver',
  'non-concurrence',
  'lock-up',
  'promesses de cession',
  'garantie d’actif et de passif',
];

const FOUNDER_PERSONAL_INTEREST_NOTICE =
  'Cette question concerne vos intérêts personnels et n’est pas incluse dans la mission confiée par la société. Un conseil distinct peut être nécessaire.';

// Le cœur déontologique : le conseil personnel ne peut pas venir de l'avocat de
// la société sur la même opération. L'avocat indépendant doit être distinct de
// l'avocat de la société ET de son cabinet (sinon le conflit revient).
const FOUNDER_INDEPENDENT_COUNSEL_NOTICE =
  'Sur les clauses qui vous engagent personnellement (vesting, good/bad leaver, ' +
  'non-concurrence, lock-up, promesses de cession, garantie d’actif et de passif), ' +
  'l’avocat de la société ne peut pas vous conseiller à titre personnel sur la même ' +
  'opération. Un avocat indépendant, distinct de l’avocat de la société et de son ' +
  'cabinet, peut vous assister.';

// Périmètre figé à la soumission. `founderPersonalInterest` = le fondateur a
// signalé qu'une clause l'engage personnellement ; on ne bloque pas, on trace.
function buildMissionScope({ founderPersonalInterest = false, recordedAt = null } = {}) {
  const flagged = founderPersonalInterest === true;
  return {
    client: 'company',
    founder_personal_interest_flagged: flagged,
    // Les clauses personnelles restent HORS du mandat confié par la société.
    personal_interest_excluded: flagged,
    personal_clauses: flagged ? [...FOUNDER_PERSONAL_CLAUSES] : [],
    personal_interest_notice: flagged ? FOUNDER_PERSONAL_INTEREST_NOTICE : null,
    independent_counsel_notice: flagged ? FOUNDER_INDEPENDENT_COUNSEL_NOTICE : null,
    recorded_at: recordedAt,
  };
}

module.exports = {
  FOUNDER_PERSONAL_CLAUSES,
  FOUNDER_PERSONAL_INTEREST_NOTICE,
  FOUNDER_INDEPENDENT_COUNSEL_NOTICE,
  buildMissionScope,
};
