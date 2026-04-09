import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { computeAutomatedTriageLevel, TRIAGE_LABELS } from '../lib/triageLogic.js';
import { logAudit } from '../db/audit.js';
import { applyLevelCalibration } from '../db/mlCalibration.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';
const GUEST_CASE_ACCESS_DAYS = Math.min(
  30,
  Math.max(1, Number(process.env.GUEST_CASE_ACCESS_DAYS) || 7)
);

function readGuestCaseIdentity(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== 'guest_case_access' || payload.email == null || payload.caseId == null) return null;
    return { caseId: Number(payload.caseId), email: String(payload.email).toLowerCase() };
  } catch {
    return null;
  }
}

function signGuestCaseAccessToken(caseId, email) {
  return jwt.sign(
    {
      purpose: 'guest_case_access',
      caseId: Number(caseId),
      email: String(email).toLowerCase(),
    },
    JWT_SECRET,
    { expiresIn: `${GUEST_CASE_ACCESS_DAYS}d` }
  );
}

async function getMlPrediction({ chief_complaint, symptoms, self_reported_urgency, demographics = {} }) {
  try {
    const response = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chief_complaint,
        symptoms,
        self_reported_urgency,
        age: demographics.age ?? 40,
        sex: demographics.sex ?? 0,
        tempf: demographics.tempf ?? 98.6,
        pulse: demographics.pulse ?? 80,
        bpsys: demographics.bpsys ?? 120,
        bpdias: demographics.bpdias ?? 80,
        popct: demographics.popct ?? 98,
        respr: demographics.respr ?? 16,
      }),
    });

    if (!response.ok) {
      throw new Error('ML API request failed');
    }

    return await response.json();
  } catch (error) {
    console.error('[ML fallback]', error.message);

    return {
      predicted_triage_level: computeAutomatedTriageLevel({
        self_reported_urgency,
        symptoms,
        chief_complaint,
      }),
      predicted_wait_time_minutes: null,
    };
  }
}

