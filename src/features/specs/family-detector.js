/**
 * Family detector — identifies which product family a type code belongs to
 * by matching prefixes and patterns against loaded specs.
 * 
 * @module family-detector
 */

/** @typedef {import('../../types/knowledge-base.js').KnowledgeBase} KnowledgeBase */

/**
 * Known family prefix patterns. These are ordered from most specific to
 * least specific to avoid false matches.
 */
const FAMILY_PATTERNS = [
  { prefix: 'FC-102', family: 'VLT HVAC Drive FC 102' },
  { prefix: 'FC 102', family: 'VLT HVAC Drive FC 102' },
  { prefix: 'FC-101', family: 'VLT HVAC Basic Drive FC 101' },
  { prefix: 'FC 101', family: 'VLT HVAC Basic Drive FC 101' },
  { prefix: 'FC-302', family: 'VLT AutomationDrive FC 302' },
  { prefix: 'FC 302', family: 'VLT AutomationDrive FC 302' },
  { prefix: 'FC-202', family: 'VLT AQUA Drive FC 202' },
  { prefix: 'FC 202', family: 'VLT AQUA Drive FC 202' },
  { prefix: 'VACON 0100', family: 'VACON 100' },
  { prefix: 'VACON0100', family: 'VACON 100' },
  { prefix: 'NXP', family: 'VACON NXP' },
  { prefix: 'NXS', family: 'VACON NXP' },
  { prefix: 'iC2', family: 'iC2-Micro' },
  { prefix: 'IC2', family: 'iC2-Micro' },
  { prefix: '0012', family: 'iC2-Micro' },
];

/**
 * Detect the product family for a given type code.
 * 
 * Strategy:
 * 1. Try matching against known prefix patterns
 * 2. If no prefix match, try matching against loaded spec metadata
 * 3. Return null if no family found
 * 
 * @param {string} typecode 
 * @param {KnowledgeBase[]} loadedSpecs 
 * @returns {{ family: string, spec: KnowledgeBase } | null}
 */
export function detectFamily(typecode, loadedSpecs) {
  const normalized = typecode.trim().toUpperCase();

  // Strategy 1: Prefix pattern matching
  for (const pattern of FAMILY_PATTERNS) {
    if (normalized.startsWith(pattern.prefix.toUpperCase())) {
      const spec = loadedSpecs.find(s => {
        const meta = s.knowledge_base_metadata;
        if (!meta) return false;
        const specFamily = (meta.product_family || '').toUpperCase();
        const specNames = (meta.series_names || []).map(n => n.toUpperCase());
        return specFamily.includes(pattern.family.toUpperCase()) ||
               specNames.some(n => pattern.family.toUpperCase().includes(n));
      });

      if (spec) {
        return { family: spec.knowledge_base_metadata.product_family, spec };
      }
    }
  }

  // Strategy 2: Check each spec's typecode_values for matching codes
  for (const spec of loadedSpecs) {
    if (!spec.typecode_values) continue;
    
    // Look for product_group_series values that match
    const familyValues = spec.typecode_values.filter(
      v => v.segment_name === 'product_group_series' || v.segment_name === 'product_group'
    );
    
    for (const fv of familyValues) {
      const code = (fv.code || '').toUpperCase().replace(/\s+/g, '');
      const normalizedNoSpaces = normalized.replace(/\s+/g, '');
      if (normalizedNoSpaces.startsWith(code)) {
        return { family: spec.knowledge_base_metadata.product_family, spec };
      }
    }
  }

  // Strategy 3: Brute-force check series_names 
  for (const spec of loadedSpecs) {
    const meta = spec.knowledge_base_metadata;
    if (!meta || !meta.series_names) continue;

    for (const name of meta.series_names) {
      const seriesNorm = name.toUpperCase().replace(/\s+/g, '');
      const codeNorm = normalized.replace(/\s+/g, '');
      if (codeNorm.startsWith(seriesNorm) || codeNorm.includes(seriesNorm)) {
        return { family: meta.product_family, spec };
      }
    }
  }

  return null;
}
