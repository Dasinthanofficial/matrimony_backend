// ===== FILE: ./controllers/subscriptionController.js =====
import Stripe from 'stripe';
import Subscription from '../models/Subscription.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import { handleControllerError } from '../utils/errors.js';
import {
  getCurrencyFromCountryCode,
  getPricesInCurrency,
  getStripeCurrency,
  convertPrice,
  basePricesUSD,
  toMinorUnits,
  toMajorUnits,
} from '../utils/currency.js';

/**
 * IMPORTANT FIX:
 * Do NOT initialize Stripe using process.env at module import time.
 * If dotenv loads after this file is imported, the key will be undefined and Stripe will stay null.
 *
 * We lazily create the Stripe client at runtime and cache it.
 */
let stripeClient = null;
let stripeInitLogged = false;

const getStripeClient = () => {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    // In production you may want to throw hard; in dev we just disable payments gracefully.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('STRIPE_SECRET_KEY is required in production');
    }
    return null;
  }

  if (stripeClient) return stripeClient;

  stripeClient = new Stripe(key, {
    // Pinning apiVersion is recommended; adjust if your Stripe lib/version requires a different string.
    // If your Stripe package complains, you can remove apiVersion and it will use package default.
    apiVersion: '2024-06-20',
  });

  if (!stripeInitLogged) {
    console.log('✅ Stripe initialized');
    stripeInitLogged = true;
  }

  return stripeClient;
};

const requireStripe = (res) => {
  let stripe;
  try {
    stripe = getStripeClient();
  } catch (e) {
    // production strict mode errors
    res.status(500).json({
      message: 'Payment system misconfigured',
      code: 'PAYMENT_MISCONFIGURED',
      hint: e.message,
    });
    return null;
  }

  if (!stripe) {
    res.status(503).json({
      message: 'Payment system not configured',
      code: 'PAYMENT_NOT_CONFIGURED',
      hint: 'Set STRIPE_SECRET_KEY in backend .env and restart the server',
    });
    return null;
  }
  return stripe;
};

const PLAN_CONFIG = {
  free: {
    name: 'Free',
    interval: null,
    features: ['Create Profile', 'Basic Search', 'Send 5 Interests/day', 'Limited Messaging'],
  },
  monthly: {
    name: 'Premium Monthly',
    interval: 'month',
    intervalCount: 1,
    features: ['Unlimited Messages', 'See Who Liked You', 'Advanced Filters', 'Unlimited Interests', 'Read Receipts', 'No Ads'],
  },
  yearly: {
    name: 'Premium Yearly',
    interval: 'year',
    intervalCount: 1,
    features: ['All Monthly Features', 'Priority Support', 'Profile Boost', '2 Months Free', 'Exclusive Badge'],
  },
};

const FREE_FEATURES = {
  unlimitedMessages: false,
  seeWhoLikedYou: false,
  advancedFilters: false,
  prioritySupport: false,
  profileBoost: false,
  unlimitedLikes: false,
  readReceipts: false,
  noAds: false,
};

const getPremiumFeatures = (plan) => ({
  unlimitedMessages: true,
  seeWhoLikedYou: true,
  advancedFilters: true,
  prioritySupport: plan === 'yearly',
  profileBoost: plan === 'yearly',
  unlimitedLikes: true,
  readReceipts: true,
  noAds: true,
});

const getStripePeriodFromSubscriptionId = async (stripeSubscriptionId, stripe = null) => {
  const s = stripe || getStripeClient();
  if (!s || !stripeSubscriptionId) return null;

  try {
    const sub = await s.subscriptions.retrieve(stripeSubscriptionId);
    return {
      startDate: sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
      endDate: sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
      status: sub.status,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    };
  } catch {
    return null;
  }
};

const computeLocalPeriod = (planId) => {
  const startDate = new Date();
  const endDate = new Date();
  if (planId === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1);
  else endDate.setMonth(endDate.getMonth() + 1);
  return { startDate, endDate };
};

