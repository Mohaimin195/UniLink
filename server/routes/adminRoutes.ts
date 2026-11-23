import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { detectSuspiciousPatterns } from '../services/statsService.ts';

export function createAdminRouter(db: Database.Database) {
  const router = express.Router();
  router.use(requireAuth(db), requireAdmin);

  function logAudit(adminId: string, action: string, targetType: string, targetId: string, reason: string) {
    db.prepare(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), adminId, action, targetType, targetId, reason, new Date().toISOString());
  }

  router.get('/overview', (_req, res) => {
    const totalUsers = (db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE account_status != 'deleted'`).get() as { cnt: number }).cnt;
    const activeRequests = (db.prepare(`SELECT COUNT(*) AS cnt FROM requests WHERE status = 'active'`).get() as { cnt: number }).cnt;
    const completedJobs = (db.prepare(`SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'completed'`).get() as { cnt: number }).cnt;
    const openReports = (db.prepare(`SELECT COUNT(*) AS cnt FROM reports WHERE status IN ('open', 'under_review')`).get() as { cnt: number }).cnt;
    const disputedJobs = (db.prepare(`SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'disputed'`).get() as { cnt: number }).cnt;
    const demoRecords = (db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE is_demo = 1 AND account_status != 'deleted'`).get() as { cnt: number }).cnt;
    const suspiciousFlags = detectSuspiciousPatterns(db);

    res.json({
      metrics: {
        totalUsers,
        activeRequests,
        completedJobs,
        openReports,
        disputedJobs,
        demoRecords,
      },
      suspiciousFlags,
    });
  });

  router.get('/users', (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || '').trim();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const offset = (page - 1) * limit;

    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    if (status) {
      where.push(`u.account_status = ?`);
      params.push(status);
    }
    if (q) {
      where.push(`(LOWER(u.normalized_email) LIKE ? OR LOWER(up.display_name) LIKE ?)`);
      params.push(`%${q}%`, `%${q}%`);
    }

    const total = (
      db
        .prepare(`SELECT COUNT(*) AS cnt FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE ${where.join(' AND ')}`)
        .get(...params) as { cnt: number }
    ).cnt;

    const items = db
      .prepare(
        `SELECT u.id, u.normalized_email, u.role, u.account_status, u.email_verified, u.is_demo, u.created_at, u.last_active_at,
                up.display_name, up.semester, cam.name AS campus_name, dept.name AS department_name
         FROM users u
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses cam ON cam.id = up.campus_id
         LEFT JOIN departments dept ON dept.id = up.department_id
         WHERE ${where.join(' AND ')}
         ORDER BY u.created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    res.json({ items, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  });

  router.post('/users/:id/status', (req, res) => {
    const schema = z.object({
      status: z.enum(['active', 'suspended']),
      reason: z.string().trim().min(5).max(300),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Status and documented reason (min 5 chars) are required.' });

    const targetId = req.params.id;
    if (targetId === req.authUser!.id) {
      return res.status(400).json({ error: 'Admins cannot suspend their own active session.' });
    }

    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`UPDATE users SET account_status = ? WHERE id = ? AND account_status != 'deleted'`).run(
        parsed.data.status,
        targetId,
      );
      if (parsed.data.status === 'suspended') {
        db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(nowIso, targetId);
      }
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
         VALUES (?, ?, 'security_notice', ?, ?, 0, ?)`,
      ).run(
        crypto.randomUUID(),
        targetId,
        parsed.data.status === 'suspended' ? 'Account suspended' : 'Account restored',
        `Moderation update: ${parsed.data.reason}`,
        nowIso,
      );
      logAudit(req.authUser!.id, `set_user_status:${parsed.data.status}`, 'user', targetId, parsed.data.reason);
    })();

    res.json({ ok: true });
  });

  router.get('/reports', (_req, res) => {
    const items = db
      .prepare(
        `SELECT r.*, up.display_name AS reporter_name
         FROM reports r
         JOIN user_profiles up ON up.user_id = r.reporter_id
         ORDER BY CASE WHEN r.status = 'open' THEN 0 WHEN r.status = 'under_review' THEN 1 ELSE 2 END, r.created_at DESC
         LIMIT 100`,
      )
      .all();
    res.json({ items });
  });

  router.post('/reports/:id/resolve', (req, res) => {
    const schema = z.object({
      status: z.enum(['under_review', 'resolved', 'dismissed']),
      resolution: z.string().trim().min(4).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Resolution note required.' });

    const report = db.prepare(`SELECT id, reporter_id FROM reports WHERE id = ?`).get(req.params.id) as
      | { id: string; reporter_id: string }
      | undefined;
    if (!report) return res.status(404).json({ error: 'Report not found.' });

    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        `UPDATE reports SET status = ?, admin_resolution = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`,
      ).run(parsed.data.status, parsed.data.resolution, req.authUser!.id, nowIso, report.id);
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
         VALUES (?, ?, 'report_update', 'Report reviewed', ?, 0, ?)`,
      ).run(crypto.randomUUID(), report.reporter_id, `Your report status was updated to ${parsed.data.status}: ${parsed.data.resolution}`, nowIso);
      logAudit(req.authUser!.id, `resolve_report:${parsed.data.status}`, 'report', report.id, parsed.data.resolution);
    })();

    res.json({ ok: true });
  });

  router.get('/jobs/disputes', (_req, res) => {
    const items = db
      .prepare(
        `SELECT j.*, r.title AS request_title, req_p.display_name AS requester_name, hel_p.display_name AS helper_name
         FROM jobs j
         JOIN requests r ON r.id = j.request_id
         JOIN user_profiles req_p ON req_p.user_id = j.requester_id
         JOIN user_profiles hel_p ON hel_p.user_id = j.helper_id
         WHERE j.status = 'disputed'
         ORDER BY j.accepted_at DESC`,
      )
      .all();
    res.json({ items });
  });

  router.post('/jobs/:id/resolve', (req, res) => {
    const schema = z.object({
      outcome: z.enum(['completed_without_auto_rating', 'cancelled']),
      note: z.string().trim().min(5).max(500),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Outcome and note are required.' });

    const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(req.params.id) as
      | { id: string; request_id: string; requester_id: string; helper_id: string }
      | undefined;
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const nowIso = new Date().toISOString();
    const nextJobStatus = parsed.data.outcome === 'completed_without_auto_rating' ? 'completed' : 'cancelled';
    const nextReqStatus = nextJobStatus === 'completed' ? 'completed' : 'cancelled';

    db.transaction(() => {
      db.prepare(
        `UPDATE jobs SET status = ?, resolution_note = ?, completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END,
         cancelled_at = CASE WHEN ? = 'cancelled' THEN ? ELSE cancelled_at END WHERE id = ?`,
      ).run(nextJobStatus, parsed.data.note, nextJobStatus, nowIso, nextJobStatus, nowIso, job.id);
      db.prepare(`UPDATE requests SET status = ?, closed_at = ? WHERE id = ?`).run(nextReqStatus, nowIso, job.request_id);
      for (const uid of [job.requester_id, job.helper_id]) {
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
           VALUES (?, ?, 'dispute_resolved', 'Dispute resolved by admin', ?, ?, 0, ?)`,
        ).run(crypto.randomUUID(), uid, `Outcome: ${nextJobStatus}. Note: ${parsed.data.note}`, `job:${job.id}`, nowIso);
      }
      logAudit(req.authUser!.id, `resolve_dispute:${nextJobStatus}`, 'job', job.id, parsed.data.note);
    })();

    res.json({ ok: true });
  });

  router.get('/requests', (_req, res) => {
    const items = db
      .prepare(
        `SELECT r.id, r.title, r.category, r.status, r.is_demo, r.created_at, r.expires_at, up.display_name AS owner_name
         FROM requests r
         JOIN user_profiles up ON up.user_id = r.owner_id
         ORDER BY r.created_at DESC
         LIMIT 80`,
      )
      .all();
    res.json({ items });
  });

  router.post('/requests/:id/remove', (req, res) => {
    const schema = z.object({ reason: z.string().trim().min(4).max(300) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Removal reason required.' });

    const reqRow = db.prepare(`SELECT id, owner_id, title FROM requests WHERE id = ?`).get(req.params.id) as
      | { id: string; owner_id: string; title: string }
      | undefined;
    if (!reqRow) return res.status(404).json({ error: 'Request not found.' });

    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`UPDATE requests SET status = 'cancelled', closed_at = ? WHERE id = ?`).run(nowIso, reqRow.id);
      db.prepare(`DELETE FROM request_alerts WHERE request_id = ?`).run(reqRow.id);
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
         VALUES (?, ?, 'moderation_notice', 'Request removed', ?, 0, ?)`,
      ).run(crypto.randomUUID(), reqRow.owner_id, `Your request "${reqRow.title}" was removed by moderation: ${parsed.data.reason}`, nowIso);
      logAudit(req.authUser!.id, 'remove_request', 'request', reqRow.id, parsed.data.reason);
    })();

    res.json({ ok: true });
  });

  router.post('/reviews/:id/moderate', (req, res) => {
    const schema = z.object({
      moderationStatus: z.enum(['valid', 'hidden']),
      reason: z.string().trim().min(4).max(300),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Moderation status and reason required.' });

    db.transaction(() => {
      db.prepare(`UPDATE reviews SET moderation_status = ?, moderation_reason = ? WHERE id = ?`).run(
        parsed.data.moderationStatus,
        parsed.data.reason,
        req.params.id,
      );
      logAudit(req.authUser!.id, `moderate_review:${parsed.data.moderationStatus}`, 'review', req.params.id, parsed.data.reason);
    })();

    res.json({ ok: true });
  });

  router.put('/domains', (req, res) => {
    const schema = z.object({
      domains: z.array(z.string().trim().min(4).max(100)).min(1),
      reason: z.string().trim().min(3).max(200).default('Updated approved university email domains'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'At least one valid domain is required.' });

    const cleaned = parsed.data.domains.map((d) => (d.startsWith('@') ? d.toLowerCase() : `@${d.toLowerCase()}`));
    db.transaction(() => {
      db.prepare(`UPDATE institutions SET approved_domains_json = ? WHERE id = 'inst-numl'`).run(JSON.stringify(cleaned));
      logAudit(req.authUser!.id, 'update_approved_domains', 'institution', 'inst-numl', `${parsed.data.reason}: ${cleaned.join(', ')}`);
    })();
    res.json({ ok: true, approvedDomains: cleaned });
  });

  router.post('/campuses', (req, res) => {
    const schema = z.object({ name: z.string().trim().min(2).max(80), city: z.string().trim().min(2).max(60) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Campus name and city required.' });
    const id = `campus-${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`INSERT INTO campuses (id, institution_id, name, city, is_active) VALUES (?, 'inst-numl', ?, ?, 1)`).run(
      id,
      parsed.data.name,
      parsed.data.city,
    );
    logAudit(req.authUser!.id, 'add_campus', 'campus', id, parsed.data.name);
    res.status(201).json({ id });
  });

  router.post('/departments', (req, res) => {
    const schema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(12) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Department name and code required.' });
    const id = `dept-${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(`INSERT INTO departments (id, institution_id, name, code, is_active) VALUES (?, 'inst-numl', ?, ?, 1)`).run(
      id,
      parsed.data.name,
      parsed.data.code.toUpperCase(),
    );
    logAudit(req.authUser!.id, 'add_department', 'department', id, parsed.data.name);
    res.status(201).json({ id });
  });

  router.post('/skills', (req, res) => {
    const schema = z.object({ name: z.string().trim().min(2).max(50), category: z.string().trim().min(2).max(60) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Skill name and category required.' });
    const id = `skill-${crypto.randomBytes(3).toString('hex')}`;
    db.prepare(
      `INSERT INTO skills (id, category, name, is_active, is_suggested, created_by, created_at) VALUES (?, ?, ?, 1, 0, ?, ?)`,
    ).run(id, parsed.data.category, parsed.data.name, req.authUser!.id, new Date().toISOString());
    logAudit(req.authUser!.id, 'add_skill', 'skill', id, `${parsed.data.category}: ${parsed.data.name}`);
    res.status(201).json({ id });
  });

  router.put('/settings', (req, res) => {
    const schema = z.object({
      requestExpiryHours: z.number().int().min(1).max(72),
      alertExpiryHours: z.number().int().min(1).max(48),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid expiry configuration.' });

    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = 'request_expiry_hours'`).run(
        String(parsed.data.requestExpiryHours),
        nowIso,
      );
      db.prepare(`UPDATE platform_settings SET value = ?, updated_at = ? WHERE key = 'alert_expiry_hours'`).run(
        String(parsed.data.alertExpiryHours),
        nowIso,
      );
      logAudit(
        req.authUser!.id,
        'update_expiry_settings',
        'platform_settings',
        'global',
        `Request=${parsed.data.requestExpiryHours}h, Alert=${parsed.data.alertExpiryHours}h`,
      );
    })();
    res.json({ ok: true });
  });

  router.post('/demo-data/clear', (req, res) => {
    db.transaction(() => {
      db.prepare(`DELETE FROM requests WHERE is_demo = 1`).run();
      db.prepare(`DELETE FROM users WHERE is_demo = 1 AND id != ?`).run(req.authUser!.id);
      logAudit(req.authUser!.id, 'clear_demo_data', 'platform', 'demo', 'Removed sample/demo records');
    })();
    res.json({ ok: true });
  });

  router.get('/audit-logs', (_req, res) => {
    const items = db
      .prepare(
        `SELECT l.*, up.display_name AS admin_name
         FROM admin_audit_logs l
         LEFT JOIN user_profiles up ON up.user_id = l.admin_id
         ORDER BY l.created_at DESC
         LIMIT 100`,
      )
      .all();
    res.json({ items });
  });

  return router;
}
