#!/usr/bin/env node
// Rend chaque page et rapporte où atterrit le sélecteur de langue.
// Sert à vérifier qu'il est proposé partout, et à voir sous quelle forme.
//
//   node i18n/audit.js          pages telles quelles
//   node i18n/audit.js --auth   simule une session vérifiée (l'outil révèle
//                               son interface après l'appel à /api/auth/me)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole, requestInterceptor } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'uploads', 'ressourcegraphique', 'ressource tech', 'docs', 'test', 'i18n', 'liquid-uploader-extension']);
const SKIP_PATH = /Saas[\/\\]ressources[\/\\]modeles/;
const SIMULATE_AUTH = process.argv.includes('--auth');

// Les pages appellent l'API : hors ligne, leurs erreurs ne doivent pas
// interrompre l'inventaire.
process.on('unhandledRejection', () => {});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.html$/.test(e.name) && !SKIP_PATH.test(p)) out.push(p);
  }
  return out;
}

const fromDisk = requestInterceptor((request) => {
  const clean = request.url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  const file = path.join(ROOT, decodeURIComponent(clean));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'text/javascript' } });
  }
  return new Response('', { status: 404 });
});

function describe(sw) {
  if (sw.classList.contains('i18n-switch--float')) return 'pastille flottante';
  const parent = sw.parentElement;
  const label = parent.className ? '.' + parent.className.split(' ')[0] : '#' + (parent.id || parent.tagName.toLowerCase());
  return 'dans ' + label;
}

(async () => {
  const pages = walk(ROOT).sort();
  const rows = [];

  for (const file of pages) {
    const rel = path.relative(ROOT, file);
    const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
      runScripts: 'dangerously',
      resources: { interceptors: [fromDisk] },
      virtualConsole: new VirtualConsole().on('jsdomError', () => {}),
      url: 'https://liquidplus.fr/' + rel.replace(/\\/g, '/'),
      beforeParse(w) {
        w.localStorage.setItem('liquidLang', 'en');
        // Promesse qui ne se résout jamais : le script de page attend, sans
        // produire de rejet non capturé qui ferait tomber l'audit.
        w.fetch = () => new Promise(() => {});
        if (SIMULATE_AUTH) {
          w.setTimeout(() => {
            const app = w.document.querySelector('.app');
            if (app) app.style.visibility = 'visible';
          }, 150);
        }
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const found = [...dom.window.document.querySelectorAll('.i18n-switch')];
    rows.push({ rel, places: found.map(describe) });
    dom.window.close();
  }

  let missing = 0;
  for (const { rel, places } of rows) {
    if (!places.length) missing++;
    console.log('  ' + rel.padEnd(38) + (places.join(' + ') || '*** AUCUN SÉLECTEUR ***'));
  }
  console.log('\n  ' + rows.length + ' pages · ' +
    rows.filter(r => r.places.some(p => p !== 'pastille flottante')).length + ' avec un sélecteur intégré · ' +
    rows.filter(r => r.places.length && r.places.every(p => p === 'pastille flottante')).length + ' en pastille · ' +
    missing + ' sans rien');
  process.exit(missing ? 1 : 0);
})();
