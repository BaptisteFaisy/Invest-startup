const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pdfParse = require('pdf-parse');
const simulationPdf = require('../Saas/simulation-pdf');

test('buildPdf produit un PDF lisible et paginé', async () => {
  const rows = Array.from({ length: 90 }, (_, index) => [
    `Associé ${index + 1}`,
    index % 3 === 0 ? 'Fondateur' : 'Investisseur',
    `${(index + 1).toFixed(1)} %`,
  ]);
  const bytes = simulationPdf.buildPdf({
    kicker: 'Dilution',
    title: 'Simulation Série A — été 2026',
    subtitle: 'Rapport de vérification du moteur PDF.',
    savedAt: Date.UTC(2026, 6, 15, 10, 30),
    summary: [
      { label: 'Valorisation', value: '5 000 000 €' },
      { label: 'Dilution', value: '20,0 %' },
    ],
    sections: [{
      title: 'Cap table après opération',
      table: {
        columns: [
          { label: 'Associé', width: 0.5 },
          { label: 'Catégorie', width: 0.3 },
          { label: 'Capital', width: 0.2, align: 'right' },
        ],
        rows,
      },
    }],
    disclaimer: 'Simulation indicative.',
  });

  assert.equal(Buffer.from(bytes.subarray(0, 8)).toString('latin1'), '%PDF-1.4');
  assert.match(Buffer.from(bytes.subarray(-20)).toString('latin1'), /%%EOF\s*$/);

  const parsed = await pdfParse(Buffer.from(bytes));
  assert.ok(parsed.numpages > 1);
  assert.match(parsed.text, /Simulation Série A/);
  assert.match(parsed.text, /été 2026/);
  assert.match(parsed.text, /5 000 000 €/);
  assert.match(parsed.text, /Associé 90/);
  assert.match(parsed.text, /Document généré par Liquid \+/);
});

test('safeFilename crée un nom de fichier portable', () => {
  const filename = simulationPdf.safeFilename('dilution', {
    name: 'Série A / été : version finale',
    savedAt: Date.UTC(2026, 6, 15),
  });

  assert.equal(filename, 'liquid-plus-dilution-serie-a-ete-version-finale-2026-07-15.pdf');
  assert.doesNotMatch(filename, /[\\/:*?"<>|]/);
});

test('les trois historiques chargent l’exporteur et proposent le bouton PDF', () => {
  const root = path.join(__dirname, '..', 'Saas');
  const pages = [
    ['valorisation.html', 'buildValuationPdfReport'],
    ['dilution.html', 'buildDilutionPdfReport'],
    ['exit.html', 'buildExitPdfReport'],
  ];

  pages.forEach(([filename, builder]) => {
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    assert.match(html, /<script src="simulation-pdf\.js\?v=1"><\/script>/);
    assert.match(html, /class="hist-btn hist-pdf"/);
    assert.match(html, new RegExp(`function ${builder}\\(`));
    assert.match(html, /\.safeFilename\(/);
    const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
    inlineScripts.forEach((match, index) => {
      assert.doesNotThrow(() => new Function(match[1]), `${filename} — script inline ${index + 1}`);
    });
  });
});
