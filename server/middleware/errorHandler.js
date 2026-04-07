/* ═══ Error Handler ═══ */

export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: err.message });
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Dữ liệu trùng lặp' });
  }

  // API errors
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }

  // Default
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Lỗi server' : err.message,
  });
}
