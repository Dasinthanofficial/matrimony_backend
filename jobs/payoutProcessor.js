import Payment from '../models/Payment.js';

// No gateway transfers here. Mark due payouts as ready for manual processing by admin.
export async function processDueAgencyPayouts(limit = 50) {
  const due = await Payment.find({
    plan: 'agency_service',
    status: 'succeeded',
    'payout.status': 'scheduled',
    'payout.releaseAt': { $lte: new Date() },
  })
    .sort({ 'payout.releaseAt': 1 })
    .limit(limit);

  for (const p of due) {
    p.payout.status = 'ready_for_manual';
    p.payout.error = '';
    await p.save();
  }

  return { processed: due.length };
}

let timer = null;

export function startPayoutProcessor({ intervalMs = 10 * 60 * 1000 } = {}) {
  if (timer) return () => {};
  timer = setInterval(() => {
    processDueAgencyPayouts().catch(() => {});
  }, intervalMs);

  timer.unref?.();

  return () => {
    clearInterval(timer);
    timer = null;
  };
}