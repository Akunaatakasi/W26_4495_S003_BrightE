import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';
const OTPS = new Map(); // email (lowercase) -> { code, expiresAt }
const TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
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
  const code = generateCode();
  OTPS.set(key, { code, expiresAt: Date.now() + TTL_MS });
  // In production, send email here (e.g. nodemailer, SendGrid). For now log to console.
  console.log(`[OTP] ${email} → ${code} (valid 10 min)`);
  return res.json({ success: true });
});

router.post('/verify', (req, res) => {
  const email = req.body?.email?.trim();
  const code = req.body?.code?.trim();
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }
  const key = email.toLowerCase();
  const entry = OTPS.get(key);
  if (!entry) {
    return res.status(400).json({ error: 'No OTP found for this email. Request a new one.' });
  }
  if (Date.now() > entry.expiresAt) {
    OTPS.delete(key);
    return res.status(400).json({ error: 'OTP expired. Request a new one.' });
  }
  if (entry.code !== code) {
    return res.status(400).json({ error: 'Invalid OTP.' });
  }
  OTPS.delete(key);
  const guest_token = jwt.sign({ email: key, purpose: 'guest_triage' }, JWT_SECRET, { expiresIn: '5m' });
  return res.json({ verified: true, guest_token });
});

export const otpRouter = router;
