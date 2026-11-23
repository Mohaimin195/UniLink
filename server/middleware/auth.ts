import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { hashToken } from '../services/domainPolicy.ts';

export interface AuthenticatedUser {
  id: string;
  normalizedEmail: string;
  role: 'student' | 'admin';
  accountStatus: 'pending_profile' | 'active' | 'suspended' | 'deleted';
  emailVerified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
      sessionTokenHash?: string;
    }
  }
}

export function parseCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eqIdx + 1).trim());
      } catch {
        return part.slice(eqIdx + 1).trim();
      }
    }
  }
  return null;
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token) return token;
  }
  return null;
}

export function extractSessionAuth(req: Request): { token: string; viaCookie: boolean } | null {
  const bearer = extractBearerToken(req);
  if (bearer) return { token: bearer, viaCookie: false };
  const cookieToken = parseCookie(req.headers.cookie, 'unilink_session');
  if (cookieToken) return { token: cookieToken, viaCookie: true };
  return null;
}

export function resolveSessionUser(db: Database.Database, rawToken: string): { user: AuthenticatedUser; tokenHash: string } | null {
  const tokenHash = hashToken(rawToken);
  const nowIso = new Date().toISOString();
  const row = db
    .prepare(
      `
      SELECT u.id, u.normalized_email, u.role, u.account_status, u.email_verified
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > ?
        AND u.account_status != 'deleted'
    `,
    )
    .get(tokenHash, nowIso) as
    | {
        id: string;
        normalized_email: string;
        role: 'student' | 'admin';
        account_status: 'pending_profile' | 'active' | 'suspended' | 'deleted';
        email_verified: number;
      }
    | undefined;

  if (!row) return null;

  return {
    tokenHash,
    user: {
      id: row.id,
      normalizedEmail: row.normalized_email,
      role: row.role,
      accountStatus: row.account_status,
      emailVerified: Boolean(row.email_verified),
    },
  };
}

function isSameOriginMutationAllowed(req: Request): boolean {
  if (req.headers['x-requested-with'] === 'UniLink') return true;
  const origin = req.headers.origin;
  const expectedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '');
  if (origin && expectedHost) {
    try {
      return new URL(origin).host === expectedHost;
    } catch {
      return false;
    }
  }
  return false;
}

export function requireAuth(db: Database.Database, options: { allowPendingProfile?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = extractSessionAuth(req);
    if (!auth) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());
    if (auth.viaCookie && isMutation && !isSameOriginMutationAllowed(req)) {
      return res.status(403).json({ error: 'Cross-site request validation failed.' });
    }

    const resolved = resolveSessionUser(db, auth.token);
    if (!resolved) {
      return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    }
    if (resolved.user.accountStatus === 'suspended') {
      return res.status(403).json({ error: 'Your account is currently suspended. Contact campus moderation.' });
    }
    if (!options.allowPendingProfile && resolved.user.accountStatus === 'pending_profile') {
      return res.status(403).json({ error: 'Please complete your student profile before continuing.' });
    }
    req.authUser = resolved.user;
    req.sessionTokenHash = resolved.tokenHash;

    // Update last_active_at silently
    db.prepare(`UPDATE users SET last_active_at = ? WHERE id = ?`).run(new Date().toISOString(), resolved.user.id);
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser || req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

// Simple in-memory rate limiter for abuse protection
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(
  bucketPrefix: string,
  maxHits: number,
  windowMs: number,
  keyFn?: (req: Request) => string,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const keyPart = keyFn ? keyFn(req) : req.authUser?.id || req.ip || 'anon';
    const key = `${bucketPrefix}:${keyPart}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);
    if (!existing || existing.resetAt <= now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (existing.count >= maxHits) {
      return res.status(429).json({ error: 'Too many actions in a short window. Please wait a moment and try again.' });
    }
    existing.count += 1;
    next();
  };
}
