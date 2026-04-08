import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import { getQueueOrder, setQueueOrder } from '../utils/mockApi';
import { predictPriority } from '../utils/priorityModel';
import NurseCall from '../components/NurseCall';
import { PhoneIcon, LaptopIcon } from '../components/CallIcons';
import styles from './NurseDashboard.module.css';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function sortByOrder(cases, orderIds) {
  const orderMap = new Map(orderIds.map((id, i) => [id, i]));
  return [...cases].sort((a, b) => {
    const ai = orderMap.get(a.id) ?? 9999;
    const bi = orderMap.get(b.id) ?? 9999;
    if (ai !== bi) return ai - bi;
    const mlA = a.ml_level ?? a.automated_triage_level;
    const mlB = b.ml_level ?? b.automated_triage_level;
    return (mlA - mlB) || ((b.ml_confidence ?? 0) - (a.ml_confidence ?? 0)) || new Date(a.submitted_at) - new Date(b.submitted_at);
  });
}

function sortByMlPriority(cases) {
  return [...cases].sort((a, b) => {
    const mlA = a.ml_level ?? a.automated_triage_level;
    const mlB = b.ml_level ?? b.automated_triage_level;
    return (mlA - mlB) || ((b.ml_confidence ?? 0) - (a.ml_confidence ?? 0)) || new Date(a.submitted_at) - new Date(b.submitted_at);
  });
}

function isWatchDue(c) {
  if (c.status !== 'nurse_watch' || !c.watch_review_at) return false;
  return new Date(c.watch_review_at) <= new Date();
}

function needsDoctorSeekAck(c) {
  return c.doctor_seeking_patient_at && !c.doctor_seek_acknowledged_at;
}

