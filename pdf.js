// Builds a PDF of report-card comments laid out like the instructor's Word template:
// A4 page, one dashed-border column of "slots" (389 pt wide, at least 170 pt tall), Times 12 pt, 1.5 line spacing.
// No libraries: it writes a minimal PDF using the built-in Times-Roman font.

const PDF_PAGE = { width: 595.45, height: 841.7, marginTop: 40.5, marginBottom: 72 };
const PDF_FIRST_PAGE_TOP = 63; // Word template starts the table below an empty paragraph on page 1
const PDF_TABLE = { left: 53.55, width: 389.25, minRowHeight: 170, cellPadding: 5.75, textIndent: 16.6 };
const PDF_TEXT = {
  size: 12,
  lineHeight: 12 * 1.149 * 1.5,
  descent: 12 * 0.216,
  width: PDF_TABLE.width - 2 * PDF_TABLE.cellPadding - PDF_TABLE.textIndent
};

const PDF_WIN_ANSI_EXTRAS = {
  '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94,
  '–': 0x96, '—': 0x97, '•': 0x95, '…': 0x85, ' ': 0x20
};

let pdfMeasureContext = null;

function pdfTextWidth(text) {
  if (!pdfMeasureContext) {
    pdfMeasureContext = document.createElement('canvas').getContext('2d');
    pdfMeasureContext.font = '1000px "Times New Roman", Times, "Liberation Serif", "Nimbus Roman", serif';
    pdfMeasureContext.fontKerning = 'none';
  }
  return pdfMeasureContext.measureText(text).width * PDF_TEXT.size / 1000;
}

function pdfWrapText(text, maxWidth) {
  const lines = [];
  let line = '';
  const pushLine = () => { lines.push(line); line = ''; };

  text.split(/\s+/).filter(Boolean).forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (pdfTextWidth(candidate) <= maxWidth) {
      line = candidate;
      return;
    }
    if (line) pushLine();
    let rest = word;
    while (pdfTextWidth(rest) > maxWidth) {
      let cut = rest.length - 1;
      while (cut > 1 && pdfTextWidth(rest.slice(0, cut)) > maxWidth) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  });
  if (line) pushLine();
  return lines.length ? lines : [''];
}

// One character per byte (WinAnsi), with PDF string escaping.
function pdfEncodeString(text) {
  let out = '';
  for (const ch of text) {
    let code = PDF_WIN_ANSI_EXTRAS[ch] ?? ch.codePointAt(0);
    if (code > 0xFF || (code >= 0x7F && code <= 0x9F && !Object.values(PDF_WIN_ANSI_EXTRAS).includes(code))) code = 0x3F;
    if (code === 0x28 || code === 0x29 || code === 0x5C) out += '\\' + String.fromCharCode(code);
    else if (code < 0x20) out += ' ';
    else out += String.fromCharCode(code);
  }
  return out;
}

// Each group is one class: it starts on a new page, and a labelled group leaves room for its name above the first slot.
function pdfLayoutGroups(groups) {
  const pages = [];
  const bottomLimit = PDF_PAGE.height - PDF_PAGE.marginBottom;

  groups.forEach(group => {
    let page = null;
    let y = 0;
    group.comments.forEach(comment => {
      const lines = pdfWrapText(comment, PDF_TEXT.width);
      const height = Math.max(PDF_TABLE.minRowHeight, lines.length * PDF_TEXT.lineHeight);
      if (!page || y + height > bottomLimit) {
        const startsGroup = !page;
        page = { rows: [], label: startsGroup ? group.label : null };
        pages.push(page);
        y = pages.length === 1 || (startsGroup && group.label) ? PDF_FIRST_PAGE_TOP : PDF_PAGE.marginTop;
      }
      page.rows.push({ top: y, height, lines });
      y += height;
    });
  });
  return pages;
}

function pdfLayoutComments(comments) {
  return pdfLayoutGroups([{ label: null, comments }]);
}

// Accepts a plain list of comments (one class, no label) or [{ label, comments }] (several classes).
function pdfNormalizeGroups(input) {
  if (!input.length) return [{ label: null, comments: [''] }];
  return typeof input[0] === 'string' ? [{ label: null, comments: input }] : input;
}

function pdfFitLabel(label) {
  const maxWidth = PDF_TABLE.width * 12 / 10;
  let text = label;
  while (text.length > 1 && pdfTextWidth(text) > maxWidth) text = text.slice(0, -1);
  return text === label ? label : `${text.trimEnd()}...`;
}

function pdfPageContent(page) {
  const fmt = n => n.toFixed(2);
  const flip = top => PDF_PAGE.height - top;
  const x0 = PDF_TABLE.left;
  const x1 = PDF_TABLE.left + PDF_TABLE.width;
  const ops = ['q', '0.5 w', '[3 2] 0 d', '0 G'];

  const horizontal = top => ops.push(`${fmt(x0)} ${fmt(flip(top))} m ${fmt(x1)} ${fmt(flip(top))} l S`);
  const vertical = (x, top, bottom) => ops.push(`${fmt(x)} ${fmt(flip(top))} m ${fmt(x)} ${fmt(flip(bottom))} l S`);

  horizontal(page.rows[0].top);
  page.rows.forEach(row => {
    vertical(x0, row.top, row.top + row.height);
    vertical(x1, row.top, row.top + row.height);
    horizontal(row.top + row.height);
  });
  ops.push('Q', 'BT');
  if (page.label) {
    ops.push(
      '/F1 10 Tf',
      '0.35 g',
      `1 0 0 1 ${fmt(x0)} ${fmt(flip(54))} Tm (${pdfEncodeString(pdfFitLabel(page.label))}) Tj`,
      '0 g'
    );
  }
  ops.push(`/F1 ${PDF_TEXT.size} Tf`);

  const textX = x0 + PDF_TABLE.cellPadding + PDF_TABLE.textIndent;
  page.rows.forEach(row => {
    row.lines.forEach((line, i) => {
      const baseline = row.top + (i + 1) * PDF_TEXT.lineHeight - PDF_TEXT.descent;
      ops.push(`1 0 0 1 ${fmt(textX)} ${fmt(flip(baseline))} Tm (${pdfEncodeString(line)}) Tj`);
    });
  });
  ops.push('ET');
  return ops.join('\n');
}

function buildReportCardsPdf(input) {
  const pages = pdfLayoutGroups(pdfNormalizeGroups(input));
  const objects = [];
  const pageObjectNumbers = pages.map((_, i) => 4 + i * 2);

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectNumbers.map(n => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>';

  pages.forEach((page, i) => {
    const pageNumber = 4 + i * 2;
    const content = pdfPageContent(page);
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE.width} ${PDF_PAGE.height}] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${pageNumber + 1} 0 R >>`;
    objects[pageNumber + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) pdf += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
  return bytes;
}

function downloadReportCardsPdf(input, filename) {
  const blob = new Blob([buildReportCardsPdf(input)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
