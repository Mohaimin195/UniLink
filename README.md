# UniLink — NUML Peer Skill & Help Network

**UniLink** is a responsive, installable Progressive Web App (PWA) built for the **National University of Modern Languages (NUML)** to connect verified `@numl.edu.pk` students who need help with peers who have useful skills across campuses and departments.

Core loop: `ASK -> MATCH -> OFFER -> CHAT -> WORK -> REVIEW -> BUILD REPUTATION -> CONNECT`

---

## Key Capabilities

- **Institutional Email-Only Access (`@numl.edu.pk`)**: Strict server-side exact-domain verification with 6-digit hashed email OTP codes, attempt limits, and resend cooldowns.
- **Student Profiles, Skills & Verified Portfolio**: Campus, department, programme, semester, work mode, payment preferences (Easypaisa, JazzCash, NayaPay, Bank transfer, Cash, or Free), availability slots, and portfolio items distinguishing **Verified Platform Work** from **Personal Portfolio** samples.
- **Dual-Window Matching & Expiry Engine**:
  - **24-hour Active Requests**: Public request feed filters by skill, category, campus, department, semester, work mode, and budget, automatically expiring after 24 hours.
  - **12-hour Request Alerts**: Real-time targeted alerts delivered to matched peers via WebSockets and a dedicated **Request Alerts** inbox that cleans out after 12 hours without deleting the 24-hour request.
- **Controlled Lifecycle & Mandatory Reviews**: Structured public offers -> single-helper acceptance -> private `processing` workspace -> `delivered` -> requester review (1–5 star rating required) -> database-calculated profile analytics.
- **Real-Time 1-to-1 Messaging**: WebSocket-powered private chats with attachments (JPG/PNG/WebP/PDF up to 4 MB), mute toggles, unread counts, and optional online/last-seen privacy controls.
- **Safety, Account Deletion & Admin Dashboard**: Bidirectional blocking, content/user reporting, dispute escalation, OTP-gated account deletion with clean re-registration, suspicious-activity pattern detection, and full admin audit logging.
- **Light & Dark Mode + Installable PWA**: Crisp Campus Indigo & Emerald design system with system/manual light & dark themes, responsive desktop/mobile navigation, offline banner, and web app manifest/service worker.

---

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` (never commit secrets):
```bash
cp .env.example .env
```

Key environment variables:
- `SQLITE_DB_PATH` — Local SQLite database path (default `./data/unilink.db`).
- `SESSION_SECRET` — Secret used for email-retention hashing.
- `ADMIN_EMAILS` — Comma-separated `@numl.edu.pk` emails granted admin privileges on verification (default `admin@numl.edu.pk`).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Real SMTP credentials for OTP delivery. **When SMTP is left unconfigured, UniLink automatically enters Preview Fallback Mode and returns the 6-digit OTP inside a clearly labeled verification preview modal for local/sandbox testing.**

### 3. Seed NUML Campuses, Departments, Skills & Sample Demo Records
```bash
npm run seed
```
*(Idempotent — safe to re-run; all sample accounts, requests, and reviews are tagged with `Demo` / `is_demo = 1` and can be cleared anytime from the Admin Dashboard.)*

### 4. Start the Full-Stack Server (Port 3000)
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## Running Tests & Verification

```bash
# Run automated unit & API integration tests
npm test

# Type-check TypeScript
npm run lint

# Build production bundle
npm run build
```

---

## Production Deployment & SMTP Checklist

1. **Configure Real SMTP**: Provide valid `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` in production environment variables so students receive real OTP emails instead of preview fallback.
2. **Set Secrets & Admins**: Set a strong `SESSION_SECRET` and configure `ADMIN_EMAILS` with official NUML moderator `@numl.edu.pk` addresses.
3. **Clear Sample Demo Data**: Sign in as an admin (`admin@numl.edu.pk`) and click **Clear Demo Data** in **Admin Controls -> Configuration & Demo Cleanup** before opening to real students.
4. **Build & Run**:
   ```bash
   npm run build
   npm start
   ```
5. **Managing Approved Domains**: Additional institutional domains (e.g., campus subdomains) can be added or updated directly from the Admin Dashboard under **University Domains & Catalog**.
