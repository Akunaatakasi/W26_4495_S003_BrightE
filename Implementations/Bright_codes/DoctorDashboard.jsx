import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './DoctorDashboard.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import styles from './DoctorDashboard.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function truncate(text, max = 120) {
  if (!text || typeof text !== 'string') return '';
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function PatientCard({ c, subtitle }) {
  const level = c.final_triage_level ?? c.automated_triage_level;
  return (
    <Link to={`/doctor/case/${c.id}`} className={styles.cardLink}>
      <article className={styles.card}>
        <div className={styles.cardTop}>
          <span className={styles.level}>Level {level}</span>
          <span className={styles.triageLabel}>{c.triage_label || '—'}</span>
        </div>
        <h3 className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</h3>
        <p className={styles.patientLine}>
          <strong>{c.patient_name || 'Patient'}</strong>
          <span className={styles.emailMuted}>{c.patient_email ? ` · ${c.patient_email}` : ''}</span>
        </p>
        {c.handling_nurse_name ? (
          <p className={styles.metaRow}>
            <span className={styles.metaLabel}>Nurse</span> {c.handling_nurse_name}
          </p>
        ) : null}
        {c.self_reported_urgency != null ? (
          <p className={styles.metaRow}>
            <span className={styles.metaLabel}>Urgency</span> {c.self_reported_urgency}
          </p>
        ) : null}
        {c.nurse_recommendation ? (
          <p className={styles.recSnippet}>{truncate(c.nurse_recommendation, 140)}</p>
        ) : null}
        {subtitle ? <p className={styles.cardFoot}>{subtitle}</p> : null}
      </article>
    </Link>
  );
}

export default function DoctorDashboard() {
  const [underReview, setUnderReview] = useState([]);
  const [summoned, setSummoned] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeTab, setActiveTab] = useState('review');
  const { authFetch } = useAuth();
  const intervalRef = useRef(null);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [reviewRes, summonedRes, historyRes] = await Promise.all([
        authFetch('/patients/completed'),
        authFetch('/patients/doctor-summoned'),
        authFetch('/patients/doctor-history'),
      ]);
      const reviewData = await parseJson(reviewRes);
      const summonedData = await parseJson(summonedRes);
      const historyData = await parseJson(historyRes);
      setUnderReview(Array.isArray(reviewData) ? reviewData : []);
      setSummoned(Array.isArray(summonedData) ? summonedData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
      setLastUpdated(new Date());
    } catch (e) {
      setUnderReview([]);
      setSummoned([]);
      setHistory([]);
      setError(e?.message || 'Failed to load doctor queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authFetch]);

  useEffect(() => {
    const startInterval = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        if (document.visibilityState === 'visible') load({ initial: false });
      }, 30000);
    };
    const stopInterval = () => {
      if (!intervalRef.current) return;
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };

    load({ initial: true });
    startInterval();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        load({ initial: false });
        startInterval();
      } else {
        stopInterval();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  if (loading) return <div className={styles.loading}>Loading doctor queue…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.headRow}>
        <div className={styles.head}>
          <h1>Doctor dashboard</h1>
        </div>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => load({ initial: false })}
            disabled={refreshing}
            title="Refresh"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className={styles.lastUpdated} aria-live="polite">
            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Not updated yet'}
          </div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <p className={styles.intro}>
        <strong>Under review</strong> lists every case nursing sent for doctor review. Open a card for full details and
        nurse recommendations. Use <strong>Request patient at desk</strong> when you are ready to see someone — the nurse
        and patient are notified and the case moves to <strong>Requested</strong>. When you are finished, mark the case
        complete; it then appears in <strong>History</strong>.
      </p>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'review' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('review')}
        >
          Under review ({underReview.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'requested' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('requested')}
        >
          Requested ({summoned.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'history' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Completed / history ({history.length})
        </button>
      </div>

      {activeTab === 'review' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Under review</h2>
          <p className={styles.hint}>
            Cases awaiting your review. Status changes only when you request the patient or mark the case complete.
          </p>
          {underReview.length === 0 ? (
            <p className={styles.empty}>No cases under review.</p>
          ) : (
            <ul className={styles.cardGrid}>
              {underReview.map((c) => (
                <li key={c.id}>
                  <PatientCard
                    c={c}
                    subtitle={`Submitted ${formatDate(c.submitted_at)} · Nurse queue completed ${formatDate(c.completed_at)}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'requested' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Requested — patient should come to the desk</h2>
          <p className={styles.hint}>
            You asked for these patients. Mark complete after you have seen them.
          </p>
          {summoned.length === 0 ? (
            <p className={styles.empty}>No requested patients right now. Request someone from a case under review.</p>
          ) : (
            <ul className={styles.cardGrid}>
              {summoned.map((c) => (
                <li key={c.id}>
                  <PatientCard
                    c={c}
                    subtitle={`Requested ${formatDate(c.doctor_seeking_patient_at)}${c.doctor_seeking_note ? ` · ${truncate(c.doctor_seeking_note, 80)}` : ''}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'history' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Completed / history</h2>
          <p className={styles.hint}>Cases you concluded, with the nurse who triaged and your name as the doctor.</p>
          {history.length === 0 ? (
            <p className={styles.empty}>No completed cases yet.</p>
          ) : (
            <ul className={styles.cardGrid}>
              {history.map((c) => (
                <li key={c.id}>
                  <Link to={`/doctor/case/${c.id}`} className={styles.cardLink}>
                    <article className={`${styles.card} ${styles.historyCard}`}>
                      <div className={styles.cardTop}>
                        <span className={styles.level}>
                          Level {c.final_triage_level ?? c.automated_triage_level}
                        </span>
                        <span className={styles.triageLabel}>{c.triage_label || '—'}</span>
                      </div>
                      <h3 className={styles.complaint}>{c.chief_complaint || '—'}</h3>
                      <p className={styles.patientLine}>
                        <strong>{c.patient_name || 'Patient'}</strong>
                      </p>
                      <p className={styles.metaRow}>
                        <span className={styles.metaLabel}>Nurse</span>{' '}
                        {c.handling_nurse_name || '—'}
                      </p>
                      <p className={styles.metaRow}>
                        <span className={styles.metaLabel}>Doctor</span> {c.doctor_name || '—'}
                      </p>
                      <p className={styles.cardFoot}>Concluded {formatDate(c.concluded_at)}</p>
                    </article>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

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
