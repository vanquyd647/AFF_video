/* ═══ Save Settings ═══
   PUT /api/session/settings
*/
import { connectDB } from '../../lib/db.js';
import { authenticateRequest, handleCors, setCorsHeaders } from '../../lib/auth.js';
import Session from '../../lib/models/Session.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const session = await authenticateRequest(req, res);

    const updated = await Session.findOneAndUpdate(
      { token: session.token },
      { settings: req.body, lastActiveAt: new Date() },
      { new: true }
    );

    // Sanitize
    const obj = updated.toObject();
    delete obj.apiKeyEncrypted;
    delete obj.__v;

    res.status(200).json({ session: obj });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
