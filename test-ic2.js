import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './src/features/decode/technical-table-resolver.js';
import { extractDatasheetData } from './src/features/decode/data-extractor.js';

const specData = JSON.parse(fs.readFileSync('specs/ic2.json', 'utf-8'));
const typecode = 'iC2-30FA3N04-01A2E20F4+ACXX';
const parsed = parseTypecode(typecode, specData);
const decodeResult = {
  raw_typecode: typecode,
  segments: parsed.segments,
  technicalTables: resolveTechnicalTables(parsed.segments, specData)
};

const extracted = extractDatasheetData(decodeResult);
console.log("\nEXTRACTED DATA:");
const keys = ['product_family', 'voltage_range', 'output_current', 'power_kw', 'ip_rating', 'dimension_width', 'dimension_height', 'dimension_depth', 'weight', 'acoustic_noise'];
keys.forEach(k => console.log(`${k.padEnd(20)}: ${extracted[k]}`));
