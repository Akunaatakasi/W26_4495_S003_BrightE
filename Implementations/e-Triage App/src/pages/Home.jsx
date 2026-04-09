import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from './Home.module.css';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className={styles.home}>
      <div className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden />
        <h1 className={styles.title}>
          Remote ED Triage
          <span className={styles.titleAccent}> & Telemedicine</span>
        </h1>
        <p className={styles.subtitle}>
          Optimizing Emergency Department throughput via remote digital triage and synchronous telemedicine interventions.
        </p>

        {!user && (
          <div className={styles.actions}>
            <Link to="/triage/new" className={styles.primary}>Start triage</Link>
            <Link to="/er-queue" className={styles.secondary}>ED queue (public)</Link>
          </div>
        )}

        {user?.role === 'nurse' && (
          <div className={styles.actions}>
            <Link to="/nurse" className={styles.primary}>Open triage queue</Link>
            <Link to="/nurse/audit" className={styles.secondary}>Audit log</Link>
          </div>
        )}

        {user?.role === 'doctor' && (
          <div className={styles.actions}>
            <Link to="/doctor" className={styles.primary}>Open doctor queue</Link>
          </div>
        )}

        {user?.role === 'patient' && (
          <div className={styles.actions}>
            <Link to="/triage/new" className={styles.primary}>Start new triage</Link>
            <Link to="/patient" className={styles.secondary}>My requests</Link>
            <Link to="/er-queue" className={styles.secondary}>ED queue (public)</Link>
          </div>
        )}
      </div>
    </div>
  );
}