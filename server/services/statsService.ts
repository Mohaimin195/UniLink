import type Database from 'better-sqlite3';

export interface ProfileStats {
  averageRating: number | null;
  verifiedReviews: number;
  completedJobs: number;
  uniqueClients: number;
  departmentsServed: number;
  repeatClients: number;
  onTimeRate: number | null;
  monthlyJobs: Array<{ month: string; count: number }>;
  monthlyRatings: Array<{ month: string; avgRating: number; reviewCount: number }>;
  topRequestedSkills: Array<{ skill: string; count: number }>;
  observedResponseMinutesEstimate: number | null;
}

export function getProfileStats(db: Database.Database, userId: string): ProfileStats {
  const ratingAgg = db
    .prepare(
      `
      SELECT
        COUNT(*) AS cnt,
        AVG(rating) AS avg_rating,
        AVG(CASE WHEN on_time_rating IS NOT NULL THEN CASE WHEN on_time_rating >= 4 THEN 1.0 ELSE 0.0 END END) AS on_time_ratio,
        COUNT(on_time_rating) AS on_time_count
      FROM reviews
      WHERE reviewee_id = ? AND moderation_status = 'valid'
    `,
    )
    .get(userId) as {
    cnt: number;
    avg_rating: number | null;
    on_time_ratio: number | null;
    on_time_count: number;
  };

  const jobsAgg = db
    .prepare(
      `
      SELECT
        COUNT(*) AS completed_jobs,
        COUNT(DISTINCT requester_id) AS unique_clients,
        COUNT(DISTINCT NULLIF(requester_department_at_job, '')) AS departments_served
      FROM jobs
      WHERE helper_id = ? AND status = 'completed'
    `,
    )
    .get(userId) as {
    completed_jobs: number;
    unique_clients: number;
    departments_served: number;
  };

  const repeatRow = db
    .prepare(
      `
      SELECT COUNT(*) AS repeat_clients
      FROM (
        SELECT requester_id
        FROM jobs
        WHERE helper_id = ? AND status = 'completed'
        GROUP BY requester_id
        HAVING COUNT(*) > 1
      )
    `,
    )
    .get(userId) as { repeat_clients: number };

  const monthlyJobs = db
    .prepare(
      `
      SELECT substr(completed_at, 1, 7) AS month, COUNT(*) AS count
      FROM jobs
      WHERE helper_id = ? AND status = 'completed' AND completed_at IS NOT NULL
      GROUP BY substr(completed_at, 1, 7)
      ORDER BY month ASC
      LIMIT 6
    `,
    )
    .all(userId) as Array<{ month: string; count: number }>;

  const monthlyRatings = db
    .prepare(
      `
      SELECT substr(created_at, 1, 7) AS month, ROUND(AVG(rating), 2) AS avgRating, COUNT(*) AS reviewCount
      FROM reviews
      WHERE reviewee_id = ? AND moderation_status = 'valid'
      GROUP BY substr(created_at, 1, 7)
      ORDER BY month ASC
      LIMIT 6
    `,
    )
    .all(userId) as Array<{ month: string; avgRating: number; reviewCount: number }>;

  const topRequestedSkills = db
    .prepare(
      `
      SELECT s.name AS skill, COUNT(*) AS count
      FROM jobs j
      JOIN request_skills rs ON rs.request_id = j.request_id
      JOIN skills s ON s.id = rs.skill_id
      WHERE j.helper_id = ? AND j.status = 'completed'
      GROUP BY s.id
      ORDER BY count DESC
      LIMIT 5
    `,
    )
    .all(userId) as Array<{ skill: string; count: number }>;

  // Observed offer response speed estimate (only if >= 2 offers exist)
  const responseRow = db
    .prepare(
      `
      SELECT
        COUNT(*) AS offer_cnt,
        AVG((julianday(o.created_at) - julianday(r.created_at)) * 1440.0) AS avg_minutes
      FROM offers o
      JOIN requests r ON r.id = o.request_id
      WHERE o.helper_id = ?
    `,
    )
    .get(userId) as { offer_cnt: number; avg_minutes: number | null };

  const verifiedReviews = ratingAgg.cnt || 0;
  const averageRating = verifiedReviews > 0 && ratingAgg.avg_rating !== null ? Number(ratingAgg.avg_rating.toFixed(2)) : null;
  const onTimeRate =
    ratingAgg.on_time_count >= 3 && ratingAgg.on_time_ratio !== null
      ? Math.round(ratingAgg.on_time_ratio * 100)
      : null;

  const observedResponseMinutesEstimate =
    responseRow.offer_cnt >= 2 && responseRow.avg_minutes !== null
      ? Math.max(1, Math.round(responseRow.avg_minutes))
      : null;

  return {
    averageRating,
    verifiedReviews,
    completedJobs: jobsAgg.completed_jobs || 0,
    uniqueClients: jobsAgg.unique_clients || 0,
    departmentsServed: jobsAgg.departments_served || 0,
    repeatClients: repeatRow.repeat_clients || 0,
    onTimeRate,
    monthlyJobs,
    monthlyRatings,
    topRequestedSkills,
    observedResponseMinutesEstimate,
  };
}

