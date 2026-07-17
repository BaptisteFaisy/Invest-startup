'use strict';

const crypto = require('node:crypto');

// ─── Convention de partenariat LIQUID+ ↔ avocat ───────────────────────────────
// Le troisième contrat du montage, et le seul qui lie l'avocat à la PLATEFORME.
// Ne pas le confondre avec les deux autres (cf. docs/strategie-integration-avocats.md
// §5 quater) :
//   • convention d'HONORAIRES  : société ↔ avocat, une par mission, obligatoire
//     (loi n° 71-1130 art. 10). Liquid+ n'y est pas partie — voir mission-acceptance.js ;
//   • CGV/CGU                  : fondateur ↔ Liquid+ ;
//   • convention de PARTENARIAT: ce module. Adhésion à la grille, aux délais et aux
//     clauses déontologiques ; c'est aussi elle qui écrit que la responsabilité
//     juridique est portée par l'avocat et non par la plateforme.
//
// L'engagement est une SIGNATURE ÉLECTRONIQUE SIMPLE (art. 1367 al. 2 C. civ.) :
// recevable, mais la charge de la preuve pèse sur Liquid+. D'où le faisceau
// conservé à l'acceptation — version, horodatage, nom saisi de la main de
// l'avocat, IP, user-agent, et surtout l'EMPREINTE du texte accepté. Sans
// l'empreinte, on prouve qu'il a accepté « quelque chose » ; avec, on prouve quoi.
//
// ⚠ RÈGLE DE VERSION : toute modification du texte OU de la grille rend caduques
// les acceptations précédentes. Il faut alors incrémenter LAWYER_PARTNERSHIP_VERSION,
// ce qui redemande sa signature à chaque avocat. Le test pinne l'empreinte des
// clauses statiques précisément pour qu'un changement silencieux casse la CI.

const LAWYER_PARTNERSHIP_VERSION = 4;

// 'draft'  → le texte n'a pas encore été relu par un avocat : la page affiche un
//            bandeau qui le dit, et l'acceptation ne vaut pas engagement.
// 'final'  → texte validé, opposable.
// Passer à 'final' EXIGE d'incrémenter la version ci-dessus : personne ne doit se
// retrouver lié par un texte définitif au motif qu'il en avait accepté le brouillon.
const LAWYER_PARTNERSHIP_STATUS = 'draft';

const MAX_SIGNED_NAME = 160;

const PARTNERSHIP_PREAMBLE = [
  'La présente convention règle les rapports entre la société éditrice de Liquid+ (« Liquid+ ») et l’avocat partenaire (« l’Avocat »). Elle ne crée aucune société, aucun mandat de représentation, ni aucune exclusivité.',
  'Elle n’est pas une convention d’honoraires : les honoraires de l’Avocat sont fixés, mission par mission, dans une convention distincte conclue directement entre l’Avocat et la société cliente, à laquelle Liquid+ n’est pas partie.',
];

