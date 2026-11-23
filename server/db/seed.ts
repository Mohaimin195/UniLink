import type Database from 'better-sqlite3';

export function seedDatabase(db: Database.Database, options: { includeDemoData?: boolean; forceDemo?: boolean } = {}) {
  const { includeDemoData = true, forceDemo = false } = options;
  const now = new Date();
  const nowIso = now.toISOString();

  const existingInst = db.prepare(`SELECT id FROM institutions WHERE id = 'inst-numl'`).get();
  if (!existingInst) {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO institutions (id, name, short_name, approved_domains_json, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run('inst-numl', 'National University of Modern Languages (NUML)', 'NUML', JSON.stringify(['@numl.edu.pk']), nowIso);

      const campuses = [
        ['campus-isb', 'Islamabad Main Campus', 'Islamabad'],
        ['campus-rwp', 'Rawalpindi Campus', 'Rawalpindi'],
        ['campus-lhr', 'Lahore Campus', 'Lahore'],
        ['campus-khi', 'Karachi Campus', 'Karachi'],
        ['campus-mux', 'Multan Campus', 'Multan'],
        ['campus-pew', 'Peshawar Campus', 'Peshawar'],
        ['campus-fsd', 'Faisalabad Campus', 'Faisalabad'],
        ['campus-qta', 'Quetta Campus', 'Quetta'],
        ['campus-mpk', 'Mirpur Campus', 'Mirpur'],
      ];
      const insCampus = db.prepare(`INSERT INTO campuses (id, institution_id, name, city, is_active) VALUES (?, 'inst-numl', ?, ?, 1)`);
      for (const [id, name, city] of campuses) insCampus.run(id, name, city);

      const departments = [
        ['dept-se', 'Software Engineering', 'SE', 'BS Software Engineering', 8],
        ['dept-cs', 'Computer Science', 'CS', 'BS Computer Science', 8],
        ['dept-it', 'Information Technology', 'IT', 'BS Information Technology', 8],
        ['dept-ai', 'Artificial Intelligence', 'AI', 'BS Artificial Intelligence', 8],
        ['dept-eng', 'English (GS)', 'ENG', 'BS English', 8],
        ['dept-bba', 'Management Sciences', 'BBA', 'BBA (Hons)', 8],
        ['dept-mc', 'Mass Communication', 'MC', 'BS Mass Communication', 8],
        ['dept-ir', 'International Relations', 'IR', 'BS International Relations', 8],
        ['dept-math', 'Mathematics', 'MATH', 'BS Mathematics', 8],
        ['dept-psy', 'Psychology', 'PSY', 'BS Psychology', 8],
        ['dept-af', 'Accounting & Finance', 'AF', 'BS Accounting & Finance', 8],
        ['dept-eco', 'Economics', 'ECO', 'BS Economics', 8],
      ] as const;

      const insDept = db.prepare(`INSERT INTO departments (id, institution_id, name, code, is_active) VALUES (?, 'inst-numl', ?, ?, 1)`);
      const insProg = db.prepare(`INSERT INTO programmes (id, department_id, name, max_semesters, is_active) VALUES (?, ?, ?, ?, 1)`);
      for (const [id, name, code, progName, maxSem] of departments) {
        insDept.run(id, name, code);
        insProg.run(`prog-${id.replace('dept-', '')}`, id, progName, maxSem);
      }

      const skillCatalog: Array<[string, string[]]> = [
        [
          'Programming & Technology',
          ['Java', 'C++', 'Python', 'JavaScript', 'TypeScript', 'HTML', 'CSS', 'React', 'Web Development', 'Databases', 'Debugging', 'PC Troubleshooting', 'Software Setup'],
        ],
        [
          'Graphic Design & UI',
          ['Photoshop', 'Illustrator', 'Canva', 'Logo Design', 'Poster Design', 'Presentation Design', 'UI/UX', 'Figma', 'Branding'],
        ],
        [
          'Video & Media',
          ['Video Editing', 'Reels/Shorts', 'Premiere Pro', 'After Effects', 'CapCut', 'Motion Graphics', 'Photography', 'Event Photography', 'Videography'],
        ],
        [
          'Academic Help',
          ['Mathematics', 'Programming Tutoring', 'OOP', 'Discrete Structures', 'Notes', 'Study Guidance', 'Exam Preparation', 'Concept Explanation'],
        ],
        [
          'Writing & Communication',
          ['Content Writing', 'Proofreading', 'Translation', 'Copywriting', 'CV Writing', 'Report Formatting', 'Presentation Writing'],
        ],
        [
          'Business & Other',
          ['Accounting', 'Excel', 'Marketing', 'Social Media Management', 'Data Entry', 'Research Assistance', 'Event Support', 'Other'],
        ],
      ];

      const insSkill = db.prepare(
        `INSERT INTO skills (id, category, name, is_active, is_suggested, created_at) VALUES (?, ?, ?, 1, 0, ?)`,
      );
      for (const [category, names] of skillCatalog) {
        for (const name of names) {
          const slug = `skill-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
          insSkill.run(slug, category, name, nowIso);
        }
      }

      const insSetting = db.prepare(`INSERT OR IGNORE INTO platform_settings (key, value, updated_at) VALUES (?, ?, ?)`);
      insSetting.run('request_expiry_hours', '24', nowIso);
      insSetting.run('alert_expiry_hours', '12', nowIso);
      insSetting.run('brand_name', 'UniLink', nowIso);
    })();
  }

  if (!includeDemoData) return;

  const existingDemo = db.prepare(`SELECT COUNT(*) AS cnt FROM users WHERE is_demo = 1`).get() as { cnt: number };
  if (existingDemo.cnt > 0 && !forceDemo) return;

  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600 * 1000).toISOString();
  const hoursFromNow = (h: number) => new Date(now.getTime() + h * 3600 * 1000).toISOString();
  const daysAgoIso = (d: number) => new Date(now.getTime() - d * 86400 * 1000).toISOString();

  db.transaction(() => {
    // Seed labeled Demo users (admin + 6 NUML students across campuses/departments)
    const demoUsers = [
      {
        id: 'demo-admin-1',
        email: 'admin@numl.edu.pk',
        role: 'admin',
        name: 'Ayesha Siddiqui (Demo Admin)',
        campus: 'campus-isb',
        dept: 'dept-se',
        prog: 'prog-se',
        sem: 8,
        mode: 'online',
        gender: 'female',
        bio: 'Sample NUML Campus Moderator & Community Admin for reviewing reports, tags, and verified domains.',
        payments: ['Free / no payment required'],
        skills: ['skill-research-assistance', 'skill-report-formatting'],
      },
      {
        id: 'demo-user-hamza',
        email: 'hamza.tariq@numl.edu.pk',
        role: 'student',
        name: 'Hamza Tariq (Demo)',
        campus: 'campus-rwp',
        dept: 'dept-se',
        prog: 'prog-se',
        sem: 6,
        mode: 'either',
        gender: 'male',
        bio: 'Sample Senior BS Software Engineering peer specializing in Java OOP, React web apps, and SQL debugging.',
        payments: ['Easypaisa', 'JazzCash', 'Free / no payment required'],
        skills: ['skill-java', 'skill-oop', 'skill-react', 'skill-databases', 'skill-programming-tutoring', 'skill-debugging'],
      },
      {
        id: 'demo-user-zainab',
        email: 'zainab.malik@numl.edu.pk',
        role: 'student',
        name: 'Zainab Malik (Demo)',
        campus: 'campus-isb',
        dept: 'dept-mc',
        prog: 'prog-mc',
        sem: 5,
        mode: 'in_person',
        gender: 'female',
        bio: 'Sample Mass Comm filmmaker & event editor. Comfortable with Premiere Pro, Reels, and society event coverage.',
        payments: ['NayaPay', 'JazzCash', 'Cash / in person'],
        skills: ['skill-video-editing', 'skill-premiere-pro', 'skill-reels-shorts', 'skill-event-photography', 'skill-capcut'],
      },
      {
        id: 'demo-user-bilal',
        email: 'bilal.ahmed@numl.edu.pk',
        role: 'student',
        name: 'Bilal Ahmed (Demo)',
        campus: 'campus-isb',
        dept: 'dept-cs',
        prog: 'prog-cs',
        sem: 4,
        mode: 'either',
        gender: 'male',
        bio: 'Sample UI/UX designer & presentation craftsman helping societies with Figma prototypes and symposium posters.',
        payments: ['Easypaisa', 'Bank transfer'],
        skills: ['skill-figma', 'skill-ui-ux', 'skill-poster-design', 'skill-photoshop', 'skill-presentation-design'],
      },
      {
        id: 'demo-user-sana',
        email: 'sana.farooq@numl.edu.pk',
        role: 'student',
        name: 'Sana Farooq (Demo)',
        campus: 'campus-lhr',
        dept: 'dept-eng',
        prog: 'prog-eng',
        sem: 7,
        mode: 'online',
        gender: 'female',
        bio: 'Sample BS English senior offering academic proofreading, thesis formatting, CV polishing, and translation.',
        payments: ['NayaPay', 'Free / no payment required'],
        skills: ['skill-proofreading', 'skill-cv-writing', 'skill-report-formatting', 'skill-translation', 'skill-content-writing'],
      },
      {
        id: 'demo-user-usman',
        email: 'usman.raza@numl.edu.pk',
        role: 'student',
        name: 'Usman Raza (Demo)',
        campus: 'campus-rwp',
        dept: 'dept-math',
        prog: 'prog-math',
        sem: 3,
        mode: 'either',
        gender: 'male',
        bio: 'Sample Mathematics & Discrete Structures peer tutor available weekday evenings at Rawalpindi campus.',
        payments: ['JazzCash', 'Cash / in person', 'Free / no payment required'],
        skills: ['skill-mathematics', 'skill-discrete-structures', 'skill-exam-preparation', 'skill-notes'],
      },
      {
        id: 'demo-user-hira',
        email: 'hira.noor@numl.edu.pk',
        role: 'student',
        name: 'Hira Noor (Demo)',
        campus: 'campus-isb',
        dept: 'dept-bba',
        prog: 'prog-bba',
        sem: 4,
        mode: 'online',
        gender: 'female',
        bio: 'Sample BBA student helping peers with Excel financial sheets, accounting concepts, and pitch decks.',
        payments: ['Easypaisa', 'NayaPay'],
        skills: ['skill-excel', 'skill-accounting', 'skill-presentation-design', 'skill-marketing'],
      },
    ];

    const insUser = db.prepare(`
      INSERT OR IGNORE INTO users (
        id, normalized_email, active_email_lock, email_verified, role, account_status,
        is_demo, show_online_status, show_last_seen, profile_visibility, last_active_at, created_at
      ) VALUES (?, ?, ?, 1, ?, 'active', 1, 1, 1, 'university', ?, ?)
    `);

    const insProfile = db.prepare(`
      INSERT OR IGNORE INTO user_profiles (
        user_id, display_name, bio, institution_id, campus_id, department_id, programme_id,
        semester, work_mode, preferred_payment_methods_json, gender, gender_matching_opt_in, show_gender_publicly, updated_at
      ) VALUES (?, ?, ?, 'inst-numl', ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)
    `);

    const insUserSkill = db.prepare(`
      INSERT OR IGNORE INTO user_skills (user_id, skill_id, proficiency, offering_service) VALUES (?, ?, 'advanced', 1)
    `);

    const insAvail = db.prepare(`
      INSERT OR IGNORE INTO availability_slots (id, user_id, day_of_week, start_time, end_time, timezone) VALUES (?, ?, ?, ?, ?, 'Asia/Karachi')
    `);

    for (const u of demoUsers) {
      insUser.run(u.id, u.email, u.email, u.role, hoursAgo(0.2), daysAgoIso(45));
      insProfile.run(u.id, u.name, u.bio, u.campus, u.dept, u.prog, u.sem, u.mode, JSON.stringify(u.payments), u.gender, nowIso);
      for (const s of u.skills) {
        insUserSkill.run(u.id, s);
      }
      insAvail.run(`avail-${u.id}-1`, u.id, 1, '15:00', '19:00');
      insAvail.run(`avail-${u.id}-3`, u.id, 3, '16:00', '20:00');
      insAvail.run(`avail-${u.id}-5`, u.id, 5, '14:00', '18:00');
    }

    // Active demo requests (24h lifetime from recent creation)
    const demoRequests = [
      {
        id: 'demo-req-1',
        ownerId: 'demo-user-hira',
        title: '[Demo] Need a Video Editor for Computing Society Recap',
        desc: 'Looking for a fellow NUML student to edit a crisp 2-minute highlight reel from our Entrepreneurship Week seminar. Raw clips are ready on Drive.',
        cat: 'Video & Media',
        allCampuses: 1,
        allDepts: 1,
        minSem: null,
        maxSem: null,
        gender: 'any',
        mode: 'online',
        budgetType: 'paid',
        budgetAmount: 'Rs. 2,000',
        payment: 'NayaPay',
        skills: ['skill-video-editing', 'skill-premiere-pro', 'skill-reels-shorts'],
        createdAt: hoursAgo(1.2),
        expiresAt: hoursFromNow(22.8),
      },
      {
        id: 'demo-req-2',
        ownerId: 'demo-user-usman',
        title: '[Demo] Explain Polymorphism & Interfaces in Java (1-hour session)',
        desc: 'Preparing for my OOP mid-semester quiz and struggling with runtime polymorphism and abstract classes. Looking for concept explanation—not homework solving.',
        cat: 'Academic Help',
        allCampuses: 0,
        campusId: 'campus-rwp',
        allDepts: 0,
        deptId: 'dept-se',
        minSem: 4,
        maxSem: 8,
        gender: 'any',
        mode: 'either',
        budgetType: 'free',
        budgetAmount: null,
        payment: 'Free / no payment required',
        skills: ['skill-java', 'skill-oop', 'skill-programming-tutoring', 'skill-concept-explanation'],
        createdAt: hoursAgo(3.5),
        expiresAt: hoursFromNow(20.5),
      },
      {
        id: 'demo-req-3',
        ownerId: 'demo-user-sana',
        title: '[Demo] Symposium Poster & Social Media Carousel Design',
        desc: 'English Literary Society needs one A3 print poster and 4 matching Instagram slides for next Thursday’s debate competition.',
        cat: 'Graphic Design & UI',
        allCampuses: 1,
        allDepts: 1,
        minSem: null,
        maxSem: null,
        gender: 'female',
        mode: 'online',
        budgetType: 'negotiable',
        budgetAmount: 'Rs. 1,500',
        payment: 'Easypaisa',
        skills: ['skill-poster-design', 'skill-canva', 'skill-illustrator'],
        createdAt: hoursAgo(5),
        expiresAt: hoursFromNow(19),
      },
      {
        id: 'demo-req-4',
        ownerId: 'demo-user-bilal',
        title: '[Demo] Proofread & Format Final Year Proposal Document',
        desc: 'Need someone strong in academic writing to review grammar, APA citations, and Word table-of-contents formatting before submission.',
        cat: 'Writing & Communication',
        allCampuses: 1,
        allDepts: 0,
        deptId: 'dept-eng',
        minSem: 5,
        maxSem: 8,
        gender: 'any',
        mode: 'online',
        budgetType: 'paid',
        budgetAmount: 'Rs. 1,200',
        payment: 'Easypaisa',
        skills: ['skill-proofreading', 'skill-report-formatting'],
        createdAt: hoursAgo(7),
        expiresAt: hoursFromNow(17),
      },
    ];

    const insReq = db.prepare(`
      INSERT OR IGNORE INTO requests (
        id, owner_id, title, description, category, visibility,
        target_all_campuses, target_all_departments, min_semester, max_semester,
        preferred_gender, work_mode, deadline_text, budget_type, budget_amount,
        preferred_payment_method, status, is_demo, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, 'university', ?, ?, ?, ?, ?, ?, 'Within 48 hours', ?, ?, ?, 'active', 1, ?, ?)
    `);
    const insReqSkill = db.prepare(`INSERT OR IGNORE INTO request_skills (request_id, skill_id) VALUES (?, ?)`);
    const insReqCampus = db.prepare(`INSERT OR IGNORE INTO request_target_campuses (request_id, campus_id) VALUES (?, ?)`);
    const insReqDept = db.prepare(`INSERT OR IGNORE INTO request_target_departments (request_id, department_id) VALUES (?, ?)`);

    for (const r of demoRequests) {
      insReq.run(
        r.id,
        r.ownerId,
        r.title,
        r.desc,
        r.cat,
        r.allCampuses,
        r.allDepts,
        r.minSem,
        r.maxSem,
        r.gender,
        r.mode,
        r.budgetType,
        r.budgetAmount,
        r.payment,
        r.createdAt,
        r.expiresAt,
      );
      for (const s of r.skills) insReqSkill.run(r.id, s);
      if (!r.allCampuses && r.campusId) insReqCampus.run(r.id, r.campusId);
      if (!r.allDepts && r.deptId) insReqDept.run(r.id, r.deptId);
    }

    // Demo public offers on active requests
    db.prepare(
      `INSERT OR IGNORE INTO offers (id, request_id, helper_id, message, estimated_delivery, availability_note, status, created_at)
       VALUES ('demo-offer-1', 'demo-req-1', 'demo-user-zainab', 'I edited last semester’s Media Gala recap in Premiere Pro—happy to cut a 2-minute reel with beat-synced transitions tonight.', 'Within 24 hours', 'Available after 5 PM', 'pending', ?)`,
    ).run(hoursAgo(0.8));

    db.prepare(
      `INSERT OR IGNORE INTO offers (id, request_id, helper_id, message, estimated_delivery, availability_note, status, created_at)
       VALUES ('demo-offer-2', 'demo-req-2', 'demo-user-hamza', 'I can walk you through inheritance, interfaces, and dynamic dispatch on campus or via screen-share with live IntelliJ examples.', 'Today 6 PM', 'On Rawalpindi campus until 5 PM', 'pending', ?)`,
    ).run(hoursAgo(2.2));

    // Historical completed demo requests + jobs + 1:1 verified reviews so stats are 100% database-calculated
    const completedHistory = [
      {
        reqId: 'demo-hist-req-1',
        offerId: 'demo-hist-off-1',
        jobId: 'demo-hist-job-1',
        revId: 'demo-hist-rev-1',
        requesterId: 'demo-user-hira',
        requesterDept: 'Management Sciences',
        helperId: 'demo-user-hamza',
        title: '[Demo] Debug MySQL Joins & Normalization Schema',
        cat: 'Programming & Technology',
        skillId: 'skill-databases',
        rating: 5,
        onTime: 5,
        comment: 'Clear explanation of 3NF and fixed the foreign key query in 30 minutes.',
        daysAgo: 38,
      },
      {
        reqId: 'demo-hist-req-2',
        offerId: 'demo-hist-off-2',
        jobId: 'demo-hist-job-2',
        revId: 'demo-hist-rev-2',
        requesterId: 'demo-user-zainab',
        requesterDept: 'Mass Communication',
        helperId: 'demo-user-hamza',
        title: '[Demo] React Portfolio Landing Layout Troubleshooting',
        cat: 'Programming & Technology',
        skillId: 'skill-react',
        rating: 5,
        onTime: 5,
        comment: 'Super helpful walkthrough of responsive flexbox layout.',
        daysAgo: 22,
      },
      {
        reqId: 'demo-hist-req-3',
        offerId: 'demo-hist-off-3',
        jobId: 'demo-hist-job-3',
        revId: 'demo-hist-rev-3',
        requesterId: 'demo-user-usman',
        requesterDept: 'Mathematics',
        helperId: 'demo-user-hamza',
        title: '[Demo] Java OOP Class Diagram & Lab Prep',
        cat: 'Academic Help',
        skillId: 'skill-java',
        rating: 4,
        onTime: 4,
        comment: 'Great breakdown of abstract classes vs interfaces.',
        daysAgo: 9,
      },
      {
        reqId: 'demo-hist-req-4',
        offerId: 'demo-hist-off-4',
        jobId: 'demo-hist-job-4',
        revId: 'demo-hist-rev-4',
        requesterId: 'demo-user-hira',
        requesterDept: 'Management Sciences',
        helperId: 'demo-user-hamza',
        title: '[Demo] Python CSV Cleanup Script Guidance',
        cat: 'Programming & Technology',
        skillId: 'skill-python',
        rating: 5,
        onTime: 5,
        comment: 'Repeat help on automating spreadsheet cleaning—always patient.',
        daysAgo: 3,
      },
      {
        reqId: 'demo-hist-req-5',
        offerId: 'demo-hist-off-5',
        jobId: 'demo-hist-job-5',
        revId: 'demo-hist-rev-5',
        requesterId: 'demo-user-bilal',
        requesterDept: 'Computer Science',
        helperId: 'demo-user-zainab',
        title: '[Demo] Tech Club Orientation Highlight Reel',
        cat: 'Video & Media',
        skillId: 'skill-video-editing',
        rating: 5,
        onTime: 5,
        comment: 'Crisp pacing and color grading delivered before the society meeting.',
        daysAgo: 14,
      },
      {
        reqId: 'demo-hist-req-6',
        offerId: 'demo-hist-off-6',
        jobId: 'demo-hist-job-6',
        revId: 'demo-hist-rev-6',
        requesterId: 'demo-user-sana',
        requesterDept: 'English (GS)',
        helperId: 'demo-user-bilal',
        title: '[Demo] Annual Literary Symposium Poster & Badge Set',
        cat: 'Graphic Design & UI',
        skillId: 'skill-poster-design',
        rating: 5,
        onTime: 5,
        comment: 'Print-ready typography and clean layout.',
        daysAgo: 18,
      },
    ];

    for (const h of completedHistory) {
      const created = daysAgoIso(h.daysAgo + 1);
      const accepted = daysAgoIso(h.daysAgo);
      const delivered = new Date(new Date(accepted).getTime() + 4 * 3600 * 1000).toISOString();
      const completed = new Date(new Date(delivered).getTime() + 2 * 3600 * 1000).toISOString();

      db.prepare(
        `INSERT OR IGNORE INTO requests (
          id, owner_id, title, description, category, visibility, target_all_campuses, target_all_departments,
          preferred_gender, work_mode, budget_type, status, is_demo, created_at, expires_at, closed_at
        ) VALUES (?, ?, ?, ?, ?, 'university', 1, 1, 'any', 'either', 'negotiable', 'completed', 1, ?, ?, ?)`,
      ).run(h.reqId, h.requesterId, h.title, h.title, h.cat, created, accepted, completed);

      insReqSkill.run(h.reqId, h.skillId);

      db.prepare(
        `INSERT OR IGNORE INTO offers (id, request_id, helper_id, message, estimated_delivery, status, created_at)
         VALUES (?, ?, ?, 'Sample completed offer', 'Same day', 'accepted', ?)`,
      ).run(h.offerId, h.reqId, h.helperId, created);

      db.prepare(
        `INSERT OR IGNORE INTO jobs (
          id, request_id, offer_id, requester_id, helper_id, requester_department_at_job,
          status, accepted_at, delivered_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
      ).run(h.jobId, h.reqId, h.offerId, h.requesterId, h.helperId, h.requesterDept, accepted, delivered, completed);

      db.prepare(
        `INSERT OR IGNORE INTO reviews (
          id, job_id, reviewer_id, reviewee_id, rating, comment, quality_rating, communication_rating,
          reliability_rating, on_time_rating, moderation_status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid', ?)`,
      ).run(h.revId, h.jobId, h.requesterId, h.helperId, h.rating, h.comment, h.rating, h.rating, h.rating, h.onTime, completed);
    }

    // Portfolio items (distinguishing verified_platform vs personal)
    db.prepare(
      `INSERT OR IGNORE INTO portfolio_items (
        id, user_id, title, description, skill_tags_json, media_url, completion_date, credit_statement, work_origin, job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'demo-port-1',
      'demo-user-zainab',
      'NUML Tech Club Orientation Recap (Demo)',
      '2-minute color-graded highlight reel cut in Premiere Pro for the Islamabad campus orientation.',
      JSON.stringify(['Video Editing', 'Premiere Pro']),
      '/src/assets/images/portfolio_video_editing_1795450614808.jpg',
      daysAgoIso(14).slice(0, 10),
      'Shared with society coordinator permission',
      'verified_platform',
      'demo-hist-job-5',
      daysAgoIso(14),
    );

    db.prepare(
      `INSERT OR IGNORE INTO portfolio_items (
        id, user_id, title, description, skill_tags_json, media_url, completion_date, credit_statement, work_origin, job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'demo-port-2',
      'demo-user-bilal',
      'Annual Literary Symposium Poster System (Demo)',
      'Modular Swiss-grid A3 poster and program booklet prepared for the English Department debate.',
      JSON.stringify(['Poster Design', 'Illustrator']),
      '/src/assets/images/portfolio_poster_design_1795450615197.jpg',
      daysAgoIso(18).slice(0, 10),
      'Credited to NUML Literary Society',
      'verified_platform',
      'demo-hist-job-6',
      daysAgoIso(18),
    );

    db.prepare(
      `INSERT OR IGNORE INTO portfolio_items (
        id, user_id, title, description, skill_tags_json, media_url, completion_date, credit_statement, work_origin, job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'demo-port-3',
      'demo-user-hamza',
      'Java OOP Architecture & Study Diagrams (Demo)',
      'Visual UML and polymorphism walkthrough sheets created for semester 2–4 peer study sessions.',
      JSON.stringify(['Java', 'OOP', 'Programming Tutoring']),
      '/src/assets/images/portfolio_java_tutoring_1795450614748.jpg',
      daysAgoIso(9).slice(0, 10),
      'Personal study aid',
      'personal',
      null,
      daysAgoIso(9),
    );

    // Sample Request Alerts (12h inbox) so demo users see matching alerts
    db.prepare(
      `INSERT OR IGNORE INTO request_alerts (id, recipient_id, request_id, sent_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('demo-alert-1', 'demo-user-hamza', 'demo-req-2', hoursAgo(3.5), hoursFromNow(8.5));

    // Sample Community Q&A posts
    db.prepare(
      `INSERT OR IGNORE INTO community_questions (id, author_id, title, body, category, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      'demo-qa-1',
      'demo-user-usman',
      'Best way to prepare for Discrete Structures midterms?',
      'Which chapters on induction and graph theory are most useful to revise first? Happy to share handwritten summary sheets too.',
      'Academic Help',
      hoursAgo(6),
    );
    db.prepare(
      `INSERT OR IGNORE INTO community_replies (id, question_id, author_id, body, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'demo-qa-rep-1',
      'demo-qa-1',
      'demo-user-hamza',
      'Start with mathematical induction proofs and recurrence relations—past quiz problems repeat the same proof structure.',
      hoursAgo(5),
    );
  })();
}