export interface SuspiciousActivityFlag {
  type: 'reciprocal_hiring' | 'rapid_completion' | 'repeated_reregistration';
  severity: 'medium' | 'high';
  summary: string;
  targetId: string;
  details: string;
}

export function detectSuspiciousPatterns(db: Database.Database): SuspiciousActivityFlag[] {
  const flags: SuspiciousActivityFlag[] = [];

  // 1. Repeated jobs between the same two accounts (>= 3 completed jobs)
  const pairRows = db
    .prepare(
      `
      SELECT
        j.requester_id,
        j.helper_id,
        up1.display_name AS req_name,
        up2.display_name AS helper_name,
        COUNT(*) AS cnt
      FROM jobs j
      JOIN user_profiles up1 ON up1.user_id = j.requester_id
      JOIN user_profiles up2 ON up2.user_id = j.helper_id
      WHERE j.status = 'completed'
      GROUP BY j.requester_id, j.helper_id
      HAVING COUNT(*) >= 3
    `,
    )
    .all() as Array<{ requester_id: string; helper_id: string; req_name: string; helper_name: string; cnt: number }>;

  for (const row of pairRows) {
    flags.push({
      type: 'reciprocal_hiring',
      severity: 'medium',
      summary: `${row.cnt} completed jobs between ${row.req_name} and ${row.helper_name}`,
      targetId: row.helper_id,
      details: `High concentration of repeated hiring between accounts (${row.requester_id} → ${row.helper_id}). Review for potential reputation inflation.`,
    });
  }

  // 2. Unusually fast completion (< 3 minutes from accepted_at to completed_at)
  const rapidRows = db
    .prepare(
      `
      SELECT j.id, up.display_name AS helper_name,
             ROUND((julianday(j.completed_at) - julianday(j.accepted_at)) * 1440.0, 1) AS mins
      FROM jobs j
      JOIN user_profiles up ON up.user_id = j.helper_id
      WHERE j.status = 'completed'
        AND j.completed_at IS NOT NULL
        AND (julianday(j.completed_at) - julianday(j.accepted_at)) * 1440.0 < 3.0
    `,
    )
    .all() as Array<{ id: string; helper_name: string; mins: number }>;

  for (const row of rapidRows) {
    flags.push({
      type: 'rapid_completion',
      severity: 'medium',
      summary: `Job completed in ${row.mins} min (${row.helper_name})`,
      targetId: row.id,
      details: `Job ${row.id} moved from accepted to completed in under 3 minutes.`,
    });
  }

  // 3. Flagged delete/re-register email records
  const delRows = db
    .prepare(`SELECT id, last_user_id, re_registered_count FROM account_deletion_records WHERE flagged_for_review = 1`)
    .all() as Array<{ id: string; last_user_id: string; re_registered_count: number }>;

  for (const row of delRows) {
    flags.push({
      type: 'repeated_reregistration',
      severity: 'high',
      summary: `Repeated account deletion & re-registration (${row.re_registered_count}x)`,
      targetId: row.last_user_id,
      details: `Deletion record ${row.id} exceeded re-registration threshold.`,
    });
  }

  return flags;
}