router.post('/submit-guest', async (req, res) => {
  try {
    const { guest_token, demographics, chief_complaint, symptoms, self_reported_urgency } = req.body;

    if (!guest_token) {
      return res.status(400).json({ error: 'Guest token is required. Verify your email with the OTP first.' });
    }

    let payload;
    try {
      payload = jwt.verify(guest_token, JWT_SECRET);
      if (payload.purpose !== 'guest_triage' || !payload.email) {
        throw new Error('Invalid token');
      }
    } catch (_) {
      return res.status(400).json({ error: 'Invalid or expired verification. Please verify your email again.' });
    }

    const email = payload.email;
    let patientId;

    const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (userRow.rows[0]) {
      patientId = userRow.rows[0].id;
    } else {
      const randomPassword = crypto.randomBytes(24).toString('hex');
      const hash = await bcrypt.hash(randomPassword, 10);

      const insert = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name)
         VALUES ($1, $2, 'patient', $3)
         RETURNING id`,
        [email.toLowerCase(), hash, email]
      );

      patientId = insert.rows[0].id;
    }

    const mlPrediction = await getMlPrediction({
      self_reported_urgency: self_reported_urgency ?? 5,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      chief_complaint: chief_complaint || '',
      demographics: demographics || {},
    });

    const rawPredictedLevel = mlPrediction.predicted_triage_level;
    const calibration = await applyLevelCalibration(rawPredictedLevel);
    const automatedLevel = calibration.calibratedLevel;
    const predictedWaitTime = mlPrediction.predicted_wait_time_minutes;

    const { rows } = await pool.query(
      `INSERT INTO triage_cases (
        patient_id,
        demographics,
        chief_complaint,
        symptoms,
        self_reported_urgency,
        automated_triage_level,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
      RETURNING
        id,
        patient_id,
        demographics,
        chief_complaint,
        symptoms,
        self_reported_urgency,
        automated_triage_level,
        final_triage_level,
        status,
        submitted_at`,
      [
        patientId,
        JSON.stringify(demographics || {}),
        chief_complaint || null,
        JSON.stringify(Array.isArray(symptoms) ? symptoms : []),
        self_reported_urgency ?? null,
        automatedLevel,
      ]
    );

    const case_ = rows[0];

    await logAudit({
      userId: patientId,
      action: 'triage_submit',
      resourceType: 'triage_case',
      resourceId: case_.id,
      details: {
        automated_triage_level: automatedLevel,
        raw_predicted_triage_level: rawPredictedLevel,
        calibration_avg_delta: calibration.averageDelta,
        calibration_sample_count: calibration.sampleCount,
        predicted_wait_time_minutes: predictedWaitTime,
      },
    });

    const { rows: userRows } = await pool.query(
      'SELECT id, email, role, full_name FROM users WHERE id = $1',
      [patientId]
    );
    const u = userRows[0];
    let token = null;
    let sessionUser = null;
    if (u && u.role === 'patient') {
      token = jwt.sign({ userId: u.id, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
      sessionUser = { id: u.id, email: u.email, role: u.role, full_name: u.full_name };
      await logAudit({
        userId: patientId,
        action: 'patient_session_from_triage',
        resourceType: 'user',
        resourceId: patientId,
        details: { via: 'guest_otp_submit' },
      });
    }

    res.status(201).json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.automated_triage_level],
      predicted_wait_time_minutes: predictedWaitTime,
      case_access_token: signGuestCaseAccessToken(case_.id, email),
      ...(token && sessionUser ? { token, user: sessionUser } : {}),
    });
  } catch (e) {
    console.error('[triage submit-guest]', e);
    const msg = e.message || e.code || String(e);
    res.status(500).json({ error: msg || 'Server error' });
  }
});

router.post('/submit', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const { demographics, chief_complaint, symptoms, self_reported_urgency } = req.body;
    const patientId = req.userId;

    const mlPrediction = await getMlPrediction({
      self_reported_urgency: self_reported_urgency ?? 5,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      chief_complaint: chief_complaint || '',
      demographics: demographics || {},
    });

    const rawPredictedLevel = mlPrediction.predicted_triage_level;
    const calibration = await applyLevelCalibration(rawPredictedLevel);
    const automatedLevel = calibration.calibratedLevel;
    const predictedWaitTime = mlPrediction.predicted_wait_time_minutes;

    const { rows } = await pool.query(
      `INSERT INTO triage_cases (
        patient_id,
        demographics,
        chief_complaint,
        symptoms,
        self_reported_urgency,
        automated_triage_level,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
      RETURNING
        id,
        patient_id,
        demographics,
        chief_complaint,
        symptoms,
        self_reported_urgency,
        automated_triage_level,
        final_triage_level,
        status,
        submitted_at`,
      [
        patientId,
        JSON.stringify(demographics || {}),
        chief_complaint || null,
        JSON.stringify(Array.isArray(symptoms) ? symptoms : []),
        self_reported_urgency ?? null,
        automatedLevel,
      ]
    );

    const case_ = rows[0];

    await logAudit({
      userId: patientId,
      action: 'triage_submit',
      resourceType: 'triage_case',
      resourceId: case_.id,
      details: {
        automated_triage_level: automatedLevel,
        raw_predicted_triage_level: rawPredictedLevel,
        calibration_avg_delta: calibration.averageDelta,
        calibration_sample_count: calibration.sampleCount,
        predicted_wait_time_minutes: predictedWaitTime,
      },
    });

    res.status(201).json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.automated_triage_level],
      predicted_wait_time_minutes: predictedWaitTime,
    });
  } catch (e) {
    console.error('[triage submit]', e);
    const msg = e.message || e.code || String(e);
    res.status(500).json({ error: msg || 'Server error' });
  }
});

router.get('/levels', (_, res) => {
  res.json(TRIAGE_LABELS);
});

router.get('/debug', async (_, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        chief_complaint,
        symptoms,
        self_reported_urgency,
        automated_triage_level,
        final_triage_level,
        status,
        submitted_at
      FROM triage_cases
      ORDER BY submitted_at DESC
      LIMIT 10
    `);

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to fetch rows' });
  }
});

/** Public queue board: counts and anonymized slots (no PHI). */
router.get('/public-queue', async (_, res) => {
  try {
    const { rows: sum } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
        COUNT(*) FILTER (WHERE status IN ('under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned'))::int AS active,
        COUNT(*) FILTER (
          WHERE status IN ('withdrawn', 'patient_resolved')
            OR concluded_at IS NOT NULL
        )::int AS concluded
      FROM triage_cases
    `);

    const { rows: pipeline } = await pool.query(`
      SELECT id, status, automated_triage_level, final_triage_level, submitted_at, completed_at, concluded_at
      FROM triage_cases
      WHERE status IN ('submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned')
        AND status NOT IN ('withdrawn', 'patient_resolved')
      ORDER BY submitted_at ASC
      LIMIT 40
    `);

    const slots = pipeline.map((r) => {
      let phase = 'active';
      if (r.status === 'submitted') phase = 'pending';
      return {
        ref: `Q${String(r.id).padStart(4, '0')}`,
        phase,
        display_level: r.final_triage_level ?? r.automated_triage_level,
        updated_at: r.completed_at || r.submitted_at,
      };
    });

    res.json({
      summary: sum[0],
      slots,
      note: 'No personal or clinical details are shown—only queue position-style references and triage levels.',
    });
  } catch (err) {
    console.error('[public-queue]', err);
    res.status(500).json({ error: 'Failed to load public queue' });
  }
});

/** Guest/patient browser session: read own case status with long-lived JWT from submit-guest. */
router.get('/guest-case', async (req, res) => {
  try {
    const iden = readGuestCaseIdentity(req);
    if (!iden) {
      return res.status(401).json({
        error: 'Your session for this request expired. Start a new triage or use the email link flow again.',
      });
    }
    const { caseId, email } = iden;
    const { rows } = await pool.query(
      `SELECT t.id, t.chief_complaint, t.status, t.automated_triage_level, t.final_triage_level,
              t.override_reason, t.nurse_recommendation, t.watch_review_at,
              t.doctor_seeking_patient_at, t.doctor_seeking_note, t.doctor_seek_acknowledged_at,
              t.first_reviewed_at, t.completed_at, t.concluded_at, t.submitted_at,
              rn.full_name AS reviewing_nurse_name,
              ov.full_name AS override_nurse_name,
              doc.full_name AS doctor_name,
              seekdoc.full_name AS doctor_seeking_doctor_name
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       LEFT JOIN users doc ON doc.id = t.concluded_by
       LEFT JOIN users seekdoc ON seekdoc.id = t.doctor_seeking_patient_by
       WHERE t.id = $1 AND LOWER(u.email) = $2`,
      [caseId, email]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ error: 'Case not found' });
    }
    const effective = row.final_triage_level ?? row.automated_triage_level;
    const handling_nurse_name = row.reviewing_nurse_name || row.override_nurse_name || null;
    res.json({
      ...row,
      triage_label: TRIAGE_LABELS[effective],
      effective_triage_level: effective,
      handling_nurse_name,
    });
  } catch (e) {
    console.error('[triage guest-case]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

/** Guest: quit triage or mark resolved (same rules as patient POST). */
router.post('/guest-case/action', async (req, res) => {
  try {
    const iden = readGuestCaseIdentity(req);
    if (!iden) {
      return res.status(401).json({ error: 'Invalid or expired session for this request.' });
    }
    const action = req.body?.action;
    if (action !== 'withdraw' && action !== 'resolve') {
      return res.status(400).json({ error: 'action must be "withdraw" or "resolve"' });
    }
    const { caseId, email } = iden;
    const { rows: chk } = await pool.query(
      `SELECT t.* FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       WHERE t.id = $1 AND LOWER(u.email) = $2`,
      [caseId, email]
    );
    if (!chk[0]) return res.status(404).json({ error: 'Case not found' });
    const c = chk[0];

    if (action === 'withdraw') {
      if (!['submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned'].includes(c.status)) {
        return res.status(400).json({
          error: 'You can only quit triage while your case is waiting or being reviewed.',
        });
      }
      const { rows } = await pool.query(
        `UPDATE triage_cases SET status = 'withdrawn', patient_withdrew_at = NOW() WHERE id = $1 RETURNING *`,
        [caseId]
      );
      const updated = rows[0];
      await logAudit({
        userId: c.patient_id,
        action: 'patient_withdraw',
        resourceType: 'triage_case',
        resourceId: caseId,
      });
      const effective = updated.final_triage_level ?? updated.automated_triage_level;
      return res.json({
        ...updated,
        triage_label: TRIAGE_LABELS[effective],
        handling_nurse_name: null,
      });
    }

    if (c.status === 'withdrawn' || c.status === 'patient_resolved') {
      return res.status(400).json({ error: 'This request is already closed.' });
    }
    if (c.concluded_at) {
      return res.status(400).json({ error: 'This case has already been concluded by the care team.' });
    }
    const hasGuidance =
      c.final_triage_level != null ||
      (c.override_reason && String(c.override_reason).trim()) ||
      (c.nurse_recommendation && String(c.nurse_recommendation).trim()) ||
      c.status === 'requested_doctor' ||
      c.status === 'doctor_summoned' ||
      c.status === 'nurse_watch' ||
      c.status === 'completed';
    if (!hasGuidance) {
      return res.status(400).json({
        error:
          'A clinician has not posted guidance yet. Use “withdraw” if you no longer wish to wait, or wait for a recommendation.',
      });
    }
    const { rows } = await pool.query(
      `UPDATE triage_cases SET status = 'patient_resolved', patient_resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [caseId]
    );
    const updated = rows[0];
    await logAudit({
      userId: c.patient_id,
      action: 'patient_self_resolve',
      resourceType: 'triage_case',
      resourceId: caseId,
    });
    const effective = updated.final_triage_level ?? updated.automated_triage_level;
    return res.json({
      ...updated,
      triage_label: TRIAGE_LABELS[effective],
    });
  } catch (e) {
    console.error('[triage guest-case action]', e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

router.get('/queue-stats', async (_, res) => {
  try {
    const { rows: total } = await pool.query(`
      SELECT COUNT(*) AS waiting
      FROM triage_cases
      WHERE status = 'submitted'
    `);

    const { rows: levels } = await pool.query(`
      SELECT automated_triage_level, COUNT(*) AS count
      FROM triage_cases
      WHERE status = 'submitted'
      GROUP BY automated_triage_level
      ORDER BY automated_triage_level
    `);

    const { rows: recent } = await pool.query(`
      SELECT id, chief_complaint, automated_triage_level, submitted_at
      FROM triage_cases
      ORDER BY submitted_at DESC
      LIMIT 10
    `);

    res.json({
      waiting: Number(total[0].waiting),
      levels,
      recent,
    });
  } catch (err) {
    console.error('[queue-stats]', err);
    res.status(500).json({ error: 'Failed to load queue stats' });
  }
});

export { router as triageRouter };