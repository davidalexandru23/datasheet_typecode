import { exportPdf } from './src/lib/pdf/pdf-exporter.js';

const sections = [{
  id: 'sec-1',
  title: 'PRODUCATOR',
  visible: true,
  rows: [
    { id: '1', numbering: '1.1', label: 'Producator', value: 'Danfoss', unit: '', visible: true, isHeader: false }
  ]
}];

const meta = { family: 'FC-102', typecode: 'FC-102...' };

try {
  exportPdf(sections, meta);
  console.log("Export succeeded!");
} catch (e) {
  console.error("Export failed:", e);
}
