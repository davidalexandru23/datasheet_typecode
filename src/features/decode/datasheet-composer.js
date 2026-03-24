/**
 * Datasheet Composer - builds the structured 9-section 
 * datasheet from the unified extracted data map.
 * Matches reference Danfoss architecture completely and dynamically populates fields.
 * 
 * @module datasheet-composer
 */

/** @typedef {import('../../types/knowledge-base.js').DecodeResult} DecodeResult */
/** @typedef {import('../../types/knowledge-base.js').DatasheetSection} DatasheetSection */
/** @typedef {import('../../types/knowledge-base.js').DatasheetRow} DatasheetRow */

/**
 * Compose a structured, enterprise datasheet using the unified data extractor map
 * 
 * @param {DecodeResult} decodeResult
 * @returns {DatasheetSection[]} Array of 9 formal datasheet sections
 */
export function composeDatasheet({ segments, technicalTables, extracted_data }) {
  // Use the extracted unified map for all lookups 
  // extracted_data contains static constants, table-derived values, and segment derivations
  const d = extracted_data || {};

  /** Helper to find raw segment meaning based on keywords */
  const seg = (...keywords) => {
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
  };

  /** Helper to select best available fallback value */
  const val = (...options) => {
    for (const opt of options) {
      if (opt && String(opt).trim() !== '') return String(opt).trim();
    }
    return '';
  };

  const pPhase = val(d.phases, seg('phase'));
  const pVoltIn = val(d.voltage_range, seg('voltage', 'ac_line'));
  const pIP = val(d.ip_rating, seg('enclosure', 'protection'));
  const pKW = val(d.power_kw, d.power, seg('power', 'size'));

  // 1. PRODUCATOR
  const secProducator = {
    title: 'PRODUCATOR',
    rows: [
      r('1,01', 'Producator', val(d.manufacturer)),
      r('1,02', 'Tara de origine', val(d.country_of_origin)),
      r('1,03', 'Marca', val(d.brand_name)),
      r('1,04', 'Model curent', val(d.product_family)),
      r('1,05', 'Descriere', `VFD ${val(d.product_family)} ${pKW ? pKW + ' kW' : ''}`.trim()),
      r('1,06', 'Cod de model', val(d.type_code)),
    ]
  };

  // 2. DATE RETEA
  const secDateRetea = {
    title: 'DATE RETEA',
    rows: [
      r('2,02', 'Numar de faze', pPhase),
      r('2,03', 'Tensiune intrare', pVoltIn, pVoltIn ? 'VAC' : ''),
      r('2,05', 'Frecventa', val(d.input_frequency), 'Hz'),
    ]
  };

  // 3. DATE NOMINALE
  const secDateNominale = {
    title: 'DATE NOMINALE',
    rows: [
      r('3,01', 'Putere iesire', pKW, 'kW'),
      r('3,02', 'Curent iesire (HO)', val(d.output_current), 'A'),
      r('3,03', 'Eficienta', val(d.efficiency), '%'),
      r('3,04', 'Timpul de suprasarcina (160%)', pKW ? val(d.overload_time_high_overload, d.overload_time_160pct) : '', 's'),
      r('3,08', 'Filtru RFI', seg('rfi')),
    ]
  };

  // 4. HARDWARE
  const secHardware = {
    title: 'HARDWARE',
    rows: [
      r('4,02', 'Panou de comanda', seg('display', 'lcp')),
      r('4,04', 'Intrari analogice', pKW ? val(d.analog_inputs) : ''),
      r('4,05', 'Intrari digitale', pKW ? val(d.digital_inputs) : ''),
      r('4,06', 'Iesiri analogice', pKW ? val(d.analog_outputs) : ''),
      r('4,07', 'Iesiri digitale', pKW ? val(d.digital_outputs) : ''),
      r('4,08', 'Iesiri Releu', pKW ? val(d.relay_outputs) : ''),
      r('4,12', 'Chopper de franare', seg('brake')),
      r('4,14', 'Protectie placi (Coated PCB)', seg('pcb', 'coat')),
    ]
  };

  // 5. CONEXIUNI MOTOR
  const secConexiuni = {
    title: 'CONEXIUNI MOTOR',
    rows: [
      r('5,01', 'Tensiune de iesire', pVoltIn, pVoltIn ? 'VAC' : ''),
      r('5,02', 'Curent nominal la motor', val(d.output_current), 'A'),
      r('5,05', 'Frecventa de iesire', pVoltIn ? val(d.output_frequency_range) : '', 'Hz'),
      r('5,06', 'Rezolutia frecventei la iesire', pVoltIn ? val(d.frequency_resolution) : '', 'Hz'),
    ]
  };

  // 6. CARACTERISTICI DE CONTROL
  const secControl = {
    title: 'CARACTERISTICI DE CONTROL',
    rows: [
      r('6,01', 'Interfata seriala de comunicatie', pVoltIn ? val(seg('a_options', 'fieldbus'), d.serial_interface) : ''),
      r('6,02', 'Precizia vitezei', pVoltIn ? val(d.control_accuracy_open_loop) : ''),
      r('6,03', 'Timp Rampa (Accelerare/Decelerare)', pVoltIn ? val(d.ramp_time_range) : '', 's'),
      r('6,04', 'Intrari pt Safe Stop', pVoltIn ? val(d.safe_stop_input) : ''),
    ]
  };

  // 7. CONDITII AMBIENTALE
  const secAmbient = {
    title: 'CONDITII AMBIENTALE',
    rows: [
      r('7,01', 'Temperatura Minima a mediului ambient', val(d.ambient_temperature_minimum), '°C'),
      r('7,02', 'Temperatura Maxima a mediului ambient', val(d.ambient_temperature_maximum), '°C'),
      r('7,03', 'Temp Med Ambient cu declasare capabila', val(d.storage_temp_range), '°C'),
      r('7,04', 'Grad de protectie IP', pIP),
      r('7,05', 'Grad de poluare a mediului', pVoltIn ? val(d.pollution_degree) : ''),
      r('7,06', 'Altitudinea maxima inainte de declasare', val(d.maximum_altitude_without_derating), 'm'),
      r('7,07', 'Umiditate Maxima', pVoltIn ? val(d.humidity_range) : '', '%'),
      r('7,08', 'Standard Vibratii', pVoltIn ? val(d.vibration_standard) : ''),
    ]
  };

  // 8. NIVEL DE ZGOMOT (Usually missing from specs)
  const secZgomot = {
    title: 'NIVEL DE ZGOMOT',
    rows: [
      r('8,01', 'Zgomot Minim', ''),
      r('8,02', 'Zgomot Maxim', val(d.acoustic_noise), 'dBA'),
    ]
  };

  // 9. GREUTATE, DISTANTE SI DIMENSIUNI
  const secDimensiuni = {
    title: 'GREUTATE, DISTANTE, DIMENSIUNI',
    rows: [
      r('9,01', 'Greutate Neta', val(d.weight)),
      r('9,02', 'Dimensiune ambalaj', ''),
      r('9,05', 'Inaltime Neta', val(d.dimension_height)),
      r('9,06', 'Latime Neta', val(d.dimension_width)),
      r('9,07', 'Adancime Neta', val(d.dimension_depth)),
    ]
  };

  // We only show fields that are valid per business logic
  // e.g., if there is no decoded segment at all, the datasheet stays mostly blank.
  const isValid = pVoltIn || pKW || pIP || segments.length > 5;

  const allSections = [
    secProducator, secDateRetea, secDateNominale, secHardware, 
    secConexiuni, secControl, secAmbient, secZgomot, secDimensiuni
  ];

  if (!isValid) {
    return allSections;
  }

  // Mark a section as visible by default if it contains at least one populated row.
  return allSections.map((sec, idx) => ({
    ...sec,
    id: `sec-${idx}-${sec.title.replace(/\s+/g, '-').toLowerCase()}`,
    visible: sec.rows.some(r => r.visible === true)
  }));
}

/** 
 * Helper for structuring a row 
 * @param {string} nr  E.g. "1,01"
 * @param {string} label Row label
 * @param {string} val Value text
 * @param {string} [unit=''] Optional unit text
 * @returns {DatasheetRow}
 */
function r(nr, label, val, unit = '') {
  // Never add hallucinated or "NOT FOUND" text
  const cleanVal = (val || '').replace(/NOT FOUND.*/gi, '').trim();
  
  if (!cleanVal || cleanVal.toLowerCase() === 'n/a') {
    return { id: nr, numbering: nr, label: label, value: '', unit: '', visible: false };
  }

  // Handle case where value includes unit natively (e.g. "55 °C")
  let displayUnit = unit;
  if (unit && cleanVal.endsWith(unit)) {
      displayUnit = '';
  }

  return { id: nr, numbering: nr, label: label, value: cleanVal, unit: displayUnit, visible: true };
}
