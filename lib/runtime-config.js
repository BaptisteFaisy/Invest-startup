'use strict';

function productionConfigurationProblems(env = {}) {
  const problems = [];

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET — absent ou < 32 caractères');
  if (!env.MONGODB_URI)
    problems.push('MONGODB_URI — absent');
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32)
    problems.push('ENCRYPTION_KEY — absent ou < 32 caractères');

  // Les intégrations externes doivent échouer au niveau de leur fonctionnalité,
  // sans rendre le site public indisponible. L'inscription refuse déjà de créer
  // un compte lorsque Resend n'est pas configuré.
  if (!env.STRIPE_SECRET_KEY)
    problems.push('STRIPE_SECRET_KEY — absente (paiements Liquid+ et avocat impossibles)');
  if (!env.STRIPE_WEBHOOK_SECRET)
    problems.push('STRIPE_WEBHOOK_SECRET — absent (activation Liquid+ non vérifiable)');
  if (!env.STRIPE_CONNECT_WEBHOOK_SECRET)
    problems.push('STRIPE_CONNECT_WEBHOOK_SECRET — absent (paiements avocat non vérifiables)');

  if (!env.BASE_URL) {
    problems.push('BASE_URL — absente (les liens de vérification seraient invalides)');
  } else {
    try {
      const baseUrl = new URL(env.BASE_URL);
      if (baseUrl.protocol !== 'https:')
        problems.push('BASE_URL — doit utiliser HTTPS en production');
      if (['localhost', '127.0.0.1', '::1'].includes(baseUrl.hostname))
        problems.push('BASE_URL — doit désigner le domaine public en production');
    } catch {
      problems.push('BASE_URL — URL invalide');
    }
  }

  return problems;
}

module.exports = { productionConfigurationProblems };
