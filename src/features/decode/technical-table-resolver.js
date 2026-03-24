/**
 * Technical table resolver — looks up technical data from spec tables
 * based on decoded segment values.
 * 
 * @module technical-table-resolver
 */

/** @typedef {import('../../types/knowledge-base.js').KnowledgeBase} KnowledgeBase */
/** @typedef {import('../../types/knowledge-base.js').DecodedSegment} DecodedSegment */

/**
 * Resolve technical table data for decoded segments.
 * Matches segment values against table filter conditions.
 * 
 * @param {DecodedSegment[]} segments 
 * @param {KnowledgeBase} spec 
 * @returns {{ tableId: string, tableName: string, matchedRows: Object[], allRows: Object[], columns: string[], extractedKv: Record<string, string> }[]}
 */
export function resolveTechnicalTables(segments, spec) {
  if (!spec.technical_tables || spec.technical_tables.length === 0) return [];

  const results = [];

  for (const table of spec.technical_tables) {
    const { matchedRows, allRowsObj, extractedKv } = processTable(table, segments);
    
    results.push({
      tableId: table.table_id || '',
      tableName: table.table_name || '',
      matchedRows,
      allRows: allRowsObj,
      columns: table.columns || [],
      extractedKv,
      units: table.units || {},
      notes: table.notes || [],
    });
  }

  return results;
}

/**
 * Filter table rows based on decoded segment values and extract KV pairs.
 * 
 * @param {import('../../types/knowledge-base.js').TechnicalTable} table 
 * @param {DecodedSegment[]} segments 
 */