// Decide what currency to CHARGE in (must match Stripe currency)
const getChargePricing = ({ planId, countryCurrency }) => {
  const desired = String(countryCurrency || 'USD').toUpperCase();
  const stripeCurrency = getStripeCurrency(desired); // lowercase
  const chargeCurrency = stripeCurrency.toUpperCase();

  const usd = basePricesUSD[planId];
  const amountMajor = chargeCurrency === 'USD' ? usd : convertPrice(usd, chargeCurrency);
  const amountMinor = toMinorUnits(amountMajor, chargeCurrency);

  return { stripeCurrency, chargeCurrency, amountMajor, amountMinor };
};

// PUBLIC
export const getPlans = async (req, res) => {
  try {
    let countryCode = '+1';

    if (req.user?._id) {
      const user = await User.findById(req.user._id).select('countryCode').lean();
      countryCode = user?.countryCode || countryCode;
    } else if (req.query.countryCode) {
      countryCode = String(req.query.countryCode);
    }

    const currencyInfo = getCurrencyFromCountryCode(countryCode);
    const prices = getPricesInCurrency(currencyInfo.currency);

    // Stripe configured based on current env at request time (not import time)
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

    res.json({
      plans: [
        {
          id: 'free',
          name: PLAN_CONFIG.free.name,
          price: 0,
          displayPrice: `${prices.symbol}0`,
          currency: prices.currency,
          symbol: prices.symbol,
          interval: null,
          features: PLAN_CONFIG.free.features,
          recommended: false,
        },
        {
          id: 'monthly',
          name: PLAN_CONFIG.monthly.name,
          price: prices.monthly.price,
          displayPrice: prices.monthly.display,
          currency: prices.currency,
          symbol: prices.symbol,
          interval: 'month',
          features: PLAN_CONFIG.monthly.features,
          recommended: false,
        },
        {
          id: 'yearly',
          name: PLAN_CONFIG.yearly.name,
          price: prices.yearly.price,
          displayPrice: prices.yearly.display,
          pricePerMonth: Math.round((prices.yearly.price / 12) * 100) / 100,
          currency: prices.currency,
          symbol: prices.symbol,
          interval: 'year',
          features: PLAN_CONFIG.yearly.features,
          savings: prices.yearly.savings,
          recommended: true,
        },
      ],
      currency: prices.currency,
      symbol: prices.symbol,
      country: currencyInfo.country,
      stripeConfigured,
    });
  } catch (e) {
    handleControllerError(res, e, 'Get plans');
  }
};

// PROTECTED
export const getMySubscription = async (req, res) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { userId: req.user._id },
      { $setOnInsert: { plan: 'free', status: 'active', features: FREE_FEATURES, startDate: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.findByIdAndUpdate(req.user._id, {
      subscriptionId: subscription._id,
      'subscription.plan': subscription.plan || 'free',
      'subscription.startDate': subscription.startDate || undefined,
      'subscription.endDate': subscription.endDate || undefined,
      'subscription.isActive': subscription.isActive(),
      premiumExpiry: subscription.endDate || undefined,
    });

    const user = await User.findById(req.user._id).select('countryCode').lean();
    const countryCode = user?.countryCode || '+1';
    const currencyInfo = getCurrencyFromCountryCode(countryCode);
    const prices = getPricesInCurrency(currencyInfo.currency);

    res.json({
      subscription: { ...subscription.toObject(), isActive: subscription.isActive(), planConfig: PLAN_CONFIG[subscription.plan] },
      prices,
    });
  } catch (e) {
    handleControllerError(res, e, 'Get subscription');
  }
};

