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
const finalDatasheet = composeDatasheet({ segments: parsed.segments, technicalTables: decodeResult.technicalTables, extracted_data });

console.log("FINAL SECTIONS: ", finalDatasheet.map(s => s.title).join(', '));
const zgomot = finalDatasheet.find(s => s.title === 'NIVEL DE ZGOMOT');
console.log("ZGOMOT ROWS:", zgomot ? zgomot.rows : 'MISSING');
const dimensiuni = finalDatasheet.find(s => s.title.includes('DIMENSIUNI'));
console.log("DIM ROWS:", dimensiuni ? dimensiuni.rows : 'MISSING');
