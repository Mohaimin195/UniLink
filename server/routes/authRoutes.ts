import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { createRateLimiter, requireAuth } from '../middleware/auth.ts';
import { sendOtpEmail, isSmtpConfigured } from '../services/emailService.ts';
import {
  generateOtpCode,
  hashEmailForRetention,
  hashOtp,
  hashToken,
  isApprovedUniversityEmail,
  normalizeEmail,
  verifyOtpHash,
} from '../services/domainPolicy.ts';
import { wsHub } from '../wsHub.ts';

export function createAuthRouter(db: Database.Database) {
  const router = express.Router();

  function getApprovedDomains(): string[] {
    const inst = db.prepare(`SELECT approved_domains_json FROM institutions WHERE id = 'inst-numl'`).get() as
      | { approved_domains_json: string }
      | undefined;
    if (!inst) return ['@numl.edu.pk'];
    try {
      return JSON.parse(inst.approved_domains_json);
    } catch {
      return ['@numl.edu.pk'];
    }
  }

  router.get('/meta', (_req, res) => {
    const approvedDomains = getApprovedDomains();
    const campuses = db.prepare(`SELECT id, name, city FROM campuses WHERE is_active = 1 ORDER BY name`).all();
    const departments = db.prepare(`SELECT id, name, code FROM departments WHERE is_active = 1 ORDER BY name`).all();
    const programmes = db.prepare(`SELECT id, department_id, name, max_semesters FROM programmes WHERE is_active = 1 ORDER BY name`).all();
    const skills = db.prepare(`SELECT id, category, name FROM skills WHERE is_active = 1 ORDER BY category, name`).all();
    const settingsRows = db.prepare(`SELECT key, value FROM platform_settings`).all() as Array<{ key: string; value: string }>;
    const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

    res.json({
      approvedDomains,
      smtpConfigured: isSmtpConfigured(),
      campuses,
      departments,
      programmes,
      skills,
      settings,
    });
  });

  router.get('/showcase', (_req, res) => {
    const nowIso = new Date().toISOString();
    const verifiedStudents = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE account_status = 'active' AND email_verified = 1`).get() as { cnt: number }
    ).cnt;
    const activeRequests = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM requests WHERE status = 'active' AND expires_at > ?`).get(nowIso) as { cnt: number }
    ).cnt;
    const completedJobs = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM jobs WHERE status = 'completed'`).get() as { cnt: number }
    ).cnt;
    const campusesCount = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM campuses WHERE is_active = 1`).get() as { cnt: number }
    ).cnt;
    const skillsCount = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM skills WHERE is_active = 1`).get() as { cnt: number }
    ).cnt;

    const reqRows = db
      .prepare(
        `SELECT r.id, r.title, r.category, r.work_mode, r.budget_type, r.budget_amount, r.expires_at, r.created_at,
                c.name AS campus_name, d.name AS department_name
         FROM requests r
         JOIN users u ON u.id = r.owner_id
         JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         WHERE r.status = 'active' AND r.expires_at > ? AND u.account_status = 'active'
         ORDER BY r.created_at DESC
         LIMIT 6`,
      )
      .all(nowIso) as Array<Record<string, unknown>>;

    const reqSkillsStmt = db.prepare(
      `SELECT s.name FROM request_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.request_id = ?`,
    );

    const featuredRequests = reqRows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      category: String(r.category),
      workMode: String(r.work_mode),
      budgetType: String(r.budget_type),
      budgetAmount: r.budget_amount ? String(r.budget_amount) : null,
      expiresAt: String(r.expires_at),
      campusName: r.campus_name ? String(r.campus_name) : 'NUML',
      departmentName: r.department_name ? String(r.department_name) : 'General',
      skills: (reqSkillsStmt.all(String(r.id)) as Array<{ name: string }>).map((s) => s.name),
    }));

    const portRows = db
      .prepare(
        `SELECT p.id, p.title, p.description, p.skill_tags_json, p.media_url, p.work_origin,
                up.display_name AS author_name, c.name AS campus_name
         FROM portfolio_items p
         JOIN users u ON u.id = p.user_id
         JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN campuses c ON c.id = up.campus_id
         WHERE u.account_status = 'active'
         ORDER BY CASE WHEN p.work_origin = 'verified_platform' THEN 0 ELSE 1 END, p.created_at DESC
         LIMIT 3`,
      )
      .all() as Array<Record<string, unknown>>;

    const featuredPortfolio = portRows.map((p) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(String(p.skill_tags_json || '[]'));
      } catch {
        tags = [];
      }
      return {
        id: String(p.id),
        title: String(p.title),
        description: String(p.description),
        mediaUrl: p.media_url ? String(p.media_url) : null,
        workOrigin: String(p.work_origin) as 'verified_platform' | 'personal',
        authorName: String(p.author_name),
        campusName: p.campus_name ? String(p.campus_name) : 'NUML',
        tags,
      };
    });

    res.json({
      metrics: {
        verifiedStudents,
        activeRequests,
        completedJobs,
        campusesCount,
        skillsCount,
      },
      featuredRequests,
      featuredPortfolio,
    });
  });

  function getSessionCookieOptions(req: express.Request): express.CookieOptions {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    return {
      httpOnly: true,
      sameSite: isHttps ? 'none' : 'lax',
      secure: isHttps,
      ...(isHttps ? { partitioned: true } : {}),
      path: '/',
      maxAge: 7 * 24 * 3600 * 1000,
    };
  }

  const requestOtpSchema = z.object({
    email: z.string().email().max(254),
  });

  const otpRateKey = (req: express.Request) =>
    `${req.ip || 'anon'}:${String((req.body as { email?: unknown })?.email || '').trim().toLowerCase()}`;

  router.post('/request-otp', createRateLimiter('otp-req', 8, 10 * 60 * 1000, otpRateKey), async (req, res) => {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please enter a valid university email address.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const approvedDomains = getApprovedDomains();
    if (!isApprovedUniversityEmail(email, approvedDomains)) {
      return res.status(403).json({
        error: `Registration is restricted to verified institutional emails (${approvedDomains.join(', ')}). Public domains like @gmail.com are not permitted.`,
      });
    }

    const now = new Date();
    const nowIso = now.toISOString();

    // Check 60s resend cooldown
    const recent = db
      .prepare(
        `SELECT resend_available_at FROM otp_challenges
         WHERE normalized_email = ? AND purpose = 'auth' AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email) as { resend_available_at: string } | undefined;

    if (recent && recent.resend_available_at > nowIso) {
      const waitSec = Math.ceil((new Date(recent.resend_available_at).getTime() - now.getTime()) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec}s before requesting a new code.` });
    }

    const code = generateOtpCode();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtp(code, salt);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    const resendAt = new Date(now.getTime() + 60 * 1000).toISOString();

    db.prepare(
      `INSERT INTO otp_challenges (id, normalized_email, purpose, code_hash, salt, attempts, max_attempts, expires_at, resend_available_at, ip_address, created_at)
       VALUES (?, ?, 'auth', ?, ?, 0, 5, ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), email, codeHash, salt, expiresAt, resendAt, req.ip || null, nowIso);

    try {
      const delivery = await sendOtpEmail(email, code, 'auth');
      return res.json({
        ok: true,
        message: 'Verification code dispatched to your university email.',
        deliveredVia: delivery.deliveredVia,
        previewOtp: delivery.previewOtp,
        expiresInSeconds: 600,
        resendCooldownSeconds: 60,
      });
    } catch (err) {
      console.error('OTP delivery error:', err);
      return res.status(500).json({ error: 'Unable to deliver verification email right now.' });
    }
  });

  const verifyOtpSchema = z.object({
    email: z.string().email().max(254),
    code: z.string().trim().regex(/^\d{6}$/, 'Verification code must be 6 digits.'),
  });

  router.post('/verify-otp', createRateLimiter('otp-verify', 15, 10 * 60 * 1000, otpRateKey), (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid code format.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const approvedDomains = getApprovedDomains();
    if (!isApprovedUniversityEmail(email, approvedDomains)) {
      return res.status(403).json({ error: 'Unapproved email domain.' });
    }

    const nowIso = new Date().toISOString();
    const challenge = db
      .prepare(
        `SELECT * FROM otp_challenges
         WHERE normalized_email = ? AND purpose = 'auth' AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email) as
      | {
          id: string;
          code_hash: string;
          salt: string;
          attempts: number;
          max_attempts: number;
          expires_at: string;
        }
      | undefined;

    if (!challenge) {
      return res.status(400).json({ error: 'No active verification code found. Please request a new code.' });
    }
    if (challenge.expires_at <= nowIso) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }
    if (challenge.attempts >= challenge.max_attempts) {
      return res.status(429).json({ error: 'Maximum verification attempts exceeded. Please request a new code.' });
    }

    const valid = verifyOtpHash(parsed.data.code, challenge.salt, challenge.code_hash);
    if (!valid) {
      db.prepare(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?`).run(challenge.id);
      const remaining = Math.max(0, challenge.max_attempts - (challenge.attempts + 1));
      return res.status(400).json({ error: `Incorrect verification code. ${remaining} attempt(s) remaining.` });
    }

    const adminEmails = (process.env.ADMIN_EMAILS || 'admin@numl.edu.pk')
      .split(',')
      .map((s) => normalizeEmail(s))
      .filter(Boolean);

    const result = db.transaction(() => {
      db.prepare(`UPDATE otp_challenges SET consumed_at = ? WHERE id = ?`).run(nowIso, challenge.id);

      let user = db
        .prepare(`SELECT id, normalized_email, role, account_status, email_verified, is_demo FROM users WHERE active_email_lock = ?`)
        .get(email) as
        | {
            id: string;
            normalized_email: string;
            role: 'student' | 'admin';
            account_status: 'pending_profile' | 'active' | 'suspended' | 'deleted';
            email_verified: number;
            is_demo: number;
          }
        | undefined;

      if (user && user.account_status === 'suspended') {
        throw new Error('ACCOUNT_SUSPENDED');
      }

      let isNewAccount = false;
      if (!user) {
        isNewAccount = true;
        const userId = crypto.randomUUID();
        const role: 'student' | 'admin' = adminEmails.includes(email) ? 'admin' : 'student';
        db.prepare(
          `INSERT INTO users (
            id, normalized_email, active_email_lock, email_verified, role, account_status,
            is_demo, show_online_status, show_last_seen, profile_visibility, last_active_at, created_at
          ) VALUES (?, ?, ?, 1, ?, 'pending_profile', 0, 1, 1, 'university', ?, ?)`,
        ).run(userId, email, email, role, nowIso, nowIso);

        const defaultName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        db.prepare(
          `INSERT INTO user_profiles (user_id, display_name, bio, institution_id, work_mode, updated_at)
           VALUES (?, ?, '', 'inst-numl', 'either', ?)`,
        ).run(userId, defaultName, nowIso);

        // If prior deleted account exists for this email hash, link & increment count
        const emailHash = hashEmailForRetention(email);
        const delRec = db.prepare(`SELECT id, re_registered_count FROM account_deletion_records WHERE email_hash = ?`).get(emailHash) as
          | { id: string; re_registered_count: number }
          | undefined;
        if (delRec) {
          const nextCount = delRec.re_registered_count + 1;
          db.prepare(
            `UPDATE account_deletion_records
             SET re_registered_count = ?, flagged_for_review = CASE WHEN ? >= 2 THEN 1 ELSE flagged_for_review END
             WHERE id = ?`,
          ).run(nextCount, nextCount, delRec.id);
        }

        user = {
          id: userId,
          normalized_email: email,
          role,
          account_status: 'pending_profile',
          email_verified: 1,
          is_demo: 0,
        };
      }

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);
      const sessionExpiry = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      db.prepare(
        `INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), tokenHash, user.id, sessionExpiry, nowIso);

      return { token: rawToken, user, isNewAccount };
    })();

    res.cookie('unilink_session', result.token, getSessionCookieOptions(req));

    return res.json({
      token: result.token,
      isNewAccount: result.isNewAccount,
      needsProfileCompletion: result.user.account_status === 'pending_profile',
      user: {
        id: result.user.id,
        email: result.user.normalized_email,
        role: result.user.role,
        accountStatus: result.user.account_status,
        isDemo: Boolean(result.user.is_demo),
      },
    });
  });

  router.get('/me', requireAuth(db, { allowPendingProfile: true }), (req, res) => {
    const userId = req.authUser!.id;
    const userRow = db
      .prepare(
        `SELECT id, normalized_email, role, account_status, is_demo, show_online_status, show_last_seen,
                profile_visibility, muted_alert_categories_json, last_active_at, created_at
         FROM users WHERE id = ?`,
      )
      .get(userId) as Record<string, unknown>;

    const profile = db
      .prepare(
        `SELECT up.*, c.name AS campus_name, d.name AS department_name, p.name AS programme_name
         FROM user_profiles up
         LEFT JOIN campuses c ON c.id = up.campus_id
         LEFT JOIN departments d ON d.id = up.department_id
         LEFT JOIN programmes p ON p.id = up.programme_id
         WHERE up.user_id = ?`,
      )
      .get(userId);

    const skills = db
      .prepare(
        `SELECT s.id, s.name, s.category, us.proficiency, us.offering_service
         FROM user_skills us
         JOIN skills s ON s.id = us.skill_id
         WHERE us.user_id = ?`,
      )
      .all(userId);

    const availabilitySlots = db
      .prepare(`SELECT id, day_of_week, start_time, end_time, timezone FROM availability_slots WHERE user_id = ? ORDER BY day_of_week, start_time`)
      .all(userId);

    const nowIso = new Date().toISOString();
    const unreadAlerts = (
      db
        .prepare(`SELECT COUNT(*) AS cnt FROM request_alerts WHERE recipient_id = ? AND expires_at > ? AND read_at IS NULL AND dismissed_at IS NULL`)
        .get(userId, nowIso) as { cnt: number }
    ).cnt;
    const unreadNotifications = (
      db.prepare(`SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0`).get(userId) as { cnt: number }
    ).cnt;
    const unreadMessages = (
      db
        .prepare(
          `SELECT COUNT(*) AS cnt
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE (c.user_a_id = ? OR c.user_b_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`,
        )
        .get(userId, userId, userId) as { cnt: number }
    ).cnt;

    res.json({
      user: userRow,
      profile,
      skills,
      availabilitySlots,
      unreadCounts: {
        alerts: unreadAlerts,
        notifications: unreadNotifications,
        messages: unreadMessages,
      },
    });
  });

  router.post('/logout', requireAuth(db, { allowPendingProfile: true }), (req, res) => {
    if (req.sessionTokenHash) {
      db.prepare(`UPDATE sessions SET revoked_at = ? WHERE token_hash = ?`).run(new Date().toISOString(), req.sessionTokenHash);
    }
    const { maxAge: _m, ...clearOpts } = getSessionCookieOptions(req);
    res.clearCookie('unilink_session', clearOpts);
    res.json({ ok: true });
  });

  router.post('/delete-account/request-otp', requireAuth(db, { allowPendingProfile: true }), async (req, res) => {
    const email = req.authUser!.normalizedEmail;
    const now = new Date();
    const nowIso = now.toISOString();

    const code = generateOtpCode();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtp(code, salt);

    db.prepare(
      `INSERT INTO otp_challenges (id, normalized_email, purpose, code_hash, salt, attempts, max_attempts, expires_at, resend_available_at, ip_address, created_at)
       VALUES (?, ?, 'delete_account', ?, ?, 0, 5, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      email,
      codeHash,
      salt,
      new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      new Date(now.getTime() + 60 * 1000).toISOString(),
      req.ip || null,
      nowIso,
    );

    const delivery = await sendOtpEmail(email, code, 'delete_account');
    res.json({
      ok: true,
      deliveredVia: delivery.deliveredVia,
      previewOtp: delivery.previewOtp,
    });
  });

  const confirmDeleteSchema = z.object({
    code: z.string().trim().regex(/^\d{6}$/),
    reason: z.string().max(400).optional(),
  });

  router.post('/delete-account/confirm', requireAuth(db, { allowPendingProfile: true }), (req, res) => {
    const parsed = confirmDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'A valid 6-digit verification code is required.' });
    }

    const userId = req.authUser!.id;
    const email = req.authUser!.normalizedEmail;
    const nowIso = new Date().toISOString();

    const challenge = db
      .prepare(
        `SELECT * FROM otp_challenges
         WHERE normalized_email = ? AND purpose = 'delete_account' AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(email) as { id: string; code_hash: string; salt: string; attempts: number; max_attempts: number; expires_at: string } | undefined;

    if (!challenge || challenge.expires_at <= nowIso || challenge.attempts >= challenge.max_attempts) {
      return res.status(400).json({ error: 'Account deletion code expired or unavailable. Please request a new code.' });
    }

    if (!verifyOtpHash(parsed.data.code, challenge.salt, challenge.code_hash)) {
      db.prepare(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?`).run(challenge.id);
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }

    const affectedNotifyIds: string[] = [];

    db.transaction(() => {
      db.prepare(`UPDATE otp_challenges SET consumed_at = ? WHERE id = ?`).run(nowIso, challenge.id);

      // Cancel active requests created by user
      const activeReqs = db.prepare(`SELECT id, title FROM requests WHERE owner_id = ? AND status = 'active'`).all(userId) as Array<{
        id: string;
        title: string;
      }>;
      db.prepare(`UPDATE requests SET status = 'cancelled', closed_at = ? WHERE owner_id = ? AND status = 'active'`).run(nowIso, userId);

      // Notify helpers who had pending offers on cancelled requests
      for (const ar of activeReqs) {
        const pendingOffers = db
          .prepare(`SELECT helper_id FROM offers WHERE request_id = ? AND status = 'pending'`)
          .all(ar.id) as Array<{ helper_id: string }>;
        for (const po of pendingOffers) {
          affectedNotifyIds.push(po.helper_id);
          db.prepare(
            `INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
             VALUES (?, ?, 'request_cancelled', 'Request closed', ?, 0, ?)`,
          ).run(crypto.randomUUID(), po.helper_id, `The request "${ar.title}" was closed because the requester deleted their account.`, nowIso);
        }
      }

      // Withdraw pending offers created by this user
      db.prepare(`UPDATE offers SET status = 'withdrawn' WHERE helper_id = ? AND status = 'pending'`).run(userId);

      // Close/cancel any open processing jobs involving this user and notify counterpart
      const openJobs = db
        .prepare(`SELECT id, request_id, requester_id, helper_id FROM jobs WHERE (requester_id = ? OR helper_id = ?) AND status IN ('processing', 'delivered')`)
        .all(userId, userId) as Array<{ id: string; request_id: string; requester_id: string; helper_id: string }>;
      for (const job of openJobs) {
        db.prepare(`UPDATE jobs SET status = 'cancelled', cancelled_at = ?, cancel_reason = 'Account deleted by participant' WHERE id = ?`).run(nowIso, job.id);
        db.prepare(`UPDATE requests SET status = 'cancelled', closed_at = ? WHERE id = ?`).run(nowIso, job.request_id);
        const otherId = job.requester_id === userId ? job.helper_id : job.requester_id;
        affectedNotifyIds.push(otherId);
        db.prepare(
          `INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at)
           VALUES (?, ?, 'job_cancelled', 'Active job cancelled', 'A participant deleted their account, so the active job was safely closed.', 0, ?)`,
        ).run(crypto.randomUUID(), otherId, nowIso);
      }

      // Anonymize public profile, hide from discovery, release active_email_lock for future re-registration
      db.prepare(
        `UPDATE user_profiles
         SET display_name = 'Deleted Member', avatar_url = NULL, bio = '', gender = NULL,
             gender_matching_opt_in = 0, show_gender_publicly = 0, preferred_payment_methods_json = '[]', updated_at = ?
         WHERE user_id = ?`,
      ).run(nowIso, userId);
      db.prepare(`DELETE FROM availability_slots WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM request_alerts WHERE recipient_id = ?`).run(userId);
      db.prepare(
        `UPDATE users
         SET account_status = 'deleted', active_email_lock = NULL, deleted_at = ?, show_online_status = 0, show_last_seen = 0
         WHERE id = ?`,
      ).run(nowIso, userId);

      // Revoke all sessions
      db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(nowIso, userId);

      // Minimal restricted deletion/retention record
      const emailHash = hashEmailForRetention(email);
      const existingDel = db.prepare(`SELECT id FROM account_deletion_records WHERE email_hash = ?`).get(emailHash) as { id: string } | undefined;
      if (existingDel) {
        db.prepare(`UPDATE account_deletion_records SET last_user_id = ?, deleted_at = ?, reason = ? WHERE id = ?`).run(
          userId,
          nowIso,
          parsed.data.reason || null,
          existingDel.id,
        );
      } else {
        db.prepare(
          `INSERT INTO account_deletion_records (id, email_hash, last_user_id, deleted_at, reason, re_registered_count, flagged_for_review)
           VALUES (?, ?, ?, ?, ?, 0, 0)`,
        ).run(crypto.randomUUID(), emailHash, userId, nowIso, parsed.data.reason || null);
      }
    })();

    if (affectedNotifyIds.length > 0) {
      wsHub.sendToUsers(affectedNotifyIds, { type: 'notification:new', data: { reason: 'account_deleted' } });
    }

    const { maxAge: _m, ...clearOpts } = getSessionCookieOptions(req);
    res.clearCookie('unilink_session', clearOpts);

    res.json({ ok: true, message: 'Your account has been deleted, public profile hidden, and all sessions revoked.' });
  });

  return router;
}
