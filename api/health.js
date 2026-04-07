/* ═══ Health Check ═══ */
import { connectDB } from './lib/db.js';
import { handleCors, setCorsHeaders } from './lib/auth.js';
import mongoose from 'mongoose';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  try {
    await connectDB();
    res.status(200).json({
      status: 'ok',
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      environment: 'vercel-serverless',
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      mongodb: 'disconnected',
      error: err.message,
    });
  }
}
