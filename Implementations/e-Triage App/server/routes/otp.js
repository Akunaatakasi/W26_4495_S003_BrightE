import { Router } from 'express';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';

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

/** Map SMTP / provider errors to a short message safe to show in the UI. */
function otpSendUserMessage(err) {
  const raw = [err?.message, err?.response].filter(Boolean).join(' ').toLowerCase();
  if (
    raw.includes('verified sender') ||
    raw.includes('sender identity') ||
    (raw.includes('550') && raw.includes('from'))
  ) {
    return (
      'Email could not be sent: your SendGrid (or provider) "from" address is not verified. ' +
      'In SendGrid, verify a Single Sender or Domain under Sender Authentication, then set SMTP_FROM ' +
      'in .env to that exact address and restart the server.'
    );
  }
  if (
    raw.includes('535') ||
    raw.includes('authentication failed') ||
    raw.includes('invalid login') ||
    raw.includes('bad credentials')
  ) {
    return 'SMTP login failed. Check SMTP_USER and SMTP_PASS (SendGrid: user must be "apikey", pass must be your API key).';
  }
  if (raw.includes('sandbox') && raw.includes('authorize')) {
    return 'SendGrid is in sandbox mode: add the recipient as a verified recipient in SendGrid, or disable sandbox.';
  }
  return 'Failed to send verification email. Check SMTP settings, your address, or try again later.';
}

function createMailer() {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? '';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
  });
}

/**
 * @returns {Promise<{ delivered: boolean }>}
 */
async function sendOtpEmail(to, code) {
  const transporter = createMailer();
  if (!transporter) {
    console.warn(`[otp] SMTP_HOST not set; OTP for ${to}: ${code} (add SMTP_* to .env to send real email)`);
    return { delivered: false };
  }
  const fromAddr = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!fromAddr) {
    throw new Error('SMTP_FROM or SMTP_USER is required when SMTP is configured');
  }
  const fromName = process.env.SMTP_FROM_NAME?.trim();
  const from = fromName ? `"${fromName.replace(/"/g, '')}" <${fromAddr}>` : fromAddr;
  const info = await transporter.sendMail({
    from,
    to,
    subject: 'Your e-Triage verification code',
    text: `Your one-time code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this message.`,
    html: `<p>Your one-time code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p><p>If you did not request this, you can ignore this message.</p>`,
  });
  const mid = info?.messageId || info?.response;
  console.log(`[otp] SMTP accepted: to=${to} from=${fromAddr} messageId=${mid || 'n/a'}`);
  if (process.env.OTP_DEBUG_LOG === 'true') {
    console.warn(`[otp] OTP_DEBUG_LOG: code for ${to} is ${code} (disable OTP_DEBUG_LOG in production)`);
  }
  return { delivered: true };
}

router.post('/send', async (req, res) => {
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

  try {
    const { delivered } = await sendOtpEmail(email, code);
    return res.json({ success: true, emailDelivered: delivered });
  } catch (err) {
    console.error('[otp] email send failed:', err?.message || err);
    OTPS.delete(key);
    return res.status(500).json({ error: otpSendUserMessage(err) });
  }
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
  if (!entry) {
    return res.status(400).json({
      error:
        'No active code for this email. Use the same address you typed for "Send OTP", or the server may have restarted—in that case send a new code and use only the latest email.',
    });
  }
  if (Date.now() > entry.expiresAt) {
    OTPS.delete(key);
    return res.status(400).json({
      error: 'This code has expired. Send a new OTP and enter the code from the newest email.',
    });
  }
  if (entry.code !== code) {
    return res.status(400).json({
      error:
        'That code does not match. If you clicked "Send OTP" more than once, only the newest message is valid—use that code or send again.',
    });
  }
  OTPS.delete(key);
  const guest_token = jwt.sign({ email: key, purpose: 'guest_triage' }, JWT_SECRET, { expiresIn: '5m' });
  return res.json({ verified: true, guest_token });
});

export const otpRouter = router;
