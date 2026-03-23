/**
 * PDF exporter -- generates a datasheet PDF matching the reference
 * Danfoss industrial document style.
 *
 * Layout:
 * - Header: "Fisa tehnica" title + product name, Danfoss SRL info on right
 * - First Danfoss red logo top-right
 * - 4 column table: Nr.crt | Caracteristici | Valoare | Unitati
 * - Section headers as bold rows
 * - Footer: "Classified as Business" + Danfoss logo
 *
 * @module pdf-exporter
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import danfossLogoSvg from '../../assets/Danfoss-Logo.svg?raw';

/**
 * @param {import('../../types/knowledge-base.js').DatasheetSection[]} sections
 * @param {{ title?: string, date?: string, typecode?: string, family?: string }} meta
 */
export async function exportPdf(sections, meta = {}) {
  // ── PREPARE LOGO ──
  const loadSvgAsPngDataUrl = (svgString) => {
    return new Promise((resolve) => {
      const img = new Image();
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Ensure high resolution drawing
        canvas.width = img.width || 800;
        canvas.height = img.height || 335;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  };

  const logoPngUrl = await loadSvgAsPngDataUrl(danfossLogoSvg);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;

  // ── COLOR PALETTE ──
  const RED = [218, 41, 28];       // Danfoss red
  const BLACK = [0, 0, 0];
  const WHITE = [255, 255, 255];
  const HEADER_BG = [218, 41, 28]; // Red header bar for table header
  const ROW_EVEN = [255, 255, 255];
  const ROW_ODD = [248, 248, 248];
  const SECTION_BG = [255, 255, 255];

  // ── HEADER ──
  function drawHeader() {
    let y = 12;

    // "Fisa tehnica" title
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...BLACK);
    doc.text('Fisa tehnica', marginL, y);
    y += 6;

    // Product family name (large bold)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(meta.family || '', marginL, y);
    y += 7;

    // Type code
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(meta.typecode || '', marginL, y);

    // Right side: Danfoss SRL info
    const infoLines = [
      'Danfoss SRL',
      'Bd. Tudor Vladimirescu nr 22',
      'Green Gate Office Building - Etaj10',
      'Sector 5, Bucuresti, Romania',
      'Tel.: +4 031 222 21 22',
      'Fax: +4 031 222 21 08',
      'E-mail: danfoss.ro@danfoss.com',
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    
    // Position text directly below the logo avoiding overlap
    let infoY = 24; 
    for (const line of infoLines) {
      doc.text(line, pageW - marginR, infoY, { align: 'right' });
      infoY += 3.2;
    }

    // Embed the converted PNG logo in top right corner
    if (logoPngUrl) {
      doc.addImage(logoPngUrl, 'PNG', pageW - marginR - 35, 5, 35, 14.6);
    } else {
      // Fallback
      doc.setFillColor(...RED);
      doc.roundedRect(pageW - marginR - 35, 5, 35, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...WHITE);
      doc.text('Danfoss', pageW - marginR - 17.5, 12, { align: 'center' });
    }

    // The table should start below BOTH the left-side text and the right-side address block
    const maxHeaderY = Math.max(y + 8, infoY + 6);
    return maxHeaderY;
  }

  // ── FOOTER ──
  function drawFooter(pageNum, totalPages) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);

    // "Fisa tehnica | PRODUCT" on left
    const footerLeft = `Fisa tehnica | ${meta.family || ''}`;
    doc.text(footerLeft, marginL, pageH - 8);

    // Danfoss red logo (small at bottom right corner)
    if (logoPngUrl) {
      doc.addImage(logoPngUrl, 'PNG', pageW - marginR - 22, pageH - 12, 22, 9.2);
    } else {
      doc.setFillColor(...RED);
      doc.roundedRect(pageW - marginR - 22, pageH - 14, 22, 7, 1, 1, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(...WHITE);
      doc.text('Danfoss', pageW - marginR - 11, pageH - 9.5, { align: 'center' });
    }

    // "Classified as Business"
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text('Classified as Business', pageW / 2, pageH - 4, { align: 'center' });
  }

  // ── BUILD TABLE DATA ──
  const tableBody = [];

  for (const section of sections) {
    if (!section.visible) continue;

    for (const r of section.rows) {
      if (!r.visible) continue;

      if (r.isHeader) {
        tableBody.push({
          nr: r.numbering,
          label: r.label,
          value: r.value,
          unit: r.unit,
          _isHeader: true,
        });
      } else {
        tableBody.push({
          nr: r.numbering,
          label: r.label,
          value: r.value,
          unit: r.unit,
          _isHeader: false,
        });
      }
    }
  }

  // ── RENDER ──
  const startY = drawHeader();

  autoTable(doc, {
    startY: startY,
    margin: { left: marginL, right: marginR, bottom: 20 },
    tableWidth: contentW,
    theme: 'grid',
    headStyles: {
      fillColor: HEADER_BG,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
      valign: 'middle',
      cellPadding: 2,
    },
    head: [[
      { content: 'Nr.crt', styles: { cellWidth: 18 } },
      { content: 'Caracteristici', styles: { cellWidth: contentW * 0.42 } },
      { content: 'Valoare', styles: { cellWidth: contentW * 0.35 } },
      { content: 'Unitati', styles: { cellWidth: 'auto' } },
    ]],
    body: tableBody.map(r => [r.nr, r.label, r.value, r.unit]),
    columnStyles: {
      0: { cellWidth: 18, fontSize: 8 },
      1: { cellWidth: contentW * 0.42, fontSize: 8 },
      2: { cellWidth: contentW * 0.35, fontSize: 8 },
      3: { cellWidth: 'auto', fontSize: 8 },
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.5,
      lineColor: [200, 200, 200],
      lineWidth: 0.2,
      textColor: BLACK,
      valign: 'middle',
    },
    alternateRowStyles: {
      fillColor: ROW_ODD,
    },
    willDrawCell: function(data) {
      if (data.section === 'body' && data.row && data.row.raw) {
        const rowData = tableBody[data.row.index];
        if (rowData && rowData._isHeader) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = SECTION_BG;
          data.cell.styles.fontSize = 9;
        }
      }
    },
    didDrawPage: function(data) {
      // Re-draw header on continuation pages
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BLACK);
        doc.text(`Fisa tehnica | ${meta.family || ''}`, marginL, 10);

        // Small Danfoss logo in header on continuation pages
        if (logoPngUrl) {
          doc.addImage(logoPngUrl, 'PNG', pageW - marginR - 22, 4, 22, 9.2);
        } else {
          doc.setFillColor(...RED);
          doc.roundedRect(pageW - marginR - 22, 4, 22, 7, 1, 1, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(...WHITE);
          doc.text('Danfoss', pageW - marginR - 11, 8.5, { align: 'center' });
        }
      }

      // Footer on every page
      const totalPages = doc.internal.getNumberOfPages();
      drawFooter(data.pageNumber, totalPages);
    },
  });

  // ── DISCLAIMER TEXT (last page) ──
  let lastPageY = doc.lastAutoTable.finalY + 15;
  
  // If the table ended too far down the page, we need a new page for the disclaimer
  if (lastPageY > pageH - 35) {
    doc.addPage();
    lastPageY = 20; // reset to top of new page
  }
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(120, 120, 120);
  const disclaimer = [
    'Orice informație, incluzând, dar fără a se limita la informații privind selectarea produsului, aplicația sau utilizarea acestuia, proiectarea produsului, greutatea, dimensiunile, capacitatea sau',
    'orice alte date tehnice din manuale de produs, descrieri de catalog, materiale publicitare etc., indiferent dacă sunt puse la dispoziție în scris, oral, electronic, online sau prin descărcare,',
    'trebuie considerată drept informativă și devine obligatorie doar dacă și în măsura în care se face referire explicită la aceasta într-o ofertă sau într-o confirmare de comandă.',
    '',
    'Danfoss nu poate accepta nicio responsabilitate pentru posibile erori în cataloage, broșuri, videoclipuri sau alte materiale. Danfoss își rezervă dreptul de a modifica produsele sale fără',
    'notificare prealabilă. Aceasta se aplică și produselor comandate, dar nelivrate, cu condiția ca astfel de modificări să poată fi realizate fără a afecta forma, potrivirea sau funcția produsului.',
    '',
    'Toate mărcile comerciale incluse în acest material sunt proprietatea Danfoss A/S sau a companiilor din grupul Danfoss. „Danfoss” și sigla Danfoss sunt mărci comerciale ale Danfoss A/S.',
    'Toate drepturile sunt rezervate.',
  ];

  let disclaimerY = lastPageY;
  for (const line of disclaimer) {
    if (line === '') {
      disclaimerY += 2;
      continue;
    }
    doc.text(line, marginL, disclaimerY);
    disclaimerY += 2.5;
  }

  // ── SAVE ──
  const filename = `Fisa_tehnica_${(meta.family || 'datasheet').replace(/[^a-zA-Z0-9]/g, '_')}_${meta.typecode ? meta.typecode.replace(/[^a-zA-Z0-9]/g, '_') : 'export'}.pdf`;
  doc.save(filename);
}
