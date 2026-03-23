import { loadAllSpecs } from './src/features/specs/spec-loader.js';
import { initRegistry } from './src/features/specs/spec-registry.js';
import { decodeTypecode } from './src/features/decode/decode-orchestrator.js';

async function run() {
    const specs = await loadAllSpecs();
    initRegistry(specs);
    const res = decodeTypecode('FC-202N560T7E54H2BGC3XXSXXXXALBPCX5XXD0');
    console.log("EXTRACTED DATA:");
    console.log(JSON.stringify(res.decodeResult.extracted_data, null, 2));
    console.log("\nSEGMENTS:");
    console.log(JSON.stringify(res.decodeResult.segments.map(s => ({n:s.segment_name, m:s.meaning, r:s.raw_code})), null, 2));
}

run().catch(console.error);
