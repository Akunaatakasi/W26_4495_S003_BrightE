import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  parseJson,
  sendOtp,
  verifyOtp,
  getPatientVerified,
  setPatientVerified,
  clearPatientVerified,
  getGuestToken,
  clearGuestToken,
  setOtpPendingEmail,
  getOtpPendingEmail,
  clearOtpPendingEmail,
  DEMO_ONLY,
  DEMO_GUEST_TOKEN,
  setGuestActiveCase,
  getGuestActiveCase,
  clearGuestActiveCase,
  getGuestCaseAccessToken,
  fetchGuestCase,
  guestCaseAction,
  setPatientTrackingCase,
  getPatientTrackingCase,
  clearPatientTrackingCase,
} from '../utils/api';
import { TRIAGE_LABELS } from '../utils/triageLogic';
import PatientCall from '../components/PatientCall';
import styles from './NewTriage.module.css';

/** Patient-facing label; legacy rows may be status completed before doctor conclusion. */
function patientFacingStatus(c) {
  if (!c) return '—';
  if (c.status === 'requested_doctor') return 'Awaiting doctor review';
  if (c.status === 'doctor_summoned') return 'Doctor requested — go to nursing desk';
  if (c.status === 'nurse_watch') return 'Nurse follow-up (watch)';
  if (c.status === 'completed' && !c.concluded_at) return 'Awaiting doctor review';
  if (c.status === 'completed') return 'Completed';
  return String(c.status).replace(/_/g, ' ');
}

function statusChipAttr(c) {
  if (!c) return '';
  if (c.status === 'completed' && !c.concluded_at) return 'requested_doctor';
  if (c.status === 'nurse_watch') return 'nurse_watch';
  if (c.status === 'doctor_summoned') return 'doctor_summoned';
  return c.status;
}

const SYMPTOM_OPTIONS = [
  { id: 'cardiac_chest_pain', label: 'Chest pain (cardiac concern)' },
  { id: 'difficulty_breathing', label: 'Difficulty breathing' },
  { id: 'severe_pain', label: 'Severe pain' },
  { id: 'altered_mental', label: 'Altered mental status' },
  { id: 'unconscious', label: 'Unresponsive / unconscious' },
  { id: 'major_trauma', label: 'Major trauma' },
  { id: 'heavy_bleeding', label: 'Heavy bleeding' },
  { id: 'stroke_symptoms', label: 'Stroke-like symptoms' },
  { id: 'severe_allergic', label: 'Severe allergic reaction' },
  { id: 'seizure', label: 'Seizure' },
  { id: 'abdominal_pain', label: 'Abdominal pain' },
  { id: 'high_fever', label: 'High fever' },
  { id: 'headache', label: 'Persistent headache' },
  { id: 'laceration', label: 'Laceration / cut' },
  { id: 'minor_injury', label: 'Minor injury' },
  { id: 'sore_throat', label: 'Sore throat' },
  { id: 'prescription_refill', label: 'Prescription refill' },
  { id: 'minor_illness', label: 'Minor illness' },
  { id: 'other', label: 'Other' },
];

function snapshotFromRow(row) {
  if (!row) return null;
  return {
    status: row.status,
    first_reviewed_at: row.first_reviewed_at,
    final_triage_level: row.final_triage_level,
    automated_triage_level: row.automated_triage_level,
    override_reason: row.override_reason,
    nurse_recommendation: row.nurse_recommendation,
    completed_at: row.completed_at,
    concluded_at: row.concluded_at,
    doctor_seeking_patient_at: row.doctor_seeking_patient_at,
  };
}