export const createCheckoutSession = async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const { planId } = req.body;
    const userId = req.user._id;
    if (!planId || !['monthly', 'yearly'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });

    const user = await User.findById(userId).select('email phone countryCode').lean();
    const currencyInfo = getCurrencyFromCountryCode(user?.countryCode || '+1');

    const { stripeCurrency, chargeCurrency, amountMajor, amountMinor } = getChargePricing({
      planId,
      countryCurrency: currencyInfo.currency,
    });

    const subDoc = await Subscription.findOneAndUpdate(
      { userId },
      { $setOnInsert: { plan: 'free', status: 'active', features: FREE_FEATURES } },
      { upsert: true, new: true }
    );

    let customerId = subDoc.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        phone: user.phone ? `${user.countryCode}${user.phone}` : undefined,
        metadata: { userId: userId.toString() },
      });
      customerId = customer.id;
      await Subscription.findByIdAndUpdate(subDoc._id, { stripeCustomerId: customerId });
    }

    if (!process.env.CLIENT_URL) {
      return res.status(500).json({
        message: 'CLIENT_URL not configured',
        code: 'CLIENT_URL_MISSING',
        hint: 'Set CLIENT_URL in backend .env (e.g. http://localhost:5173)',
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: stripeCurrency,
            product_data: {
              name: PLAN_CONFIG[planId].name,
              description: `Matrimony ${planId === 'yearly' ? 'Annual' : 'Monthly'} Premium`,
            },
            unit_amount: amountMinor,
            recurring: { interval: planId === 'yearly' ? 'year' : 'month', interval_count: 1 },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/pricing?cancelled=true`,
      metadata: { userId: userId.toString(), planId, currency: chargeCurrency }, // store actual charge currency
    });

    // Optional: store last shown price (not required)
    await Subscription.findByIdAndUpdate(subDoc._id, { currency: chargeCurrency, amount: amountMajor });

    res.json({ sessionId: session.id, url: session.url, currency: chargeCurrency, amount: amountMajor });
  } catch (e) {
    handleControllerError(res, e, 'Create checkout session');
  }
};

// NOTE: This is a ONE-TIME charge flow. It does NOT create a Stripe subscription.
// If you keep it, treat it as time-bound premium without auto-renew.
export const createPaymentIntent = async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const { planId } = req.body;
    const userId = req.user._id;
    if (!planId || !['monthly', 'yearly'].includes(planId)) return res.status(400).json({ message: 'Invalid plan' });

    const user = await User.findById(userId).select('email countryCode').lean();
    const currencyInfo = getCurrencyFromCountryCode(user?.countryCode || '+1');

    const { stripeCurrency, chargeCurrency, amountMajor, amountMinor } = getChargePricing({
      planId,
      countryCurrency: currencyInfo.currency,
    });

    const subDoc = await Subscription.findOneAndUpdate(
      { userId },
      { $setOnInsert: { plan: 'free', status: 'active', features: FREE_FEATURES } },
      { upsert: true, new: true }
    );

    let customerId = subDoc.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { userId: userId.toString() } });
      customerId = customer.id;
      await Subscription.findByIdAndUpdate(subDoc._id, { stripeCustomerId: customerId });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountMinor,
      currency: stripeCurrency,
      customer: customerId,
      metadata: { userId: userId.toString(), planId, currency: chargeCurrency },
      automatic_payment_methods: { enabled: true },
    });

    await Payment.create({
      userId,
      subscriptionId: subDoc._id,
      stripePaymentIntentId: paymentIntent.id,
      amount: amountMajor,
      amountMinor,
      currency: chargeCurrency,
      plan: planId,
      status: 'pending',
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountMajor,
      currency: chargeCurrency,
      symbol: currencyInfo.symbol,
    });
  } catch (e) {
    handleControllerError(res, e, 'Create payment intent');
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const stripe = requireStripe(res);
    if (!stripe) return;

    const { paymentIntentId, sessionId } = req.body;
    const userId = req.user._id;

    let planId;
    let customerId;
    let stripeSubscriptionId;
    let chargeCurrency;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
        return res.status(400).json({ message: 'Payment not completed' });
      }
      planId = session.metadata?.planId;
      customerId = session.customer;
      stripeSubscriptionId = session.subscription || undefined;
      chargeCurrency = (session.metadata?.currency || session.currency || 'USD').toUpperCase();
    } else if (paymentIntentId) {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== 'succeeded') return res.status(400).json({ message: 'Payment not successful' });

      planId = paymentIntent.metadata?.planId;
      customerId = paymentIntent.customer;
      chargeCurrency = (paymentIntent.metadata?.currency || paymentIntent.currency || 'USD').toUpperCase();

      await Payment.findOneAndUpdate(
        { stripePaymentIntentId: paymentIntentId },
        { status: 'succeeded', stripeChargeId: paymentIntent.latest_charge }
      );
    } else {
      return res.status(400).json({ message: 'Payment ID required' });
    }

    if (!planId || !['monthly', 'yearly'].includes(planId)) {
      return res.status(400).json({ message: 'Invalid plan in payment metadata' });
    }

    const stripePeriod = await getStripePeriodFromSubscriptionId(stripeSubscriptionId, stripe);
    const localPeriod = computeLocalPeriod(planId);

    const startDate = stripePeriod?.startDate || localPeriod.startDate;
    const endDate = stripePeriod?.endDate || localPeriod.endDate;

    const subscription = await Subscription.findOneAndUpdate(
      { userId },
      {
        plan: planId,
        status: 'active',
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscriptionId || undefined,
        startDate,
        endDate,
        autoRenew: Boolean(stripeSubscriptionId), // true only for real Stripe subscriptions
        currency: chargeCurrency || 'USD',
        features: getPremiumFeatures(planId),
      },
      { upsert: true, new: true }
    );

    await User.findByIdAndUpdate(userId, {
      isPremium: true,
      premiumExpiry: endDate,
      subscriptionId: subscription._id,
      'subscription.plan': planId,
      'subscription.startDate': startDate,
      'subscription.endDate': endDate,
      'subscription.isActive': true,
    });

    res.json({ message: 'Subscription activated', subscription: { ...subscription.toObject(), isActive: true } });
  } catch (e) {
    handleControllerError(res, e, 'Verify payment');
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { reason } = req.body;

    const subscription = await Subscription.findOne({ userId });
    if (!subscription || subscription.plan === 'free') return res.status(400).json({ message: 'No active subscription' });

    // Only call Stripe if we have a Stripe subscription id and stripe is configured
    const stripe = getStripeClient();
    if (subscription.stripeSubscriptionId && stripe) {
      try {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true });
      } catch (stripeError) {
        console.error('Stripe cancel error:', stripeError?.message);
      }
    }

    subscription.status = 'active'; // keep access until endDate
    subscription.cancelledAt = new Date();
    subscription.autoRenew = false;
    await subscription.save();

    if (reason) console.log(`Subscription cancelled for user ${userId}: ${reason}`);

    await User.findByIdAndUpdate(userId, {
      premiumExpiry: subscription.endDate || undefined,
      'subscription.isActive': subscription.isActive(),
    });

    res.json({ message: 'Subscription cancelled. Access continues until end of billing period.', subscription });
  } catch (e) {
    handleControllerError(res, e, 'Cancel subscription');
  }
};

export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const pageNum = Math.max(1, parseInt(req.query.page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));

    const total = await Payment.countDocuments({ userId, status: 'succeeded' });
    const payments = await Payment.find({ userId, status: 'succeeded' })
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean();

    res.json({ payments, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } });
  } catch (e) {
    handleControllerError(res, e, 'Get payment history');
  }
};

export const checkFeatureAccess = async (req, res) => {
  try {
    const { feature } = req.params;
    const userId = req.user._id;

    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return res.json({ hasAccess: false, plan: 'free' });

    const isActive = subscription.isActive();
    const hasFeature = subscription.features?.[feature] || false;

    res.json({ hasAccess: isActive && hasFeature, plan: subscription.plan, isActive });
  } catch (e) {
    handleControllerError(res, e, 'Check feature access');
  }
};

export const handleWebhook = async (req, res) => {
  const stripe = getStripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).json({ error: 'STRIPE_WEBHOOK_SECRET not configured' });

  let event;
  try {
    if (!req.rawBody) return res.status(400).json({ error: 'Missing raw body for webhook verification' });
    event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const planId = session.metadata?.planId;
        const currency = (session.metadata?.currency || session.currency || 'USD').toUpperCase();

        if (userId && planId) {
          const stripeSubscriptionId = session.subscription || undefined;
          const stripePeriod = await getStripePeriodFromSubscriptionId(stripeSubscriptionId, stripe);
          const localPeriod = computeLocalPeriod(planId);

          const startDate = stripePeriod?.startDate || localPeriod.startDate;
          const endDate = stripePeriod?.endDate || localPeriod.endDate;

          const sub = await Subscription.findOneAndUpdate(
            { userId },
            {
              plan: planId,
              status: 'active',
              stripeCustomerId: session.customer,
              stripeSubscriptionId,
              startDate,
              endDate,
              autoRenew: true,
              currency,
              features: getPremiumFeatures(planId),
            },
            { upsert: true, new: true }
          );

          await User.findByIdAndUpdate(userId, {
            isPremium: true,
            premiumExpiry: endDate,
            subscriptionId: sub._id,
            'subscription.isActive': true,
            'subscription.plan': planId,
            'subscription.startDate': startDate,
            'subscription.endDate': endDate,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const s = event.data.object; // Stripe subscription
        const customerId = s.customer;

        const sub = await Subscription.findOne({ stripeCustomerId: customerId });
        if (sub) {
          sub.autoRenew = !s.cancel_at_period_end;
          if (s.cancel_at_period_end && !sub.cancelledAt) sub.cancelledAt = new Date();

          // Keep local endDate aligned to Stripe period end
          if (s.current_period_end) sub.endDate = new Date(s.current_period_end * 1000);

          // map some statuses
          if (s.status === 'past_due') sub.status = 'past_due';
          if (s.status === 'canceled') sub.status = 'cancelled';
          if (s.status === 'active' || s.status === 'trialing') sub.status = 'active';

          await sub.save();
          await User.findByIdAndUpdate(sub.userId, {
            premiumExpiry: sub.endDate || undefined,
            'subscription.isActive': sub.isActive(),
            'subscription.endDate': sub.endDate || undefined,
          });
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (subscription) {
          const line = invoice.lines?.data?.[0];
          const endDate = line?.period?.end ? new Date(line.period.end * 1000) : subscription.endDate;

          if (endDate) subscription.endDate = endDate;
          subscription.status = 'active';
          subscription.currency = String(invoice.currency || subscription.currency || 'USD').toUpperCase();
          subscription.features = getPremiumFeatures(subscription.plan);
          await subscription.save();

          await User.findByIdAndUpdate(subscription.userId, {
            isPremium: true,
            premiumExpiry: subscription.endDate || undefined,
            'subscription.isActive': true,
            'subscription.plan': subscription.plan,
            'subscription.endDate': subscription.endDate || undefined,
          });

          const currency = String(invoice.currency || 'USD').toUpperCase();
          const amountMajor = toMajorUnits(invoice.amount_paid, currency);

          await Payment.create({
            userId: subscription.userId,
            subscriptionId: subscription._id,
            stripeInvoiceId: invoice.id,
            stripeChargeId: invoice.charge,
            amount: amountMajor,
            amountMinor: invoice.amount_paid,
            currency,
            plan: subscription.plan,
            status: 'succeeded',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const sub = await Subscription.findOneAndUpdate(
          { stripeCustomerId: customerId },
          { status: 'past_due' },
          { new: true }
        );

        if (sub) {
          await User.findByIdAndUpdate(sub.userId, { 'subscription.isActive': false });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object;
        const customerId = stripeSub.customer;

        const subscription = await Subscription.findOne({ stripeCustomerId: customerId });
        if (subscription) {
          subscription.plan = 'free';
          subscription.status = 'cancelled';
          subscription.features = FREE_FEATURES;
          subscription.autoRenew = false;
          await subscription.save();

          await User.findByIdAndUpdate(subscription.userId, {
            isPremium: false,
            premiumExpiry: null,
            'subscription.isActive': false,
            'subscription.plan': 'free',
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error('Webhook handler error:', e.message);
  }

  res.json({ received: true });
};