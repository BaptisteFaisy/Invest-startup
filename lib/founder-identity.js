'use strict';

const crypto = require('node:crypto');

// Nom de startup normalisé : « Acme SAS », « acme-sas » et « ACME  SAS » sont le
// même nom. Les accents et tout ce qui n'est ni lettre ni chiffre disparaissent,
// pour qu'une variation de casse ou de ponctuation ne contourne pas l'unicité.
function companyNameKey(name) {
  return String(name || '')
    // Retire les accents détachés par NFD. Le regex est écrit en échappements
    // ASCII : des caractères combinants littéraux dans la source ne
    // survivraient pas à un ré-encodage du fichier.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

// Empreinte d'une identité (email ou nom de startup). HMAC et non hash simple :
// sans le secret, un tiers qui lirait la base ne pourrait pas tester un email au
// dictionnaire pour savoir s'il a déjà eu un compte.
function identityHash(secret, kind, value) {
  return crypto.createHmac('sha256', String(secret))
    .update('founder-identity:' + kind + ':' + value)
    .digest('hex');
}

module.exports = { companyNameKey, identityHash };
