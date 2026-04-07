/* ═══ Rate Limiter ═══ */
import config from '../config.js';

const requests = new Map(); // token -> [{timestamp}]

export function rateLimitMiddleware(req, res, next) {
  // Only rate limit heavy endpoints
  if (!req.path.startsWith('/api/generate')) return next();

  const token = req.headers['x-session-token'] || req.ip;
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  const max = config.rateLimit.max;

  if (!requests.has(token)) {
    requests.set(token, []);
  }

  const entries = requests.get(token).filter(t => now - t < windowMs);
  entries.push(now);
  requests.set(token, entries);

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', max);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entries.length));
  res.setHeader('X-RateLimit-Reset', Math.ceil((entries[0] + windowMs) / 1000));

  if (entries.length > max) {
    return res.status(429).json({
      error: 'Quá nhiều yêu cầu. Vui lòng đợi 1 phút.',
      retryAfter: Math.ceil(windowMs / 1000),
    });
  }

  next();
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entries] of requests) {
    const filtered = entries.filter(t => now - t < 120000);
    if (filtered.length === 0) requests.delete(key);
    else requests.set(key, filtered);
  }
}, 60000);
