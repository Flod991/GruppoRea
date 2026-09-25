/**
 * Creazione del PDF dei turni da inviare ai dipendenti.
 * Le librerie (jsPDF e jsPDF-AutoTable, licenza MIT) si caricano solo al primo export.
 */
(function (root) {
  'use strict';

  const LIBS = ['js/vendor/jspdf-4.2.1.umd.min.js', 'js/vendor/jspdf-autotable-5.0.8.min.js'];

  // Colori delle caselle (sfondo, testo) come nell'app.
  const KIND = {
    M: { fill: [227, 238, 255], text: [24, 74, 150] },
    P: { fill: [255, 238, 216], text: [135, 71, 10] },
    G: { fill: [24, 74, 150], text: [255, 255, 255] },
    F: { fill: [223, 245, 239], text: [17, 102, 79] },
    A: { fill: [241, 231, 251], text: [106, 47, 160] },
    R: { fill: [238, 240, 243], text: [93, 104, 119] },
    '': { fill: [255, 255, 255], text: [150, 158, 170] },
  };

  let loading = null;
  function ensure() {
    if (root.jspdf && root.autoTable) return Promise.resolve();
    if (!loading) {
      loading = LIBS.reduce((p, src) => p.then(() => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Impossibile caricare ' + src));
        document.head.appendChild(s);
      })), Promise.resolve()).catch((e) => { loading = null; throw e; });
    }
    return loading;
  }

  /**
   * @param {object} data
   * @param {string} data.title
   * @param {string} data.subtitle
   * @param {string[]} data.days          intestazioni dei giorni
   * @param {Array<{title:string, rows:Array<{name:string, cells:Array<{text:string, kind:string}>, total:string}>}>} data.sections
   * @param {string} data.legend
   * @param {string} data.footer
   * @returns {Promise<Blob>}
   */
  const MARGIN = 12;

  function header(doc, data) {
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFillColor(200, 16, 46);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(27, 34, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(data.title, MARGIN, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(93, 104, 119);
    doc.text(data.subtitle, MARGIN, 21.5);
  }

  function footer(doc, left, right) {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(93, 104, 119);
      if (left) doc.text(left, MARGIN, pageH - 8);
      doc.text(`${right}  ·  pagina ${i} di ${pages}`, pageW - MARGIN, pageH - 8, { align: 'right' });
    }
  }

  function sectionTitle(doc, text, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(27, 34, 44);
    doc.text(text, MARGIN, y + 4);
    return y + 7;
  }

  async function build(data) {
    await ensure();
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageH = doc.internal.pageSize.getHeight();
    const margin = MARGIN;
    header(doc, data);

    let y = 28;
    for (const section of data.sections) {
      if (data.sections.length > 1) {
        if (y > pageH - 40) { doc.addPage(); y = margin + 4; }
        y = sectionTitle(doc, section.title, y);
      }
      const body = section.rows.map((r) => [r.name, ...r.cells.map((c) => c.text), r.total]);
      root.autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin, bottom: 16 },
        head: [['Dipendente', ...data.days, 'Turni']],
        body,
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, valign: 'middle', lineColor: [220, 223, 229], lineWidth: 0.2, textColor: [27, 34, 44] },
        headStyles: { fillColor: [238, 240, 243], textColor: [93, 104, 119], fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44 }, [data.days.length + 1]: { halign: 'center', cellWidth: 16 } },
        didParseCell(h) {
          if (h.section === 'head' && h.column.index === 0) h.cell.styles.halign = 'left';
          if (h.section !== 'body' || h.column.index === 0 || h.column.index > data.days.length) return;
          const cell = section.rows[h.row.index].cells[h.column.index - 1];
          const k = KIND[cell.kind] || KIND[''];
          h.cell.styles.fillColor = k.fill;
          h.cell.styles.textColor = k.text;
          h.cell.styles.halign = 'center';
          h.cell.styles.fontStyle = ['M', 'P', 'G'].includes(cell.kind) ? 'bold' : 'normal';
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    footer(doc, data.legend, data.footer);
    return doc.output('blob');
  }

  const TABLE_STYLE = {
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.2, valign: 'middle', lineColor: [220, 223, 229], lineWidth: 0.2, textColor: [27, 34, 44] },
    headStyles: { fillColor: [238, 240, 243], textColor: [93, 104, 119], fontStyle: 'bold' },
  };

  /**
   * PDF del riepilogo (A4 verticale).
   * @param {object} data  title, subtitle, kpis [[etichetta, valore, nota]], coverage [[reparto, richiesti, coperti, scoperti, %]] | null,
   *                       sections [{title, rows: [[nome, M, P, G, giorni, ferie, assenze, equilibrio]]}], footer
   */
  async function buildSummary(data) {
    await ensure();
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    header(doc, data);

    // Riquadri con i totali
    let y = 28;
    const gap = 4;
    const boxW = (pageW - MARGIN * 2 - gap * (data.kpis.length - 1)) / data.kpis.length;
    data.kpis.forEach(([label, value, note], i) => {
      const x = MARGIN + i * (boxW + gap);
      doc.setDrawColor(220, 223, 229);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, y, boxW, 21, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(93, 104, 119);
      doc.text(label, x + 3, y + 5.5, { maxWidth: boxW - 6 });
      doc.setFontSize(14);
      doc.setTextColor(label === 'Posti scoperti' && value !== '0' ? 179 : 27, label === 'Posti scoperti' && value !== '0' ? 38 : 34, label === 'Posti scoperti' && value !== '0' ? 30 : 44);
      doc.text(value, x + 3, y + 13.5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(93, 104, 119);
      if (note) doc.text(note, x + 3, y + 18.3);
    });
    y += 29;

    if (data.coverage) {
      y = sectionTitle(doc, 'Copertura per reparto', y);
      root.autoTable(doc, Object.assign({}, TABLE_STYLE, {
        startY: y,
        margin: { left: MARGIN, right: MARGIN, bottom: 16 },
        head: [['Reparto', 'Posti richiesti', 'Coperti', 'Scoperti', 'Copertura']],
        body: data.coverage,
        columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
        didParseCell(h) {
          if (h.section === 'head' && h.column.index > 0) h.cell.styles.halign = 'right';
          if (h.section === 'body' && h.column.index === 3 && h.cell.raw !== '0') {
            h.cell.styles.textColor = [179, 38, 30];
            h.cell.styles.fontStyle = 'bold';
          }
        },
      }));
      y = doc.lastAutoTable.finalY + 9;
    }

    if (y > pageH - 50) { doc.addPage(); y = MARGIN + 4; }
    y = sectionTitle(doc, 'Turni per dipendente', y);
    const body = [];
    const groupRows = new Set();
    for (const section of data.sections) {
      if (data.sections.length > 1) {
        groupRows.add(body.length);
        body.push([{ content: section.title.toUpperCase(), colSpan: 8 }]);
      }
      body.push(...section.rows);
    }
    root.autoTable(doc, Object.assign({}, TABLE_STYLE, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: 16 },
      head: [['Dipendente', 'Mattine', 'Pomeriggi', 'Intere', 'Giorni', 'Ferie', 'Assenze', 'Equilibrio']],
      body,
      columnStyles: { 0: { cellWidth: 50 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
      didParseCell(h) {
        if (h.section === 'head' && h.column.index >= 1 && h.column.index <= 6) h.cell.styles.halign = 'right';
        if (h.section !== 'body') return;
        if (groupRows.has(h.row.index)) {
          h.cell.styles.fillColor = [238, 240, 243];
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.fontSize = 8;
          h.cell.styles.textColor = [93, 104, 119];
          return;
        }
        if (h.column.index >= 3 && h.column.index <= 6 && h.cell.raw === '0') h.cell.text = [''];
        if (h.column.index === 7) {
          const v = String(h.cell.raw);
          const n = parseInt(v.replace(/\D/g, ''), 10) || 0;
          h.cell.styles.textColor = v === 'pari' || n <= 1 ? [29, 116, 70] : n <= 3 ? [143, 85, 0] : [179, 38, 30];
          h.cell.styles.fontStyle = 'bold';
        }
      },
    }));

    footer(doc, 'Giorni = mattine + pomeriggi + giornate intere. Ferie e assenze in giorni.', data.footer);
    return doc.output('blob');
  }

  root.TurniPDF = { build, buildSummary, ensure };
})(typeof self !== 'undefined' ? self : this);
