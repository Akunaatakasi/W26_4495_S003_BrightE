import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { TRIAGE_LABELS } from '../lib/triageLogic.js';
import { logAudit } from '../db/audit.js';
import { learnFromNurseOverride } from '../db/mlCalibration.js';
import { broadcastCaseRoom } from '../realtime/caseRoom.js';

const router = Router();

function isDbConnectionError(e) {
  const code = e.code || '';
  const msg = (e.message || '').toLowerCase();
  return code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || msg.includes('connect etimedout') || msg.includes('timeout');
}

const CASE_ENRICHED_SQL = `SELECT t.*, u.full_name AS patient_name, u.email AS patient_email,
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
WHERE t.id = $1`;

async function fetchCaseEnriched(id) {
  const { rows } = await pool.query(CASE_ENRICHED_SQL, [id]);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    triage_label: TRIAGE_LABELS[row.final_triage_level ?? row.automated_triage_level],
    handling_nurse_name: row.reviewing_nurse_name || row.override_nurse_name || null,
  };
}

router.get('/my-cases', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.demographics, t.chief_complaint, t.symptoms, t.self_reported_urgency,
              t.automated_triage_level, t.final_triage_level, t.override_reason, t.nurse_recommendation, t.status,
              t.submitted_at, t.first_reviewed_at, t.completed_at, t.concluded_at,
              t.reviewing_nurse_id, t.overridden_by, t.concluded_by,
              t.patient_withdrew_at, t.patient_resolved_at,
              t.watch_review_at, t.doctor_seeking_patient_at, t.doctor_seeking_note, t.doctor_seek_acknowledged_at,
              rn.full_name AS reviewing_nurse_name,
              ov.full_name AS override_nurse_name,
              doc.full_name AS doctor_name,
              seekdoc.full_name AS doctor_seeking_doctor_name
       FROM triage_cases t
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       LEFT JOIN users doc ON doc.id = t.concluded_by
       LEFT JOIN users seekdoc ON seekdoc.id = t.doctor_seeking_patient_by
       WHERE t.patient_id = $1
       ORDER BY t.submitted_at DESC`,
      [req.userId]
    );
    const cases = rows.map((c) => ({
      ...c,
      triage_label: TRIAGE_LABELS[c.final_triage_level ?? c.automated_triage_level],
      handling_nurse_name: c.reviewing_nurse_name || c.override_nurse_name || null,
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
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.nurse_recommendation,
              t.status, t.submitted_at, t.first_reviewed_at, t.completed_at,
              rn.full_name AS reviewing_nurse_name, ov.full_name AS override_nurse_name,
              u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       WHERE t.status = 'requested_doctor' AND t.concluded_by IS NULL
       ORDER BY t.final_triage_level ASC NULLS LAST, t.submitted_at ASC`
    );
    res.json(
      rows.map((r) => ({
        ...r,
        triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level],
        handling_nurse_name: r.reviewing_nurse_name || r.override_nurse_name || null,
      }))
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' && isDbConnectionError(e)) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