// Les clauses. L'ordre est celui de lecture : ce que fait Liquid+, ce que fait
// l'Avocat, puis ce que ni l'un ni l'autre ne fait.
const PARTNERSHIP_SECTIONS = [
  {
    key: 'objet',
    title: 'Article 1 — Objet',
    clauses: [
      'Liquid+ édite un logiciel d’accompagnement à la levée de fonds et met à la disposition de l’Avocat un dossier client préparé en amont (identité de la société, actionnariat déclaré, parties en présence, pièces).',
      'Liquid+ présente à l’Avocat des sociétés clientes susceptibles d’avoir besoin d’un conseil. L’Avocat reste libre d’accepter ou de refuser chaque mise en relation, sans avoir à se justifier.',
      'Liquid+ ne fournit aucune prestation juridique et ne se présente jamais comme telle.',
    ],
  },
  {
    key: 'independance',
    title: 'Article 2 — Indépendance de l’Avocat',
    clauses: [
      'L’Avocat exerce en toute indépendance. Aucune instruction de Liquid+ ne peut porter sur le contenu de son conseil, sur l’opportunité d’une mission, ni sur l’issue d’un dossier.',
      'L’Avocat peut refuser une mission pour tout motif légal, déontologique, de conflit d’intérêts, de compétence ou de capacité. Un refus n’a aucune conséquence sur la relation de partenariat.',
      'Le client de l’Avocat est la société cliente, jamais Liquid+. Le mandat est direct.',
    ],
  },
  {
    key: 'honoraires',
    title: 'Article 3 — Honoraires : aucun partage, aucune marge',
    clauses: [
      'Liquid+ ne perçoit aucune part, aucune commission ni aucune rétrocession sur les honoraires de l’Avocat, conformément à l’interdiction du partage d’honoraires (RIN art. 11.3).',
      'Les honoraires sont encaissés par l’Avocat. Lorsqu’un paiement transite techniquement par Liquid+, il est routé vers l’Avocat sans que Liquid+ n’en retienne quoi que ce soit et sans maniement de fonds.',
      'La rémunération de Liquid+ provient exclusivement de son propre contrat avec la société cliente, pour sa prestation de logiciel.',
    ],
  },
  {
    key: 'grille',
    title: 'Article 4 — Grille tarifaire et délais',
    clauses: [
      'L’Avocat adhère à la grille commune ci-dessous, identique pour tous les partenaires : il n’y a donc, au sein du réseau, aucune concurrence par les prix et aucun classement des avocats entre eux.',
      'La grille fixe un plafond, jamais un plancher : l’Avocat reste libre de pratiquer un honoraire inférieur, et fixe le montant exact dans sa convention d’honoraires avec la société.',
      'Toute évolution de la grille fait l’objet d’une nouvelle version de la présente convention, soumise à l’acceptation de l’Avocat. Une grille modifiée ne lui est jamais opposable sans son accord.',
    ],
  },
  {
    key: 'qualite',
    title: 'Article 5 — Qualité et capacité',
    clauses: [
      'L’Avocat déclare être régulièrement inscrit à un barreau français, à jour de sa responsabilité civile professionnelle, et compétent dans les matières pour lesquelles il accepte des missions.',
      'L’Avocat s’engage à ne pas accepter davantage de missions qu’il ne peut en traiter dans les délais annoncés, et à signaler sans délai toute indisponibilité.',
      'L’Avocat informe Liquid+ de toute suspension, omission ou radiation affectant son inscription.',
    ],
  },
  {
    key: 'responsabilite',
    title: 'Article 6 — Responsabilité',
    clauses: [
      'La responsabilité juridique des conseils, actes et diligences est portée par l’Avocat seul, couverte par sa responsabilité civile professionnelle.',
      'Liquid+ ne relit pas, ne valide pas et n’assume pas le travail de l’Avocat. Sa responsabilité se limite à la disponibilité et au fonctionnement de son logiciel.',
      'Les contenus produits par les fonctions d’intelligence artificielle de Liquid+ sont des aides à la rédaction. Ils ne constituent pas un conseil juridique et n’engagent pas l’Avocat qui les relit.',
    ],
  },
  {
    key: 'secret',
    title: 'Article 7 — Secret professionnel et confidentialité',
    clauses: [
      'Les correspondances couvertes par le secret professionnel entre l’Avocat et la société cliente s’échangent par email ou par l’e-Partage sécurisé du CNB, hors de Liquid+ : Liquid+ ne les héberge pas et n’y a pas accès.',
      'Les pièces de la mission et les documents remis sont hébergés par Liquid+ dans l’espace documentaire de la société, chiffrés au repos. Liquid+ n’accède à leur contenu que dans la stricte mesure nécessaire au fonctionnement du service (dépôt, restitution, remise) et ne l’exploite à aucune autre fin.',
      'L’Avocat ne fait transiter par Liquid+ que les documents de travail de la mission ; ses correspondances et conseils confidentiels avec le client empruntent l’email ou l’e-Partage du CNB.',
    ],
  },
  {
    key: 'conflits',
    title: 'Article 8 — Conflits d’intérêts et vigilance',
    clauses: [
      'Le contrôle des conflits d’intérêts (RIN art. 4 et 7) et la vigilance LCB-FT (art. L561-2 CMF) sont des obligations personnelles de l’Avocat. Liquid+ ne les exécute pas à sa place.',
      'Liquid+ fournit à l’Avocat les éléments dont elle dispose (parties déclarées, pièces d’immatriculation) et conserve l’attestation horodatée que le contrôle a eu lieu, jamais son contenu.',
      'L’identification du client et de son bénéficiaire effectif incombe à l’Avocat, avant l’entrée en relation d’affaires.',
    ],
  },
  {
    key: 'donnees',
    title: 'Article 9 — Données personnelles',
    clauses: [
      'Liquid+ et l’Avocat sont chacun responsable de traitement pour les traitements qu’il détermine ; aucun n’agit comme sous-traitant de l’autre.',
      'Chaque partie applique le RGPD aux données auxquelles elle accède, et notifie l’autre sans délai de toute violation susceptible d’affecter ses données.',
    ],
  },
  {
    key: 'duree',
    title: 'Article 10 — Durée et résiliation',
    clauses: [
      'La convention prend effet à son acceptation et se poursuit sans durée déterminée. Le partenariat est gratuit : aucun abonnement n’est dû par l’Avocat à ce jour.',
      'Chaque partie peut y mettre fin à tout moment, sans préavis ni indemnité, par simple notification.',
      'La fin du partenariat est sans effet sur les missions en cours, que l’Avocat mène à leur terme avec ses clients : la relation d’affaires est la sienne, pas celle de Liquid+.',
    ],
  },
];

