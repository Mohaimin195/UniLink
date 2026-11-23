import type Database from 'better-sqlite3';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { createRateLimiter, requireAuth } from '../middleware/auth.ts';

const UPLOAD_DIR = path.resolve(process.cwd(), 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = ALLOWED_MIME_EXT[file.mimetype] || '.bin';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_EXT[file.mimetype]) {
      cb(new Error('Only JPG, PNG, WebP images and PDF documents up to 4 MB are allowed.'));
      return;
    }
    cb(null, true);
  },
});

export function createSafetyRouter(db: Database.Database) {
  const router = express.Router();

  router.get('/blocks', requireAuth(db), (req, res) => {
    const rows = db
      .prepare(
        `SELECT b.blocked_id, b.created_at, up.display_name, cam.name AS campus_name, dept.name AS department_name
         FROM blocks b
         JOIN user_profiles up ON up.user_id = b.blocked_id
         LEFT JOIN campuses cam ON cam.id = up.campus_id
         LEFT JOIN departments dept ON dept.id = up.department_id
         WHERE b.blocker_id = ?
         ORDER BY b.created_at DESC`,
      )
      .all(req.authUser!.id);
    res.json({ items: rows });
  });

  router.post('/blocks', requireAuth(db), (req, res) => {
    const schema = z.object({ blockedUserId: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Target user required.' });

    const userId = req.authUser!.id;
    if (userId === parsed.data.blockedUserId) {
      return res.status(400).json({ error: 'You cannot block yourself.' });
    }
    db.prepare(`INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)`).run(
      userId,
      parsed.data.blockedUserId,
      new Date().toISOString(),
    );
    res.status(201).json({ ok: true });
  });

  router.delete('/blocks/:blockedId', requireAuth(db), (req, res) => {
    db.prepare(`DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?`).run(
      req.authUser!.id,
      req.params.blockedId,
    );
    res.json({ ok: true });
  });

  router.post('/reports', requireAuth(db), createRateLimiter('report', 10, 60 * 60 * 1000), (req, res) => {
    const schema = z.object({
      targetType: z.enum(['user', 'request', 'offer', 'message', 'portfolio', 'review']),
      targetId: z.string().min(1),
      reason: z.string().trim().min(3).max(120),
      details: z.string().trim().max(1000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Valid report reason and target are required.' });

    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    ).run(
      id,
      req.authUser!.id,
      parsed.data.targetType,
      parsed.data.targetId,
      parsed.data.reason,
      parsed.data.details || null,
      new Date().toISOString(),
    );

    res.status(201).json({ id, ok: true });
  });

  router.post('/uploads', requireAuth(db, { allowPendingProfile: true }), (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Upload validation failed.' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file attached.' });
      }
      res.status(201).json({
        url: `/api/files/${req.file.filename}`,
        name: req.file.originalname,
        mime: req.file.mimetype,
        size: req.file.size,
      });
    });
  });

  // Path-confined file serving (requires valid basename and strict boundary check)
  router.get('/files/:filename', (req, res) => {
    const safeName = path.basename(req.params.filename);
    if (!/^[0-9a-f-]+\.(jpg|png|webp|pdf)$/i.test(safeName)) {
      return res.status(400).json({ error: 'Invalid file identifier.' });
    }
    const resolved = path.resolve(UPLOAD_DIR, safeName);
    if (!resolved.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'File not found.' });
    }
    res.sendFile(resolved);
  });

  return router;
}
