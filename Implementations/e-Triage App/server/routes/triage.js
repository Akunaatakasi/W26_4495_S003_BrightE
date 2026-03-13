import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { computeAutomatedTriageLevel, TRIAGE_LABELS } from '../lib/triageLogic.js';
import { logAudit } from '../db/audit.js';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';

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

    const automatedLevel = mlPrediction.predicted_triage_level;
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
        predicted_wait_time_minutes: predictedWaitTime,
      },
    });

    res.status(201).json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.automated_triage_level],
      predicted_wait_time_minutes: predictedWaitTime,
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

    const automatedLevel = mlPrediction.predicted_triage_level;
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
