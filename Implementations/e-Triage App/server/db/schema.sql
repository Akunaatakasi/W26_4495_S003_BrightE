-- Bright Remote Triage - Database Schema
-- Run this in PostgreSQL to create tables (or use init.js)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('patient', 'nurse', 'doctor')),
  full_name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triage_cases (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER NOT NULL REFERENCES users(id),
  -- Demographics (stored as JSON for flexibility)
  demographics JSONB DEFAULT '{}',
  -- Symptoms and urgency
  chief_complaint TEXT,
  symptoms JSONB DEFAULT '[]',
  self_reported_urgency INTEGER CHECK (self_reported_urgency BETWEEN 1 AND 5),
  -- Automated vs final triage
  automated_triage_level INTEGER NOT NULL CHECK (automated_triage_level BETWEEN 1 AND 5),
  final_triage_level INTEGER CHECK (final_triage_level BETWEEN 1 AND 5),
  overridden_by INTEGER REFERENCES users(id),
  overridden_at TIMESTAMPTZ,
  override_reason TEXT,
  -- Status: submitted, under_review, completed
  status VARCHAR(30) DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'completed')),
  -- Timestamps for metrics
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  first_reviewed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id INTEGER,
  details JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_patient ON triage_cases(patient_id);
CREATE INDEX IF NOT EXISTS idx_triage_status ON triage_cases(status);
CREATE INDEX IF NOT EXISTS idx_triage_submitted ON triage_cases(submitted_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
