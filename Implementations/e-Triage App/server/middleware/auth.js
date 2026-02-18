import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

export async function attachUser(req, res, next) {
  if (!req.userId) return next();
  try {
    const { rows } = await pool.query(
      'SELECT id, email, role, full_name FROM users WHERE id = $1',
      [req.userId]
    );
    req.user = rows[0] || null;
  } catch (_) {}
  next();
}
