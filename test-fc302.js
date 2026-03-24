import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './src/features/decode/technical-table-resolver.js';
import { extractDatasheetData } from './src/features/decode/data-extractor.js';
import { composeDatasheet } from './src/features/decode/datasheet-composer.js';

const p = 'specs/fc302.json';
const specData = JSON.parse(fs.readFileSync(p, 'utf-8'));
const typecode = 'FC-302P5K5T5E20H1BGCXXXSXXXXA0BXCXXXXD0';
const parsed = parseTypecode(typecode, specData);

const decodeResult = {
  raw_typecode: typecode,
  manufacturer: specData.knowledge_base_metadata?.manufacturer || 'Danfoss',
  product_family: specData.knowledge_base_metadata?.product_family || 'VLT AutomationDrive FC 302',
  segments: parsed.segments,
  technicalTables: resolveTechnicalTables(parsed.segments, specData)
};

const extracted = extractDatasheetData(decodeResult);
decodeResult.extracted_data = extracted;
const datasheet = composeDatasheet(decodeResult);

console.log("Output Current:", extracted.output_current);
console.log("Efficiency:", extracted.efficiency);
console.log("Overload Time:", extracted.overload_time_high_overload);
console.log("Acoustic Noise:", extracted.acoustic_noise);
console.log("Height:", extracted.dimension_height);
