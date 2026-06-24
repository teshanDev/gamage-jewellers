export function formatGoldWeight(value) {
  if (value == null || isNaN(value) || value === "") return "";
  const numVal = Number(value);
  if (numVal === 0) return "0.000";

  const isNegative = numVal < 0;
  const absVal = Math.abs(numVal);

  const multiplied = absVal * 100;
  const roundedMultiplied = Math.round(multiplied * 10000) / 10000;
  const remainder = roundedMultiplied % 1;

  let rounded;
  if (remainder >= 0.7999) {
    rounded = Math.ceil(roundedMultiplied);
  } else {
    rounded = Math.floor(roundedMultiplied);
  }

  let finalVal = rounded / 100;
  if (isNegative && finalVal !== 0) {
    finalVal = -finalVal;
  }

  return finalVal.toFixed(3);
}
