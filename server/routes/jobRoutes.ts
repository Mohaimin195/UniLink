import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.ts';
import { computeNextRequestStatusAfterCancel, validateReviewEligibility } from '../services/domainPolicy.ts';
import { wsHub } from '../wsHub.ts';

export function createJobRouter(db: Database.Database) {
  const router = express.Router();

  router.get('/jobs', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT
          j.*,
          r.title AS request_title, r.description AS request_description, r.category AS request_category,
          r.budget_type, r.budget_amount, r.work_mode, r.expires_at AS request_expires_at,
          req_p.display_name AS requester_name, req_p.avatar_url AS requester_avatar,
          hel_p.display_name AS helper_name, hel_p.avatar_url AS helper_avatar,
          rev.id AS review_id, rev.rating AS review_rating, rev.comment AS review_comment,
          c.id AS conversation_id
         FROM jobs j
         JOIN requests r ON r.id = j.request_id
         JOIN user_profiles req_p ON req_p.user_id = j.requester_id
         JOIN user_profiles hel_p ON hel_p.user_id = j.helper_id
         LEFT JOIN reviews rev ON rev.job_id = j.id AND rev.reviewer_id = j.requester_id
         LEFT JOIN conversations c ON c.job_id = j.id
         WHERE j.requester_id = ? OR j.helper_id = ?
         ORDER BY j.accepted_at DESC`,
      )
      .all(userId, userId);

    res.json({ items: rows });
  });

  // Helper marks work Delivered / Ready for Review
  router.post('/jobs/:id/deliver', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const job = db
      .prepare(
        `SELECT j.*, r.title AS request_title
         FROM jobs j JOIN requests r ON r.id = j.request_id
         WHERE j.id = ?`,
      )
      .get(req.params.id) as { id: string; helper_id: string; requester_id: string; status: string; request_title: string } | undefined;

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.helper_id !== userId) return res.status(403).json({ error: 'Only the selected helper can mark work delivered.' });
    if (job.status !== 'processing') return res.status(400).json({ error: 'Only processing jobs can be marked delivered.' });

    const nowIso = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`UPDATE jobs SET status = 'delivered', delivered_at = ? WHERE id = ?`).run(nowIso, job.id);
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'job_delivered', 'Work marked delivered', ?, ?, 0, ?)`,
      ).run(
        crypto.randomUUID(),
        job.requester_id,
        `Your helper marked "${job.request_title}" as delivered. Review and submit a rating to complete the job.`,
        `job:${job.id}`,
        nowIso,
      );
    })();

    wsHub.sendToUsers([job.requester_id, job.helper_id], {
      type: 'job:updated',
      data: { jobId: job.id, status: 'delivered' },
    });

    res.json({ ok: true, status: 'delivered' });
  });

  // Cancel during Processing -> return request to Active with original expires_at if time remains, else Expired
  router.post('/jobs/:id/cancel-processing', requireAuth(db), (req, res) => {
    const schema = z.object({ reason: z.string().trim().min(3).max(300).optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid cancellation reason.' });

    const userId = req.authUser!.id;
    const job = db
      .prepare(
        `SELECT j.*, r.expires_at, r.title AS request_title
         FROM jobs j JOIN requests r ON r.id = j.request_id
         WHERE j.id = ?`,
      )
      .get(req.params.id) as
      | {
          id: string;
          request_id: string;
          offer_id: string;
          requester_id: string;
          helper_id: string;
          status: string;
          expires_at: string;
          request_title: string;
        }
      | undefined;

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.requester_id !== userId && job.helper_id !== userId) {
      return res.status(403).json({ error: 'Only job participants can cancel during processing.' });
    }
    if (job.status !== 'processing') {
      return res.status(400).json({ error: 'Only jobs in processing (before delivery) can be cancelled directly.' });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const nextRequestStatus = computeNextRequestStatusAfterCancel(job.expires_at, nowMs);
    const otherPartyId = job.requester_id === userId ? job.helper_id : job.requester_id;
    const notifyIds = [otherPartyId];

    db.transaction(() => {
      db.prepare(`UPDATE jobs SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`).run(
        nowIso,
        parsed.data.reason || 'Cancelled during processing',
        job.id,
      );
      db.prepare(`UPDATE offers SET status = 'withdrawn' WHERE id = ?`).run(job.offer_id);

      if (nextRequestStatus === 'active') {
        db.prepare(`UPDATE requests SET status = 'active' WHERE id = ?`).run(job.request_id);
        // Re-open previously not-selected offers if any and notify those helpers
        const priorOffers = db
          .prepare(`SELECT id, helper_id FROM offers WHERE request_id = ? AND id != ? AND status = 'not_selected'`)
          .all(job.request_id, job.offer_id) as Array<{ id: string; helper_id: string }>;
        for (const po of priorOffers) {
          db.prepare(`UPDATE offers SET status = 'pending' WHERE id = ?`).run(po.id);
          notifyIds.push(po.helper_id);
          db.prepare(
            `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
             VALUES (?, ?, 'request_reactivated', 'Request active again', ?, ?, 0, ?)`,
          ).run(
            crypto.randomUUID(),
            po.helper_id,
            `"${job.request_title}" returned to the active feed with its remaining time.`,
            `request:${job.request_id}`,
            nowIso,
          );
        }
      } else {
        db.prepare(`UPDATE requests SET status = 'expired', closed_at = ? WHERE id = ?`).run(nowIso, job.request_id);
      }

      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'job_cancelled', 'Processing job cancelled', ?, ?, 0, ?)`,
      ).run(
        crypto.randomUUID(),
        otherPartyId,
        `The job for "${job.request_title}" was cancelled. Request status is now ${nextRequestStatus}.`,
        `request:${job.request_id}`,
        nowIso,
      );
    })();

    wsHub.sendToUsers(notifyIds, {
      type: 'job:updated',
      data: { jobId: job.id, requestId: job.request_id, status: 'cancelled', nextRequestStatus },
    });

    res.json({ ok: true, nextRequestStatus });
  });

  // Complete Job with Mandatory Star Rating (1 completed job = 1 verified review)
  const completeSchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(800).optional(),
    qualityRating: z.number().int().min(1).max(5).nullable().optional(),
    communicationRating: z.number().int().min(1).max(5).nullable().optional(),
    reliabilityRating: z.number().int().min(1).max(5).nullable().optional(),
    onTimeRating: z.number().int().min(1).max(5).nullable().optional(),
  });

  router.post('/jobs/:id/complete', requireAuth(db), (req, res) => {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'A valid 1 to 5 star rating is required to complete the job.' });
    }

    const reviewerId = req.authUser!.id;
    const job = db
      .prepare(
        `SELECT j.*, r.title AS request_title
         FROM jobs j JOIN requests r ON r.id = j.request_id
         WHERE j.id = ?`,
      )
      .get(req.params.id) as
      | {
          id: string;
          request_id: string;
          requester_id: string;
          helper_id: string;
          status: string;
          request_title: string;
        }
      | undefined;

    const existingReviewCount = job
      ? (
          db
            .prepare(`SELECT COUNT(*) AS cnt FROM reviews WHERE job_id = ? AND reviewer_id = ?`)
            .get(job.id, reviewerId) as { cnt: number }
        ).cnt
      : 0;

    const check = validateReviewEligibility({
      job: job || null,
      reviewerId,
      rating: parsed.data.rating,
      existingReviewCount,
    });
    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const nowIso = new Date().toISOString();
    const reviewId = crypto.randomUUID();
    const d = parsed.data;

    db.transaction(() => {
      db.prepare(
        `INSERT INTO reviews (
          id, job_id, reviewer_id, reviewee_id, rating, comment,
          quality_rating, communication_rating, reliability_rating, on_time_rating,
          moderation_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
      ).run(
        reviewId,
        job!.id,
        reviewerId,
        job!.helper_id,
        d.rating,
        d.comment || null,
        d.qualityRating ?? null,
        d.communicationRating ?? null,
        d.reliabilityRating ?? null,
        d.onTimeRating ?? null,
        nowIso,
      );

      db.prepare(`UPDATE jobs SET status = 'completed', completed_at = ?, delivered_at = COALESCE(delivered_at, ?) WHERE id = ?`).run(
        nowIso,
        nowIso,
        job!.id,
      );
      db.prepare(`UPDATE requests SET status = 'completed', closed_at = ? WHERE id = ?`).run(nowIso, job!.request_id);

      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'review_received', 'Job completed & review received', ?, ?, 0, ?)`,
      ).run(
        crypto.randomUUID(),
        job!.helper_id,
        `You received a ${d.rating}-star verified review for "${job!.request_title}".`,
        `profile:${job!.helper_id}`,
        nowIso,
      );
    })();

    wsHub.sendToUsers([job!.helper_id, reviewerId], {
      type: 'job:updated',
      data: { jobId: job!.id, status: 'completed', reviewId },
    });

    res.status(201).json({ ok: true, reviewId });
  });

  // Raise Dispute on Delivered or Processing Job
  router.post('/jobs/:id/dispute', requireAuth(db), (req, res) => {
    const schema = z.object({ reason: z.string().trim().min(10).max(800) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please explain the issue (at least 10 characters).' });

    const userId = req.authUser!.id;
    const job = db
      .prepare(`SELECT * FROM jobs WHERE id = ?`)
      .get(req.params.id) as { id: string; request_id: string; requester_id: string; helper_id: string; status: string } | undefined;

    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.requester_id !== userId && job.helper_id !== userId) {
      return res.status(403).json({ error: 'Only job participants can dispute this job.' });
    }
    if (!['processing', 'delivered'].includes(job.status)) {
      return res.status(400).json({ error: 'Only active or delivered jobs can be disputed.' });
    }

    const nowIso = new Date().toISOString();
    const otherId = job.requester_id === userId ? job.helper_id : job.requester_id;

    db.transaction(() => {
      db.prepare(`UPDATE jobs SET status = 'disputed', dispute_reason = ? WHERE id = ?`).run(parsed.data.reason, job.id);
      db.prepare(
        `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
         VALUES (?, ?, 'request', ?, 'Job Dispute', ?, 'open', ?)`,
      ).run(crypto.randomUUID(), userId, job.request_id, `Job ID: ${job.id} — ${parsed.data.reason}`, nowIso);
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'job_disputed', 'Job dispute opened', 'A dispute was opened for an active job and routed to campus moderation.', ?, 0, ?)`,
      ).run(crypto.randomUUID(), otherId, `job:${job.id}`, nowIso);
    })();

    wsHub.sendToUsers([otherId, userId], {
      type: 'job:updated',
      data: { jobId: job.id, status: 'disputed' },
    });

    res.json({ ok: true, status: 'disputed' });
  });

  return router;
}
