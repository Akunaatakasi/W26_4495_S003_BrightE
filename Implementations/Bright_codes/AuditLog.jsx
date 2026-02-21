import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './AuditLog.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const { authFetch } = useAuth();

  useEffect(() => {
    authFetch('/audit?limit=100')
      .then((r) => parseJson(r))
      .then((data) => setEntries(Array.isArray(data) ? data : []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [authFetch]);

  if (loading) return <div className={styles.loading}>Loading audit log…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1>Audit log</h1>
        <Link to="/nurse">← Queue</Link>
      </div>
      <p className={styles.intro}>Recent actions for accountability and traceability. Nurse-only.</p>
      {entries.length === 0 ? (
        <p className={styles.empty}>No audit entries yet.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className={styles.mono}>{formatDate(e.created_at)}</td>
                  <td>{e.email || e.user_id}</td>
                  <td>{e.action}</td>
                  <td>{e.resource_type} {e.resource_id != null ? `#${e.resource_id}` : ''}</td>
                  <td>{e.details && Object.keys(e.details).length > 0 ? JSON.stringify(e.details) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
