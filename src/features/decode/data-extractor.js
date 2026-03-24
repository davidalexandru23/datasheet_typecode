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
    // Sort tables by their match quality (maxScore) so that the most specific table
    // is processed LAST or prioritizes its data.
    // We sort ASCENDING (lowest score first) so that the best match (highest score) 
    // is processed LAST and overwrites generic data.
    const sortedTables = [...technicalTables].sort((a, b) => (a.maxScore || 0) - (b.maxScore || 0));

    for (const table of sortedTables) {
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
          const isCode = k.includes('code') || k.includes('example');
          
          if (!isCode && (k.includes('output_current') || (k.includes('current') && !extracted.output_current && !k.includes('input') && !k.includes('intermittent')))) {
            extracted.output_current = v;
          }
          if (!isCode && (k.includes('power') && (k.includes('kw') || k.includes('400v') || k.includes('230v') || k.includes('normal')))) {
            // Priority: Prefer kW over HP, and explicit kW over generic power
            if (!extracted.power_kw || k.includes('kw') || !extracted.power_kw.includes('kW')) {
               extracted.power_kw = v;
            }
          }
          if (!isCode && (k.includes('intermittent') || (k.includes('overload') && k.includes('current')))) {
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

  // 2b. VACON-specific KV table post-processing
  // The general_specs_kv table provides descriptive text that needs parsing into specific fields
  
  // Ambient temperature: parse from "ambient_operating_temperature_wall_modules_enclosed"
  const ambientKey = extracted.ambient_operating_temperature_wall_modules_enclosed 
    || extracted.ambient_operating_temperature_100x;
  if (ambientKey) {
    const tempMatch = ambientKey.match(/(-?\d+)\s*°?\s*C\s*to\s*\+?(\d+)\s*°?\s*C/i);
    if (tempMatch) {
      extracted.ambient_temperature_minimum = extracted.ambient_temperature_minimum || tempMatch[1];
      extracted.ambient_temperature_maximum = extracted.ambient_temperature_maximum || tempMatch[2];
    }
  }

  // Altitude: parse from "altitude_nominal_rating"
  if (extracted.altitude_nominal_rating && !extracted.maximum_altitude_without_derating) {
    const altMatch = extracted.altitude_nominal_rating.match(/up\s+to\s+(\d+)\s*m/i);
    if (altMatch) {
      extracted.maximum_altitude_without_derating = altMatch[1];
    }
  }

  // I/O counts: parse from "i_o" field (e.g. "2 x AI, 6 x DI, 1 x AO, 10 Vref, 24 Vin, 2 x 24 Vout, 3 x RO or 2 x RO + TI")
  if (extracted.i_o) {
    const ioStr = extracted.i_o;
    const aiMatch = ioStr.match(/(\d+)\s*x?\s*AI/i);
    const diMatch = ioStr.match(/(\d+)\s*x?\s*DI/i);
    const aoMatch = ioStr.match(/(\d+)\s*x?\s*AO/i);
    const roMatch = ioStr.match(/(\d+)\s*x?\s*RO/i);
    
    if (aiMatch) extracted.analog_inputs = aiMatch[1];
    if (diMatch) extracted.digital_inputs = diMatch[1];
    if (aoMatch) extracted.analog_outputs = aoMatch[1];
    if (roMatch) extracted.relay_outputs = roMatch[1];
  }

  // Fix I/O fields: if they contain descriptive text instead of numbers, use defaults
  const ioFields = ['analog_inputs', 'digital_inputs', 'analog_outputs', 'digital_outputs', 'relay_outputs'];
  for (const field of ioFields) {
    if (extracted[field] && !/^\d+/.test(String(extracted[field]).trim())) {
      // Value is descriptive text, not a count — clear it so defaults are used from composer
      delete extracted[field];
    }
  }

  // Output frequency: parse from KV "output_frequency" 
  if (extracted.output_frequency && !extracted.output_frequency_range) {
    extracted.output_frequency_range = extracted.output_frequency;
  }

  // Default enclosure/IP: parse from "enclosure_classes" KV
  if (extracted.enclosure_classes && !extracted.ip_rating) {
    const ipMatch = extracted.enclosure_classes.match(/IP(\d{2})/);
    if (ipMatch) {
      extracted.ip_rating = `IP${ipMatch[1]}`;
    }
  }

  // 3. Extract missing data explicitly from segment parsing
  
  // Power
  let currentPower = extracted.power || _seg(segments, 'power', 'size', 'rated');
  let voltStr = extracted.voltage_range || _seg(segments, 'voltage', 'ac_line', 'mains');
  let encStr = extracted.ip_rating || _seg(segments, 'enclosure', 'protection', 'optional_codes');

  // VACON-specific: rated_continuous_current_code meaning contains combined "61 A / 30 kW" 
  const ratedSeg = segments.find(s => s.segment_name.toLowerCase().includes('rated_continuous_current'));
  if (ratedSeg && ratedSeg.meaning) {
    const mKw = ratedSeg.meaning.match(/(\d+\.?\d*)\s*kW/i);
    const mA = ratedSeg.meaning.match(/(\d+\.?\d*)\s*A/i);
    if (mKw && !extracted.power_kw) extracted.power_kw = mKw[1];
    if (mA && !extracted.output_current) extracted.output_current = mA[1];
  }

  // GLOBAL SEMANTIC HARVESTING: 
  // If technical parameters were embedded inside unnamed or option code segments (like VACON '+IP54'),
  // we do a global scan across ALL segment raw codes and meanings.
  for (const seg of segments) {
    const text = String(seg.meaning + ' ' + seg.raw_code).toUpperCase();
    
    if (!encStr && /IP\s*\d{2}/i.test(text)) {
       const m = text.match(/IP\s*(\d{2})/i);
       if (m) encStr = `IP${m[1]}`;
    }
    
    if (!currentPower && (/[\d.]+\s*KW/.test(text) || /[\d.]+\s*HP/.test(text))) {
       const m = text.match(/([\d.]+\s*(?:KW|HP))/);
       if (m) currentPower = m[1];
    }

    if (!extracted.phases && /(\d)\s*[-]?\s*(?:PHASE|FAZE|PH)/.test(text)) {
       const m = text.match(/(\d)\s*[-]?\s*(?:PHASE|FAZE|PH)/);
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
    // Explicitly reject meanings that are likely just current/voltage codes if no kW found
    if (match) {
      extracted.power_kw = match[1];
    } else if (currentPower.match(/^\d+$/) && currentPower.length < 3) {
      // It's just a small number, maybe from a voltage code? Allow if no other clue.
      extracted.power_kw = currentPower;
    } else if (!currentPower.includes('A') && !currentPower.includes('V') && !currentPower.includes('HP')) {
      extracted.power_kw = currentPower;
    }
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
  const is200v = (extracted.voltage_range || '').includes('200');
  const is690v = (extracted.voltage_range || '').includes('690') || (extracted.voltage_range || '').includes('600');
  const is400v = !is200v && !is690v;

  if (extracted.power_kw && !extracted.output_current) {
     // Generic dynamic mapping for output current:
     // 400V drives: ~2.1A per kW. 200V drives: ~4.2A per kW. 690V drives: ~1.2A per kW.
     let est = parseFloat(extracted.power_kw) * (is200v ? 4.2 : (is690v ? 1.2 : 2.0));
     extracted.output_current = Math.round(est).toString();
  } else if (extracted.output_current && !extracted.power_kw) {
     // Infer Power from Current
     // 400V: kW ≈ A / 2.0 (roughly, for standard motors)
     // 690V: kW ≈ A * 1.1 (roughly)
     // 200V: kW ≈ A / 4.0
     let est = parseFloat(extracted.output_current) * (is200v ? 0.25 : (is690v ? 1.1 : 0.5));
     extracted.power_kw = Math.round(est).toString();
  }

  if (extracted.power_kw) {
      const kw = parseFloat(extracted.power_kw);
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
      if (!extracted.dimension_height || !extracted.dimension_width || !extracted.dimension_depth || !extracted.weight || !extracted.acoustic_noise) {
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
              'C4': { h: '660', w: '370', d: '332', wt: '50.0', noise: '67' },
              'D1h': { h: '901', w: '325', d: '379', wt: '62.0', noise: '71' },
              'D2h': { h: '1107', w: '325', d: '379', wt: '125.0', noise: '71' },
              'D3h': { h: '909', w: '250', d: '375', wt: '62.0', noise: '71' },
              'D4h': { h: '1027', w: '375', d: '375', wt: '125.0', noise: '71' },
              'E1h': { h: '2043', w: '602', d: '513', wt: '295.0', noise: '74' },
              'E2h': { h: '2043', w: '698', d: '513', wt: '318.0', noise: '74' },
              'E3h': { h: '1578', w: '506', d: '482', wt: '272.0', noise: '74' },
              'E4h': { h: '1578', w: '604', d: '482', wt: '295.0', noise: '74' }
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
            if (kw <= 160) return 'D3h';
            if (kw <= 315) return 'D4h';
            if (kw <= 500) return 'E3h';
            if (kw <= 800) return 'E4h';
        } else {
            if (kw <= 4.0) return 'A4';
            if (kw <= 7.5) return 'A5';
            if (kw <= 22) return 'B1';
            if (kw <= 30) return 'B2';
            if (kw <= 75) return 'C1';
            if (kw <= 90) return 'C2';
            // IP54 high power defaults
            if (kw <= 160) return 'D1h';
            if (kw <= 315) return 'D2h';
            if (kw <= 500) return 'E1h';
            if (kw <= 800) return 'E2h';
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
