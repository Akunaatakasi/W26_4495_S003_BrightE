import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseJson } from '../utils/api';
import styles from './PublicQueue.module.css';

function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

export default function PublicQueue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/triage/public-queue')
      .then((r) => parseJson(r))
      .then((d) => {
        if (!cancelled) {
          if (d.error) setError(d.error);
          else setData(d);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the queue.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.title}>Emergency department — remote triage queue</h1>
      <p className={styles.intro}>
        Public view only: how many cases are waiting, in progress, or concluded. No names, emails, or clinical
        narratives are shown.
      </p>

      {error && <div className={styles.error}>{error}</div>}

      {data?.summary && (
        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{data.summary.pending}</span>
            <span className={styles.statLabel}>Pending</span>
            <span className={styles.statHint}>Waiting for first nurse contact</span>
          </div>
          <div className={`${styles.stat} ${styles.statActive}`}>
            <span className={styles.statValue}>{data.summary.active}</span>
            <span className={styles.statLabel}>Active</span>
            <span className={styles.statHint}>In review or awaiting doctor</span>
          </div>
          <div className={`${styles.stat} ${styles.statDone}`}>
            <span className={styles.statValue}>{data.summary.concluded}</span>
            <span className={styles.statLabel}>Concluded</span>
            <span className={styles.statHint}>Closed, withdrawn, or doctor concluded (all time)</span>
          </div>
        </div>
      )}

      {data?.slots?.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.h2}>In the pipeline (anonymized)</h2>
          <p className={styles.note}>{data.note}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Phase</th>
                  <th>Level</th>
                  <th>Last activity</th>
                </tr>
              </thead>
              <tbody>
                {data.slots.map((row) => (
                  <tr key={row.ref}>
                    <td className={styles.mono}>{row.ref}</td>
                    <td>
                      <span className={styles.phase} data-phase={row.phase}>
                        {row.phase}
                      </span>
                    </td>
                    <td>{row.display_level}</td>
                    <td className={styles.time}>{formatTime(row.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className={styles.footer}>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
