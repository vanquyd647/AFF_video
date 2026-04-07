/* ═══ Auth Middleware ═══ */
import { getSession, createSession } from '../services/sessionManager.js';

export async function authMiddleware(req, res, next) {
  try {
    let token = req.headers['x-session-token'];

    if (token) {
      const session = await getSession(token);
      if (session) {
        req.session = session;
        return next();
      }
    }

    // No valid session — create one if it's a session creation request
    if (req.path === '/api/session' && req.method === 'POST') {
      return next();
    }

    // For other routes, auto-create session
    const newSession = await createSession();
    req.session = newSession;
    res.setHeader('x-session-token', newSession.token);
    next();
  } catch (err) {
    next(err);
  }
}
