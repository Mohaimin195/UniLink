import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MessageSquare, PackageCheck, Star, X, XCircle } from 'lucide-react';
import { apiFetch, formatRelativeTime, formatTimeRemaining } from '../lib/api.ts';
import type { JobItem, RequestItem } from '../types/unilink.ts';

interface JobsWorkspaceViewProps {
  currentUserId: string;
  refreshSignal: number;
  onOpenChat: (targetUserId: string, requestId?: string) => void;
  onOpenRequest: (requestId: string) => void;
  onToast: (msg: string) => void;
}

export const JobsWorkspaceView: React.FC<JobsWorkspaceViewProps> = ({
  currentUserId,
  refreshSignal,
  onOpenChat,
  onOpenRequest,
  onToast,
}) => {
  const [tab, setTab] = useState<'jobs' | 'requests'>('jobs');
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [myRequests, setMyRequests] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Required rating modal for completing a job
  const [ratingJob, setRatingJob] = useState<JobItem | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [onTimeStars, setOnTimeStars] = useState<number>(5);
  const [submittingReview, setSubmittingReview] = useState(false);

  // Dispute modal
  const [disputeJob, setDisputeJob] = useState<JobItem | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [jobsRes, reqsRes] = await Promise.all([
        apiFetch<{ items: JobItem[] }>('/api/jobs'),
        apiFetch<{ items: RequestItem[] }>('/api/requests/mine'),
      ]);
      setJobs(jobsRes.items);
      setMyRequests(reqsRes.items);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load workspace.');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const handleDeliver = async (jobId: string) => {
    try {
      await apiFetch(`/api/jobs/${jobId}/deliver`, { method: 'POST' });
      onToast('Work marked as Delivered. Requester has been notified.');
      loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to mark delivered.');
    }
  };

  const handleCancelProcessing = async (job: JobItem) => {
    try {
      const res = await apiFetch<{ nextRequestStatus: 'active' | 'expired' }>(
        `/api/jobs/${job.id}/cancel-processing`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Cancelled during processing' }),
        },
      );
      onToast(
        res.nextRequestStatus === 'active'
          ? 'Job cancelled. Request returned to Active feed with its original remaining time.'
          : 'Job cancelled. Original 24h deadline passed, so request is now Expired.',
      );
      loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to cancel job.');
    }
  };

  const handleCompleteWithRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ratingJob) return;
    setSubmittingReview(true);
    try {
      await apiFetch(`/api/jobs/${ratingJob.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({
          rating: stars,
          comment: comment.trim() || undefined,
          onTimeRating: onTimeStars,
        }),
      });
      onToast('Job completed and verified review published!');
      setRatingJob(null);
      setComment('');
      setStars(5);
      loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to complete job.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeJob) return;
    try {
      await apiFetch(`/api/jobs/${disputeJob.id}/dispute`, {
        method: 'POST',
        body: JSON.stringify({ reason: disputeReason }),
      });
      onToast('Dispute opened and sent to campus moderation.');
      setDisputeJob(null);
      setDisputeReason('');
      loadData();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to submit dispute.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
        <button
          type="button"
          onClick={() => setTab('jobs')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            tab === 'jobs'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          Active &amp; Past Jobs ({jobs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
            tab === 'requests'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          My Posted Requests ({myRequests.length})
        </button>
      </div>

      {loading ? (
        <div className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : tab === 'jobs' ? (
        jobs.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">No jobs yet.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Jobs are created automatically when a requester accepts an offer on an active request.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => {
              const isRequester = job.requester_id === currentUserId;
              const counterpartId = isRequester ? job.helper_id : job.requester_id;
              const counterpartName = isRequester ? job.helper_name : job.requester_name;

              return (
                <article
                  key={job.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                        {job.request_title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Role: <span className="font-medium text-slate-700 dark:text-slate-300">{isRequester ? 'Requester' : 'Selected Helper'}</span>
                        {' · '}
                        With: <span className="font-medium text-slate-700 dark:text-slate-300">{counterpartName}</span>
                        {' · '}
                        Started {formatRelativeTime(job.accepted_at)}
                      </p>
                    </div>

                    <span
                      className={`text-xs font-semibold uppercase tracking-wide ${
                        job.status === 'completed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : job.status === 'disputed' || job.status === 'cancelled'
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {job.status}
                    </span>
                  </div>

                  {job.review_id && (
                    <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 px-3.5 py-2 text-xs text-emerald-900 dark:text-emerald-100">
                      <span className="font-semibold">Verified Review ({job.review_rating}/5):</span>{' '}
                      {job.review_comment || 'Rated without written comment.'}
                    </div>
                  )}

                  {job.dispute_reason && (
                    <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2 text-xs text-rose-800 dark:text-rose-200">
                      <span className="font-semibold">Dispute Note:</span> {job.dispute_reason}
                      {job.resolution_note && ` · Admin Resolution: ${job.resolution_note}`}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenChat(counterpartId, job.request_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open Chat</span>
                    </button>

                    {!isRequester && job.status === 'processing' && (
                      <button
                        type="button"
                        onClick={() => handleDeliver(job.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white cursor-pointer"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Mark Delivered / Ready for Review</span>
                      </button>
                    )}

                    {isRequester && (job.status === 'delivered' || job.status === 'processing') && (
                      <button
                        type="button"
                        onClick={() => setRatingJob(job)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium text-white cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Complete &amp; Rate Helper</span>
                      </button>
                    )}

                    {job.status === 'processing' && (
                      <button
                        type="button"
                        onClick={() => handleCancelProcessing(job)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{isRequester ? 'Cancel Selection' : 'Decline Job'}</span>
                      </button>
                    )}

                    {(job.status === 'processing' || job.status === 'delivered') && (
                      <button
                        type="button"
                        onClick={() => setDisputeJob(job)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Raise Dispute</span>
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : myRequests.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-sm font-medium">You haven’t posted any help requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {myRequests.map((r) => (
            <article
              key={r.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">{r.title}</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Status: <span className="font-semibold uppercase">{r.status}</span> · {r.offerCount} offer(s) ·{' '}
                  {r.status === 'active' ? formatTimeRemaining(r.expires_at).label : `Posted ${formatRelativeTime(r.created_at)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenRequest(r.id)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                View Request &amp; Offers
              </button>
            </article>
          ))}
        </div>
      )}

      {/* Mandatory Star Rating Modal for Job Completion */}
      {ratingJob && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold">Complete Job &amp; Rate Helper</h3>
              <button type="button" onClick={() => setRatingJob(null)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              A star rating for <span className="font-semibold">{ratingJob.helper_name}</span> is required to mark{' '}
              <span className="font-semibold">{ratingJob.request_title}</span> as Completed.
            </p>

            <form onSubmit={handleCompleteWithRating} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2">Overall Star Rating (Required) *</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStars(n)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          n <= stars ? 'text-amber-500 fill-amber-500' : 'text-slate-300 dark:text-slate-700'
                        }`}
                      />
                    </button>
                  ))}
                  <span className="ml-2 font-mono text-sm font-semibold tabular-nums">{stars} / 5</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">On-Time Delivery (Optional)</label>
                <select
                  value={onTimeStars}
                  onChange={(e) => setOnTimeStars(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
                >
                  <option value={5}>5 — Right on time</option>
                  <option value={4}>4 — Mostly on time</option>
                  <option value={3}>3 — Slightly delayed</option>
                  <option value={2}>2 — Late</option>
                  <option value={1}>1 — Very late</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Written Review (Optional)</label>
                <textarea
                  rows={3}
                  maxLength={800}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="How was working with this student? (optional)"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setRatingJob(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium text-white cursor-pointer"
                >
                  {submittingReview ? 'Submitting...' : 'Submit Rating & Complete Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeJob && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold">Raise Job Dispute</h3>
              <button type="button" onClick={() => setDisputeJob(null)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitDispute} className="space-y-4">
              <textarea
                required
                minLength={10}
                rows={4}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Explain what went wrong so an administrator can review..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setDisputeJob(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-medium cursor-pointer">
                  Submit Dispute
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
