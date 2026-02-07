import { getCountries, getCountryCallingCode } from 'libphonenumber-js';

const displayNames =
  typeof Intl !== 'undefined' && Intl.DisplayNames
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const isoToFlagEmoji = (iso2) => {
  if (!iso2 || iso2.length !== 2) return '';
  const codePoints = iso2
    .toUpperCase()
    .split('')
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const PHONE_COUNTRIES = getCountries()
  .map((iso2) => {
    const callingCode = getCountryCallingCode(iso2);
    return {
      iso2,
      name: displayNames ? displayNames.of(iso2) : iso2,
      callingCode: `+${callingCode}`,
      flag: isoToFlagEmoji(iso2),
    };
  })
  .sort((a, b) => {
    if (a.iso2 === 'IN') return -1;
    if (b.iso2 === 'IN') return 1;
    return a.name.localeCompare(b.name);
  });