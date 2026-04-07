import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './DoctorCase.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function DoctorCase() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const [case_, setCase_] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [concluding, setConcluding] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seekNote, setSeekNote] = useState('');

  const loadCase = useCallback(async () => {
    setLoadError('');
    try {
      const res = await authFetch(`/patients/${id}`);
      const data = await parseJson(res);
      if (data?.id) setCase_(data);
      else {
        setCase_(null);
        setLoadError(data?.error || 'Case not found.');
      }
    } catch (e) {
      setCase_(null);
      setLoadError(e?.message || 'Failed to load case.');
    }
  }, [id, authFetch]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  const handleRequestPatient = async () => {
    if (!case_ || case_.status !== 'requested_doctor') return;
    setRequesting(true);
    try {
      const res = await authFetch(`/patients/${id}/doctor-request-patient`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: seekNote.trim() || undefined }),
      });
      const data = await parseJson(res);
      if (res.ok && data?.ok) {
        setSeekNote('');
        await loadCase();
        return;
      }
      let msg = data?.error || 'Could not request patient';
      if (data?.method && data?.path) msg = `${msg}\n${data.method} ${data.path}`;
      alert(msg);
    } catch {
      alert('Could not request patient');
    } finally {
      setRequesting(false);
    }
  };

  const handleMarkComplete = async () => {
    if (!case_ || !['requested_doctor', 'doctor_summoned'].includes(case_.status)) return;
    setConcluding(true);
    try {
      const res = await authFetch(`/patients/${id}/conclude`, { method: 'PATCH' });
      const data = await parseJson(res);
      if (res.ok && (data?.ok || data?.concluded_at)) {
        navigate('/doctor');
        return;
      }
      let msg = data?.error || 'Failed to finish case';
      if (data?.method && data?.path) msg = `${msg}\n${data.method} ${data.path}`;
      alert(msg);
    } catch {
      alert('Failed to finish case');
    } finally {
      setConcluding(false);
    }
  };

  if (loadError && !case_) {
    return (
      <div className={styles.wrap}>
        <div className={styles.back}>
          <Link to="/doctor">← Doctor dashboard</Link>
        </div>
        <p className={styles.loadError}>{loadError}</p>
      </div>
    );
  }

  if (!case_) return <div className={styles.loading}>Loading case…</div>;

  const demographics = typeof case_.demographics === 'object' ? case_.demographics : {};
  const symptoms = Array.isArray(case_.symptoms) ? case_.symptoms : [];
  const canRequest = case_.status === 'requested_doctor' && !case_.concluded_at;
  const canComplete =
    (case_.status === 'requested_doctor' || case_.status === 'doctor_summoned') && !case_.concluded_at;

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Link to="/doctor">← Doctor dashboard</Link>
      </div>

      <h1>Case #{case_.id}</h1>
      <p className={styles.statusLine}>
        <span className={styles.statusBadge} data-status={case_.status}>
          {case_.status === 'requested_doctor' && 'Under review (doctor)'}
          {case_.status === 'doctor_summoned' && 'Patient requested at desk'}
          {case_.status === 'completed' && case_.concluded_at && 'Concluded'}
          {!['requested_doctor', 'doctor_summoned'].includes(case_.status) && case_.status}
        </span>
      </p>

      <div className={styles.grid}>
        <section className={styles.info}>
          <h2>Patient</h2>
          <p>
            <strong>Name:</strong> {case_.patient_name || '—'}
          </p>
          <p>
            <strong>Email:</strong> {case_.patient_email}
          </p>
          {demographics.age ? (
            <p>
              <strong>Age:</strong> {demographics.age}
            </p>
          ) : null}
          {demographics.gender ? (
            <p>
              <strong>Gender:</strong> {demographics.gender}
            </p>
          ) : null}
        </section>

        <section className={styles.info}>
          <h2>Clinical summary</h2>
          <p>
            <strong>Chief complaint:</strong> {case_.chief_complaint || '—'}
          </p>
          <p>
            <strong>Self-reported urgency:</strong> {case_.self_reported_urgency ?? '—'}
          </p>
          {symptoms.length > 0 ? (
            <p>
              <strong>Symptoms:</strong> {symptoms.join(', ')}
            </p>
          ) : null}
        </section>
      </div>

      <section className={styles.nurseBlock}>
        <h2>Nursing input</h2>
        {case_.handling_nurse_name ? (
          <p className={styles.nurseMeta}>
            <strong>Handling nurse:</strong> {case_.handling_nurse_name}
          </p>
        ) : null}
        {case_.nurse_recommendation ? (
          <div className={styles.nurseRec}>
            <p className={styles.nurseRecTitle}>Recommendation to patient (before doctor)</p>
            <p className={styles.nurseRecBody}>{case_.nurse_recommendation}</p>
          </div>
        ) : (
          <p className={styles.muted}>No nurse recommendation recorded.</p>
        )}
        {case_.overridden_at ? (
          <p className={styles.overrideNote}>
            Nurse updated triage on {formatDate(case_.overridden_at)}
            {case_.override_reason ? ` — ${case_.override_reason}` : ''}
          </p>
        ) : null}
      </section>

      <section className={styles.triage}>
        <h2>Triage</h2>
        <p>
          <strong>Reviewed level:</strong> Level {case_.final_triage_level ?? case_.automated_triage_level} –{' '}
          {case_.triage_label}
        </p>
        <p>
          <strong>Automated level:</strong> {case_.automated_triage_level}
        </p>
        <p>
          <strong>Submitted:</strong> {formatDate(case_.submitted_at)} ·{' '}
          <strong>Nurse completed queue step:</strong> {formatDate(case_.completed_at)}
        </p>
      </section>

      {case_.status === 'doctor_summoned' && case_.doctor_seeking_patient_at ? (
        <section className={styles.info}>
          <h2>Desk request</h2>
          <p>
            <strong>Requested at:</strong> {formatDate(case_.doctor_seeking_patient_at)}
          </p>
          {case_.doctor_seeking_doctor_name ? (
            <p>
              <strong>Requested by:</strong> {case_.doctor_seeking_doctor_name}
            </p>
          ) : null}
          {case_.doctor_seeking_note ? (
            <p>
              <strong>Your note to staff:</strong> {case_.doctor_seeking_note}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className={styles.actions}>
        {canRequest ? (
          <div className={styles.requestRow}>
            <label className={styles.noteLabel} htmlFor="take_seek_note">
              Optional note to nursing desk (shown to staff)
            </label>
            <textarea
              id="take_seek_note"
              className={styles.noteInput}
              rows={2}
              value={seekNote}
              onChange={(e) => setSeekNote(e.target.value)}
              placeholder="e.g. Room 2 when ready"
            />
            <button
              type="button"
              className={styles.requestBtn}
              onClick={handleRequestPatient}
              disabled={requesting}
            >
              {requesting ? 'Sending…' : 'Request patient at desk'}
            </button>
            <p className={styles.helperText}>
              This notifies the nurse and patient and moves the case to your &quot;Requested&quot; list. You can still
              open full details here afterwards.
            </p>
          </div>
        ) : null}

        {canComplete ? (
          <button type="button" className={styles.doneBtn} onClick={handleMarkComplete} disabled={concluding}>
            {concluding ? 'Completing…' : 'Mark case complete'}
          </button>
        ) : null}

        {!canRequest && !canComplete && case_.concluded_at ? (
          <p className={styles.helperText}>This case is closed. It appears in your history on the dashboard.</p>
        ) : null}

        {!canRequest && !canComplete && !case_.concluded_at ? (
          <p className={styles.helperText}>
            This case is not in the doctor review workflow from here (wrong status or already updated). Return to the
            dashboard.
          </p>
        ) : null}

        <Link to="/doctor" className={styles.backBtn}>
          Back to dashboard
        </Link>
      </section>
    </div>
  );
}
