// ===== FILE: ./utils/currency.js =====

// Country code to currency mapping
export const countryCodeToCurrency = {
  '+1': { currency: 'USD', symbol: '$', country: 'United States' },
  '+7': { currency: 'RUB', symbol: '₽', country: 'Russia' },
  '+20': { currency: 'EGP', symbol: 'E£', country: 'Egypt' },
  '+27': { currency: 'ZAR', symbol: 'R', country: 'South Africa' },
  '+30': { currency: 'EUR', symbol: '€', country: 'Greece' },
  '+31': { currency: 'EUR', symbol: '€', country: 'Netherlands' },
  '+32': { currency: 'EUR', symbol: '€', country: 'Belgium' },
  '+33': { currency: 'EUR', symbol: '€', country: 'France' },
  '+34': { currency: 'EUR', symbol: '€', country: 'Spain' },
  '+39': { currency: 'EUR', symbol: '€', country: 'Italy' },
  '+40': { currency: 'RON', symbol: 'lei', country: 'Romania' },
  '+41': { currency: 'CHF', symbol: 'CHF', country: 'Switzerland' },
  '+43': { currency: 'EUR', symbol: '€', country: 'Austria' },
  '+44': { currency: 'GBP', symbol: '£', country: 'United Kingdom' },
  '+45': { currency: 'DKK', symbol: 'kr', country: 'Denmark' },
  '+46': { currency: 'SEK', symbol: 'kr', country: 'Sweden' },
  '+47': { currency: 'NOK', symbol: 'kr', country: 'Norway' },
  '+48': { currency: 'PLN', symbol: 'zł', country: 'Poland' },
  '+49': { currency: 'EUR', symbol: '€', country: 'Germany' },
  '+52': { currency: 'MXN', symbol: '$', country: 'Mexico' },
  '+55': { currency: 'BRL', symbol: 'R$', country: 'Brazil' },
  '+60': { currency: 'MYR', symbol: 'RM', country: 'Malaysia' },
  '+61': { currency: 'AUD', symbol: 'A$', country: 'Australia' },
  '+62': { currency: 'IDR', symbol: 'Rp', country: 'Indonesia' },
  '+63': { currency: 'PHP', symbol: '₱', country: 'Philippines' },
  '+64': { currency: 'NZD', symbol: 'NZ$', country: 'New Zealand' },
  '+65': { currency: 'SGD', symbol: 'S$', country: 'Singapore' },
  '+66': { currency: 'THB', symbol: '฿', country: 'Thailand' },
  '+81': { currency: 'JPY', symbol: '¥', country: 'Japan' },
  '+82': { currency: 'KRW', symbol: '₩', country: 'South Korea' },
  '+84': { currency: 'VND', symbol: '₫', country: 'Vietnam' },
  '+86': { currency: 'CNY', symbol: '¥', country: 'China' },
  '+90': { currency: 'TRY', symbol: '₺', country: 'Turkey' },
  '+91': { currency: 'INR', symbol: '₹', country: 'India' },
  '+92': { currency: 'PKR', symbol: '₨', country: 'Pakistan' },
  '+94': { currency: 'LKR', symbol: 'Rs', country: 'Sri Lanka' },
  '+212': { currency: 'MAD', symbol: 'د.م.', country: 'Morocco' },
  '+234': { currency: 'NGN', symbol: '₦', country: 'Nigeria' },
  '+254': { currency: 'KES', symbol: 'KSh', country: 'Kenya' },
  '+380': { currency: 'UAH', symbol: '₴', country: 'Ukraine' },
  '+420': { currency: 'CZK', symbol: 'Kč', country: 'Czech Republic' },
  '+852': { currency: 'HKD', symbol: 'HK$', country: 'Hong Kong' },
  '+880': { currency: 'BDT', symbol: '৳', country: 'Bangladesh' },
  '+886': { currency: 'TWD', symbol: 'NT$', country: 'Taiwan' },
  '+966': { currency: 'SAR', symbol: '﷼', country: 'Saudi Arabia' },
  '+971': { currency: 'AED', symbol: 'د.إ', country: 'UAE' },
  '+972': { currency: 'ILS', symbol: '₪', country: 'Israel' },
  '+973': { currency: 'BHD', symbol: '.د.ب', country: 'Bahrain' },
  '+974': { currency: 'QAR', symbol: '﷼', country: 'Qatar' },
  '+977': { currency: 'NPR', symbol: '₨', country: 'Nepal' },
};

