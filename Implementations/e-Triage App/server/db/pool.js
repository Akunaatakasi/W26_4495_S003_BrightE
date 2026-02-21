import pg from 'pg';
const { Pool } = pg;

// Use Supabase POOLER URL (e.g. ...@aws-0-us-east-2.pooler.supabase.com:6543/...).
// Direct db.xxx.supabase.co:5432 uses IPv6 and often causes ETIMEDOUT.
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/bright_triage';
const useSsl = process.env.NODE_ENV === 'production' || /supabase\.com/i.test(connectionString);

const pool = new Pool({
  connectionString,
  ...(useSsl && { ssl: { rejectUnauthorized: false } }),
});

export default pool;
