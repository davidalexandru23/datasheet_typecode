import fs from 'fs';
import path from 'path';

const specPath = path.join(process.cwd(), 'specs', 'fc202.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));

import { parseTypecode } from './src/features/decode/typecode-parser.js';

const res = parseTypecode('FC-202N560T7E54H2BGC3XXSXXXXALBPCX5XXD0', spec);
console.log("Strategy:", res.strategy);
console.log("Segments array length:", res.segments.length);
if (res.segments.length === 0) {
  console.log("Checking if spec has typecode_structure...");
  console.log("Has typecode_structure array?", Array.isArray(spec.typecode_structure));
  console.log("Length of typecode_structure?", spec.typecode_structure ? spec.typecode_structure.length : 'N/A');
}
