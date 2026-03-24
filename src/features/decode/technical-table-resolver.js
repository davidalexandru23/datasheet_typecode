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
  let dynamicallyResolvedEnclosure = null;

  for (const table of spec.technical_tables) {
    const { matchedRows, allRowsObj, extractedKv, maxScore } = processTable(table, segments, dynamicallyResolvedEnclosure);
    
    // If we just resolved a table that contains an enclosure/chassis column, capture its value for the NEXT tables
    if (matchedRows && matchedRows.length > 0 && maxScore > 5) { // Only trust high-quality matches for dynamic linking
      const bestMatch = matchedRows[0];
      const encKey = Object.keys(bestMatch).find(k => 
        k.toLowerCase().includes('enclosure') || 
        k.toLowerCase().includes('chassis') || 
        k.toLowerCase().includes('frame')
      );
      if (encKey && bestMatch[encKey]) {
        dynamicallyResolvedEnclosure = String(bestMatch[encKey]).toLowerCase();
      }
    }

    results.push({
      tableId: table.table_id || '',
      tableName: table.table_name || '',
      matchedRows,
      allRows: allRowsObj,
      columns: table.columns || [],
      extractedKv,
      units: table.units || {},
      notes: table.notes || [],
      maxScore: maxScore || 0,
    });
  }

  return results;
}

/**
 * Filter table rows based on decoded segment values and extract KV pairs.
 * 
 * @param {import('../../types/knowledge-base.js').TechnicalTable} table 
 * @param {DecodedSegment[]} segments 
 * @param {string} dynamicallyResolvedEnclosure
 */
function processTable(table, segments, dynamicallyResolvedEnclosure = null) {
  const allRowsObj = [];
  const matchedRows = [];
  const extractedKv = {};
  let maxScore = 0;

  if (!table.rows || !table.columns) return { matchedRows, allRowsObj, extractedKv, maxScore: 0 };

  // Convert array-of-arrays to array-of-objects, or pass through if already objects
  for (const rowItem of table.rows) {
    if (Array.isArray(rowItem)) {
      const rowObj = {};
      for (let i = 0; i < table.columns.length && i < rowItem.length; i++) {
          rowObj[table.columns[i]] = rowItem[i];
      }
      allRowsObj.push(rowObj);
    } else if (typeof rowItem === 'object' && rowItem !== null) {
      allRowsObj.push(rowItem);
    } else {
      allRowsObj.push(rowItem);
    }
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
    return { matchedRows, allRowsObj, extractedKv, maxScore: 100 }; // KV tables have absolute priority
  }

  // For data tables (dimensions, power ratings, acoustic noise), try to match multiple segments
  const powerSeg = segments.find(s => {
    const n = s.segment_name.toLowerCase();
    return n.includes('power') || n.includes('size') || n.includes('current') || n.includes('rated');
  });
  const voltSeg = segments.find(s => 
    s.segment_name.toLowerCase().includes('voltage') || 
    s.segment_name.toLowerCase().includes('mains')
  );
  const encSeg = segments.find(s => 
    s.segment_name.toLowerCase().includes('enclosure') || 
    s.segment_name.toLowerCase().includes('protection') ||
    s.segment_name.toLowerCase().includes('chassis')
  );
  
  const appliesStr = (table.applies_to || '').toLowerCase();
  
  // Detect if tab columns include a primary key for ratings (VACON or VLT pattern)
  const firstCol = (table.columns[0] || '').toLowerCase();
  const isRatedCurrentTable = firstCol.includes('rated') && firstCol.includes('current');
  const isPowerCodeTable = firstCol.includes('power') && firstCol.includes('code');

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

    // 2. Power / Rated current matching
    if (powerSeg) {
      let kwMatch = powerSeg.meaning.match(/([\d.]+)\s*kW/i);
      let kwVal = kwMatch ? kwMatch[1] : powerSeg.raw_code;
      const powerCodeLower = powerSeg.raw_code.toLowerCase();
      const kwValLower = kwVal.toLowerCase();

      // 2a. Primary column match (index 0 is usually the code/model ID)
      const primaryVal = rowValues[0] || '';
      
      // VACON pattern: rated_current_code matches directly against Rated_current_code column
      // VLT pattern: power_code matches directly against Power_code column
      if ((isRatedCurrentTable || isPowerCodeTable) && primaryVal === powerCodeLower) {
        score += 15; // Very high — exact primary key match
      } else if (primaryVal === powerCodeLower || (primaryVal.includes('-') && primaryVal.split('-').pop() === powerCodeLower)) {
        score += 10;
      } else if (rowValues.some(val => val === powerCodeLower)) {
        score += 8; // exact typecode match in any column
      } else if (rowValues.some(val => val === kwValLower)) {
        score += 3; // exact kW match (e.g. 110)
      } else if (rowValues.some(val => val.includes(powerCodeLower) || val.includes(kwValLower))) {
        score += 1; // partial string match
      }
    }

    // 3. Voltage matching
    if (voltSeg) {
      const voltCode = voltSeg.raw_code.toLowerCase();
      const voltMeaning = (voltSeg.meaning || '').toLowerCase()
        .replace(/\s*\(inferred[^)]*\)\s*/gi, '')
        .replace(/\s*\(extracted[^)]*\)\s*/gi, '')
        .trim();
      
      // Strong match: voltage meaning (e.g. "380-500 v") matches a row value
      if (voltMeaning && rowValues.some(val => val.includes(voltMeaning) || voltMeaning.includes(val))) {
        score += 5;
      } else if (rowValues.some(val => val.includes(voltCode))) {
        score += 2;
      } else if (appliesStr.includes(voltCode)) {
        score += 1;
      }
    }

    // 4. Dynamic Cascading Linked Enclosure
    if (dynamicallyResolvedEnclosure && rowValues.some(val => val === dynamicallyResolvedEnclosure)) {
      score += 20; // 20 points for hard-linked dimension resolution
    }

    // 5. Legacy VLT Dimensions Inference matching
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

    // Include any row that matches at least one condition
    if (score > 0) {
      scoredRows.push({ rowObj, score });
      if (score > maxScore) maxScore = score;
    }
  }

  // Sort by highest score first
  scoredRows.sort((a, b) => b.score - a.score);
  
  if (scoredRows.length > 0) {
    // ONLY return rows that share the absolute highest score for this table
    const topScorers = scoredRows.filter(s => s.score === maxScore);
    matchedRows.push(...topScorers.map(s => s.rowObj));
  }

  // Fallback: if no rows matched, return empty so we don't blindly pick random data
  if (matchedRows.length === 0) {
      return { matchedRows: [], allRowsObj, extractedKv, maxScore: 0 };
  }

  return { matchedRows, allRowsObj, extractedKv, maxScore };
}
