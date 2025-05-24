// Code from Gemini Advanced

/**
 * Estimates the remaining capacity of a LiPo battery cell based on its current voltage and temperature.
 *
 * IMPORTANT DISCLAIMERS:
 * - This function provides a ROUGH ESTIMATE and should not be used for critical applications
 * where precise battery level is necessary.
 * - Real LiPo battery capacity is affected by many factors not accounted for here,
 * such as battery age, C-rating, discharge current, internal resistance, and specific chemistry.
 * - The voltage-to-capacity curve used is a general approximation and may not match your specific battery.
 * - Temperature effects are also generalized. Extreme temperatures can permanently damage batteries.
 *
 * @param {number} currentVoltagePerCell The current voltage of a single LiPo cell (e.g., 3.85).
 * Ensure this is the voltage PER CELL, not the total pack voltage.
 * @param {number} temperatureCelsius The current ambient temperature in Celsius.
 * @param {number} nominalCapacitymAh The nominal (rated) capacity of the battery in mAh (e.g., 2200).
 * @returns {object} An object containing:
 * - estimatedCapacitymAh {number}: The estimated remaining capacity in mAh.
 * - voltageBasedSoCPercent {number}: State of Charge based on voltage alone (0-100).
 * - temperatureCorrectionFactor {number}: The factor applied due to temperature (0.3-1.0).
 * - warnings {string[]}: An array of warning messages, if any.
 */
