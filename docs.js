/* DomestiCare PDF builder. Contains NO contract wording: the paid templates come from the payment server
   (GET /doc) after PayFast confirms the payment. This file only lays them out with the buyer's answers. */
(function (w) {
  const NAVY = [14, 47, 78], BLUE = [11, 79, 156], GREEN = [58, 154, 60], GREY = [95, 105, 115], INK = [33, 37, 41], SILVER = [222, 226, 229];
  let LOGO = null;   // data URL of shield-pdf.jpg

  async function loadLogo() {
    if (LOGO) return LOGO;
    try {
      const r = await fetch('shield-pdf.jpg');
      const b = await r.blob();
      LOGO = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); });
    } catch (_) { LOGO = null; }
    return LOGO;
  }

  // Helvetica (WinAnsi) safe text: no emoji / unsupported glyphs (this was the tick-mark bug).
  const MAP = { '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': ' - ', '\u2026': '...', '\u00a0': ' ', '\u2264': '<=', '\u2265': '>=', '\u2713': 'X', '\u2714': 'X', '\u2022': '\u2022', '\u00b7': '\u00b7' };
  function safe(s) {
    return String(s == null ? '' : s).replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00a0\u2264\u2265\u2713\u2714]/g, c => MAP[c])
      .normalize('NFC').replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u2022]/g, ch => {
        const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return /^[\x20-\x7e]+$/.test(base) ? base : '';
      });
  }
  const BLANK = '____________________';
  function fill(t, vars) {
    return safe(String(t).replace(/\{\{(\w+)\}\}/g, (_, k) => {
      const v = vars[k];
      return v === undefined || v === null || String(v).trim() === '' ? BLANK : String(v);
    })).replace(/\s+$/, '');
  }
  function when(b, flags) {
    if (!b.w) return true;
    const list = Array.isArray(b.w) ? b.w : [b.w];
    return list.every(f => f[0] === '!' ? !flags[f.slice(1)] : !!flags[f]);
  }

  function drawTick(doc, x, y, s) {   // vector tick inside a box at (x,y) size s
    doc.setDrawColor(...GREEN); doc.setLineWidth(0.6);
    doc.line(x + s * 0.18, y + s * 0.55, x + s * 0.42, y + s * 0.8);
    doc.line(x + s * 0.42, y + s * 0.8, x + s * 0.85, y + s * 0.2);
  }
  function drawBox(doc, x, y, s) { doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.rect(x, y, s, s); }

  // Clause numbers follow the blocks that are actually shown (no gaps such as 2.1, 2.3), and cross-references follow.
  function numbering(blocks, flags) {
    const secMap = {}, numMap = {};
    let sec = 0, sub = 0;
    for (const b of blocks) {
      if (!when(b, flags)) continue;
      const h = b.h && /^(\d+)\.\s/.exec(b.h);
      if (h) { sec++; sub = 0; secMap[h[1]] = String(sec); continue; }
      const t = b.p || b.sh;
      const m = t && /^(\d+\.\d+)\s/.exec(t);
      if (m && !(m[1] in numMap)) { sub++; numMap[m[1]] = `${sec}.${sub}`; }
    }
    return text => text
      .replace(/^(\d+)\.(?=\s)/, (x, n) => (secMap[n] || n) + '.')
      .replace(/^(\d+\.\d+)(?=\s)/, x => numMap[x] || x)
      .replace(/\b([Ss]ee) (\d+\.\d+)\b/g, (x, w, n) => `${w} ${numMap[n] || n}`)
      .replace(/\b([Ss]ections?) (\d+)\b(?!\.\d)/g, (x, w, n) => `${w} ${secMap[n] || n}`);
  }

  function build(tpl, vars, flags, opts) {
    const renum = numbering(tpl.blocks, flags);
    const fillN = (t, v) => renum(fill(t, v));
    const { jsPDF } = w.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const at = (o) => (typeof doc.autoTable === 'function' ? doc.autoTable(o) : w.autoTable(doc, o));
    const pageW = 210, pageH = 297, M = 18, CW = pageW - 2 * M, TOP = 26, BOTTOM = pageH - 20;
    let y = TOP;
    const ref = safe(opts.ref || '');

    function header() {
      if (LOGO) { try { doc.addImage(LOGO, 'JPEG', M, 6.5, 11, 11); } catch (_) {} }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
      doc.text('DomestiCare', M + 13.5, 11);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...GREY);
      doc.text(safe(tpl.running || tpl.title), M + 13.5, 15.2);
      if (ref) doc.text('Ref ' + ref, pageW - M, 11, { align: 'right' });
      doc.text('Confidential', pageW - M, 15.2, { align: 'right' });
      // blue -> green rule (logo colours)
      const steps = 40, segW = CW / steps;
      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        doc.setDrawColor(Math.round(BLUE[0] + (GREEN[0] - BLUE[0]) * t), Math.round(BLUE[1] + (GREEN[1] - BLUE[1]) * t), Math.round(BLUE[2] + (GREEN[2] - BLUE[2]) * t));
        doc.setLineWidth(0.7); doc.line(M + i * segW, 19.5, M + (i + 1) * segW + 0.2, 19.5);
      }
    }
    function newPage() { doc.addPage(); y = TOP; header(); }
    function ensure(h) { if (y + h > BOTTOM) newPage(); }
    const afterTable = () => { y = doc.lastAutoTable.finalY + 4; };
    const tableBase = () => ({ margin: { left: M, right: M, top: TOP, bottom: pageH - BOTTOM }, didDrawPage: d => { if (d.pageNumber > 1) header(); }, rowPageBreak: 'avoid' });

    header();
    // Title block
    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...NAVY);
    const tl = doc.splitTextToSize(safe(tpl.title), CW);
    doc.text(tl, pageW / 2, y + 3, { align: 'center' }); y += tl.length * 7 + 2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.6); doc.setTextColor(...GREY);
    (tpl.subtitle || []).forEach(s => { const l = doc.splitTextToSize(fill(s, vars), CW - 10); doc.text(l, pageW / 2, y, { align: 'center' }); y += l.length * 4 + 0.6; });
    y += 4;

    const para = (t, o = {}) => {
      doc.setFont('helvetica', o.italic ? 'italic' : (o.bold ? 'bold' : 'normal')); doc.setFontSize(o.size || 9.6); doc.setTextColor(...(o.color || INK));
      const indent = o.indent || 0;
      const lines = doc.splitTextToSize(t, CW - indent);
      const lh = (o.size || 9.6) * 0.47;
      for (let i = 0; i < lines.length; i++) {
        ensure(lh);
        if (o.bullet && i === 0) doc.text('\u2022', M + 1.5, y);
        doc.text(lines[i], M + indent, y); y += lh;
      }
      y += o.after != null ? o.after : 1.8;
    };

    for (const b of tpl.blocks) {
      if (!when(b, flags)) continue;
      if (b.np) { newPage(); continue; }
      if (b.h) {
        ensure(b.keep || 24); y += 2.5;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...NAVY);
        doc.text(fillN(b.h, vars), M, y); y += 1.6;
        doc.setDrawColor(...GREEN); doc.setLineWidth(0.4); doc.line(M, y, M + 22, y); y += 4.6;
      } else if (b.sh) {
        ensure(b.keep || 16);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.8); doc.setTextColor(...BLUE);
        doc.text(fillN(b.sh, vars), M, y); y += 5;
      } else if (b.p) para(fillN(b.p, vars));
      else if (b.b) para(fillN(b.b, vars), { bullet: true, indent: 5, after: 1 });
      else if (b.note) para(fill(b.note, vars), { italic: true, size: 8.2, color: GREY });
      else if (b.kv) {
        ensure(14);
        at({ ...tableBase(), startY: y, body: b.kv.map(([k, v]) => [fill(k, vars), fillN(v, vars)]), theme: 'grid',
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.9, textColor: INK, lineColor: SILVER, lineWidth: 0.25, overflow: 'linebreak' },
          columnStyles: { 0: { fontStyle: 'bold', fillColor: [241, 245, 249], textColor: NAVY, cellWidth: 62 }, 1: { cellWidth: CW - 62 } } });
        afterTable();
      } else if (b.table) {
        ensure(20);
        const widths = b.table.widths || [];
        const cs = {}; widths.forEach((wd, i) => { if (wd) cs[i] = { cellWidth: wd }; });
        at({ ...tableBase(), startY: y, head: [b.table.head.map(h => safe(h))], body: b.table.body.map(r => r.map(c => fill(c, vars))), theme: 'grid',
          styles: { fontSize: 8.6, cellPadding: 1.8, textColor: INK, lineColor: SILVER, lineWidth: 0.25 },
          headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [247, 250, 252] }, columnStyles: cs });
        afterTable();
      } else if (b.duties) {
        const chosen = opts.duties || [];
        if (!chosen.length) { para('No duties were chosen yet. Write the agreed duties here:', { italic: true }); for (let i = 0; i < 5; i++) { ensure(8); y += 6; doc.setDrawColor(150); doc.line(M, y, pageW - M, y); } y += 4; continue; }
        const rows = chosen.map((d, i) => [String(i + 1), safe(d.text), safe(d.group)]);
        ensure(20);
        at({ ...tableBase(), startY: y, head: [['No.', 'Duty', 'Type of work']], body: rows, theme: 'grid',
          styles: { fontSize: 8.6, cellPadding: 1.7, textColor: INK, lineColor: SILVER, lineWidth: 0.25 },
          headStyles: { fillColor: NAVY, textColor: 255 }, columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 2: { cellWidth: 46, textColor: GREY } } });
        afterTable();
      } else if (b.checklist) {
        const ticked = new Set((opts.duties || []).map(d => d.key));
        for (const cat of w.DC_DATA.categories) {
          ensure(26);
          at({ ...tableBase(), startY: y, head: [['', safe(cat.label), 'How often']],
            body: cat.duties.map(([k, t]) => ['', safe(t), '']), theme: 'grid',
            styles: { fontSize: 8.8, cellPadding: { top: 2.2, bottom: 2.2, left: 1.8, right: 1.8 }, textColor: INK, lineColor: SILVER, lineWidth: 0.25, minCellHeight: 8 },
            headStyles: { fillColor: NAVY, textColor: 255 }, columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 34 } },
            didDrawCell: d => {
              if (d.section === 'body' && d.column.index === 0) {
                const s = 4.6, bx = d.cell.x + (d.cell.width - s) / 2, by = d.cell.y + (d.cell.height - s) / 2;
                drawBox(doc, bx, by, s);
                if (ticked.has(cat.duties[d.row.index][0])) drawTick(doc, bx, by, s);
              }
            } });
          afterTable(); y += 1;
        }
      } else if (b.blanks) {
        for (let i = 0; i < b.blanks; i++) { ensure(9); y += 3; drawBox(doc, M + 1, y - 1, 4.6); doc.setDrawColor(150); doc.setLineWidth(0.25); doc.line(M + 9, y + 3.6, pageW - M, y + 3.6); y += 5.5; }
        y += 3;
      } else if (b.checks) {
        ensure(10); y += 1;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2); doc.setTextColor(...INK);
        const colW = CW / b.checks.length;
        b.checks.forEach((c, i) => { const x = M + i * colW; drawBox(doc, x, y - 3.6, 4.4); doc.text(doc.splitTextToSize(safe(c), colW - 8), x + 6.5, y); });
        y += 9;
      } else if (b.form) {
        for (const [label, lines] of b.form) {
          ensure(6 + lines * 7);
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY);
          doc.text(fill(label, vars), M, y); y += 0.5;
          doc.setDrawColor(150); doc.setLineWidth(0.25);
          for (let i = 0; i < lines; i++) { y += 6.8; doc.line(M, y, pageW - M, y); }
          y += 5.2;
        }
      } else if (b.sign) {
        const colW = (CW - 12) / 2;
        const block = (labels, names) => {
          ensure(30); y += 14;
          doc.setDrawColor(90); doc.setLineWidth(0.3);
          doc.line(M, y, M + colW, y); doc.line(M + colW + 12, y, pageW - M, y); y += 4.5;
          doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...NAVY);
          doc.text(labels[0], M, y); doc.text(labels[1], M + colW + 12, y); y += 4.3;
          doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK);
          if (names) { doc.text(doc.splitTextToSize(names[0], colW)[0] || '', M, y); doc.text(doc.splitTextToSize(names[1], colW)[0] || '', M + colW + 12, y); y += 4.3; }
          doc.text('Date: ____________________', M, y); doc.text('Date: ____________________', M + colW + 12, y); y += 4;
        };
        const nm = (b.names || []).map(n => n ? fill(n, vars) : 'Name: ________________________');
        block(b.sign.map(safe), nm);
        if (b.witnesses) block(['WITNESS 1', 'WITNESS 2'], ['Name: ________________________', 'Name: ________________________']);
        y += 4;
      }
    }

    // Footer on every page: brand, initials, page X of Y
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...SILVER); doc.setLineWidth(0.3); doc.line(M, pageH - 14.5, pageW - M, pageH - 14.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...GREY);
      doc.text('DomestiCare by iNRECO \u00b7 a subsidiary of DomestiSure', M, pageH - 10);
      doc.text('Initials:  Employer ______   Employee ______', pageW / 2 + 6, pageH - 10, { align: 'center' });
      doc.text(`Page ${i} of ${n}`, pageW - M, pageH - 10, { align: 'right' });
    }
    doc.setProperties({ title: safe(tpl.title), subject: 'DomestiCare ' + safe(tpl.title), author: 'DomestiCare by iNRECO', creator: 'DomestiCare (domestics.inreco.co.za)' });
    return doc;
  }

  w.DCDocs = { build, loadLogo, safe };
})(window);
