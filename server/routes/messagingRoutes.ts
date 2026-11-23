import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { createRateLimiter, requireAuth } from '../middleware/auth.ts';
import { wsHub } from '../wsHub.ts';

export function createMessagingRouter(db: Database.Database) {
  const router = express.Router();

  // List 1-to-1 Conversations
  router.get('/conversations', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT
          c.*,
          r.title AS request_title,
          j.status AS job_status,
          CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
          CASE WHEN c.user_a_id = ? THEN c.muted_by_a ELSE c.muted_by_b END AS is_muted
         FROM conversations c
         LEFT JOIN requests r ON r.id = c.request_id
         LEFT JOIN jobs j ON j.id = c.job_id
         WHERE (c.user_a_id = ? OR c.user_b_id = ?)
         ORDER BY c.updated_at DESC`,
      )
      .all(userId, userId, userId, userId) as Array<Record<string, unknown>>;

    const peerStmt = db.prepare(
      `SELECT u.id, u.show_online_status, u.show_last_seen, u.last_active_at, up.display_name, up.avatar_url,
              cam.name AS campus_name, dept.name AS department_name
       FROM users u
       JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN campuses cam ON cam.id = up.campus_id
       LEFT JOIN departments dept ON dept.id = up.department_id
       WHERE u.id = ?`,
    );
    const lastMsgStmt = db.prepare(
      `SELECT content, sender_id, sent_at, attachment_name FROM messages WHERE conversation_id = ? ORDER BY sent_at DESC LIMIT 1`,
    );
    const unreadStmt = db.prepare(
      `SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`,
    );
    const blockedStmt = db.prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`,
    );

    const items = rows.map((row) => {
      const peerId = String(row.peer_id);
      const peer = peerStmt.get(peerId) as Record<string, unknown> | undefined;
      const isBlocked = Boolean(blockedStmt.get(userId, peerId, peerId, userId));
      const lastMessage = lastMsgStmt.get(String(row.id)) || null;
      const unreadCount = (unreadStmt.get(String(row.id), userId) as { cnt: number }).cnt;
      return {
        id: row.id,
        requestId: row.request_id,
        requestTitle: row.request_title,
        jobId: row.job_id,
        jobStatus: row.job_status,
        isMuted: Boolean(row.is_muted),
        isBlocked,
        updatedAt: row.updated_at,
        unreadCount,
        lastMessage,
        peer: peer
          ? {
              id: peer.id,
              displayName: peer.display_name,
              avatarUrl: peer.avatar_url,
              campusName: peer.campus_name,
              departmentName: peer.department_name,
              isOnline: !isBlocked && peer.show_online_status ? wsHub.isUserOnline(peerId) : null,
              lastActiveAt: !isBlocked && peer.show_last_seen ? peer.last_active_at : null,
            }
          : null,
      };
    });

    res.json({ items });
  });

  router.post('/conversations/start', requireAuth(db), (req, res) => {
    const schema = z.object({
      targetUserId: z.string().min(1),
      requestId: z.string().nullable().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Target user is required.' });

    const userId = req.authUser!.id;
    const targetId = parsed.data.targetUserId;
    if (userId === targetId) return res.status(400).json({ error: 'Cannot message yourself.' });

    const blocked = db
      .prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
      .get(userId, targetId, targetId, userId);
    if (blocked) return res.status(403).json({ error: 'Messaging is unavailable due to block settings.' });

    const targetExists = db.prepare(`SELECT id FROM users WHERE id = ? AND account_status = 'active'`).get(targetId);
    if (!targetExists) return res.status(404).json({ error: 'Student account not found.' });

    const [uA, uB] = [userId, targetId].sort();
    const existing = parsed.data.requestId
      ? (db
          .prepare(`SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ? AND request_id = ?`)
          .get(uA, uB, parsed.data.requestId) as { id: string } | undefined)
      : (db
          .prepare(`SELECT id FROM conversations WHERE user_a_id = ? AND user_b_id = ? AND request_id IS NULL`)
          .get(uA, uB) as { id: string } | undefined);

    if (existing) {
      return res.json({ conversationId: existing.id });
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO conversations (id, user_a_id, user_b_id, request_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, uA, uB, parsed.data.requestId || null, nowIso, nowIso);

    res.status(201).json({ conversationId: id });
  });

  router.get('/conversations/:id/messages', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const convo = db
      .prepare(`SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)`)
      .get(req.params.id, userId, userId) as { id: string; user_a_id: string; user_b_id: string } | undefined;

    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL`,
    ).run(nowIso, convo.id, userId);

    const messages = db
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC LIMIT 200`)
      .all(convo.id);

    res.json({ items: messages });
  });

  router.post(
    '/conversations/:id/messages',
    requireAuth(db),
    createRateLimiter('send-msg', 60, 60 * 1000),
    (req, res) => {
      const schema = z.object({
        content: z.string().trim().max(2000).default(''),
        attachmentUrl: z.string().max(400).nullable().optional(),
        attachmentName: z.string().max(160).nullable().optional(),
        attachmentMime: z.string().max(100).nullable().optional(),
        attachmentSize: z.number().int().max(5_000_000).nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid message payload.' });
      if (!parsed.data.content && !parsed.data.attachmentUrl) {
        return res.status(400).json({ error: 'Message text or attachment is required.' });
      }

      const userId = req.authUser!.id;
      const convo = db
        .prepare(`SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)`)
        .get(req.params.id, userId, userId) as
        | { id: string; user_a_id: string; user_b_id: string; muted_by_a: number; muted_by_b: number }
        | undefined;
      if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

      const peerId = convo.user_a_id === userId ? convo.user_b_id : convo.user_a_id;
      const blocked = db
        .prepare(`SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)`)
        .get(userId, peerId, peerId, userId);
      if (blocked) return res.status(403).json({ error: 'Cannot send messages while blocked.' });

      const nowIso = new Date().toISOString();
      const msgId = crypto.randomUUID();
      const d = parsed.data;
      const peerMuted = convo.user_a_id === peerId ? Boolean(convo.muted_by_a) : Boolean(convo.muted_by_b);

      db.transaction(() => {
        db.prepare(
          `INSERT INTO messages (id, conversation_id, sender_id, content, attachment_url, attachment_name, attachment_mime, attachment_size, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          msgId,
          convo.id,
          userId,
          d.content,
          d.attachmentUrl || null,
          d.attachmentName || null,
          d.attachmentMime || null,
          d.attachmentSize || null,
          nowIso,
        );
        db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(nowIso, convo.id);

        if (!peerMuted) {
          db.prepare(
            `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
             VALUES (?, ?, 'new_message', 'New private message', 'You received a new in-app message.', ?, 0, ?)`,
          ).run(crypto.randomUUID(), peerId, `conversation:${convo.id}`, nowIso);
        }
      })();

      const createdMsg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(msgId);
      wsHub.sendToUsers([userId, peerId], {
        type: 'message:new',
        data: { conversationId: convo.id, message: createdMsg },
      });

      res.status(201).json({ message: createdMsg });
    },
  );

  router.post('/conversations/:id/mute', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const convo = db
      .prepare(`SELECT id, user_a_id, user_b_id, muted_by_a, muted_by_b FROM conversations WHERE id = ?`)
      .get(req.params.id) as { id: string; user_a_id: string; user_b_id: string; muted_by_a: number; muted_by_b: number } | undefined;
    if (!convo || (convo.user_a_id !== userId && convo.user_b_id !== userId)) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    if (convo.user_a_id === userId) {
      const next = convo.muted_by_a ? 0 : 1;
      db.prepare(`UPDATE conversations SET muted_by_a = ? WHERE id = ?`).run(next, convo.id);
      return res.json({ isMuted: Boolean(next) });
    } else {
      const next = convo.muted_by_b ? 0 : 1;
      db.prepare(`UPDATE conversations SET muted_by_b = ? WHERE id = ?`).run(next, convo.id);
      return res.json({ isMuted: Boolean(next) });
    }
  });

  // 12-hour Expiring Request Alerts Inbox (separate from persistent notifications!)
  router.get('/alerts', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const nowIso = new Date().toISOString();
    const rows = db
      .prepare(
        `SELECT
          ra.id, ra.request_id, ra.sent_at, ra.expires_at, ra.read_at,
          r.title, r.category, r.budget_type, r.budget_amount, r.work_mode, r.status AS request_status, r.expires_at AS request_expires_at,
          up.display_name AS owner_name, cam.name AS owner_campus, dept.name AS owner_department, up.semester AS owner_semester
         FROM request_alerts ra
         JOIN requests r ON r.id = ra.request_id
         JOIN user_profiles up ON up.user_id = r.owner_id
         LEFT JOIN campuses cam ON cam.id = up.campus_id
         LEFT JOIN departments dept ON dept.id = up.department_id
         WHERE ra.recipient_id = ? AND ra.expires_at > ? AND ra.dismissed_at IS NULL
         ORDER BY ra.sent_at DESC`,
      )
      .all(userId, nowIso) as Array<Record<string, unknown>>;

    const skillStmt = db.prepare(
      `SELECT s.id, s.name FROM request_skills rs JOIN skills s ON s.id = rs.skill_id WHERE rs.request_id = ?`,
    );

    const items = rows.map((row) => ({
      ...row,
      skills: skillStmt.all(String(row.request_id)),
    }));

    res.json({ items });
  });

  router.post('/alerts/:id/read', requireAuth(db), (req, res) => {
    db.prepare(`UPDATE request_alerts SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_id = ?`).run(
      new Date().toISOString(),
      req.params.id,
      req.authUser!.id,
    );
    res.json({ ok: true });
  });

  router.post('/alerts/:id/dismiss', requireAuth(db), (req, res) => {
    db.prepare(`UPDATE request_alerts SET dismissed_at = ? WHERE id = ? AND recipient_id = ?`).run(
      new Date().toISOString(),
      req.params.id,
      req.authUser!.id,
    );
    res.json({ ok: true });
  });

  // Persistent Non-Expiring Notifications (Job status, messages, connections, security)
  router.get('/notifications', requireAuth(db), (req, res) => {
    const rows = db
      .prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`)
      .all(req.authUser!.id);
    res.json({ items: rows });
  });

  router.post('/notifications/read-all', requireAuth(db), (req, res) => {
    db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser!.id);
    res.json({ ok: true });
  });

  // Connections (Optional Peer Networking)
  router.get('/connections', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    const rows = db
      .prepare(
        `SELECT
          cn.id, cn.requester_id, cn.target_id, cn.status, cn.created_at,
          CASE WHEN cn.requester_id = ? THEN cn.target_id ELSE cn.requester_id END AS peer_id,
          up.display_name, up.avatar_url, up.semester, cam.name AS campus_name, dept.name AS department_name
         FROM connections cn
         JOIN user_profiles up ON up.user_id = (CASE WHEN cn.requester_id = ? THEN cn.target_id ELSE cn.requester_id END)
         LEFT JOIN campuses cam ON cam.id = up.campus_id
         LEFT JOIN departments dept ON dept.id = up.department_id
         WHERE (cn.requester_id = ? OR cn.target_id = ?) AND cn.status != 'declined'
         ORDER BY cn.updated_at DESC`,
      )
      .all(userId, userId, userId, userId);

    res.json({ items: rows });
  });

  router.post('/connections/request', requireAuth(db), (req, res) => {
    const schema = z.object({ targetUserId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Target user required.' });

    const userId = req.authUser!.id;
    const targetId = parsed.data.targetUserId;
    if (userId === targetId) return res.status(400).json({ error: 'Cannot connect with yourself.' });

    const existing = db
      .prepare(
        `SELECT id, status FROM connections WHERE (requester_id = ? AND target_id = ?) OR (requester_id = ? AND target_id = ?)`,
      )
      .get(userId, targetId, targetId, userId) as { id: string; status: string } | undefined;

    if (existing && existing.status !== 'declined') {
      return res.status(409).json({ error: 'Connection request already exists.' });
    }

    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    if (existing) {
      db.prepare(`UPDATE connections SET requester_id = ?, target_id = ?, status = 'pending', updated_at = ? WHERE id = ?`).run(
        userId,
        targetId,
        nowIso,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO connections (id, requester_id, target_id, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
      ).run(id, userId, targetId, nowIso, nowIso);
    }

    db.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
       VALUES (?, ?, 'connection_request', 'New connection request', 'A NUML peer sent you a connection request.', 'connections', 0, ?)`,
    ).run(crypto.randomUUID(), targetId, nowIso);
    wsHub.sendToUser(targetId, { type: 'notification:new', data: { type: 'connection_request' } });

    res.status(201).json({ ok: true });
  });

  router.post('/connections/:id/respond', requireAuth(db), (req, res) => {
    const schema = z.object({ accept: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid decision.' });

    const userId = req.authUser!.id;
    const conn = db
      .prepare(`SELECT * FROM connections WHERE id = ? AND target_id = ? AND status = 'pending'`)
      .get(req.params.id, userId) as { id: string; requester_id: string } | undefined;
    if (!conn) return res.status(404).json({ error: 'Pending connection request not found.' });

    const nextStatus = parsed.data.accept ? 'accepted' : 'declined';
    const nowIso = new Date().toISOString();
    db.prepare(`UPDATE connections SET status = ?, updated_at = ? WHERE id = ?`).run(nextStatus, nowIso, conn.id);

    if (parsed.data.accept) {
      db.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, link_target, is_read, created_at)
         VALUES (?, ?, 'connection_accepted', 'Connection request accepted', 'Your peer connection request was accepted.', 'connections', 0, ?)`,
      ).run(crypto.randomUUID(), conn.requester_id, nowIso);
      wsHub.sendToUser(conn.requester_id, { type: 'notification:new', data: { type: 'connection_accepted' } });
    }

    res.json({ ok: true, status: nextStatus });
  });

  router.delete('/connections/:id', requireAuth(db), (req, res) => {
    const userId = req.authUser!.id;
    db.prepare(`DELETE FROM connections WHERE id = ? AND (requester_id = ? OR target_id = ?)`).run(
      req.params.id,
      userId,
      userId,
    );
    res.json({ ok: true });
  });

  // Lightweight University Community Q&A
  router.get('/community', requireAuth(db), (_req, res) => {
    const questions = db
      .prepare(
        `SELECT q.*, up.display_name AS author_name, cam.name AS author_campus, dept.name AS author_department
         FROM community_questions q
         JOIN user_profiles up ON up.user_id = q.author_id
         LEFT JOIN campuses cam ON cam.id = up.campus_id
         LEFT JOIN departments dept ON dept.id = up.department_id
         ORDER BY q.created_at DESC
         LIMIT 30`,
      )
      .all() as Array<Record<string, unknown>>;

    const replyStmt = db.prepare(
      `SELECT r.*, up.display_name AS author_name, dept.name AS author_department
       FROM community_replies r
       JOIN user_profiles up ON up.user_id = r.author_id
       LEFT JOIN departments dept ON dept.id = up.department_id
       WHERE r.question_id = ? ORDER BY r.created_at ASC`,
    );

    res.json({
      items: questions.map((q) => ({
        ...q,
        replies: replyStmt.all(String(q.id)),
      })),
    });
  });

  router.post('/community', requireAuth(db), createRateLimiter('community-post', 10, 60 * 60 * 1000), (req, res) => {
    const schema = z.object({
      title: z.string().trim().min(5).max(140),
      body: z.string().trim().min(10).max(1200),
      category: z.string().trim().min(2).max(60),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Please fill out title, category, and question details.' });
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO community_questions (id, author_id, title, body, category, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, req.authUser!.id, parsed.data.title, parsed.data.body, parsed.data.category, new Date().toISOString());
    res.status(201).json({ id });
  });

  router.post('/community/:id/replies', requireAuth(db), createRateLimiter('community-reply', 20, 60 * 60 * 1000), (req, res) => {
    const schema = z.object({ body: z.string().trim().min(3).max(800) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Reply cannot be empty.' });
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO community_replies (id, question_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, req.params.id, req.authUser!.id, parsed.data.body, new Date().toISOString());
    res.status(201).json({ id });
  });

  return router;
}