/** Patients this doctor has asked to come to the clinical area (post–doctor request). */
router.get('/doctor-summoned', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.demographics, t.chief_complaint, t.symptoms, t.self_reported_urgency,
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.nurse_recommendation,
              t.status, t.submitted_at, t.first_reviewed_at, t.completed_at,
              t.doctor_seeking_patient_at, t.doctor_seeking_note,
              rn.full_name AS reviewing_nurse_name, ov.full_name AS override_nurse_name,
              u.full_name AS patient_name, u.email AS patient_email
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       WHERE t.status = 'doctor_summoned' AND t.concluded_by IS NULL AND t.doctor_seeking_patient_by = $1
       ORDER BY t.doctor_seeking_patient_at DESC NULLS LAST, t.final_triage_level ASC NULLS LAST`,
      [req.userId]
    );
    res.json(
      rows.map((r) => ({
        ...r,
        triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level],
        handling_nurse_name: r.reviewing_nurse_name || r.override_nurse_name || null,
      }))
    );
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
              u.full_name AS patient_name, u.email AS patient_email,
              rn.full_name AS reviewing_nurse_name, ov.full_name AS override_nurse_name,
              doc.full_name AS concluding_doctor_name
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       LEFT JOIN users doc ON doc.id = t.concluded_by
       WHERE t.concluded_by = $1
       ORDER BY t.concluded_at DESC`,
      [req.userId]
    );
    res.json(
      rows.map((r) => ({
        ...r,
        triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level],
        handling_nurse_name: r.reviewing_nurse_name || r.override_nurse_name || null,
        doctor_name: r.concluding_doctor_name,
      }))
    );
  } catch (e) {
    if (process.env.NODE_ENV !== 'production' && isDbConnectionError(e)) {
      return res.json([]);
    }
    res.status(500).json({ error: e.message });
  }
});

