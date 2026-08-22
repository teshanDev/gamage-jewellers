import { formatGoldWeight } from "./goldRounding.js";

export function entryAmountMg(entry) {
  let raw = 0;
  switch (entry.type) {
    case "SALE":
      raw = entry.weightMg * entry.ratePct / 100;
      break;
    case "RETURN":
      // always 22kt — rate% converts to 24kt equivalent, same formula as SALE
      raw = -(entry.weightMg * entry.ratePct / 100);
      break;
    case "GOLD_PAYMENT":
      raw = -entry.weightMg;
      break;
    case "CASH_PAYMENT":
      raw = -(entry.cashCents * 1000 / entry.pricePerGramCents);
      break;
    default:
      return 0;
  }
  
  if (raw === 0) return 0;
  const formatted = formatGoldWeight(raw / 1000);
  return Math.round(parseFloat(formatted) * 1000);
}

export function computeBalance(entries) {
  return entries
    .filter((e) => e.status === "active")
    .reduce((sum, e) => sum + (e.amountMg ?? entryAmountMg(e)), 0);
}

export function buildRunningLedger(entries) {
  const sorted = entries
    .filter((e) => e.status === "active")
    .sort((a, b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));

  let running = 0;
  return sorted.map((e) => {
    const amt = e.amountMg ?? entryAmountMg(e);
    running += amt;
    const obj = typeof e.toObject === "function" ? e.toObject() : e;
    return { ...obj, amountMg: amt, runningBalanceMg: running };
  });
}
