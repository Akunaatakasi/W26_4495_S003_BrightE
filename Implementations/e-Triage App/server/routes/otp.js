import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';
const OTPS = new Map(); // email (lowercase) -> { code, expiresAt }
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateOtp() {
  // 8-digit numeric code to match existing UI example format (e.g. 05080307)
  const min = 10_000_000;
  const max = 99_999_999;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
}

router.post('/send', (req, res) => {
  const email = req.body?.email?.trim();
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }
  const key = email.toLowerCase();
  const code = generateOtp();
  OTPS.set(key, { code, expiresAt: Date.now() + TTL_MS });
  return res.json({ success: true, code });
});

router.post('/verify', (req, res) => {
  const email = req.body?.email?.trim();
  const codeRaw = req.body?.code ?? req.body?.otp;
  const code = (typeof codeRaw === 'string' ? codeRaw.trim() : codeRaw != null ? String(codeRaw) : '').replace(/\D/g, '');
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }
  const key = email.toLowerCase();
  const entry = OTPS.get(key);
  const valid = entry && Date.now() <= entry.expiresAt && entry.code === code;
  if (!valid) {
    if (entry && Date.now() > entry.expiresAt) OTPS.delete(key);
    return res.status(400).json({ error: 'Invalid OTP.' });
  }
  if (entry) OTPS.delete(key);
  const guest_token = jwt.sign({ email: key, purpose: 'guest_triage' }, JWT_SECRET, { expiresIn: '5m' });
  return res.json({ verified: true, guest_token });
});

export const otpRouter = router;
