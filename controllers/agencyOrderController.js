// server/controllers/agencyOrderController.js
import crypto from 'crypto';
import mongoose from 'mongoose';
import Agency from '../models/Agency.js';
import AgencyService from '../models/AgencyService.js';
import AgencyOrder from '../models/AgencyOrder.js';
import { toMinor } from '../utils/money.js';

function md5(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

// PayHere: hash = strtoupper(md5(merchant_id + order_id + amount + currency + strtoupper(md5(merchant_secret))))
function buildPayHereHash({ merchantId, merchantSecret, orderId, amount, currency }) {
  const secretHash = md5(merchantSecret).toUpperCase();
  const raw = `${merchantId}${orderId}${amount}${currency}${secretHash}`;
  return md5(raw).toUpperCase();
}

// Notify verify: md5sig = strtoupper(md5(merchant_id+order_id+payhere_amount+payhere_currency+status_code+strtoupper(md5(merchant_secret))))
function verifyPayHereNotifySig(body, merchantSecret) {
  const merchant_id = body.merchant_id;
  const order_id = body.order_id;
  const payhere_amount = body.payhere_amount;
  const payhere_currency = body.payhere_currency;
  const status_code = body.status_code;

  const secretHash = md5(merchantSecret).toUpperCase();
  const local = md5(`${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${secretHash}`).toUpperCase();

  const remote = String(body.md5sig || '').toUpperCase();
  return !!remote && local === remote;
}

function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: 'User', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/**
 * POST /api/agency-orders/checkout
 * body: { serviceId }
 * returns: { checkoutUrl, payload, orderId, agencyOrderId }
 */
export async function createAgencyOrderCheckout(req, res) {
  try {
    const { serviceId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serviceId)) {
      return res.status(400).json({ message: 'Invalid serviceId' });
    }

    const service = await AgencyService.findById(serviceId);
    if (!service || !service.isActive) return res.status(404).json({ message: 'Service not found' });

    const agency = await Agency.findById(service.agencyId);
    if (!agency || agency.status !== 'approved') return res.status(404).json({ message: 'Agency not found' });

    const currency = String(service.currency || 'LKR').toUpperCase();
    const amount = Number(service.price);
    const amountMinor = Number.isFinite(service.priceMinor) ? service.priceMinor : toMinor(amount, currency);

    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountMinor) || amountMinor <= 0) {
      return res.status(400).json({ message: 'Invalid service price' });
    }

    // Create order
    const order = await AgencyOrder.create({
      buyerUserId: req.user._id,
      agencyId: agency._id,
      serviceId: service._id,
      amount,
      amountMinor,
      currency,
      payhereOrderId: `AO_${new mongoose.Types.ObjectId().toString()}`, // stable external order id
      paymentStatus: 'pending',
      status: 'pending_payment',
    });

    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    const checkoutUrl = process.env.PAYHERE_CHECKOUT_URL || 'https://sandbox.payhere.lk/pay/checkout';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const apiUrl = process.env.API_URL || 'http://localhost:5000';

    if (!merchantId || !merchantSecret) {
      return res.status(500).json({ message: 'PayHere merchant config missing' });
    }

    // PayHere expects amount formatted with 2 decimals in hash inputs and payload.
    const amountStr = amount.toFixed(2);

    const hash = buildPayHereHash({
      merchantId,
      merchantSecret,
      orderId: order.payhereOrderId,
      amount: amountStr,
      currency,
    });

    const { first, last } = splitName(req.user.fullName || req.user.name || '');
    const email = req.user.email || 'no-email@example.com';
    const phone = req.user.phone || req.user.mobile || '0000000000';

    const payload = {
      merchant_id: merchantId,
      return_url: `${clientUrl}/payment/success?order_id=${encodeURIComponent(order.payhereOrderId)}`,
      cancel_url: `${clientUrl}/payment/cancel?order_id=${encodeURIComponent(order.payhereOrderId)}`,
      notify_url: `${apiUrl}/api/agency-orders/payhere/notify`,

      order_id: order.payhereOrderId,
      items: service.title || 'Agency Service',
      currency,
      amount: amountStr,

      first_name: first,
      last_name: last,
      email,
      phone,
      address: req.user.address || 'N/A',
      city: req.user.city || 'N/A',
      country: req.user.country || 'Sri Lanka',

      hash,
    };

    return res.json({
      checkoutUrl,
      payload,
      orderId: order.payhereOrderId,
      agencyOrderId: order._id,
    });
  } catch (e) {
    console.error('createAgencyOrderCheckout:', e);
    return res.status(500).json({ message: 'Failed to create checkout' });
  }
}

