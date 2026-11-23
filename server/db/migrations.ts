import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS institutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      approved_domains_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS campuses (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS programmes (
      id TEXT PRIMARY KEY,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      max_semesters INTEGER NOT NULL DEFAULT 8,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      normalized_email TEXT NOT NULL,
      active_email_lock TEXT UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
      account_status TEXT NOT NULL DEFAULT 'pending_profile' CHECK (account_status IN ('pending_profile', 'active', 'suspended', 'deleted')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      show_online_status INTEGER NOT NULL DEFAULT 1,
      show_last_seen INTEGER NOT NULL DEFAULT 1,
      profile_visibility TEXT NOT NULL DEFAULT 'university' CHECK (profile_visibility IN ('university', 'campus_only', 'connections_only')),
      muted_alert_categories_json TEXT NOT NULL DEFAULT '[]',
      last_active_at TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(normalized_email);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      normalized_email TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('auth', 'delete_account')),
      code_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      resend_available_at TEXT NOT NULL,
      consumed_at TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_challenges(normalized_email, purpose, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT NOT NULL DEFAULT '',
      institution_id TEXT NOT NULL REFERENCES institutions(id),
      campus_id TEXT REFERENCES campuses(id),
      department_id TEXT REFERENCES departments(id),
      programme_id TEXT REFERENCES programmes(id),
      semester INTEGER CHECK (semester IS NULL OR (semester >= 1 AND semester <= 12)),
      work_mode TEXT NOT NULL DEFAULT 'either' CHECK (work_mode IN ('online', 'in_person', 'either')),
      preferred_payment_methods_json TEXT NOT NULL DEFAULT '[]',
      gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female')),
      gender_matching_opt_in INTEGER NOT NULL DEFAULT 0,
      show_gender_publicly INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_suggested INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      proficiency TEXT NOT NULL DEFAULT 'intermediate' CHECK (proficiency IN ('beginner', 'intermediate', 'advanced')),
      offering_service INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      skill_tags_json TEXT NOT NULL DEFAULT '[]',
      media_url TEXT,
      external_link TEXT,
      completion_date TEXT,
      credit_statement TEXT,
      work_origin TEXT NOT NULL DEFAULT 'personal' CHECK (work_origin IN ('verified_platform', 'personal')),
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS availability_slots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Asia/Karachi'
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'university' CHECK (visibility IN ('university', 'campus_only')),
      target_all_campuses INTEGER NOT NULL DEFAULT 1,
      target_all_departments INTEGER NOT NULL DEFAULT 1,
      min_semester INTEGER CHECK (min_semester IS NULL OR (min_semester >= 1 AND min_semester <= 12)),
      max_semester INTEGER CHECK (max_semester IS NULL OR (max_semester >= 1 AND max_semester <= 12)),
      preferred_gender TEXT NOT NULL DEFAULT 'any' CHECK (preferred_gender IN ('any', 'male', 'female')),
      work_mode TEXT NOT NULL DEFAULT 'either' CHECK (work_mode IN ('online', 'in_person', 'either')),
      deadline_text TEXT,
      budget_type TEXT NOT NULL DEFAULT 'negotiable' CHECK (budget_type IN ('free', 'paid', 'negotiable')),
      budget_amount TEXT,
      preferred_payment_method TEXT,
      additional_requirements TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'processing', 'completed', 'cancelled', 'expired')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      closed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_requests_status_expires ON requests(status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_requests_owner ON requests(owner_id);

    CREATE TABLE IF NOT EXISTS request_skills (
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      PRIMARY KEY (request_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS request_target_campuses (
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      campus_id TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
      PRIMARY KEY (request_id, campus_id)
    );

    CREATE TABLE IF NOT EXISTS request_target_departments (
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      PRIMARY KEY (request_id, department_id)
    );

    CREATE TABLE IF NOT EXISTS request_alerts (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      sent_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      read_at TEXT,
      dismissed_at TEXT,
      UNIQUE (recipient_id, request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_request_alerts_recipient_expires ON request_alerts(recipient_id, expires_at);

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      helper_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      estimated_delivery TEXT,
      availability_note TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'not_selected', 'withdrawn')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_offers_request ON offers(request_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      helper_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requester_department_at_job TEXT,
      status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'delivered', 'completed', 'cancelled', 'disputed')),
      accepted_at TEXT NOT NULL,
      delivered_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      cancel_reason TEXT,
      dispute_reason TEXT,
      resolution_note TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_participants ON jobs(requester_id, helper_id, status);

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT REFERENCES requests(id) ON DELETE SET NULL,
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      muted_by_a INTEGER NOT NULL DEFAULT 0,
      muted_by_b INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_users ON conversations(user_a_id, user_b_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      attachment_url TEXT,
      attachment_name TEXT,
      attachment_mime TEXT,
      attachment_size INTEGER,
      sent_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, sent_at);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT,
      quality_rating INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),
      communication_rating INTEGER CHECK (communication_rating IS NULL OR (communication_rating >= 1 AND communication_rating <= 5)),
      reliability_rating INTEGER CHECK (reliability_rating IS NULL OR (reliability_rating >= 1 AND reliability_rating <= 5)),
      on_time_rating INTEGER CHECK (on_time_rating IS NULL OR (on_time_rating >= 1 AND on_time_rating <= 5)),
      moderation_status TEXT NOT NULL DEFAULT 'valid' CHECK (moderation_status IN ('valid', 'flagged', 'hidden')),
      moderation_reason TEXT,
      created_at TEXT NOT NULL,
      CHECK (reviewer_id != reviewee_id),
      UNIQUE (job_id, reviewer_id)
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id, moderation_status);

    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (requester_id != target_id),
      UNIQUE (requester_id, target_id)
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      CHECK (blocker_id != blocked_id),
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('user', 'request', 'offer', 'message', 'portfolio', 'review')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'resolved', 'dismissed')),
      admin_resolution TEXT,
      resolved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link_target TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS account_deletion_records (
      id TEXT PRIMARY KEY,
      email_hash TEXT NOT NULL UNIQUE,
      last_user_id TEXT NOT NULL,
      deleted_at TEXT NOT NULL,
      reason TEXT,
      re_registered_count INTEGER NOT NULL DEFAULT 0,
      flagged_for_review INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS community_questions (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS community_replies (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES community_questions(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}
