import crypto from 'crypto';

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Extracts the exact domain after the final '@' symbol.
 * Rejects malformed addresses, spaces, or multiple '@' spoofing attempts.
 */
export function extractDomainAfterLastAt(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized || /\s/.test(normalized)) return null;
  const lastAt = normalized.lastIndexOf('@');
  if (lastAt <= 0 || lastAt === normalized.length - 1) return null;
  const localPart = normalized.slice(0, lastAt);
  const domainPart = normalized.slice(lastAt + 1);
  if (localPart.includes('@')) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domainPart)) return null;
  return domainPart;
}

/**
 * Enforces exact institutional domain matching (e.g. 'numl.edu.pk' or '@numl.edu.pk').
 * Never uses loose substring checks.
 */
export function isApprovedUniversityEmail(email: string, approvedDomains: string[]): boolean {
  const domain = extractDomainAfterLastAt(email);
  if (!domain) return false;
  const normalizedAllowlist = approvedDomains
    .map((d) => d.trim().toLowerCase().replace(/^@+/, ''))
    .filter(Boolean);
  return normalizedAllowlist.includes(domain);
}

export function generateOtpCode(): string {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, '0');
}

export function hashOtp(code: string, salt: string): string {
  return crypto.scryptSync(code, salt, 32).toString('hex');
}

export function verifyOtpHash(code: string, salt: string, expectedHex: string): boolean {
  const actual = Buffer.from(hashOtp(code, salt), 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function hashEmailForRetention(normalizedEmail: string): string {
  const secret = process.env.SESSION_SECRET || 'unilink-retention-salt-v1';
  return crypto.createHmac('sha256', secret).update(normalizedEmail).digest('hex');
}

/**
 * When a job in 'processing' is cancelled/declined, returns the request to 'active'
 * ONLY if original 24-hour expires_at is still in the future; otherwise marks 'expired'.
 */
export function computeNextRequestStatusAfterCancel(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): 'active' | 'expired' {
  const expiryMs = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiryMs) || expiryMs <= nowMs) {
    return 'expired';
  }
  return 'active';
}

export interface ReviewValidationInput {
  job: {
    id: string;
    requester_id: string;
    helper_id: string;
    status: string;
  } | null;
  reviewerId: string;
  rating: number;
  existingReviewCount: number;
}

export function validateReviewEligibility(input: ReviewValidationInput): { ok: true } | { ok: false; error: string } {
  if (!input.job) {
    return { ok: false, error: 'Valid job record is required to submit a review.' };
  }
  if (input.job.requester_id !== input.reviewerId) {
    return { ok: false, error: 'Only the requester on this job may submit the helper review.' };
  }
  if (input.job.helper_id === input.reviewerId) {
    return { ok: false, error: 'Users cannot review themselves.' };
  }
  if (input.job.status !== 'processing' && input.job.status !== 'delivered') {
    return { ok: false, error: 'Reviews can only be submitted when closing an active or delivered job.' };
  }
  if (input.existingReviewCount > 0) {
    return { ok: false, error: 'This job already has a verified review.' };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: 'A star rating between 1 and 5 is required to complete the job.' };
  }
  return { ok: true };
}
