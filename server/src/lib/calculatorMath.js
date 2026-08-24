export function calculateWastage(costRs, initialWeight22k, price1g22k) {
  const finalWeight24K = ((8 * costRs / price1g22k) + (8.45 * initialWeight22k)) / 8.65;
  const percentage = (finalWeight24K / initialWeight22k) * 100;
  const wastage = (initialWeight22k * 0.45) / 8;

  return {
    finalWeight24K: Number(finalWeight24K.toFixed(3)),
    percentage: Number(percentage.toFixed(2)),
    wastage: Number(wastage.toFixed(3)),
  };
}

export function calculateCost(percentage, initialWeight22k, price1g22k) {
  const costRs = initialWeight22k * price1g22k * ((8.65 * (percentage / 100)) - 8.45) / 8;
  return {
    costRs: Math.round(costRs),
  };
}