function processTable(table, segments) {
  const allRowsObj = [];
  const matchedRows = [];
  const extractedKv = {};

  if (!table.rows || !table.columns) return { matchedRows, allRowsObj, extractedKv };

  // Convert array-of-arrays to array-of-objects
  for (const rowArray of table.rows) {
    const rowObj = {};
    for (let i = 0; i < table.columns.length && i < rowArray.length; i++) {
        rowObj[table.columns[i]] = rowArray[i];
    }
    allRowsObj.push(rowObj);
  }

  // Detect parameter/value style tables (like environment limits)
  const isKvTable = table.columns.some(col => 
    ['parameter', 'code', 'feature', 'category'].includes(col.toLowerCase())
  );

  if (isKvTable) {
    const nameCol = table.columns.find(c => ['parameter', 'code', 'feature', 'category'].includes(c.toLowerCase())) || table.columns[0];
    const valCol = table.columns.find(c => ['value', 'description', 'unit', 'length'].includes(c.toLowerCase())) || table.columns[1];
    
    for (const rowObj of allRowsObj) {
      if (rowObj[nameCol] && rowObj[valCol]) {
        // Build a normalized key: "Ambient temperature maximum" -> "ambient_temperature_maximum"
        const key = String(rowObj[nameCol])
           .toLowerCase()
           .replace(/[^a-z0-9]+/g, '_')
           .replace(/_$/, '');
        
        extractedKv[key] = String(rowObj[valCol]);
      }
      matchedRows.push(rowObj); // All rows "match" in a KV table
    }
    return { matchedRows, allRowsObj, extractedKv };
  }

  // For data tables (dimensions, power ratings, acoustic noise), try to match multiple segments
  const powerSeg = segments.find(s => s.segment_name.toLowerCase().includes('power') || s.segment_name.toLowerCase().includes('size'));
  const voltSeg = segments.find(s => s.segment_name.toLowerCase().includes('voltage') || s.segment_name.toLowerCase().includes('mains'));
  const encSeg = segments.find(s => s.segment_name.toLowerCase().includes('enclosure') || s.segment_name.toLowerCase().includes('protection'));
  
  const appliesStr = (table.applies_to || '').toLowerCase();
  const scoredRows = [];

  for (const rowObj of allRowsObj) {
    let score = 0;
    const rowValues = Object.values(rowObj).map(String).map(s => s.toLowerCase());

    // 1. Enclosure matching
    if (encSeg) {
      const encCode = encSeg.raw_code.toLowerCase();
      if (rowValues.some(val => val === encCode)) {
        score += 3;
      } else if (rowValues.some(val => val.includes(encCode))) {
        score += 2;
      }
    }

    // 2. Power matching
    if (powerSeg) {
      let kwMatch = powerSeg.meaning.match(/([\d.]+)\s*kW/i);
      let kwVal = kwMatch ? kwMatch[1] : powerSeg.raw_code;
      const powerCodeLower = powerSeg.raw_code.toLowerCase();
      const kwValLower = kwVal.toLowerCase();

      if (rowValues.some(val => val === powerCodeLower)) {
        score += 4; // exact typecode match (e.g. N110)
      } else if (rowValues.some(val => val === kwValLower)) {
        score += 3; // exact kW match (e.g. 110)
      } else if (rowValues.some(val => val.includes(powerCodeLower) || val.includes(kwValLower))) {
        score += 1; // partial string match
      }
    }

    // 3. Voltage matching
    if (voltSeg) {
      const voltCode = voltSeg.raw_code.toLowerCase();
      if (rowValues.some(val => val.includes(voltCode))) {
        score += 2;
      } else if (appliesStr.includes(voltCode)) {
        score += 1;
      }
    }

    // 4. Dynamic Dimenions Inference matching
    if (powerSeg && voltSeg && encSeg) {
      let kwMatch = powerSeg.meaning.match(/([\d.]+)\s*kW/i);
      let extractedKwVal = kwMatch ? kwMatch[1] : powerSeg.raw_code;
      const kw = parseFloat(extractedKwVal);
      const ipMatch = encSeg.raw_code.match(/\d+/);
      const ip = ipMatch ? parseInt(ipMatch[0], 10) : 20;
      const vCode = voltSeg.raw_code.toUpperCase();
      let inferredEnc = '';
      
      if (vCode === 'T4') {
        if (ip <= 21) {
          if (kw <= 4.0) inferredEnc = 'A2';
          else if (kw <= 7.5) inferredEnc = 'A3';
          else if (kw <= 15) inferredEnc = 'B3';
          else if (kw <= 22) inferredEnc = 'B4';
          else if (kw <= 45) inferredEnc = 'C3';
          else if (kw <= 75) inferredEnc = 'C4';
        } else {
          if (kw <= 4.0) inferredEnc = 'A4';
          else if (kw <= 7.5) inferredEnc = 'A5';
          else if (kw <= 22) inferredEnc = 'B1';
          else if (kw <= 30) inferredEnc = 'B2';
          else if (kw <= 75) inferredEnc = 'C1';
          else if (kw <= 90) inferredEnc = 'C2';
        }
      } else if (vCode === 'T2') {
         if (ip <= 21) {
          if (kw <= 2.2) inferredEnc = 'A2';
          else if (kw <= 3.7) inferredEnc = 'A3';
          else if (kw <= 11) inferredEnc = 'B3';
          else if (kw <= 15) inferredEnc = 'B4';
          else if (kw <= 22) inferredEnc = 'C3';
          else inferredEnc = 'C4';
         }
      }

      if (inferredEnc && rowValues.some(val => val === inferredEnc.toLowerCase())) {
        score += 10; // Massive score for dynamically matching the physical enclosure size directly
      }
    }

    // Include any row that matches at least one condition (or table condition)
    if (score > 0) {
      scoredRows.push({ rowObj, score });
    }
  }

  // Sort by highest score first
  scoredRows.sort((a, b) => b.score - a.score);
  
  if (scoredRows.length > 0) {
    matchedRows.push(...scoredRows.map(s => s.rowObj));
  }

  // Fallback: if no rows matched, return empty so we don't blindly pick random data
  if (matchedRows.length === 0) {
      return { matchedRows: [], allRowsObj, extractedKv };
  }

  return { matchedRows, allRowsObj, extractedKv };
}
