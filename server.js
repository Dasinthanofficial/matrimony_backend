// ===== FILE: ./server.js =====

// 🔴 CRITICAL: Must be FIRST import — loads .env before ANY other module runs
import 'dotenv/config';

// 🔴 Catch ALL silent crashes — add before everything else
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection] at:', promise, 'reason:', reason);
  process.exit(1);
});

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import errorHandler from './middleware/errorHandler.js';
import socketHandler from './socket/socketHandler.js';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import searchRoutes from './routes/searchRoutes.js';
import interestRoutes from './routes/interestRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import payhereRoutes from './routes/payhereRoutes.js';
import planRoutes from './routes/planRoutes.js';

import agencyMarketplaceRoutes from './routes/agencyMarketplaceRoutes.js';
import marketplacePaymentRoutes from './routes/marketplacePaymentRoutes.js';
import adminFinanceRoutes from './routes/adminFinanceRoutes.js';

import agencyReviewRoutes from './routes/agencyReviewRoutes.js';
import agencyReputationRoutes from './routes/agencyReputationRoutes.js';
import adminAgencyLevelRoutes from './routes/adminAgencyLevelRoutes.js';
import adminVerifiedBadgeRoutes from './routes/adminVerifiedBadgeRoutes.js';
import adminAgencyReviewRoutes from './routes/adminAgencyReviewRoutes.js';
import agencyEntitlementPaymentRoutes from './routes/agencyEntitlementPaymentRoutes.js';

import agencyOrderRoutes from './routes/agencyOrderRoutes.js';
import marriageSuccessRoutes from './routes/marriageSuccessRoutes.js';
import agencyRoutes from './routes/agencyRoutes.js';
import userRoutes from './routes/userRoutes.js';
import agencyFeedbackRoutes from './routes/agencyFeedbackRoutes.js';
import agencyPublicRoutes from './routes/agencyPublicRoutes.js';

import { startPayoutProcessor } from './jobs/payoutProcessor.js';

// ===== ENV VALIDATION =====
// 🔴 Fail fast with a clear message if required env vars are missing
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  
].filter(Boolean);

const io = new Server(httpServer, {
  cors: { origin: allowedOrigins, credentials: true },
});

const socketInstance = socketHandler(io);
app.set('io', io);
app.set('socketInstance', socketInstance);

// ===== MIDDLEWARE =====
app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use('/uploads', express.static('uploads'));
app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      if (
        req.originalUrl?.startsWith('/api/subscriptions/webhook') ||
        req.originalUrl?.startsWith('/api/payments/webhook')
      ) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

if (process.env.NODE_ENV === 'production') {
  app.use('/api', apiLimiter);
}

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// ===== HEALTH CHECK =====
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ===== ROUTES =====
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/interests', interestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/subscriptions', subscriptionRoutes);

app.use('/api/payments', paymentRoutes);
app.use('/api/payments', marketplacePaymentRoutes);
app.use('/api/payments/payhere', payhereRoutes);
app.use('/api/payments/agency', agencyEntitlementPaymentRoutes);

app.use('/api/plans', planRoutes);

app.use('/api/agency/:agencyId/reviews', agencyReviewRoutes);
app.use('/api/agency/:agencyId/reputation', agencyReputationRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/admin/finance', adminFinanceRoutes);
app.use('/api/admin/agency-levels', adminAgencyLevelRoutes);
app.use('/api/admin/verified-badge', adminVerifiedBadgeRoutes);
app.use('/api/admin/agency-reviews', adminAgencyReviewRoutes);

app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/agency-orders', agencyOrderRoutes);
app.use('/api/marriage-success', marriageSuccessRoutes);

app.use('/api/agency', agencyMarketplaceRoutes);
app.use('/api/agency', agencyRoutes);

app.use('/api/users', userRoutes);

app.use('/api', agencyFeedbackRoutes);
app.use('/api', agencyPublicRoutes);

// ===== 404 =====
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

// ===== ERROR HANDLER =====
app.use(errorHandler);

// ===== DATABASE + SERVER START =====
const PORT = Number(process.env.PORT) || 10000; // Render injects PORT
const MONGODB_URI = process.env.MONGODB_URI;

mongoose.set('strictQuery', false);

let stopPayoutProcessor = null;

mongoose
  .connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000, // fail fast if Mongo is unreachable
  })
  .then(() => {
    console.log('MongoDB connected successfully');

    stopPayoutProcessor = startPayoutProcessor({ intervalMs: 10 * 60 * 1000 });

    // 🔴 '0.0.0.0' required for Render — listens on all interfaces
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  });

// ===== GRACEFUL SHUTDOWN =====
const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);

  stopPayoutProcessor?.();
  socketInstance?.cleanup?.();

  httpServer.close(async () => {
    try {
      await mongoose.connection.close();
      console.log('Server closed cleanly.');
    } catch (e) {
      console.error('Error closing MongoDB:', e.message);
    }
    process.exit(0);
  });

  // force kill after 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
export default app;