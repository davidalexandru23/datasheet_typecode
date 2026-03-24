import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './src/features/decode/technical-table-resolver.js';
import { extractDatasheetData } from './src/features/decode/data-extractor.js';
import { composeDatasheet } from './src/features/decode/datasheet-composer.js';

const specData = JSON.parse(fs.readFileSync('specs/ic2.json', 'utf-8'));
const typecode = 'iC2-30FA3N04-01A2E20F4+ACXX';
const parsed = parseTypecode(typecode, specData);
const decodeResult = {
  raw_typecode: typecode,
  manufacturer: specData.knowledge_base_metadata?.manufacturer || 'Danfoss',
  product_family: specData.knowledge_base_metadata?.product_family || 'iC2',
  segments: parsed.segments,
  technicalTables: resolveTechnicalTables(parsed.segments, specData)
};
const extracted_data = extractDatasheetData(decodeResult);

// DELIBERATELY BREAK PKW TO SEE WHAT THE RENDERER DID BEFORE STEP 698
extracted_data.power_kw = undefined;
extracted_data.power = undefined;

const finalDatasheet = composeDatasheet({ segments: parsed.segments, technicalTables: decodeResult.technicalTables, extracted_data });

const dimensiuni = finalDatasheet.find(s => s.title.includes('DIMENSIUNI'));
console.log("DIM ROWS BEFORE FIX:", dimensiuni ? dimensiuni.rows : 'MISSING');
