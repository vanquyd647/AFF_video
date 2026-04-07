/* ═══ Serverless Config ═══ */

const config = {
  appSecret: process.env.APP_SECRET || 'default-dev-secret-change-me',
  sessionTtlDays: parseInt(process.env.SESSION_TTL_DAYS || '7', 10),
  geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  maxImageSize: 4 * 1024 * 1024,  // 4MB per image
  maxImageDimension: 1024,         // resize to max 1024px
};

export default config;
