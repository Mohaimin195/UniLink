import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Check, Clock, ExternalLink, X, Zap } from 'lucide-react';
import { apiFetch, formatRelativeTime, formatTimeRemaining } from '../lib/api.ts';

interface RequestAlertRow {
  id: string;
  request_id: string;
  sent_at: string;
  expires_at: string;
  read_at: string | null;
  title: string;
  category: string;
  budget_type: string;
  budget_amount: string | null;
  work_mode: string;
  request_status: string;
  request_expires_at: string;
  owner_name: string;
  owner_campus: string | null;
  owner_department: string | null;
  owner_semester: number | null;
  skills: Array<{ id: string; name: string }>;
}

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  link_target: string | null;
  is_read: number;
  created_at: string;
}

interface AlertsAndNotificationsViewProps {
  mode: 'alerts' | 'notifications';
  signal: number;
  onOpenRequest: (requestId: string) => void;
  onNavigateJobs: () => void;
  onNavigateMessages: () => void;
  onRefreshUnread: () => void;
  onToast: (msg: string) => void;
}

export const AlertsAndNotificationsView: React.FC<AlertsAndNotificationsViewProps> = ({
  mode,
  signal,
  onOpenRequest,
  onNavigateJobs,
  onNavigateMessages,
  onRefreshUnread,
  onToast,
}) => {
  const [alerts, setAlerts] = useState<RequestAlertRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'alerts') {
        const res = await apiFetch<{ items: RequestAlertRow[] }>('/api/alerts');
        setAlerts(res.items);
      } else {
        const res = await apiFetch<{ items: NotificationRow[] }>('/api/notifications');
        setNotifications(res.items);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load inbox.');
    } finally {
      setLoading(false);
    }
  }, [mode, onToast]);

  useEffect(() => {
    load();
  }, [load, signal]);

  const handleOpenAlert = async (alert: RequestAlertRow) => {
    await apiFetch(`/api/alerts/${alert.id}/read`, { method: 'POST' }).catch(() => {});
    onRefreshUnread();
    onOpenRequest(alert.request_id);
  };

  const handleDismissAlert = async (id: string) => {
    await apiFetch(`/api/alerts/${id}/dismiss`, { method: 'POST' });
    onRefreshUnread();
    load();
  };

  const handleMarkAllNotifsRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    onRefreshUnread();
    load();
  };

  if (mode === 'alerts') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-start gap-3 text-xs text-slate-600 dark:text-slate-300">
          <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <p>
            Matched request alerts stay in this inbox for <span className="font-semibold">12 hours</span> and then expire automatically to keep alerts fresh. Expiring an alert here does not delete the underlying 24-hour request from the public feed.
          </p>
        </div>

        {loading ? (
          <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
            <p className="text-sm font-medium">No active matched request alerts.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              When a student posts a request matching your skills, campus, department, and preferences, one deduplicated alert appears here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((a) => {
              const alertRem = formatTimeRemaining(a.expires_at);
              return (
                <article
                  key={a.id}
                  className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    a.read_at
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      : 'border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/30 dark:bg-indigo-950/20'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">{a.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-amber-600 dark:text-amber-400 tabular-nums inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Alert expires in {alertRem.label}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">{a.title}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {a.owner_name} · {a.owner_department || 'NUML'} · Sem {a.owner_semester || '—'} ·{' '}
                      {a.owner_campus || 'Campus'}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Skills: {a.skills.map((s) => s.name).join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenAlert(a)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-medium text-white cursor-pointer"
                    >
                      <span>Open Request</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissAlert(a.id)}
                      aria-label="Dismiss alert"
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Important job, message, connection, and security notices (retained independently of 12-hour request alerts).
        </p>
        {notifications.some((n) => !n.is_read) && (
          <button
            type="button"
            onClick={handleMarkAllNotifsRead}
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="h-36 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <Bell className="w-6 h-6 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium">No notifications yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex items-start justify-between gap-4 ${
                n.is_read ? '' : 'bg-indigo-50/40 dark:bg-indigo-950/20'
              }`}
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-400 tabular-nums">{formatRelativeTime(n.created_at)}</p>
              </div>
              {n.link_target && (
                <button
                  type="button"
                  onClick={() => {
                    if (n.link_target?.startsWith('request:')) {
                      onOpenRequest(n.link_target.replace('request:', ''));
                    } else if (n.link_target?.startsWith('job:')) {
                      onNavigateJobs();
                    } else if (n.link_target?.startsWith('conversation:')) {
                      onNavigateMessages();
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium shrink-0 cursor-pointer"
                >
                  Open
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
