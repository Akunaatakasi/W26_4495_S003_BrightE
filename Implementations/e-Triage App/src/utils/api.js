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
  if (DEMO_ONLY) return { success: true, emailDelivered: true };
  try {
    const res = await fetch(`${API}/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
    return { success: true, emailDelivered: Boolean(data.emailDelivered) };
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
const GUEST_ACTIVE_CASE_KEY = 'bright_guest_active_case';
const PATIENT_TRACKING_CASE_KEY = 'bright_patient_tracking_case';
/** Email last used for POST /otp/send; keeps verify in sync if React state is lost (e.g. refresh). */
const OTP_PENDING_EMAIL_KEY = 'bright_otp_pending_email';

/** Session-scoped: cleared when the tab/window is closed (refresh in the same tab keeps data). */
const SS = typeof sessionStorage !== 'undefined' ? sessionStorage : null;

export function setGuestActiveCase(payload) {
  try {
    if (payload && SS) SS.setItem(GUEST_ACTIVE_CASE_KEY, JSON.stringify(payload));
    else if (SS) SS.removeItem(GUEST_ACTIVE_CASE_KEY);
  } catch (_) {}
}

export function getGuestActiveCase() {
  try {
    const raw = SS?.getItem(GUEST_ACTIVE_CASE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearGuestActiveCase() {
  try {
    SS?.removeItem(GUEST_ACTIVE_CASE_KEY);
  } catch (_) {}
}

export function getGuestCaseAccessToken() {
  const s = getGuestActiveCase();
  return s?.caseAccessToken || null;
}

export function setPatientTrackingCase(payload) {
  try {
    if (payload?.caseId != null && SS) {
      SS.setItem(PATIENT_TRACKING_CASE_KEY, JSON.stringify(payload));
    } else if (SS) SS.removeItem(PATIENT_TRACKING_CASE_KEY);
  } catch (_) {}
}

export function getPatientTrackingCase() {
  try {
    const raw = SS?.getItem(PATIENT_TRACKING_CASE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPatientTrackingCase() {
  try {
    SS?.removeItem(PATIENT_TRACKING_CASE_KEY);
  } catch (_) {}
}

export async function fetchGuestCase(caseAccessToken) {
  const res = await fetch(`${API}/triage/guest-case`, {
    headers: { Authorization: `Bearer ${caseAccessToken}` },
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Failed to load your triage request');
  return data;
}

/** Guest only: withdraw or resolve (same clinical rules as patient dashboard). */
export async function guestCaseAction(caseAccessToken, action) {
  const res = await fetch(`${API}/triage/guest-case/action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caseAccessToken}`,
    },
    body: JSON.stringify({ action }),
  });
  const data = await parseJson(res);
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function setOtpPendingEmail(email) {
  try {
    if (email?.trim()) SS?.setItem(OTP_PENDING_EMAIL_KEY, email.trim());
    else SS?.removeItem(OTP_PENDING_EMAIL_KEY);
  } catch (_) {}
}

export function getOtpPendingEmail() {
  try {
    return SS?.getItem(OTP_PENDING_EMAIL_KEY) || '';
  } catch {
    return '';
  }
}

export function clearOtpPendingEmail() {
  try {
    SS?.removeItem(OTP_PENDING_EMAIL_KEY);
  } catch (_) {}
}

export function getGuestToken() {
  try {
    return SS?.getItem(GUEST_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setGuestToken(token) {
  try {
    if (token) SS?.setItem(GUEST_TOKEN_KEY, token);
    else SS?.removeItem(GUEST_TOKEN_KEY);
  } catch (_) {}
}

export function clearGuestToken() {
  try {
    SS?.removeItem(GUEST_TOKEN_KEY);
  } catch (_) {}
}

export function getPatientVerified() {
  try {
    const raw = SS?.getItem(PATIENT_VERIFIED_KEY);
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
    SS?.setItem(PATIENT_VERIFIED_KEY, JSON.stringify({
      email,
      verifiedAt: Date.now(),
    }));
  } catch (_) {}
}

export function clearPatientVerified() {
  try {
    SS?.removeItem(PATIENT_VERIFIED_KEY);
  } catch (_) {}
}
