import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { logAudit } from '../db/audit.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';

router.post('/register', async (req, res) => {
  try {
    const { email, password, role = 'patient', full_name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, $3, $4)
       RETURNING id, email, role, full_name, created_at`,
      [email, hash, ['nurse', 'doctor'].includes(role) ? role : 'patient', full_name || null]
    );
    const user = rows[0];
    await logAudit({ userId: user.id, action: 'user_register', resourceType: 'user', resourceId: user.id, details: { role: user.role } });
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name }, token });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const { rows } = await pool.query('SELECT id, email, password_hash, role, full_name FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    await logAudit({ userId: user.id, action: 'user_login', resourceType: 'user', resourceId: user.id });
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name }, token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, role, full_name FROM users WHERE id = $1', [req.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as authRouter };
