import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2, Upload } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand.ts';
import { apiFetch, uploadAttachment } from '../lib/api.ts';
import type { ThemeMode } from '../hooks/useTheme.ts';
import type { AvailabilitySlot, MeResponse, PlatformMeta } from '../types/unilink.ts';
import { PWAInstallButton } from './PWAWidgets.tsx';

interface SettingsViewProps {
  me: MeResponse;
  meta: PlatformMeta;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onProfileUpdated: (me: MeResponse) => void;
  onAccountDeleted: () => void;
  onToast: (msg: string) => void;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CATEGORIES = [
  'Programming & Technology',
  'Graphic Design & UI',
  'Video & Media',
  'Academic Help',
  'Writing & Communication',
  'Business & Other',
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  me,
  meta,
  theme,
  onToggleTheme,
  onProfileUpdated,
  onAccountDeleted,
  onToast,
}) => {
  const [displayName, setDisplayName] = useState(me.profile.display_name);
  const [bio, setBio] = useState(me.profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.profile.avatar_url);
  const [campusId, setCampusId] = useState(me.profile.campus_id || meta.campuses[0]?.id || '');
  const [departmentId, setDepartmentId] = useState(me.profile.department_id || meta.departments[0]?.id || '');
  const [semester, setSemester] = useState(me.profile.semester || 1);
  const [workMode, setWorkMode] = useState<'online' | 'in_person' | 'either'>(me.profile.work_mode);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(() => {
    try {
      return JSON.parse(me.profile.preferred_payment_methods_json || '[]');
    } catch {
      return [];
    }
  });
  const [selectedSkills, setSelectedSkills] = useState<string[]>(me.skills.map((s) => s.id));
  const [slots, setSlots] = useState<AvailabilitySlot[]>(me.availabilitySlots);

  // Privacy & Notifications
  const [showOnlineStatus, setShowOnlineStatus] = useState(Boolean(me.user.show_online_status));
  const [showLastSeen, setShowLastSeen] = useState(Boolean(me.user.show_last_seen));
  const [profileVisibility, setProfileVisibility] = useState<'university' | 'campus_only' | 'connections_only'>(
    me.user.profile_visibility,
  );
  const [gender, setGender] = useState<'male' | 'female' | ''>(me.profile.gender || '');
  const [genderMatchingOptIn, setGenderMatchingOptIn] = useState(Boolean(me.profile.gender_matching_opt_in));
  const [showGenderPublicly, setShowGenderPublicly] = useState(Boolean(me.profile.show_gender_publicly));
  const [mutedCategories, setMutedCategories] = useState<string[]>(() => {
    try {
      return JSON.parse(me.user.muted_alert_categories_json || '[]');
    } catch {
      return [];
    }
  });

  const [blockedUsers, setBlockedUsers] = useState<Array<{ blocked_id: string; display_name: string }>>([]);
  const [saving, setSaving] = useState(false);

  // Account Deletion with Email OTP
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<'confirm' | 'otp'>('confirm');
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deletePreviewOtp, setDeletePreviewOtp] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadBlocks = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: Array<{ blocked_id: string; display_name: string }> }>('/api/blocks');
      setBlockedUsers(res.items);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadBlocks();
  }, [loadBlocks]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await uploadAttachment(file);
      setAvatarUrl(up.url);
      onToast('Profile avatar uploaded. Click Save Settings to apply.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Upload failed.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName,
          bio,
          avatarUrl,
          campusId,
          departmentId,
          semester,
          workMode,
          preferredPaymentMethods: paymentMethods,
          gender: gender || null,
          genderMatchingOptIn: Boolean(gender && genderMatchingOptIn),
          showGenderPublicly: Boolean(gender && showGenderPublicly),
          showOnlineStatus,
          showLastSeen,
          profileVisibility,
          mutedAlertCategories: mutedCategories,
          skills: selectedSkills.map((id) => ({
            skillId: id,
            proficiency: 'intermediate',
            offeringService: true,
          })),
          availabilitySlots: slots,
        }),
      });
      const updated = await apiFetch<MeResponse>('/api/auth/me');
      onProfileUpdated(updated);
      onToast('Profile, availability, and privacy settings saved.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    await apiFetch(`/api/blocks/${blockedId}`, { method: 'DELETE' });
    onToast('User unblocked.');
    loadBlocks();
  };

  const handleRequestDeleteOtp = async () => {
    setDeleting(true);
    try {
      const res = await apiFetch<{ deliveredVia: 'smtp' | 'preview'; previewOtp?: string }>(
        '/api/auth/delete-account/request-otp',
        { method: 'POST' },
      );
      setDeletePreviewOtp(res.previewOtp || null);
      setDeleteStep('otp');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not send deletion verification code.');
    } finally {
      setDeleting(false);
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await apiFetch('/api/auth/delete-account/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: deleteOtp, reason: deleteReason }),
      });
      onAccountDeleted();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Incorrect deletion verification code.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Information */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold">Profile &amp; University Details</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Verified Email (private): <span className="font-mono">{me.user.normalized_email}</span>
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Avatar</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden" />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Display Name</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Campus</label>
              <select
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {meta.campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              >
                {meta.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium mb-1">Semester</label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                    <option key={s} value={s}>Sem {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Work Mode</label>
                <select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as 'online' | 'in_person' | 'either')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="either">Either</option>
                  <option value="online">Online</option>
                  <option value="in_person">On-Campus</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Bio / Introduction</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Skills ({selectedSkills.length}/20)</label>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex flex-wrap gap-1.5">
              {meta.skills.map((s) => {
                const active = selectedSkills.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setSelectedSkills((prev) =>
                        prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id],
                      )
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Preferred Payment Methods (Informational Only)</label>
            <div className="flex flex-wrap gap-1.5">
              {['Easypaisa', 'JazzCash', 'NayaPay', 'Bank transfer', 'Cash / in person', 'Free / no payment required'].map(
                (pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() =>
                      setPaymentMethods((prev) =>
                        prev.includes(pm) ? prev.filter((x) => x !== pm) : [...prev, pm],
                      )
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                      paymentMethods.includes(pm)
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {pm}
                  </button>
                ),
              )}
            </div>
          </div>
        </section>

        {/* Weekly Availability Slots */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">Weekly Availability Schedule</h2>
            <button
              type="button"
              onClick={() => setSlots((prev) => [...prev, { day_of_week: 1, start_time: '15:00', end_time: '18:00' }])}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Slot</span>
            </button>
          </div>

          {slots.map((slot, idx) => (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <select
                value={slot.day_of_week}
                onChange={(e) =>
                  setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, day_of_week: Number(e.target.value) } : s)))
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
              >
                {DAYS.map((d, di) => (
                  <option key={d} value={di}>{d}</option>
                ))}
              </select>
              <input
                type="time"
                value={slot.start_time}
                onChange={(e) =>
                  setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, start_time: e.target.value } : s)))
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="time"
                value={slot.end_time}
                onChange={(e) =>
                  setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, end_time: e.target.value } : s)))
                }
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => setSlots((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1.5 text-rose-600 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </section>

        {/* Privacy, Comfort & Notification Settings */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="font-display text-base font-semibold">Privacy, Comfort &amp; Alert Preferences</h2>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={showOnlineStatus} onChange={(e) => setShowOnlineStatus(e.target.checked)} />
              <span>Show when I am online now</span>
            </label>
            <label className="flex items-center gap-2.5">
              <input type="checkbox" checked={showLastSeen} onChange={(e) => setShowLastSeen(e.target.checked)} />
              <span>Show my last active timestamp</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Profile Discovery Visibility</label>
              <select
                value={profileVisibility}
                onChange={(e) =>
                  setProfileVisibility(e.target.value as 'university' | 'campus_only' | 'connections_only')
                }
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              >
                <option value="university">All verified NUML members</option>
                <option value="campus_only">My campus only</option>
                <option value="connections_only">Connections only</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Optional Comfort Matching Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as 'male' | 'female' | '')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              >
                <option value="">Not provided</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          {gender && (
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={genderMatchingOptIn}
                  onChange={(e) => setGenderMatchingOptIn(e.target.checked)}
                />
                <span>Allow matching requests with a matching comfort preference</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showGenderPublicly}
                  onChange={(e) => setShowGenderPublicly(e.target.checked)}
                />
                <span>Display on my public profile (keep unchecked to stay private)</span>
              </label>
            </div>
          )}

          <div>
            <p className="text-xs font-medium mb-1.5">Mute Request Alerts for Specific Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => {
                const muted = mutedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      setMutedCategories((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
                      )
                    }
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                      muted
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {muted ? `Muted: ${cat}` : cat}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Appearance & App Install */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold">Appearance &amp; Mobile Install</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Switch between Light and Dark campus themes or install UniLink as a web app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
          >
            Current: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'} (Switch)
          </button>
          <PWAInstallButton />
        </div>
      </section>

      {/* Blocked Users */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <h2 className="font-display text-base font-semibold">Blocked Members ({blockedUsers.length})</h2>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">You haven’t blocked anyone.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {blockedUsers.map((b) => (
              <div key={b.blocked_id} className="py-2 flex items-center justify-between text-xs">
                <span className="font-medium">{b.display_name}</span>
                <button
                  type="button"
                  onClick={() => handleUnblock(b.blocked_id)}
                  className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Account Deletion with Email OTP Confirmation */}
      <section className="rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-6 space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold text-rose-700 dark:text-rose-300">
              Delete Account
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {BRAND_CONFIG.privacyHighlights.deletedImmediately}{' '}
              {BRAND_CONFIG.privacyHighlights.retainedMinimum}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowDeleteModal(true);
            setDeleteStep('confirm');
            setDeleteOtp('');
          }}
          className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-xs font-medium text-white cursor-pointer"
        >
          Request Account Deletion
        </button>
      </section>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h3 className="font-display text-base font-semibold text-rose-600 dark:text-rose-400">
              Confirm Account Deletion
            </h3>

            {deleteStep === 'confirm' ? (
              <div className="mt-3 space-y-4 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  We will send a 6-digit verification code to <span className="font-mono font-semibold">{me.user.normalized_email}</span>.
                  After deletion, you may re-register later with the same verified email, starting with zero public jobs and zero reviews.
                </p>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Optional reason for leaving..."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleRequestDeleteOtp}
                    className="px-4 py-2 rounded-lg bg-rose-600 text-white font-medium cursor-pointer"
                  >
                    {deleting ? 'Sending Code...' : 'Send Deletion Code'}
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmDelete} className="mt-3 space-y-4 text-xs">
                {deletePreviewOtp && (
                  <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 p-3 text-emerald-900 dark:text-emerald-100">
                    Preview OTP Fallback: <span className="font-mono font-bold">{deletePreviewOtp}</span>
                  </div>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={deleteOtp}
                  onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit code"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-center font-mono text-lg tracking-widest"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deleting || deleteOtp.length !== 6}
                    className="px-4 py-2 rounded-lg bg-rose-600 text-white font-medium cursor-pointer"
                  >
                    {deleting ? 'Deleting...' : 'Permanently Delete Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
