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
  const [loading, setLoading] = useState(true);
  const { authFetch, token } = useAuth();

  const load = () => {
    authFetch('/patients/completed')
      .then((r) => parseJson(r))
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCompleted(list);
      })
      .catch(() => setCompleted([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [authFetch, token]);

  if (loading) return <div className={styles.loading}>Loading completed triage…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1>Doctor dashboard</h1>
      </div>
      <p className={styles.intro}>
        View completed triage cases only. Request one patient at a time to review their case.
      </p>
      {completed.length === 0 ? (
        <p className={styles.empty}>No completed triage cases.</p>
      ) : (
        <section className={styles.section}>
          <h2>Completed triage ({completed.length})</h2>
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
    </div>
  );
}
