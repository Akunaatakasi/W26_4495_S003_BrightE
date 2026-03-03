import 'dotenv/config';
import pool from './pool.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

async function init() {
  try {
    await pool.query(schema);
    console.log('Database schema initialized.');
    // Migration: add doctor conclude columns if missing (existing DBs)
    await pool.query(`
      ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS concluded_by INTEGER REFERENCES users(id);
      ALTER TABLE triage_cases ADD COLUMN IF NOT EXISTS concluded_at TIMESTAMPTZ;
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