function staffUpdatesFromDelta(prev, next) {
  if (!prev || !next) return [];
  const out = [];
  if (!prev.first_reviewed_at && next.first_reviewed_at) {
    out.push('A nurse has opened your case for review.');
  }
  if (next.final_triage_level != null && next.final_triage_level !== prev.final_triage_level) {
    const lab = TRIAGE_LABELS[next.final_triage_level] || `Level ${next.final_triage_level}`;
    const extra = next.override_reason ? ` Note from clinician: ${next.override_reason}` : '';
    out.push(`Clinical triage level updated to ${lab}.${extra}`);
  } else if (next.override_reason && next.override_reason !== prev.override_reason) {
    out.push(`Clinical note: ${next.override_reason}`);
  }
  if (next.status === 'requested_doctor' && prev.status !== 'requested_doctor') {
    out.push('Your case has been sent for doctor review.');
  }
  if (next.status === 'doctor_summoned' && prev.status !== 'doctor_summoned') {
    out.push('A doctor has requested to see you. Please go to the nursing desk.');
  }
  if (next.concluded_at && !prev.concluded_at) {
    out.push('Your case has been closed by the care team.');
  }
  if (next.status === 'nurse_watch' && prev.status !== 'nurse_watch') {
    out.push('A nurse is monitoring your case and will review again at the scheduled time.');
  }
  if (next.nurse_recommendation && next.nurse_recommendation !== prev.nurse_recommendation) {
    out.push(`Nurse recommendation: ${next.nurse_recommendation}`);
  }
  if (next.status === 'withdrawn' && prev.status !== 'withdrawn') {
    out.push('This request was closed (you left triage).');
  }
  if (next.status === 'patient_resolved' && prev.status !== 'patient_resolved') {
    out.push('This request was closed as resolved.');
  }
  return out;
}

const SEEN_GUIDANCE_PREFIX = 'bright_guidance_seen_';

function guidanceDigestForNotify(c) {
  return `${c.override_reason || ''}||${c.nurse_recommendation || ''}||${c.final_triage_level ?? ''}||${c.status}||${c.doctor_seeking_patient_at || ''}`;
}

function getSeenGuidance(caseId) {
  try {
    return sessionStorage.getItem(`${SEEN_GUIDANCE_PREFIX}${caseId}`);
  } catch {
    return null;
  }
}

function setSeenGuidance(caseId, digest) {
  try {
    sessionStorage.setItem(`${SEEN_GUIDANCE_PREFIX}${caseId}`, digest);
  } catch (_) {}
}

