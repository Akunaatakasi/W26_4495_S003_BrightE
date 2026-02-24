/**
 * Mock API for demo mode (no backend/database).
 * Stores triage cases and audit log in localStorage.
 * Guests (no login) submit with patient_id: 0.
 */
import { computeAutomatedTriageLevel, TRIAGE_LABELS } from './triageLogic';
import { predictPriority, updateFromOverride } from './priorityModel';

const CASES_KEY = 'bright_demo_cases';
const AUDIT_KEY = 'bright_demo_audit';
const QUEUE_ORDER_KEY = 'bright_demo_queue_order';

export function getQueueOrder() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_ORDER_KEY) || '[]');
  } catch {
    return [];
  }
}

export function setQueueOrder(ids) {
  localStorage.setItem(QUEUE_ORDER_KEY, JSON.stringify(ids));
}

function getCases() {
  try {
    return JSON.parse(localStorage.getItem(CASES_KEY) || '[]');
  } catch {
    return [];
  }
}

function setCases(cases) {
  localStorage.setItem(CASES_KEY, JSON.stringify(cases));
}

function getAudit() {
  try {
    return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch {
    return [];
  }
}

function appendAudit(entry) {
  const log = getAudit();
  log.unshift({ ...entry, id: log.length + 1, created_at: new Date().toISOString() });
  localStorage.setItem(AUDIT_KEY, log.length > 200 ? JSON.stringify(log.slice(0, 200)) : JSON.stringify(log));
}

function fakeResponse(data, ok = true) {
  return {
    ok,
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

const DEMO_USERS = {
  0: { id: 0, full_name: 'Guest', email: '—' },
  1: { id: 1, full_name: 'Demo Patient', email: 'patient@demo.com' },
  2: { id: 2, full_name: 'Demo Nurse', email: 'nurse@demo.com' },
  3: { id: 3, full_name: 'Demo Doctor', email: 'doctor@demo.com' },
};

/** Submit triage as guest (no login). Writes to localStorage and returns the new case. */
export function submitTriageAsGuest(payload) {
  const level = computeAutomatedTriageLevel({
    self_reported_urgency: payload.self_reported_urgency ?? 5,
    symptoms: Array.isArray(payload.symptoms) ? payload.symptoms : [],
    chief_complaint: payload.chief_complaint || '',
  });
  const cases = getCases();
  const id = cases.length ? Math.max(...cases.map((x) => x.id)) + 1 : 1;
  const ml = predictPriority({ symptoms: payload.symptoms || [], self_reported_urgency: payload.self_reported_urgency ?? 5, chief_complaint: payload.chief_complaint || '' });
  const newCase = {
    id,
    patient_id: 0,
    demographics: payload.demographics || {},
    chief_complaint: payload.chief_complaint || null,
    symptoms: payload.symptoms || [],
    self_reported_urgency: payload.self_reported_urgency ?? null,
    automated_triage_level: level,
    ml_level: ml.level,
    ml_confidence: ml.confidence,
    final_triage_level: null,
    overridden_by: null,
    overridden_at: null,
    override_reason: null,
    status: 'submitted',
    submitted_at: new Date().toISOString(),
    first_reviewed_at: null,
    completed_at: null,
  };
  cases.push(newCase);
  setCases(cases);
  appendAudit({ user_id: null, action: 'triage_submit', resource_type: 'triage_case', resource_id: id, details: { automated_triage_level: level } });
  return { ...newCase, triage_label: TRIAGE_LABELS[level] };
}

/** Seed demo data when storage is empty. Call this to ensure triage queue has mock data. */
function seedMockData() {
  if (getCases().length > 0) return false;
  const now = () => new Date().toISOString();
  const t = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
  const cases = [
    { id: 1, patient_id: 0, demographics: { age: '34', gender: 'female' }, chief_complaint: 'Chest pain and shortness of breath', symptoms: ['cardiac_chest_pain', 'difficulty_breathing'], self_reported_urgency: 2, automated_triage_level: 2, final_triage_level: 2, overridden_by: 2, overridden_at: now(), override_reason: 'Confirmed high acuity', status: 'completed', submitted_at: t(60), first_reviewed_at: now(), completed_at: now() },
    { id: 2, patient_id: 0, demographics: { age: '28', gender: 'male' }, chief_complaint: 'Severe headache for 2 days', symptoms: ['headache'], self_reported_urgency: 3, automated_triage_level: 3, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(30), first_reviewed_at: null, completed_at: null },
    { id: 3, patient_id: 0, demographics: { age: '5', gender: 'male' }, chief_complaint: 'High fever and cough', symptoms: ['high_fever'], self_reported_urgency: 3, automated_triage_level: 3, final_triage_level: 3, overridden_by: 2, overridden_at: now(), override_reason: null, status: 'completed', submitted_at: t(120), first_reviewed_at: now(), completed_at: now() },
    { id: 4, patient_id: 0, demographics: { age: '52', gender: 'female' }, chief_complaint: 'Cut finger while cooking', symptoms: ['laceration'], self_reported_urgency: 4, automated_triage_level: 4, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(15), first_reviewed_at: null, completed_at: null },
    { id: 5, patient_id: 0, demographics: { age: '67', gender: 'male' }, chief_complaint: 'Unresponsive, family called 911', symptoms: ['unconscious'], self_reported_urgency: 1, automated_triage_level: 1, final_triage_level: 1, overridden_by: 2, overridden_at: now(), override_reason: 'Level 1 confirmed', status: 'completed', submitted_at: t(90), first_reviewed_at: now(), completed_at: now() },
    { id: 6, patient_id: 0, demographics: { age: '41', gender: 'female' }, chief_complaint: 'Abdominal pain and nausea', symptoms: ['abdominal_pain'], self_reported_urgency: 3, automated_triage_level: 3, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(10), first_reviewed_at: null, completed_at: null },
    { id: 7, patient_id: 0, demographics: { age: '22', gender: 'male' }, chief_complaint: 'Sore throat, difficulty swallowing', symptoms: ['sore_throat'], self_reported_urgency: 4, automated_triage_level: 4, final_triage_level: 4, overridden_by: 2, overridden_at: now(), override_reason: null, status: 'completed', submitted_at: t(180), first_reviewed_at: now(), completed_at: now() },
    { id: 8, patient_id: 0, demographics: { age: '59', gender: 'female' }, chief_complaint: 'Heavy bleeding from wound', symptoms: ['heavy_bleeding'], self_reported_urgency: 2, automated_triage_level: 2, final_triage_level: 2, overridden_by: 2, overridden_at: now(), override_reason: 'Controlled at triage', status: 'completed', submitted_at: t(75), first_reviewed_at: now(), completed_at: now() },
    { id: 9, patient_id: 0, demographics: { age: '19', gender: 'other' }, chief_complaint: 'Prescription refill needed', symptoms: ['prescription_refill'], self_reported_urgency: 5, automated_triage_level: 5, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(5), first_reviewed_at: null, completed_at: null },
    { id: 10, patient_id: 0, demographics: { age: '73', gender: 'male' }, chief_complaint: 'Numbness on left side, slurred speech', symptoms: ['stroke_symptoms'], self_reported_urgency: 1, automated_triage_level: 1, final_triage_level: 1, overridden_by: 2, overridden_at: now(), override_reason: 'Stroke alert', status: 'completed', submitted_at: t(105), first_reviewed_at: now(), completed_at: now() },
    { id: 11, patient_id: 0, demographics: { age: '45', gender: 'male' }, chief_complaint: 'Severe allergic reaction after eating nuts', symptoms: ['severe_allergic'], self_reported_urgency: 2, automated_triage_level: 2, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(8), first_reviewed_at: null, completed_at: null },
    { id: 12, patient_id: 0, demographics: { age: '31', gender: 'female' }, chief_complaint: 'Seizure at work', symptoms: ['seizure'], self_reported_urgency: 2, automated_triage_level: 2, final_triage_level: 2, overridden_by: 2, overridden_at: now(), override_reason: 'Stable post-ictal', status: 'completed', submitted_at: t(45), first_reviewed_at: now(), completed_at: now() },
    { id: 13, patient_id: 0, demographics: { age: '8', gender: 'female' }, chief_complaint: 'Fell off bike, possible arm fracture', symptoms: ['minor_injury'], self_reported_urgency: 4, automated_triage_level: 4, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(12), first_reviewed_at: null, completed_at: null },
    { id: 14, patient_id: 0, demographics: { age: '56', gender: 'male' }, chief_complaint: 'Persistent chest pressure', symptoms: ['cardiac_chest_pain'], self_reported_urgency: 2, automated_triage_level: 2, final_triage_level: 2, overridden_by: 2, overridden_at: now(), override_reason: 'Cardiac workup ordered', status: 'completed', submitted_at: t(55), first_reviewed_at: now(), completed_at: now() },
    { id: 15, patient_id: 0, demographics: { age: '24', gender: 'female' }, chief_complaint: 'Migraine, vomiting', symptoms: ['headache'], self_reported_urgency: 3, automated_triage_level: 3, final_triage_level: null, overridden_by: null, overridden_at: null, override_reason: null, status: 'submitted', submitted_at: t(3), first_reviewed_at: null, completed_at: null },
  ];
  setCases(cases);
  const audit = [
    { id: 1, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 1, details: { from: 2, to: 2, reason: 'Confirmed high acuity' }, created_at: now() },
    { id: 2, user_id: 2, action: 'triage_complete', resource_type: 'triage_case', resource_id: 3, details: {}, created_at: now() },
    { id: 3, user_id: null, action: 'triage_submit', resource_type: 'triage_case', resource_id: 2, details: { automated_triage_level: 3 }, created_at: now() },
    { id: 4, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 5, details: { from: 1, to: 1, reason: 'Level 1 confirmed' }, created_at: now() },
    { id: 5, user_id: 2, action: 'triage_complete', resource_type: 'triage_case', resource_id: 7, details: {}, created_at: now() },
    { id: 6, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 8, details: { from: 2, to: 2, reason: 'Controlled at triage' }, created_at: now() },
    { id: 7, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 10, details: { from: 1, to: 1, reason: 'Stroke alert' }, created_at: now() },
    { id: 8, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 12, details: { from: 2, to: 2, reason: 'Stable post-ictal' }, created_at: now() },
    { id: 9, user_id: 2, action: 'triage_override', resource_type: 'triage_case', resource_id: 14, details: { from: 2, to: 2, reason: 'Cardiac workup ordered' }, created_at: now() },
  ];
  localStorage.setItem(AUDIT_KEY, JSON.stringify(audit));
  return true;
}

function enrichWithMl(c) {
  if (c.ml_level != null && c.ml_confidence != null) return c;
  const ml = predictPriority(c);
  return { ...c, ml_level: c.ml_level ?? ml.level, ml_confidence: c.ml_confidence ?? ml.confidence };
}

function formatCasesForQueue() {
  const raw = getCases();
  const cases = raw.map((c) => {
    const enriched = enrichWithMl(c);
    return {
      ...enriched,
      patient_name: DEMO_USERS[c.patient_id]?.full_name ?? 'Guest',
      patient_email: DEMO_USERS[c.patient_id]?.email ?? '—',
      triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
    };
  });
  cases.sort((a, b) => (a.ml_level - b.ml_level) || (b.ml_confidence - a.ml_confidence) || new Date(a.submitted_at) - new Date(b.submitted_at));
  return cases;
}

/** Ensure demo data exists and return queue-formatted cases. Call when queue is empty in demo mode. */
export function ensureDemoData() {
  if (getCases().length === 0) seedMockData();
  return formatCasesForQueue();
}

if (typeof window !== 'undefined') seedMockData();

export function mockApi(path, options, user) {
  const method = (options?.method || 'GET').toUpperCase();
  const body = options?.body ? JSON.parse(options.body) : {};

  // GET /patients/my-cases
  if (method === 'GET' && path === '/patients/my-cases') {
    const cases = getCases().filter((c) => c.patient_id === user.id);
    const withLabels = cases.map((c) => ({
      ...c,
      triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
    }));
    return Promise.resolve(fakeResponse(withLabels));
  }

  // GET /patients/queue
  if (method === 'GET' && path === '/patients/queue') {
    if (getCases().length === 0) seedMockData();
    const cases = formatCasesForQueue();
    return Promise.resolve(fakeResponse(cases));
  }

  // GET /patients/completed (doctor: completed triage cases only)
  if (method === 'GET' && path === '/patients/completed') {
    if (getCases().length === 0) seedMockData();
    const completed = getCases()
      .filter((c) => c.status === 'completed')
      .map((c) => ({
        ...c,
        patient_name: DEMO_USERS[c.patient_id]?.full_name ?? 'Guest',
        patient_email: DEMO_USERS[c.patient_id]?.email ?? '—',
        triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
      }));
    completed.sort((a, b) => (a.final_triage_level - b.final_triage_level) || new Date(a.completed_at) - new Date(b.completed_at));
    return Promise.resolve(fakeResponse(completed));
  }

  // PATCH /patients/:id – edit case (triage level, reason, status) without completing
  if (method === 'PATCH' && path.match(/^\/patients\/\d+$/) && !path.includes('/override') && !path.includes('/complete')) {
    const caseId = parseInt(path.replace('/patients/', ''), 10);
    const cases = getCases();
    const idx = cases.findIndex((x) => x.id === caseId);
    if (idx === -1) return Promise.resolve(fakeResponse({ error: 'Case not found' }, false));
    const c = cases[idx];
    const updated = { ...c };
    if (body.final_triage_level != null) {
      updated.final_triage_level = body.final_triage_level;
      updated.overridden_by = user.id;
      updated.overridden_at = new Date().toISOString();
    }
    if (body.override_reason !== undefined) updated.override_reason = body.override_reason || null;
    if (body.status === 'under_review') {
      updated.status = 'under_review';
      updated.completed_at = null;
    } else if (body.status === 'completed') {
      updated.status = 'completed';
      updated.completed_at = new Date().toISOString();
      updated.final_triage_level = updated.final_triage_level ?? updated.automated_triage_level;
    }
    cases[idx] = updated;
    setCases(cases);
    appendAudit({ user_id: user.id, action: 'triage_edit', resource_type: 'triage_case', resource_id: caseId, details: body });
    return Promise.resolve(fakeResponse({ ...updated, patient_name: DEMO_USERS[updated.patient_id]?.full_name ?? 'Guest', patient_email: DEMO_USERS[updated.patient_id]?.email ?? '—', triage_label: TRIAGE_LABELS[updated.final_triage_level ?? updated.automated_triage_level] }));
  }

  // GET /patients/:id
  if (method === 'GET' && path.startsWith('/patients/') && !path.includes('/override') && !path.includes('/complete')) {
    const caseId = parseInt(path.replace('/patients/', ''), 10);
    if (Number.isNaN(caseId)) return Promise.resolve(fakeResponse({ error: 'Not found' }, false));
    const cases = getCases();
    const c = cases.find((x) => x.id === caseId);
    if (!c) return Promise.resolve(fakeResponse({ error: 'Case not found' }, false));
    const enriched = enrichWithMl(c);
    const withPatient = {
      ...enriched,
      patient_name: DEMO_USERS[c.patient_id]?.full_name ?? 'Guest',
      patient_email: DEMO_USERS[c.patient_id]?.email ?? '—',
      triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
    };
    if (user.role === 'nurse' && c.status === 'submitted') {
      withPatient.status = 'under_review';
      withPatient.first_reviewed_at = withPatient.first_reviewed_at || new Date().toISOString();
      const updated = cases.map((x) => (x.id === caseId ? withPatient : x));
      setCases(updated);
      appendAudit({ user_id: user.id, action: 'triage_review_start', resource_type: 'triage_case', resource_id: caseId });
    }
    return Promise.resolve(fakeResponse(withPatient));
  }

  // PATCH /patients/:id/override
  if (method === 'PATCH' && path.includes('/override')) {
    const id = parseInt(path.replace('/patients/', '').replace('/override', ''), 10);
    const cases = getCases();
    const idx = cases.findIndex((x) => x.id === id);
    if (idx === -1) return Promise.resolve(fakeResponse({ error: 'Case not found' }, false));
    const c = cases[idx];
    const updated = {
      ...c,
      final_triage_level: body.final_triage_level ?? c.automated_triage_level,
      overridden_by: user.id,
      overridden_at: new Date().toISOString(),
      override_reason: body.override_reason || null,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    cases[idx] = updated;
    setCases(cases);
    updateFromOverride(c, updated.final_triage_level);
    appendAudit({
      user_id: user.id,
      action: 'triage_override',
      resource_type: 'triage_case',
      resource_id: id,
      details: { from: c.automated_triage_level, to: updated.final_triage_level, reason: body.override_reason },
    });
    return Promise.resolve(fakeResponse({ ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level] }));
  }

  // PATCH /patients/:id/complete
  if (method === 'PATCH' && path.includes('/complete')) {
    const id = parseInt(path.replace('/patients/', '').replace('/complete', ''), 10);
    const cases = getCases();
    const idx = cases.findIndex((x) => x.id === id);
    if (idx === -1) return Promise.resolve(fakeResponse({ error: 'Case not found' }, false));
    const c = cases[idx];
    const updated = {
      ...c,
      final_triage_level: c.final_triage_level ?? c.automated_triage_level,
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    cases[idx] = updated;
    setCases(cases);
    updateFromOverride(c, updated.final_triage_level);
    appendAudit({ user_id: user.id, action: 'triage_complete', resource_type: 'triage_case', resource_id: id });
    return Promise.resolve(fakeResponse({ ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level] }));
  }

  // POST /triage/submit (logged-in user only; guests use submitTriageAsGuest)
  if (method === 'POST' && path === '/triage/submit') {
    const level = computeAutomatedTriageLevel({
      self_reported_urgency: body.self_reported_urgency ?? 5,
      symptoms: Array.isArray(body.symptoms) ? body.symptoms : [],
      chief_complaint: body.chief_complaint || '',
    });
    const cases = getCases();
    const id = cases.length ? Math.max(...cases.map((x) => x.id)) + 1 : 1;
    const newCase = {
      id,
      patient_id: user.id,
      demographics: body.demographics || {},
      chief_complaint: body.chief_complaint || null,
      symptoms: body.symptoms || [],
      self_reported_urgency: body.self_reported_urgency ?? null,
      automated_triage_level: level,
      final_triage_level: null,
      overridden_by: null,
      overridden_at: null,
      override_reason: null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      first_reviewed_at: null,
      completed_at: null,
    };
    cases.push(newCase);
    setCases(cases);
    appendAudit({ user_id: user.id, action: 'triage_submit', resource_type: 'triage_case', resource_id: id, details: { automated_triage_level: level } });
    return Promise.resolve(fakeResponse({ ...newCase, triage_label: TRIAGE_LABELS[level] }));
  }

  // GET /audit
  if (method === 'GET' && path.startsWith('/audit')) {
    const log = getAudit().map((e) => ({ ...e, email: e.user_id != null ? DEMO_USERS[e.user_id]?.email : '—' }));
    return Promise.resolve(fakeResponse(log));
  }

  return Promise.resolve(fakeResponse({ error: 'Not found' }, false));
}
