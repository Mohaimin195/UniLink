import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { apiFetch, formatRelativeTime } from '../lib/api.ts';
import type { PlatformMeta } from '../types/unilink.ts';

interface AdminDashboardViewProps {
  meta: PlatformMeta;
  onMetaUpdated: () => void;
  onToast: (msg: string) => void;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  meta,
  onMetaUpdated,
  onToast,
}) => {
  const [tab, setTab] = useState<'overview' | 'users' | 'reports' | 'requests' | 'catalog' | 'audit'>('overview');
  const [overview, setOverview] = useState<{
    metrics: Record<string, number>;
    suspiciousFlags: Array<{ type: string; severity: string; summary: string; targetId: string; details: string }>;
  } | null>(null);
  const [users, setUsers] = useState<Array<Record<string, unknown>>>([]);
  const [userSearch, setUserSearch] = useState('');
  const [reports, setReports] = useState<Array<Record<string, unknown>>>([]);
  const [disputes, setDisputes] = useState<Array<Record<string, unknown>>>([]);
  const [requests, setRequests] = useState<Array<Record<string, unknown>>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);

  // Catalog config states
  const [domainsInput, setDomainsInput] = useState(meta.approvedDomains.join(', '));
  const [newCampusName, setNewCampusName] = useState('');
  const [newCampusCity, setNewCampusCity] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] = useState('Programming & Technology');
  const [reqHours, setReqHours] = useState(Number(meta.settings.request_expiry_hours || 24));
  const [alertHours, setAlertHours] = useState(Number(meta.settings.alert_expiry_hours || 12));

  const loadOverview = useCallback(async () => {
    try {
      const [ov, rep, disp] = await Promise.all([
        apiFetch<typeof overview>('/api/admin/overview'),
        apiFetch<{ items: Array<Record<string, unknown>> }>('/api/admin/reports'),
        apiFetch<{ items: Array<Record<string, unknown>> }>('/api/admin/jobs/disputes'),
      ]);
      setOverview(ov);
      setReports(rep.items);
      setDisputes(disp.items);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load admin overview.');
    }
  }, [onToast]);

  const loadUsers = useCallback(async () => {
    const res = await apiFetch<{ items: Array<Record<string, unknown>> }>(
      `/api/admin/users?q=${encodeURIComponent(userSearch)}`,
    );
    setUsers(res.items);
  }, [userSearch]);

  const loadRequests = useCallback(async () => {
    const res = await apiFetch<{ items: Array<Record<string, unknown>> }>('/api/admin/requests');
    setRequests(res.items);
  }, []);

  const loadAudit = useCallback(async () => {
    const res = await apiFetch<{ items: Array<Record<string, unknown>> }>('/api/admin/audit-logs');
    setAuditLogs(res.items);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    if (tab === 'requests') loadRequests();
    if (tab === 'audit') loadAudit();
  }, [tab, loadUsers, loadRequests, loadAudit]);

  const handleToggleUserStatus = async (userId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'suspended' ? 'active' : 'suspended';
    await apiFetch(`/api/admin/users/${userId}/status`, {
      method: 'POST',
      body: JSON.stringify({
        status: nextStatus,
        reason: nextStatus === 'suspended' ? 'Policy review suspension' : 'Moderation clearance restored',
      }),
    });
    onToast(`User status updated to ${nextStatus}.`);
    loadUsers();
    loadOverview();
  };

  const handleResolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
    await apiFetch(`/api/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        status,
        resolution: status === 'resolved' ? 'Reviewed and actioned by admin' : 'Reviewed; no violation found',
      }),
    });
    onToast(`Report marked ${status}.`);
    loadOverview();
  };

  const handleResolveDispute = async (jobId: string, outcome: 'completed_without_auto_rating' | 'cancelled') => {
    await apiFetch(`/api/admin/jobs/${jobId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        outcome,
        note: `Dispute resolved by admin (${outcome})`,
      }),
    });
    onToast('Dispute resolved and logged.');
    loadOverview();
  };

  const handleRemoveRequest = async (reqId: string) => {
    await apiFetch(`/api/admin/requests/${reqId}/remove`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Removed by campus moderation' }),
    });
    onToast('Request removed.');
    loadRequests();
    loadOverview();
  };

  const handleSaveDomains = async () => {
    const domains = domainsInput.split(',').map((s) => s.trim()).filter(Boolean);
    await apiFetch('/api/admin/domains', {
      method: 'PUT',
      body: JSON.stringify({ domains }),
    });
    onToast('Approved university email domains updated.');
    onMetaUpdated();
  };

  const handleSaveSettings = async () => {
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ requestExpiryHours: reqHours, alertExpiryHours: alertHours }),
    });
    onToast('Expiry durations updated.');
    onMetaUpdated();
  };

  const handleClearDemoData = async () => {
    await apiFetch('/api/admin/demo-data/clear', { method: 'POST' });
    onToast('Sample demo users and requests removed.');
    loadOverview();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800/80">
        {(['overview', 'reports', 'users', 'requests', 'catalog', 'audit'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer ${
              tab === t
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 tabular-nums">
            {Object.entries(overview.metrics).map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1')}</p>
                <p className="mt-1 font-mono text-2xl font-bold">{v}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="font-display text-sm font-semibold">Suspicious Reputation &amp; Abuse Flags</h2>
              </div>
              {overview.metrics.demoRecords > 0 && (
                <button
                  type="button"
                  onClick={handleClearDemoData}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-xs font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Demo Records</span>
                </button>
              )}
            </div>
            {overview.suspiciousFlags.length === 0 ? (
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                No suspicious hiring or reregistration flags detected.
              </p>
            ) : (
              <div className="space-y-2">
                {overview.suspiciousFlags.map((f, i) => (
                  <div key={i} className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 p-3 text-xs">
                    <p className="font-semibold text-amber-900 dark:text-amber-200">{f.summary}</p>
                    <p className="text-amber-800 dark:text-amber-300 mt-0.5">{f.details}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'reports' && (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold">Moderation Reports Queue ({reports.length})</h2>
            {reports.length === 0 ? (
              <p className="text-xs text-slate-500">No reports filed.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.map((r) => (
                  <div key={String(r.id)} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        [{String(r.target_type)}] {String(r.reason)} ·{' '}
                        <span className="uppercase font-mono">{String(r.status)}</span>
                      </p>
                      <p className="text-slate-500">
                        Reported by {String(r.reporter_name)} · {formatRelativeTime(String(r.created_at))}
                      </p>
                      {Boolean(r.details) && <p className="mt-1 text-slate-700 dark:text-slate-300">{String(r.details)}</p>}
                    </div>
                    {r.status === 'open' && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleResolveReport(String(r.id), 'resolved')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-medium cursor-pointer"
                        >
                          Resolve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveReport(String(r.id), 'dismissed')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold">Disputed Jobs ({disputes.length})</h2>
            {disputes.length === 0 ? (
              <p className="text-xs text-slate-500">No active job disputes.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {disputes.map((d) => (
                  <div key={String(d.id)} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold">{String(d.request_title)}</p>
                      <p className="text-slate-500">
                        {String(d.requester_name)} ↔ {String(d.helper_name)} · Reason: {String(d.dispute_reason)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleResolveDispute(String(d.id), 'completed_without_auto_rating')}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white cursor-pointer"
                      >
                        Close After Review
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveDispute(String(d.id), 'cancelled')}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 cursor-pointer"
                      >
                        Cancel Job
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'users' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-sm font-semibold">User Accounts</h2>
            <input
              type="search"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search name or email..."
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs w-64"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Campus / Dept</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={String(u.id)}>
                    <td className="py-2.5 pr-3 font-medium">
                      {String(u.display_name || 'Pending')} {u.is_demo ? '(Demo)' : ''}
                    </td>
                    <td className="py-2.5 pr-3 font-mono">{String(u.normalized_email)}</td>
                    <td className="py-2.5 pr-3">{String(u.campus_name || '—')} / {String(u.department_name || '—')}</td>
                    <td className="py-2.5 pr-3 uppercase font-mono">{String(u.account_status)}</td>
                    <td className="py-2.5 text-right">
                      {u.account_status !== 'deleted' && u.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => handleToggleUserStatus(String(u.id), String(u.account_status))}
                          className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-medium cursor-pointer"
                        >
                          {u.account_status === 'suspended' ? 'Restore' : 'Suspend'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'requests' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold">All Requests by Status</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {requests.map((r) => (
              <div key={String(r.id)} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-semibold">{String(r.title)}</p>
                  <p className="text-slate-500">
                    {String(r.owner_name)} · {String(r.category)} · Status: <span className="uppercase font-mono">{String(r.status)}</span>
                  </p>
                </div>
                {r.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveRequest(String(r.id))}
                    className="px-3 py-1 rounded border border-rose-200 text-rose-600 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'catalog' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-display text-sm font-semibold">Approved University Email Domains</h2>
            <input
              type="text"
              value={domainsInput}
              onChange={(e) => setDomainsInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleSaveDomains}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Domains</span>
            </button>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <h3 className="text-xs font-semibold">Lifetime Durations (Hours)</h3>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block mb-1 text-slate-500">Request Feed (h)</label>
                  <input
                    type="number"
                    min={1}
                    max={72}
                    value={reqHours}
                    onChange={(e) => setReqHours(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-slate-500">Alert Inbox (h)</label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    value={alertHours}
                    onChange={(e) => setAlertHours(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleSaveSettings}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Update Durations
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="font-display text-sm font-semibold">Add Campus, Department, or Skill Tag</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={newCampusName}
                onChange={(e) => setNewCampusName(e.target.value)}
                placeholder="Campus Name"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={newCampusCity}
                onChange={(e) => setNewCampusCity(e.target.value)}
                placeholder="City"
                className="w-24 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newCampusName || !newCampusCity) return;
                  await apiFetch('/api/admin/campuses', {
                    method: 'POST',
                    body: JSON.stringify({ name: newCampusName, city: newCampusCity }),
                  });
                  setNewCampusName('');
                  setNewCampusCity('');
                  onMetaUpdated();
                  onToast('Campus added.');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Department Name"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={newDeptCode}
                onChange={(e) => setNewDeptCode(e.target.value)}
                placeholder="Code"
                className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!newDeptName || !newDeptCode) return;
                  await apiFetch('/api/admin/departments', {
                    method: 'POST',
                    body: JSON.stringify({ name: newDeptName, code: newDeptCode }),
                  });
                  setNewDeptName('');
                  setNewDeptCode('');
                  onMetaUpdated();
                  onToast('Department added.');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newSkillName}
                onChange={(e) => setNewSkillName(e.target.value)}
                placeholder="Skill Tag Name"
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs"
              />
              <select
                value={newSkillCategory}
                onChange={(e) => setNewSkillCategory(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs"
              >
                <option value="Programming & Technology">Programming</option>
                <option value="Graphic Design & UI">Design</option>
                <option value="Video & Media">Media</option>
                <option value="Academic Help">Academic</option>
                <option value="Writing & Communication">Writing</option>
                <option value="Business & Other">Business</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!newSkillName) return;
                  await apiFetch('/api/admin/skills', {
                    method: 'POST',
                    body: JSON.stringify({ name: newSkillName, category: newSkillCategory }),
                  });
                  setNewSkillName('');
                  onMetaUpdated();
                  onToast('Skill tag added.');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </section>
        </div>
      )}

      {tab === 'audit' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold">Admin Audit Logs</h2>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs tabular-nums">
            {auditLogs.map((log) => (
              <div key={String(log.id)} className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {String(log.action)}
                  </span>{' '}
                  · {String(log.target_type)} ({String(log.target_id)})
                  <p className="text-slate-500 mt-0.5">
                    By {String(log.admin_name || log.admin_id)} — {String(log.reason)}
                  </p>
                </div>
                <span className="text-slate-400 shrink-0">{formatRelativeTime(String(log.created_at))}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
