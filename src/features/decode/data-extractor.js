/**
 * Data Extractor - parses rich metadata and unstructured spec content
 * to build a flat map of technical data ready for the datasheet composer.
 * 
 * @module data-extractor
 */

import { DANFOSS_CONSTANTS } from './danfoss-constants.js';

/**
 * Extracts a unified flat map of datasheet parameters from all available sources
 * 
 * @param {import('../../types/knowledge-base.js').DecodeResult} decodeResult 
 * @returns {Record<string, string>} Flat map of key-value pairs
 */
export function extractDatasheetData(decodeResult) {
  const extracted = { ...DANFOSS_CONSTANTS };
  const { segments, technicalTables, manufacturer, product_family, raw_typecode } = decodeResult;

  // 1. Basic properties
  extracted.manufacturer = manufacturer || extracted.manufacturer;
  extracted.product_family = product_family;
  extracted.type_code = raw_typecode;

  // 2. Extract from technical tables
  if (technicalTables && technicalTables.length > 0) {
    for (const table of technicalTables) {
      // Merge KV tables (like environment limits, motor support)
      if (table.extractedKv && Object.keys(table.extractedKv).length > 0) {
        Object.assign(extracted, table.extractedKv);
      }

      // For matched rows in data tables, extract key metrics
      if (table.matchedRows && table.matchedRows.length > 0) {
        const row = table.matchedRows[0];
        
        // Find columns containing standard technical terms
        for (const [key, val] of Object.entries(row)) {
          const k = key.toLowerCase();
          const v = String(val);
          
          if (k.includes('current') || k.includes('curent') || k.includes('amps')) {
            extracted.output_current = v;
          }
          if (k.includes('efficien') || k.includes('eficienta')) {
            extracted.efficiency = v;
          }
          if (k.includes('height') || k.includes('inaltime')) {
            extracted.dimension_height = v;
          }
          if (k.includes('width') || k.includes('latime')) {
            extracted.dimension_width = v;
          }
          if (k.includes('depth') || k.includes('adancime')) {
            extracted.dimension_depth = v;
          }
          if (k.includes('weight') || k.includes('greutate') || k.includes('kg')) {
            extracted.weight = v;
          }
          if (k.includes('loss') || k.includes('pierdere')) {
            extracted.power_loss = v;
          }
        }
      }
    }
  }

  // 3. Extract missing data explicitly from segment parsing
  
  // Power
  let currentPower = extracted.power || _seg(segments, 'power', 'size');
  let voltStr = extracted.voltage_range || _seg(segments, 'voltage', 'ac_line', 'mains');
  let encStr = extracted.ip_rating || _seg(segments, 'enclosure', 'protection');

  // GLOBAL SEMANTIC HARVESTING: 
  // If technical parameters were embedded inside unnamed or option code segments (like VACON '+IP54'),
  // we do a global scan across ALL segment raw codes and meanings.
  for (const seg of segments) {
    const text = String(seg.meaning + ' ' + seg.raw_code).toUpperCase();
    
    if (!encStr && /IP\s*\d{2}/.test(text)) {
       const m = text.match(/(IP\s*\d{2})/);
       if (m) encStr = m[1];
    }
    
    if (!currentPower && (/[\d.]+\s*KW/.test(text) || /[\d.]+\s*HP/.test(text))) {
       const m = text.match(/([\d.]+\s*(?:KW|HP))/);
       if (m) currentPower = m[1];
    }

    if (!extracted.phases && /(\d)\s*(?:PHASE|FAZE|PH)/.test(text)) {
       const m = text.match(/(\d)\s*(?:PHASE|FAZE|PH)/);
       if (m) extracted.phases = m[1];
    }
    
    if (!voltStr && /\d{3,}[\s-]+\d{3,}\s*V/.test(text)) {
       const m = text.match(/(\d{3,}[\s-]+\d{3,}\s*V)/);
       if (m) voltStr = m[1].replace(/\s+/g, '');
    }
  }

  // Refine Power
  if (currentPower && !extracted.power_kw) {
    const match = currentPower.match(/([\d.]+)\s*kW/i);
    extracted.power_kw = match ? match[1] : currentPower;
  }

  // Refine Voltage and Phases
  if (voltStr) {
    const voltMatch = voltStr.match(/(\d+[\s-–]+\d+)\s*V/i);
    extracted.voltage_range = voltMatch ? voltMatch[1].replace(/–/g, '-') : voltStr;
    
    // Parse phase from voltage string if missing
    if (!extracted.phases) {
      const phaseMatch = voltStr.match(/^(\d)\s*[×xX]/);
      if (phaseMatch) extracted.phases = phaseMatch[1];
    }
  }
  
  // Refine IP Rating
  if (encStr) {
    const ipMatch = encStr.match(/IP\s*\d+/i);
    extracted.ip_rating = ipMatch ? ipMatch[0] : encStr;
  }

  return extracted;
}

/** Helper to find segment meanings */
function _seg(segments, ...keywords) {
  for (const kw of keywords) {
    const found = segments.find(s =>
      s.segment_name.toLowerCase().includes(kw.toLowerCase()) ||
      (s.segment_label && s.segment_label.toLowerCase().includes(kw.toLowerCase()))
    );
    if (found && found.meaning && !found.meaning.startsWith('Unknown')) {
      return found.meaning
        .replace(/\s*\(inferred(?:\s+from\s+[^)]+)?\)\s*/gi, '')
        .replace(/\s*\(extracted from spec description\)\s*/gi, '')
        .replace(/\s*\(Standard Danfoss[^)]*\)\s*/gi, '')
        .trim();
    }
  }
  return '';
}
