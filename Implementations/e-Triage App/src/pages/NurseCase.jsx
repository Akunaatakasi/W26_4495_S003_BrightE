import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import { predictPriority } from '../utils/priorityModel';
import NurseCall from '../components/NurseCall';
import { PhoneIcon, LaptopIcon } from '../components/CallIcons';
import styles from './NurseCase.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
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
  const { authFetch } = useAuth();
  const [case_, setCase_] = useState(null);
  const [editLevel, setEditLevel] = useState(null);
  const [editReason, setEditReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [activeCall, setActiveCall] = useState(null); // { mode: 'audio'|'video' }

  useEffect(() => {
    authFetch(`/patients/${id}`)
      .then((r) => parseJson(r))
      .then((data) => {
        if (data?.id) {
          setCase_(data);
          setEditLevel(data.final_triage_level ?? data.automated_triage_level);
          setEditReason(data.override_reason || '');
        } else setCase_(null);
      })
      .catch(() => setCase_(null));
  }, [id, authFetch]);

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const level = editLevel ?? case_?.automated_triage_level ?? 5;
    setSubmitting(true);
    setMessage('');
    try {
      const res = await authFetch(`/patients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_triage_level: level, override_reason: editReason || undefined }),
      });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setCase_(data);
      setMessage('Changes saved.');
    } catch (err) {
      setMessage(err.message || 'Update failed');
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
      setMessage('Triage level updated and case marked completed.');
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
      setMessage('Case marked completed with automated level.');
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
      setEditLevel(data.final_triage_level ?? data.automated_triage_level);
      setEditReason(data.override_reason || '');
      setMessage('Case reopened for review.');
    } catch (err) {
      setMessage(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!case_) return <div className={styles.loading}>Loading case…</div>;

  const demographics = typeof case_.demographics === 'object' ? case_.demographics : {};
  const symptoms = Array.isArray(case_.symptoms) ? case_.symptoms : [];

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Link to="/nurse">← Queue</Link>
      </div>
      <h1>Case #{case_.id}</h1>
      <div className={styles.grid}>
        <section className={styles.info}>
          <h2>Patient</h2>
          <p><strong>Name:</strong> {case_.patient_name || '—'}</p>
          <p><strong>Email:</strong> {case_.patient_email}</p>
          {demographics.age && <p><strong>Age:</strong> {demographics.age}</p>}
          {demographics.gender && <p><strong>Gender:</strong> {demographics.gender}</p>}
        </section>
        <section className={styles.info}>
          <h2>Clinical</h2>
          <p><strong>Chief complaint:</strong> {case_.chief_complaint || '—'}</p>
          <p><strong>Self-reported urgency:</strong> {case_.self_reported_urgency ?? '—'}</p>
          {symptoms.length > 0 && (
            <p><strong>Symptoms:</strong> {symptoms.join(', ')}</p>
          )}
        </section>
      </div>
      <section className={styles.triage}>
        <h2>Triage</h2>
        {(() => {
          const ml = case_.ml_level != null && case_.ml_confidence != null
            ? { level: case_.ml_level, confidence: case_.ml_confidence }
            : predictPriority(case_);
          return (
            <p className={styles.mlSuggestion}>
              <strong>ML priority:</strong> Level {ml.level} ({Math.round(ml.confidence * 100)}% confidence) — supervise and override if needed.
            </p>
          );
        })()}
        <p><strong>Automated level:</strong> {case_.automated_triage_level} – {case_.triage_label}</p>
        {case_.overridden_at && (
          <p className={styles.overrideNote}>
            Overridden to Level {case_.final_triage_level} on {formatDate(case_.overridden_at)}
            {case_.override_reason && ` — ${case_.override_reason}`}
          </p>
        )}
        <p><strong>Status:</strong> {case_.status}</p>
        <p><strong>Submitted:</strong> {formatDate(case_.submitted_at)} · <strong>First reviewed:</strong> {formatDate(case_.first_reviewed_at)}</p>
      </section>

      <section className={styles.video}>
        <h2>Audio & video consultation</h2>
        <p className={styles.placeholder}>Call the patient to assess acuity and reorder by professional instinct. Document the outcome in the override reason if needed.</p>
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
        <h2>Supervise & override</h2>
        {message && <div className={styles.message}>{message}</div>}
        <form onSubmit={handleSaveEdit} className={styles.form}>
          <label>
            Triage level
            <select value={editLevel ?? case_.automated_triage_level} onChange={(e) => setEditLevel(parseInt(e.target.value, 10))}>
              {TRIAGE_LEVELS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            Override reason (optional)
            <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Clinical justification…" />
          </label>
          <div className={styles.buttons}>
            <button type="submit" disabled={submitting}>Save changes</button>
            {case_.status !== 'completed' && (
              <>
                <button type="button" className={styles.primary} onClick={handleOverride} disabled={submitting}>
                  Confirm & complete
                </button>
                <button type="button" className={styles.secondary} onClick={handleCompleteNoOverride} disabled={submitting}>
                  Accept automated level & complete
                </button>
              </>
            )}
            {case_.status === 'completed' && (
              <button type="button" className={styles.secondary} onClick={handleReopen} disabled={submitting}>
                Reopen for review
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
