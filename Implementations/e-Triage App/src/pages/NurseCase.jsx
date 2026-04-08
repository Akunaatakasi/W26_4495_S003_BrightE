import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import { predictPriority } from '../utils/priorityModel';
import { createRealtimeSocket, roomForCase, sendWs } from '../utils/realtime';
import NurseCall from '../components/NurseCall';
import { PhoneIcon, LaptopIcon } from '../components/CallIcons';
import styles from './NurseCase.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function toDatetimeLocalValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TRIAGE_LEVELS = [
  { value: 1, label: 'Level 1 – Immediate (life-saving)' },
  { value: 2, label: 'Level 2 – High risk / time-critical' },
  { value: 3, label: 'Level 3 – Stable, multiple resources' },
  { value: 4, label: 'Level 4 – Stable, single resource' },
  { value: 5, label: 'Level 5 – Stable, minimal resources' },
];

export default function NurseCase() {
  const { id } = useParams();
  const { authFetch, token } = useAuth();
  const [case_, setCase_] = useState(null);
  const [editLevel, setEditLevel] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [nurseRec, setNurseRec] = useState('');
  const [watchAtLocal, setWatchAtLocal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null);

  const loadCase = () => {
    authFetch(`/patients/${id}`)
      .then((r) => parseJson(r))
      .then((data) => {
        if (data?.id) {
          setCase_(data);
          setEditLevel(data.final_triage_level ?? data.automated_triage_level);
          setEditReason(data.override_reason || '');
          setNurseRec(data.nurse_recommendation || '');
          setWatchAtLocal(toDatetimeLocalValue(data.watch_review_at) || '');
        } else setCase_(null);
      })
      .catch(() => setCase_(null));
  };

  useEffect(() => {
    loadCase();
  }, [id, authFetch]);

  const broadcastTriageUpdate = (updatedCase, reason) => {
    if (!updatedCase?.id || !token) return;
    const ws = createRealtimeSocket(token);
    const roomId = roomForCase(updatedCase.id);
    ws.onopen = () => {
      sendWs(ws, { type: 'join-room', roomId });
      setTimeout(() => {
        sendWs(ws, {
          type: 'triage-update',
          level: updatedCase.final_triage_level ?? updatedCase.automated_triage_level,
          reason: reason || updatedCase.override_reason || null,
          status: updatedCase.status || null,
        });
        ws.close();
      }, 120);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch (_) {}
    };
  };

  const handleOpenCase = async () => {
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/open`, { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      setEditLevel(data.final_triage_level ?? data.automated_triage_level);
      setEditReason(data.override_reason || '');
      setNurseRec(data.nurse_recommendation || '');
      setMessage('Case opened — you can add a recommendation and choose next steps.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const level = editLevel ?? case_?.automated_triage_level ?? 5;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_triage_level: level,
          override_reason: editReason || undefined,
          nurse_recommendation: nurseRec,
        }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setCase_(data);
      broadcastTriageUpdate(data, editReason);
      setMessage('Review saved. The patient will see your recommendation on their dashboard.');
    } catch (err) {
      setMessage(err.message || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetWatch = async (e) => {
    e.preventDefault();
    if (!nurseRec.trim()) {
      setMessage('Enter a patient-facing recommendation before setting watch.');
      return;
    }
    if (!watchAtLocal) {
      setMessage('Choose the next review date and time.');
      return;
    }
    const iso = new Date(watchAtLocal).toISOString();
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/watch`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nurse_recommendation: nurseRec.trim(),
          watch_review_at: iso,
          final_triage_level: editLevel ?? case_?.automated_triage_level,
          override_reason: editReason || undefined,
        }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      setWatchAtLocal(toDatetimeLocalValue(data.watch_review_at) || '');
      broadcastTriageUpdate(data, nurseRec);
      setMessage('Watch set — patient sees your advice; you will be alerted when follow-up is due.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNurseComplete = async () => {
    if (!window.confirm('Mark this case complete? Use when the patient is better and did not self-close the request.')) return;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/nurse-complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nurse_recommendation: nurseRec.trim() || undefined }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      broadcastTriageUpdate(data, nurseRec);
      setMessage('Case marked complete by nursing.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAckDoctorSeek = async () => {
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/acknowledge-doctor-seek`, { method: 'PATCH' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      setMessage('Acknowledged — invite the patient to see the doctor.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverride = async (e) => {
    e.preventDefault();
    const level = editLevel ?? case_?.automated_triage_level ?? 5;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/override`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_triage_level: level, override_reason: editReason || undefined }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Override failed');
      setCase_(data);
      broadcastTriageUpdate(data, editReason);
      setMessage('Case forwarded to the doctor queue.');
    } catch (err) {
      setMessage(err.message || 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteNoOverride = async () => {
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}/complete`, { method: 'PATCH' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      broadcastTriageUpdate(data, editReason);
      setMessage('Automated level accepted; case forwarded to the doctor queue.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReopen = async () => {
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'under_review' }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Failed');
      setCase_(data);
      broadcastTriageUpdate(data, editReason);
      setEditLevel(data.final_triage_level ?? data.automated_triage_level);
      setEditReason(data.override_reason || '');
      setNurseRec(data.nurse_recommendation || '');
      setMessage('Case reopened for nurse review.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!case_) return <div className={styles.loading}>Loading case…</div>;

  const demographics = typeof case_.demographics === 'object' ? case_.demographics : {};
  const symptoms = Array.isArray(case_.symptoms) ? case_.symptoms : [];
  const canAct = ['under_review', 'nurse_watch'].includes(case_.status);
  const doctorSeekPending = case_.doctor_seeking_patient_at && !case_.doctor_seek_acknowledged_at;

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Link to="/nurse">← Nurse Dashboard</Link>
      </div>

      <h1>Case #{case_.id}</h1>

      {doctorSeekPending && (
        <div className={styles.doctorSeekBanner} role="alert">
          <strong>Doctor is requesting this patient</strong>
          {case_.doctor_seeking_doctor_name ? ` (${case_.doctor_seeking_doctor_name})` : ''}.
          {case_.doctor_seeking_note ? ` Note: ${case_.doctor_seeking_note}` : ''} Invite them to the clinical area when ready.
          <button type="button" className={styles.ackSeekBtn} onClick={handleAckDoctorSeek} disabled={submitting}>
            Acknowledge
          </button>
        </div>
      )}

      <div className={styles.grid}>
        <section className={styles.info}>
          <h2>Patient information</h2>
          <p>
            <strong>Name:</strong> {case_.patient_name || '—'}
          </p>
          <p>
            <strong>Email:</strong> {case_.patient_email}
          </p>
          {demographics.age && (
            <p>
              <strong>Age:</strong> {demographics.age}
            </p>
          )}
          {demographics.gender && (
            <p>
              <strong>Gender:</strong> {demographics.gender}
            </p>
          )}
        </section>

        <section className={styles.info}>
          <h2>Clinical summary</h2>
          <p>
            <strong>Chief complaint:</strong> {case_.chief_complaint || '—'}
          </p>
          <p>
            <strong>Self-reported urgency:</strong> {case_.self_reported_urgency ?? '—'}
          </p>
          {symptoms.length > 0 && (
            <p>
              <strong>Symptoms:</strong> {symptoms.join(', ')}
            </p>
          )}
        </section>
      </div>

      <section className={styles.triage}>
        <h2>Nurse review</h2>
        {(() => {
          const ml =
            case_.ml_level != null && case_.ml_confidence != null
              ? { level: case_.ml_level, confidence: case_.ml_confidence }
              : predictPriority(case_);
          return (
            <p className={styles.mlSuggestion}>
              <strong>ML suggestion:</strong> Level {ml.level} ({Math.round(ml.confidence * 100)}% confidence) — review and adjust if needed.
            </p>
          );
        })()}
        <p>
          <strong>Automated level:</strong> {case_.automated_triage_level} – {case_.triage_label}
        </p>
        {case_.overridden_at && (
          <p className={styles.overrideNote}>
            Nurse adjusted to Level {case_.final_triage_level} on {formatDate(case_.overridden_at)}
            {case_.override_reason && ` — ${case_.override_reason}`}
          </p>
        )}
        <p>
          <strong>Current status:</strong> {String(case_.status).replace(/_/g, ' ')}
        </p>
        {case_.status === 'nurse_watch' && case_.watch_review_at && (
          <p>
            <strong>Next watch review:</strong> {formatDate(case_.watch_review_at)}
          </p>
        )}
        <p>
          <strong>Submitted:</strong> {formatDate(case_.submitted_at)} · <strong>First reviewed:</strong> {formatDate(case_.first_reviewed_at)}
        </p>
      </section>

      <section className={styles.video}>
        <h2>Audio & video consultation</h2>
        <p className={styles.placeholder}>Call the patient if needed before you record recommendations or change status.</p>
        <div className={styles.callActions}>
          <button type="button" className={styles.callActionBtn} onClick={() => setActiveCall({ mode: 'audio' })}>
            <PhoneIcon /> Phone call
          </button>
          <button type="button" className={styles.callActionBtn} onClick={() => setActiveCall({ mode: 'video' })}>
            <LaptopIcon /> Video call
          </button>
        </div>
      </section>

      {activeCall && (
        <NurseCall
          patientName={case_.patient_name || case_.patient_email || 'Patient'}
          caseId={case_.id}
          mode={activeCall.mode}
          onClose={() => setActiveCall(null)}
        />
      )}

      <section className={styles.actions}>
        <h2>Recommendation & actions</h2>
        <p className={styles.helperText}>
          The <strong>patient-facing recommendation</strong> appears prominently on the patient’s dashboard. Internal notes can go in “Nurse notes / reason”.
        </p>

        {message && <div className={styles.message}>{message}</div>}

        {case_.status === 'submitted' && (
          <div className={styles.openBanner}>
            <p>This request has not been opened yet. Open it to start your review.</p>
            <button type="button" className={styles.openCaseBtn} onClick={handleOpenCase} disabled={submitting}>
              Open case for review
            </button>
          </div>
        )}

        <form onSubmit={handleSaveEdit} className={styles.form}>
          <label className={styles.recLabel}>
            Patient-facing recommendation
            <textarea
              value={nurseRec}
              onChange={(e) => setNurseRec(e.target.value)}
              placeholder="Clear instructions the patient should follow (medications, when to seek urgent care, etc.)…"
              rows={5}
              disabled={case_.status === 'submitted'}
            />
          </label>

          <label>
            Triage level
            <select
              value={editLevel ?? case_.automated_triage_level}
              onChange={(e) => setEditLevel(parseInt(e.target.value, 10))}
              disabled={case_.status === 'submitted'}
            >
              {TRIAGE_LEVELS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Nurse notes / reason (optional, clinical)
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Internal reasoning or triage note…"
              disabled={case_.status === 'submitted'}
            />
          </label>

          {canAct && (
            <label>
              Next review time (for watch)
              <input
                type="datetime-local"
                value={watchAtLocal}
                onChange={(e) => setWatchAtLocal(e.target.value)}
              />
            </label>
          )}

          <div className={styles.buttons}>
            {canAct && (
              <button type="submit" disabled={submitting}>
                Save recommendation
              </button>
            )}

            {canAct && (
              <>
                <button type="button" className={styles.watchBtn} onClick={handleSetWatch} disabled={submitting}>
                  Set / update watch
                </button>
                <button type="button" className={styles.primary} onClick={handleOverride} disabled={submitting}>
                  Forward to doctor (with triage level)
                </button>
                <button type="button" className={styles.secondary} onClick={handleCompleteNoOverride} disabled={submitting}>
                  Accept ML level & forward to doctor
                </button>
                <button type="button" className={styles.completeBtn} onClick={handleNurseComplete} disabled={submitting}>
                  Mark complete (patient better)
                </button>
              </>
            )}

            {(case_.status === 'requested_doctor' ||
              case_.status === 'doctor_summoned' ||
              (case_.status === 'completed' && !case_.concluded_at)) && (
              <button type="button" className={styles.secondary} onClick={handleReopen} disabled={submitting}>
                Reopen for nurse review
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
