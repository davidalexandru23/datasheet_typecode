/**
 * Typecode parser — splits a raw type code into segments based on
 * the knowledge base's typecode_structure.
 * 
 * Supports two strategies:
 * 1. Segment-level: character-position-based splitting
 * 2. Full-code lookup: exact match against typecode_values
 * 
 * @module typecode-parser
 */

import { hasSegmentStructure } from '../specs/spec-loader.js';

/** @typedef {import('../../types/knowledge-base.js').KnowledgeBase} KnowledgeBase */
/** @typedef {import('../../types/knowledge-base.js').DecodedSegment} DecodedSegment */

/**
 * Parse character_positions string (e.g. "1-6", "11", "7–10") into start/end indices (0-based)
 * @param {string} posStr 
 * @returns {{ start: number, end: number } | null}
 */
function parsePositions(posStr) {
  if (!posStr) return null;
  const cleaned = String(posStr).replace(/–/g, '-').replace(/—/g, '-').trim();
  
  if (cleaned.toUpperCase().includes('NOT FOUND') || cleaned.toUpperCase() === 'UNKNOWN') {
    return null;
  }
  
  const parts = cleaned.split('-').map(p => parseInt(p.trim(), 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 1) {
    return { start: parts[0] - 1, end: parts[0] - 1 };
  }
  return { start: parts[0] - 1, end: parts[1] - 1 };
}

/**
 * Parse a type code using segment-level strategy
 * @param {string} rawCode 
 * @param {KnowledgeBase} spec 
 * @returns {DecodedSegment[]}
 */
function parseBySegments(rawCode, spec) {
  const segments = [];
  const code = rawCode.trim();

  // Parse all segment positions
  const allStructure = [...spec.typecode_structure]
    .map(seg => ({ ...seg, parsed: parsePositions(seg.character_positions) }))
    .filter(seg => seg.parsed !== null)
    .sort((a, b) => a.parsed.start - b.parsed.start || (b.parsed.end - b.parsed.start) - (a.parsed.end - a.parsed.start));

  // Group overlapping segments (same start position)
  const positionGroups = {};
  for (const seg of allStructure) {
    const key = seg.parsed.start;
    if (!positionGroups[key]) positionGroups[key] = [];
    positionGroups[key].push(seg);
  }

  // Resolve overlaps: for each group, try to find the best segment
  const resolvedSegments = [];
  const processedPositions = new Set();

  for (const startPos of Object.keys(positionGroups).map(Number).sort((a, b) => a - b)) {
    if (processedPositions.has(startPos)) continue;

    const group = positionGroups[startPos];
    
    if (group.length === 1) {
      // No overlap — use as-is
      resolvedSegments.push(group[0]);
      for (let i = group[0].parsed.start; i <= group[0].parsed.end; i++) processedPositions.add(i);
    } else {
      // Multiple segments share this start position
      // Strategy: try each, prefer the one with a matching value; if tied, prefer longer
      let bestSeg = null;
      let bestMatch = null;

      for (const seg of group) {
        const rawSegment = code.substring(seg.parsed.start, seg.parsed.end + 1);
        const match = findMatchingValue(rawSegment, seg.segment_name, spec);
        
        if (match && (!bestMatch || (seg.parsed.end - seg.parsed.start) > (bestSeg.parsed.end - bestSeg.parsed.start))) {
          bestSeg = seg;
          bestMatch = match;
        }
      }

      if (bestSeg) {
        // Found a segment with a matching value — use it
        resolvedSegments.push(bestSeg);
        for (let i = bestSeg.parsed.start; i <= bestSeg.parsed.end; i++) processedPositions.add(i);
      } else {
        // None matched by value — prefer the longer segment (more context)
        const sorted = [...group].sort((a, b) => (b.parsed.end - b.parsed.start) - (a.parsed.end - a.parsed.start));
        resolvedSegments.push(sorted[0]);
        for (let i = sorted[0].parsed.start; i <= sorted[0].parsed.end; i++) processedPositions.add(i);
      }
    }
  }

  // Now decode each resolved segment
  for (const seg of resolvedSegments) {
    const { start, end } = seg.parsed;
    const rawSegment = code.substring(start, end + 1);
    
    if (!rawSegment || rawSegment.length === 0) continue;

    // Find matching value in typecode_values
    let matchingValue = findMatchingValue(rawSegment, seg.segment_name, spec);
    
    // Fallback: try to extract meaning from segment explanation text
    if (!matchingValue) {
      matchingValue = extractFromExplanation(rawSegment, seg);
    }

    segments.push({
      segment_name: seg.segment_name,
      segment_label: seg.segment_label_from_manual || seg.segment_name,
      character_positions: seg.character_positions,
      raw_code: rawSegment,
      meaning: matchingValue?.meaning || `Unknown (${rawSegment})`,
      notes: matchingValue?.notes || '',
      confidence: matchingValue?.confidence || seg.confidence || 'unknown',
      source_references: matchingValue?.all_source_references || seg.all_source_references || [],
      dependencies: matchingValue?.dependencies || [],
      exclusions: matchingValue?.exclusions || [],
      availability_conditions: matchingValue?.availability_conditions || [],
    });
  }

  return segments;
}

/**
 * Try to extract a segment's meaning from its explanation text.
 * Handles patterns like "T for 3 phases", "X means no option", etc.
 * @param {string} rawCode 
 * @param {Object} segDef - The segment definition from typecode_structure
 * @returns {Object | null}
 */
function extractFromExplanation(rawCode, segDef) {
  const explanation = segDef.explanation || '';
  const codeUpper = rawCode.toUpperCase();
  
  // Pattern: "T for 3 phases" or "T is the phase designator"
  const phaseMatch = explanation.match(new RegExp(`${codeUpper}\\s+(?:for|is|=|means|designat)\\s+(.+?)(?:\\.|,|;|$)`, 'i'));
  if (phaseMatch) {
    return {
      segment_name: segDef.segment_name,
      code: rawCode,
      meaning: phaseMatch[1].trim() + ' (extracted from spec description)',
      notes: explanation,
      confidence: 'medium',
      dependencies: [],
      exclusions: [],
      availability_conditions: [],
      all_source_references: segDef.all_source_references || [],
    };
  }

  // For phases specifically, check if explanation mentions T = 3 phases
  if (segDef.segment_name.toLowerCase().includes('phase') && codeUpper === 'T') {
    if (explanation.toLowerCase().includes('3 phase') || explanation.toLowerCase().includes('three phase')) {
      return {
        segment_name: segDef.segment_name,
        code: rawCode,
        meaning: '3 phases',
        notes: explanation,
        confidence: 'medium',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: segDef.all_source_references || [],
      };
    }
  }

  // For phases, common patterns: S = 1 phase, T = 3 phases
  if (segDef.segment_name.toLowerCase().includes('phase')) {
    const phaseMap = { 'S': '1 phase (single-phase)', 'T': '3 phases' };
    if (phaseMap[codeUpper]) {
      return {
        segment_name: segDef.segment_name,
        code: rawCode,
        meaning: phaseMap[codeUpper],
        notes: 'Standard Danfoss phase designator',
        confidence: 'high',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: segDef.all_source_references || [],
      };
    }
  }
  
  return null;
}

/**
 * Try to parse a Danfoss-style power code into kW value.
 * Examples: P1K5 → 1.5 kW, PK75 → 0.75 kW, P11K → 11 kW, P90K → 90 kW,
 *           P75K → 75 kW, P18K → 18.5 kW (may need context)
 * @param {string} code 
 * @returns {string | null}
 */
function parsePowerCode(code) {
  const c = code.toUpperCase();
  
  // PK25 = 0.25, PK37 = 0.37, PK75 = 0.75
  let m = c.match(/^PK(\d{2})$/);
  if (m) return `0.${m[1]} kW`;
  
  // P1K1 = 1.1, P1K5 = 1.5, P2K2 = 2.2, P3K0 = 3.0, P3K7 = 3.7, P5K5 = 5.5, P7K5 = 7.5
  m = c.match(/^P(\d)K(\d)$/);
  if (m) return `${m[1]}.${m[2]} kW`;
  
  // P4K0 = 4.0
  m = c.match(/^P(\d)K(\d)$/);
  if (m) return `${m[1]}.${m[2]} kW`;
  
  // P11K = 11, P15K = 15, P18K = 18.5, P22K = 22, P30K = 30, P37K = 37, P45K = 45
  m = c.match(/^[PN](\d{2,3})K$/);
  if (m) return `${m[1]} kW`;
  
  // P90K = 90
  m = c.match(/^[PN](\d+)K$/);
  if (m) return `${m[1]} kW`;

  // N560 = 560 (High Overload/Power designator without K suffix sometimes used in high ratings)
  m = c.match(/^[PN](\d{3,})$/);
  if (m) return `${m[1]} kW`;

  return null;
}

/**
 * Try to infer meaning of Danfoss common voltage codes (e.g. T4, T7)
 * @param {string} code 
 * @returns {string | null}
 */
function parseVoltageCode(code) {
  const map = {
    'S2': '1x200-240V',
    'T2': '3x200-240V',
    'T4': '3x380-480V',
    'T5': '3x380-500V',
    'T6': '3x525-600V',
    'T7': '3x525-690V'
  };
  return map[code.toUpperCase()] || null;
}

/**
 * Try to infer the meaning of an enclosure code.
 * Common patterns: H20 = IP20, H21 = IP21, H54 = IP54, STD = Standard, etc.
 * @param {string} code 
 * @returns {string | null}
 */
function parseEnclosureCode(code) {
  const c = code.toUpperCase();
  
  // Explicitly mapped common combinations to include UL types
  const enclosureMap = {
    'H20': 'IP20 / Open Type, wall mount',
    'H21': 'IP21 / UL Type 1 Enclosure', 
    'H22': 'IP21 / UL Type 1 with back plate',
    'H54': 'IP54 / UL Type 12 Enclosure',
    'H55': 'IP55 Enclosure',
    'H66': 'IP66 / UL Type 4X Enclosure',
    'E20': 'IP20 / Open Type Enclosure',
    'E21': 'IP21 / UL Type 1 Enclosure',
    'E54': 'IP54 / UL Type 12 Enclosure',
    'E55': 'IP55 Enclosure',
    'E66': 'IP66 / UL Type 4X Enclosure',
    'STD': 'Standard enclosure',
  };
  
  if (enclosureMap[c]) {
    return enclosureMap[c];
  }

  // Fallback regex inference for generic frame-based IP codes (e.g. C54 -> IP54)
  // Most Danfoss VLT enclosure codes are [FrameLetter][IP_Rating]
  const ipMatch = c.match(/^[A-Z](\d{2})$/);
  if (ipMatch) {
    return `IP${ipMatch[1]} Enclosure`;
  }
  
  return null;
}

/**
 * Find a matching typecode value entry for a given code and segment name
 * @param {string} rawCode 
 * @param {string} segmentName 
 * @param {KnowledgeBase} spec 
 * @returns {import('../../types/knowledge-base.js').TypecodeValue | null}
 */
function findMatchingValue(rawCode, segmentName, spec) {
  if (!spec.typecode_values) return null;

  const codeUpper = rawCode.toUpperCase();

  // Exact match first
  const exact = spec.typecode_values.find(v =>
    v.segment_name === segmentName && v.code.toUpperCase() === codeUpper
  );
  if (exact) return exact;

  // Try with spaces/dashes stripped
  const codeNorm = codeUpper.replace(/[\s-]/g, '');
  const normalized = spec.typecode_values.find(v =>
    v.segment_name === segmentName && v.code.toUpperCase().replace(/[\s-]/g, '') === codeNorm
  );
  if (normalized) return normalized;

  // Pattern match (e.g. SXXX matches S followed by any 3 chars)
  const pattern = spec.typecode_values.find(v => {
    if (v.segment_name !== segmentName) return false;
    const vCode = v.code.toUpperCase();
    if (!vCode.includes('X')) return false;
    if (vCode.length !== codeUpper.length) return false;
    return [...vCode].every((ch, i) => ch === 'X' || ch === codeUpper[i]);
  });
  if (pattern) return pattern;

  // Prefix match: when the segment's character range is wider than the spec's
  // value codes (e.g. enclosure at pos 13-15 = "A1X", but spec values are "A1").
  // Try matching the longest prefix of the raw code against spec values.
  if (codeUpper.length > 1) {
    for (let prefixLen = codeUpper.length - 1; prefixLen >= 1; prefixLen--) {
      const prefix = codeUpper.substring(0, prefixLen);
      const prefixMatch = spec.typecode_values.find(v =>
        v.segment_name === segmentName && v.code.toUpperCase() === prefix
      );
      if (prefixMatch) {
        // Check if the remaining chars are just X/filler
        const remainder = codeUpper.substring(prefixLen);
        const isFillerRemainder = /^X+$/.test(remainder) || /^\d+$/.test(remainder);
        const suffix = isFillerRemainder ? '' : ` + ${remainder}`;
        return {
          ...prefixMatch,
          code: rawCode,
          meaning: prefixMatch.meaning + suffix,
        };
      }
    }
  }

  // Range match: if a value has a range-style code like "PK25-P90K",
  // check if our code fits the same pattern/family
  const rangeMatch = spec.typecode_values.find(v => {
    if (v.segment_name !== segmentName) return false;
    const vCode = v.code.toUpperCase();
    if (!vCode.includes('-')) return false;
    // Check if both ends of the range share a pattern with our code
    const [rangeStart, rangeEnd] = vCode.split('-');
    const startPrefix = rangeStart.replace(/\d/g, '');
    const codePrefix = codeUpper.replace(/\d/g, '');
    return startPrefix === codePrefix || codePrefix.startsWith('P');
  });

  // If range match found, try to infer a more specific meaning
  if (rangeMatch) {
    // Try to parse power code
    const segLower = segmentName.toLowerCase();
    if (segLower.includes('power') || segLower.includes('size') || segLower.includes('model')) {
      const powerMeaning = parsePowerCode(rawCode);
      if (powerMeaning) {
        return {
          ...rangeMatch,
          code: rawCode,
          meaning: `${powerMeaning} (inferred from code pattern)`,
          confidence: 'inferred',
        };
      }
    }
    return {
      ...rangeMatch,
      code: rawCode,
      meaning: `${rangeMatch.meaning} — code: ${rawCode}`,
      confidence: 'inferred',
    };
  }

  // Smart inference for common segment types
  const segLower = segmentName.toLowerCase();
  
  // Power codes
  if (segLower.includes('power') || segLower.includes('size') || segLower.includes('model')) {
    const powerMeaning = parsePowerCode(rawCode);
    if (powerMeaning) {
      return {
        segment_name: segmentName,
        code: rawCode,
        meaning: `${powerMeaning} (inferred)`,
        notes: 'Individual code-to-power mapping not found in spec; value inferred from code pattern',
        confidence: 'inferred',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: [],
      };
    }
  }

  // Voltage codes
  if (segLower.includes('voltage') || segLower.includes('mains') || segLower.includes('ac_line')) {
    const voltageMeaning = parseVoltageCode(rawCode);
    if (voltageMeaning) {
      return {
        segment_name: segmentName,
        code: rawCode,
        meaning: `${voltageMeaning} (inferred)`,
        notes: 'Individual code mapping not found; inferred from common Danfoss voltage patterns',
        confidence: 'inferred',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: [],
      };
    }
  }

  // Enclosure codes
  if (segLower.includes('enclosure') || segLower.includes('protection')) {
    const encMeaning = parseEnclosureCode(rawCode);
    if (encMeaning) {
      return {
        segment_name: segmentName,
        code: rawCode,
        meaning: `${encMeaning} (inferred)`,
        notes: 'Value inferred from standard Danfoss enclosure code convention',
        confidence: 'inferred',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: [],
      };
    }
  }

  // RFI/EMC filter - common codes
  if (segLower.includes('rfi') || segLower.includes('emc') || segLower.includes('filter')) {
    const rfiMap = {
      'XX': 'No RFI filter',
      'R1': 'RFI Class A1/C1',
      'R2': 'RFI Class A2/C2',
      'R4': 'RFI Class A1/C1 enhanced',
      'R5': 'RFI Class A2/C2 enhanced',
    };
    if (rfiMap[codeUpper]) {
      return {
        segment_name: segmentName,
        code: rawCode,
        meaning: rfiMap[codeUpper] + ' (inferred)',
        notes: 'Value inferred from standard Danfoss RFI code convention',
        confidence: 'inferred',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: [],
      };
    }
  }

  // Brake codes
  if (segLower.includes('brake')) {
    const brakeMap = {
      'X': 'No brake',
      'B': 'With brake chopper',
      'R': 'Regenerative',
      'A': 'No brake chopper',
    };
    if (brakeMap[codeUpper]) {
      return {
        segment_name: segmentName,
        code: rawCode,
        meaning: brakeMap[codeUpper] + ' (inferred)',
        notes: 'Value inferred from standard Danfoss brake code convention',
        confidence: 'inferred',
        dependencies: [],
        exclusions: [],
        availability_conditions: [],
        all_source_references: [],
      };
   }
  }

  // Universal X / XX fallback — in Danfoss type codes, X almost always means
  // "none", "standard", or "not applicable" for the given segment
  if (codeUpper === 'X' || codeUpper === 'XX' || codeUpper === 'XXX') {
    // Build a human-friendly label from the segment name  
    const readable = segmentName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    
    const meaningMap = {
      'pcb': 'Standard (no special coating)',
      'coat': 'Standard (no special coating)',
      'mains': 'No mains option',
      'adapt': 'No adaptation (standard)',
      'option': 'No option / standard',
      'brake': 'No brake',
      'filter': 'No RFI filter',
      'display': 'No display / No LCP',
      'software': 'Standard software',
      'language': 'Standard language',
    };
    
    let meaning = `Standard / None`;
    for (const [key, val] of Object.entries(meaningMap)) {
      if (segLower.includes(key)) {
        meaning = val;
        break;
      }
    }

    return {
      segment_name: segmentName,
      code: rawCode,
      meaning: meaning,
      notes: `Code "${rawCode}" indicates standard/no-option configuration for ${readable}`,
      confidence: 'inferred',
      dependencies: [],
      exclusions: [],
      availability_conditions: [],
      all_source_references: [],
    };
  }

  return null;
}

/**
 * Parse a type code using full-code lookup strategy (for VACON 100 etc.)
 * @param {string} rawCode 
 * @param {KnowledgeBase} spec 
 * @returns {DecodedSegment[]}
 */
function parseByFullCodeLookup(rawCode, spec) {
  const segments = [];
  const codeNorm = rawCode.trim().toUpperCase().replace(/\s+/g, ' ');

  // For full-code families, each typecode_value entry is a complete type code
  // Group by segment_name to show all decoded properties
  const segmentGroups = {};
  
  for (const val of (spec.typecode_values || [])) {
    const valCode = (val.code || '').toUpperCase().replace(/\s+/g, ' ');
    
    // Check for full match or if the value code is part of the input
    if (valCode === codeNorm || codeNorm.includes(valCode) || valCode.includes(codeNorm)) {
      const name = val.segment_name || 'general';
      if (!segmentGroups[name]) {
        segmentGroups[name] = [];
      }
      segmentGroups[name].push(val);
    }
  }

  // Also try per-segment matching for families that have partial values
  for (const val of (spec.typecode_values || [])) {
    const name = val.segment_name || 'general';
    if (segmentGroups[name]) continue; // Already matched by full code
    
    // Try matching short codes against portions of the typecode
    const valCode = (val.code || '').toUpperCase();
    if (valCode.length > 0 && valCode.length < codeNorm.length && codeNorm.includes(valCode)) {
      if (!segmentGroups[name]) segmentGroups[name] = [];
      segmentGroups[name].push(val);
    }
  }

  for (const [name, values] of Object.entries(segmentGroups)) {
    for (const val of values) {
      segments.push({
        segment_name: name,
        segment_label: val.segment_code || name,
        character_positions: 'full-code',
        raw_code: val.code,
        meaning: val.meaning || '',
        notes: val.notes || '',
        confidence: val.confidence || 'medium',
        source_references: val.all_source_references || [],
        dependencies: val.dependencies || [],
        exclusions: val.exclusions || [],
        availability_conditions: val.availability_conditions || [],
      });
    }
  }

  return segments;
}

/**
 * Main parse function — auto-selects strategy based on spec structure
 * @param {string} rawCode 
 * @param {KnowledgeBase} spec 
 * @returns {{ strategy: import('../../types/knowledge-base.js').DecodingStrategy, segments: DecodedSegment[] }}
 */
export function parseTypecode(rawCode, spec) {
  const useSegments = hasSegmentStructure(spec);

  if (useSegments) {
    return {
      strategy: 'segment',
      segments: parseBySegments(rawCode, spec),
    };
  }

  return {
    strategy: 'full-code-lookup',
    segments: parseByFullCodeLookup(rawCode, spec),
  };
}
