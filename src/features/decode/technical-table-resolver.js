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

  // For data tables (dimensions, power ratings), try to match the power or voltage code
  const powerSeg = segments.find(s => s.segment_name.includes('power') || s.segment_name.includes('size'));
  const voltSeg = segments.find(s => s.segment_name.includes('voltage'));
  const encSeg = segments.find(s => s.segment_name.includes('enclosure'));

  for (const rowObj of allRowsObj) {
    let rowMatchedAnyCriteria = false;
    const rowValues = Object.values(rowObj).map(String);

    // Check enclosure matches
    if (encSeg && rowValues.some(val => 
        val.toLowerCase() === encSeg.raw_code.toLowerCase() ||
        val.toLowerCase().includes(encSeg.raw_code.toLowerCase())
      )) {
      rowMatchedAnyCriteria = true;
    }
    
    // Check power matches prefix (e.g. P1K1 matches 1.1)
    if (!rowMatchedAnyCriteria && powerSeg) {
        // P1K1 -> 1.1, P90K -> 90
        let kwMatch = powerSeg.meaning.match(/([\d.]+)\s*kW/i);
        let kwVal = kwMatch ? kwMatch[1] : powerSeg.raw_code;
        
        if (rowValues.some(val => val.includes(kwVal) || val.includes(powerSeg.raw_code))) {
            rowMatchedAnyCriteria = true;
        }
    }

    if (!rowMatchedAnyCriteria && voltSeg) {
         if (rowValues.some(val => val.toUpperCase().includes(voltSeg.raw_code.toUpperCase()))) {
            rowMatchedAnyCriteria = true;
        }
    }

    if (rowMatchedAnyCriteria) {
      matchedRows.push(rowObj);
    }
  }

  // Fallback: if no rows matched, return all rows
  if (matchedRows.length === 0) {
      return { matchedRows: allRowsObj, allRowsObj, extractedKv };
  }

  return { matchedRows, allRowsObj, extractedKv };
}
