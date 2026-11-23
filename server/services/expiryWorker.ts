import type Database from 'better-sqlite3';

export interface ExpirySweepResult {
  expiredRequestsCount: number;
  removedAlertsCount: number;
}

/**
 * Server-side expiry sweep:
 * 1. Marks active requests past their 24h expires_at as 'expired'.
 * 2. Deletes expired 12h request_alerts from the Request Alerts inbox
 *    WITHOUT deleting or mutating the underlying requests.
 */
export function runExpirySweep(db: Database.Database, nowIso: string = new Date().toISOString()): ExpirySweepResult {
  const tx = db.transaction(() => {
    const reqRes = db
      .prepare(
        `
        UPDATE requests
        SET status = 'expired', closed_at = COALESCE(closed_at, ?)
        WHERE status = 'active' AND expires_at <= ?
      `,
      )
      .run(nowIso, nowIso);

    const alertRes = db
      .prepare(`DELETE FROM request_alerts WHERE expires_at <= ?`)
      .run(nowIso);

    return {
      expiredRequestsCount: reqRes.changes,
      removedAlertsCount: alertRes.changes,
    };
  });

  return tx();
}

export function startExpiryWorker(db: Database.Database, intervalMs: number = 30_000): NodeJS.Timeout {
  runExpirySweep(db);
  return setInterval(() => {
    try {
      runExpirySweep(db);
    } catch (err) {
      console.error('Expiry worker sweep error:', err);
    }
  }, intervalMs);
}
