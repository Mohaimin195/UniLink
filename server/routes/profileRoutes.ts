import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.ts';
import { getProfileStats } from '../services/statsService.ts';
import { wsHub } from '../wsHub.ts';

export function createProfileRouter(db: Database.Database) {
  const router = express.Router();

  const updateProfileSchema = z.object({
    displayName: z.string().trim().min(2).max(60),
    bio: z.string().trim().max(500).default(''),
    avatarUrl: z.string().max(300).nullable().optional(),
    campusId: z.string().min(1),
    departmentId: z.string().min(1),
    programmeId: z.string().nullable().optional(),
    semester: z.number().int().min(1).max(12),
    workMode: z.enum(['online', 'in_person', 'either']),
    preferredPaymentMethods: z.array(z.string().max(60)).max(6).default([]),
    gender: z.enum(['male', 'female']).nullable().optional(),
    genderMatchingOptIn: z.boolean().default(false),
    showGenderPublicly: z.boolean().default(false),
    showOnlineStatus: z.boolean().default(true),
    showLastSeen: z.boolean().default(true),
    profileVisibility: z.enum(['university', 'campus_only', 'connections_only']).default('university'),
    mutedAlertCategories: z.array(z.string().max(80)).default([]),
    skills: z
      .array(
        z.object({
          skillId: z.string(),
          proficiency: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
          offeringService: z.boolean().default(true),
        }),
      )
      .max(20)
      .default([]),
    availabilitySlots: z
      .array(
        z.object({
          dayOfWeek: z.number().int().min(0).max(6),
          startTime: z.string().regex(/^\d{2}:\d{2}$/),
          endTime: z.string().regex(/^\d{2}:\d{2}$/),
        }),
      )
      .max(21)
      .optional(),
  });

  router.put('/profile', requireAuth(db, { allowPendingProfile: true }), (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile fields.' });
    }
    const d = parsed.data;
    const userId = req.authUser!.id;
    const nowIso = new Date().toISOString();

    db.transaction(() => {
      db.prepare(
        `UPDATE user_profiles
         SET display_name = ?, bio = ?, avatar_url = COALESCE(?, avatar_url),
             campus_id = ?, department_id = ?, programme_id = ?, semester = ?,
             work_mode = ?, preferred_payment_methods_json = ?,
             gender = ?, gender_matching_opt_in = ?, show_gender_publicly = ?, updated_at = ?
         WHERE user_id = ?`,
      ).run(
        d.displayName,
        d.bio,
        d.avatarUrl === undefined ? null : d.avatarUrl,
        d.campusId,
        d.departmentId,
        d.programmeId || null,
        d.semester,
        d.workMode,
        JSON.stringify(d.preferredPaymentMethods),
        d.gender ?? null,
        d.genderMatchingOptIn ? 1 : 0,
        d.showGenderPublicly ? 1 : 0,
        nowIso,
        userId,
      );

      db.prepare(
        `UPDATE users
         SET account_status = CASE WHEN account_status = 'pending_profile' THEN 'active' ELSE account_status END,
             show_online_status = ?, show_last_seen = ?, profile_visibility = ?, muted_alert_categories_json = ?
         WHERE id = ?`,
      ).run(
        d.showOnlineStatus ? 1 : 0,
        d.showLastSeen ? 1 : 0,
        d.profileVisibility,
        JSON.stringify(d.mutedAlertCategories),
        userId,
      );

      db.prepare(`DELETE FROM user_skills WHERE user_id = ?`).run(userId);
      const insSkill = db.prepare(
        `INSERT OR IGNORE INTO user_skills (user_id, skill_id, proficiency, offering_service) VALUES (?, ?, ?, ?)`,
      );
      for (const s of d.skills) {
        insSkill.run(userId, s.skillId, s.proficiency, s.offeringService ? 1 : 0);
      }

      if (d.availabilitySlots) {
        db.prepare(`DELETE FROM availability_slots WHERE user_id = ?`).run(userId);
        const insSlot = db.prepare(
          `INSERT INTO availability_slots (id, user_id, day_of_week, start_time, end_time, timezone) VALUES (?, ?, ?, ?, ?, 'Asia/Karachi')`,
        );
        for (const slot of d.availabilitySlots) {
          insSlot.run(crypto.randomUUID(), userId, slot.dayOfWeek, slot.startTime, slot.endTime);
        }
      }
    })();

    res.json({ ok: true });
  });

  // Paginated Find People & Services Directory
  router.get('/users', requireAuth(db), (req, res) => {
    const viewerId = req.authUser!.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    const skillId = String(req.query.skillId || '').trim();
    const category = String(req.query.category || '').trim();
    const campusId = String(req.query.campusId || '').trim();
    const departmentId = String(req.query.departmentId || '').trim();
    const workMode = String(req.query.workMode || '').trim();
    const gender = String(req.query.gender || '').trim();
    const offeringOnly = req.query.offeringOnly === 'true';
    const minSem = req.query.minSemester ? Number(req.query.minSemester) : null;
    const maxSem = req.query.maxSemester ? Number(req.query.maxSemester) : null;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
    const offset = (page - 1) * limit;

    const viewerProfile = db.prepare(`SELECT campus_id FROM user_profiles WHERE user_id = ?`).get(viewerId) as
      | { campus_id: string | null }
      | undefined;

    const where: string[] = [
      `u.account_status = 'active'`,
      `u.email_verified = 1`,
      `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = u.id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = u.id))`,
      `(u.profile_visibility = 'university' OR u.id = ? OR (u.profile_visibility = 'campus_only' AND up.campus_id = ?) OR (u.profile_visibility = 'connections_only' AND EXISTS (SELECT 1 FROM connections cn WHERE cn.status = 'accepted' AND ((cn.requester_id = u.id AND cn.target_id = ?) OR (cn.target_id = u.id AND cn.requester_id = ?)))))`,
    ];
    const params: unknown[] = [viewerId, viewerId, viewerId, viewerProfile?.campus_id || '', viewerId, viewerId];

    if (campusId) {
      where.push(`up.campus_id = ?`);
      params.push(campusId);
    }
    if (departmentId) {
      where.push(`up.department_id = ?`);
      params.push(departmentId);
    }
    if (workMode && workMode !== 'either') {
      where.push(`(up.work_mode = ? OR up.work_mode = 'either')`);
      params.push(workMode);
    }
    if (minSem !== null && !Number.isNaN(minSem)) {
      where.push(`up.semester >= ?`);
      params.push(minSem);
    }
    if (maxSem !== null && !Number.isNaN(maxSem)) {
      where.push(`up.semester <= ?`);
      params.push(maxSem);
    }
    if (gender === 'male' || gender === 'female') {
      where.push(`up.gender_matching_opt_in = 1 AND up.gender = ?`);
      params.push(gender);
    }
    if (skillId) {
      where.push(
        `EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.skill_id = ? ${offeringOnly ? 'AND us.offering_service = 1' : ''})`,
      );
      params.push(skillId);
    } else if (category) {
      where.push(
        `EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id AND s.category = ? ${offeringOnly ? 'AND us.offering_service = 1' : ''})`,
      );
      params.push(category);
    } else if (offeringOnly) {
      where.push(`EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.id AND us.offering_service = 1)`);
    }

    if (q) {
      where.push(
        `(LOWER(up.display_name) LIKE ? OR LOWER(up.bio) LIKE ? OR EXISTS (SELECT 1 FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = u.id AND LOWER(s.name) LIKE ?))`,
      );
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = where.join(' AND ');
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM users u JOIN user_profiles up ON up.user_id = u.id WHERE ${whereSql}`)
      .get(...params) as { cnt: number };

    const rows = db
      .prepare(
        `SELECT
          u.id, u.is_demo, u.show_online_status, u.show_last_seen, u.last_active_at,
          up.display_name, up.avatar_url, up.bio, up.semester, up.work_mode,
          up.preferred_payment_methods_json, up.gender, up.show_gender_publicly,
          c.id AS campus_id, c.name AS campus_name,
          d.id AS department_id, d.name AS department_name,
          p.name AS programme_name
         FROM users u
         JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         LEFT JOIN programmes p ON p.id = up.programme_id
         WHERE ${whereSql}
         ORDER BY u.last_active_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    const skillStmt = db.prepare(
      `SELECT s.id, s.name, s.category, us.proficiency, us.offering_service
       FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ?`,
    );

    const items = rows.map((row) => {
      const uid = String(row.id);
      const stats = getProfileStats(db, uid);
      const showOnline = Boolean(row.show_online_status);
      const showLastSeen = Boolean(row.show_last_seen);
      return {
        id: uid,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        campusId: row.campus_id,
        campusName: row.campus_name,
        departmentId: row.department_id,
        departmentName: row.department_name,
        programmeName: row.programme_name,
        semester: row.semester,
        workMode: row.work_mode,
        preferredPaymentMethods: JSON.parse(String(row.preferred_payment_methods_json || '[]')),
        publicGender: row.show_gender_publicly ? row.gender : null,
        isDemo: Boolean(row.is_demo),
        isOnline: showOnline ? wsHub.isUserOnline(uid) : null,
        lastActiveAt: showLastSeen ? row.last_active_at : null,
        skills: skillStmt.all(uid),
        stats: {
          averageRating: stats.averageRating,
          verifiedReviews: stats.verifiedReviews,
          completedJobs: stats.completedJobs,
        },
      };
    });

    res.json({
      items,
      total: totalRow.cnt,
      page,
      totalPages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
    });
  });

  // Public Student Profile Detail
  router.get('/users/:id', requireAuth(db), (req, res) => {
    const viewerId = req.authUser!.id;
    const targetId = req.params.id;

    const blocked = db
      .prepare(
        `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
      )
      .get(viewerId, targetId, targetId, viewerId);
    if (blocked) {
      return res.status(404).json({ error: 'Profile unavailable.' });
    }

    const row = db
      .prepare(
        `SELECT
          u.id, u.account_status, u.is_demo, u.show_online_status, u.show_last_seen, u.last_active_at, u.created_at,
          up.display_name, up.avatar_url, up.bio, up.semester, up.work_mode,
          up.preferred_payment_methods_json, up.gender, up.show_gender_publicly,
          c.name AS campus_name, d.name AS department_name, p.name AS programme_name
         FROM users u
         JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         LEFT JOIN programmes p ON p.id = up.programme_id
         WHERE u.id = ? AND u.account_status = 'active'`,
      )
      .get(targetId) as Record<string, unknown> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Student profile not found.' });
    }

    const skills = db
      .prepare(
        `SELECT s.id, s.name, s.category, us.proficiency, us.offering_service
         FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ?`,
      )
      .all(targetId);

    const portfolio = db
      .prepare(
        `SELECT id, title, description, skill_tags_json, media_url, external_link, completion_date, credit_statement, work_origin, job_id, created_at
         FROM portfolio_items WHERE user_id = ? ORDER BY created_at DESC`,
      )
      .all(targetId);

    const availabilitySlots = db
      .prepare(`SELECT id, day_of_week, start_time, end_time, timezone FROM availability_slots WHERE user_id = ? ORDER BY day_of_week, start_time`)
      .all(targetId);

    const reviews = db
      .prepare(
        `SELECT r.id, r.rating, r.comment, r.quality_rating, r.communication_rating, r.reliability_rating, r.on_time_rating,
                r.created_at, up.display_name AS reviewer_name, d.name AS reviewer_department, req.title AS job_title
         FROM reviews r
         JOIN jobs j ON j.id = r.job_id
         JOIN requests req ON req.id = j.request_id
         JOIN user_profiles up ON up.user_id = r.reviewer_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE r.reviewee_id = ? AND r.moderation_status = 'valid'
         ORDER BY r.created_at DESC
         LIMIT 25`,
      )
      .all(targetId);

    const conn = db
      .prepare(
        `SELECT id, status, requester_id, target_id FROM connections
         WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)`,
      )
      .get(viewerId, targetId, targetId, viewerId);

    const stats = getProfileStats(db, targetId);
    const showOnline = Boolean(row.show_online_status);
    const showLastSeen = Boolean(row.show_last_seen);

    res.json({
      profile: {
        id: row.id,
        displayName: row.display_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        campusName: row.campus_name,
        departmentName: row.department_name,
        programmeName: row.programme_name,
        semester: row.semester,
        workMode: row.work_mode,
        preferredPaymentMethods: JSON.parse(String(row.preferred_payment_methods_json || '[]')),
        publicGender: row.show_gender_publicly ? row.gender : null,
        isDemo: Boolean(row.is_demo),
        isOnline: showOnline ? wsHub.isUserOnline(targetId) : null,
        lastActiveAt: showLastSeen ? row.last_active_at : null,
        memberSince: row.created_at,
      },
      skills,
      portfolio,
      availabilitySlots,
      reviews,
      connection: conn || null,
      stats,
    });
  });

  const portfolioSchema = z.object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(5).max(800),
    skillTags: z.array(z.string().max(50)).max(6).default([]),
    mediaUrl: z.string().max(400).nullable().optional(),
    externalLink: z
      .string()
      .trim()
      .max(400)
      .refine((v) => !v || /^https?:\/\//i.test(v), 'External link must start with http:// or https://')
      .nullable()
      .optional(),
    completionDate: z.string().max(30).nullable().optional(),
    creditStatement: z.string().max(200).nullable().optional(),
    jobId: z.string().nullable().optional(),
  });

  router.post('/portfolio', requireAuth(db), (req, res) => {
    const parsed = portfolioSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid portfolio item.' });
    }
    const d = parsed.data;
    const userId = req.authUser!.id;
    let workOrigin: 'verified_platform' | 'personal' = 'personal';
    let verifiedJobId: string | null = null;

    if (d.jobId) {
      const job = db
        .prepare(`SELECT id FROM jobs WHERE id = ? AND helper_id = ? AND status = 'completed'`)
        .get(d.jobId, userId) as { id: string } | undefined;
      if (!job) {
        return res.status(400).json({ error: 'Only completed jobs you delivered can be linked as verified platform work.' });
      }
      workOrigin = 'verified_platform';
      verifiedJobId = job.id;
    }

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO portfolio_items (
        id, user_id, title, description, skill_tags_json, media_url, external_link,
        completion_date, credit_statement, work_origin, job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      userId,
      d.title,
      d.description,
      JSON.stringify(d.skillTags),
      d.mediaUrl || null,
      d.externalLink || null,
      d.completionDate || null,
      d.creditStatement || null,
      workOrigin,
      verifiedJobId,
      new Date().toISOString(),
    );

    res.status(201).json({ id, workOrigin });
  });

  router.delete('/portfolio/:id', requireAuth(db), (req, res) => {
    const info = db
      .prepare(`DELETE FROM portfolio_items WHERE id = ? AND user_id = ?`)
      .run(req.params.id, req.authUser!.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Portfolio item not found.' });
    }
    res.json({ ok: true });
  });

  router.post('/skills/suggest', requireAuth(db), (req, res) => {
    const schema = z.object({
      name: z.string().trim().min(2).max(40),
      category: z.string().trim().min(2).max(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid skill name and category required.' });
    }
    const existing = db
      .prepare(`SELECT id, name, category FROM skills WHERE LOWER(name) = LOWER(?)`)
      .get(parsed.data.name);
    if (existing) {
      return res.json({ skill: existing, existed: true });
    }
    const id = `skill-${parsed.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
    db.prepare(
      `INSERT INTO skills (id, category, name, is_active, is_suggested, created_by, created_at)
       VALUES (?, ?, ?, 1, 1, ?, ?)`,
    ).run(id, parsed.data.category, parsed.data.name, req.authUser!.id, new Date().toISOString());
    res.status(201).json({ skill: { id, name: parsed.data.name, category: parsed.data.category }, existed: false });
  });

  return router;
}