// Base prices in USD
export const basePricesUSD = {
  free: 0,
  monthly: 9.99,
  yearly: 99.99,
};

// Approx exchange rates (production: use real FX API)
export const exchangeRates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.12,
  AED: 3.67,
  SAR: 3.75,
  AUD: 1.53,
  CAD: 1.36,
  SGD: 1.34,
  MYR: 4.47,
  THB: 35.5,
  IDR: 15700,
  PHP: 56.5,
  VND: 24500,
  JPY: 149,
  KRW: 1320,
  CNY: 7.24,
  HKD: 7.82,
  TWD: 31.5,
  PKR: 278,
  BDT: 110,
  LKR: 320,
  NPR: 133,
  BRL: 4.97,
  MXN: 17.2,
  ZAR: 18.5,
  NGN: 1550,
  KES: 153,
  EGP: 30.9,
  TRY: 32.5,
  RUB: 92,
  PLN: 4.02,
  CZK: 22.8,
  SEK: 10.5,
  NOK: 10.8,
  DKK: 6.87,
  CHF: 0.88,
  NZD: 1.64,
  QAR: 3.64,
  BHD: 0.377,
  ILS: 3.65,
  UAH: 37.5,
  RON: 4.57,
};

// Stripe minor-unit rules (important for correct amounts)
export const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
]);
export const THREE_DECIMAL_CURRENCIES = new Set(['BHD','JOD','KWD','OMR','TND']);

export const getMinorUnitMultiplier = (currency) => {
  const c = String(currency || '').toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(c)) return 1;
  if (THREE_DECIMAL_CURRENCIES.has(c)) return 1000;
  return 100; // default 2-decimal
};

export const toMinorUnits = (amountMajor, currency) => {
  const m = getMinorUnitMultiplier(currency);
  // Stripe requires integer minor units
  return Math.round(Number(amountMajor) * m);
};

export const toMajorUnits = (amountMinor, currency) => {
  const m = getMinorUnitMultiplier(currency);
  return Number(amountMinor) / m;
};

// A conservative allow-list. If currency not here, we fallback to USD for charging.
export const stripeSupportedCurrencies = [
  'usd','eur','gbp','inr','aed','sar','qar','bhd','aud','cad','sgd','myr','thb','idr','php',
  'jpy','krw','vnd','cny','hkd','twd','brl','mxn','zar','try','egp','pln','czk','sek','nok','dkk','chf','nzd','ils','uah','ron','rub'
];

export const isStripeSupportedCurrency = (currency) =>
  stripeSupportedCurrencies.includes(String(currency || '').toLowerCase());

// Get currency info from country code
export const getCurrencyFromCountryCode = (countryCode) => {
  const info = countryCodeToCurrency[countryCode];
  return info || { currency: 'USD', symbol: '$', country: 'Unknown' };
};

// Convert USD price to target currency (major units)
export const convertPrice = (priceUSD, targetCurrency) => {
  const c = String(targetCurrency || 'USD').toUpperCase();
  const rate = exchangeRates[c] || 1;
  const converted = Number(priceUSD) * rate;

  // Round to the right decimals for that currency
  const mult = getMinorUnitMultiplier(c);
  return Math.round(converted * mult) / mult;
};

// Get prices in a specific currency for display
export const getPricesInCurrency = (currency) => {
  const currencyUpper = String(currency || 'USD').toUpperCase();
  const info =
    Object.values(countryCodeToCurrency).find((c) => c.currency === currencyUpper) || {
      symbol: '$',
      currency: 'USD',
    };

  const monthly = convertPrice(basePricesUSD.monthly, currencyUpper);
  const yearly = convertPrice(basePricesUSD.yearly, currencyUpper);

  return {
    currency: currencyUpper,
    symbol: info.symbol,
    free: { price: 0, display: `${info.symbol}0` },
    monthly: { price: monthly, display: `${info.symbol}${monthly}` },
    yearly: {
      price: yearly,
      display: `${info.symbol}${yearly}`,
      savings: Math.round((1 - basePricesUSD.yearly / (basePricesUSD.monthly * 12)) * 100),
    },
  };
};

// Get Stripe-compatible currency (fallback to USD if not supported)
export const getStripeCurrency = (currency) => {
  const c = String(currency || 'USD').toLowerCase();
  return isStripeSupportedCurrency(c) ? c : 'usd';
};