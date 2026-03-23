/**
 * Static constants for Danfoss VLT and VACON drives that apply globally
 * and can be used to populate datasheet fields when explicit spec values are missing.
 * 
 * @module danfoss-constants
 */

export const DANFOSS_CONSTANTS = {
  manufacturer: 'Danfoss',
  country_of_origin: 'Danemarca',
  brand_name: 'Danfoss',
  
  // Electrical / Network
  input_frequency: '50/60',
  output_frequency_range: '0-590',
  frequency_resolution: '0.003',
  serial_interface: 'RS 485, Protocol comunicatie Modbus RTU',
  
  // Control / Performance
  control_accuracy_open_loop: '±0.5% din viteza sincrona',
  ramp_time_range: '0.05 - 3600',
  
  // Environmental / Mechanical
  pollution_degree: '2',
  vibration_standard: 'IEC 60068-2-6 / 1 g',
  shock_standard: 'IEC 60068-2-27',
  humidity_range: '5-95',
  storage_temp_range: '-40 to +70',
  
  // Hardware defaults
  safe_stop_input: 'Da (Safe Torque Off - STO)',
  analog_inputs: '2',
  analog_outputs: '1',
  digital_inputs: '4-6',
  digital_outputs: '2',
  relay_outputs: '2',
};
