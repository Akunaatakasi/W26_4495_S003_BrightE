import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './PatientDashboard.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function PatientDashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const { authFetch } = useAuth();

  useEffect(() => {
    authFetch('/patients/my-cases')
      .then((r) => parseJson(r))
      .then((data) => setCases(Array.isArray(data) ? data : []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, [authFetch]);

  if (loading) return <div className={styles.loading}>Loading your cases…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1>My triage cases</h1>
        <Link to="/triage/new" className={styles.newBtn}>New triage</Link>
      </div>
      {cases.length === 0 ? (
        <p className={styles.empty}>No triage submissions yet. <Link to="/triage/new">Start a remote triage</Link>.</p>
      ) : (
        <ul className={styles.list}>
          {cases.map((c) => (
            <li key={c.id} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.id}>#{c.id}</span>
                <span className={styles.status} data-status={c.status}>{c.status}</span>
              </div>
              <p className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</p>
              <p className={styles.level}>{c.triage_label}</p>
              <p className={styles.date}>Submitted {formatDate(c.submitted_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
