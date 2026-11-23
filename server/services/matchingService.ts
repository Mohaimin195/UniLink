import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { wsHub } from '../wsHub.ts';

export interface DispatchAlertsResult {
  matchedUserIds: string[];
  createdCount: number;
}

/**
 * Matches an active request against eligible, verified student profiles:
 * 1. Skill tag match (if request specifies skill tags)
 * 2. Campus match (if restricted)
 * 3. Department match (if restricted)
 * 4. Semester range match (if restricted)
 * 5. Preferred helper gender (only if request restricts AND member voluntarily opted in)
 * 6. Work mode compatibility
 * 7. Active & verified account, not blocked either direction, category not muted
 * 8. Deduplicated per (recipient_id, request_id) with 12-hour alert inbox expiry
 */
export function dispatchRequestAlerts(db: Database.Database, requestId: string): DispatchAlertsResult {
  const reqRow = db
    .prepare(`SELECT * FROM requests WHERE id = ? AND status = 'active'`)
    .get(requestId) as
    | {
        id: string;
        owner_id: string;
        title: string;
        category: string;
        target_all_campuses: number;
        target_all_departments: number;
        min_semester: number | null;
        max_semester: number | null;
        preferred_gender: 'any' | 'male' | 'female';
        work_mode: 'online' | 'in_person' | 'either';
        created_at: string;
      }
    | undefined;

  if (!reqRow) {
    return { matchedUserIds: [], createdCount: 0 };
  }

  const settingRow = db
    .prepare(`SELECT value FROM platform_settings WHERE key = 'alert_expiry_hours'`)
    .get() as { value: string } | undefined;
  const alertHours = Math.max(1, Number(settingRow?.value || 12));

  const skillRows = db
    .prepare(`SELECT skill_id FROM request_skills WHERE request_id = ?`)
    .all(requestId) as Array<{ skill_id: string }>;
  const reqSkillIds = new Set(skillRows.map((r) => r.skill_id));

  const campusRows = db
    .prepare(`SELECT campus_id FROM request_target_campuses WHERE request_id = ?`)
    .all(requestId) as Array<{ campus_id: string }>;
  const targetCampusIds = new Set(campusRows.map((r) => r.campus_id));

  const deptRows = db
    .prepare(`SELECT department_id FROM request_target_departments WHERE request_id = ?`)
    .all(requestId) as Array<{ department_id: string }>;
  const targetDeptIds = new Set(deptRows.map((r) => r.department_id));

  const candidates = db
    .prepare(
      `
      SELECT
        u.id,
        u.muted_alert_categories_json,
        up.campus_id,
        up.department_id,
        up.semester,
        up.work_mode,
        up.gender,
        up.gender_matching_opt_in
      FROM users u
      JOIN user_profiles up ON up.user_id = u.id
      WHERE u.account_status = 'active'
        AND u.email_verified = 1
        AND u.id != ?
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = u.id AND b.blocked_id = ?)
             OR (b.blocker_id = ? AND b.blocked_id = u.id)
        )
    `,
    )
    .all(reqRow.owner_id, reqRow.owner_id, reqRow.owner_id) as Array<{
    id: string;
    muted_alert_categories_json: string;
    campus_id: string | null;
    department_id: string | null;
    semester: number | null;
    work_mode: 'online' | 'in_person' | 'either';
    gender: 'male' | 'female' | null;
    gender_matching_opt_in: number;
  }>;

  const userSkillsStmt = db.prepare(`SELECT skill_id FROM user_skills WHERE user_id = ?`);
  const insertAlertStmt = db.prepare(
    `
    INSERT OR IGNORE INTO request_alerts (id, recipient_id, request_id, sent_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `,
  );

  const now = new Date();
  const sentAtIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + alertHours * 60 * 60 * 1000).toISOString();

  const matchedUserIds: string[] = [];
  let createdCount = 0;

  const tx = db.transaction(() => {
    for (const candidate of candidates) {
      // Muted categories check
      let mutedCategories: string[] = [];
      try {
        mutedCategories = JSON.parse(candidate.muted_alert_categories_json || '[]');
      } catch {
        mutedCategories = [];
      }
      if (mutedCategories.includes(reqRow.category)) continue;

      // Campus filter
      if (!reqRow.target_all_campuses && targetCampusIds.size > 0) {
        if (!candidate.campus_id || !targetCampusIds.has(candidate.campus_id)) continue;
      }

      // Department filter
      if (!reqRow.target_all_departments && targetDeptIds.size > 0) {
        if (!candidate.department_id || !targetDeptIds.has(candidate.department_id)) continue;
      }

      // Semester range filter
      if (reqRow.min_semester !== null) {
        if (candidate.semester === null || candidate.semester < reqRow.min_semester) continue;
      }
      if (reqRow.max_semester !== null) {
        if (candidate.semester === null || candidate.semester > reqRow.max_semester) continue;
      }

      // Gender comfort filter (voluntary opt-in only)
      if (reqRow.preferred_gender !== 'any') {
        if (!candidate.gender_matching_opt_in || candidate.gender !== reqRow.preferred_gender) {
          continue;
        }
      }

      // Work mode compatibility
      if (
        reqRow.work_mode !== 'either' &&
        candidate.work_mode !== 'either' &&
        candidate.work_mode !== reqRow.work_mode
      ) {
        continue;
      }

      // Skill tag match (at least one matching skill if request specifies skills)
      if (reqSkillIds.size > 0) {
        const candidateSkills = userSkillsStmt.all(candidate.id) as Array<{ skill_id: string }>;
        const hasMatch = candidateSkills.some((s) => reqSkillIds.has(s.skill_id));
        if (!hasMatch) continue;
      }

      matchedUserIds.push(candidate.id);
      const info = insertAlertStmt.run(
        crypto.randomUUID(),
        candidate.id,
        requestId,
        sentAtIso,
        expiresAtIso,
      );
      if (info.changes > 0) {
        createdCount += 1;
      }
    }
  });

  tx();

  if (matchedUserIds.length > 0) {
    wsHub.sendToUsers(matchedUserIds, {
      type: 'alert:new',
      data: {
        requestId,
        title: reqRow.title,
        category: reqRow.category,
        expiresAt: expiresAtIso,
      },
    });
  }

  return { matchedUserIds, createdCount };
}
