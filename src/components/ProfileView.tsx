import React, { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  Calendar,
  CheckCircle2,
  ExternalLink,
  Flag,
  HelpCircle,
  MessageSquare,
  Plus,
  Star,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch, formatRelativeTime, isSafeHttpUrl, uploadAttachment } from '../lib/api.ts';
import type { AvailabilitySlot, JobItem, ProfileStats, Skill } from '../types/unilink.ts';
import type { ReportTarget } from './ReportModal.tsx';
import { UserAvatar } from './UserAvatar.tsx';

interface ProfileData {
  profile: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    bio: string;
    campusName: string | null;
    departmentName: string | null;
    programmeName: string | null;
    semester: number | null;
    workMode: string;
    preferredPaymentMethods: string[];
    publicGender: string | null;
    isDemo: boolean;
    isOnline: boolean | null;
    lastActiveAt: string | null;
    memberSince: string;
  };
  skills: Skill[];
  portfolio: Array<{
    id: string;
    title: string;
    description: string;
    skill_tags_json: string;
    media_url: string | null;
    external_link: string | null;
    completion_date: string | null;
    credit_statement: string | null;
    work_origin: 'verified_platform' | 'personal';
    job_id: string | null;
    created_at: string;
  }>;
  availabilitySlots: AvailabilitySlot[];
  reviews: Array<{
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    reviewer_name: string;
    reviewer_department: string | null;
    job_title: string;
  }>;
  connection: { id: string; status: string; requester_id: string; target_id: string } | null;
  stats: ProfileStats;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface ProfileViewProps {
  userId: string;
  currentUserId: string;
  onOpenChat: (targetUserId: string) => void;
  onReport: (target: ReportTarget) => void;
  onToast: (msg: string) => void;
  onGoSettings: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userId,
  currentUserId,
  onOpenChat,
  onReport,
  onToast,
  onGoSettings,
}) => {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPortfolio, setShowAddPortfolio] = useState(false);
  const [completedHelperJobs, setCompletedHelperJobs] = useState<JobItem[]>([]);

  // Portfolio form
  const [pTitle, setPTitle] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [pTags, setPTags] = useState('');
  const [pMediaUrl, setPMediaUrl] = useState('');
  const [pLink, setPLink] = useState('');
  const [pDate, setPDate] = useState('');
  const [pCredit, setPCredit] = useState('');
  const [pJobId, setPJobId] = useState('');
  const [uploading, setUploading] = useState(false);

  const isOwnProfile = userId === currentUserId;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<ProfileData>(`/api/users/${userId}`);
      setData(res);
      if (isOwnProfile) {
        const jobsRes = await apiFetch<{ items: JobItem[] }>('/api/jobs');
        setCompletedHelperJobs(
          jobsRes.items.filter((j) => j.helper_id === currentUserId && j.status === 'completed'),
        );
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load profile.');
    } finally {
      setLoading(false);
    }
  }, [userId, isOwnProfile, currentUserId, onToast]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleConnect = async () => {
    try {
      await apiFetch('/api/connections/request', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: userId }),
      });
      onToast('Connection request sent.');
      loadProfile();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to send connection request.');
    }
  };

  const handleBlock = async () => {
    try {
      await apiFetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedUserId: userId }),
      });
      onToast('User blocked. They can no longer message or interact with you.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to block user.');
    }
  };

  const handleUploadPortfolioMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadAttachment(file);
      setPMediaUrl(up.url);
      onToast('Portfolio image/document uploaded.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSavePortfolio = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/portfolio', {
        method: 'POST',
        body: JSON.stringify({
          title: pTitle,
          description: pDesc,
          skillTags: pTags.split(',').map((s) => s.trim()).filter(Boolean),
          mediaUrl: pMediaUrl || null,
          externalLink: pLink.trim() || null,
          completionDate: pDate || null,
          creditStatement: pCredit || null,
          jobId: pJobId || null,
        }),
      });
      setShowAddPortfolio(false);
      setPTitle('');
      setPDesc('');
      setPTags('');
      setPMediaUrl('');
      setPLink('');
      setPDate('');
      setPCredit('');
      setPJobId('');
      onToast('Portfolio entry added.');
      loadProfile();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not add portfolio entry.');
    }
  };

  const handleDeletePortfolio = async (id: string) => {
    try {
      await apiFetch(`/api/portfolio/${id}`, { method: 'DELETE' });
      onToast('Portfolio item removed.');
      loadProfile();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to delete portfolio item.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <div className="h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">Profile unavailable.</p>
      </div>
    );
  }

  const { profile, skills, portfolio, availabilitySlots, reviews, connection, stats } = data;
  const maxMonthJobs = Math.max(1, ...stats.monthlyJobs.map((m) => m.count));

  return (
    <div className="space-y-6">
      {/* Header Summary Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <UserAvatar name={profile.displayName} avatarUrl={profile.avatarUrl} size="lg" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                  {profile.displayName}
                </h2>
                {profile.isDemo && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Sample Data</span>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {profile.programmeName || profile.departmentName || 'NUML Student'}
                {profile.semester ? ` · Semester ${profile.semester}` : ''}
                {profile.campusName ? ` · ${profile.campusName}` : ''}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {profile.isOnline === true
                  ? 'Online now'
                  : profile.lastActiveAt
                  ? `Active ${formatRelativeTime(profile.lastActiveAt)}`
                  : 'Activity visibility hidden'}
                {' · '}
                Work mode: {profile.workMode === 'in_person' ? 'On-Campus' : profile.workMode === 'online' ? 'Online' : 'Online or On-Campus'}
                {profile.publicGender ? ` · ${profile.publicGender}` : ''}
              </p>
              {profile.bio && (
                <p className="pt-2 text-sm text-slate-700 dark:text-slate-200 max-w-2xl leading-relaxed">
                  {profile.bio}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isOwnProfile ? (
              <button
                type="button"
                onClick={onGoSettings}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Edit Profile &amp; Availability
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onOpenChat(profile.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Message</span>
                </button>
                {!connection && (
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Connect</span>
                  </button>
                )}
                {connection && (
                  <span className="px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {connection.status === 'accepted' ? 'Connected' : 'Request pending'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleBlock}
                  aria-label="Block user"
                  title="Block user"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReport({ targetType: 'user', targetId: profile.id, label: profile.displayName })
                  }
                  aria-label="Report user"
                  title="Report user"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Skills & Informational Payment Methods */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Skills &amp; Offerings</p>
            <p className="text-slate-600 dark:text-slate-400">
              {skills.length > 0 ? skills.map((s) => s.name).join(' · ') : 'No skills listed yet'}
            </p>
          </div>
          <div>
            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Preferred Payment Methods (arranged directly outside app)
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              {profile.preferredPaymentMethods.length > 0
                ? profile.preferredPaymentMethods.join(' · ')
                : 'Not specified'}
            </p>
          </div>
        </div>
      </section>

      {/* Database-Calculated Verified Reputation Metrics */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Verified Platform Reputation
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Calculated directly from completed UniLink jobs and required requester ratings.
            </p>
          </div>
          <span
            title="Each normal completed job produces exactly one verified review. Metrics with insufficient records are hidden."
            className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>1 completed job = 1 rating</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 tabular-nums">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Average Rating</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50 flex items-center gap-1">
              {stats.averageRating !== null ? (
                <>
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>{stats.averageRating} / 5</span>
                </>
              ) : (
                <span className="text-sm font-medium text-slate-400">No reviews yet</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Verified Reviews</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50">{stats.verifiedReviews}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Completed Jobs</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50">{stats.completedJobs}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Unique Clients</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50">{stats.uniqueClients}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Depts Served</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50">{stats.departmentsServed}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Repeat Clients</p>
            <p className="mt-1 font-mono text-xl font-bold text-slate-900 dark:text-slate-50">{stats.repeatClients}</p>
          </div>
        </div>

        {/* Graphs: Monthly Jobs & Monthly Ratings */}
        {(stats.monthlyJobs.length > 0 || stats.topRequestedSkills.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Completed Jobs by Month
              </p>
              <div className="space-y-2">
                {stats.monthlyJobs.map((m) => (
                  <div key={m.month} className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="w-16 font-mono text-slate-500">{m.month}</span>
                    <div className="flex-1 h-5 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 dark:bg-indigo-500 rounded"
                        style={{ width: `${Math.round((m.count / maxMonthJobs) * 100)}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono font-semibold">{m.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                Rating Trend &amp; Top Completed Skills
              </p>
              <div className="space-y-2 text-xs tabular-nums">
                {stats.monthlyRatings.map((mr) => (
                  <div key={mr.month} className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                    <span className="font-mono text-slate-500">{mr.month}</span>
                    <span>
                      {mr.avgRating} / 5 ({mr.reviewCount} review{mr.reviewCount === 1 ? '' : 's'})
                    </span>
                  </div>
                ))}
                {stats.topRequestedSkills.length > 0 && (
                  <p className="pt-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Most completed skills:</span>{' '}
                    {stats.topRequestedSkills.map((t) => `${t.skill} (${t.count})`).join(' · ')}
                  </p>
                )}
                {stats.onTimeRate !== null && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    {stats.onTimeRate}% on-time rating across {stats.verifiedReviews} verified reviews
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Availability: User-Set Schedule vs Observed Activity Estimate */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
              User-Set Weekly Availability
            </h3>
          </div>
          {availabilitySlots.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No weekly schedule configured.</p>
          ) : (
            <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
              {availabilitySlots.map((slot, idx) => (
                <li key={slot.id || idx} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="font-medium">{DAYS[slot.day_of_week]}</span>
                  <span className="font-mono">{slot.start_time} – {slot.end_time} PKT</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50 mb-2">
            Observed Activity Pattern (Estimate)
          </h3>
          {stats.observedResponseMinutesEstimate !== null ? (
            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                ~{stats.observedResponseMinutesEstimate} min typical offer response
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Estimated from historical platform offer timestamps; not guaranteed availability.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Insufficient offer/job history to estimate response speed yet.
            </p>
          )}
        </div>
      </section>

      {/* Portfolio Showcase (Verified Platform vs Personal) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
              Portfolio
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified platform work is linked to completed UniLink jobs; personal items are self-uploaded.
            </p>
          </div>
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => setShowAddPortfolio(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Portfolio Item</span>
            </button>
          )}
        </div>

        {portfolio.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">No portfolio entries added yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portfolio.map((item) => {
              let tags: string[] = [];
              try {
                tags = JSON.parse(item.skill_tags_json || '[]');
              } catch {
                tags = [];
              }
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between bg-slate-50/50 dark:bg-slate-950/50"
                >
                  <div>
                    {item.media_url && isSafeHttpUrl(item.media_url) && (
                      <div className="aspect-[4/3] bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <img
                          src={item.media_url}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            item.work_origin === 'verified_platform'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.work_origin === 'verified_platform' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {item.work_origin === 'verified_platform' ? 'Verified Platform Work' : 'Personal Portfolio'}
                        </span>
                        {item.completion_date && <span className="font-mono text-slate-400">{item.completion_date}</span>}
                      </div>

                      <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {item.title}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{item.description}</p>
                      {tags.length > 0 && (
                        <p className="text-[11px] text-slate-500">{tags.join(' · ')}</p>
                      )}
                      {item.credit_statement && (
                        <p className="text-[11px] italic text-slate-400">{item.credit_statement}</p>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-2.5 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between text-xs">
                    {item.external_link && isSafeHttpUrl(item.external_link) ? (
                      <a
                        href={item.external_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>View Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-2">
                      {isOwnProfile ? (
                        <button
                          type="button"
                          onClick={() => handleDeletePortfolio(item.id)}
                          aria-label="Delete portfolio item"
                          className="text-rose-600 hover:text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            onReport({ targetType: 'portfolio', targetId: item.id, label: item.title })
                          }
                          aria-label="Report portfolio item"
                          className="text-slate-400 hover:text-rose-500 cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Verified Reviews List */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
          Verified Reviews ({reviews.length})
        </h3>
        {reviews.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No reviews yet. Reviews appear automatically once a completed UniLink job is rated.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reviews.map((rev) => (
              <div key={rev.id} className="py-4 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {rev.reviewer_name}
                      {rev.reviewer_department && (
                        <span className="font-normal text-xs text-slate-500"> · {rev.reviewer_department}</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Job: {rev.job_title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="inline-flex items-center gap-1 font-mono text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                      <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                      {rev.rating}.0
                    </span>
                    <p className="text-[11px] text-slate-400">{formatRelativeTime(rev.created_at)}</p>
                  </div>
                </div>
                {rev.comment && <p className="text-sm text-slate-700 dark:text-slate-300">{rev.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Portfolio Modal */}
      {showAddPortfolio && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold">Add Portfolio Entry</h3>
              <button type="button" onClick={() => setShowAddPortfolio(false)} className="cursor-pointer text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePortfolio} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium mb-1">Project Title *</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={pTitle}
                  onChange={(e) => setPTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Description *</label>
                <textarea
                  required
                  minLength={5}
                  rows={3}
                  value={pDesc}
                  onChange={(e) => setPDesc(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              {completedHelperJobs.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-1">Link Completed UniLink Job (Optional — marks as Verified Work)</label>
                  <select
                    value={pJobId}
                    onChange={(e) => setPJobId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  >
                    <option value="">Personal portfolio work (not linked)</option>
                    {completedHelperJobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.request_title}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium mb-1">Skills Used (comma-separated)</label>
                <input
                  type="text"
                  value={pTags}
                  onChange={(e) => setPTags(e.target.value)}
                  placeholder="e.g. Figma, UI/UX, Poster Design"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Completion Date</label>
                  <input
                    type="date"
                    value={pDate}
                    onChange={(e) => setPDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Client Permission / Credit</label>
                  <input
                    type="text"
                    value={pCredit}
                    onChange={(e) => setPCredit(e.target.value)}
                    placeholder="Shared with permission"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Preview Image Upload (JPG/PNG/WebP, max 4 MB)</label>
                <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{uploading ? 'Uploading...' : pMediaUrl ? 'Image Uploaded (Replace)' : 'Choose Image'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUploadPortfolioMedia} className="hidden" />
                </label>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">External Link (https://...)</label>
                <input
                  type="url"
                  value={pLink}
                  onChange={(e) => setPLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddPortfolio(false)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer">
                  Save Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
