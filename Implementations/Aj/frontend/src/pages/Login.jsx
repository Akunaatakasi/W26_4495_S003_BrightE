import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Auth.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, demoLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    }
  };

  const handleDemo = (role) => {
    demoLogin(role);
    if (role === 'nurse') navigate('/nurse');
    else if (role === 'doctor') navigate('/doctor');
    else navigate('/');
  };

  return (
    <div className={styles.wrap}>
      <h1>Log in</h1>

      <div className={styles.demoBlock}>
        <p className={styles.demoLabel}>No backend? Use demo (no database):</p>
        <div className={styles.demoButtons}>
          <button type="button" className={styles.demoBtn} onClick={() => handleDemo('patient')}>
            Enter as Patient
          </button>
          <button type="button" className={styles.demoBtn} onClick={() => handleDemo('nurse')}>
            Enter as Nurse
          </button>
          <button type="button" className={styles.demoBtn} onClick={() => handleDemo('doctor')}>
            Enter as Doctor
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit">Log in</button>
      </form>
      <p className={styles.foot}>
        Staff only. Patients submit triage without logging in.
      </p>
    </div>
  );
}