export default function NurseDashboard() {
  const [queue, setQueue] = useState([]);
  const [completedList, setCompletedList] = useState([]);
  const [orderIds, setOrderIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [activeTab, setActiveTab] = useState('unopened');
  const { authFetch } = useAuth();
  const intervalRef = useRef(null);

  const load = useCallback(async ({ initial = false } = {}) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [rQ, rC] = await Promise.all([authFetch('/patients/queue'), authFetch('/patients/nurse-completed')]);
      const dataQ = await parseJson(rQ);
      const dataC = await parseJson(rC);
      const list = (Array.isArray(dataQ) ? dataQ : []).map((c) => {
        if (c.ml_level != null && c.ml_confidence != null) return c;
        const ml = predictPriority(c);
        return { ...c, ml_level: c.ml_level ?? ml.level, ml_confidence: c.ml_confidence ?? ml.confidence };
      });
      setQueue(list);
      setCompletedList(Array.isArray(dataC) ? dataC : []);
      let order = getQueueOrder();
      if (order.length === 0 && list.length > 0) {
        order = sortByMlPriority(list).map((c) => c.id);
        setQueueOrder(order);
        setOrderIds(order);
      } else {
        setOrderIds(order);
      }
      setLastUpdated(new Date());
    } catch (e) {
      setQueue([]);
      setCompletedList([]);
      setError(e?.message || 'Failed to load queue.');
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

  const orderedQueue = useMemo(() => sortByOrder(queue, orderIds), [queue, orderIds]);

  const move = (index, direction) => {
    const caseIds = orderedQueue.map((c) => c.id);
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= caseIds.length) return;
    const next = [...caseIds];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setQueueOrder(next);
    setOrderIds(next);
  };

  const resetOrder = () => {
    const defaultOrder = sortByMlPriority(queue).map((c) => c.id);
    setQueueOrder(defaultOrder);
    setOrderIds(defaultOrder);
  };

  const byStatus = (s) => orderedQueue.filter((c) => c.status === s);
  const unopened = byStatus('submitted');
  const inProgress = byStatus('under_review');
  const watchList = byStatus('nurse_watch');
  const awaitingDoctor = orderedQueue.filter(
    (c) =>
      c.status === 'requested_doctor' ||
      c.status === 'doctor_summoned' ||
      (c.status === 'completed' && !c.concluded_at)
  );

  const watchDueCases = useMemo(() => orderedQueue.filter(isWatchDue), [orderedQueue]);
  const doctorSeekCases = useMemo(() => orderedQueue.filter(needsDoctorSeekAck), [orderedQueue]);

  const startCall = (e, c, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCall({ patientName: c.patient_name || c.patient_email || 'Patient', caseId: c.id, mode });
  };

  const renderQueueCard = (c, { showReorder = false, idx = 0 } = {}) => (
    <li key={c.id} className={styles.card}>
      {showReorder ? (
        <div className={styles.reorder}>
          <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'up')} title="Move up" aria-label="Move up">
            ↑
          </button>
          <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'down')} title="Move down" aria-label="Move down">
            ↓
          </button>
        </div>
      ) : null}
      <div className={styles.callBtns}>
        <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'audio')} title="Phone call">
          <PhoneIcon />
        </button>
        <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'video')} title="Video call">
          <LaptopIcon />
        </button>
      </div>
      <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
        <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
        {c.ml_level != null && (
          <span className={styles.mlBadge}>
            ML: {c.ml_level ?? c.automated_triage_level} ({Math.round((c.ml_confidence ?? 0) * 100)}%)
          </span>
        )}
        {c.status === 'nurse_watch' && c.watch_review_at && (
          <span className={styles.watchHint}>
            Next review {formatDate(c.watch_review_at)}
            {isWatchDue(c) ? ' · due now' : ''}
          </span>
        )}
        {needsDoctorSeekAck(c) && <span className={styles.seekBadge}>Doctor requesting patient</span>}
        <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
        <span className={styles.meta}>
          {c.patient_name || c.patient_email} · {formatDate(c.submitted_at)}
        </span>
      </Link>
    </li>
  );

  if (loading) return <div className={styles.loading}>Loading triage queue…</div>;

  return (
    <div className={styles.wrap}>
      {activeCall && (
        <NurseCall
          patientName={activeCall.patientName}
          caseId={activeCall.caseId}
          mode={activeCall.mode}
          onClose={() => setActiveCall(null)}
        />
      )}

      <div className={styles.head}>
        <h1>Triage queue</h1>
        <div className={styles.headActions}>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={() => load({ initial: false })}
            disabled={refreshing}
            title="Refresh queue"
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <div className={styles.lastUpdated} aria-live="polite">
            {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Not updated yet'}
          </div>
          <button type="button" className={styles.resetOrder} onClick={resetOrder} title="Reset to ML priority order">
            Sort by ML priority
          </button>
          <Link to="/nurse/audit" className={styles.auditLink}>
            Audit log
          </Link>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      {(watchDueCases.length > 0 || doctorSeekCases.length > 0) && (
        <div className={styles.alertBanner} role="status">
          {watchDueCases.length > 0 && (
            <p>
              <strong>Watch follow-up due:</strong>{' '}
              {watchDueCases.map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? ', ' : ''}
                  <Link to={`/nurse/case/${c.id}`}>
                    #{c.id} {c.patient_name || c.patient_email || 'Patient'}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {doctorSeekCases.length > 0 && (
            <p>
              <strong>Doctor requested patient at desk:</strong>{' '}
              {doctorSeekCases.map((c, i) => (
                <span key={c.id}>
                  {i > 0 ? ', ' : ''}
                  <Link to={`/nurse/case/${c.id}`}>
                    #{c.id} {c.patient_name || c.patient_email || 'Patient'}
                    {c.doctor_seeking_doctor_name ? ` (${c.doctor_seeking_doctor_name})` : ''}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <p className={styles.intro}>
        Queue is ordered by <strong>ML priority</strong>. <strong>Under review</strong> lists requests you have not opened yet—open a case to assess, set a patient-facing recommendation, use{' '}
        <strong>watch</strong> for timed follow-up, forward to a doctor, or mark complete.
      </p>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'unopened' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('unopened')}
        >
          Under review ({unopened.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'inProgress' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('inProgress')}
        >
          In progress ({inProgress.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'watch' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('watch')}
        >
          Watch ({watchList.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'doctorReview' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('doctorReview')}
        >
          Doctor review ({awaitingDoctor.length})
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'completed' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          Completed ({completedList.length})
        </button>
      </div>

      {activeTab === 'unopened' && (
        <section className={styles.queueSection}>
          <h2>Under review — not opened ({unopened.length})</h2>
          <p className={styles.tabHint}>Cases still in the incoming queue. Open a case to move it to in progress.</p>
          <ul className={styles.list}>
            {unopened.map((c) => {
              const idx = orderedQueue.findIndex((x) => x.id === c.id);
              return renderQueueCard(c, { showReorder: true, idx });
            })}
          </ul>
        </section>
      )}

      {activeTab === 'inProgress' && (
        <section className={styles.queueSection}>
          <h2>In progress ({inProgress.length})</h2>
          <ul className={styles.list}>
            {inProgress.map((c) => {
              const idx = orderedQueue.findIndex((x) => x.id === c.id);
              return renderQueueCard(c, { showReorder: true, idx });
            })}
          </ul>
        </section>
      )}

      {activeTab === 'watch' && (
        <section className={styles.queueSection}>
          <h2>Watch ({watchList.length})</h2>
          <p className={styles.tabHint}>You set a recommendation and a time to review again. When due, you will see alerts above.</p>
          <ul className={styles.list}>
            {watchList.map((c) => renderQueueCard(c))}
          </ul>
        </section>
      )}

      {activeTab === 'doctorReview' && (
        <section className={styles.queueSection}>
          <h2>Doctor review ({awaitingDoctor.length})</h2>
          <ul className={styles.list}>
            {awaitingDoctor.slice(0, 40).map((c) => (
              <li key={c.id} className={styles.card}>
                <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
                  <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
                  {needsDoctorSeekAck(c) && <span className={styles.seekBadge}>Doctor requesting patient</span>}
                  <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
                  <span className={styles.meta}>
                    {c.patient_name || c.patient_email} · {formatDate(c.overridden_at || c.first_reviewed_at || c.submitted_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {awaitingDoctor.length > 40 && <p className={styles.more}>… and {awaitingDoctor.length - 40} more</p>}
        </section>
      )}

      {activeTab === 'completed' && (
        <section className={styles.queueSection}>
          <h2>Completed ({completedList.length})</h2>
          <p className={styles.tabHint}>Nurse and doctor names reflect who participated when the case closed.</p>
          {completedList.length === 0 ? (
            <p className={styles.empty}>No completed cases yet.</p>
          ) : (
            <ul className={styles.list}>
              {completedList.slice(0, 60).map((c) => (
                <li key={`${c.id}-${c.status}`} className={styles.card}>
                  <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
                    <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
                    <span className={styles.complaint}>{c.chief_complaint || '—'}</span>
                    <span className={styles.meta}>
                      {c.patient_name || c.patient_email} ·{' '}
                      {c.status === 'patient_resolved'
                        ? `Patient closed · Nurse ${c.handling_nurse_name || '—'}`
                        : c.concluded_at
                          ? `Doctor ${c.doctor_name || '—'} concluded · Nurse ${c.handling_nurse_name || '—'}`
                          : c.nurse_completer_name
                            ? `Closed by nurse ${c.nurse_completer_name} · Nurse of record ${c.handling_nurse_name || '—'}`
                            : `Nurse ${c.handling_nurse_name || '—'}`}
                    </span>
                    <span className={styles.metaMuted}>
                      {c.concluded_at && `Concluded ${formatDate(c.concluded_at)}`}
                      {c.nurse_completed_at && !c.concluded_at && `Closed ${formatDate(c.nurse_completed_at)}`}
                      {c.patient_resolved_at && ` · Patient resolved ${formatDate(c.patient_resolved_at)}`}
                    </span>
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