function clip(value, max) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// Comparaison de noms insensible à la casse et aux accents : on vérifie que
// l'avocat a retapé SON nom, pas qu'il sait copier une chaîne à l'octet près.
function nameFingerprint(value) {
  return clip(value, MAX_SIGNED_NAME)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Rend la grille en clauses lisibles (cf. AVOCAT_PRESTATIONS dans server.js).
// Quatre cas, du plus engageant au moins engageant : un plafond publié ; un
// forfait INDICATIF par type de levée (grille tarifaire de la homepage), que la
// convention d'honoraires confirme mission par mission ; une prestation sur
// devis par principe (offre à la carte) ; aucun tarif publié — on l'écrit noir
// sur blanc plutôt que d'afficher un prix vide : un avocat ne peut pas adhérer
// à une grille fantôme.
function grilleLines(prestations) {
  const lines = (Array.isArray(prestations) ? prestations : []).map(p => {
    const price = Number.isSafeInteger(p?.fee_cap_cents)
      ? `plafond ${(p.fee_cap_cents / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} TTC`
      : p?.price_by_raise_type
        ? `forfait indicatif ${clip(p.price_by_raise_type['bsa-air'], 80)} (levée BSA-AIR) ou ${clip(p.price_by_raise_type.classic, 80)} (levée classique), confirmé dans la convention d’honoraires`
        : p?.quote_based === true
          ? 'sur devis : honoraires arrêtés dans la convention d’honoraires conclue avec la société cliente, mission par mission'
          : 'tarif non publié à ce jour';
    return `${clip(p?.label, 200)} — ${price} · délai : ${clip(p?.delay, 80) || 'à convenir'}`;
  });
  if (!lines.length) return ['Aucune prestation n’est inscrite à la grille à ce jour.'];
  lines.push('Aucun plafond n’étant arrêté à ce jour, l’Avocat fixe librement ses honoraires avec la société cliente ; les forfaits ci-dessus sont indicatifs. La grille chiffrée définitive fera l’objet d’une version ultérieure de la présente convention, soumise à son acceptation.');
  return lines;
}

// Construit le document tel qu'il sera lu ET signé. Fonction pure : c'est elle
// qui définit ce sur quoi porte l'empreinte.
function buildPartnershipDocument(prestations) {
  return {
    version: LAWYER_PARTNERSHIP_VERSION,
    status: LAWYER_PARTNERSHIP_STATUS,
    title: 'Convention de partenariat Liquid+ — Avocat',
    preamble: PARTNERSHIP_PREAMBLE,
    sections: PARTNERSHIP_SECTIONS.map(section => ({
      key: section.key,
      title: section.title,
      clauses: section.key === 'grille'
        ? [...section.clauses, ...grilleLines(prestations)]
        : [...section.clauses],
    })),
  };
}

// Sérialisation canonique : deux documents identiques donnent la même empreinte,
// indépendamment de l'ordre des clés JSON. C'est ce qui est signé.
function partnershipDocumentHash(document) {
  const canonical = [
    `v${document.version}`,
    document.status,
    document.title,
    ...document.preamble,
    ...document.sections.flatMap(section => [section.title, ...section.clauses]),
  ].join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function partnershipAccepted(user) {
  return Number(user?.lawyer_partnership_version) === LAWYER_PARTNERSHIP_VERSION;
}

// L'acceptation n'est valable que si l'avocat vise la version qu'on lui a
// affichée : accepter une v1 pendant qu'une v2 est en ligne ne l'engage sur rien.
function validatePartnershipAcceptance(body, expectedName) {
  if (Number(body?.version) !== LAWYER_PARTNERSHIP_VERSION) {
    return { ok: false, error: 'La convention a changé depuis son affichage. Rechargez la page et relisez-la.', code: 'PARTNERSHIP_VERSION_STALE' };
  }
  if (body?.accepted !== true) {
    return { ok: false, error: 'Vous devez accepter la convention de partenariat pour continuer.' };
  }
  const signedName = clip(body?.signed_name, MAX_SIGNED_NAME);
  if (!signedName) {
    return { ok: false, error: 'Saisissez vos nom et prénom pour signer.' };
  }
  const expected = nameFingerprint(expectedName);
  // Un profil sans nom ne doit pas ouvrir la porte à n'importe quelle saisie :
  // sans référence, il n'y a rien à confronter, donc rien à prouver.
  if (!expected) {
    return { ok: false, error: 'Complétez vos nom et prénom dans votre profil avant de signer.', code: 'LAWYER_PROFILE_REQUIRED' };
  }
  if (nameFingerprint(signedName) !== expected) {
    return { ok: false, error: 'Le nom saisi ne correspond pas à celui de votre profil.' };
  }
  return { ok: true, value: { signed_name: signedName } };
}

// Le faisceau de preuve. `document_hash` est l'élément décisif : il fige le texte
// exact accepté, y compris la grille du jour.
function partnershipAcceptanceRecord({ signedName, documentHash, ip, userAgent, now }) {
  return {
    lawyer_partnership_version: LAWYER_PARTNERSHIP_VERSION,
    lawyer_partnership_status: LAWYER_PARTNERSHIP_STATUS,
    lawyer_partnership_accepted_at: now,
    lawyer_partnership_signed_name: signedName,
    lawyer_partnership_document_hash: documentHash,
    lawyer_partnership_ip: clip(ip, 64),
    lawyer_partnership_user_agent: clip(userAgent, 300),
  };
}

// Vue rendue à l'avocat. L'IP et le user-agent conservés le concernent, mais ne
// lui apprennent rien : on ne les renvoie pas.
function publicPartnership(user, document) {
  return {
    document,
    version: LAWYER_PARTNERSHIP_VERSION,
    status: LAWYER_PARTNERSHIP_STATUS,
    accepted: partnershipAccepted(user),
    accepted_at: user?.lawyer_partnership_accepted_at || null,
    signed_name: user?.lawyer_partnership_signed_name || '',
    signed_version: Number(user?.lawyer_partnership_version) || null,
  };
}

module.exports = {
  LAWYER_PARTNERSHIP_VERSION,
  LAWYER_PARTNERSHIP_STATUS,
  buildPartnershipDocument,
  partnershipDocumentHash,
  partnershipAccepted,
  validatePartnershipAcceptance,
  partnershipAcceptanceRecord,
  publicPartnership,
};
