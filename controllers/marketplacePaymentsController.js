import Payment from '../models/Payment.js';
import Agency from '../models/Agency.js';
import AgencyService from '../models/AgencyService.js';
import { formatPayHereAmount } from '../utils/payhere.js';

const payhereBaseUrl = () =>
  process.env.PAYHERE_SANDBOX === 'true'
    ? 'https://sandbox.payhere.lk/pay/checkout'
    : 'https://www.payhere.lk/pay/checkout';

const COMMISSION_BPS = Number(process.env.PLATFORM_COMMISSION_BPS || 2000);
const HOLD_DAYS = Number(process.env.PAYOUT_DELAY_DAYS || 3);

function calcSplitMinor(amountMinor) {
  const platformFeeMinor = Math.floor((amountMinor * COMMISSION_BPS) / 10000);
  return { platformFeeMinor, agencyAmountMinor: amountMinor - platformFeeMinor };
}

export async function createAgencyServiceCheckout(req, res) {
  const { serviceId } = req.body;
  if (!serviceId) return res.status(400).json({ message: 'serviceId required' });

  if (!process.env.PAYHERE_MERCHANT_ID || !process.env.PAYHERE_MERCHANT_SECRET) {
    return res.status(503).json({ message: 'PayHere not configured', code: 'PAYHERE_NOT_CONFIGURED' });
  }
  if (!process.env.CLIENT_URL || !process.env.SERVER_URL) {
    return res.status(500).json({ message: 'CLIENT_URL or SERVER_URL missing', code: 'CONFIG_MISSING' });
  }

  const service = await AgencyService.findById(serviceId);
  if (!service || !service.isActive) return res.status(404).json({ message: 'Service not found' });

  const agency = await Agency.findById(service.agencyId);
  if (!agency || agency.status !== 'approved') return res.status(400).json({ message: 'Agency not approved' });

  const split = calcSplitMinor(service.priceMinor);

  const payment = await Payment.create({
    userId: req.user._id,
    plan: 'agency_service',
    agencyId: agency._id,
    agencyServiceId: service._id,
    amount: service.price,
    amountMinor: service.priceMinor,
    currency: service.currency,
    status: 'pending',
    gateway: 'payhere',
    description: `Agency service: ${service.title}`,
    metadata: { kind: 'agency_service', serviceTitle: service.title },
    commission: {
      ...split,
      commissionBps: COMMISSION_BPS,
      holdDays: HOLD_DAYS,
    },
    payout: {
      applicable: true,
      status: 'scheduled',
      releaseAt: new Date(Date.now() + HOLD_DAYS * 86400000),
    },
  });

  const payload = {
    merchant_id: process.env.PAYHERE_MERCHANT_ID,
    return_url: `${process.env.CLIENT_URL}/payment/success?order_id=${payment._id}`,
    cancel_url: `${process.env.CLIENT_URL}/payment/cancel?order_id=${payment._id}`,
    notify_url: `${process.env.SERVER_URL}/api/payments/payhere/notify`,
    order_id: String(payment._id),
    items: service.title,
    currency: service.currency,
    amount: formatPayHereAmount(service.price),
    first_name: (req.user.fullName || 'User').split(' ')[0] || 'User',
    last_name: (req.user.fullName || '').split(' ').slice(1).join(' ') || '-',
    email: req.user.email || 'no-email@matrimony.local',
    phone: req.user.phone ? `${req.user.countryCode || '+94'}${req.user.phone}` : '',
    address: 'N/A',
    city: 'N/A',
    country: 'Sri Lanka',
  };

  payment.payhere.orderId = payload.order_id;
  await payment.save();

  res.json({ gateway: 'payhere', checkoutUrl: payhereBaseUrl(), payload, orderId: payload.order_id });
}