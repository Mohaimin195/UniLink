import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ban, BellOff, Flag, Paperclip, Send, Volume2 } from 'lucide-react';
import { apiFetch, formatRelativeTime, isSafeHttpUrl, uploadAttachment } from '../lib/api.ts';
import type { ReportTarget } from './ReportModal.tsx';
import { UserAvatar } from './UserAvatar.tsx';

interface ConversationItem {
  id: string;
  requestId: string | null;
  requestTitle: string | null;
  jobId: string | null;
  jobStatus: string | null;
  isMuted: boolean;
  isBlocked: boolean;
  updatedAt: string;
  unreadCount: number;
  lastMessage: { content: string; sent_at: string; attachment_name: string | null } | null;
  peer: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    campusName: string | null;
    departmentName: string | null;
    isOnline: boolean | null;
    lastActiveAt: string | null;
  } | null;
}

interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  sent_at: string;
  read_at: string | null;
}

interface MessagesViewProps {
  currentUserId: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  wsSignal: number;
  onViewProfile: (userId: string) => void;
  onReport: (target: ReportTarget) => void;
  onToast: (msg: string) => void;
  onRefreshUnread: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  wsSignal,
  onViewProfile,
  onReport,
  onToast,
  onRefreshUnread,
}) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState<{ url: string; name: string; mime: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: ConversationItem[] }>('/api/conversations');
      setConversations(res.items);
      if (!selectedConversationId && res.items.length > 0) {
        onSelectConversation(res.items[0].id);
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load conversations.');
    }
  }, [selectedConversationId, onSelectConversation, onToast]);

  const loadMessages = useCallback(async (convoId: string) => {
    try {
      const res = await apiFetch<{ items: MessageItem[] }>(`/api/conversations/${convoId}/messages`);
      setMessages(res.items);
      onRefreshUnread();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to load messages.');
    }
  }, [onRefreshUnread, onToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations, wsSignal]);

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
    }
  }, [selectedConversationId, wsSignal, loadMessages]);

  const activeConvo = conversations.find((c) => c.id === selectedConversationId) || null;

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadAttachment(file);
      setAttachment(up);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Attachment upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConvo || (!text.trim() && !attachment)) return;
    setSending(true);
    try {
      const res = await apiFetch<{ message: MessageItem }>(`/api/conversations/${activeConvo.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: text.trim(),
          attachmentUrl: attachment?.url || null,
          attachmentName: attachment?.name || null,
          attachmentMime: attachment?.mime || null,
          attachmentSize: attachment?.size || null,
        }),
      });
      setMessages((prev) => (prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]));
      setText('');
      setAttachment(null);
      loadConversations();
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 40);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const handleToggleMute = async () => {
    if (!activeConvo) return;
    try {
      const res = await apiFetch<{ isMuted: boolean }>(`/api/conversations/${activeConvo.id}/mute`, {
        method: 'POST',
      });
      onToast(res.isMuted ? 'Conversation muted.' : 'Conversation unmuted.');
      loadConversations();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to update mute preference.');
    }
  };

  const handleBlockPeer = async () => {
    if (!activeConvo?.peer) return;
    try {
      await apiFetch('/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ blockedUserId: activeConvo.peer.id }),
      });
      onToast(`${activeConvo.peer.displayName} has been blocked.`);
      loadConversations();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Unable to block user.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[560px] max-h-[76vh]">
      {/* Conversations List */}
      <aside className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 overflow-y-auto">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-50">
            Conversations ({conversations.length})
          </h2>
        </div>
        {conversations.length === 0 ? (
          <p className="p-6 text-xs text-slate-500 dark:text-slate-400">
            No conversations yet. Message a peer from Find People or accept an offer on a request.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.map((c) => {
              const active = c.id === selectedConversationId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectConversation(c.id)}
                  className={`w-full p-3.5 text-left flex items-start gap-3 transition-colors cursor-pointer ${
                    active ? 'bg-indigo-50/80 dark:bg-indigo-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <UserAvatar name={c.peer?.displayName || 'Peer'} avatarUrl={c.peer?.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {c.peer?.displayName || 'Student'}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    {c.requestTitle && (
                      <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
                        Job: {c.requestTitle}
                      </p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {c.lastMessage?.content || c.lastMessage?.attachment_name || 'No messages yet'}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      {/* Active Chat Panel */}
      <section className="md:col-span-8 flex flex-col min-h-[400px]">
        {!activeConvo ? (
          <div className="flex-1 flex items-center justify-center p-8 text-xs text-slate-500 dark:text-slate-400">
            Select a conversation to start messaging privately inside UniLink.
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar
                  name={activeConvo.peer?.displayName || 'Peer'}
                  avatarUrl={activeConvo.peer?.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => activeConvo.peer && onViewProfile(activeConvo.peer.id)}
                    className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:underline truncate block cursor-pointer"
                  >
                    {activeConvo.peer?.displayName}
                  </button>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeConvo.peer?.isOnline === true
                      ? 'Online now'
                      : activeConvo.peer?.lastActiveAt
                      ? `Active ${formatRelativeTime(activeConvo.peer.lastActiveAt)}`
                      : 'NUML Peer'}
                    {activeConvo.requestTitle ? ` · Re: ${activeConvo.requestTitle}` : ''}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  title={activeConvo.isMuted ? 'Unmute conversation' : 'Mute conversation'}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  {activeConvo.isMuted ? <Volume2 className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleBlockPeer}
                  title="Block user"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Ban className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onReport({
                      targetType: 'message',
                      targetId: activeConvo.id,
                      label: `Conversation with ${activeConvo.peer?.displayName || 'peer'}`,
                    })
                  }
                  title="Report conversation"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-rose-600 cursor-pointer"
                >
                  <Flag className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/40">
              {messages.map((m) => {
                const mine = m.sender_id === currentUserId;
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm ${
                        mine
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      {m.attachment_url && isSafeHttpUrl(m.attachment_url) && (
                        <div className="mt-2">
                          {m.attachment_mime?.startsWith('image/') ? (
                            <img
                              src={m.attachment_url}
                              alt={m.attachment_name || 'Attachment'}
                              referrerPolicy="no-referrer"
                              className="max-h-48 rounded-lg border border-black/10"
                            />
                          ) : (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline text-xs"
                            >
                              {m.attachment_name || 'Download PDF attachment'}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400 tabular-nums">
                      {formatRelativeTime(m.sent_at)}
                      {mine && (m.read_at ? ' · Read' : ' · Sent')}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {activeConvo.isBlocked ? (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-rose-600 dark:text-rose-400">
                Messaging disabled because one participant has blocked the other.
              </div>
            ) : (
              <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                {attachment && (
                  <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
                    <span className="truncate">{attachment.name}</span>
                    <button
                      type="button"
                      onClick={() => setAttachment(null)}
                      className="text-rose-600 font-medium ml-2 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <label
                    title="Attach image or PDF (max 4 MB)"
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Paperclip className="w-4 h-4" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={handleUploadFile}
                      className="hidden"
                    />
                  </label>
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={uploading ? 'Uploading attachment...' : 'Write a message (no private emails or wallet PINs)...'}
                    className="flex-1 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={sending || uploading || (!text.trim() && !attachment)}
                    className="min-h-[40px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
};
