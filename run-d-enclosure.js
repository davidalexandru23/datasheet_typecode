import fs from 'fs';
import { parseTypecode } from './src/features/decode/typecode-parser.js';
import { resolveTechnicalTables } from './tmp-resolver.js';

const specData = JSON.parse(fs.readFileSync('specs/ic2.json', 'utf-8'));
const typecode = 'iC2-30FA3N04-01A2E20F4+ACXX';
const parsed = parseTypecode(typecode, specData);
resolveTechnicalTables(parsed.segments, specData);
