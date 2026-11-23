import React, { useState } from 'react';
import { Info, Plus, ShieldCheck, X } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand.ts';
import { apiFetch } from '../lib/api.ts';
import type { PlatformMeta, Skill } from '../types/unilink.ts';

interface CreateRequestModalProps {
  open: boolean;
  meta: PlatformMeta;
  onClose: () => void;
  onCreated: (alertsDispatched: number) => void;
  onSkillAdded: (skill: Skill) => void;
}

const CATEGORIES = [
  'Programming & Technology',
  'Graphic Design & UI',
  'Video & Media',
  'Academic Help',
  'Writing & Communication',
  'Business & Other',
];

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({
  open,
  meta,
  onClose,
  onCreated,
  onSkillAdded,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [visibility, setVisibility] = useState<'university' | 'campus_only'>('university');
  const [targetAllCampuses, setTargetAllCampuses] = useState(true);
  const [targetCampusIds, setTargetCampusIds] = useState<string[]>([]);
  const [targetAllDepartments, setTargetAllDepartments] = useState(true);
  const [targetDepartmentIds, setTargetDepartmentIds] = useState<string[]>([]);
  const [minSemester, setMinSemester] = useState<string>('');
  const [maxSemester, setMaxSemester] = useState<string>('');
  const [preferredGender, setPreferredGender] = useState<'any' | 'male' | 'female'>('any');
  const [workMode, setWorkMode] = useState<'online' | 'in_person' | 'either'>('either');
  const [deadlineText, setDeadlineText] = useState('');
  const [budgetType, setBudgetType] = useState<'free' | 'paid' | 'negotiable'>('negotiable');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState('');
  const [additionalRequirements, setAdditionalRequirements] = useState('');

  const [suggestName, setSuggestName] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const toggleArr = (arr: string[], id: string, max = 8) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : arr.length < max ? [...arr, id] : arr;

  const handleSuggestSkill = async () => {
    if (!suggestName.trim()) return;
    setSuggesting(true);
    try {
      const res = await apiFetch<{ skill: Skill }>('/api/skills/suggest', {
        method: 'POST',
        body: JSON.stringify({ name: suggestName.trim(), category }),
      });
      onSkillAdded(res.skill);
      setSelectedSkillIds((prev) => (prev.includes(res.skill.id) ? prev : [...prev, res.skill.id]));
      setSuggestName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add skill tag.');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSkillIds.length === 0) {
      setError('Select at least one skill tag so matching students receive an alert.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{ id: string; alertsDispatched: number }>('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          category,
          skillIds: selectedSkillIds,
          visibility,
          targetAllCampuses,
          targetCampusIds: targetAllCampuses ? [] : targetCampusIds,
          targetAllDepartments,
          targetDepartmentIds: targetAllDepartments ? [] : targetDepartmentIds,
          minSemester: minSemester ? Number(minSemester) : null,
          maxSemester: maxSemester ? Number(maxSemester) : null,
          preferredGender,
          workMode,
          deadlineText: deadlineText || null,
          budgetType,
          budgetAmount: budgetType === 'free' ? null : budgetAmount || null,
          preferredPaymentMethod: budgetType === 'free' ? null : preferredPaymentMethod || null,
          additionalRequirements: additionalRequirements || null,
        }),
      });
      setTitle('');
      setDescription('');
      setSelectedSkillIds([]);
      setBudgetAmount('');
      setAdditionalRequirements('');
      onCreated(res.alertsDispatched);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
              Create Help Request
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visible in the active feed for {meta.settings.request_expiry_hours || '24'} hours · Alerts stay in matched inboxes for {meta.settings.alert_expiry_hours || '12'} hours
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Academic integrity & payment notice */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{BRAND_CONFIG.academicIntegrityNotice}</span>
            </div>
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <span>{BRAND_CONFIG.directPaymentDisclaimer}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Short Title *
              </label>
              <input
                type="text"
                required
                minLength={5}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Need a Video Editor for 2-minute society recap"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Main Category *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Who Can See &amp; Respond
              </label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'university' | 'campus_only')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="university">All verified NUML members</option>
                <option value="campus_only">Members at my campus only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description *
            </label>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what help you need, scope, and timeline without posting private phone numbers or wallet IDs..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Skill Tags */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Required Skill Tags * ({selectedSkillIds.length}/8)
              </label>
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex flex-wrap gap-1.5">
              {meta.skills.map((s) => {
                const active = selectedSkillIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSkillIds((prev) => toggleArr(prev, s.id, 8))}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={suggestName}
                onChange={(e) => setSuggestName(e.target.value)}
                placeholder="Missing a skill tag? Suggest one..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                disabled={suggesting || !suggestName.trim()}
                onClick={handleSuggestSkill}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Tag</span>
              </button>
            </div>
          </div>

          {/* Targeting: Campuses, Departments, Semesters */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Helper Targeting &amp; Match Filters
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <input
                    type="checkbox"
                    checked={targetAllCampuses}
                    onChange={(e) => setTargetAllCampuses(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Any NUML Campus
                </label>
                {!targetAllCampuses && (
                  <div className="max-h-28 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-wrap gap-1">
                    {meta.campuses.map((c) => {
                      const active = targetCampusIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setTargetCampusIds((p) => toggleArr(p, c.id, 9))}
                          className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                            active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {c.city}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  <input
                    type="checkbox"
                    checked={targetAllDepartments}
                    onChange={(e) => setTargetAllDepartments(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600"
                  />
                  Any Department
                </label>
                {!targetAllDepartments && (
                  <div className="max-h-28 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg p-2 flex flex-wrap gap-1">
                    {meta.departments.map((d) => {
                      const active = targetDepartmentIds.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setTargetDepartmentIds((p) => toggleArr(p, d.id, 12))}
                          className={`px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                            active ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {d.code}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Min Semester</label>
                <select
                  value={minSemester}
                  onChange={(e) => setMinSemester(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="">Any</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Sem {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Max Semester</label>
                <select
                  value={maxSemester}
                  onChange={(e) => setMaxSemester(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="">Any</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                    <option key={s} value={s}>Sem {s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Work Mode</label>
                <select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value as 'online' | 'in_person' | 'either')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="either">Either</option>
                  <option value="online">Online</option>
                  <option value="in_person">On-Campus</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">Helper Comfort</label>
                <select
                  value={preferredGender}
                  onChange={(e) => setPreferredGender(e.target.value as 'any' | 'male' | 'female')}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs"
                >
                  <option value="any">Any (Default)</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
            </div>
          </div>

          {/* Budget & Deadline */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Budget Type</label>
              <select
                value={budgetType}
                onChange={(e) => setBudgetType(e.target.value as 'free' | 'paid' | 'negotiable')}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              >
                <option value="negotiable">Negotiable</option>
                <option value="paid">Paid</option>
                <option value="free">Free / Mutual Help</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Budget Range (Optional)</label>
              <input
                type="text"
                disabled={budgetType === 'free'}
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="e.g. Rs. 1,500"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Deadline (Optional)</label>
              <input
                type="text"
                value={deadlineText}
                onChange={(e) => setDeadlineText(e.target.value)}
                placeholder="e.g. Tomorrow 6 PM"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {budgetType !== 'free' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Preferred Payment Method (Optional)
                </label>
                <select
                  value={preferredPaymentMethod}
                  onChange={(e) => setPreferredPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="">Any method</option>
                  <option value="Easypaisa">Easypaisa</option>
                  <option value="JazzCash">JazzCash</option>
                  <option value="NayaPay">NayaPay</option>
                  <option value="Bank transfer">Bank transfer</option>
                  <option value="Cash / in person">Cash / in person</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Additional Requirements (Optional)
                </label>
                <input
                  type="text"
                  value={additionalRequirements}
                  onChange={(e) => setAdditionalRequirements(e.target.value)}
                  placeholder="Software version, campus block, etc."
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Publishing...' : 'Publish 24h Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
