import pool from './pool.js';

export async function logAudit({ userId, action, resourceType, resourceId, details = {}, ipAddress } = {}) {
  await pool.query(
    `INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId ?? null, action, resourceType ?? null, resourceId ?? null, JSON.stringify(details), ipAddress ?? null]
  );
}
