import React, { useCallback, useEffect, useState } from 'react';
import { Check, MessageSquare, Plus, Send, UserMinus, X } from 'lucide-react';
import { apiFetch, formatRelativeTime } from '../lib/api.ts';
import { UserAvatar } from './UserAvatar.tsx';

interface ConnectionRow {
  id: string;
  requester_id: string;
  target_id: string;
  status: 'pending' | 'accepted';
  peer_id: string;
  display_name: string;
  avatar_url: string | null;
  semester: number | null;
  campus_name: string | null;
  department_name: string | null;
}

interface CommunityQuestion {
  id: string;
  author_id: string;
  author_name: string;
  author_campus: string | null;
  author_department: string | null;
  title: string;
  body: string;
  category: string;
  created_at: string;
  replies: Array<{
    id: string;
    author_name: string;
    author_department: string | null;
    body: string;
    created_at: string;
  }>;
}

interface ConnectionsCommunityViewProps {
  currentUserId: string;
  onViewProfile: (userId: string) => void;
  onOpenChat: (userId: string) => void;
  onToast: (msg: string) => void;
}

export const ConnectionsCommunityView: React.FC<ConnectionsCommunityViewProps> = ({
  currentUserId,
  onViewProfile,
  onOpenChat,
  onToast,
}) => {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [questions, setQuestions] = useState<CommunityQuestion[]>([]);
  const [qTitle, setQTitle] = useState('');
  const [qBody, setQBody] = useState('');
  const [qCat, setQCat] = useState('Academic Help');
  const [showAsk, setShowAsk] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    try {
      const [cRes, qRes] = await Promise.all([
        apiFetch<{ items: ConnectionRow[] }>('/api/connections'),
        apiFetch<{ items: CommunityQuestion[] }>('/api/community'),
      ]);
      setConnections(cRes.items);
      setQuestions(qRes.items);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load connections & Q&A.');
    }
  }, [onToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRespond = async (id: string, accept: boolean) => {
    await apiFetch(`/api/connections/${id}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
    onToast(accept ? 'Connection accepted.' : 'Connection declined.');
    loadAll();
  };

  const handleRemoveConnection = async (id: string) => {
    await apiFetch(`/api/connections/${id}`, { method: 'DELETE' });
    onToast('Connection removed.');
    loadAll();
  };

  const handlePostQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/community', {
        method: 'POST',
        body: JSON.stringify({ title: qTitle, body: qBody, category: qCat }),
      });
      setQTitle('');
      setQBody('');
      setShowAsk(false);
      onToast('Question posted to Campus Q&A.');
      loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to post question.');
    }
  };

  const handleReply = async (questionId: string) => {
    const body = (replyDrafts[questionId] || '').trim();
    if (!body) return;
    try {
      await apiFetch(`/api/community/${questionId}/replies`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      });
      setReplyDrafts((prev) => ({ ...prev, [questionId]: '' }));
      loadAll();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to post reply.');
    }
  };

  const incoming = connections.filter((c) => c.status === 'pending' && c.target_id === currentUserId);
  const accepted = connections.filter((c) => c.status === 'accepted');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Peer Connections */}
      <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div>
          <h2 className="font-display text-base font-semibold">Campus Connections</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Optional peer network for students you’ve worked or studied with.
          </p>
        </div>

        {incoming.length > 0 && (
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              Pending Requests ({incoming.length})
            </h3>
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar name={c.display_name} avatarUrl={c.avatar_url} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{c.display_name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{c.department_name || 'NUML'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleRespond(c.id, true)}
                    className="p-1.5 rounded-lg bg-emerald-600 text-white cursor-pointer"
                    aria-label="Accept"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(c.id, false)}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 cursor-pointer"
                    aria-label="Decline"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Connected Peers ({accepted.length})
          </h3>
          {accepted.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No connections yet. Send connection requests from Find People or student profiles.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {accepted.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onViewProfile(c.peer_id)}
                    className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                  >
                    <UserAvatar name={c.display_name} avatarUrl={c.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold hover:underline truncate">{c.display_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {c.department_name || 'NUML'} · {c.campus_name || 'Campus'}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenChat(c.peer_id)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer"
                      aria-label="Message"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveConnection(c.id)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 cursor-pointer"
                      aria-label="Remove connection"
                    >
                      <UserMinus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Right: Focused University Help Q&A */}
      <section className="lg:col-span-7 space-y-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold">Campus Help Q&amp;A</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quick academic or course advice. For deliverable work, use Create Request so reviews stay verified.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAsk((s) => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ask Question</span>
          </button>
        </div>

        {showAsk && (
          <form
            onSubmit={handlePostQuestion}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
          >
            <input
              type="text"
              required
              minLength={5}
              value={qTitle}
              onChange={(e) => setQTitle(e.target.value)}
              placeholder="Question title (e.g. Which OOP topics should I revise first?)"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <select
              value={qCat}
              onChange={(e) => setQCat(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
            >
              <option value="Academic Help">Academic Help</option>
              <option value="Programming & Technology">Programming &amp; Technology</option>
              <option value="Study Guidance">Study Guidance</option>
              <option value="Project Teammates">Project Teammates</option>
            </select>
            <textarea
              required
              minLength={10}
              rows={3}
              value={qBody}
              onChange={(e) => setQBody(e.target.value)}
              placeholder="Explain your question clearly..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAsk(false)} className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-lg cursor-pointer">
                Post Question
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {questions.map((q) => (
            <article
              key={q.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
            >
              <div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                  {q.category} · {formatRelativeTime(q.created_at)}
                </p>
                <h3 className="mt-1 font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {q.title}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Asked by {q.author_name} {q.author_department ? `· ${q.author_department}` : ''}
                </p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{q.body}</p>
              </div>

              {q.replies.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  {q.replies.map((r) => (
                    <div key={r.id} className="rounded-lg bg-slate-50 dark:bg-slate-950 p-2.5 text-xs">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {r.author_name} · <span className="font-normal text-slate-400">{formatRelativeTime(r.created_at)}</span>
                      </p>
                      <p className="mt-0.5 text-slate-600 dark:text-slate-300">{r.body}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={replyDrafts[q.id] || ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Write a helpful reply..."
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => handleReply(q.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Reply</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
