/* ═══════════════════════════════════════════
   AFF Video — Express Backend Server
   ═══════════════════════════════════════════ */
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import helmet from 'helmet';
import config from './config.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/errorHandler.js';
import sessionRoutes from './routes/session.js';
import apiRoutes from './routes/api.js';

const app = express();

// ─── Security ───
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  exposedHeaders: ['x-session-token'],
}));

// ─── Body Parser (50MB for base64 images) ───
app.use(express.json({ limit: '50mb' }));

// ─── Health Check ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});

// ─── Middleware ───
app.use('/api', authMiddleware);
app.use('/api', rateLimitMiddleware);

// ─── Routes ───
app.use('/api/session', sessionRoutes);
app.use('/api', apiRoutes);

// ─── Error Handler ───
app.use(errorHandler);

// ─── Start ───
async function start() {
  try {
    // Connect MongoDB
    console.log(`📦 Connecting to MongoDB: ${config.mongoUri}`);
    await mongoose.connect(config.mongoUri);
    console.log('✅ MongoDB connected');

    // Start server
    app.listen(config.port, () => {
      console.log(`\n🚀 AFF Video Backend running on http://localhost:${config.port}`);
      console.log(`   Health: http://localhost:${config.port}/api/health`);
      console.log(`   CORS:   ${config.corsOrigins.join(', ')}\n`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

start();