/**
 * POST /api/agency-orders/verify
 * body: { orderId }
 * returns: { status, order }
 */
export async function verifyAgencyOrderPayment(req, res) {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ message: 'orderId required' });

    const order = await AgencyOrder.findOne({ payhereOrderId: String(orderId) })
      .populate('serviceId', 'title price currency')
      .populate('agencyId', 'name status');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // user can only see their own orders; agency owners can see their agency orders
    const isBuyer = String(order.buyerUserId) === String(req.user._id);
    const isAgencyOwner = req.user?.role === 'agency'; // we’ll enforce ownership on list endpoints; keep verify user-safe
    if (!isBuyer && !isAgencyOwner) return res.status(403).json({ message: 'Forbidden' });

    const status = order.paymentStatus === 'paid' ? 'succeeded' : order.paymentStatus === 'failed' ? 'failed' : 'pending';

    return res.json({
      status,
      order,
    });
  } catch (e) {
    console.error('verifyAgencyOrderPayment:', e);
    return res.status(500).json({ message: 'Failed to verify payment' });
  }
}

/**
 * PayHere notify URL
 * POST /api/agency-orders/payhere/notify
 */
export async function payhereNotifyAgencyOrder(req, res) {
  try {
    const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
    if (!merchantSecret) return res.status(500).send('merchant secret missing');

    const body = req.body || {};
    const orderId = String(body.order_id || '');

    if (!orderId) return res.status(400).send('order_id missing');

    const okSig = verifyPayHereNotifySig(body, merchantSecret);
    if (!okSig) return res.status(400).send('invalid signature');

    const statusCode = Number(body.status_code); // 2 = success
    const paymentSucceeded = statusCode === 2;

    const order = await AgencyOrder.findOne({ payhereOrderId: orderId });
    if (!order) return res.status(404).send('order not found');

    order.payhere = body;

    if (paymentSucceeded) {
      order.paymentStatus = 'paid';
      if (order.status === 'pending_payment') order.status = 'paid';
    } else if ([0, -1, -2, -3].includes(statusCode)) {
      order.paymentStatus = 'failed';
    }

    await order.save();

    // PayHere expects a 200 response
    return res.status(200).send('OK');
  } catch (e) {
    console.error('payhereNotifyAgencyOrder:', e);
    return res.status(500).send('ERR');
  }
}

/**
 * GET /api/agency-orders/me
 */
export async function listMyAgencyOrders(req, res) {
  try {
    const orders = await AgencyOrder.find({ buyerUserId: req.user._id })
      .sort({ createdAt: -1 })
      .populate('serviceId', 'title price currency')
      .populate('agencyId', 'name');

    return res.json({ orders });
  } catch {
    return res.status(500).json({ message: 'Failed to load orders' });
  }
}

/**
 * GET /api/agency-orders/agency
 * Agency owner sees orders for their own agency
 */
export async function listAgencyOrders(req, res) {
  try {
    const agency = await Agency.findOne({ ownerUserId: req.user._id });
    if (!agency) return res.json({ orders: [] });

    const orders = await AgencyOrder.find({ agencyId: agency._id })
      .sort({ createdAt: -1 })
      .populate('serviceId', 'title price currency')
      .populate('buyerUserId', 'fullName email');

    return res.json({ orders, agency: { _id: agency._id, name: agency.name } });
  } catch {
    return res.status(500).json({ message: 'Failed to load agency orders' });
  }
}

/**
 * PATCH /api/agency-orders/:id/status
 * body: { status: 'accepted'|'completed'|'cancelled' }
 */
export async function updateAgencyOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid order id' });

    const allowed = new Set(['accepted', 'completed', 'cancelled']);
    if (!allowed.has(status)) return res.status(400).json({ message: 'Invalid status' });

    const agency = await Agency.findOne({ ownerUserId: req.user._id });
    if (!agency) return res.status(403).json({ message: 'No agency' });

    const order = await AgencyOrder.findOne({ _id: id, agencyId: agency._id });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    // basic rules
    if (order.paymentStatus !== 'paid' && status !== 'cancelled') {
      return res.status(400).json({ message: 'Cannot accept/complete unpaid order' });
    }

    order.status = status;
    await order.save();

    return res.json({ order });
  } catch {
    return res.status(500).json({ message: 'Failed to update order' });
  }
}