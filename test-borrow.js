import fs from 'fs';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const specDir = path.join(__dirname, 'specs');
const files = fs.readdirSync(specDir).filter(f => f.endsWith('.json'));
const specs = [];
for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(specDir, f), 'utf-8'));
    specs.push(data);
  } catch(e) {}
}

import { decodeTypecode } from './src/features/decode/decode-orchestrator.js';

// Setup registry mock so decodeTypecode has access to all specs
import { initRegistry } from './src/features/specs/spec-registry.js';
initRegistry(specs);

const rawTypecode = 'FC-202N560T7E54H2BGC3XXSXXXXALBPCX5XXD0';
const res = decodeTypecode(rawTypecode);

console.log("Decode Result Segments Count:", res.decodeResult.segments.length);
console.log("Extracted KV:", res.decodeResult.extracted_data.power_kw, res.decodeResult.extracted_data.voltage_in);
res.decodeResult.segments.forEach(s => console.log(s.segment_name, '=>', s.meaning));