function hasGuidanceForNotify(c) {
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

function canGuestQuit(c) {
  return ['submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned'].includes(c?.status);
}

function canGuestSelfResolve(c) {
  if (!c || c.status === 'withdrawn' || c.status === 'patient_resolved' || c.concluded_at) return false;
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

export default function NewTriage() {
  const [demographics, setDemographics] = useState({ age: '', gender: '' });
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState([]);
  const [urgency, setUrgency] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [activeCall, setActiveCall] = useState(false);
  const [liveCallMsg, setLiveCallMsg] = useState('');
  const [queueCount, setQueueCount] = useState(null);
  const [staffNotifications, setStaffNotifications] = useState([]);
  const [caseHydrating, setCaseHydrating] = useState(() => Boolean(getGuestActiveCase()?.caseAccessToken));
  const [guidanceNotifyTick, setGuidanceNotifyTick] = useState(0);
  const [guestActBusy, setGuestActBusy] = useState(false);
  const [patientActBusy, setPatientActBusy] = useState(false);
  const lastSnapRef = useRef(null);
  const { user, authFetch, applySession, loading: authLoading } = useAuth();

  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmailDelivered, setOtpEmailDelivered] = useState(null);
  const [otpError, setOtpError] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState(() => getPatientVerified());

  const guidanceUnread = useMemo(() => {
    void guidanceNotifyTick;
    if (!result?.id || result.error) return false;
    if (!hasGuidanceForNotify(result)) return false;
    return getSeenGuidance(result.id) !== guidanceDigestForNotify(result);
  }, [result, guidanceNotifyTick]);

  useEffect(() => {
    setVerifiedEmail(getPatientVerified());
  }, []);

  useEffect(() => {
    if (authLoading) return;

    const guestSaved = getGuestActiveCase();
    if (!user && guestSaved?.caseAccessToken) {
      let cancelled = false;
      setCaseHydrating(true);
      fetchGuestCase(guestSaved.caseAccessToken)
        .then((data) => {
          if (cancelled) return;
          setStaffNotifications([]);
          lastSnapRef.current = snapshotFromRow(data);
          setResult({
            id: data.id,
            automated_triage_level: data.automated_triage_level,
            final_triage_level: data.final_triage_level,
            triage_label: data.triage_label,
            chief_complaint: data.chief_complaint,
            status: data.status,
            override_reason: data.override_reason,
            nurse_recommendation: data.nurse_recommendation,
            watch_review_at: data.watch_review_at,
            doctor_seeking_patient_at: data.doctor_seeking_patient_at,
            doctor_seeking_note: data.doctor_seeking_note,
            doctor_seeking_doctor_name: data.doctor_seeking_doctor_name,
            first_reviewed_at: data.first_reviewed_at,
            completed_at: data.completed_at,
            concluded_at: data.concluded_at,
            submitted_at: data.submitted_at,
            predicted_wait_time_minutes: guestSaved.predicted_wait_time_minutes ?? null,
            handling_nurse_name: data.handling_nurse_name ?? null,
            doctor_name: data.doctor_name ?? null,
          });
        })
        .catch(() => {
          clearGuestActiveCase();
        })
        .finally(() => {
          if (!cancelled) setCaseHydrating(false);
        });
      return () => {
        cancelled = true;
      };
    }

    if (user?.role === 'patient') {
      const t = getPatientTrackingCase();
      if (t?.caseId) {
        let cancelled = false;
        setCaseHydrating(true);
        authFetch(`/patients/${t.caseId}`)
          .then((r) => parseJson(r))
          .then((data) => {
            if (cancelled || data.error) return;
            if (!data.id) return;
            setStaffNotifications([]);
            lastSnapRef.current = snapshotFromRow(data);
            setResult({
              ...data,
              predicted_wait_time_minutes: t.predicted_wait_time_minutes ?? data.predicted_wait_time_minutes ?? null,
            });
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setCaseHydrating(false);
          });
        return () => {
          cancelled = true;
        };
      }
    }

    setCaseHydrating(false);
    return undefined;
  }, [authLoading, user, authFetch]);

  useEffect(() => {
    if (!result?.id || result.error) return;
    const guestTok = !user ? getGuestCaseAccessToken() : null;
    const pt = user?.role === 'patient' ? getPatientTrackingCase() : null;
    if (!guestTok && !pt) return;

    const applyServerRow = (data) => {
      if (!data?.id) return;
      setResult((prev) => {
        const merged = guestTok
          ? {
              ...prev,
              chief_complaint: data.chief_complaint ?? prev.chief_complaint,
              status: data.status,
              automated_triage_level: data.automated_triage_level,
              final_triage_level: data.final_triage_level,
              override_reason: data.override_reason,
              nurse_recommendation: data.nurse_recommendation ?? prev.nurse_recommendation,
              watch_review_at: data.watch_review_at ?? prev.watch_review_at,
              doctor_seeking_patient_at: data.doctor_seeking_patient_at ?? prev.doctor_seeking_patient_at,
              doctor_seeking_note: data.doctor_seeking_note ?? prev.doctor_seeking_note,
              doctor_seeking_doctor_name: data.doctor_seeking_doctor_name ?? prev.doctor_seeking_doctor_name,
              first_reviewed_at: data.first_reviewed_at,
              completed_at: data.completed_at,
              concluded_at: data.concluded_at,
              submitted_at: data.submitted_at ?? prev.submitted_at,
              triage_label: data.triage_label ?? prev.triage_label,
              handling_nurse_name: data.handling_nurse_name ?? prev.handling_nurse_name,
              doctor_name: data.doctor_name ?? prev.doctor_name,
            }
          : {
              ...prev,
              ...data,
              predicted_wait_time_minutes: prev.predicted_wait_time_minutes,
            };
        const snap = snapshotFromRow(merged);
        const prevSnap = lastSnapRef.current;
        if (prevSnap) {
          const msgs = staffUpdatesFromDelta(prevSnap, snap);
          if (msgs.length) setStaffNotifications((u) => [...u, ...msgs]);
        }
        lastSnapRef.current = snap;
        return merged;
      });
    };

    const tick = () => {
      if (guestTok) {
        fetchGuestCase(guestTok).then(applyServerRow).catch(() => {});
      } else if (pt) {
        authFetch(`/patients/${pt.caseId}`)
          .then((r) => parseJson(r))
          .then(applyServerRow)
          .catch(() => {});
      }
    };

    const id = setInterval(tick, 12000);
    return () => clearInterval(id);
  }, [result?.id, result?.error, user, authFetch]);

  useEffect(() => {
  const loadQueue = () => {
    fetch('/api/triage/queue-stats')
      .then((r) => r.json())
      .then((data) => {
        setQueueCount(data.waiting ?? 0);
      })
      .catch(() => {});
  };

  loadQueue();
  const interval = setInterval(loadQueue, 5000);

  return () => clearInterval(interval);
}, []);

  const navigate = useNavigate();

  const isStaff = user?.role === 'nurse' || user?.role === 'doctor';
  const needsOtp = !isStaff && !verifiedEmail;

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setOtpError('');

    const email = otpEmail.trim();
    if (!email) {
      setOtpError('Please enter your email.');
      return;
    }

    setSubmitting(true);
    try {
      const { emailDelivered } = await sendOtp(email);
      setOtpPendingEmail(email);
      setOtpEmailDelivered(emailDelivered);
      setOtpSent(true);
      setOtpCode('');
    } catch (err) {
      setOtpError(err.message || 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpError('');

    if (!otpCode.trim()) {
      setOtpError('Please enter the code.');
      return;
    }

    const emailForVerify = (otpEmail.trim() || getOtpPendingEmail().trim()).trim();
    if (!emailForVerify) {
      setOtpError('We could not find which email this code is for. Go back, enter your email, and tap Send OTP again.');
      return;
    }

    setSubmitting(true);
    try {
      await verifyOtp(emailForVerify, otpCode.trim());
      clearOtpPendingEmail();
      setPatientVerified(emailForVerify);
      setVerifiedEmail(emailForVerify);
      setOtpSent(false);
      setOtpEmail('');
      setOtpCode('');
    } catch (err) {
      setOtpError(err.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSymptom = (id) => {
    setSymptoms((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const payload = {
      demographics: {
        age: demographics.age || undefined,
        gender: demographics.gender || undefined,
      },
      chief_complaint: chiefComplaint || undefined,
      symptoms,
      self_reported_urgency: urgency,
    };

    try {
      if (user?.role === 'nurse') {
        setResult({ error: 'Staff must use the queue to review cases, not submit triage.' });
        setSubmitting(false);
        return;
      }

      if (!user) {
        const guest_token = getGuestToken();

        if (!guest_token) {
          setResult({ error: 'Please verify your email with the OTP first.' });
          setSubmitting(false);
          return;
        }

        if (guest_token === DEMO_GUEST_TOKEN) {
          clearGuestToken();
          setResult({ error: 'Session expired. Please verify your email again with the OTP, then submit.' });
          setSubmitting(false);
          return;
        }

        if (DEMO_ONLY) {
          setResult({
            id: 'demo',
            triage_label: 'Demo – not saved',
            note: 'Demo mode: triage was not sent to a server.'
          });
          setSubmitting(false);
          return;
        }

        const res = await fetch('/api/triage/submit-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_token, ...payload }),
        });

        const data = await parseJson(res);
        const serverError = data && (data.error || data.message);

        if (!res.ok) {
          if (res.status === 400 && serverError && /invalid|expired|verify/i.test(serverError)) {
            clearGuestToken();
            throw new Error('Verification expired. Please verify your email again with the OTP, then submit.');
          }
          throw new Error(serverError || `Submit failed (${res.status}). Check that the backend is running.`);
        }

        if (!data.id) {
          throw new Error('Server returned invalid response.');
        }

        const emailForCase = getPatientVerified();
        if (data.token && data.user) {
          applySession(data.token, data.user);
          setPatientTrackingCase({
            caseId: data.id,
            predicted_wait_time_minutes: data.predicted_wait_time_minutes ?? null,
          });
          clearGuestActiveCase();
        } else if (data.case_access_token && emailForCase) {
          setGuestActiveCase({
            caseAccessToken: data.case_access_token,
            caseId: data.id,
            email: emailForCase,
            predicted_wait_time_minutes: data.predicted_wait_time_minutes ?? null,
          });
        }
        lastSnapRef.current = snapshotFromRow(data);
        const {
          case_access_token: _cac,
          token: _tok,
          user: _usr,
          ...restCase
        } = data;
        setResult({ ...restCase, triage_label: data.triage_label });
        clearGuestToken();
        setSubmitting(false);
        return;
      }

      const res = await authFetch('/triage/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await parseJson(res);

      if (!res.ok) throw new Error(data.error || 'Submit failed');
      if (!data.id) throw new Error('Server returned invalid response. Is the backend running?');

      setPatientTrackingCase({
        caseId: data.id,
        predicted_wait_time_minutes: data.predicted_wait_time_minutes ?? null,
      });
      lastSnapRef.current = snapshotFromRow(data);
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const markGuidanceRead = () => {
    if (result?.id) setSeenGuidance(result.id, guidanceDigestForNotify(result));
    setGuidanceNotifyTick((t) => t + 1);
  };

  const handleGuestWithdraw = async () => {
    const tok = getGuestCaseAccessToken();
    if (!tok) return;
    if (!window.confirm('Quit triage? Staff will stop tracking this remote request.')) return;
    setGuestActBusy(true);
    try {
      const data = await guestCaseAction(tok, 'withdraw');
      lastSnapRef.current = snapshotFromRow(data);
      setResult((prev) => ({ ...prev, ...data, predicted_wait_time_minutes: prev.predicted_wait_time_minutes }));
      markGuidanceRead();
    } catch (e) {
      alert(e.message || 'Could not quit triage');
    } finally {
      setGuestActBusy(false);
    }
  };

  const handleGuestResolve = async () => {
    const tok = getGuestCaseAccessToken();
    if (!tok) return;
    if (
      !window.confirm(
        'Close this request as resolved? Use this after you have followed the advice you were given and feel better.'
      )
    )
      return;
    setGuestActBusy(true);
    try {
      const data = await guestCaseAction(tok, 'resolve');
      lastSnapRef.current = snapshotFromRow(data);
      setResult((prev) => ({ ...prev, ...data, predicted_wait_time_minutes: prev.predicted_wait_time_minutes }));
      markGuidanceRead();
    } catch (e) {
      alert(e.message || 'Could not close request');
    } finally {
      setGuestActBusy(false);
    }
  };

  const handlePatientWithdraw = async () => {
    if (!result?.id) return;
    if (!window.confirm('Quit triage? Staff will stop tracking this remote request.')) return;
    setPatientActBusy(true);
    try {
      const res = await authFetch(`/patients/${result.id}/withdraw`, { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Request failed');
      lastSnapRef.current = snapshotFromRow(data);
      setResult((prev) => ({ ...prev, ...data, predicted_wait_time_minutes: prev.predicted_wait_time_minutes }));
      markGuidanceRead();
    } catch (e) {
      alert(e.message || 'Could not quit triage');
    } finally {
      setPatientActBusy(false);
    }
  };

  const handlePatientResolve = async () => {
    if (!result?.id) return;
    if (
      !window.confirm(
        'Close this request as resolved? Use this after you have followed the advice you were given and feel better.'
      )
    )
      return;
    setPatientActBusy(true);
    try {
      const res = await authFetch(`/patients/${result.id}/patient-resolve`, { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Request failed');
      lastSnapRef.current = snapshotFromRow(data);
      setResult((prev) => ({ ...prev, ...data, predicted_wait_time_minutes: prev.predicted_wait_time_minutes }));
      markGuidanceRead();
    } catch (e) {
      alert(e.message || 'Could not close request');
    } finally {
      setPatientActBusy(false);
    }
  };

  if (caseHydrating) {
    return (
      <div className={styles.wrap}>
        <h1>Remote triage</h1>
        <p className={styles.intro}>Loading your triage request…</p>
      </div>
    );
  }

  if (result && !result.error) {
    const effectiveLevel = result.final_triage_level ?? result.automated_triage_level;
    const wsGuestToken = getGuestCaseAccessToken() || getGuestToken();
    const isGuestSession = !user && Boolean(getGuestCaseAccessToken());
    const isPatientSession = user?.role === 'patient';
    const isTerminal = ['withdrawn', 'patient_resolved'].includes(result.status);
    return (
      <div className={styles.wrap}>
        <div className={styles.resultTitleRow}>
          <h1 className={styles.resultH1}>My triage request</h1>
          {(guidanceUnread || staffNotifications.length > 0) && (
            <span
              className={styles.notifyBell}
              title="Updates from your care team"
              aria-label="New updates"
            >
              🔔
            </span>
          )}
        </div>

        {!user && (
          <p className={styles.accountHint}>
            After you <strong>submit triage</strong>, this app signs you in as a <strong>patient</strong> on this browser
            (same account we create for your email—no extra registration step).
          </p>
        )}

        {user?.role === 'patient' && (
          <p className={styles.accountHint}>
            You’re signed in as a patient. Use <Link to="/patient">My requests</Link> for the full dashboard and
            history, or stay on this page for live updates. Your session lasts about a week on this device.
          </p>
        )}

        <p className={styles.intro}>
          Status, nurse and doctor names, and clinical guidance update automatically about every 12 seconds while this tab
          is open. You can refresh or come back later on this device.
        </p>

        {(guidanceUnread || staffNotifications.length > 0) && (
          <div className={styles.notifyBannerRow} role="status">
            <strong>New from your care team.</strong>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                markGuidanceRead();
                setStaffNotifications([]);
              }}
            >
              Mark updates as read
            </button>
          </div>
        )}

        {staffNotifications.length > 0 && (
          <div className={styles.staffNotify} role="status">
            <h2 className={styles.staffNotifyTitle}>Updates from your care team</h2>
            <ul className={styles.staffNotifyList}>
              {staffNotifications.map((m, i) => (
                <li key={`${i}-${m.slice(0, 24)}`}>{m}</li>
              ))}
            </ul>
            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => {
                markGuidanceRead();
                setStaffNotifications([]);
              }}
            >
              Dismiss updates
            </button>
          </div>
        )}

        {result.chief_complaint ? (
          <p className={styles.resultComplaint}>
            <strong>Chief complaint:</strong> {result.chief_complaint}
          </p>
        ) : null}

        <div className={styles.resultMeta}>
          <p>
            <strong>Status:</strong>{' '}
            <span className={styles.statusChip} data-status={statusChipAttr(result)}>
              {patientFacingStatus(result)}
            </span>
          </p>
          <p>
            <strong>Nurse:</strong> {result.handling_nurse_name || '—'}
          </p>
          <p>
            <strong>Doctor:</strong>{' '}
            {result.doctor_name ||
              (result.status === 'requested_doctor' ||
              result.status === 'doctor_summoned' ||
              (result.status === 'completed' && !result.concluded_at)
                ? 'Pending review'
                : '—')}
          </p>
        </div>

        {result.doctor_seeking_patient_at ? (
          <div className={styles.doctorSeekAlert} role="status">
            <strong>Please go to the nursing desk</strong> — a clinician is ready to see you
            {result.doctor_seeking_doctor_name ? ` (${result.doctor_seeking_doctor_name})` : ''}.
            {result.doctor_seeking_note ? ` ${result.doctor_seeking_note}` : ''}
          </div>
        ) : null}

        {result.nurse_recommendation ? (
          <blockquote className={styles.nurseRecommendation}>
            <span className={styles.guidanceLabel}>Nurse recommendation</span>
            {result.nurse_recommendation}
          </blockquote>
        ) : null}

        {result.override_reason ? (
          <blockquote className={styles.clinicalGuidance}>
            <span className={styles.guidanceLabel}>Clinical guidance</span>
            {result.override_reason}
          </blockquote>
        ) : null}

        {isTerminal ? (
          <p className={styles.terminalNote}>
            {result.status === 'withdrawn'
              ? 'You have quit triage for this request. Staff will no longer track it here.'
              : 'This request is closed. You indicated you followed advice and feel better.'}
          </p>
        ) : null}

        <div className={`${styles.result} ${styles['triageBar' + effectiveLevel]}`}>
          <div className={styles.triageResult}>
            <span className={`${styles.triageBadge} ${styles['level' + effectiveLevel]}`}>
              Level {effectiveLevel}
            </span>

            <span className={styles.triageText}>{result.triage_label}</span>
          </div>

          {result.final_triage_level != null &&
            result.final_triage_level !== result.automated_triage_level && (
              <p className={styles.note}>
                Initial automated suggestion was level {result.automated_triage_level}.
              </p>
            )}

          {result.predicted_wait_time_minutes != null && (
            <p className={styles.note}>
              Estimated wait time: <strong>{Math.round(result.predicted_wait_time_minutes)} minutes</strong>
            </p>
          )}

          {!isTerminal && (
            <p className={styles.note}>
              A nurse may review your case and adjust this level. Proceed to the emergency department when ready.
            </p>
          )}

          {isGuestSession && !isTerminal && (
            <div className={styles.guestActions}>
              {canGuestQuit(result) && (
                <button
                  type="button"
                  className={styles.dangerOutline}
                  disabled={guestActBusy}
                  onClick={handleGuestWithdraw}
                >
                  Quit triage
                </button>
              )}
              {canGuestSelfResolve(result) && (
                <button
                  type="button"
                  className={styles.resolveBtn}
                  disabled={guestActBusy}
                  onClick={handleGuestResolve}
                >
                  I followed the advice and feel better — close request
                </button>
              )}
            </div>
          )}

          {isPatientSession && !isTerminal && (
            <div className={styles.guestActions}>
              {canGuestQuit(result) && (
                <button
                  type="button"
                  className={styles.dangerOutline}
                  disabled={patientActBusy}
                  onClick={handlePatientWithdraw}
                >
                  Quit triage
                </button>
              )}
              {canGuestSelfResolve(result) && (
                <button
                  type="button"
                  className={styles.resolveBtn}
                  disabled={patientActBusy}
                  onClick={handlePatientResolve}
                >
                  I followed the advice and feel better — close request
                </button>
              )}
            </div>
          )}

          <button type="button" onClick={() => navigate('/')}>
            Back to home
          </button>

          <button
            type="button"
            className={styles.secondary}
            onClick={() => {
              setActiveCall(false);
              setLiveCallMsg('');
              setStaffNotifications([]);
              lastSnapRef.current = null;
              clearGuestActiveCase();
              clearPatientTrackingCase();
              setResult(null);
              setChiefComplaint('');
              setSymptoms([]);
              setUrgency(5);
            }}
          >
            Submit another
          </button>
          {!isTerminal && result?.id && (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setActiveCall(true)}
            >
              Join telemedicine call
            </button>
          )}
        </div>
        {liveCallMsg && <p className={styles.note}>{liveCallMsg}</p>}
        {!isTerminal && activeCall && result?.id && (
          <PatientCall
            caseId={result.id}
            tokenOverride={!user ? wsGuestToken : undefined}
            onClose={() => setActiveCall(false)}
            onTriageUpdate={(msg) => {
              setLiveCallMsg(`Nurse updated your triage to level ${msg.level}${msg.reason ? ` (${msg.reason})` : ''}.`);
            }}
          />
        )}
      </div>
    );
  }

  if (needsOtp) {
    return (
      <div className={styles.wrap}>
        <h1>Verify with email</h1>
        <p className={styles.intro}>
          Enter your email to receive a one-time code. No account or password needed.
        </p>

        {otpError && <div className={styles.error}>{otpError}</div>}

        {!otpSent ? (
          <form onSubmit={handleSendOtp} className={styles.form}>
            <section>
              <label>
                Email
                <input
                  type="email"
                  value={otpEmail}
                  onChange={(e) => setOtpEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
            </section>

            <button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className={styles.form}>
            {otpEmailDelivered === false && (
              <div className={styles.otpDevNote} role="status">
                <strong>No email was sent from this machine.</strong> Your <code>.env</code> file does not define SMTP
                settings yet, so the server only prints the code in the terminal where you run{' '}
                <code>npm run server</code> (or <code>npm run dev</code>). Look for a line like{' '}
                <code>[otp] SMTP_HOST not set; OTP for …</code>. To get the code in your real inbox, add the variables
                in <code>.env.example</code> under “OTP email” and restart the server.
              </div>
            )}
            {otpEmailDelivered === true && (
              <p className={styles.intro}>
                Check your inbox for an 8-digit code—it can take a minute or two. If you don’t see it, peek at{' '}
                <strong>Spam</strong> or <strong>Junk</strong>, then enter the code below.
              </p>
            )}
            <section>
              <label>
                Verification code
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder={
                    otpEmailDelivered === false
                      ? 'Code from server terminal'
                      : 'Enter the 8-digit code from your email'
                  }
                  autoComplete="one-time-code"
                />
              </label>
            </section>

            <div className={styles.otpActions}>
              <button type="submit" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify'}
              </button>

              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  clearOtpPendingEmail();
                  setOtpSent(false);
                  setOtpEmailDelivered(null);
                  setOtpError('');
                  setOtpCode('');
                  setOtpEmail('');
                }}
              >
                Use different email
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h1>Remote triage</h1>

      {verifiedEmail && (
        <p className={styles.verifiedAs}>
          Email verified.{' '}
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => {
              clearPatientVerified();
              clearGuestToken();
              clearGuestActiveCase();
              clearPatientTrackingCase();
              clearOtpPendingEmail();
              setVerifiedEmail(null);
              setOtpEmail('');
              setOtpCode('');
              setOtpSent(false);
              setOtpError('');
              setResult(null);
              lastSnapRef.current = null;
            }}
          >
            Use different email
          </button>
        </p>
      )}

      <p className={styles.intro}>
        Submit your symptoms and urgency. You will receive a preliminary triage level before arriving at the ED.
      </p>

      {result?.error && (
        <div className={styles.error}>
          {result.error}
          <p className={styles.errorHint}>Check the server terminal for details.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <section>
          <h2>Demographics (optional)</h2>
          <div className={styles.row}>
            <label>
              Age
              <input
                type="number"
                min="0"
                max="120"
                value={demographics.age}
                onChange={(e) => setDemographics((d) => ({ ...d, age: e.target.value }))}
                placeholder="e.g. 45"
              />
            </label>

            <label>
              Gender
              <select
                value={demographics.gender}
                onChange={(e) => setDemographics((d) => ({ ...d, gender: e.target.value }))}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h2>Chief complaint</h2>
          <textarea
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="Brief description of why you are seeking emergency care…"
            rows={3}
          />
        </section>

        <section>
          <h2>Self-reported urgency</h2>
<p className={styles.urgencyNote}>
  1 = most urgent • 5 = least urgent
</p>
          <div className={styles.urgency}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={styles.urgencyOption}>
                <input
                  type="radio"
                  name="urgency"
                  value={n}
                  checked={urgency === n}
                  onChange={() => setUrgency(n)}
                />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
  <h2>Symptoms</h2>
  <p className={styles.selectHint}>Hold Ctrl (or Cmd on Mac) to select more than one symptom.</p>

  <select
    multiple
    className={styles.multiSelect}
    value={symptoms}
    onChange={(e) => {
      const selected = Array.from(e.target.selectedOptions, (option) => option.value);
      setSymptoms(selected);
    }}
  >
    {SYMPTOM_OPTIONS.map(({ id, label }) => (
      <option key={id} value={id}>
        {label}
      </option>
    ))}
  </select>

  {symptoms.length > 0 && (
    <div className={styles.selectedSymptoms}>
      {symptoms.map((id) => {
        const match = SYMPTOM_OPTIONS.find((item) => item.id === id);
        return (
          <span key={id} className={styles.selectedTag}>
            {match?.label || id}
          </span>
        );
      })}
    </div>
  )}
</section>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit triage'}
        </button>
      </form>
    </div>
  );
}
