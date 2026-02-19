export async function updateMyLanguage(req, res) {
  const { preferredLanguage } = req.body;
  const lang = String(preferredLanguage || '').toLowerCase();
  const allowed = new Set(['en', 'si', 'ta']);

  if (!allowed.has(lang)) {
    return res.status(400).json({ message: 'Invalid language', code: 'INVALID_LANGUAGE' });
  }

  req.user.preferredLanguage = lang;
  await req.user.save();

  return res.json({ success: true, preferredLanguage: lang });
}