const API = '/api';

/** When true: staff login and OTP are frontend-only; no backend/DB used. */
export const DEMO_ONLY = false;
export const DEMO_STAFF_TOKEN = 'demo-staff-token';
export const DEMO_GUEST_TOKEN = 'demo-guest-token';

/**
 * Safely parse a Response body as JSON.
 * Avoids "Unexpected end of JSON input" when backend is down or returns empty/non-JSON.
 */
export async function parseJson(res) {
  const text = await res.text();
  if (!text || !text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Request OTP. In DEMO_ONLY: no API call; any code will work at verify. */
export async function sendOtp(email) {
  if (DEMO_ONLY) return { success: true };
  try {
    const res = await fetch(`${API}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
    return { success: true };
  } catch (err) {
    throw new Error(err.message || 'Failed to send OTP');
  }
}

/** Verify OTP. In DEMO_ONLY: any code works; sets demo guest token. */
export async function verifyOtp(email, code) {
  if (DEMO_ONLY) {
    if (!email?.trim()) throw new Error('Email is required');
    if (!String(code ?? '').trim()) throw new Error('Please enter the code.');
    setPatientVerified(email.trim());
    setGuestToken(DEMO_GUEST_TOKEN);
    return { verified: true, guest_token: DEMO_GUEST_TOKEN };
  }
  const body = { email: email.trim(), code: String(code).trim() };
  const res = await fetch(`${API}/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Invalid OTP');
  if (data.guest_token) setGuestToken(data.guest_token);
  return { verified: true, guest_token: data.guest_token };
}

const PATIENT_VERIFIED_KEY = 'bright_patient_verified';
const GUEST_TOKEN_KEY = 'bright_guest_token';

export function getGuestToken() {
  try {
    return sessionStorage.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGuestToken(token) {
  try {
    if (token) sessionStorage.setItem(GUEST_TOKEN_KEY, token);
    else sessionStorage.removeItem(GUEST_TOKEN_KEY);
  } catch (_) {}
}

export function clearGuestToken() {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_KEY);
  } catch (_) {}
}

export function getPatientVerified() {
  try {
    const raw = sessionStorage.getItem(PATIENT_VERIFIED_KEY);
    if (!raw) return null;
    const { email, verifiedAt } = JSON.parse(raw);
    if (verifiedAt && Date.now() - verifiedAt > 24 * 60 * 60 * 1000) return null;
    return email;
  } catch {
    return null;
  }
}

export function setPatientVerified(email) {
  try {
    sessionStorage.setItem(PATIENT_VERIFIED_KEY, JSON.stringify({
      email,
      verifiedAt: Date.now(),
    }));
  } catch (_) {}
}

export function clearPatientVerified() {
  try {
    sessionStorage.removeItem(PATIENT_VERIFIED_KEY);
  } catch (_) {}
}
