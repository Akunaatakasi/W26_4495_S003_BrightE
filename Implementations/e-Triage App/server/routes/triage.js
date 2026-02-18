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

router.post('/submit-guest', async (req, res) => {
  try {
    const { guest_token, demographics, chief_complaint, symptoms, self_reported_urgency } = req.body;
    if (!guest_token) {
      return res.status(400).json({ error: 'Guest token is required. Verify your email with the OTP first.' });
    }
    let payload;
    try {
      payload = jwt.verify(guest_token, JWT_SECRET);
      if (payload.purpose !== 'guest_triage' || !payload.email) throw new Error('Invalid token');
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
        `INSERT INTO users (email, password_hash, role, full_name) VALUES ($1, $2, 'patient', $3)
         RETURNING id`,
        [email.toLowerCase(), hash, email]
      );
      patientId = insert.rows[0].id;
    }
    const automatedLevel = computeAutomatedTriageLevel({
      self_reported_urgency: self_reported_urgency ?? 5,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      chief_complaint: chief_complaint || '',
    });
    const { rows } = await pool.query(
      `INSERT INTO triage_cases (patient_id, demographics, chief_complaint, symptoms, self_reported_urgency, automated_triage_level, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
       RETURNING id, patient_id, demographics, chief_complaint, symptoms, self_reported_urgency, automated_triage_level, final_triage_level, status, submitted_at`,
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
    await logAudit({ userId: patientId, action: 'triage_submit', resourceType: 'triage_case', resourceId: case_.id, details: { automated_triage_level: automatedLevel } });
    res.status(201).json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.automated_triage_level],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/submit', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const { demographics, chief_complaint, symptoms, self_reported_urgency } = req.body;
    const patientId = req.userId;
    const automatedLevel = computeAutomatedTriageLevel({
      self_reported_urgency: self_reported_urgency ?? 5,
      symptoms: Array.isArray(symptoms) ? symptoms : [],
      chief_complaint: chief_complaint || '',
    });
    const { rows } = await pool.query(
      `INSERT INTO triage_cases (patient_id, demographics, chief_complaint, symptoms, self_reported_urgency, automated_triage_level, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
       RETURNING id, patient_id, demographics, chief_complaint, symptoms, self_reported_urgency, automated_triage_level, final_triage_level, status, submitted_at`,
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
    await logAudit({ userId: patientId, action: 'triage_submit', resourceType: 'triage_case', resourceId: case_.id, details: { automated_triage_level: automatedLevel } });
    res.status(201).json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.automated_triage_level],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/levels', (_, res) => res.json(TRIAGE_LABELS));

export { router as triageRouter };
