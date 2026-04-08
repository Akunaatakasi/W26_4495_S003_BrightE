import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson } from '../utils/api';
import PatientCall from '../components/PatientCall';
import styles from './PatientDashboard.module.css';

const LS_PREFIX = 'bright_guidance_seen_';

function patientFacingStatus(c) {
  if (!c) return '—';
  if (c.status === 'requested_doctor') return 'Awaiting doctor review';
  if (c.status === 'doctor_summoned') return 'Doctor requested — go to nursing desk';
  if (c.status === 'nurse_watch') return 'Nurse follow-up (watch)';
  if (c.status === 'completed' && !c.concluded_at) return 'Awaiting doctor review';
  if (c.status === 'completed') return 'Completed';
  return String(c.status).replace(/_/g, ' ');
}

function statusDataAttr(c) {
  if (!c) return '';
  if (c.status === 'completed' && !c.concluded_at) return 'requested_doctor';
  if (c.status === 'nurse_watch') return 'nurse_watch';
  if (c.status === 'doctor_summoned') return 'doctor_summoned';
  return c.status;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function guidanceDigest(c) {
  return `${c.override_reason || ''}||${c.nurse_recommendation || ''}||${c.final_triage_level ?? ''}||${c.status}||${c.doctor_seeking_patient_at || ''}`;
}

function getSeenDigest(caseId) {
  try {
    return sessionStorage.getItem(`${LS_PREFIX}${caseId}`);
  } catch {
    return null;
  }
}

function setSeenDigest(caseId, digest) {
  try {
    sessionStorage.setItem(`${LS_PREFIX}${caseId}`, digest);
  } catch (_) {}
}

function hasStaffGuidance(c) {
  return (
    c.final_triage_level != null ||
    (c.override_reason && String(c.override_reason).trim()) ||
    (c.nurse_recommendation && String(c.nurse_recommendation).trim()) ||
    c.status === 'under_review' ||
    c.status === 'nurse_watch' ||
    c.status === 'requested_doctor' ||
    c.status === 'doctor_summoned' ||
    c.status === 'completed'
  );
}

function isHistoryCase(c) {
  return c.status === 'withdrawn' || c.status === 'patient_resolved' || c.concluded_at;
}

function canQuitTriage(c) {
  return ['submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned'].includes(c.status);
}

function canSelfResolve(c) {
  if (c.status === 'withdrawn' || c.status === 'patient_resolved' || c.concluded_at) return false;
  return (
    c.final_triage_level != null ||
    (c.override_reason && String(c.override_reason).trim()) ||
    (c.nurse_recommendation && String(c.nurse_recommendation).trim()) ||
    c.status === 'requested_doctor' ||
    c.status === 'doctor_summoned' ||
    c.status === 'nurse_watch' ||
    c.status === 'completed'
  );
}

export default function PatientDashboard() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCallCase, setActiveCallCase] = useState(null);
  const [liveUpdate, setLiveUpdate] = useState('');
  const [tab, setTab] = useState('requests');
  const [actBusy, setActBusy] = useState(null);
  const [notifyTick, setNotifyTick] = useState(0);
  const { authFetch } = useAuth();

  const loadCases = useCallback(() => {
    return authFetch('/patients/my-cases')
      .then((r) => parseJson(r))
      .then((data) => {
        if (Array.isArray(data)) setCases(data);
      })
      .catch(() => setCases([]));
  }, [authFetch]);

  useEffect(() => {
    loadCases().finally(() => setLoading(false));
  }, [loadCases]);

  useEffect(() => {
    const id = setInterval(() => {
      loadCases();
    }, 15000);
    return () => clearInterval(id);
  }, [loadCases]);

  const activeCases = useMemo(() => cases.filter((c) => !isHistoryCase(c)), [cases]);
  const historyCases = useMemo(() => cases.filter((c) => isHistoryCase(c)), [cases]);

  const unreadCount = useMemo(() => {
    void notifyTick;
    return activeCases.filter(
      (c) => hasStaffGuidance(c) && getSeenDigest(c.id) !== guidanceDigest(c)
    ).length;
  }, [activeCases, notifyTick]);

  const markAllGuidanceRead = () => {
    activeCases.forEach((c) => {
      if (hasStaffGuidance(c)) setSeenDigest(c.id, guidanceDigest(c));
    });
    setNotifyTick((t) => t + 1);
  };

  const handleWithdraw = async (c) => {
    if (!window.confirm('Quit triage? Staff will stop tracking this remote request.')) return;
    setActBusy(c.id);
    try {
      const res = await authFetch(`/patients/${c.id}/withdraw`, { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Request failed');
      await loadCases();
    } catch (e) {
      alert(e.message || 'Could not quit triage');
    } finally {
      setActBusy(null);
    }
  };

  const handleSelfResolve = async (c) => {
    if (
      !window.confirm(
        'Close this request as resolved? Use this after you have followed the advice you were given and feel better.'
      )
    )
      return;
    setActBusy(c.id);
    try {
      const res = await authFetch(`/patients/${c.id}/patient-resolve`, { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Request failed');
      await loadCases();
      setTab('history');
    } catch (e) {
      alert(e.message || 'Could not close case');
    } finally {
      setActBusy(null);
    }
  };

  if (loading) return <div className={styles.loading}>Loading your cases…</div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1>Patient dashboard</h1>
        <Link to="/triage/new" className={styles.newBtn}>
          New triage
        </Link>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'requests' ? styles.activeTab : ''}`}
          onClick={() => setTab('requests')}
        >
          My requests
          {unreadCount > 0 ? (
            <span className={styles.tabBadge} aria-label={`${unreadCount} new updates`}>
              <span className={styles.bell} aria-hidden />
              {unreadCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`${styles.tab} ${tab === 'history' ? styles.activeTab : ''}`}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>

      {tab === 'requests' && unreadCount > 0 && (
        <div className={styles.notifyBanner} role="status">
          <strong>New from your care team.</strong> Review the recommendation below, then mark updates as read.
          <button type="button" className={styles.linkish} onClick={markAllGuidanceRead}>
            Mark all as read
          </button>
        </div>
      )}

      {tab === 'requests' && (
        <>
          {activeCases.length === 0 ? (
            <p className={styles.empty}>
              No open triage requests. <Link to="/triage/new">Start remote triage</Link> to create one—you can return
              here anytime from “My requests” in the header.
            </p>
          ) : (
            <ul className={styles.list}>
              {activeCases.map((c) => (
                <li key={c.id} className={styles.card}>
                  <div className={styles.cardHead}>
                    <span className={styles.id}>#{c.id}</span>
                    <span className={styles.status} data-status={statusDataAttr(c)}>
                      {patientFacingStatus(c)}
                    </span>
                  </div>
                  <p className={styles.complaint}>{c.chief_complaint || 'No chief complaint'}</p>
                  <p className={styles.level}>{c.triage_label}</p>
                  <p className={styles.metaLine}>
                    <strong>Nurse:</strong> {c.handling_nurse_name || '—'}
                  </p>
                  <p className={styles.metaLine}>
                    <strong>Doctor:</strong>{' '}
                    {c.doctor_name ||
                      (c.status === 'requested_doctor' ||
                      c.status === 'doctor_summoned' ||
                      (c.status === 'completed' && !c.concluded_at)
                        ? 'Pending review'
                        : '—')}
                  </p>
                  {c.doctor_seeking_patient_at && (
                    <div className={styles.doctorSeekAlert} role="status">
                      <strong>Please go to the nursing desk</strong> — a clinician is ready to see you
                      {c.doctor_seeking_doctor_name ? ` (${c.doctor_seeking_doctor_name})` : ''}.
                      {c.doctor_seeking_note ? ` ${c.doctor_seeking_note}` : ''}
                    </div>
                  )}
                  {c.nurse_recommendation ? (
                    <blockquote className={styles.nurseRecommendation}>
                      <span className={styles.guidanceLabel}>Nurse recommendation</span>
                      {c.nurse_recommendation}
                    </blockquote>
                  ) : null}
                  {c.override_reason ? (
                    <blockquote className={styles.guidance}>
                      <span className={styles.guidanceLabel}>Clinical guidance</span>
                      {c.override_reason}
                    </blockquote>
                  ) : null}
                  <p className={styles.date}>Submitted {formatDate(c.submitted_at)}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.callBtn} onClick={() => setActiveCallCase(c)}>
                      Join telemedicine call
                    </button>
                  </div>
                  <div className={styles.patientActions}>
                    {canQuitTriage(c) && (
                      <button
                        type="button"
                        className={styles.dangerOutline}
                        disabled={actBusy === c.id}
                        onClick={() => handleWithdraw(c)}
                      >
                        Quit triage
                      </button>
                    )}
                    {canSelfResolve(c) && (
                      <button
                        type="button"
                        className={styles.resolveBtn}
                        disabled={actBusy === c.id}
                        onClick={() => handleSelfResolve(c)}
                      >
                        I followed the advice and feel better — close case
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {tab === 'history' && (
        <>
          {historyCases.length === 0 ? (
            <p className={styles.empty}>No closed or concluded requests yet.</p>
          ) : (
            <ul className={styles.list}>
              {historyCases.map((c) => (
                <li key={c.id} className={`${styles.card} ${styles.cardMuted}`}>
                  <div className={styles.cardHead}>
                    <span className={styles.id}>#{c.id}</span>
                    <span className={styles.status} data-status={statusDataAttr(c)}>
                      {patientFacingStatus(c)}
                    </span>
                  </div>
                  <p className={styles.complaint}>{c.chief_complaint || '—'}</p>
                  <p className={styles.level}>{c.triage_label}</p>
                  <p className={styles.metaLine}>
                    <strong>Nurse:</strong> {c.handling_nurse_name || '—'}
                  </p>
                  <p className={styles.metaLine}>
                    <strong>Doctor:</strong> {c.doctor_name || '—'}
                  </p>
                  <p className={styles.date}>Submitted {formatDate(c.submitted_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {liveUpdate && <div className={styles.liveUpdate}>{liveUpdate}</div>}
      {activeCallCase && (
        <PatientCall
          caseId={activeCallCase.id}
          onClose={() => setActiveCallCase(null)}
          onTriageUpdate={(msg) => {
            const level = Number(msg.level);
            const labels = {
              1: 'Level 1 – Immediate (life-saving intervention)',
              2: 'Level 2 – High risk / time-critical',
              3: 'Level 3 – Stable, multiple resources',
              4: 'Level 4 – Stable, single resource',
              5: 'Level 5 – Stable, minimal resources',
            };
            setCases((prev) =>
              prev.map((item) =>
                item.id === activeCallCase.id
                  ? {
                      ...item,
                      final_triage_level: level,
                      triage_label: labels[level] || item.triage_label,
                      status: msg.status || item.status,
                    }
                  : item
              )
            );
            setLiveUpdate(
              `Live update for case #${activeCallCase.id}: nurse set triage to level ${level}${msg.reason ? ` (${msg.reason})` : ''}.`
            );
            setNotifyTick((t) => t + 1);
          }}
        />
      )}
    </div>
  );
}
