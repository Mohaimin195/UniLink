import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import crypto from 'crypto';
import http from 'http';
import { createApiApp } from '../server/app.ts';
import { createDatabase } from '../server/db/connection.ts';
import { runMigrations } from '../server/db/migrations.ts';
import { seedDatabase } from '../server/db/seed.ts';
import {
  computeNextRequestStatusAfterCancel,
  extractDomainAfterLastAt,
  isApprovedUniversityEmail,
  normalizeEmail,
  validateReviewEligibility,
} from '../server/services/domainPolicy.ts';
import { runExpirySweep } from '../server/services/expiryWorker.ts';
import { dispatchRequestAlerts } from '../server/services/matchingService.ts';
import { getProfileStats } from '../server/services/statsService.ts';

async function jsonRequest(
  baseUrl: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function authenticateStudent(
  baseUrl: string,
  email: string,
  profile?: {
    displayName: string;
    campusId: string;
    departmentId: string;
    semester: number;
    workMode?: 'online' | 'in_person' | 'either';
    gender?: 'male' | 'female' | null;
    genderMatchingOptIn?: boolean;
    skillIds?: string[];
  },
) {
  const otpReq = await jsonRequest(baseUrl, '/api/auth/request-otp', {
    method: 'POST',
    body: { email },
  });
  expect(otpReq.status).toBe(200);
  expect(otpReq.data.previewOtp).toMatch(/^\d{6}$/);

  const verify = await jsonRequest(baseUrl, '/api/auth/verify-otp', {
    method: 'POST',
    body: { email, code: otpReq.data.previewOtp },
  });
  expect(verify.status).toBe(200);
  const token = String(verify.data.token);
  const userId = String(verify.data.user.id);

  if (profile) {
    const putProf = await jsonRequest(baseUrl, '/api/profile', {
      method: 'PUT',
      token,
      body: {
        displayName: profile.displayName,
        bio: 'Verified NUML student profile for test flow.',
        campusId: profile.campusId,
        departmentId: profile.departmentId,
        semester: profile.semester,
        workMode: profile.workMode || 'either',
        preferredPaymentMethods: ['Easypaisa', 'Free / no payment required'],
        gender: profile.gender ?? null,
        genderMatchingOptIn: Boolean(profile.genderMatchingOptIn),
        showGenderPublicly: false,
        skills: (profile.skillIds || ['skill-java']).map((skillId) => ({
          skillId,
          proficiency: 'intermediate',
          offeringService: true,
        })),
      },
    });
    expect(putProf.status).toBe(200);
  }

  return { token, userId };
}

describe('UniLink Domain Policy & Pure Business Rules', () => {
  it('enforces exact institutional domain matching and rejects spoofing', () => {
    const allowed = ['@numl.edu.pk'];
    expect(normalizeEmail('  Student.Ali@NUML.EDU.PK ')).toBe('student.ali@numl.edu.pk');
    expect(extractDomainAfterLastAt('student@numl.edu.pk')).toBe('numl.edu.pk');
    expect(isApprovedUniversityEmail('ali.khan@numl.edu.pk', allowed)).toBe(true);

    // Reject public domains & substring spoofing
    expect(isApprovedUniversityEmail('ali@gmail.com', allowed)).toBe(false);
    expect(isApprovedUniversityEmail('ali@yahoo.com', allowed)).toBe(false);
    expect(isApprovedUniversityEmail('ali@numl.edu.pk.fake.com', allowed)).toBe(false);
    expect(isApprovedUniversityEmail('ali@fakenuml.edu.pk', allowed)).toBe(false);
    expect(isApprovedUniversityEmail('ali@bad@numl.edu.pk', allowed)).toBe(false);
  });

  it('computes request return status on processing cancel accurately', () => {
    const now = Date.now();
    const futureExpiry = new Date(now + 4 * 3600 * 1000).toISOString();
    const pastExpiry = new Date(now - 60 * 1000).toISOString();

    expect(computeNextRequestStatusAfterCancel(futureExpiry, now)).toBe('active');
    expect(computeNextRequestStatusAfterCancel(pastExpiry, now)).toBe('expired');
  });

  it('validates strict 1-to-1 review eligibility', () => {
    const baseJob = { id: 'j1', requester_id: 'u1', helper_id: 'u2', status: 'delivered' };
    expect(validateReviewEligibility({ job: baseJob, reviewerId: 'u1', rating: 5, existingReviewCount: 0 }).ok).toBe(true);
    expect(validateReviewEligibility({ job: baseJob, reviewerId: 'u2', rating: 5, existingReviewCount: 0 }).ok).toBe(false);
    expect(validateReviewEligibility({ job: baseJob, reviewerId: 'u1', rating: 0, existingReviewCount: 0 }).ok).toBe(false);
    expect(validateReviewEligibility({ job: baseJob, reviewerId: 'u1', rating: 5, existingReviewCount: 1 }).ok).toBe(false);
    expect(
      validateReviewEligibility({
        job: { id: 'j2', requester_id: 'u1', helper_id: 'u1', status: 'delivered' },
        reviewerId: 'u1',
        rating: 5,
        existingReviewCount: 0,
      }).ok,
    ).toBe(false);
  });
});

describe('UniLink Full-Stack API Integration & State Invariants', () => {
  let db: Database.Database;
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    db = createDatabase(':memory:');
    runMigrations(db);
    seedDatabase(db, { includeDemoData: true });
    const app = createApiApp(db);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    db.close();
  });

  it('blocks non-NUML email registration and enforces OTP attempt limits + resend cooldown', async () => {
    const gmailRes = await jsonRequest(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { email: 'outsider@gmail.com' },
    });
    expect(gmailRes.status).toBe(403);

    const spoofRes = await jsonRequest(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { email: 'hacker@numl.edu.pk.evil.org' },
    });
    expect(spoofRes.status).toBe(403);

    const validEmail = 'new.student@numl.edu.pk';
    const firstOtp = await jsonRequest(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { email: validEmail },
    });
    expect(firstOtp.status).toBe(200);

    // Resend cooldown within 60s
    const secondOtp = await jsonRequest(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { email: validEmail },
    });
    expect(secondOtp.status).toBe(429);

    // Wrong code decrements remaining attempts
    const badVerify = await jsonRequest(baseUrl, '/api/auth/verify-otp', {
      method: 'POST',
      body: { email: validEmail, code: '000000' },
    });
    // In 1-in-1,000,000 chance previewOtp was '000000', skip assertion otherwise assert 400
    if (firstOtp.data.previewOtp !== '000000') {
      expect(badVerify.status).toBe(400);
    }

    // Valid verification creates exactly one active account & session
    const okVerify = await jsonRequest(baseUrl, '/api/auth/verify-otp', {
      method: 'POST',
      body: { email: validEmail, code: firstOtp.data.previewOtp },
    });
    expect(okVerify.status).toBe(200);
    expect(okVerify.data.needsProfileCompletion).toBe(true);
  });

  it('matches active requests to eligible helpers, expires 12h alerts without touching 24h requests, and respects blocks', async () => {
    const requester = await authenticateStudent(baseUrl, 'req.student@numl.edu.pk', {
      displayName: 'Req Student',
      campusId: 'campus-isb',
      departmentId: 'dept-se',
      semester: 4,
      skillIds: ['skill-notes'],
    });

    const eligibleHelper = await authenticateStudent(baseUrl, 'match.helper@numl.edu.pk', {
      displayName: 'Matched Helper',
      campusId: 'campus-isb',
      departmentId: 'dept-cs',
      semester: 6,
      workMode: 'online',
      gender: 'female',
      genderMatchingOptIn: true,
      skillIds: ['skill-python'],
    });

    const blockedHelper = await authenticateStudent(baseUrl, 'blocked.helper@numl.edu.pk', {
      displayName: 'Blocked Helper',
      campusId: 'campus-isb',
      departmentId: 'dept-cs',
      semester: 6,
      workMode: 'online',
      gender: 'female',
      genderMatchingOptIn: true,
      skillIds: ['skill-python'],
    });

    // Requester blocks blockedHelper beforehand
    const blockRes = await jsonRequest(baseUrl, '/api/blocks', {
      method: 'POST',
      token: requester.token,
      body: { blockedUserId: blockedHelper.userId },
    });
    expect(blockRes.status).toBe(201);

    // Create request restricted to female helpers who opted in, skill-python, online
    const createReq = await jsonRequest(baseUrl, '/api/requests', {
      method: 'POST',
      token: requester.token,
      body: {
        title: 'Python Pandas Data Cleaning Session',
        description: 'Need help understanding pandas groupby aggregation for my semester lab.',
        category: 'Programming & Technology',
        skillIds: ['skill-python'],
        visibility: 'university',
        targetAllCampuses: true,
        targetAllDepartments: true,
        minSemester: 4,
        maxSemester: 8,
        preferredGender: 'female',
        workMode: 'online',
        budgetType: 'paid',
        budgetAmount: 'Rs. 1,000',
      },
    });
    expect(createReq.status).toBe(201);
    const reqId = String(createReq.data.id);

    // Eligible helper receives alert; blocked helper does NOT
    const eligibleAlerts = await jsonRequest(baseUrl, '/api/alerts', { token: eligibleHelper.token });
    expect(eligibleAlerts.status).toBe(200);
    expect(eligibleAlerts.data.items.some((a: { request_id: string }) => a.request_id === reqId)).toBe(true);

    const blockedAlerts = await jsonRequest(baseUrl, '/api/alerts', { token: blockedHelper.token });
    expect(blockedAlerts.status).toBe(200);
    expect(blockedAlerts.data.items.some((a: { request_id: string }) => a.request_id === reqId)).toBe(false);

    // Deduplication check: re-running dispatchRequestAlerts does not duplicate alerts
    const dupCheck = dispatchRequestAlerts(db, reqId);
    expect(dupCheck.createdCount).toBe(0);

    // Simulate 13 hours passing -> 12h alerts expire & disappear, while 24h request stays active!
    const thirteenHoursLater = new Date(Date.now() + 13 * 3600 * 1000).toISOString();
    const sweep13h = runExpirySweep(db, thirteenHoursLater);
    expect(sweep13h.removedAlertsCount).toBeGreaterThanOrEqual(1);

    const reqRowAfter13h = db.prepare(`SELECT status FROM requests WHERE id = ?`).get(reqId) as { status: string };
    expect(reqRowAfter13h.status).toBe('active');

    // Simulate 25 hours passing -> 24h request moves to 'expired'
    const twentyFiveHoursLater = new Date(Date.now() + 25 * 3600 * 1000).toISOString();
    runExpirySweep(db, twentyFiveHoursLater);
    const reqRowAfter25h = db.prepare(`SELECT status FROM requests WHERE id = ?`).get(reqId) as { status: string };
    expect(reqRowAfter25h.status).toBe('expired');
  });

  it('executes full lifecycle: offer -> accept -> private processing -> cancel return -> re-accept -> deliver -> mandatory review -> DB stats', async () => {
    const owner = await authenticateStudent(baseUrl, 'owner.lifecycle@numl.edu.pk', {
      displayName: 'Owner Lifecycle',
      campusId: 'campus-rwp',
      departmentId: 'dept-bba',
      semester: 3,
      skillIds: ['skill-excel'],
    });
    const helper = await authenticateStudent(baseUrl, 'helper.lifecycle@numl.edu.pk', {
      displayName: 'Helper Lifecycle',
      campusId: 'campus-rwp',
      departmentId: 'dept-se',
      semester: 7,
      skillIds: ['skill-react', 'skill-databases'],
    });
    const thirdParty = await authenticateStudent(baseUrl, 'viewer.lifecycle@numl.edu.pk', {
      displayName: 'Viewer Lifecycle',
      campusId: 'campus-isb',
      departmentId: 'dept-cs',
      semester: 2,
    });

    // 1. Create active request
    const createReq = await jsonRequest(baseUrl, '/api/requests', {
      method: 'POST',
      token: owner.token,
      body: {
        title: 'Build React Chart Dashboard for Society',
        description: 'Need a clean React dashboard showing event attendance across NUML campuses.',
        category: 'Programming & Technology',
        skillIds: ['skill-react'],
        visibility: 'university',
        targetAllCampuses: true,
        targetAllDepartments: true,
        workMode: 'online',
        budgetType: 'negotiable',
      },
    });
    expect(createReq.status).toBe(201);
    const requestId = String(createReq.data.id);

    // 2. Helper submits structured offer
    const offer1 = await jsonRequest(baseUrl, `/api/requests/${requestId}/offers`, {
      method: 'POST',
      token: helper.token,
      body: {
        message: 'I can build your attendance chart components cleanly in React tonight.',
        estimatedDelivery: 'Tonight 10 PM',
        availabilityNote: 'Online after 6 PM',
      },
    });
    expect(offer1.status).toBe(201);
    const offer1Id = String(offer1.data.id);

    // Non-owner cannot accept offer
    const badAccept = await jsonRequest(baseUrl, `/api/offers/${offer1Id}/accept`, {
      method: 'POST',
      token: helper.token,
    });
    expect(badAccept.status).toBe(403);

    // 3. Owner accepts offer -> moves request to processing & hides from public feed
    const accept1 = await jsonRequest(baseUrl, `/api/offers/${offer1Id}/accept`, {
      method: 'POST',
      token: owner.token,
    });
    expect(accept1.status).toBe(201);
    const job1Id = String(accept1.data.jobId);

    const feedWhileProcessing = await jsonRequest(baseUrl, '/api/requests', { token: thirdParty.token });
    expect(feedWhileProcessing.data.items.some((r: { id: string }) => r.id === requestId)).toBe(false);

    // Third party cannot inspect processing request details
    const thirdPartyInspect = await jsonRequest(baseUrl, `/api/requests/${requestId}`, { token: thirdParty.token });
    expect(thirdPartyInspect.status).toBe(403);

    // 4. Cancel during processing -> request returns to active with remaining 24h window
    const cancelRes = await jsonRequest(baseUrl, `/api/jobs/${job1Id}/cancel-processing`, {
      method: 'POST',
      token: owner.token,
      body: { reason: 'Scheduling conflict before work began' },
    });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.data.nextRequestStatus).toBe('active');

    const feedAfterCancel = await jsonRequest(baseUrl, '/api/requests', { token: thirdParty.token });
    expect(feedAfterCancel.data.items.some((r: { id: string }) => r.id === requestId)).toBe(true);

    // 5. Helper submits new offer -> Owner accepts -> Helper delivers -> Owner completes with mandatory star rating
    const offer2 = await jsonRequest(baseUrl, `/api/requests/${requestId}/offers`, {
      method: 'POST',
      token: helper.token,
      body: {
        message: 'Re-submitting offer for Saturday afternoon slot.',
        estimatedDelivery: 'Saturday 5 PM',
      },
    });
    expect(offer2.status).toBe(201);

    const accept2 = await jsonRequest(baseUrl, `/api/offers/${offer2.data.id}/accept`, {
      method: 'POST',
      token: owner.token,
    });
    expect(accept2.status).toBe(201);
    const job2Id = String(accept2.data.jobId);

    const deliver = await jsonRequest(baseUrl, `/api/jobs/${job2Id}/deliver`, {
      method: 'POST',
      token: helper.token,
    });
    expect(deliver.status).toBe(200);

    // Completing without valid star rating fails
    const badComplete = await jsonRequest(baseUrl, `/api/jobs/${job2Id}/complete`, {
      method: 'POST',
      token: owner.token,
      body: { comment: 'Missing rating' },
    });
    expect(badComplete.status).toBe(400);

    // Completing with 5-star rating succeeds and updates DB-calculated stats
    const okComplete = await jsonRequest(baseUrl, `/api/jobs/${job2Id}/complete`, {
      method: 'POST',
      token: owner.token,
      body: {
        rating: 5,
        comment: 'Delivered clean responsive components on schedule.',
        qualityRating: 5,
        communicationRating: 5,
        reliabilityRating: 5,
        onTimeRating: 5,
      },
    });
    expect(okComplete.status).toBe(201);

    // Duplicate review for same job is blocked
    const dupComplete = await jsonRequest(baseUrl, `/api/jobs/${job2Id}/complete`, {
      method: 'POST',
      token: owner.token,
      body: { rating: 4 },
    });
    expect(dupComplete.status).toBe(400);

    // Check database-calculated profile statistics for helper
    const helperStats = getProfileStats(db, helper.userId);
    expect(helperStats.completedJobs).toBe(1);
    expect(helperStats.verifiedReviews).toBe(1);
    expect(helperStats.averageRating).toBe(5);
    expect(helperStats.uniqueClients).toBe(1);
    expect(helperStats.departmentsServed).toBe(1);
  });

  it('supports OTP-gated account deletion and clean re-registration with fresh zero public history', async () => {
    const email = 'reborn.student@numl.edu.pk';
    const user1 = await authenticateStudent(baseUrl, email, {
      displayName: 'Original Identity',
      campusId: 'campus-lhr',
      departmentId: 'dept-cs',
      semester: 5,
    });

    // Request deletion OTP & confirm
    const delOtp = await jsonRequest(baseUrl, '/api/auth/delete-account/request-otp', {
      method: 'POST',
      token: user1.token,
    });
    expect(delOtp.status).toBe(200);

    const delConfirm = await jsonRequest(baseUrl, '/api/auth/delete-account/confirm', {
      method: 'POST',
      token: user1.token,
      body: { code: delOtp.data.previewOtp, reason: 'Graduating test' },
    });
    expect(delConfirm.status).toBe(200);

    // Old session token is immediately revoked
    const meAfterDel = await jsonRequest(baseUrl, '/api/auth/me', { token: user1.token });
    expect(meAfterDel.status).toBe(401);

    // Re-register with the exact same @numl.edu.pk email -> clean new account with 0 stats
    const user2 = await authenticateStudent(baseUrl, email, {
      displayName: 'Fresh Identity',
      campusId: 'campus-isb',
      departmentId: 'dept-ai',
      semester: 1,
    });
    expect(user2.userId).not.toBe(user1.userId);
    const freshStats = getProfileStats(db, user2.userId);
    expect(freshStats.completedJobs).toBe(0);
    expect(freshStats.verifiedReviews).toBe(0);
  });

  it('allows admin moderation and logs every moderation action in admin_audit_logs', async () => {
    const admin = await authenticateStudent(baseUrl, 'admin@numl.edu.pk');
    const reporter = await authenticateStudent(baseUrl, 'reporter@numl.edu.pk', {
      displayName: 'Safety Reporter',
      campusId: 'campus-isb',
      departmentId: 'dept-se',
      semester: 4,
    });

    const reportRes = await jsonRequest(baseUrl, '/api/reports', {
      method: 'POST',
      token: reporter.token,
      body: {
        targetType: 'request',
        targetId: 'demo-req-1',
        reason: 'Test safety report',
        details: 'Verifying admin moderation queue.',
      },
    });
    expect(reportRes.status).toBe(201);

    // Non-admin cannot access admin queue
    const forbidden = await jsonRequest(baseUrl, '/api/admin/reports', { token: reporter.token });
    expect(forbidden.status).toBe(403);

    // Admin resolves report & writes audit log
    const resolveRes = await jsonRequest(baseUrl, `/api/admin/reports/${reportRes.data.id}/resolve`, {
      method: 'POST',
      token: admin.token,
      body: { status: 'resolved', resolution: 'Reviewed and verified compliant.' },
    });
    expect(resolveRes.status).toBe(200);

    const logsRes = await jsonRequest(baseUrl, '/api/admin/audit-logs', { token: admin.token });
    expect(logsRes.status).toBe(200);
    expect(
      logsRes.data.items.some(
        (l: { action: string; target_id: string }) =>
          l.action === 'resolve_report:resolved' && l.target_id === reportRes.data.id,
      ),
    ).toBe(true);

    // Verify seeding remains idempotent on re-run
    const beforeUsers = (db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as { cnt: number }).cnt;
    seedDatabase(db, { includeDemoData: true });
    const afterUsers = (db.prepare(`SELECT COUNT(*) AS cnt FROM users`).get() as { cnt: number }).cnt;
    expect(afterUsers).toBe(beforeUsers);
  });

  it('serves sanitized public showcase data and persists sessions via HttpOnly cookie with CSRF checks', async () => {
    const showcase = await jsonRequest(baseUrl, '/api/auth/showcase');
    expect(showcase.status).toBe(200);
    expect(showcase.data.metrics.campusesCount).toBe(9);
    expect(Array.isArray(showcase.data.featuredRequests)).toBe(true);
    expect(Array.isArray(showcase.data.featuredPortfolio)).toBe(true);
    // Ensure no private institutional email addresses leak in public showcase
    expect(JSON.stringify(showcase.data)).not.toContain('@numl.edu.pk');

    const email = 'cookie.user@numl.edu.pk';
    const otpReq = await jsonRequest(baseUrl, '/api/auth/request-otp', {
      method: 'POST',
      body: { email },
    });
    expect(otpReq.status).toBe(200);

    const verifyRaw = await fetch(`${baseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code: otpReq.data.previewOtp }),
    });
    expect(verifyRaw.status).toBe(200);
    const setCookie = verifyRaw.headers.get('set-cookie') || '';
    expect(setCookie).toContain('unilink_session=');
    expect(setCookie.toLowerCase()).toContain('httponly');

    const sessionCookiePair = setCookie.split(';')[0];

    // Cookie-authenticated GET /me succeeds across simulated browser refresh without Bearer header
    const meWithCookie = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookiePair },
    });
    expect(meWithCookie.status).toBe(200);

    // Cookie-authenticated mutation WITHOUT X-Requested-With or Origin is rejected (CSRF protection)
    const csrfBlocked = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookiePair },
    });
    expect(csrfBlocked.status).toBe(403);

    // Cookie-authenticated mutation WITH X-Requested-With: UniLink succeeds and revokes session
    const logoutOk = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: sessionCookiePair, 'X-Requested-With': 'UniLink' },
    });
    expect(logoutOk.status).toBe(200);

    const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: sessionCookiePair },
    });
    expect(meAfterLogout.status).toBe(401);
  });
});
