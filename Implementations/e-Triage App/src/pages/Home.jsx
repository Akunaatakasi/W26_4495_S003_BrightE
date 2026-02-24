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
          </div>
        )}
        {user?.role === 'nurse' && (
          <div className={styles.actions}>
            <Link to="/nurse" className={styles.primary}>View triage queue</Link>
            <Link to="/nurse/audit" className={styles.secondary}>Audit log</Link>
          </div>
        )}
        {user?.role === 'doctor' && (
          <div className={styles.actions}>
            <Link to="/doctor" className={styles.primary}>View completed triage</Link>
          </div>
        )}
      </div>

      <section className={styles.features}>
        <h2 className={styles.featuresTitle}>How it works</h2>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>1</span>
            <h3>Patients</h3>
            <p>Submit symptom information and urgency remotely before arriving at the ED.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>2</span>
            <h3>Automated triage</h3>
            <p>Preliminary ESI-like level (1–5) is assigned from your inputs.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>3</span>
            <h3>Nurse oversight</h3>
            <p>Nurses review cases, override triage levels, and complete assessments—human-in-the-loop.</p>
          </article>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>4</span>
            <h3>Audit & research</h3>
            <p>All actions are logged for accountability and research.</p>
          </article>
        </div>
      </section>
    </div>
  );
}
