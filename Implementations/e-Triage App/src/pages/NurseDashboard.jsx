import { useState, useEffect, useMemo } from 'react';
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

export default function NurseDashboard() {
  const [queue, setQueue] = useState([]);
  const [orderIds, setOrderIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCall, setActiveCall] = useState(null); // { patientName, caseId, mode: 'audio'|'video' }
  const { authFetch } = useAuth();

  const load = () => {
    authFetch('/patients/queue')
      .then((r) => parseJson(r))
      .then((data) => {
        const list = (Array.isArray(data) ? data : []).map((c) => {
          if (c.ml_level != null && c.ml_confidence != null) return c;
          const ml = predictPriority(c);
          return { ...c, ml_level: c.ml_level ?? ml.level, ml_confidence: c.ml_confidence ?? ml.confidence };
        });
        setQueue(list);
        let order = getQueueOrder();
        if (order.length === 0 && list.length > 0) {
          order = sortByMlPriority(list).map((c) => c.id);
          setQueueOrder(order);
          setOrderIds(order);
        } else {
          setOrderIds(order);
        }
      })
      .catch(() => setQueue([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [authFetch]);

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

  if (loading) return <div className={styles.loading}>Loading triage queue…</div>;

  const byStatus = (s) => orderedQueue.filter((c) => c.status === s);
  const submitted = byStatus('submitted');
  const underReview = byStatus('under_review');
  const completed = byStatus('completed');

  const startCall = (e, c, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveCall({ patientName: c.patient_name || c.patient_email || 'Patient', caseId: c.id, mode });
  };

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
          <button type="button" className={styles.resetOrder} onClick={resetOrder} title="Reset to ML priority order">
            Sort by ML priority
          </button>
          <Link to="/nurse/audit" className={styles.auditLink}>Audit log</Link>
        </div>
      </div>
      <p className={styles.intro}>
        Queue is ordered by <strong>ML priority</strong>. Supervise and override when needed. Use phone or video call to assess, then ↑ ↓ to reorder. Click a case to view or override the ML decision.
      </p>
      {queue.length === 0 ? (
        <p className={styles.empty}>No triage cases in the queue.</p>
      ) : (
        <>
          <section className={styles.queueSection}>
            <h2>Awaiting review ({submitted.length})</h2>
            <ul className={styles.list}>
              {submitted.map((c) => {
                const idx = orderedQueue.findIndex((x) => x.id === c.id);
                return (
                  <li key={c.id} className={styles.card}>
                    <div className={styles.reorder}>
                      <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'up')} title="Move up" aria-label="Move up">↑</button>
                      <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'down')} title="Move down" aria-label="Move down">↓</button>
                    </div>
                    <div className={styles.callBtns}>
                      <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'audio')} title="Phone call"><PhoneIcon /></button>
                      <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'video')} title="Video call"><LaptopIcon /></button>
                    </div>
                    <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
                      <span className={styles.level}>Level {c.automated_triage_level}</span>
                      <span className={styles.mlBadge}>ML: {c.ml_level ?? c.automated_triage_level} ({Math.round((c.ml_confidence ?? 0) * 100)}%)</span>
                      <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
                      <span className={styles.meta}>{c.patient_name || c.patient_email} · {formatDate(c.submitted_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={styles.queueSection}>
            <h2>Under review ({underReview.length})</h2>
            <ul className={styles.list}>
              {underReview.map((c) => {
                const idx = orderedQueue.findIndex((x) => x.id === c.id);
                return (
                  <li key={c.id} className={styles.card}>
                    <div className={styles.reorder}>
                      <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'up')} aria-label="Move up">↑</button>
                      <button type="button" className={styles.moveBtn} onClick={() => move(idx, 'down')} aria-label="Move down">↓</button>
                    </div>
                    <div className={styles.callBtns}>
                      <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'audio')} title="Phone call"><PhoneIcon /></button>
                      <button type="button" className={styles.callBtn} onClick={(e) => startCall(e, c, 'video')} title="Video call"><LaptopIcon /></button>
                    </div>
                    <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
                      <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
                      <span className={styles.mlBadge}>ML: {c.ml_level ?? c.automated_triage_level} ({Math.round((c.ml_confidence ?? 0) * 100)}%)</span>
                      <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
                      <span className={styles.meta}>{c.patient_name || c.patient_email} · {formatDate(c.submitted_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className={styles.queueSection}>
            <h2>Completed ({completed.length})</h2>
            <ul className={styles.list}>
              {completed.slice(0, 25).map((c) => (
                <li key={c.id} className={styles.card}>
                  <Link to={`/nurse/case/${c.id}`} className={styles.cardLink}>
                    <span className={styles.level}>Level {c.final_triage_level ?? c.automated_triage_level}</span>
                    {c.ml_level != null && <span className={styles.mlBadge}>ML was {c.ml_level}</span>}
                    <span className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</span>
                    <span className={styles.meta}>{c.patient_name || c.patient_email} · {formatDate(c.completed_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {completed.length > 25 && <p className={styles.more}>… and {completed.length - 25} more</p>}
          </section>
        </>
      )}
    </div>
  );
}
