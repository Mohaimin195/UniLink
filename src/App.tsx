import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminDashboardView } from './components/AdminDashboardView.tsx';
import { AlertsAndNotificationsView } from './components/AlertsAndNotificationsView.tsx';
import { AppShell, type NavSection } from './components/AppShell.tsx';
import { AuthGateway } from './components/AuthGateway.tsx';
import { ConnectionsCommunityView } from './components/ConnectionsCommunityView.tsx';
import { CreateRequestModal } from './components/CreateRequestModal.tsx';
import { DirectoryViews } from './components/DirectoryViews.tsx';
import { JobsWorkspaceView } from './components/JobsWorkspaceView.tsx';
import { MessagesView } from './components/MessagesView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { PublicWebsiteHome } from './components/PublicWebsiteHome.tsx';
import { OfflineIndicator } from './components/PWAWidgets.tsx';
import { ReportModal, type ReportTarget } from './components/ReportModal.tsx';
import { RequestFeedView } from './components/RequestFeedView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { useTheme } from './hooks/useTheme.ts';
import { apiFetch, getAuthToken, setAuthToken } from './lib/api.ts';
import type { MeResponse, PlatformMeta, Skill } from './types/unilink.ts';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [meta, setMeta] = useState<PlatformMeta | null>(null);
  const [metaError, setMetaError] = useState('');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showAuthGateway, setShowAuthGateway] = useState(() => window.location.pathname === '/signin');
  const [authPrefillEmail, setAuthPrefillEmail] = useState('');
  const [activeNav, setActiveNav] = useState<NavSection>('feed');
  const [viewedProfileId, setViewedProfileId] = useState<string | null>(null);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [wsSignal, setWsSignal] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const openAuthScreen = useCallback((prefillEmail?: string) => {
    setAuthPrefillEmail(prefillEmail || '');
    setShowAuthGateway(true);
    if (window.location.pathname !== '/signin') {
      window.history.pushState(null, '', '/signin');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const closeAuthScreen = useCallback(() => {
    setShowAuthGateway(false);
    if (window.location.pathname === '/signin') {
      window.history.pushState(null, '', '/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPop = () => {
      setShowAuthGateway(window.location.pathname === '/signin');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      setMetaError('');
      const m = await apiFetch<PlatformMeta>('/api/auth/meta');
      setMeta(m);
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Unable to connect to UniLink server.');
    }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const updated = await apiFetch<MeResponse>('/api/auth/me');
      setMe(updated);
    } catch {
      // session not present or expired
    }
  }, []);

  useEffect(() => {
    loadMeta();
    apiFetch<MeResponse>('/api/auth/me')
      .then((authed) => {
        setMe(authed);
      })
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, [loadMeta]);

  // Real-time WebSocket connection for live chat, alerts, and job updates
  useEffect(() => {
    if (!me || me.user.account_status !== 'active') return;
    const token = getAuthToken();

    let ws: WebSocket | null = null;
    let closedByCleanup = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = token
        ? `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`
        : `${protocol}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type && payload.type !== 'ws:connected') {
            setWsSignal((s) => s + 1);
            refreshMe();
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closedByCleanup = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [me?.user.id, me?.user.account_status, refreshMe]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    setMe(null);
    setShowAuthGateway(false);
    if (window.location.pathname === '/signin') {
      window.history.pushState(null, '', '/');
    }
    setActiveNav('feed');
    setViewedProfileId(null);
    setSelectedConvoId(null);
  };

  const handleViewProfile = (userId: string) => {
    setViewedProfileId(userId);
    setActiveNav('profile');
  };

  const handleOpenChat = async (targetUserId: string, requestId?: string) => {
    try {
      const res = await apiFetch<{ conversationId: string }>('/api/conversations/start', {
        method: 'POST',
        body: JSON.stringify({ targetUserId, requestId: requestId || null }),
      });
      setSelectedConvoId(res.conversationId);
      setActiveNav('messages');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to start conversation.');
    }
  };

  const handleOpenRequestFromElsewhere = (requestId: string) => {
    setOpenRequestId(requestId);
    setActiveNav('feed');
  };

  const handleSkillAdded = (skill: Skill) => {
    setMeta((prev) =>
      prev && !prev.skills.some((s) => s.id === skill.id)
        ? { ...prev, skills: [...prev.skills, skill] }
        : prev,
    );
  };

  if (metaError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 text-center">
        <div className="max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <h1 className="font-display text-lg font-semibold">UniLink Connection Issue</h1>
          <p className="mt-2 text-xs text-slate-500">{metaError}</p>
          <button
            type="button"
            onClick={loadMeta}
            className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!meta || !sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-xs text-slate-500">
        Loading UniLink...
      </div>
    );
  }

  if (!me || me.user.account_status === 'pending_profile') {
    if (!me && !showAuthGateway) {
      return (
        <>
          <PublicWebsiteHome
            meta={meta}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenAuth={openAuthScreen}
          />
          <OfflineIndicator />
        </>
      );
    }
    return (
      <>
        <AuthGateway
          meta={meta}
          theme={theme}
          onToggleTheme={toggleTheme}
          initialPendingUser={me}
          initialEmail={authPrefillEmail}
          onBackToHome={!me ? closeAuthScreen : undefined}
          onAuthenticated={(authedMe) => {
            setMe(authedMe);
            setShowAuthGateway(false);
            if (window.location.pathname === '/signin') {
              window.history.pushState(null, '', '/');
            }
            setActiveNav('feed');
          }}
        />
        <OfflineIndicator />
      </>
    );
  }

  return (
    <>
      <AppShell
        me={me}
        activeNav={activeNav}
        onSelectNav={(nav) => {
          if (nav === 'profile') setViewedProfileId(me.user.id);
          setActiveNav(nav);
        }}
        onOpenCreateRequest={() => setShowCreateModal(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
      >
        {activeNav === 'feed' && (
          <RequestFeedView
            meta={meta}
            currentUserId={me.user.id}
            refreshSignal={refreshSignal + wsSignal}
            initialOpenRequestId={openRequestId}
            onClearInitialRequest={() => setOpenRequestId(null)}
            onViewProfile={handleViewProfile}
            onOpenChat={handleOpenChat}
            onReport={setReportTarget}
            onToast={showToast}
            onNavigateJobs={() => setActiveNav('jobs')}
          />
        )}

        {(activeNav === 'people' || activeNav === 'services') && (
          <DirectoryViews
            mode={activeNav}
            meta={meta}
            onViewProfile={handleViewProfile}
            onOpenChat={(uid) => handleOpenChat(uid)}
            onToast={showToast}
          />
        )}

        {activeNav === 'jobs' && (
          <JobsWorkspaceView
            currentUserId={me.user.id}
            refreshSignal={refreshSignal + wsSignal}
            onOpenChat={handleOpenChat}
            onOpenRequest={handleOpenRequestFromElsewhere}
            onToast={showToast}
          />
        )}

        {activeNav === 'messages' && (
          <MessagesView
            currentUserId={me.user.id}
            selectedConversationId={selectedConvoId}
            onSelectConversation={setSelectedConvoId}
            wsSignal={wsSignal}
            onViewProfile={handleViewProfile}
            onReport={setReportTarget}
            onToast={showToast}
            onRefreshUnread={refreshMe}
          />
        )}

        {(activeNav === 'alerts' || activeNav === 'notifications') && (
          <AlertsAndNotificationsView
            mode={activeNav}
            signal={refreshSignal + wsSignal}
            onOpenRequest={handleOpenRequestFromElsewhere}
            onNavigateJobs={() => setActiveNav('jobs')}
            onNavigateMessages={() => setActiveNav('messages')}
            onRefreshUnread={refreshMe}
            onToast={showToast}
          />
        )}

        {activeNav === 'connections' && (
          <ConnectionsCommunityView
            currentUserId={me.user.id}
            onViewProfile={handleViewProfile}
            onOpenChat={(uid) => handleOpenChat(uid)}
            onToast={showToast}
          />
        )}

        {activeNav === 'profile' && (
          <ProfileView
            userId={viewedProfileId || me.user.id}
            currentUserId={me.user.id}
            onOpenChat={(uid) => handleOpenChat(uid)}
            onReport={setReportTarget}
            onToast={showToast}
            onGoSettings={() => setActiveNav('settings')}
          />
        )}

        {activeNav === 'settings' && (
          <SettingsView
            me={me}
            meta={meta}
            theme={theme}
            onToggleTheme={toggleTheme}
            onProfileUpdated={setMe}
            onAccountDeleted={() => {
              setAuthToken(null);
              setMe(null);
              showToast('Your account has been deleted.');
            }}
            onToast={showToast}
          />
        )}

        {activeNav === 'admin' && me.user.role === 'admin' && (
          <AdminDashboardView meta={meta} onMetaUpdated={loadMeta} onToast={showToast} />
        )}
      </AppShell>

      <CreateRequestModal
        open={showCreateModal}
        meta={meta}
        onClose={() => setShowCreateModal(false)}
        onSkillAdded={handleSkillAdded}
        onCreated={(alertsCount) => {
          setRefreshSignal((s) => s + 1);
          setActiveNav('feed');
          showToast(
            `Request published for 24 hours. Dispatched ${alertsCount} matching peer alert${alertsCount === 1 ? '' : 's'}.`,
          );
        }}
      />

      <ReportModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmitted={showToast}
      />

      <OfflineIndicator />

      {toast && (
        <div
          role="status"
          className="fixed bottom-20 lg:bottom-6 right-4 sm:right-6 z-50 max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-900 dark:bg-slate-800 text-white px-4 py-3 text-xs font-medium shadow-xl"
        >
          {toast}
        </div>
      )}
    </>
  );
}

