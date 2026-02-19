const ZERO_DECIMAL = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);

export function toMinor(amountMajor, currency) {
  const c = String(currency || 'USD').toUpperCase();
  const n = Number(amountMajor);
  if (!Number.isFinite(n)) return null;
  return ZERO_DECIMAL.has(c) ? Math.round(n) : Math.round(n * 100);
}