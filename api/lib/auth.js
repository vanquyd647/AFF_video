/* ═══ Auth Helper for Serverless ═══ */
import { connectDB } from './db.js';
import Session from './models/Session.js';
import crypto from 'crypto';

/**
 * Authenticate request and return session.
 * If no valid session found, auto-creates one and sets header.
 */
export async function authenticateRequest(req, res) {
  await connectDB();

  const token = req.headers['x-session-token'];

  if (token) {
    const session = await Session.findOne({ token });
    if (session) {
      session.lastActiveAt = new Date();
      await session.save();
      return session;
    }
  }

  // Auto-create session for unauthenticated requests
  const newToken = crypto.randomBytes(32).toString('hex');
  const newSession = await Session.create({ token: newToken });
  res.setHeader('x-session-token', newToken);
  return newSession;
}

/**
 * CORS headers for all API responses
 */
export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-session-token');
  res.setHeader('Access-Control-Expose-Headers', 'x-session-token');
}

/**
 * Handle OPTIONS preflight
 */
export function handleCors(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}
