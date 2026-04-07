/* ═══ Session CRUD ═══
   POST /api/session → Create session
   GET  /api/session → Get session
   DELETE /api/session → Delete session
*/
import { connectDB } from '../../lib/db.js';
import { handleCors, setCorsHeaders } from '../../lib/auth.js';
import Session from '../../lib/models/Session.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  await connectDB();

  // ─── POST: Create Session ───
  if (req.method === 'POST') {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const session = await Session.create({ token });
      res.setHeader('x-session-token', token);
      res.status(200).json({ token: session.token, session: sanitize(session) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ─── GET: Get Session ───
  if (req.method === 'GET') {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: 'No session token' });

      const session = await Session.findOne({ token });
      if (!session) return res.status(404).json({ error: 'Session not found' });

      session.lastActiveAt = new Date();
      await session.save();

      res.status(200).json({ session: sanitize(session) });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ─── DELETE: Delete Session ───
  if (req.method === 'DELETE') {
    try {
      const token = req.headers['x-session-token'];
      if (!token) return res.status(401).json({ error: 'No session token' });

      await Session.deleteOne({ token });
      res.status(200).json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

// Strip sensitive data before sending to client
function sanitize(session) {
  const obj = session.toObject ? session.toObject() : { ...session };
  delete obj.apiKeyEncrypted;
  delete obj.__v;
  if (obj.images?.length) {
    obj.images = obj.images.map(img => ({
      mimeType: img.mimeType,
      name: img.name,
      hasData: !!img.data,
    }));
  }
  if (obj.portraitImage) {
    obj.portraitImage = { hasData: !!obj.portraitImage.data, mimeType: obj.portraitImage.mimeType };
  }
  return obj;
}
