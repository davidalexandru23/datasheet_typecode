import fs from 'fs';
import path from 'path';
import { initRegistry } from './src/features/specs/spec-registry.js';
import { decodeTypecode } from './src/features/decode/decode-orchestrator.js';

// Load specs manually to simulate spec-loader.js behavior
const specsDir = './specs';
const specs = fs.readdirSync(specsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => {
    const content = JSON.parse(fs.readFileSync(path.join(specsDir, f), 'utf-8'));
    content._sourceFile = f;
    return content;
  });

initRegistry(specs);

const typecode = 'iC2-30FA3N04-01A2E20F4+ACXX';
const result = decodeTypecode(typecode);

if (result.error) {
  console.error('Error:', result.error);
} else {
  const { decodeResult, sections } = result;
  console.log('Detected Family:', decodeResult.product_family);
  console.log('Source Files:', decodeResult.source_files_used);
  console.log('Digital Outputs:', decodeResult.extracted_data.digital_outputs);
  
  const hardwareSection = sections.find(s => s.title === 'HARDWARE');
  const digitalOutputsRow = hardwareSection?.rows.find(r => r.label === 'Iesiri digitale');
  console.log('UI Row Value:', digitalOutputsRow?.value);
}
