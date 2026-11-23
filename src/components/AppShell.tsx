import React, { useState } from 'react';
import {
  Bell,
  Briefcase,
  Compass,
  FolderGit2,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Settings,
  ShieldAlert,
  Sun,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand.ts';
import type { ThemeMode } from '../hooks/useTheme.ts';
import type { MeResponse } from '../types/unilink.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAWidgets.tsx';
import { UserAvatar } from './UserAvatar.tsx';

export type NavSection =
  | 'feed'
  | 'people'
  | 'services'
  | 'jobs'
  | 'messages'
  | 'alerts'
  | 'notifications'
  | 'connections'
  | 'profile'
  | 'settings'
  | 'admin';

interface AppShellProps {
  me: MeResponse;
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  onOpenCreateRequest: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const SECTION_LABELS: Record<NavSection, string> = {
  feed: 'Request Feed',
  people: 'Find People',
  services: 'Skills Directory',
  jobs: 'My Requests & Jobs',
  messages: 'Messages',
  alerts: 'Request Alerts (12h)',
  notifications: 'Notifications',
  connections: 'Connections & Q&A',
  profile: 'My Profile',
  settings: 'Settings & Privacy',
  admin: 'Admin Console',
};

export const AppShell: React.FC<AppShellProps> = ({
  me,
  activeNav,
  onSelectNav,
  onOpenCreateRequest,
  theme,
  onToggleTheme,
  onLogout,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: Array<{ id: NavSection; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'feed', label: 'Request Feed', icon: <Home className="w-4 h-4" /> },
    { id: 'people', label: 'Find People', icon: <Users className="w-4 h-4" /> },
    { id: 'services', label: 'Skills Directory', icon: <Compass className="w-4 h-4" /> },
    { id: 'jobs', label: 'My Jobs', icon: <Briefcase className="w-4 h-4" /> },
    {
      id: 'messages',
      label: 'Messages',
      icon: <MessageSquare className="w-4 h-4" />,
      badge: me.unreadCounts.messages,
    },
    {
      id: 'alerts',
      label: 'Request Alerts',
      icon: <Zap className="w-4 h-4" />,
      badge: me.unreadCounts.alerts,
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: <Bell className="w-4 h-4" />,
      badge: me.unreadCounts.notifications,
    },
    { id: 'connections', label: 'Connections & Q&A', icon: <FolderGit2 className="w-4 h-4" /> },
    { id: 'profile', label: 'My Profile', icon: <User className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  if (me.user.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin Console', icon: <ShieldAlert className="w-4 h-4" /> });
  }

  const handleNav = (id: NavSection) => {
    onSelectNav(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 flex">
      {/* Desktop Persistent Workspace Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800">
          <BrandMark size={28} />
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
            {BRAND_CONFIG.name}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = activeNav === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="font-mono text-xs tabular-nums font-semibold text-indigo-600 dark:text-indigo-300">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <PWAInstallButton />
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleNav('profile')}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
            >
              <UserAvatar name={me.profile.display_name} avatarUrl={me.profile.avatar_url} size="sm" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {me.profile.display_name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {me.profile.campus_name || 'NUML'}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              aria-label="Sign out"
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Region */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Clean 1-Row Top Bar */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-4 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="lg:hidden flex items-center gap-2 shrink-0">
              <BrandMark size={24} />
            </div>
            <h1 className="font-display text-base lg:text-lg font-semibold text-slate-900 dark:text-slate-50 truncate">
              {SECTION_LABELS[activeNav]}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onOpenCreateRequest}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs sm:text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Request</span>
            </button>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (5 tabs, <= 64px height so combined top+bottom <= 15% cap) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md grid grid-cols-5 items-center">
        <button
          type="button"
          onClick={() => handleNav('feed')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeNav === 'feed' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium">Feed</span>
        </button>

        <button
          type="button"
          onClick={() => handleNav('people')}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeNav === 'people' || activeNav === 'services'
              ? 'text-indigo-600 dark:text-indigo-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-medium">People</span>
        </button>

        <button
          type="button"
          onClick={() => handleNav('alerts')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeNav === 'alerts' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <Zap className="w-5 h-5" />
          <span className="text-[10px] font-medium">Alerts</span>
          {me.unreadCounts.alerts > 0 && (
            <span className="absolute top-1.5 right-4 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {me.unreadCounts.alerts}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleNav('messages')}
          className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeNav === 'messages' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium">Chat</span>
          {me.unreadCounts.messages > 0 && (
            <span className="absolute top-1.5 right-4 font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
              {me.unreadCounts.messages}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-500 dark:text-slate-400 cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* Mobile Full Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end">
          <div className="w-72 max-w-[85vw] bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-semibold text-slate-900 dark:text-slate-50">Menu</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                    activeNav === item.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="font-mono text-xs tabular-nums">{item.badge}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <PWAInstallButton />
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
