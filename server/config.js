/* ═══ Server Config ═══ */
import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/aff_video',
  appSecret: process.env.APP_SECRET || 'default-dev-secret-change-me',
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:4173'],
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  rateLimit: {
    windowMs: 60 * 1000,  // 1 minute
    max: 10,              // 10 requests per window
  },
  maxImageSize: 4 * 1024 * 1024,  // 4MB per image
  maxImageDimension: 1024,         // resize to max 1024px
};

// Validate
if (config.appSecret === 'default-dev-secret-change-me') {
  console.warn('⚠️  WARNING: Using default APP_SECRET. Set a strong secret in .env for production!');
}

export default config;
