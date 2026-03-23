import { jsPDF } from 'jspdf';
import fs from 'fs';

const doc = new jsPDF();
const svgStr = fs.readFileSync('./src/assets/Danfoss-Logo.svg', 'utf8');

try {
  doc.addSvgAsImage(svgStr, 10, 10, 100, 50);
  doc.save('test-svg.pdf');
  console.log("SVG added successfully!");
} catch (e) {
  console.error("SVG failed:", e.message);
}
