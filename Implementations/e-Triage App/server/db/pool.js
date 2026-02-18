import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/bright_triage';
const useSsl = process.env.NODE_ENV === 'production' || /supabase\.com/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ...(useSsl && { ssl: { rejectUnauthorized: false } }),
});

export default pool;
