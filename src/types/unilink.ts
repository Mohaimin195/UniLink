export interface Campus {
  id: string;
  name: string;
  city: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Programme {
  id: string;
  department_id: string;
  name: string;
  max_semesters: number;
}

export interface Skill {
  id: string;
  category: string;
  name: string;
  proficiency?: 'beginner' | 'intermediate' | 'advanced';
  offering_service?: number;
}

export interface PlatformMeta {
  approvedDomains: string[];
  smtpConfigured: boolean;
  campuses: Campus[];
  departments: Department[];
  programmes: Programme[];
  skills: Skill[];
  settings: Record<string, string>;
}

export interface AvailabilitySlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone?: string;
}

export interface MeResponse {
  user: {
    id: string;
    normalized_email: string;
    role: 'student' | 'admin';
    account_status: 'pending_profile' | 'active' | 'suspended' | 'deleted';
    is_demo: number;
    show_online_status: number;
    show_last_seen: number;
    profile_visibility: 'university' | 'campus_only' | 'connections_only';
    muted_alert_categories_json: string;
    last_active_at: string;
    created_at: string;
  };
  profile: {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    bio: string;
    campus_id: string | null;
    campus_name: string | null;
    department_id: string | null;
    department_name: string | null;
    programme_id: string | null;
    programme_name: string | null;
    semester: number | null;
    work_mode: 'online' | 'in_person' | 'either';
    preferred_payment_methods_json: string;
    gender: 'male' | 'female' | null;
    gender_matching_opt_in: number;
    show_gender_publicly: number;
  };
  skills: Skill[];
  availabilitySlots: AvailabilitySlot[];
  unreadCounts: {
    alerts: number;
    notifications: number;
    messages: number;
  };
}

export interface RequestItem {
  id: string;
  owner_id: string;
  owner_name: string;
  owner_avatar: string | null;
  owner_semester: number | null;
  owner_campus: string | null;
  owner_department: string | null;
  title: string;
  description: string;
  category: string;
  visibility: 'university' | 'campus_only';
  targetAllCampuses: boolean;
  targetAllDepartments: boolean;
  min_semester: number | null;
  max_semester: number | null;
  preferred_gender: 'any' | 'male' | 'female';
  work_mode: 'online' | 'in_person' | 'either';
  deadline_text: string | null;
  budget_type: 'free' | 'paid' | 'negotiable';
  budget_amount: string | null;
  preferred_payment_method: string | null;
  additional_requirements: string | null;
  status: 'active' | 'processing' | 'completed' | 'cancelled' | 'expired';
  isDemo: boolean;
  created_at: string;
  expires_at: string;
  skills: Skill[];
  targetCampuses: Array<{ id: string; name: string }>;
  targetDepartments: Array<{ id: string; name: string }>;
  offerCount: number;
}

export interface OfferItem {
  id: string;
  request_id: string;
  helper_id: string;
  helper_name: string;
  helper_avatar: string | null;
  helper_semester: number | null;
  helper_campus: string | null;
  helper_department: string | null;
  helperIsDemo: boolean;
  message: string;
  estimated_delivery: string | null;
  availability_note: string | null;
  status: 'pending' | 'accepted' | 'not_selected' | 'withdrawn';
  created_at: string;
  helperSkills: Array<{ id: string; name: string }>;
  helperStats: {
    averageRating: number | null;
    verifiedReviews: number;
    completedJobs: number;
  };
}

export interface JobItem {
  id: string;
  request_id: string;
  offer_id: string;
  requester_id: string;
  helper_id: string;
  request_title: string;
  request_description: string;
  request_category: string;
  budget_type: string;
  budget_amount: string | null;
  work_mode: string;
  request_expires_at: string;
  requester_name: string;
  requester_avatar: string | null;
  helper_name: string;
  helper_avatar: string | null;
  status: 'processing' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
  accepted_at: string;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  dispute_reason: string | null;
  resolution_note: string | null;
  review_id: string | null;
  review_rating: number | null;
  review_comment: string | null;
  conversation_id: string | null;
}

export interface DirectoryUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  campusId: string | null;
  campusName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  programmeName: string | null;
  semester: number | null;
  workMode: 'online' | 'in_person' | 'either';
  preferredPaymentMethods: string[];
  publicGender: 'male' | 'female' | null;
  isDemo: boolean;
  isOnline: boolean | null;
  lastActiveAt: string | null;
  skills: Skill[];
  stats: {
    averageRating: number | null;
    verifiedReviews: number;
    completedJobs: number;
  };
}

export interface ProfileStats {
  averageRating: number | null;
  verifiedReviews: number;
  completedJobs: number;
  uniqueClients: number;
  departmentsServed: number;
  repeatClients: number;
  onTimeRate: number | null;
  monthlyJobs: Array<{ month: string; count: number }>;
  monthlyRatings: Array<{ month: string; avgRating: number; reviewCount: number }>;
  topRequestedSkills: Array<{ skill: string; count: number }>;
  observedResponseMinutesEstimate: number | null;
}
