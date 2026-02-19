import AgencyLevelRule from '../models/AgencyLevelRule.js';

export async function listAgencyLevelRules(req, res) {
  const rules = await AgencyLevelRule.find().sort({ level: 1 });
  res.json({ rules });
}

export async function createAgencyLevelRule(req, res) {
  const b = req.body || {};
  const rule = await AgencyLevelRule.create({
    level: Number(b.level),
    name: String(b.name || `Level ${b.level}`),

    minPostMarriagePaymentsCount: Number(b.minPostMarriagePaymentsCount || 0),
    minPostMarriageRevenueMinor: Number(b.minPostMarriageRevenueMinor || 0),

    minAvgRating: Number(b.minAvgRating || 0),
    minRatingCount: Number(b.minRatingCount || 0),

    isActive: b.isActive !== undefined ? Boolean(b.isActive) : true,
  });
  res.json({ rule });
}

export async function updateAgencyLevelRule(req, res) {
  const { id } = req.params;
  const b = req.body || {};
  const rule = await AgencyLevelRule.findByIdAndUpdate(
    id,
    {
      ...(b.level !== undefined ? { level: Number(b.level) } : {}),
      ...(b.name !== undefined ? { name: String(b.name) } : {}),
      ...(b.minPostMarriagePaymentsCount !== undefined
        ? { minPostMarriagePaymentsCount: Number(b.minPostMarriagePaymentsCount) }
        : {}),
      ...(b.minPostMarriageRevenueMinor !== undefined
        ? { minPostMarriageRevenueMinor: Number(b.minPostMarriageRevenueMinor) }
        : {}),
      ...(b.minAvgRating !== undefined ? { minAvgRating: Number(b.minAvgRating) } : {}),
      ...(b.minRatingCount !== undefined ? { minRatingCount: Number(b.minRatingCount) } : {}),
      ...(b.isActive !== undefined ? { isActive: Boolean(b.isActive) } : {}),
    },
    { new: true }
  );
  if (!rule) return res.status(404).json({ message: 'Rule not found' });
  res.json({ rule });
}

export async function deleteAgencyLevelRule(req, res) {
  const { id } = req.params;
  const ok = await AgencyLevelRule.findByIdAndDelete(id);
  if (!ok) return res.status(404).json({ message: 'Rule not found' });
  res.json({ success: true });
}