export function entryAmountMg(entry) {
  switch (entry.type) {
    case "SALE":
      return Math.round(entry.weightMg * entry.ratePct / 100);
    case "RETURN":
      // always 22kt — rate% converts to 24kt equivalent, same formula as SALE
      return -Math.round(entry.weightMg * entry.ratePct / 100);
    case "GOLD_PAYMENT":
      return -entry.weightMg;
    case "CASH_PAYMENT":
      return -Math.round(entry.cashCents * 1000 / entry.pricePerGramCents);
    default:
      return 0;
  }
}

export function computeBalance(entries) {
  return entries
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + entryAmountMg(e), 0);
}

export function buildRunningLedger(entries) {
  const sorted = entries
    .filter((e) => e.status === "active")
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

  let running = 0;
  return sorted.map((e) => {
    const amt = entryAmountMg(e);
    running += amt;
    const obj = typeof e.toObject === "function" ? e.toObject() : e;
    return { ...obj, amountMg: amt, runningBalanceMg: running };
  });
}
