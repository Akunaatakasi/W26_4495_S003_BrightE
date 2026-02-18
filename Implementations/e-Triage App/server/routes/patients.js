import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { TRIAGE_LABELS } from '../lib/triageLogic.js';
import { logAudit } from '../db/audit.js';

const router = Router();

router.get('/my-cases', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, demographics, chief_complaint, symptoms, self_reported_urgency, automated_triage_level, final_triage_level, status, submitted_at, first_reviewed_at, completed_at
       FROM triage_cases WHERE patient_id = $1 ORDER BY submitted_at DESC`,
      [req.userId]
    );
    const cases = rows.map((c) => ({
      ...c,
      triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
    }));
    res.json(cases);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/completed', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.demographics, t.chief_complaint, t.symptoms, t.self_reported_urgency,
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.status,
              t.submitted_at, t.first_reviewed_at, t.completed_at,
              u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       WHERE t.status = 'completed'
       ORDER BY t.final_triage_level ASC NULLS LAST, t.completed_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level] })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/queue', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.demographics, t.chief_complaint, t.symptoms, t.self_reported_urgency,
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.status,
              t.submitted_at, t.first_reviewed_at, t.completed_at,
              u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       ORDER BY t.automated_triage_level ASC, t.submitted_at ASC`
    );
    res.json(rows.map((r) => ({ ...r, triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level] })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const isNurse = req.role === 'nurse';
    const isDoctor = req.role === 'doctor';
    const { rows } = await pool.query(
      `SELECT t.*, u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t JOIN users u ON u.id = t.patient_id WHERE t.id = $1`,
      [id]
    );
    const case_ = rows[0];
    if (!case_) return res.status(404).json({ error: 'Case not found' });
    if (!isNurse && !isDoctor && case_.patient_id !== req.userId) return res.status(403).json({ error: 'Access denied' });
    if (isNurse && case_.status === 'submitted') {
      await pool.query(
        `UPDATE triage_cases SET status = 'under_review', first_reviewed_at = COALESCE(first_reviewed_at, NOW()) WHERE id = $1`,
        [id]
      );
      await logAudit({ userId: req.userId, action: 'triage_review_start', resourceType: 'triage_case', resourceId: parseInt(id, 10) });
    }
    res.json({
      ...case_,
      triage_label: TRIAGE_LABELS[case_.final_triage_level ?? case_.automated_triage_level],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/override', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { final_triage_level, override_reason } = req.body;
    if (final_triage_level == null || final_triage_level < 1 || final_triage_level > 5)
      return res.status(400).json({ error: 'final_triage_level must be 1-5' });
    const { rows } = await pool.query(
      `UPDATE triage_cases SET final_triage_level = $1, overridden_by = $2, overridden_at = NOW(), override_reason = $3, status = 'completed', completed_at = NOW()
       WHERE id = $4 RETURNING *`,
      [final_triage_level, req.userId, override_reason || null, id]
    );
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found' });
    await logAudit({
      userId: req.userId,
      action: 'triage_override',
      resourceType: 'triage_case',
      resourceId: parseInt(id, 10),
      details: { from: updated.automated_triage_level, to: final_triage_level, reason: override_reason },
    });
    res.json({ ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/complete', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET status = 'completed', completed_at = NOW(), final_triage_level = COALESCE(final_triage_level, automated_triage_level) WHERE id = $1 RETURNING *`,
      [id]
    );
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found' });
    await logAudit({ userId: req.userId, action: 'triage_complete', resourceType: 'triage_case', resourceId: parseInt(id, 10) });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as patientsRouter };
