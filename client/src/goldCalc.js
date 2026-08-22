// Shared calculation library for wastage percentage and cost calculators
// Used by both frontend (for live preview) and backend (for authoritative save)

/**
 * Calculate wastage percentage and related values
 * @param {number} cost - Cost in Rs
 * @param {number} pricePerGram22k - Price of 1g of 22K gold in Rs
 * @param {number} initialWeight - Initial weight in g (22K)
 * @returns {Object} Contains percentage, wastageG, finalWeight24kG
 */
export function calculateWastagePercentage(cost, pricePerGram22k, initialWeight) {
  // Guard against divide by zero or invalid inputs
  if (!initialWeight || initialWeight === 0 || !pricePerGram22k || pricePerGram22k === 0) {
    return {
      percentage: null,
      wastageG: null,
      finalWeight24kG: null
    };
  }

  // Calculate intermediate value: ((8 * cost / pricePerGram22k) + (8.45 * initialWeight)) / 8.65
  const intermediate = ((8 * cost / pricePerGram22k) + (8.45 * initialWeight)) / 8.65;

  // Percentage = ROUND((intermediate) * 100 / initialWeight, 2)
  const percentage = Math.round((intermediate * 100 / initialWeight) * 100) / 100;

  // Wastage (g) = ROUND(initialWeight * 0.45 / 8, 3)
  const wastageG = Math.round((initialWeight * 0.45 / 8) * 1000) / 1000;

  // Final weight, 24K (g) = ROUND(intermediate, 3)
  const finalWeight24kG = Math.round(intermediate * 1000) / 1000;

  return {
    percentage,
    wastageG,
    finalWeight24kG
  };
}

/**
 * Calculate cost from wastage percentage
 * @param {number} percentage - Wastage percentage
 * @param {number} pricePerGram22k - Price of 1g of 22K gold in Rs
 * @param {number} initialWeight - Initial weight in g (22K)
 * @returns {number} Cost in Rs (rounded to integer)
 */
export function calculateCostFromPercentage(percentage, pricePerGram22k, initialWeight) {
  // Guard against invalid inputs
  if (!percentage || !pricePerGram22k || !initialWeight ||
      percentage === 0 || pricePerGram22k === 0 || initialWeight === 0) {
    return null;
  }

  // Cost = ROUND(initialWeight * pricePerGram22k * ((8.65 * percentage / 100) - 8.45) / 8, 0)
  const inner = (8.65 * percentage / 100) - 8.45;
  const cost = Math.round((initialWeight * pricePerGram22k * inner) / 8);

  return cost;
}

/**
 * Validate inputs for wastage percentage calculator
 * @param {number} cost - Cost in Rs
 * @param {number} pricePerGram22k - Price of 1g of 22K gold in Rs
 * @param {number} initialWeight - Initial weight in g (22K)
 * @returns {Object} Error object or null if valid
 */
export function validateWastageInputs(cost, pricePerGram22k, initialWeight) {
  const errors = {};

  if (cost === undefined || cost === null || cost === '' || isNaN(cost) || cost <= 0) {
    errors.cost = "Enter a positive amount";
  }

  if (pricePerGram22k === undefined || pricePerGram22k === null || pricePerGram22k === '' ||
      isNaN(pricePerGram22k) || pricePerGram22k <= 0) {
    errors.pricePerGram22k = "Enter a positive price";
  }

  if (initialWeight === undefined || initialWeight === null || initialWeight === '' ||
      isNaN(initialWeight) || initialWeight <= 0) {
    errors.initialWeight = "Enter a positive weight";
  }

  return Object.keys(errors).length ? errors : null;
}

/**
 * Validate inputs for cost calculator
 * @param {number} percentage - Wastage percentage
 * @param {number} pricePerGram22k - Price of 1g of 22K gold in Rs
 * @param {number} initialWeight - Initial weight in g (22K)
 * @returns {Object} Error object or null if valid
 */
export function validateCostInputs(percentage, pricePerGram22k, initialWeight) {
  const errors = {};

  if (percentage === undefined || percentage === null || percentage === '' ||
      isNaN(percentage) || percentage <= 0) {
    errors.percentage = "Enter a valid percentage";
  }

  if (pricePerGram22k === undefined || pricePerGram22k === null || pricePerGram22k === '' ||
      isNaN(pricePerGram22k) || pricePerGram22k <= 0) {
    errors.pricePerGram22k = "Enter a positive price";
  }

  if (initialWeight === undefined || initialWeight === null || initialWeight === '' ||
      isNaN(initialWeight) || initialWeight <= 0) {
    errors.initialWeight = "Enter a positive weight";
  }

  return Object.keys(errors).length ? errors : null;
}
