/* ═══ History List ═══
   GET /api/history
*/
import { connectDB } from '../../lib/db.js';
import { authenticateRequest, handleCors, setCorsHeaders } from '../../lib/auth.js';
import History from '../../lib/models/History.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  setCorsHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const session = await authenticateRequest(req, res);

    const history = await History.find({ sessionToken: session.token })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-result.frames -result.clips')
      .lean();

    res.status(200).json({ history });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
