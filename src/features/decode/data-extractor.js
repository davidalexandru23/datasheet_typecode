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
          
          if (k.includes('output_current_continuous') || (k.includes('current') && !extracted.output_current && !k.includes('input') && !k.includes('intermittent'))) {
            extracted.output_current = v;
          }
          if (k.includes('intermittent') || (k.includes('overload') && k.includes('current'))) {
            extracted.overload_current = v;
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
          if (k.includes('power_loss') || k.includes('loss') || k.includes('pierdere')) {
            extracted.power_loss = v;
          }
          if (k.includes('acoustic') || k.includes('noise') || k.includes('zgomot')) {
            if (k.includes('full') || !extracted.acoustic_noise) {
              extracted.acoustic_noise = v;
            }
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

  // ==== FALLBACK MATHEMATICAL INFERENCE ====
  // If the user's JSON omitted electrical tables, we dynamically calculate the nominals here.
  if (extracted.power_kw) {
      const kw = parseFloat(extracted.power_kw);
      if (!extracted.output_current) {
         // Generic dynamic mapping for output current:
         // 400V drives: ~2.1A per kW. 200V drives: ~4.2A per kW. 690V drives: ~1.2A per kW.
         const is200v = (extracted.voltage_range || '').includes('200');
         const is690v = (extracted.voltage_range || '').includes('690');
         let est = kw * (is200v ? 4.2 : (is690v ? 1.2 : 2.18));
         extracted.output_current = Math.round(est).toString();
      }
      if (!extracted.overload_current && extracted.output_current) {
         // High overload is typically 150-160% of continuous
         extracted.overload_current = Math.round(parseFloat(extracted.output_current) * 1.5).toString();
      }
      if (!extracted.efficiency) {
         extracted.efficiency = "0.98"; 
      }
      if (!extracted.power_loss) {
         // rough 2.5% loss mapping
         extracted.power_loss = Math.round(kw * 1000 * 0.025).toString();
      }
      if (!extracted.overload_time_high_overload && !extracted.overload_time_160pct) {
         extracted.overload_time_high_overload = "60 s";
      }

      // ==== DYNAMIC DIMENSIONS & NOISE FALLBACK ====
      if (!extracted.dimension_height || !extracted.acoustic_noise) {
          const encSize = _inferEnclosureSize(kw, extracted.voltage_range, extracted.ip_rating);
          const dimMap = {
              'A2': { h: '268', w: '90', d: '205', wt: '4.9', noise: '60' },
              'A3': { h: '375', w: '90', d: '207', wt: '5.3', noise: '60' },
              'A4': { h: '390', w: '130', d: '205', wt: '6.0', noise: '60' },
              'A5': { h: '420', w: '130', d: '207', wt: '7.0', noise: '60' },
              'B1': { h: '480', w: '242', d: '260', wt: '23.0', noise: '63' },
              'B2': { h: '650', w: '242', d: '260', wt: '27.0', noise: '63' },
              'B3': { h: '419', w: '165', d: '248', wt: '12.0', noise: '63' },
              'B4': { h: '595', w: '165', d: '248', wt: '13.5', noise: '63' },
              'C1': { h: '680', w: '308', d: '310', wt: '45.0', noise: '67' },
              'C2': { h: '770', w: '370', d: '335', wt: '65.0', noise: '67' },
              'C3': { h: '550', w: '329', d: '332', wt: '35.0', noise: '67' },
              'C4': { h: '660', w: '370', d: '332', wt: '50.0', noise: '67' }
          };
          
          if (encSize && dimMap[encSize]) {
              extracted.dimension_height = extracted.dimension_height || dimMap[encSize].h;
              extracted.dimension_width = extracted.dimension_width || dimMap[encSize].w;
              extracted.dimension_depth = extracted.dimension_depth || dimMap[encSize].d;
              extracted.weight = extracted.weight || dimMap[encSize].wt;
              extracted.acoustic_noise = extracted.acoustic_noise || dimMap[encSize].noise;
          }
      }
  }

  return extracted;
}

/** Helper to infer mechanical enclosure size */
function _inferEnclosureSize(kw, voltageRange, ipRating) {
    if (!kw || !ipRating) return null;
    const ipStr = String(ipRating);
    const ip = ipStr.match(/\d+/) ? parseInt(ipStr.match(/\d+/)[0], 10) : 20;
    const vCode = String(voltageRange || '').includes('200') ? 'T2' : 'T4';
    
    if (vCode === 'T4') {
        if (ip <= 21) {
            if (kw <= 4.0) return 'A2';
            if (kw <= 7.5) return 'A3';
            if (kw <= 15) return 'B3';
            if (kw <= 22) return 'B4';
            if (kw <= 45) return 'C3';
            if (kw <= 75) return 'C4';
        } else {
            if (kw <= 4.0) return 'A4';
            if (kw <= 7.5) return 'A5';
            if (kw <= 22) return 'B1';
            if (kw <= 30) return 'B2';
            if (kw <= 75) return 'C1';
            if (kw <= 90) return 'C2';
        }
    } else if (vCode === 'T2') {
        if (ip <= 21) {
            if (kw <= 2.2) return 'A2';
            if (kw <= 3.7) return 'A3';
            if (kw <= 11) return 'B3';
            if (kw <= 15) return 'B4';
            if (kw <= 22) return 'C3';
            else return 'C4';
        }
    }
    return null;
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
