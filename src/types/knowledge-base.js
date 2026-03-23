/**
 * @typedef {Object} KnowledgeBaseMetadata
 * @property {string} manufacturer
 * @property {string} product_family
 * @property {string[]} series_names
 * @property {string[]} source_documents
 * @property {string} knowledge_base_scope
 * @property {string} coverage_summary
 * @property {string[]} unresolved_global_gaps
 * @property {Array} conflicts_detected
 */

/**
 * @typedef {Object} SourceRegistryEntry
 * @property {string} document_id
 * @property {string} document_role
 * @property {string} short_title
 * @property {Array} relevant_pages
 * @property {string} scope_summary
 * @property {string} explicit_power_range_covered
 * @property {string[]} explicit_voltage_ranges_covered
 * @property {string[]} explicit_other_manual_references
 * @property {string[]} notes_relevant_to_decoding_or_datasheet_generation
 */

/**
 * @typedef {Object} TypecodeSegment
 * @property {string} segment_name
 * @property {string} segment_label_from_manual
 * @property {string} character_positions
 * @property {string} segment_length
 * @property {string} fixed_variable_optional_conditional
 * @property {string} explanation
 * @property {string} preferred_source_document_id
 * @property {string[]} all_source_references
 * @property {string} confidence
 */

/**
 * @typedef {Object} TypecodeValue
 * @property {string} segment_name
 * @property {string} segment_code
 * @property {string} code
 * @property {string} meaning
 * @property {string} notes
 * @property {string[]} dependencies
 * @property {string[]} exclusions
 * @property {string[]} availability_conditions
 * @property {string} preferred_source_document_id
 * @property {string[]} all_source_references
 * @property {string} confidence
 */

/**
 * @typedef {Object} TechnicalTable
 * @property {string} table_id
 * @property {string} table_name
 * @property {string} applies_to
 * @property {string[]} columns
 * @property {Array<Object|string[]>} rows
 * @property {Object<string,string>} units
 * @property {string[]} notes
 * @property {string[]} conditions
 * @property {string} preferred_source_document_id
 * @property {string[]} all_source_references
 * @property {string} confidence
 */

/**
 * @typedef {Object} MappingRule
 * @property {string} rule_id
 * @property {string} target_datasheet_field
 * @property {string} source_typecode_segment
 * @property {string} mapping_logic_from_documents
 * @property {string[]} required_additional_conditions
 * @property {string} preferred_source_document_id
 * @property {string[]} all_source_references
 * @property {string} confidence
 */

/**
 * @typedef {Object} Constraint
 * @property {string} rule_id
 * @property {string} rule_type
 * @property {string} affected_segment_or_table
 * @property {string} exact_rule
 * @property {string} preferred_source_document_id
 * @property {string[]} all_source_references
 * @property {string} confidence
 */

/**
 * @typedef {Object} KnowledgeBase
 * @property {KnowledgeBaseMetadata} knowledge_base_metadata
 * @property {SourceRegistryEntry[]} source_registry
 * @property {TypecodeSegment[]} typecode_structure
 * @property {TypecodeValue[]} typecode_values
 * @property {TechnicalTable[]} technical_tables
 * @property {MappingRule[]} mapping_rules
 * @property {Constraint[]} constraints
 * @property {Array} examples
 * @property {Array} datasheet_fields
 * @property {Array} conflicts
 * @property {Object} app_resolution_model
 */

/**
 * Decoding strategy type - whether this family uses segment-level
 * parsing or full-typecode lookup
 * @typedef {'segment' | 'full-code-lookup'} DecodingStrategy
 */

/**
 * @typedef {Object} DecodedSegment
 * @property {string} segment_name
 * @property {string} raw_code
 * @property {string} meaning
 * @property {string} notes
 * @property {string} confidence
 * @property {string[]} source_references
 */

/**
 * @typedef {Object} DecodeResult
 * @property {string} raw_typecode
 * @property {string} product_family
 * @property {DecodingStrategy} strategy
 * @property {DecodedSegment[]} segments
 * @property {Object<string,string>} resolved_technical_data
 * @property {string[]} constraint_warnings
 * @property {string[]} unresolved_fields
 * @property {string[]} source_files_used
 */

/**
 * @typedef {Object} DatasheetSection
 * @property {string} id
 * @property {string} title
 * @property {string} numbering
 * @property {boolean} visible
 * @property {DatasheetRow[]} rows
 */

/**
 * @typedef {Object} DatasheetRow
 * @property {string} id
 * @property {string} numbering
 * @property {string} label
 * @property {string} value
 * @property {string} unit
 * @property {boolean} visible
 * @property {boolean} resolved
 */

export {};
