import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './src/features/decode/technical-table-resolver.js';
import { extractDatasheetData } from './src/features/decode/data-extractor.js';

const specData = JSON.parse(fs.readFileSync('specs/vaconnxp.json', 'utf-8'));
const typecode = 'NXP01706A0T0SWF-LIQC';
const parsed = parseTypecode(typecode, specData);
const decodeResult = {
  raw_typecode: typecode,
  manufacturer: specData.knowledge_base_metadata?.manufacturer || 'Danfoss',
  product_family: specData.knowledge_base_metadata?.product_family || 'VACON NXP',
  segments: parsed.segments,
  technicalTables: resolveTechnicalTables(parsed.segments, specData)
};

const extracted = extractDatasheetData(decodeResult);
console.log("\nEXTRACTED DATA:");
const keys = ['manufacturer', 'product_family', 'voltage_range', 'output_current', 'power_kw', 'ip_rating', 'dimension_width', 'dimension_height', 'dimension_depth', 'cooling_agent', 'max_pressure_bar'];
keys.forEach(k => console.log(`${k.padEnd(20)}: ${extracted[k]}`));