function estimateLipoCapacity(currentVoltagePerCell, temperatureCelsius, nominalCapacitymAh) {
    // --- Configuration Constants ---

    // Voltage-to-State-of-Charge (SoC) mapping. (Voltage, Percentage)
    // This is a generic curve. Specific batteries will vary.
    const voltageCapacityMap = [
        { v: 3.20, p: 0 },    // Cut-off voltage - 0%
        { v: 3.50, p: 5 },
        { v: 3.60, p: 10 },
        { v: 3.68, p: 15 },   // Slightly adjusted common values
        { v: 3.70, p: 20 },
        { v: 3.73, p: 25 },
        { v: 3.75, p: 30 },
        { v: 3.77, p: 35 },
        { v: 3.79, p: 40 },
        { v: 3.80, p: 45 },
        { v: 3.82, p: 50 },
        { v: 3.85, p: 55 },   // Nominal voltage often around 50-60%
        { v: 3.87, p: 60 },
        { v: 3.90, p: 65 },
        { v: 3.93, p: 70 },
        { v: 3.95, p: 75 },
        { v: 3.98, p: 80 },
        { v: 4.02, p: 85 },
        { v: 4.08, p: 90 },
        { v: 4.15, p: 95 },
        { v: 4.20, p: 100 }   // Fully charged - 100%
    ];

    const MAX_VOLTAGE = 4.20;
    const MIN_VOLTAGE_CUTOFF = 3.20; // Absolute minimum, below this is damaging

    // Temperature compensation parameters
    const TEMP_OPTIMAL_LOW_C = 18;    // Lower bound of optimal temperature range
    const TEMP_OPTIMAL_HIGH_C = 28;   // Upper bound of optimal temperature range
    const COLD_PENALTY_PER_DEGREE = 0.015; // 1.5% capacity reduction per degree below optimal
    const HOT_PENALTY_PER_DEGREE = 0.01;   // 1.0% capacity reduction per degree above optimal
    const MIN_TEMP_FACTOR = 0.3;      // Minimum capacity factor due to extreme cold (e.g., 30%)
    const EXTREME_COLD_WARNING_C = 0;
    const EXTREME_HOT_WARNING_C = 45;

    let warnings = [];

    // --- 1. Input Validation & Edge Cases ---
    if (typeof currentVoltagePerCell !== 'number' || isNaN(currentVoltagePerCell) ||
        typeof temperatureCelsius !== 'number' || isNaN(temperatureCelsius) ||
        typeof nominalCapacitymAh !== 'number' || isNaN(nominalCapacitymAh) || nominalCapacitymAh <= 0) {
        warnings.push("Invalid input parameters. Please provide valid numbers.");
        return {
            estimatedCapacitymAh: 0,
            voltageBasedSoCPercent: 0,
            temperatureCorrectionFactor: 1.0,
            warnings
        };
    }


    // --- 2. Voltage-based State of Charge (SoC) Calculation ---
    let voltageBasedSoCPercent = 0;

    if (currentVoltagePerCell >= MAX_VOLTAGE) {
        voltageBasedSoCPercent = 100;
        if (currentVoltagePerCell > MAX_VOLTAGE + 0.05) { // Small tolerance for fully charged
             warnings.push(`Voltage (${currentVoltagePerCell.toFixed(2)}V) is very high, possibly overcharged. Risk of battery damage.`);
        }
    } else if (currentVoltagePerCell <= MIN_VOLTAGE_CUTOFF) {
        voltageBasedSoCPercent = 0;
        if (currentVoltagePerCell < MIN_VOLTAGE_CUTOFF) {
            warnings.push(`Voltage (${currentVoltagePerCell.toFixed(2)}V) is very low. Battery may be over-discharged, risk of permanent damage.`);
        }
    } else {
        // Find the two points in the map that bracket the current voltage
        let lowerBound = null;
        let upperBound = null;

        for (let i = 0; i < voltageCapacityMap.length; i++) {
            if (currentVoltagePerCell >= voltageCapacityMap[i].v) {
                lowerBound = voltageCapacityMap[i];
                if (i + 1 < voltageCapacityMap.length) {
                    upperBound = voltageCapacityMap[i+1];
                } else { // At the top of the map
                    upperBound = voltageCapacityMap[i]; // Should be handled by >= MAX_VOLTAGE
                }
            } else { // currentVoltage is less than map[i].v, so we found our segment
                upperBound = voltageCapacityMap[i];
                if (i > 0) {
                     lowerBound = voltageCapacityMap[i-1];
                } else { // At the bottom of the map
                    lowerBound = voltageCapacityMap[i]; // Should be handled by <= MIN_VOLTAGE_CUTOFF
                }
                break;
            }
        }
        
        if (lowerBound && upperBound && lowerBound.v !== upperBound.v) {
            // Linear interpolation: y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            voltageBasedSoCPercent = lowerBound.p +
                (currentVoltagePerCell - lowerBound.v) *
                (upperBound.p - lowerBound.p) /
                (upperBound.v - lowerBound.v);
        } else if (lowerBound) { // Exact match or edge case
            voltageBasedSoCPercent = lowerBound.p;
        }
         voltageBasedSoCPercent = Math.max(0, Math.min(100, voltageBasedSoCPercent)); // Clamp to 0-100
    }


    // --- 3. Temperature Compensation Factor Calculation ---
    let temperatureCorrectionFactor = 1.0;

    if (temperatureCelsius < TEMP_OPTIMAL_LOW_C) {
        temperatureCorrectionFactor = 1.0 - (TEMP_OPTIMAL_LOW_C - temperatureCelsius) * COLD_PENALTY_PER_DEGREE;
        if (temperatureCelsius <= EXTREME_COLD_WARNING_C) {
            warnings.push(`Temperature (${temperatureCelsius}°C) is very low. Capacity and performance significantly reduced. Risk of damage if charging.`);
        }
    } else if (temperatureCelsius > TEMP_OPTIMAL_HIGH_C) {
        temperatureCorrectionFactor = 1.0 - (temperatureCelsius - TEMP_OPTIMAL_HIGH_C) * HOT_PENALTY_PER_DEGREE;
        if (temperatureCelsius >= EXTREME_HOT_WARNING_C) {
            warnings.push(`Temperature (${temperatureCelsius}°C) is very high. Battery health and safety may be compromised.`);
        }
    }
    // Else: temperature is in the optimal range, factor remains 1.0

    temperatureCorrectionFactor = Math.max(MIN_TEMP_FACTOR, temperatureCorrectionFactor); // Apply minimum factor
    temperatureCorrectionFactor = Math.min(1.0, temperatureCorrectionFactor); // Ensure it doesn't exceed 1.0

    // --- 4. Final Estimated Capacity Calculation ---
    const estimatedCapacitymAh = (voltageBasedSoCPercent / 100) * nominalCapacitymAh * temperatureCorrectionFactor;

    return {
        estimatedCapacitymAh: parseFloat(estimatedCapacitymAh.toFixed(2)), // Return with 2 decimal places
        voltageBasedSoCPercent: parseFloat(voltageBasedSoCPercent.toFixed(2)),
        temperatureCorrectionFactor: parseFloat(temperatureCorrectionFactor.toFixed(2)),
        warnings: warnings
    };
}

console.log("Battery capacity", estimateLipoCapacity(4.0, -20, 200))