router.get('/nurse-completed', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.patient_id, t.chief_complaint, t.status, t.final_triage_level, t.automated_triage_level,
              t.submitted_at, t.completed_at, t.concluded_at, t.patient_resolved_at,
              t.nurse_completed_at, t.nurse_completed_by,
              u.full_name AS patient_name, u.email AS patient_email,
              rn.full_name AS reviewing_nurse_name,
              ov.full_name AS override_nurse_name,
              doc.full_name AS doctor_name,
              nc.full_name AS nurse_completer_name
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users rn ON rn.id = t.reviewing_nurse_id
       LEFT JOIN users ov ON ov.id = t.overridden_by
       LEFT JOIN users doc ON doc.id = t.concluded_by
       LEFT JOIN users nc ON nc.id = t.nurse_completed_by
       WHERE t.status IN ('completed', 'patient_resolved')
       ORDER BY COALESCE(t.concluded_at, t.nurse_completed_at, t.patient_resolved_at, t.completed_at) DESC NULLS LAST
       LIMIT 150`
    );
    res.json(
      rows.map((r) => ({
        ...r,
        triage_label: TRIAGE_LABELS[r.final_triage_level ?? r.automated_triage_level],
        handling_nurse_name: r.reviewing_nurse_name || r.override_nurse_name || null,
      }))
    );
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
              t.automated_triage_level, t.final_triage_level, t.overridden_by, t.override_reason, t.nurse_recommendation,
              t.status, t.submitted_at, t.first_reviewed_at, t.completed_at,
              t.concluded_by, t.concluded_at, t.reviewing_nurse_id,
              t.watch_review_at, t.doctor_seeking_patient_at, t.doctor_seeking_patient_by, t.doctor_seeking_note,
              t.doctor_seek_acknowledged_at,
              u.full_name AS patient_name, u.email AS patient_email,
              d.full_name AS concluded_by_name, d.email AS concluded_by_email,
              seek_doc.full_name AS doctor_seeking_doctor_name
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       LEFT JOIN users d ON d.id = t.concluded_by
       LEFT JOIN users seek_doc ON seek_doc.id = t.doctor_seeking_patient_by
       WHERE t.status NOT IN ('withdrawn', 'patient_resolved', 'completed')
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

router.post('/:id/withdraw', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: chk } = await pool.query('SELECT * FROM triage_cases WHERE id = $1 AND patient_id = $2', [id, req.userId]);
    if (!chk[0]) return res.status(404).json({ error: 'Case not found' });
    const c = chk[0];
    if (!['submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned'].includes(c.status)) {
      return res.status(400).json({
        error: 'You can only quit triage while your case is waiting or being reviewed.',
      });
    }
    const { rows } = await pool.query(
      `UPDATE triage_cases SET status = 'withdrawn', patient_withdrew_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const updated = rows[0];
    await logAudit({
      userId: req.userId,
      action: 'patient_withdraw',
      resourceType: 'triage_case',
      resourceId: id,
    });
    res.json({
      ...updated,
      triage_label: TRIAGE_LABELS[updated.final_triage_level ?? updated.automated_triage_level],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/patient-resolve', requireAuth, requireRole('patient'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: chk } = await pool.query('SELECT * FROM triage_cases WHERE id = $1 AND patient_id = $2', [id, req.userId]);
    if (!chk[0]) return res.status(404).json({ error: 'Case not found' });
    const c = chk[0];
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
          'A clinician has not posted guidance yet. Use “Quit triage” if you no longer wish to wait, or wait for a recommendation.',
      });
    }
    const { rows } = await pool.query(
      `UPDATE triage_cases SET status = 'patient_resolved', patient_resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    const updated = rows[0];
    await logAudit({
      userId: req.userId,
      action: 'patient_self_resolve',
      resourceType: 'triage_case',
      resourceId: id,
    });
    res.json({
      ...updated,
      triage_label: TRIAGE_LABELS[updated.final_triage_level ?? updated.automated_triage_level],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const isNurse = req.role === 'nurse';
    const isDoctor = req.role === 'doctor';
    const row = await fetchCaseEnriched(id);
    if (!row) return res.status(404).json({ error: 'Case not found' });
    if (!isNurse && !isDoctor && row.patient_id !== req.userId) return res.status(403).json({ error: 'Access denied' });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/open', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `UPDATE triage_cases
       SET status = 'under_review',
           first_reviewed_at = COALESCE(first_reviewed_at, NOW()),
           reviewing_nurse_id = COALESCE(reviewing_nurse_id, $2)
       WHERE id = $1 AND status = 'submitted'
       RETURNING id`,
      [id, req.userId]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Case not found or already opened' });
    await logAudit({ userId: req.userId, action: 'triage_review_start', resourceType: 'triage_case', resourceId: id });
    const enriched = await fetchCaseEnriched(id);
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/watch', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nurse_recommendation, watch_review_at, final_triage_level, override_reason } = req.body || {};
    const rec = nurse_recommendation != null ? String(nurse_recommendation).trim() : '';
    if (!rec) return res.status(400).json({ error: 'Recommendation for the patient is required' });
    if (!watch_review_at) return res.status(400).json({ error: 'Next review time (watch_review_at) is required' });
    const wr = new Date(watch_review_at);
    if (Number.isNaN(wr.getTime())) return res.status(400).json({ error: 'Invalid next review time' });

    const { rows: existing } = await pool.query('SELECT * FROM triage_cases WHERE id = $1', [id]);
    const c = existing[0];
    if (!c) return res.status(404).json({ error: 'Case not found' });
    if (!['under_review', 'nurse_watch'].includes(c.status)) {
      return res.status(400).json({ error: 'Case must be in nurse review or watch mode' });
    }
    const fl = final_triage_level != null ? final_triage_level : (c.final_triage_level ?? c.automated_triage_level);
    if (fl == null || fl < 1 || fl > 5) return res.status(400).json({ error: 'Triage level must be 1–5' });
    const orText = override_reason != null ? String(override_reason).trim() || null : null;
    const bumpOverride = final_triage_level != null || !!orText;

    const { rows } = await pool.query(
      `UPDATE triage_cases SET
         status = 'nurse_watch',
         nurse_recommendation = $1,
         watch_review_at = $2::timestamptz,
         final_triage_level = $3,
         override_reason = COALESCE($4, override_reason),
         overridden_by = CASE WHEN $5::boolean THEN $6 ELSE overridden_by END,
         overridden_at = CASE WHEN $5::boolean THEN NOW() ELSE overridden_at END,
         reviewing_nurse_id = COALESCE(reviewing_nurse_id, $6)
       WHERE id = $7 AND status IN ('under_review', 'nurse_watch')
       RETURNING *`,
      [rec, wr.toISOString(), fl, orText, bumpOverride, req.userId, id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Case not found or not in nurse review' });
    await logAudit({
      userId: req.userId,
      action: 'nurse_watch',
      resourceType: 'triage_case',
      resourceId: id,
      details: { watch_review_at: wr.toISOString() },
    });
    await learnFromNurseOverride(rows[0].automated_triage_level, rows[0].final_triage_level);
    const enriched = await fetchCaseEnriched(id);
    broadcastCaseRoom(id, { type: 'case-update', caseId: id, status: 'nurse_watch', nurse_recommendation: rec });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/nurse-complete', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const note = req.body?.nurse_recommendation != null ? String(req.body.nurse_recommendation).trim() : null;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET
         status = 'completed',
         completed_at = NOW(),
         nurse_completed_at = NOW(),
         nurse_completed_by = $2,
         watch_review_at = NULL,
         nurse_recommendation = COALESCE($3, nurse_recommendation)
       WHERE id = $1 AND status IN ('under_review', 'nurse_watch') AND concluded_by IS NULL
       RETURNING *`,
      [id, req.userId, note]
    );
    if (!rows[0]) return res.status(400).json({ error: 'Case not found or cannot be completed from this state' });
    await logAudit({ userId: req.userId, action: 'nurse_complete', resourceType: 'triage_case', resourceId: id });
    await learnFromNurseOverride(rows[0].automated_triage_level, rows[0].final_triage_level ?? rows[0].automated_triage_level);
    const enriched = await fetchCaseEnriched(id);
    broadcastCaseRoom(id, { type: 'case-update', caseId: id, status: 'completed' });
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/acknowledge-doctor-seek', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `UPDATE triage_cases SET doctor_seek_acknowledged_at = NOW()
       WHERE id = $1 AND doctor_seeking_patient_at IS NOT NULL
       RETURNING id`,
      [id]
    );
    if (!rows[0]) return res.status(400).json({ error: 'No doctor request to acknowledge' });
    const enriched = await fetchCaseEnriched(id);
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/doctor-request-patient', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const note = req.body?.note != null ? String(req.body.note).trim() : null;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET
         status = 'doctor_summoned',
         doctor_seeking_patient_at = NOW(),
         doctor_seeking_patient_by = $2,
         doctor_seeking_note = $3,
         doctor_seek_acknowledged_at = NULL
       WHERE id = $1 AND status = 'requested_doctor' AND concluded_by IS NULL
       RETURNING id, patient_id`,
      [id, req.userId, note]
    );
    if (!rows[0])
      return res.status(400).json({ error: 'Case not found, already summoned, or not in doctor review queue' });
    await logAudit({ userId: req.userId, action: 'doctor_seek_patient', resourceType: 'triage_case', resourceId: id, details: { note } });
    broadcastCaseRoom(id, {
      type: 'doctor-seek-patient',
      caseId: id,
      status: 'doctor_summoned',
      note,
      doctorId: req.userId,
    });
    res.json({ ok: true, id: rows[0].id, status: 'doctor_summoned' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { final_triage_level, override_reason, status, nurse_recommendation } = req.body || {};

    if (final_triage_level != null && (final_triage_level < 1 || final_triage_level > 5)) {
      return res.status(400).json({ error: 'final_triage_level must be 1-5' });
    }
    if (status != null && status !== 'under_review') {
      return res.status(400).json({ error: "Only status='under_review' is allowed here" });
    }

    const existing = await pool.query('SELECT * FROM triage_cases WHERE id = $1', [id]);
    const case_ = existing.rows[0];
    if (!case_) return res.status(404).json({ error: 'Case not found' });

    const reopening =
      status === 'under_review' &&
      (case_.status === 'requested_doctor' ||
        case_.status === 'doctor_summoned' ||
        (case_.status === 'completed' && !case_.concluded_at));

    const shouldUpdateOverride = final_triage_level != null || override_reason != null;
    const hasNurseRec = Object.prototype.hasOwnProperty.call(req.body || {}, 'nurse_recommendation');
    const nurseRecVal =
      hasNurseRec && nurse_recommendation != null && String(nurse_recommendation).trim()
        ? String(nurse_recommendation).trim()
        : hasNurseRec
          ? null
          : null;

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
        concluded_at = CASE WHEN $6::boolean THEN NULL ELSE concluded_at END,
        watch_review_at = CASE WHEN $6::boolean THEN NULL ELSE watch_review_at END,
        doctor_seeking_patient_at = CASE WHEN $6::boolean THEN NULL ELSE doctor_seeking_patient_at END,
        doctor_seeking_patient_by = CASE WHEN $6::boolean THEN NULL ELSE doctor_seeking_patient_by END,
        doctor_seeking_note = CASE WHEN $6::boolean THEN NULL ELSE doctor_seeking_note END,
        doctor_seek_acknowledged_at = CASE WHEN $6::boolean THEN NULL ELSE doctor_seek_acknowledged_at END,
        nurse_recommendation = CASE WHEN $8::boolean THEN $9 ELSE nurse_recommendation END,
        reviewing_nurse_id = COALESCE(reviewing_nurse_id, $7)
       WHERE id = $10
       RETURNING *`,
      [
        final_triage_level ?? null,
        override_reason ?? null,
        shouldUpdateOverride,
        req.userId,
        status ?? null,
        reopening,
        req.userId,
        hasNurseRec,
        nurseRecVal,
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

    const enriched = await fetchCaseEnriched(id);
    res.json(enriched || { ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level ?? updated.automated_triage_level] });
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
      `UPDATE triage_cases SET final_triage_level = $1, overridden_by = $2, overridden_at = NOW(), override_reason = $3, status = 'requested_doctor',
         reviewing_nurse_id = COALESCE(reviewing_nurse_id, $2), watch_review_at = NULL
       WHERE id = $4 AND status IN ('under_review', 'nurse_watch')
       RETURNING *`,
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
    await learnFromNurseOverride(updated.automated_triage_level, updated.final_triage_level);
    res.json({ ...updated, triage_label: TRIAGE_LABELS[updated.final_triage_level] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/complete', requireAuth, requireRole('nurse'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET status = 'requested_doctor', final_triage_level = COALESCE(final_triage_level, automated_triage_level),
         reviewing_nurse_id = COALESCE(reviewing_nurse_id, $2), watch_review_at = NULL
       WHERE id = $1 AND status IN ('under_review', 'nurse_watch')
       RETURNING *`,
      [id, req.userId]
    );
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found' });
    await logAudit({ userId: req.userId, action: 'triage_complete', resourceType: 'triage_case', resourceId: parseInt(id, 10) });
    await learnFromNurseOverride(updated.automated_triage_level, updated.final_triage_level);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function concludeCase(req, res) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE triage_cases SET concluded_by = $1, concluded_at = NOW(), status = 'completed', completed_at = NOW(),
          doctor_seeking_patient_at = NULL, doctor_seeking_patient_by = NULL, doctor_seeking_note = NULL, doctor_seek_acknowledged_at = NULL
       WHERE id = $2 AND status IN ('requested_doctor', 'doctor_summoned') AND concluded_by IS NULL
       RETURNING id`,
      [req.userId, id]
    );
    const updated = rows[0];
    if (!updated) return res.status(404).json({ error: 'Case not found or already concluded' });
    await logAudit({ userId: req.userId, action: 'doctor_conclude', resourceType: 'triage_case', resourceId: parseInt(id, 10) });
    broadcastCaseRoom(parseInt(id, 10), { type: 'case-update', caseId: parseInt(id, 10), status: 'completed' });
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.patch('/:id/conclude', requireAuth, requireRole('doctor'), concludeCase);

export { router as patientsRouter, concludeCase };
