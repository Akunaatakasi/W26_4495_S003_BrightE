import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { TRIAGE_LABELS } from '../lib/triageLogic.js';
import { logAudit } from '../db/audit.js';

const router = Router();

function isDbConnectionError(e) {
  const code = e.code || '';
  const msg = (e.message || '').toLowerCase();
  return code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || msg.includes('connect etimedout') || msg.includes('timeout');
}

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
       WHERE t.status = 'completed' AND t.concluded_by IS NULL
       ORDER BY t.final_triage_level ASC NULLS LAST, t.completed_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level] })));
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' && isDbConnectionError(e)) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

router.get('/doctor-history', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.chief_complaint, t.automated_triage_level, t.final_triage_level,
              t.completed_at, t.concluded_at,
              u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       WHERE t.concluded_by = $1
       ORDER BY t.concluded_at DESC`,
      [req.userId]
    );
    res.json(rows.map((r) => ({ ...r, triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level] })));
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' && isDbConnectionError(e)) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

router.get('/queue', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.demographics, t.chief_complaint, t.symptoms, t.self_reported_urgency,
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.status,
              t.submitted_at, t.first_reviewed_at, t.completed_at,
              t.concluded_by, t.concluded_at,
              u.full_name AS patient_name, u.email AS patient_email,
              d.full_name AS concluded_by_name, d.email AS concluded_by_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users d ON d.id = t.concluded_by
       ORDER BY t.automated_triage_level ASC, t.submitted_at ASC`
    );
    res.json(rows.map((r) => ({ ...r, triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level] })));
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' && isDbConnectionError(e)) {
      return res.json([]);
    }
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

router.patch('/:id', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { final_triage_level, override_reason, status } = req.body || {};

    if (final_triage_level != null && (final_triage_level < 1 || final_triage_level > 5)) {
      return res.status(400).json({ error: 'final_triage_level must be 1-5' });
    }
    if (status != null && status !== 'under_review') {
      return res.status(400).json({ error: "Only status='under_review' is allowed here" });
    }

    const existing = await pool.query('SELECT * FROM triage_cases WHERE id = $1', [id]);
    const case_ = existing.rows[0];
    if (!case_) return res.status(404).json({ error: 'Case not found' });

    const reopening = status === 'under_review' && case_.status === 'completed';

    const shouldUpdateOverride = final_triage_level != null || override_reason != null;

    const { rows } = await pool.query(
      `UPDATE triage_cases
       SET
         final_triage_level = COALESCE($1, final_triage_level),
         override_reason = COALESCE($2, override_reason),
         overridden_by = CASE WHEN $3::boolean THEN $4 ELSE overridden_by END,
         overridden_at = CASE WHEN $3::boolean THEN NOW() ELSE overridden_at END,
         status = COALESCE($5, status),
         first_reviewed_at = CASE WHEN $6::boolean THEN COALESCE(first_reviewed_at, NOW()) ELSE first_reviewed_at END,
         completed_at = CASE WHEN $6::boolean THEN NULL ELSE completed_at END,
         concluded_by = CASE WHEN $6::boolean THEN NULL ELSE concluded_by END,
         concluded_at = CASE WHEN $6::boolean THEN NULL ELSE concluded_at END
       WHERE id = $7
       RETURNING *`,
      [
        final_triage_level ?? null,
        override_reason ?? null,
        shouldUpdateOverride,
        req.userId,
        status ?? null,
        reopening,
        id,
      ]
    );

    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found' });

    await logAudit({
      userId: req.userId,
      action: reopening ? 'triage_reopen' : 'triage_update',
      resourceType: 'triage_case',
      resourceId: parseInt(id, 10),
      details: { status: updated.status, final_triage_level: updated.final_triage_level, override_reason: updated.override_reason },
    });

    res.json({ ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level ?? updated.automated_triage_level] });
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

async function concludeCase(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET concluded_by = $1, concluded_at = NOW()
       WHERE id = $2 AND status = 'completed' AND concluded_by IS NULL
       RETURNING id`,
      [req.userId, id]
    );
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found or already concluded' });
    await logAudit({ userId: req.userId, action: 'doctor_conclude', resourceType: 'triage_case', resourceId: parseInt(id, 10) });
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.patch('/:id/conclude', requireAuth, requireRole('doctor'), concludeCase);

export { router as patientsRouter, concludeCase };
