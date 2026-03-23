/**
 * Adaptive spec loader that handles the structural variations
 * across different JSON spec files without modifying them.
 * 
 * @module spec-loader
 */

/** @typedef {import('../../types/knowledge-base.js').KnowledgeBase} KnowledgeBase */

const SPEC_FILES = [
  'fc101.json',
  'fc102.json',
  'fc202.json',
  'fc302.json',
  'ic2.json',
  'vacon100.json',
  'vaconnxp.json',
];

/**
 * Unwrap fc101-style envelope (data nested under export_metadata/data keys)
 * @param {Object} raw 
 * @returns {Object}
 */
function unwrapEnvelope(raw) {
  if (raw.data && raw.export_metadata) {
    const unwrapped = { ...raw.data };
    // Merge export_metadata into knowledge_base_metadata if it exists
    if (unwrapped.knowledge_base_metadata && raw.export_metadata) {
      unwrapped.knowledge_base_metadata = {
        ...unwrapped.knowledge_base_metadata,
        export_metadata: raw.export_metadata,
      };
    }
    // Also bring top-level keys that might exist outside data
    for (const key of Object.keys(raw)) {
      if (key !== 'data' && key !== 'export_metadata' && !(key in unwrapped)) {
        unwrapped[key] = raw[key];
      }
    }
    return unwrapped;
  }
  return raw;
}

/**
 * Normalize technical table rows to array-of-objects format.
 * vaconnxp.json uses array-of-arrays for rows in some tables.
 * @param {Object} table 
 * @returns {Object}
 */
function normalizeTechnicalTableRows(table) {
  if (!table.rows || !table.columns || table.rows.length === 0) return table;

  const firstRow = table.rows[0];
  // If first row is an array, convert all rows to objects
  if (Array.isArray(firstRow) && !Array.isArray(firstRow[0])) {
    const cols = table.columns;
    table.rows = table.rows.map(row => {
      if (!Array.isArray(row)) return row;
      const obj = {};
      cols.forEach((col, i) => {
        obj[col] = row[i] !== undefined ? row[i] : '';
      });
      return obj;
    });
  }
  return table;
}

/**
 * Apply defaults for any missing top-level keys
 * @param {Object} spec 
 * @returns {KnowledgeBase}
 */
function applyDefaults(spec) {
  const defaults = {
    knowledge_base_metadata: {},
    source_registry: [],
    typecode_structure: [],
    typecode_values: [],
    technical_tables: [],
    mapping_rules: [],
    constraints: [],
    examples: [],
    datasheet_fields: [],
    conflicts: [],
    app_resolution_model: {},
  };

  // Deep merge: spec values override defaults
  const result = { ...defaults, ...spec };

  // Normalize all technical table rows
  if (result.technical_tables && Array.isArray(result.technical_tables)) {
    result.technical_tables = result.technical_tables.map(normalizeTechnicalTableRows);
  }

  return result;
}

/**
 * Determine if a spec has a usable segment-based typecode structure
 * @param {Object} spec 
 * @returns {boolean}
 */
export function hasSegmentStructure(spec) {
  if (!spec.typecode_structure || !Array.isArray(spec.typecode_structure)) return false;
  if (spec.typecode_structure.length === 0) return false;
  
  // Check if all segments have "NOT FOUND" or similar non-data markers
  const usableSegments = spec.typecode_structure.filter(seg => {
    if (!seg.character_positions) return false;
    const pos = String(seg.character_positions).toUpperCase();
    return !pos.includes('NOT FOUND') && pos !== 'UNKNOWN' && pos !== '';
  });

  return usableSegments.length > 0;
}

/**
 * Load and adapt a single spec file
 * @param {string} filename 
 * @returns {Promise<KnowledgeBase>}
 */
async function loadSpec(filename) {
  const response = await fetch(`/specs/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load spec: ${filename} (${response.status})`);
  }

  let raw = await response.json();

  // Step 1: Unwrap any envelope (fc101)
  raw = unwrapEnvelope(raw);

  // Step 2: Apply defaults for missing keys
  const spec = applyDefaults(raw);

  // Tag with source filename for tracing
  spec._sourceFile = filename;

  return spec;
}

/**
 * Load all spec files
 * @returns {Promise<KnowledgeBase[]>}
 */
export async function loadAllSpecs() {
  const results = await Promise.allSettled(
    SPEC_FILES.map(f => loadSpec(f))
  );

  const specs = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      specs.push(result.value);
    } else {
      errors.push({ file: SPEC_FILES[i], error: result.reason.message });
    }
  });

  if (errors.length > 0) {
    console.warn('Some spec files failed to load:', errors);
  }

  return specs;
}
