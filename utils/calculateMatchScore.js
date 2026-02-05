const norm = (v) => String(v || '').trim().toLowerCase();

const calculateMatchScore = (userProfile, candidateProfile) => {
  let score = 0;
  let totalCriteria = 0;
  const prefs = userProfile.partnerPreferences || {};

  if (prefs.ageRange?.min != null && prefs.ageRange?.max != null) {
    totalCriteria += 10;
    if (candidateProfile.age >= prefs.ageRange.min && candidateProfile.age <= prefs.ageRange.max) score += 10;
  }

  if (prefs.religion?.length) {
    totalCriteria += 15;
    const prefSet = new Set(prefs.religion.map(norm));
    if (prefSet.has(norm(candidateProfile.religion))) score += 15;
  }

  if (prefs.education?.length) {
    totalCriteria += 10;
    const prefSet = new Set(prefs.education.map(norm));
    if (prefSet.has(norm(candidateProfile.education))) score += 10;
  }

  if (prefs.country?.length) {
    totalCriteria += 10;
    const prefSet = new Set(prefs.country.map(norm));
    if (prefSet.has(norm(candidateProfile.country))) score += 10;
  }

  if (prefs.diet?.length) {
    totalCriteria += 5;
    const prefSet = new Set(prefs.diet.map(norm));
    if (prefSet.has(norm(candidateProfile.diet))) score += 5;
  }

  return totalCriteria ? Math.round((score / totalCriteria) * 100) : 0;
};

export default calculateMatchScore;