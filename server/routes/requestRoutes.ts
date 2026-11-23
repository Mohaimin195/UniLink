import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { createRateLimiter, requireAuth } from '../middleware/auth.ts';
import { dispatchRequestAlerts } from '../services/matchingService.ts';
import { getProfileStats } from '../services/statsService.ts';
import { wsHub } from '../wsHub.ts';

export function createRequestRouter(db: Database.Database) {
  const router = express.Router();

  function hydrateRequests(rows: Array<Record<string, unknown>>) {
    const skillsStmt = db.prepare(
      `SELECT s.id, s.name, s.category FROM request_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.request_id = ?`,
    );
    const campusesStmt = db.prepare(
      `SELECT c.id, c.name FROM request_target_campuses rtc JOIN campuses c ON c.id = rtc.campus_id WHERE rtc.request_id = ?`,
    );
    const deptsStmt = db.prepare(
      `SELECT d.id, d.name FROM request_target_departments rtd JOIN departments d ON d.id = rtd.department_id WHERE rtd.request_id = ?`,
    );
    const offerCountStmt = db.prepare(
      `SELECT COUNT(*) AS cnt FROM offers WHERE request_id = ? AND status IN ('pending', 'accepted')`,
    );

    return rows.map((r) => {
      const id = String(r.id);
      return {
        ...r,
        isDemo: Boolean(r.is_demo),
        targetAllCampuses: Boolean(r.target_all_campuses),
        targetAllDepartments: Boolean(r.target_all_departments),
        skills: skillsStmt.all(id),
        targetCampuses: campusesStmt.all(id),
        targetDepartments: deptsStmt.all(id),
        offerCount: (offerCountStmt.get(id) as { cnt: number }).cnt,
      };
    });
  }

  // Public Active Request Feed (paginated, excludes processing/expired/completed/cancelled)
  router.get('/requests', requireAuth(db), (req, res) => {
    const viewerId = req.authUser!.id;
    const nowIso = new Date().toISOString();
    const q = String(req.query.q || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();
    const skillId = String(req.query.skillId || '').trim();
    const campusId = String(req.query.campusId || '').trim();
    const departmentId = String(req.query.departmentId || '').trim();
    const workMode = String(req.query.workMode || '').trim();
    const budgetType = String(req.query.budgetType || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
    const offset = (page - 1) * limit;

    const viewerProfile = db.prepare(`SELECT campus_id FROM user_profiles WHERE user_id = ?`).get(viewerId) as
      | { campus_id: string | null }
      | undefined;

    const where: string[] = [
      `r.status = 'active'`,
      `r.expires_at > ?`,
      `u.account_status = 'active'`,
      `NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = r.owner_id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = r.owner_id))`,
      `(r.visibility = 'university' OR r.owner_id = ? OR up.campus_id = ?)`,
    ];
    const params: unknown[] = [nowIso, viewerId, viewerId, viewerId, viewerProfile?.campus_id || ''];

    if (category) {
      where.push(`r.category = ?`);
      params.push(category);
    }
    if (skillId) {
      where.push(`EXISTS (SELECT 1 FROM request_skills rs WHERE rs.request_id = r.id AND rs.skill_id = ?)`);
      params.push(skillId);
    }
    if (campusId) {
      where.push(
        `(r.target_all_campuses = 1 OR EXISTS (SELECT 1 FROM request_target_campuses rtc WHERE rtc.request_id = r.id AND rtc.campus_id = ?))`,
      );
      params.push(campusId);
    }
    if (departmentId) {
      where.push(
        `(r.target_all_departments = 1 OR EXISTS (SELECT 1 FROM request_target_departments rtd WHERE rtd.request_id = r.id AND rtd.department_id = ?))`,
      );
      params.push(departmentId);
    }
    if (workMode && workMode !== 'either') {
      where.push(`(r.work_mode = ? OR r.work_mode = 'either')`);
      params.push(workMode);
    }
    if (budgetType) {
      where.push(`r.budget_type = ?`);
      params.push(budgetType);
    }
    if (q) {
      where.push(
        `(LOWER(r.title) LIKE ? OR LOWER(r.description) LIKE ? OR EXISTS (SELECT 1 FROM request_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.request_id = r.id AND LOWER(s.name) LIKE ?))`,
      );
      const like = `%${q}%`;
      params.push(like, like, like);
    }

    const whereSql = where.join(' AND ');
    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM requests r JOIN users u ON u.id = r.owner_id JOIN user_profiles up ON up.user_id = u.id WHERE ${whereSql}`,
        )
        .get(...params) as { cnt: number }
    ).cnt;

    const rows = db
      .prepare(
        `SELECT
          r.*,
          up.display_name AS owner_name, up.avatar_url AS owner_avatar, up.semester AS owner_semester,
          c.name AS owner_campus, d.name AS owner_department
         FROM requests r
         JOIN users u ON u.id = r.owner_id
         JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE ${whereSql}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    res.json({
      items: hydrateRequests(rows),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  router.get('/requests/mine', requireAuth(db), (req, res) => {
    const rows = db
      .prepare(
        `SELECT r.*, up.display_name AS owner_name, up.avatar_url AS owner_avatar, up.semester AS owner_semester,
                c.name AS owner_campus, d.name AS owner_department
         FROM requests r
         JOIN user_profiles up ON up.user_id = r.owner_id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE r.owner_id = ?
         ORDER BY r.created_at DESC`,
      )
      .all(req.authUser!.id) as Array<Record<string, unknown>>;

    res.json({ items: hydrateRequests(rows) });
  });

  const createRequestSchema = z.object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(10).max(2000),
    category: z.string().trim().min(2).max(80),
    skillIds: z.array(z.string()).min(1).max(8),
    visibility: z.enum(['university', 'campus_only']).default('university'),
    targetAllCampuses: z.boolean().default(true),
    targetCampusIds: z.array(z.string()).default([]),
    targetAllDepartments: z.boolean().default(true),
    targetDepartmentIds: z.array(z.string()).default([]),
    minSemester: z.number().int().min(1).max(12).nullable().optional(),
    maxSemester: z.number().int().min(1).max(12).nullable().optional(),
    preferredGender: z.enum(['any', 'male', 'female']).default('any'),
    workMode: z.enum(['online', 'in_person', 'either']).default('either'),
    deadlineText: z.string().trim().max(120).nullable().optional(),
    budgetType: z.enum(['free', 'paid', 'negotiable']).default('negotiable'),
    budgetAmount: z.string().trim().max(60).nullable().optional(),
    preferredPaymentMethod: z.string().trim().max(60).nullable().optional(),
    additionalRequirements: z.string().trim().max(600).nullable().optional(),
  });

  router.post('/requests', requireAuth(db), createRateLimiter('create-req', 10, 60 * 60 * 1000), (req, res) => {
    const parsed = createRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request details.' });
    }
    const d = parsed.data;
    if (d.minSemester && d.maxSemester && d.minSemester > d.maxSemester) {
      return res.status(400).json({ error: 'Minimum semester cannot exceed maximum semester.' });
    }

    const settingRow = db
      .prepare(`SELECT value FROM platform_settings WHERE key = 'request_expiry_hours'`)
      .get() as { value: string } | undefined;
    const expiryHours = Math.max(1, Number(settingRow?.value || 24));

    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + expiryHours * 3600 * 1000).toISOString();
    const requestId = crypto.randomUUID();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO requests (
          id, owner_id, title, description, category, visibility,
          target_all_campuses, target_all_departments, min_semester, max_semester,
          preferred_gender, work_mode, deadline_text, budget_type, budget_amount,
          preferred_payment_method, additional_requirements, status, is_demo, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?)`,
      ).run(
        requestId,
        req.authUser!.id,
        d.title,
        d.description,
        d.category,
        d.visibility,
        d.targetAllCampuses ? 1 : 0,
        d.targetAllDepartments ? 1 : 0,
        d.minSemester ?? null,
        d.maxSemester ?? null,
        d.preferredGender,
        d.workMode,
        d.deadlineText || null,
        d.budgetType,
        d.budgetAmount || null,
        d.preferredPaymentMethod || null,
        d.additionalRequirements || null,
        nowIso,
        expiresAtIso,
      );

      const insSkill = db.prepare(`INSERT OR IGNORE INTO request_skills (request_id, skill_id) VALUES (?, ?)`);
      for (const sid of d.skillIds) insSkill.run(requestId, sid);

      if (!d.targetAllCampuses) {
        const insCampus = db.prepare(`INSERT OR IGNORE INTO request_target_campuses (request_id, campus_id) VALUES (?, ?)`);
        for (const cid of d.targetCampusIds) insCampus.run(requestId, cid);
      }

      if (!d.targetAllDepartments) {
        const insDept = db.prepare(`INSERT OR IGNORE INTO request_target_departments (request_id, department_id) VALUES (?, ?)`);
        for (const did of d.targetDepartmentIds) insDept.run(requestId, did);
      }
    })();

    const alertDispatch = dispatchRequestAlerts(db, requestId);

    res.status(201).json({
      id: requestId,
      expiresAt: expiresAtIso,
      alertsDispatched: alertDispatch.createdCount,
    });
  });

  // Detailed request + public offers list
  router.get('/requests/:id', requireAuth(db), (req, res) => {
    const viewerId = req.authUser!.id;
    const requestId = req.params.id;

    const row = db
      .prepare(
        `SELECT r.*, up.display_name AS owner_name, up.avatar_url AS owner_avatar, up.semester AS owner_semester,
                c.name AS owner_campus, d.name AS owner_department
         FROM requests r
         JOIN user_profiles up ON up.user_id = r.owner_id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE r.id = ?`,
      )
      .get(requestId) as Record<string, unknown> | undefined;

    if (!row) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const activeJob = db
      .prepare(`SELECT id, helper_id, requester_id, status FROM jobs WHERE request_id = ? ORDER BY accepted_at DESC LIMIT 1`)
      .get(requestId) as { id: string; helper_id: string; requester_id: string; status: string } | undefined;

    const isParticipant =
      row.owner_id === viewerId ||
      req.authUser!.role === 'admin' ||
      (activeJob && activeJob.helper_id === viewerId);

    if (row.status === 'processing' && !isParticipant) {
      return res.status(403).json({ error: 'This request is currently in processing with a selected helper.' });
    }

    const offerRows = db
      .prepare(
        `SELECT o.*, up.display_name AS helper_name, up.avatar_url AS helper_avatar, up.semester AS helper_semester,
                c.name AS helper_campus, d.name AS helper_department, u.is_demo AS helper_is_demo
         FROM offers o
         JOIN users u ON u.id = o.helper_id
         JOIN user_profiles up ON up.user_id = o.helper_id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE o.request_id = ? AND o.status != 'withdrawn'
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = o.helper_id AND b.blocked_id = ?) OR (b.blocker_id = ? AND b.blocked_id = o.helper_id))
         ORDER BY o.created_at ASC`,
      )
      .all(requestId, viewerId, viewerId) as Array<Record<string, unknown>>;

    const helperSkillsStmt = db.prepare(
      `SELECT s.id, s.name FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ?`,
    );

    const offers = offerRows.map((o) => {
      const hid = String(o.helper_id);
      const stats = getProfileStats(db, hid);
      return {
        ...o,
        helperIsDemo: Boolean(o.helper_is_demo),
        helperSkills: helperSkillsStmt.all(hid),
        helperStats: {
          averageRating: stats.averageRating,
          verifiedReviews: stats.verifiedReviews,
          completedJobs: stats.completedJobs,
        },
      };
    });

    res.json({
      request: hydrateRequests([row])[0],
      offers,
      activeJob: activeJob || null,
    });
  });

  router.post('/requests/:id/cancel', requireAuth(db), (req, res) => {
    const reqRow = db.prepare(`SELECT id, owner_id, status FROM requests WHERE id = ?`).get(req.params.id) as
      | { id: string; owner_id: string; status: string }
      | undefined;
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
    if (reqRow.owner_id !== req.authUser!.id) return res.status(403).json({ error: 'Only the request owner can cancel it.' });
    if (reqRow.status !== 'active') {
      return res.status(400).json({ error: 'Only active requests can be cancelled directly.' });
    }

    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE requests SET status = 'cancelled', closed_at = ? WHERE id = ?`).run(nowIso, reqRow.id);
    db.prepare(`UPDATE offers SET status = 'not_selected' WHERE request_id = ? AND status = 'pending'`).run(reqRow.id);
    res.json({ ok: true });
  });

  // Structured Public Offer Help
  const createOfferSchema = z.object({
    message: z.string().trim().min(10).max(600),
    estimatedDelivery: z.string().trim().max(80).optional(),
    availabilityNote: z.string().trim().max(160).optional(),
  });

  router.post('/requests/:id/offers', requireAuth(db), createRateLimiter('create-offer', 20, 60 * 60 * 1000), (req, res) => {
    const parsed = createOfferSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Offer message must be at least 10 characters.' });
    }

    const helperId = req.authUser!.id;
    const nowIso = new Date().toISOString();
    const reqRow = db
      .prepare(`SELECT id, owner_id, title, status, expires_at FROM requests WHERE id = ?`)
      .get(req.params.id) as { id: string; owner_id: string; title: string; status: string; expires_at: string } | undefined;

    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });
    if (reqRow.owner_id === helperId) return res.status(400).json({ error: 'You cannot submit an offer on your own request.' });
    if (reqRow.status !== 'active' || reqRow.expires_at <= nowIso) {
      return res.status(400).json({ error: 'This request is no longer accepting offers.' });
    }

    const blocked = db
      .prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
      .get(helperId, reqRow.owner_id, reqRow.owner_id, helperId);
    if (blocked) return res.status(403).json({ error: 'You cannot interact with this request.' });

    const existingOffer = db
      .prepare(`SELECT id FROM offers WHERE request_id = ? AND helper_id = ? AND status = 'pending'`)
      .get(reqRow.id, helperId);
    if (existingOffer) {
      return res.status(409).json({ error: 'You already have an active offer on this request.' });
    }

    const offerId = crypto.randomUUID();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO offers (id, request_id, helper_id, message, estimated_delivery, availability_note, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      ).run(
        offerId,
        reqRow.id,
        helperId,
        parsed.data.message,
        parsed.data.estimatedDelivery || null,
        parsed.data.availabilityNote || null,
        nowIso,
      );

      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'offer_received', 'New offer received', ?, ?, 0, ?)`,
      ).run(crypto.randomUUID(), reqRow.owner_id, `Someone offered to help on "${reqRow.title}".`, `request:${reqRow.id}`, nowIso);
    })();

    wsHub.sendToUser(reqRow.owner_id, {
      type: 'notification:new',
      data: { requestId: reqRow.id, offerId },
    });

    res.status(201).json({ id: offerId });
  });

  router.post('/offers/:id/withdraw', requireAuth(db), (req, res) => {
    const info = db
      .prepare(`UPDATE offers SET status = 'withdrawn' WHERE id = ? AND helper_id = ? AND status = 'pending'`)
      .run(req.params.id, req.authUser!.id);
    if (info.changes === 0) {
      return res.status(404).json({ error: 'Pending offer not found.' });
    }
    res.json({ ok: true });
  });

  // Accept Offer -> Create Job & Move Request to Processing (Owner Only)
  router.post('/offers/:id/accept', requireAuth(db), (req, res) => {
    const ownerId = req.authUser!.id;
    const nowIso = new Date().toISOString();

    const offer = db
      .prepare(
        `SELECT o.*, r.owner_id, r.title AS request_title, r.status AS request_status, r.expires_at
         FROM offers o
         JOIN requests r ON r.id = o.request_id
         WHERE o.id = ?`,
      )
      .get(req.params.id) as
      | {
          id: string;
          request_id: string;
          helper_id: string;
          status: string;
          owner_id: string;
          request_title: string;
          request_status: string;
          expires_at: string;
        }
      | undefined;

    if (!offer) return res.status(404).json({ error: 'Offer not found.' });
    if (offer.owner_id !== ownerId) return res.status(403).json({ error: 'Only the request owner can accept an offer.' });
    if (offer.request_status !== 'active' || offer.expires_at <= nowIso) {
      return res.status(400).json({ error: 'This request is no longer active.' });
    }
    if (offer.status !== 'pending') {
      return res.status(400).json({ error: 'This offer is no longer pending.' });
    }

    const requesterDeptRow = db
      .prepare(
        `SELECT d.name AS dept_name
         FROM user_profiles up LEFT JOIN departments d ON d.id = up.department_id
         WHERE up.user_id = ?`,
      )
      .get(ownerId) as { dept_name: string | null } | undefined;

    const jobId = crypto.randomUUID();
    let conversationId = '';

    db.transaction(() => {
      db.prepare(`UPDATE offers SET status = 'accepted' WHERE id = ?`).run(offer.id);
      db.prepare(`UPDATE offers SET status = 'not_selected' WHERE request_id = ? AND id != ? AND status = 'pending'`).run(
        offer.request_id,
        offer.id,
      );
      db.prepare(`UPDATE requests SET status = 'processing' WHERE id = ?`).run(offer.request_id);

      db.prepare(
        `INSERT INTO jobs (id, request_id, offer_id, requester_id, helper_id, requester_department_at_job, status, accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'processing', ?)`,
      ).run(jobId, offer.request_id, offer.id, ownerId, offer.helper_id, requesterDeptRow?.dept_name || null, nowIso);

      // Find or create job-linked 1-to-1 conversation
      const [uA, uB] = [ownerId, offer.helper_id].sort();
      const existingConvo = db
        .prepare(`SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ? AND (request_id = ? OR request_id IS NULL) LIMIT 1`)
        .get(uA, uB, offer.request_id) as { id: string } | undefined;

      if (existingConvo) {
        conversationId = existingConvo.id;
        db.prepare(`UPDATE conversations SET job_id = ?, request_id = ?, updated_at = ? WHERE id = ?`).run(
          jobId,
          offer.request_id,
          nowIso,
          conversationId,
        );
      } else {
        conversationId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO conversations (id, user_a_id, user_b_id, request_id, job_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(conversationId, uA, uB, offer.request_id, jobId, nowIso, nowIso);
      }

      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'offer_accepted', 'Your offer was accepted', ?, ?, 0, ?)`,
      ).run(crypto.randomUUID(), offer.helper_id, `You were selected for "${offer.request_title}". Start chatting in Messages.`, `job:${jobId}`, nowIso);
    })();

    wsHub.sendToUsers([offer.helper_id, ownerId], {
      type: 'job:updated',
      data: { jobId, requestId: offer.request_id, status: 'processing', conversationId },
    });

    res.status(201).json({ jobId, conversationId });
  });

  return router;
}
