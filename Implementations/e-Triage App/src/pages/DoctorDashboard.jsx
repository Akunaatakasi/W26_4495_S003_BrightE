import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './DoctorDashboard.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function DoctorDashboard() {
  const [completed, setCompleted] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const { authFetch } = useAuth();

  const load = () => {
    Promise.all([
      authFetch('/patients/completed').then((r) => parseJson(r)).then((data) => (Array.isArray(data) ? data : [])),
      authFetch('/patients/doctor-history').then((r) => parseJson(r)).then((data) => (Array.isArray(data) ? data : [])),
    ])
      .then(([completedList, historyList]) => {
        setCompleted(completedList);
        setHistory(historyList);
      })
      .catch(() => {
        setCompleted([]);
        setHistory([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [authFetch]);

  if (loading) return <div className={styles.loading}>Loading completed triage…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1>Doctor dashboard</h1>
      </div>
      <p className={styles.intro}>
        View completed triage cases only. Request one patient at a time to review their case.
      </p>
      {completed.length === 0 && history.length === 0 ? (
        <p className={styles.empty}>No completed triage cases. Your concluded cases will appear in history below.</p>
      ) : null}
      {completed.length > 0 && (
        <section className={styles.section}>
          <h2>Completed triage ({completed.length})</h2>
          <p className={styles.hint}>Request one patient at a time. When done, click &quot;Done&quot; to return here; that case will move to your history.</p>
          <ul className={styles.list}>
            {completed.map((c) => (
              <li key={c.id} className={styles.card}>
                <div className={styles.cardInfo}>
                  <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
                  <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
                  <span className={styles.meta}>{c.patient_name || c.patient_email} · Completed {formatDate(c.completed_at)}</span>
                </div>
                <Link to={`/doctor/case/${c.id}`} className={styles.requestBtn}>
                  Request patient
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {history.length > 0 && (
        <section className={styles.section}>
          <h2>Your history ({history.length})</h2>
          <p className={styles.hint}>Cases you have concluded — no longer in the list above.</p>
          <ul className={styles.historyList}>
            {history.map((c) => (
              <li key={c.id} className={styles.historyCard}>
                <span className={styles.historyName}>{c.patient_name || c.patient_email}</span>
                <span className={styles.historyMeta}>{c.chief_complaint || '—'} · Concluded {formatDate(c.concluded_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
