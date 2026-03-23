/**
 * Decode orchestrator — ties together family detection, typecode parsing,
 * technical table resolution, constraint checking, and datasheet composition.
 * 
 * @module decode-orchestrator
 */

import { detectFamily } from '../specs/family-detector.js';
import { getAllSpecs } from '../specs/spec-registry.js';
import { parseTypecode } from './typecode-parser.js';
import { resolveTechnicalTables } from './technical-table-resolver.js';
import { extractDatasheetData } from './data-extractor.js';
import { composeDatasheet } from './datasheet-composer.js';

/** @typedef {import('../../types/knowledge-base.js').DecodeResult} DecodeResult */
/** @typedef {import('../../types/knowledge-base.js').DatasheetSection} DatasheetSection */

/**
 * Full decode pipeline: detect family → parse code → resolve tables → build unified data map → compose datasheet
 * 
 * @param {string} rawTypecode 
 * @returns {{ decodeResult: DecodeResult, sections: DatasheetSection[] } | { error: string }}
 */
export function decodeTypecode(rawTypecode) {
  const specs = getAllSpecs();

  if (specs.length === 0) {
    return { error: 'No spec files loaded. Please wait for specs to finish loading.' };
  }

  // Step 1: Detect family
  const detection = detectFamily(rawTypecode, specs);
  if (!detection) {
    return {
      error: `Could not identify product family for type code: "${rawTypecode}". ` +
             `Loaded families: ${specs.map(s => s.knowledge_base_metadata?.product_family).join(', ')}`,
    };
  }

  const { family, spec } = detection;

  // CROSS-SPEC BORROWING: If this is an FC- series drive (VLT) but it lacks a typecode structure,
  // borrow the robust structure and values from FC-102 or FC-302.
  const isVLT = family.includes('VLT') || family.includes('FC ');
  if (isVLT && (!spec.typecode_structure || spec.typecode_structure.length < 2)) {
      const donor = specs.find(s => 
          s.knowledge_base_metadata?.product_family?.startsWith('VLT') && 
          s.typecode_structure && 
          s.typecode_structure.length > 5
      );
      if (donor) {
          spec.typecode_structure = donor.typecode_structure;
          spec.typecode_values = [...(spec.typecode_values || []), ...(donor.typecode_values || [])];
      }
  }

  // Step 2: Parse type code
  const { strategy, segments } = parseTypecode(rawTypecode, spec);

  // Step 3: Resolve technical tables
  const technicalTables = resolveTechnicalTables(segments, spec);

  // Step 4: Check constraints
  const constraintWarnings = checkConstraints(segments, spec);

  // Step 5: Build decode result
  /** @type {DecodeResult} */
  const decodeResult = {
    raw_typecode: rawTypecode,
    product_family: family,
    manufacturer: spec.knowledge_base_metadata?.manufacturer || 'Unknown',
    strategy,
    segments,
    technicalTables,
    extracted_data: {}, // Placeholder, populated below
    constraint_warnings: constraintWarnings,
    unresolved_fields: segments
      .filter(s => s.meaning.startsWith('Unknown'))
      .map(s => s.segment_name),
    source_files_used: [spec._sourceFile || 'unknown'],
  };

  // Step 6: Extract complete flat map of data from all sources
  decodeResult.extracted_data = extractDatasheetData(decodeResult);

  // Step 7: Compose datasheet sections
  const sections = composeDatasheet(decodeResult);

  return { decodeResult, sections };
}

/**
 * Check constraints from spec against decoded segments
 * @param {import('../../types/knowledge-base.js').DecodedSegment[]} segments 
 * @param {import('../../types/knowledge-base.js').KnowledgeBase} spec 
 * @returns {string[]}
 */
function checkConstraints(segments, spec) {
  const warnings = [];

  if (!spec.constraints || spec.constraints.length === 0) return warnings;

  for (const constraint of spec.constraints) {
    const affected = segments.find(s =>
      s.segment_name === constraint.affected_segment_or_table
    );

    if (affected) {
      // Check exclusions from the segment's decoded value
      if (affected.exclusions && affected.exclusions.length > 0) {
        for (const excl of affected.exclusions) {
          // Check if any other segment matches the exclusion condition
          const excludedMatch = segments.find(s =>
            s.meaning.toUpperCase().includes(excl.toUpperCase()) ||
            s.raw_code.toUpperCase().includes(excl.toUpperCase())
          );
          if (excludedMatch) {
            warnings.push(
              `Constraint violation: ${affected.segment_name} = "${affected.meaning}" ` +
              `excludes "${excl}" but found "${excludedMatch.meaning}" in ${excludedMatch.segment_name}`
            );
          }
        }
      }
    }
  }

  // Also check per-segment exclusions
  for (const seg of segments) {
    if (seg.exclusions && seg.exclusions.length > 0) {
      for (const excl of seg.exclusions) {
        const match = segments.find(s =>
          s !== seg &&
          (s.meaning.toUpperCase().includes(excl.toUpperCase()) ||
           s.raw_code.toUpperCase().includes(excl.toUpperCase()))
        );
        if (match) {
          warnings.push(
            `${seg.segment_label}: ${excl} (conflicts with ${match.segment_label}: ${match.meaning})`
          );
        }
      }
    }
    
    // Add availability conditions as notes
    if (seg.availability_conditions && seg.availability_conditions.length > 0) {
      for (const cond of seg.availability_conditions) {
        warnings.push(`Note (${seg.segment_label}): ${cond}`);
      }
    }
  }

  return warnings;
}
