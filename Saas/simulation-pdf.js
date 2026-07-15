(function initSimulationPdf(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SimulationPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function simulationPdfFactory() {
  'use strict';

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN = 38;
  const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
  const CONTENT_BOTTOM = 792;
  const COLORS = {
    ink: [0.035, 0.039, 0.055],
    muted: [0.39, 0.4, 0.47],
    faint: [0.91, 0.92, 0.94],
    surface: [0.965, 0.97, 0.98],
    accent: [0.145, 0.388, 0.922],
    accentSoft: [0.925, 0.945, 0.995],
    white: [1, 1, 1],
  };

  const WIN_1252 = new Map([
    [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
    [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
    [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
    [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
    [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f], [0x202f, 0xa0],
  ]);

  const UNICODE_FALLBACKS = new Map([
    [0x2192, '->'], [0x2190, '<-'], [0x2212, '-'], [0x2011, '-'],
    [0x2265, '>='], [0x2264, '<='], [0x2248, '~'], [0x00ad, ''],
  ]);

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clampText(value, max = 600) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(finite(value));
  }

  function formatPercent(value, digits = 1) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(finite(value));
  }

  function formatNumber(value, digits = 0) {
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(finite(value));
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date inconnue';
    return `${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  function encodeWinAnsi(value) {
    let output = '';
    for (const char of String(value == null ? '' : value)) {
      const code = char.codePointAt(0);
      if (code === 0x0a || code === 0x0d || code === 0x09) {
        output += ' ';
      } else if (code >= 0x20 && code <= 0xff && !(code >= 0x80 && code <= 0x9f)) {
        output += String.fromCharCode(code);
      } else if (WIN_1252.has(code)) {
        output += String.fromCharCode(WIN_1252.get(code));
      } else if (UNICODE_FALLBACKS.has(code)) {
        output += UNICODE_FALLBACKS.get(code);
      } else if (code >= 0x300 && code <= 0x36f) {
        // Les marques combinatoires sont ignorées après leur lettre de base.
      } else {
        output += '?';
      }
    }
    return output;
  }

  function pdfLiteral(value) {
    return encodeWinAnsi(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  function binaryBytes(value) {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
    return bytes;
  }

  function colorCommand(color, stroke = false) {
    const values = color.map(value => Number(value).toFixed(3)).join(' ');
    return `${values} ${stroke ? 'RG' : 'rg'}`;
  }

  function estimateTextWidth(value, size, bold) {
    let units = 0;
    for (const char of String(value == null ? '' : value)) {
      if (/\s/.test(char)) units += 0.28;
      else if (/[ilI1.,'`:;|]/.test(char)) units += 0.27;
      else if (/[MWmw@%]/.test(char)) units += 0.82;
      else if (/[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜ]/.test(char)) units += 0.62;
      else units += 0.52;
    }
    return units * size * (bold ? 1.045 : 1);
  }

  function splitLongToken(token, maxWidth, size, bold) {
    const chunks = [];
    let current = '';
    for (const char of token) {
      if (current && estimateTextWidth(current + char, size, bold) > maxWidth) {
        chunks.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) chunks.push(current);
    return chunks.length ? chunks : [''];
  }

  function wrapText(value, maxWidth, size, bold = false, maxLines = 80) {
    const source = clampText(value, 4000);
    if (!source) return [''];
    const words = source.split(/\s+/).flatMap(word => (
      estimateTextWidth(word, size, bold) > maxWidth
        ? splitLongToken(word, maxWidth, size, bold)
        : [word]
    ));
    const lines = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && estimateTextWidth(candidate, size, bold) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length === maxLines && words.length > 1) {
      const last = lines[maxLines - 1];
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}…`;
    }
    return lines.length ? lines : [''];
  }

  function drawText(page, value, x, baselineFromTop, options = {}) {
    const size = options.size || 10;
    const font = options.bold ? 'F2' : 'F1';
    const color = options.color || COLORS.ink;
    const y = PAGE_HEIGHT - baselineFromTop;
    page.push(`BT /${font} ${size.toFixed(2)} Tf ${colorCommand(color)} 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfLiteral(value)}) Tj ET\n`);
  }

  function drawRect(page, x, top, width, height, fill, stroke) {
    const y = PAGE_HEIGHT - top - height;
    let command = 'q ';
    if (fill) command += `${colorCommand(fill)} `;
    if (stroke) command += `${colorCommand(stroke, true)} 0.6 w `;
    command += `${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re `;
    command += fill && stroke ? 'B' : fill ? 'f' : 'S';
    page.push(`${command} Q\n`);
  }

  function drawLine(page, x1, top1, x2, top2, color = COLORS.faint, width = 0.6) {
    const y1 = PAGE_HEIGHT - top1;
    const y2 = PAGE_HEIGHT - top2;
    page.push(`q ${colorCommand(color, true)} ${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q\n`);
  }

  function drawAlignedText(page, value, x, width, baseline, options = {}) {
    const text = clampText(value, 600);
    const size = options.size || 9;
    const textWidth = estimateTextWidth(text, size, !!options.bold);
    let drawX = x;
    if (options.align === 'right') drawX = x + Math.max(0, width - textWidth);
    if (options.align === 'center') drawX = x + Math.max(0, (width - textWidth) / 2);
    drawText(page, text, drawX, baseline, options);
  }

  function buildPdf(report) {
    if (!report || typeof report !== 'object') throw new Error('Rapport PDF invalide.');

    const pages = [];
    let page;
    let cursor;

    function addPage() {
      page = [];
      pages.push(page);
      drawRect(page, 0, 0, PAGE_WIDTH, 44, COLORS.ink);
      drawText(page, 'Liquid +', MARGIN, 28, { size: 14, bold: true, color: COLORS.white });
      drawAlignedText(page, clampText(report.kicker || 'SIMULATION', 60).toUpperCase(), PAGE_WIDTH - MARGIN - 180, 180, 27, {
        size: 8,
        bold: true,
        color: [0.76, 0.79, 0.86],
        align: 'right',
      });
      cursor = 68;
    }

    function ensureSpace(height, continuationTitle) {
      if (cursor + height <= CONTENT_BOTTOM) return false;
      addPage();
      if (continuationTitle) {
        drawText(page, `${clampText(continuationTitle, 140)} (suite)`, MARGIN, cursor + 11, {
          size: 11,
          bold: true,
          color: COLORS.ink,
        });
        cursor += 24;
      }
      return true;
    }

    function renderWrapped(value, x, width, options = {}) {
      const size = options.size || 9.5;
      const lineHeight = options.lineHeight || size * 1.35;
      const lines = wrapText(value, width, size, !!options.bold, options.maxLines || 80);
      lines.forEach(line => {
        drawText(page, line, x, cursor + size, options);
        cursor += lineHeight;
      });
      return lines.length * lineHeight;
    }

    function renderSectionHeading(title) {
      ensureSpace(34);
      drawRect(page, MARGIN, cursor, 4, 19, COLORS.accent);
      drawText(page, clampText(title, 180), MARGIN + 13, cursor + 13, { size: 11.5, bold: true });
      cursor += 29;
    }

    function renderItems(items, accent = false) {
      const list = Array.isArray(items) ? items.filter(Boolean) : [];
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index] || {};
        const label = clampText(item.label, 180);
        const value = clampText(item.value, 600) || '—';
        const valueLines = wrapText(value, CONTENT_WIDTH * 0.61 - 18, 9.5, true, 12);
        const rowHeight = Math.max(30, valueLines.length * 12 + 12);
        ensureSpace(rowHeight);
        if (accent || index % 2 === 0) drawRect(page, MARGIN, cursor, CONTENT_WIDTH, rowHeight, accent ? COLORS.accentSoft : COLORS.surface);
        drawText(page, label, MARGIN + 10, cursor + 18, { size: 8.3, bold: true, color: COLORS.muted });
        valueLines.forEach((line, lineIndex) => {
          drawText(page, line, MARGIN + CONTENT_WIDTH * 0.39, cursor + 17 + lineIndex * 12, {
            size: 9.5,
            bold: true,
            color: COLORS.ink,
          });
        });
        cursor += rowHeight;
      }
      cursor += 7;
    }

    function normalizedColumns(table) {
      const columns = Array.isArray(table && table.columns) ? table.columns : [];
      const requested = columns.reduce((sum, column) => sum + Math.max(0, finite(column.width, 0)), 0);
      return columns.map(column => ({
        label: clampText(column.label, 100),
        align: column.align === 'right' || column.align === 'center' ? column.align : 'left',
        width: requested > 0 ? (Math.max(0, finite(column.width, 0)) / requested) * CONTENT_WIDTH : CONTENT_WIDTH / Math.max(1, columns.length),
      }));
    }

    function renderTable(table, sectionTitle) {
      const columns = normalizedColumns(table);
      const rows = Array.isArray(table && table.rows) ? table.rows : [];
      if (!columns.length) return;

      const headerHeight = 25;
      const cellPadding = 6;
      const fontSize = 8.1;
      const lineHeight = 10.6;

      function drawHeader() {
        ensureSpace(headerHeight + 22, sectionTitle);
        drawRect(page, MARGIN, cursor, CONTENT_WIDTH, headerHeight, COLORS.ink);
        let x = MARGIN;
        columns.forEach(column => {
          drawAlignedText(page, column.label, x + cellPadding, column.width - cellPadding * 2, cursor + 16, {
            size: 7.4,
            bold: true,
            color: COLORS.white,
            align: column.align,
          });
          x += column.width;
        });
        cursor += headerHeight;
      }

      drawHeader();
      rows.forEach((sourceRow, rowIndex) => {
        const row = Array.isArray(sourceRow) ? sourceRow : [];
        const lineSets = columns.map((column, columnIndex) => wrapText(
          clampText(row[columnIndex], 800),
          Math.max(20, column.width - cellPadding * 2),
          fontSize,
          false,
          22,
        ));
        const rowHeight = Math.max(24, Math.max(...lineSets.map(lines => lines.length)) * lineHeight + 11);
        if (cursor + rowHeight > CONTENT_BOTTOM) {
          addPage();
          drawText(page, `${clampText(sectionTitle || 'Tableau', 140)} (suite)`, MARGIN, cursor + 11, {
            size: 11,
            bold: true,
          });
          cursor += 24;
          drawHeader();
        }
        if (rowIndex % 2 === 0) drawRect(page, MARGIN, cursor, CONTENT_WIDTH, rowHeight, COLORS.surface);
        drawLine(page, MARGIN, cursor + rowHeight, MARGIN + CONTENT_WIDTH, cursor + rowHeight);
        let x = MARGIN;
        columns.forEach((column, columnIndex) => {
          lineSets[columnIndex].forEach((line, lineIndex) => {
            drawAlignedText(page, line, x + cellPadding, column.width - cellPadding * 2, cursor + 15 + lineIndex * lineHeight, {
              size: fontSize,
              color: COLORS.ink,
              align: column.align,
            });
          });
          x += column.width;
        });
        cursor += rowHeight;
      });
      cursor += 9;
    }

    addPage();
    drawText(page, clampText(report.kicker || 'RAPPORT', 60).toUpperCase(), MARGIN, cursor + 5, {
      size: 8,
      bold: true,
      color: COLORS.accent,
    });
    cursor += 18;
    const titleLines = wrapText(report.title || 'Simulation enregistrée', CONTENT_WIDTH, 21, true, 4);
    titleLines.forEach(line => {
      drawText(page, line, MARGIN, cursor + 18, { size: 21, bold: true });
      cursor += 25;
    });
    if (report.subtitle) {
      const subtitleLines = wrapText(report.subtitle, CONTENT_WIDTH, 10, false, 5);
      subtitleLines.forEach(line => {
        drawText(page, line, MARGIN, cursor + 9, { size: 10, color: COLORS.muted });
        cursor += 14;
      });
    }
    drawText(page, `Enregistré le ${formatDate(report.savedAt)}`, MARGIN, cursor + 10, {
      size: 8.5,
      color: COLORS.muted,
    });
    cursor += 24;

    if (Array.isArray(report.summary) && report.summary.length) {
      renderItems(report.summary, true);
      cursor += 4;
    }

    (Array.isArray(report.sections) ? report.sections : []).forEach(section => {
      if (!section) return;
      renderSectionHeading(section.title || 'Détails');
      if (Array.isArray(section.items) && section.items.length) renderItems(section.items);
      if (Array.isArray(section.paragraphs)) {
        section.paragraphs.filter(Boolean).forEach(paragraph => {
          const lines = wrapText(paragraph, CONTENT_WIDTH, 9.3, false, 80);
          ensureSpace(Math.min(lines.length, 8) * 12.8 + 8, section.title);
          lines.forEach(line => {
            if (cursor + 13 > CONTENT_BOTTOM) {
              addPage();
              drawText(page, `${clampText(section.title || 'Détails', 140)} (suite)`, MARGIN, cursor + 11, { size: 11, bold: true });
              cursor += 24;
            }
            drawText(page, line, MARGIN, cursor + 9, { size: 9.3, color: COLORS.muted });
            cursor += 12.8;
          });
          cursor += 5;
        });
      }
      if (section.table) renderTable(section.table, section.title);
      cursor += 4;
    });

    if (report.disclaimer) {
      renderSectionHeading('À retenir');
      const disclaimerLines = wrapText(report.disclaimer, CONTENT_WIDTH - 20, 8.6, false, 35);
      const height = disclaimerLines.length * 12 + 20;
      ensureSpace(height, 'À retenir');
      drawRect(page, MARGIN, cursor, CONTENT_WIDTH, height, COLORS.surface, COLORS.faint);
      disclaimerLines.forEach((line, index) => {
        drawText(page, line, MARGIN + 10, cursor + 15 + index * 12, { size: 8.6, color: COLORS.muted });
      });
      cursor += height + 6;
    }

    pages.forEach((pageCommands, index) => {
      drawLine(pageCommands, MARGIN, 812, PAGE_WIDTH - MARGIN, 812, COLORS.faint, 0.5);
      drawText(pageCommands, 'Document généré par Liquid +', MARGIN, 827, { size: 7.2, color: COLORS.muted });
      drawAlignedText(pageCommands, `Page ${index + 1} / ${pages.length}`, PAGE_WIDTH - MARGIN - 100, 100, 827, {
        size: 7.2,
        color: COLORS.muted,
        align: 'right',
      });
    });

    return assemblePdf(pages, report.title || 'Simulation enregistrée');
  }

  function assemblePdf(pageCommands, title) {
    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';

    const kids = [];
    pageCommands.forEach((commands, index) => {
      const pageObject = 5 + index * 2;
      const streamObject = pageObject + 1;
      const stream = commands.join('');
      kids.push(`${pageObject} 0 R`);
      objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObject} 0 R >>`;
      objects[streamObject] = `<< /Length ${binaryBytes(stream).length} >>\nstream\n${stream}endstream`;
    });
    objects[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

    const infoObject = 5 + pageCommands.length * 2;
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`;
    objects[infoObject] = `<< /Title (${pdfLiteral(title)}) /Author (Liquid +) /Creator (Liquid +) /CreationDate (D:${stamp}) >>`;

    let binary = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets = [0];
    for (let number = 1; number < objects.length; number += 1) {
      offsets[number] = binaryBytes(binary).length;
      binary += `${number} 0 obj\n${objects[number]}\nendobj\n`;
    }
    const xrefOffset = binaryBytes(binary).length;
    binary += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let number = 1; number < objects.length; number += 1) {
      binary += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`;
    }
    binary += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return binaryBytes(binary);
  }

  function safeFilename(kind, entry) {
    const date = new Date(entry && entry.savedAt);
    const day = Number.isNaN(date.getTime()) ? '' : `-${date.toISOString().slice(0, 10)}`;
    const slug = String((entry && entry.name) || 'simulation')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70)
      .toLowerCase() || 'simulation';
    const prefix = String(kind || 'simulation').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return `liquid-plus-${prefix}-${slug}${day}.pdf`;
  }

  function download(report, filename) {
    if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
      throw new Error('Le téléchargement PDF nécessite un navigateur.');
    }
    const bytes = buildPdf(report);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || safeFilename('simulation', { name: report.title, savedAt: report.savedAt });
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return bytes;
  }

  return {
    buildPdf,
    download,
    safeFilename,
    formatCurrency,
    formatPercent,
    formatNumber,
    formatDate,
  };
});
