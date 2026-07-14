'use strict';

function productionConfigurationProblems(env = {}) {
  const problems = [];

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    problems.push('JWT_SECRET — absent ou < 32 caractères');
  if (!env.MONGODB_URI)
    problems.push('MONGODB_URI — absent');
  if (!env.ENCRYPTION_KEY || env.ENCRYPTION_KEY.length < 32)
    problems.push('ENCRYPTION_KEY — absent ou < 32 caractères');
  if (!env.RESEND_API_KEY)
    problems.push('RESEND_API_KEY — absente (envoi des emails de vérification impossible)');
  if (!env.EMAIL_FROM)
    problems.push('EMAIL_FROM — absent (expéditeur Resend vérifié requis)');

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
