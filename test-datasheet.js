import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './src/features/decode/technical-table-resolver.js';
import { extractDatasheetData } from './src/features/decode/data-extractor.js';
import { composeDatasheet } from './src/features/decode/datasheet-composer.js';

const specData = JSON.parse(fs.readFileSync('specs/fc202.json', 'utf-8'));
const typecode = 'FC-202P5K5T4E20H1XGXXXXSXXXXAXBXCXXXXDX';
const parsed = parseTypecode(typecode, specData);

const decodeResult = {
  raw_typecode: typecode,
  manufacturer: specData.knowledge_base_metadata?.manufacturer || 'Danfoss',
  product_family: specData.knowledge_base_metadata?.product_family || 'VLT AQUA Drive FC 202',
  segments: parsed.segments,
  technicalTables: resolveTechnicalTables(parsed.segments, specData)
};

const extracted = extractDatasheetData(decodeResult);
decodeResult.extracted_data = extracted;

const datasheet = composeDatasheet(decodeResult);

const zgomot = datasheet.find(s => s.title === 'NIVEL DE ZGOMOT');
const dim = datasheet.find(s => s.title.includes('DIMENSIUNI'));
const nom = datasheet.find(s => s.title === 'DATE NOMINALE');

console.log("Nominal Data:", JSON.stringify(nom?.rows, null, 2));
console.log("Zgomot Rows:", JSON.stringify(zgomot?.rows, null, 2));
console.log("Dimensiuni Rows:", JSON.stringify(dim?.rows, null, 2));
console.log("Extracted Data:", extracted);
