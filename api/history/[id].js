/* ═══ History Item Detail ═══
   GET /api/history/:id
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

    // Extract id from URL path: /api/history/[id]
    const { id } = req.query;

    const item = await History.findOne({
      _id: id,
      sessionToken: session.token,
    }).lean();

    if (!item) return res.status(404).json({ error: 'Not found' });

    res.status(200).json({ item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
