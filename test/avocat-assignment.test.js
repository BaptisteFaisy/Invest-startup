'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const avocatHtml = fs.readFileSync(path.join(root, 'Saas', 'avocat.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

const preferenceRoute = serverSource.slice(
  serverSource.indexOf("app.put('/api/saas/avocat/preference'"),
  serverSource.indexOf("app.post('/api/saas/avocat/requests'"),
);

// Invariant : un avocat attribué reste attribué tant que Liquid+ ne lève pas
// l'attribution. Aucun mode accepté par /preference n'est 'platform', donc toute
// écriture depuis cette route détacherait le cabinet de ses missions en cours.
test('les préférences avocat refusent d’écrire tant qu’une attribution est en cours', () => {
  assert.ok(preferenceRoute, 'route /preference introuvable');
  const guard = preferenceRoute.indexOf("status: 'assigned'");
  const write = preferenceRoute.indexOf("col('saas_avocat').updateOne");
  assert.ok(guard > 0, 'le garde-fou d’attribution est absent');
  assert.ok(write > guard, 'l’écriture doit se faire après le garde-fou');
  assert.match(preferenceRoute, /PLATFORM_LAWYER_ASSIGNED/);
  assert.match(preferenceRoute.slice(guard, write), /res\.status\(409\)/);
});

test('déclarer son propre avocat n’est proposé nulle part, ni accepté par le serveur', () => {
  // Le mode 'own' n'est plus une valeur acceptable : l'avocat est attribué ou choisi.
  assert.match(preferenceRoute, /\['assigned', 'chosen'\]\.includes\(body\.mode\)/);
  assert.doesNotMatch(preferenceRoute, /mode === 'own'/);
  // Et la route ne lit plus d'avocat déclaré dans le corps de la requête.
  assert.doesNotMatch(preferenceRoute, /body\?\.own_lawyer/);

  // Aucune trace de l'offre côté interface : ni bouton, ni option du sélecteur.
  for (const trace of ['declare-own', 'pick-own', 'own-fields', '__own__', 'J\'ai déjà mon avocat']) {
    assert.ok(!avocatHtml.includes(trace), `l’interface propose encore : ${trace}`);
  }
  assert.ok(!avocatHtml.includes("mode: 'own'"), 'l’interface envoie encore le mode own');
});

test('le script de la page avocat reste valide et ne référence aucun élément supprimé', () => {
  const scripts = [...avocatHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const inline = scripts.find(code => code.includes('function renderLawyer'));
  assert.ok(inline, 'renderLawyer introuvable');
  assert.doesNotThrow(() => new vm.Script(inline, { filename: 'avocat.html' }));

  // Un id déréférencé immédiatement — getElementById('x').addEventListener(…) — doit
  // exister dans le markup, sinon l'appel lève sur null et emporte tout le câblage de la
  // page. Les accès gardés (const el = …; if (el)) restent licites et ne sont pas visés.
  const dereferenced = [...inline.matchAll(/getElementById\('([^']+)'\)\s*\./g)].map(match => match[1]);
  const missing = [...new Set(dereferenced)].filter(id => !avocatHtml.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `déréférencés sans exister dans le markup : ${missing.join(', ')}`);

  // Le changement d'un avocat attribué passe par la demande arbitrée, jamais par le sélecteur.
  const render = inline.slice(inline.indexOf('function renderLawyer'), inline.indexOf('function renderPrestations'));
  assert.match(render, /if \(isPlatformLawyer\) requestPlatformLawyerChange\(\);/);
});

// L'avocat prononce lui-même l'attribution en acceptant : 'proposed' passe directement
// à 'assigned'. Une étape d'attribution par l'admin serait donc inatteignable.
test('aucune étape d’attribution par l’admin ne subsiste', () => {
  assert.ok(!serverSource.includes("client-proposals/:id/assign"), 'la route admin d’attribution existe encore');
  assert.ok(!adminHtml.includes('data-assign'), 'le bouton admin « Attribuer » existe encore');
  assert.match(serverSource, /const nextStatus = status === 'accepted' \? 'assigned' : 'declined';/);
});

// Freemium : le SaaS ne se ferme plus jamais avec le temps. Ce qui se paie est
// la SORTIE du document et l'assistant IA au-delà de l'enveloppe incluse — pas
// l'accès lui-même. Cette garde empêche le retour d'un mur temporel.
test('aucun accès fondateur ne se ferme avec le temps', () => {
  assert.match(serverSource, /app\.use\('\/api\/saas', requireAuth\);/);
  assert.doesNotMatch(serverSource, /requireFounderAccess/);
  assert.doesNotMatch(serverSource, /TRIAL_EXPIRED/);
  assert.doesNotMatch(serverSource, /FOUNDER_TRIAL_MS|trial_used_ms|trial_started_at/);

  // founderAccess ne renvoie plus jamais blocked:true pour un compte gratuit.
  const access = serverSource.slice(
    serverSource.indexOf('function founderAccess(user)'),
    serverSource.indexOf('function hasAccountTypes(user)'),
  );
  assert.ok(access, 'founderAccess introuvable');
  assert.doesNotMatch(access, /blocked: true/);
  // Paywall désactivé : tout compte fondateur, payé ou non, est actif.
  assert.match(access, /status: 'active', blocked: false/);
});
