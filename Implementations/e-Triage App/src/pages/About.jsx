import styles from './About.module.css';

export default function About() {
  return (
    <div className={styles.about}>
      <div className={styles.hero}>
        <h1>About e-Triage</h1>
        <p className={styles.subtitle}>
          e-Triage is a remote emergency department triage and telemedicine prototype designed to support faster review, nurse oversight, and doctor follow-up.
        </p>
      </div>

      <section className={styles.features}>
        <h2 className={styles.featuresTitle}>How it works</h2>
        <div className={styles.featureGrid}>
          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>1</span>
            <h3>Patient submission</h3>
            <p>Patients submit their symptoms and urgency remotely before arriving at the emergency department.</p>
          </article>

          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>2</span>
            <h3>Automated triage</h3>
            <p>A preliminary triage level is generated from the submitted information to support the review process.</p>
          </article>

          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>3</span>
            <h3>Nurse review</h3>
            <p>Nurses assess the case, adjust the triage level if needed, and move the case forward for the next stage of review.</p>
          </article>

          <article className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden>4</span>
            <h3>Doctor follow-up</h3>
            <p>Doctors review requested cases and complete the final step in the current workflow.</p>
          </article>
        </div>
      </section>
    </div>
  );
}