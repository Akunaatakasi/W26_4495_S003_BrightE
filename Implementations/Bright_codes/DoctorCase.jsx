import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './DoctorCase.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function DoctorCase() {
  const { id } = useParams();
  const { authFetch } = useAuth();
  const [case_, setCase_] = useState(null);

  useEffect(() => {
    authFetch(`/patients/${id}`)
      .then((r) => parseJson(r))
      .then((data) => {
        if (data?.id) setCase_(data);
        else setCase_(null);
      })
      .catch(() => setCase_(null));
  }, [id, authFetch]);

  if (!case_) return <div className={styles.loading}>Loading case…</div>;

  const demographics = typeof case_.demographics === 'object' ? case_.demographics : {};
  const symptoms = Array.isArray(case_.symptoms) ? case_.symptoms : [];

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Link to="/doctor">← Completed list</Link>
      </div>
      <h1>Case #{case_.id} (completed)</h1>
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
        <h2>Triage (completed)</h2>
        <p><strong>Final level:</strong> Level {case_.final_triage_level ?? case_.automated_triage_level} – {case_.triage_label}</p>
        <p><strong>Automated level:</strong> {case_.automated_triage_level}</p>
        {case_.overridden_at && (
          <p className={styles.overrideNote}>
            Overridden on {formatDate(case_.overridden_at)}
            {case_.override_reason && ` — ${case_.override_reason}`}
          </p>
        )}
        <p><strong>Submitted:</strong> {formatDate(case_.submitted_at)} · <strong>Completed:</strong> {formatDate(case_.completed_at)}</p>
      </section>
      <div className={styles.actions}>
        <Link to="/doctor" className={styles.backBtn}>Back to completed list</Link>
      </div>
    </div>
  );
}
