import pool from './pool.js';

let ensured = false;

async function ensureCalibrationTable() {
  if (ensured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ml_level_calibration (
      predicted_level INTEGER PRIMARY KEY CHECK (predicted_level BETWEEN 1 AND 5),
      sample_count INTEGER NOT NULL DEFAULT 0,
      total_delta NUMERIC NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  ensured = true;
}

function clampLevel(level) {
  return Math.max(1, Math.min(5, Math.round(Number(level) || 5)));
}

export async function applyLevelCalibration(predictedLevel) {
  const base = clampLevel(predictedLevel);
  try {
    await ensureCalibrationTable();
    const { rows } = await pool.query(
      'SELECT sample_count, total_delta FROM ml_level_calibration WHERE predicted_level = $1',
      [base]
    );
    const row = rows[0];
    if (!row || Number(row.sample_count) <= 0) {
      return { calibratedLevel: base, averageDelta: 0, sampleCount: 0 };
    }
    const averageDelta = Number(row.total_delta) / Number(row.sample_count);
    const calibratedLevel = clampLevel(base + Math.round(averageDelta));
    return {
      calibratedLevel,
      averageDelta: Math.round(averageDelta * 1000) / 1000,
      sampleCount: Number(row.sample_count),
    };
  } catch (e) {
    // Non-blocking: keep triage flow running if calibration storage is unavailable.
    return { calibratedLevel: base, averageDelta: 0, sampleCount: 0 };
  }
}

export async function learnFromNurseOverride(predictedLevel, finalLevel) {
  const predicted = clampLevel(predictedLevel);
  const final = clampLevel(finalLevel);
  const delta = final - predicted;
  try {
    await ensureCalibrationTable();
    await pool.query(
      `INSERT INTO ml_level_calibration (predicted_level, sample_count, total_delta, updated_at)
       VALUES ($1, 1, $2, NOW())
       ON CONFLICT (predicted_level)
       DO UPDATE SET
         sample_count = ml_level_calibration.sample_count + 1,
         total_delta = ml_level_calibration.total_delta + EXCLUDED.total_delta,
         updated_at = NOW()`,
      [predicted, delta]
    );
  } catch (e) {
    // Non-blocking: failures here should not block clinical workflow.
  }
}
