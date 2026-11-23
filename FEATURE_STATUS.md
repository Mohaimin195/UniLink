# UniLink — Feature Status

## Implemented MVP Features

### 1. Institutional Authentication & Onboarding
- [x] Exact university domain allowlist validation (`@numl.edu.pk`, blocking `@gmail.com`, `@yahoo.com`, and subdomain spoofing)
- [x] 6-digit OTP generation, scrypt salted hashing, 10-minute expiry, max 5 verification attempts, and 60-second resend cooldown
- [x] Real SMTP dispatch via Nodemailer with clearly labeled **Preview OTP Fallback** when SMTP credentials are unconfigured
- [x] One active account per normalized email (`active_email_lock` unique index)
- [x] Mandatory onboarding profile completion before accessing marketplace features
- [x] In-memory Bearer session tokens + explicit Sign Out & OTP-gated Delete Account

### 2. Profiles, Skills, Portfolio & Discovery
- [x] NUML Islamabad Main + 8 regional campuses, 12 academic departments/programmes, and 6 categories / 45+ canonical skills
- [x] Custom skill suggestions (`POST /api/skills/suggest`) and Admin skill/campus/department management
- [x] Portfolio items separating **Verified Platform Work** (linked to completed jobs) from **Personal Portfolio** samples
- [x] Paginated **Find People & Services** directory with search, skill, category, campus, department, semester range, work mode, and voluntary gender-opt-in filters
- [x] Database-calculated profile statistics (`averageRating`, `verifiedReviews`, `completedJobs`, `uniqueClients`, `departmentsServed`, `repeatClients`, `onTimeRate` when ≥ 3 reviews, monthly charts, and `observedResponseMinutesEstimate`)

### 3. Requests, Matching Alerts, Offers & Jobs Lifecycle
- [x] 24-hour active requests with multi-campus/department/semester/gender targeting and work mode / budget fields
- [x] Smart helper matching engine dispatching deduplicated **12-hour Request Alerts** via SQLite + WebSockets
- [x] Background expiry worker automatically expiring 24-hour requests and pruning 12-hour alerts independently
- [x] Public structured **Offer Help** submissions & owner-only offer acceptance
- [x] Atomic transition to `processing` (hiding the request from the public feed) and 1-to-1 job conversation linking
- [x] Cancellation during `processing` returning the request to `active` with its original `expires_at` if time remains, or `expired` if elapsed
- [x] `delivered` workflow and mandatory 1–5 star rating required to close a `completed` job (`UNIQUE (job_id, reviewer_id)`)

### 4. Real-Time Messaging, Connections, Community & Safety
- [x] WebSocket (`/ws`) real-time chat, live online presence (respecting privacy toggles), unread counters, and conversation muting
- [x] Attachment uploads (JPG/PNG/WebP/PDF up to 4 MB) served through path-confined endpoints
- [x] Persistent non-expiring in-app notifications separated from 12-hour Request Alerts
- [x] Optional peer connections (`pending`/`accepted`/`declined`) and lightweight Campus Community Q&A
- [x] Bidirectional user blocking, structured moderation reporting, and job dispute escalation

### 5. Admin Dashboard & PWA / Dual Theme
- [x] Admin overview KPIs, suspicious-activity pattern detection, user suspend/restore, report & dispute resolution, review hiding, domain/catalog management, expiry settings, one-click demo data cleanup, and audit logs
- [x] Light & Dark theme toggle (`Campus Indigo & Emerald`) across all components
- [x] Installable PWA manifest, service worker, generated PNG/SVG icon set, and offline banner

---

## External Credentials Required for Production Launch

1. **SMTP Server (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)**: Required so verification and deletion OTP codes are delivered to real `@numl.edu.pk` inboxes instead of preview fallback mode.
2. **Institutional Domain Governance**: Confirm official NUML IT approval for `@numl.edu.pk` and configure official moderator addresses in `ADMIN_EMAILS`.

---

## Planned Phase 2 Enhancements

- Official university SSO / OAuth integration when NUML IT provides identity provider endpoints.
- Web Push API (VAPID) background browser notifications when the PWA tab is closed.
- Optional campus marketplace analytics export and semester rollover reminders.
