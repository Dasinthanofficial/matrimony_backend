// ===== FIXED FILE: ./server.js =====
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
});

const socketInstance = socketHandler(io);
app.set('io', io);
app.set('socketInstance', socketInstance);

app.use(helmet());
app.use(cors({ origin: [process.env.CLIENT_URL || 'http://localhost:5173', 'https://matrimony-frontend-snowy.vercel.app'], credentials: true }));

app.use('/uploads', express.static('uploads'));

app.use(
  express.json({
    limit: '10mb',
    verify: (req, _res, buf) => {
      if (req.originalUrl && req.originalUrl.startsWith('/api/subscriptions/webhook')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

const isDev = process.env.NODE_ENV !== 'production';
if (!isDev) app.use('/api', apiLimiter);

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/interests', interestRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.path} not found` });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const MONGODB_URI =
  process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/matrimony';

mongoose.set('strictQuery', false);

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected successfully');
    httpServer.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✅ Client URL: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
    });
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// ✅ FIX: Single shutdown handler — no double cleanup
const shutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  socketInstance?.cleanup?.();
  httpServer.close(async () => {
    try {
      // ✅ FIX: Use promise-based close for Mongoose 8.x
      await mongoose.connection.close();
      console.log('Server closed.');
    } catch (e) {
      console.error('Error closing MongoDB connection:', e.message);
    }
    process.exit(0);
  });

  // Force exit after 10s if graceful fails
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { io };
export default app;