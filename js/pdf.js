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
  async function build(data) {
    await ensure();
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 12;

    doc.setFillColor(200, 16, 46);
    doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(27, 34, 44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(17);
    doc.text(data.title, margin, 15);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(93, 104, 119);
    doc.text(data.subtitle, margin, 21.5);

    let y = 28;
    for (const section of data.sections) {
      if (data.sections.length > 1) {
        if (y > pageH - 40) { doc.addPage(); y = margin + 4; }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(27, 34, 44);
        doc.text(section.title, margin, y + 4);
        y += 7;
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
          h.cell.styles.fontStyle = cell.kind === 'M' || cell.kind === 'P' ? 'bold' : 'normal';
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(93, 104, 119);
      doc.text(data.legend, margin, pageH - 8);
      doc.text(`${data.footer}  ·  pagina ${i} di ${pages}`, pageW - margin, pageH - 8, { align: 'right' });
    }
    return doc.output('blob');
  }

  root.TurniPDF = { build, ensure };
})(typeof self !== 'undefined' ? self : this);
