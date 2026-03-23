/**
 * Spec registry — in-memory store for loaded knowledge bases,
 * providing lookup by family name.
 * 
 * @module spec-registry
 */

/** @typedef {import('../../types/knowledge-base.js').KnowledgeBase} KnowledgeBase */

/**
 * @type {KnowledgeBase[]}
 */
let _registry = [];

/**
 * Initialize the registry with loaded specs
 * @param {KnowledgeBase[]} specs 
 */
export function initRegistry(specs) {
  _registry = specs;
}

/**
 * Get all loaded specs
 * @returns {KnowledgeBase[]}
 */
export function getAllSpecs() {
  return _registry;
}

/**
 * Get a list of available product families
 * @returns {Array<{family: string, sourceFile: string}>}
 */
export function getAvailableFamilies() {
  return _registry.map(spec => ({
    family: spec.knowledge_base_metadata?.product_family || 'Unknown',
    sourceFile: spec._sourceFile || 'unknown',
    manufacturer: spec.knowledge_base_metadata?.manufacturer || '',
    seriesNames: spec.knowledge_base_metadata?.series_names || [],
  }));
}

/**
 * Get a spec by product family name (case-insensitive partial match)
 * @param {string} familyName 
 * @returns {KnowledgeBase | undefined}
 */
export function getSpecByFamily(familyName) {
  const needle = familyName.toUpperCase();
  return _registry.find(spec => {
    const family = (spec.knowledge_base_metadata?.product_family || '').toUpperCase();
    return family.includes(needle) || needle.includes(family);
  });
}
