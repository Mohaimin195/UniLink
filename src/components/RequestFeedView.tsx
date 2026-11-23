import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Filter,
  Flag,
  MessageSquare,
  Search,
  Send,
  Star,
  X,
} from 'lucide-react';
import { apiFetch, formatRelativeTime, formatTimeRemaining } from '../lib/api.ts';
import type { OfferItem, PlatformMeta, RequestItem } from '../types/unilink.ts';
import type { ReportTarget } from './ReportModal.tsx';
import { UserAvatar } from './UserAvatar.tsx';

interface RequestFeedViewProps {
  meta: PlatformMeta;
  currentUserId: string;
  refreshSignal: number;
  initialOpenRequestId?: string | null;
  onClearInitialRequest?: () => void;
  onViewProfile: (userId: string) => void;
  onOpenChat: (targetUserId: string, requestId?: string) => void;
  onReport: (target: ReportTarget) => void;
  onToast: (msg: string) => void;
  onNavigateJobs: () => void;
}

export const RequestFeedView: React.FC<RequestFeedViewProps> = ({
  meta,
  currentUserId,
  refreshSignal,
  initialOpenRequestId,
  onClearInitialRequest,
  onViewProfile,
  onOpenChat,
  onReport,
  onToast,
  onNavigateJobs,
}) => {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [skillId, setSkillId] = useState('');
  const [campusId, setCampusId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [budgetType, setBudgetType] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Detail modal
  const [selectedRequest, setSelectedRequest] = useState<RequestItem | null>(null);
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Offer submission form
  const [offerMessage, setOfferMessage] = useState('');
  const [offerDelivery, setOfferDelivery] = useState('');
  const [offerAvailability, setOfferAvailability] = useState('');
  const [submittingOffer, setSubmittingOffer] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '10' });
      if (q.trim()) params.set('q', q.trim());
      if (category) params.set('category', category);
      if (skillId) params.set('skillId', skillId);
      if (campusId) params.set('campusId', campusId);
      if (departmentId) params.set('departmentId', departmentId);
      if (workMode) params.set('workMode', workMode);
      if (budgetType) params.set('budgetType', budgetType);

      const res = await apiFetch<{
        items: RequestItem[];
        total: number;
        totalPages: number;
      }>(`/api/requests?${params.toString()}`);
      setRequests(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load requests.');
    } finally {
      setLoading(false);
    }
  }, [page, q, category, skillId, campusId, departmentId, workMode, budgetType, onToast]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed, refreshSignal]);

  const openRequestDetail = useCallback(async (requestId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch<{ request: RequestItem; offers: OfferItem[] }>(`/api/requests/${requestId}`);
      setSelectedRequest(res.request);
      setOffers(res.offers);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not open request details.');
    } finally {
      setDetailLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    if (initialOpenRequestId) {
      openRequestDetail(initialOpenRequestId);
      onClearInitialRequest?.();
    }
  }, [initialOpenRequestId, openRequestDetail, onClearInitialRequest]);

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setSubmittingOffer(true);
    try {
      await apiFetch(`/api/requests/${selectedRequest.id}/offers`, {
        method: 'POST',
        body: JSON.stringify({
          message: offerMessage,
          estimatedDelivery: offerDelivery || undefined,
          availabilityNote: offerAvailability || undefined,
        }),
      });
      setOfferMessage('');
      setOfferDelivery('');
      setOfferAvailability('');
      onToast('Offer sent! The requester can now compare profiles and select a helper.');
      await openRequestDetail(selectedRequest.id);
      loadFeed();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Could not send offer.');
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (!selectedRequest) return;
    try {
      await apiFetch(`/api/offers/${offerId}/accept`, { method: 'POST' });
      onToast('Offer accepted! Request moved to Processing and chat conversation opened.');
      setSelectedRequest(null);
      loadFeed();
      onNavigateJobs();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to accept offer.');
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    try {
      await apiFetch(`/api/requests/${reqId}/cancel`, { method: 'POST' });
      onToast('Request cancelled and removed from the active feed.');
      setSelectedRequest(null);
      loadFeed();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to cancel request.');
    }
  };

  const clearFilters = () => {
    setQ('');
    setCategory('');
    setSkillId('');
    setCampusId('');
    setDepartmentId('');
    setWorkMode('');
    setBudgetType('');
    setPage(1);
  };

  const FilterControls = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        >
          <option value="">All Categories</option>
          {Array.from(new Set(meta.skills.map((s) => s.category))).map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Skill Tag</label>
        <select
          value={skillId}
          onChange={(e) => { setSkillId(e.target.value); setPage(1); }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        >
          <option value="">Any Skill</option>
          {meta.skills.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Campus</label>
        <select
          value={campusId}
          onChange={(e) => { setCampusId(e.target.value); setPage(1); }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        >
          <option value="">All NUML Campuses</option>
          {meta.campuses.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
        <select
          value={departmentId}
          onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
        >
          <option value="">All Departments</option>
          {meta.departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Work Mode</label>
          <select
            value={workMode}
            onChange={(e) => { setWorkMode(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
          >
            <option value="">Any</option>
            <option value="online">Online</option>
            <option value="in_person">On-Campus</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Budget</label>
          <select
            value={budgetType}
            onChange={(e) => { setBudgetType(e.target.value); setPage(1); }}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 text-xs"
          >
            <option value="">Any</option>
            <option value="paid">Paid</option>
            <option value="negotiable">Negotiable</option>
            <option value="free">Free</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={clearFilters}
        className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
      >
        Reset Filters
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Desktop Left Filter Column */}
      <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sticky top-24">
        <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50 mb-4">
          Filter Active Requests
        </h2>
        <FilterControls />
      </aside>

      {/* Main Feed Column */}
      <section className="lg:col-span-8 xl:col-span-9 space-y-4">
        {/* Search + Mobile Filter Trigger */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search help requests by title, skill, or topic..."
              className="w-full min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-10 pr-4 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
          <span className="tabular-nums">{total} active request{total === 1 ? '' : 's'} (24h window)</span>
          <span>Sorted by newest</span>
        </div>

        {/* Feed Cards */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="h-40 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse p-5"
              />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              No active requests match your current filters.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active requests stay in the feed for 24 hours. Try clearing filters or posting a new request.
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              Reset all filters
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((reqItem) => {
              const rem = formatTimeRemaining(reqItem.expires_at);
              const isMine = reqItem.owner_id === currentUserId;
              return (
                <article
                  key={reqItem.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openRequestDetail(reqItem.id)}
                        className="text-left font-display text-base font-semibold text-slate-900 dark:text-slate-50 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                      >
                        {reqItem.title}
                      </button>

                      {/* Clean unboxed metadata row (zero-pill discipline) */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <button
                          type="button"
                          onClick={() => onViewProfile(reqItem.owner_id)}
                          className="font-medium text-slate-700 dark:text-slate-300 hover:underline cursor-pointer"
                        >
                          {reqItem.owner_name}
                        </button>
                        {reqItem.owner_department && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{reqItem.owner_department}</span>
                          </>
                        )}
                        {reqItem.owner_semester && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>Semester {reqItem.owner_semester}</span>
                          </>
                        )}
                        {reqItem.owner_campus && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{reqItem.owner_campus}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-xs tabular-nums ${
                          rem.isUrgent
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {rem.label}
                      </span>
                      <p className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                        {formatRelativeTime(reqItem.created_at)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 line-clamp-2 leading-relaxed">
                    {reqItem.description}
                  </p>

                  {/* Skills & Budget as clean inline text */}
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                      <p>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{reqItem.category}:</span>{' '}
                        {reqItem.skills.map((s) => s.name).join(' · ')}
                      </p>
                      <p className="tabular-nums">
                        Mode: {reqItem.work_mode === 'in_person' ? 'On-Campus' : reqItem.work_mode === 'online' ? 'Online' : 'Either'}
                        {' · '}
                        Budget:{' '}
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {reqItem.budget_type === 'free'
                            ? 'Free / Mutual Help'
                            : reqItem.budget_amount || reqItem.budget_type}
                        </span>
                        {reqItem.preferred_gender !== 'any' && ` · Comfort pref: ${reqItem.preferred_gender}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mr-1">
                        {reqItem.offerCount} offer{reqItem.offerCount === 1 ? '' : 's'}
                      </span>
                      <button
                        type="button"
                        onClick={() => openRequestDetail(reqItem.id)}
                        className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {isMine ? 'Review Offers' : 'View & Offer Help'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onReport({ targetType: 'request', targetId: reqItem.id, label: reqItem.title })
                        }
                        aria-label="Report request"
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
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
            <span className="text-xs text-slate-500 tabular-nums">
              Page {page} of {totalPages}
            </span>
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
      </section>

      {/* Mobile Filters Bottom Sheet */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end">
          <div className="w-full rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-6 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-base">Filter Requests</h3>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <FilterControls />
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-indigo-600 text-sm font-medium text-white cursor-pointer"
            >
              Show Results
            </button>
          </div>
        </div>
      )}

      {/* Request Detail & Structured Public Offers Modal */}
      {(selectedRequest || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50 truncate">
                  {selectedRequest ? selectedRequest.title : 'Loading request...'}
                </h2>
                {selectedRequest && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Status: {selectedRequest.status} · {formatTimeRemaining(selectedRequest.expires_at).label}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                aria-label="Close detail"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {detailLoading || !selectedRequest ? (
              <div className="p-8 text-center text-sm text-slate-500">Loading request details...</div>
            ) : (
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRequest(null);
                        onViewProfile(selectedRequest.owner_id);
                      }}
                      className="flex items-center gap-3 text-left cursor-pointer"
                    >
                      <UserAvatar name={selectedRequest.owner_name} avatarUrl={selectedRequest.owner_avatar} size="md" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:underline">
                          {selectedRequest.owner_name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedRequest.owner_department || 'NUML'} · Sem {selectedRequest.owner_semester || '—'} ·{' '}
                          {selectedRequest.owner_campus || 'Campus'}
                        </p>
                      </div>
                    </button>
                    {selectedRequest.owner_id === currentUserId && selectedRequest.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => handleCancelRequest(selectedRequest.id)}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        Cancel Request
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line">
                    {selectedRequest.description}
                  </p>

                  <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                    <p>
                      <span className="font-semibold">Skills:</span> {selectedRequest.skills.map((s) => s.name).join(' · ')}
                    </p>
                    <p>
                      <span className="font-semibold">Target:</span>{' '}
                      {selectedRequest.targetAllCampuses ? 'All Campuses' : selectedRequest.targetCampuses.map((c) => c.name).join(', ')}
                      {' · '}
                      {selectedRequest.targetAllDepartments ? 'All Departments' : selectedRequest.targetDepartments.map((d) => d.name).join(', ')}
                      {(selectedRequest.min_semester || selectedRequest.max_semester) &&
                        ` · Sem ${selectedRequest.min_semester || 1}–${selectedRequest.max_semester || 8}`}
                    </p>
                    <p>
                      <span className="font-semibold">Budget &amp; Mode:</span>{' '}
                      {selectedRequest.budget_type === 'free'
                        ? 'Free / Mutual Help'
                        : `${selectedRequest.budget_type}${selectedRequest.budget_amount ? ` (${selectedRequest.budget_amount})` : ''}`}
                      {selectedRequest.preferred_payment_method ? ` · Preferred: ${selectedRequest.preferred_payment_method}` : ''}
                      {' · '}
                      {selectedRequest.work_mode}
                    </p>
                  </div>
                </div>

                {/* Public Structured Offers List */}
                <div className="space-y-3">
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Public Offers &amp; Interested Helpers ({offers.length})
                  </h3>

                  {offers.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      No offers yet. Be the first qualified student to offer help!
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {offers.map((offer) => {
                        const isOwner = selectedRequest.owner_id === currentUserId;
                        return (
                          <div
                            key={offer.id}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <UserAvatar name={offer.helper_name} avatarUrl={offer.helper_avatar} size="sm" />
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedRequest(null);
                                      onViewProfile(offer.helper_id);
                                    }}
                                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:underline truncate cursor-pointer"
                                  >
                                    {offer.helper_name}
                                  </button>
                                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {offer.helper_department || 'NUML'} · Sem {offer.helper_semester || '—'} ·{' '}
                                    {offer.helper_campus || 'Campus'}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right text-xs tabular-nums shrink-0">
                                <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-200">
                                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                  {offer.helperStats.averageRating !== null
                                    ? `${offer.helperStats.averageRating} (${offer.helperStats.verifiedReviews})`
                                    : 'New'}
                                </span>
                                <p className="text-[11px] text-slate-500">
                                  {offer.helperStats.completedJobs} completed job{offer.helperStats.completedJobs === 1 ? '' : 's'}
                                </p>
                              </div>
                            </div>

                            <p className="text-sm text-slate-700 dark:text-slate-300">{offer.message}</p>

                            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
                              {offer.estimated_delivery && <span>Delivery: {offer.estimated_delivery}</span>}
                              {offer.availability_note && <span>Availability: {offer.availability_note}</span>}
                              {offer.helperSkills.length > 0 && (
                                <span>Skills: {offer.helperSkills.slice(0, 4).map((s) => s.name).join(' · ')}</span>
                              )}
                            </div>

                            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequest(null);
                                    onViewProfile(offer.helper_id);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                  View Profile
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedRequest(null);
                                    onOpenChat(offer.helper_id, selectedRequest.id);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>Message</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onReport({
                                      targetType: 'offer',
                                      targetId: offer.id,
                                      label: `Offer by ${offer.helper_name}`,
                                    })
                                  }
                                  className="p-1.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                                  aria-label="Report offer"
                                >
                                  <Flag className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {isOwner && selectedRequest.status === 'active' && offer.status === 'pending' && (
                                <button
                                  type="button"
                                  onClick={() => handleAcceptOffer(offer.id)}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium text-white cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Accept Offer &amp; Start Job</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Offer Help Form (for non-owners when active) */}
                {selectedRequest.owner_id !== currentUserId && selectedRequest.status === 'active' && (
                  <form
                    onSubmit={handleSubmitOffer}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3"
                  >
                    <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Offer Help
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Describe your relevant experience and availability. Keep phone numbers and wallet IDs out of public offers.
                    </p>
                    <textarea
                      required
                      minLength={10}
                      maxLength={600}
                      rows={3}
                      value={offerMessage}
                      onChange={(e) => setOfferMessage(e.target.value)}
                      placeholder="e.g. I can help with this! I have done similar work for our department society..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={offerDelivery}
                        onChange={(e) => setOfferDelivery(e.target.value)}
                        placeholder="Estimated delivery (e.g. Within 24h)"
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                      <input
                        type="text"
                        value={offerAvailability}
                        onChange={(e) => setOfferAvailability(e.target.value)}
                        placeholder="Availability note (e.g. Today after 5 PM)"
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingOffer}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white disabled:opacity-50 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingOffer ? 'Sending Offer...' : 'Submit Public Offer'}</span>
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
