/* ═══ API Key Management ═══
   POST /api/session/apikey → Save API key (encrypted)
   GET  /api/session/apikey → Check if API key exists
*/
import { connectDB } from '../../lib/db.js';
import { authenticateRequest, handleCors, setCorsHeaders } from '../../lib/auth.js';
import { encryptApiKey, validateApiKey } from '../../lib/gemini.js';
import Session from '../../lib/models/Session.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  await connectDB();
  const session = await authenticateRequest(req, res);

  // ─── POST: Save API Key ───
  if (req.method === 'POST') {
    try {
      const { apiKey } = req.body;
      if (!apiKey) return res.status(400).json({ error: 'API key required' });

      // Validate first
      const validation = await validateApiKey(apiKey);
      if (!validation.valid) {
        return res.status(401).json({ error: 'API key không hợp lệ', details: validation.error });
      }

      // Encrypt and save
      const encrypted = encryptApiKey(apiKey);
      await Session.findOneAndUpdate(
        { token: session.token },
        { apiKeyEncrypted: encrypted, lastActiveAt: new Date() }
      );

      res.status(200).json({ valid: true, message: 'API key saved securely' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
    return;
  }

  // ─── GET: Check API Key ───
  if (req.method === 'GET') {
    const hasKey = !!session?.apiKeyEncrypted;
    res.status(200).json({ hasKey });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
