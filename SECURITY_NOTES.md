# UniLink — Security & Privacy Notes

## Enforced Safeguards

### 1. Institutional Email & OTP Security
- **Exact Domain Matching**: Email addresses are normalized (`trim().toLowerCase()`) and parsed after the final `@` symbol. Only exact matches in the institution's `approved_domains_json` list (default `@numl.edu.pk`) are permitted; public domains and subdomain spoofing (e.g., `user@numl.edu.pk.fake.com`) are rejected with HTTP `403`.
- **OTP Hardening**: 6-digit OTPs are generated using `crypto.randomInt`, hashed with a per-challenge 16-byte random salt via `crypto.scryptSync`, and compared with `crypto.timingSafeEqual`. Codes expire after 10 minutes, enforce a 60-second resend cooldown, and lock after 5 failed attempts.
- **Session Storage**: Session tokens are generated as 256-bit random tokens, stored hashed (`SHA-256`) in SQLite, sent over `Authorization: Bearer` headers from in-memory React state (not `localStorage`), and immediately revoked on logout, suspension, or account deletion.

### 2. Database & Authorization Integrity
- **Parameterized Queries**: Every SQLite query uses prepared statements with bound parameters (`?`). No raw SQL string concatenation of user input is used.
- **Strict Ownership & Role Checks**: Only request owners can accept offers or cancel active requests; only job participants can message/deliver/cancel/dispute a job; only the job's requester can submit the single verified review; all `/api/admin/*` endpoints require `role === 'admin'`.
- **Single-Account & Rating Constraints**: `users.active_email_lock` enforces one active account per email, and `reviews` enforces `UNIQUE (job_id, reviewer_id)` plus `CHECK (reviewer_id != reviewee_id)`.

### 3. Privacy, Blocks, Uploads & Account Deletion
- **Voluntary Gender Comfort Filter**: Gender-based matching applies strictly when a member explicitly toggles `gender_matching_opt_in`; public display defaults to hidden unless opted in.
- **Bidirectional Blocking**: Blocked pairs are excluded from directory search, profile views, request feeds, matching alerts, offers, and private messaging.
- **Safe File Handling**: Uploads are limited to 4 MB and restricted to JPG, PNG, WebP, and PDF MIME types. Stored filenames are server-generated UUIDs and served via basename regex validation and strict path-boundary checking.
- **OTP-Gated Account Deletion**: Account deletion requires a fresh 6-digit OTP, cancels open requests/jobs, notifies affected counterparts, hides public profile details, revokes all sessions, and releases `active_email_lock` so the student can re-register later with a clean zero-job/zero-review public history while keeping an HMAC-hashed retention log for anti-abuse detection.

---

## Known Limitations

- **Single-Node SQLite & In-Memory Rate Limiter**: SQLite WAL mode and in-memory IP rate limiters are designed for single-instance deployment; horizontal multi-server scaling would require migrating to a shared database and Redis-backed rate limiting.
- **Unconfigured SMTP Fallback**: When `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are absent in development, the OTP endpoint returns `previewOtp` for testing convenience. In production, real SMTP credentials must be configured so `previewOtp` is never returned.
- **Admin Email Ownership**: Ensure `ADMIN_EMAILS` is configured with verified NUML administrator accounts in production.
