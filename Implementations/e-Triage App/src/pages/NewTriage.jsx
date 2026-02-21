import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { parseJson, sendOtp, verifyOtp, getPatientVerified, setPatientVerified, getGuestToken, clearGuestToken, DEMO_ONLY, DEMO_GUEST_TOKEN } from '../utils/api';
import styles from './NewTriage.module.css';

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

export default function NewTriage() {
  const [demographics, setDemographics] = useState({ age: '', gender: '' });
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [symptoms, setSymptoms] = useState([]);
  const [urgency, setUrgency] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const { user, authFetch } = useAuth();

  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState(() => getPatientVerified());

  useEffect(() => {
    setVerifiedEmail(getPatientVerified());
  }, []);

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
      await sendOtp(email);
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
    setSubmitting(true);
    try {
      await verifyOtp(otpEmail.trim(), otpCode.trim());
      setPatientVerified(otpEmail.trim());
      setVerifiedEmail(otpEmail.trim());
      setOtpSent(false);
      setOtpEmail('');
      setOtpCode('');
    } catch (err) {
      setOtpError(err.message || 'Verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const navigate = useNavigate();

  const toggleSymptom = (id) => {
    setSymptoms((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      demographics: { age: demographics.age || undefined, gender: demographics.gender || undefined },
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
        if (DEMO_ONLY && guest_token === DEMO_GUEST_TOKEN) {
          setResult({ id: 'demo', triage_label: 'Demo – not saved', note: 'Demo mode: triage was not sent to a server.' });
          clearGuestToken();
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/triage/submit-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guest_token, ...payload }),
        });
        const data = await parseJson(res);
        if (!res.ok) throw new Error(data.error || 'Submit failed');
        if (!data.id) throw new Error('Server returned invalid response.');
        setResult({ ...data, triage_label: data.triage_label });
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
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (result && !result.error) {
    return (
      <div className={styles.wrap}>
        <h1>Preliminary triage result</h1>
        <div className={styles.result}>
          <p className={styles.level}>Automated triage: <strong>{result.triage_label}</strong></p>
          <p className={styles.note}>A nurse may review your case and adjust this level. Proceed to the emergency department when ready.</p>
          <button type="button" onClick={() => navigate('/')}>Back to home</button>
          <button type="button" className={styles.secondary} onClick={() => { setResult(null); setChiefComplaint(''); setSymptoms([]); setUrgency(5); }}>Submit another</button>
        </div>
      </div>
    );
  }

  if (needsOtp) {
    return (
      <div className={styles.wrap}>
        <h1>Verify with email</h1>
        <p className={styles.intro}>Enter your email to receive a one-time code. No account or password needed.</p>
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
            <button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send OTP'}</button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className={styles.form}>
            <section>
              <label>
                Enter the code for {otpEmail}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 05080307"
                  autoComplete="one-time-code"
                />
              </label>
            </section>
            <div className={styles.otpActions}>
              <button type="submit" disabled={submitting}>{submitting ? 'Verifying…' : 'Verify'}</button>
              <button type="button" className={styles.secondary} onClick={() => { setOtpSent(false); setOtpError(''); }}>Use different email</button>
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
          Verified as <strong>{verifiedEmail}</strong>
          <button type="button" className={styles.linkBtn} onClick={() => { clearPatientVerified(); clearGuestToken(); setVerifiedEmail(null); }}>Use different email</button>
        </p>
      )}
      <p className={styles.intro}>Submit your symptoms and urgency. You will receive a preliminary triage level before arriving at the ED.</p>
      {result?.error && <div className={styles.error}>{result.error}</div>}
      <form onSubmit={handleSubmit} className={styles.form}>
        <section>
          <h2>Demographics (optional)</h2>
          <div className={styles.row}>
            <label>
              Age
              <input type="number" min="0" max="120" value={demographics.age} onChange={(e) => setDemographics((d) => ({ ...d, age: e.target.value }))} placeholder="e.g. 45" />
            </label>
            <label>
              Gender
              <select value={demographics.gender} onChange={(e) => setDemographics((d) => ({ ...d, gender: e.target.value }))}>
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
          <textarea value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} placeholder="Brief description of why you are seeking emergency care…" rows={3} />
        </section>
        <section>
          <h2>Self-reported urgency (1 = most urgent, 5 = least urgent)</h2>
          <div className={styles.urgency}>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={styles.urgencyOption}>
                <input type="radio" name="urgency" value={n} checked={urgency === n} onChange={() => setUrgency(n)} />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </section>
        <section>
          <h2>Select any that apply</h2>
          <div className={styles.symptoms}>
            {SYMPTOM_OPTIONS.map(({ id, label }) => (
              <label key={id} className={styles.checkbox}>
                <input type="checkbox" checked={symptoms.includes(id)} onChange={() => toggleSymptom(id)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
        <button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit triage'}</button>
      </form>
    </div>
  );
}
