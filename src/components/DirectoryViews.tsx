import React, { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Search, Star, User as UserIcon } from 'lucide-react';
import { apiFetch, formatRelativeTime } from '../lib/api.ts';
import type { DirectoryUser, PlatformMeta } from '../types/unilink.ts';
import { UserAvatar } from './UserAvatar.tsx';

interface DirectoryViewsProps {
  mode: 'people' | 'services';
  meta: PlatformMeta;
  onViewProfile: (userId: string) => void;
  onOpenChat: (userId: string) => void;
  onToast: (msg: string) => void;
}

export const DirectoryViews: React.FC<DirectoryViewsProps> = ({
  mode,
  meta,
  onViewProfile,
  onOpenChat,
  onToast,
}) => {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [gender, setGender] = useState('');
  const [minSem, setMinSem] = useState('');
  const [maxSem, setMaxSem] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const categories = Array.from(new Set(meta.skills.map((s) => s.category)));

  const loadDirectory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '12',
      });
      if (mode === 'services') params.set('offeringOnly', 'true');
      if (q.trim()) params.set('q', q.trim());
      if (selectedCategory) params.set('category', selectedCategory);
      if (selectedSkillId) params.set('skillId', selectedSkillId);
      if (campusId) params.set('campusId', campusId);
      if (departmentId) params.set('departmentId', departmentId);
      if (workMode) params.set('workMode', workMode);
      if (gender) params.set('gender', gender);
      if (minSem) params.set('minSemester', minSem);
      if (maxSem) params.set('maxSemester', maxSem);

      const res = await apiFetch<{ items: DirectoryUser[]; totalPages: number }>(`/api/users?${params.toString()}`);
      setUsers(res.items);
      setTotalPages(res.totalPages);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load directory.');
    } finally {
      setLoading(false);
    }
  }, [mode, page, q, selectedCategory, selectedSkillId, campusId, departmentId, workMode, gender, minSem, maxSem, onToast]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  return (
    <div className="space-y-6">
      {/* Services Category Browser when in Services/Skills mode */}
      {mode === 'services' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                Browse Skills &amp; Peer Services
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Select a category or canonical skill tag to find verified NUML peers offering help.
              </p>
            </div>
            {(selectedCategory || selectedSkillId) && (
              <button
                type="button"
                onClick={() => { setSelectedCategory(''); setSelectedSkillId(''); setPage(1); }}
                className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Show all skills
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setSelectedCategory(selectedCategory === cat ? '' : cat);
                  setSelectedSkillId('');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            {meta.skills
              .filter((s) => !selectedCategory || s.category === selectedCategory)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedSkillId(selectedSkillId === s.id ? '' : s.id);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                    selectedSkillId === s.id
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {s.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Search & Filters Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search by name, skill tag, or bio..."
              className="w-full min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-9 pr-3 text-sm"
            />
          </div>

          <select
            value={campusId}
            onChange={(e) => { setCampusId(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="">All Campuses</option>
            {meta.campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
          >
            <option value="">All Departments</option>
            {meta.departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          <select
            value={selectedSkillId}
            onChange={(e) => { setSelectedSkillId(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
          >
            <option value="">Any Skill Tag</option>
            {meta.skills.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={workMode}
            onChange={(e) => { setWorkMode(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
          >
            <option value="">Any Work Mode</option>
            <option value="online">Online</option>
            <option value="in_person">On-Campus</option>
          </select>

          <select
            value={minSem}
            onChange={(e) => { setMinSem(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
          >
            <option value="">Min Sem: Any</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>From Sem {s}</option>
            ))}
          </select>

          <select
            value={maxSem}
            onChange={(e) => { setMaxSem(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
          >
            <option value="">Max Sem: Any</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>To Sem {s}</option>
            ))}
          </select>

          <select
            value={gender}
            onChange={(e) => { setGender(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs"
          >
            <option value="">Comfort Pref: Any</option>
            <option value="male">Opted-in Male</option>
            <option value="female">Opted-in Female</option>
          </select>
        </div>
      </div>

      {/* Results Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((k) => (
            <div key={k} className="h-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No verified students match these filters.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Try broadening campus, semester range, or skill filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map((u) => (
            <article
              key={u.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UserAvatar name={u.displayName} avatarUrl={u.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onViewProfile(u.id)}
                        className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block cursor-pointer"
                      >
                        {u.displayName}
                      </button>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {u.departmentName || 'NUML'} · Sem {u.semester || '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{u.campusName || 'Campus'}</p>
                    </div>
                  </div>

                  <div className="text-right shrink-0 tabular-nums text-xs">
                    {u.stats.averageRating !== null ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        {u.stats.averageRating}
                      </span>
                    ) : (
                      <span className="text-slate-400">No reviews</span>
                    )}
                    <p className="text-[11px] text-slate-500">{u.stats.completedJobs} jobs</p>
                  </div>
                </div>

                {u.bio && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">{u.bio}</p>
                )}

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Skills:</span>{' '}
                  {u.skills.length > 0 ? u.skills.slice(0, 5).map((s) => s.name).join(' · ') : 'General student member'}
                </p>

                <p className="text-[11px] text-slate-400">
                  {u.isOnline === true
                    ? 'Online now'
                    : u.lastActiveAt
                    ? `Active ${formatRelativeTime(u.lastActiveAt)}`
                    : 'Status hidden'}
                  {' · '}
                  {u.workMode === 'in_person' ? 'On-Campus' : u.workMode === 'online' ? 'Online' : 'Online / On-Campus'}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onViewProfile(u.id)}
                  className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>View Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChat(u.id)}
                  className="flex-1 min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Message</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 cursor-pointer"
          >
            Previous
          </button>
          <span className="text-xs text-slate-500 tabular-nums">Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium disabled:opacity-40 cursor-pointer"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
