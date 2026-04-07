/* ═══ Save Result ═══
   PUT /api/session/result
*/
import { connectDB } from '../lib/db.js';
import { authenticateRequest, handleCors, setCorsHeaders } from '../lib/auth.js';
import Session from '../lib/models/Session.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const session = await authenticateRequest(req, res);
    const { result, step } = req.body;

    await Session.findOneAndUpdate(
      { token: session.token },
      { result, step, lastActiveAt: new Date() },
      { new: true }
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
