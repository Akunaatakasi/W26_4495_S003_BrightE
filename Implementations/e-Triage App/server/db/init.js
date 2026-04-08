import 'dotenv/config';
import pool from './pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

const ALLOWED_STATUSES = [
  'submitted',
  'under_review',
  'nurse_watch',
  'requested_doctor',
  'doctor_summoned',
  'completed',
  'withdrawn',
  'patient_resolved',
];

async function init() {
  try {
    await pool.query(schema);
    console.log('Database schema initialized.');

    await pool.query(`
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS concluded_by INTEGER REFERENCES users(id);
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS reviewing_nurse_id INTEGER REFERENCES users(id);
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS patient_withdrew_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS patient_resolved_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS nurse_recommendation TEXT;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS watch_review_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS doctor_seeking_patient_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS doctor_seeking_patient_by INTEGER REFERENCES users(id);
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS doctor_seeking_note TEXT;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS doctor_seek_acknowledged_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS nurse_completed_at TIMESTAMPTZ;
    ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS nurse_completed_by INTEGER REFERENCES users(id);
  `);

    await pool.query(`ALTER TABLE triage_cases DROP CONSTRAINT IF EXISTS triage_cases_status_check;`);

    // Legacy: nurse "forward" used status completed with no doctor conclusion — align with current workflow
    await pool.query(`
      UPDATE triage_cases
      SET status = 'requested_doctor', completed_at = NULL
      WHERE status = 'completed' AND concluded_by IS NULL;
    `);

    // Doctor had requested patient at desk before doctor_summoned status existed
    await pool.query(`
      UPDATE triage_cases
      SET status = 'doctor_summoned'
      WHERE status = 'requested_doctor'
        AND doctor_seeking_patient_at IS NOT NULL
        AND concluded_by IS NULL;
    `);

    // Any unknown / empty status → submitted so CHECK can be applied
    await pool.query(
      `UPDATE triage_cases
       SET status = 'submitted'
       WHERE status IS NULL
          OR TRIM(COALESCE(status::text, '')) = ''
          OR NOT (status::text = ANY($1::text[]));`,
      [ALLOWED_STATUSES]
    );

    await pool.query(`
    ALTER TABLE triage_cases ADD CONSTRAINT triage_cases_status_check
    CHECK (status IN (
      'submitted', 'under_review', 'nurse_watch', 'requested_doctor', 'doctor_summoned',
      'completed', 'withdrawn', 'patient_resolved'
    ));
  `);

    console.log('Migrations applied.');
  } catch (err) {
    console.error('Init failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

init();
