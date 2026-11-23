import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, ChevronDown, Lock, Mail, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand.ts';
import type { ThemeMode } from '../hooks/useTheme.ts';
import { apiFetch, formatTimeRemaining, isSafeHttpUrl } from '../lib/api.ts';
import type { PlatformMeta } from '../types/unilink.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAWidgets.tsx';

interface PublicShowcaseData {
  metrics: {
    verifiedStudents: number;
    activeRequests: number;
    completedJobs: number;
    campusesCount: number;
    skillsCount: number;
  };
  featuredRequests: Array<{
    id: string;
    title: string;
    category: string;
    workMode: string;
    budgetType: string;
    budgetAmount: string | null;
    expiresAt: string;
    campusName: string;
    departmentName: string;
    skills: string[];
  }>;
  featuredPortfolio: Array<{
    id: string;
    title: string;
    description: string;
    mediaUrl: string | null;
    workOrigin: 'verified_platform' | 'personal';
    authorName: string;
    campusName: string;
    tags: string[];
  }>;
}

interface PublicWebsiteHomeProps {
  meta: PlatformMeta;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAuth: (prefillEmail?: string) => void;
}

type PolicyModalType = 'privacy' | 'terms' | 'safety' | null;

const FAQ_ITEMS = [
  {
    q: 'Who is allowed to join UniLink?',
    a: 'Only students and moderators with an active @numl.edu.pk university email address. Public email providers such as Gmail, Outlook, or Yahoo are blocked automatically at verification.',
  },
  {
    q: 'Why do requests expire after 24 hours and alerts after 12 hours?',
    a: 'Short-lived windows keep the feed realistic and responsive. Students get matched alerts for 12 hours, while the public request stays open for 24 hours so nothing goes stale.',
  },
  {
    q: 'How do payments and ratings work?',
    a: 'UniLink supports free peer help as well as paid or negotiable agreements arranged directly between students (Easypaisa, JazzCash, NayaPay, bank transfer, or cash). Ratings are tied 1-to-1 to real completed jobs.',
  },
  {
    q: 'Can I delete my account or control what peers see?',
    a: 'Yes. You can toggle online status, last-seen timestamps, and profile visibility in Settings, block any user, or permanently close and hide your account via email OTP verification.',
  },
];

export const PublicWebsiteHome: React.FC<PublicWebsiteHomeProps> = ({
  meta,
  theme,
  onToggleTheme,
  onOpenAuth,
}) => {
  const [showcase, setShowcase] = useState<PublicShowcaseData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [heroEmail, setHeroEmail] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [policyModal, setPolicyModal] = useState<PolicyModalType>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiFetch<PublicShowcaseData>('/api/auth/showcase')
      .then(setShowcase)
      .catch(() => {});
  }, []);

  const categories = [
    'All',
    ...Array.from(new Set(meta.skills.map((s) => s.category))).slice(0, 5),
  ];

  const filteredRequests = (showcase?.featuredRequests || []).filter(
    (r) => selectedCategory === 'All' || r.category === selectedCategory,
  );

  const handleHeroSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOpenAuth(heroEmail.trim() || undefined);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <a
            href="#top"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            <BrandMark size={28} />
            <span>{BRAND_CONFIG.name}</span>
          </a>

          {/* Zone 2: 4 Single-line Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a
              href="#how-it-works"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#live-feed"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Live Feed
            </a>
            <a
              href="#campuses"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Campuses
            </a>
            <a
              href="#safety"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Safety
            </a>
          </nav>

          {/* Zone 3: Primary CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth()}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs sm:text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In / Join
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
          <div className="lg:col-span-7 flex flex-col justify-center">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              {BRAND_CONFIG.institutionName} · {meta.approvedDomains.join(', ')}
            </p>
            <h1
              className="mt-3 font-display font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-[1.1]"
              style={{ fontSize: 'clamp(2.1rem, 4vw, 3.5rem)', textWrap: 'balance' }}
            >
              Peer help and campus skills, verified for NUML.
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Post a 24-hour request for coding help, video editing, design, or exam prep. Get matched with verified NUML classmates across 9 campuses, compare offers, chat safely in-app, and build real job-backed ratings.
            </p>

            {/* Direct NUML Email Entry Form */}
            <form onSubmit={handleHeroSubmit} className="mt-7 flex flex-col sm:flex-row gap-3 max-w-xl">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={heroEmail}
                  onChange={(e) => setHeroEmail(e.target.value)}
                  placeholder="your.name@numl.edu.pk"
                  aria-label="Enter your NUML email address"
                  className="w-full min-h-[44px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Join with NUML Email</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
              <a
                href="#live-feed"
                className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap"
              >
                Browse Live Requests
              </a>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={onToggleTheme}
                className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              </button>
              <PWAInstallButton compact />
            </div>
          </div>

          {/* Right Stretched Media Panel */}
          <div className="lg:col-span-5 relative min-h-[260px] lg:min-h-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
            {!failedImages.hero ? (
              <img
                src="/src/assets/images/campus_collaboration_hero_1795450615151.jpg"
                alt="NUML students collaborating on campus with laptops and project notebooks"
                referrerPolicy="no-referrer"
                onError={() => setFailedImages((f) => ({ ...f, hero: true }))}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-slate-900 to-emerald-950 flex items-center justify-center p-8 text-center">
                <BookOpen className="w-10 h-10 text-emerald-300" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent flex flex-col justify-end p-6">
              <p className="text-xs font-medium text-emerald-300">
                Closed Institutional Trust
              </p>
              <p className="mt-1 font-display text-lg font-semibold text-white">
                Every member is OTP-verified on @numl.edu.pk before posting or messaging.
              </p>
            </div>
          </div>
        </div>

        {/* Full-Width 4-Column Live Metrics Strip */}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6 tabular-nums">
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50">
                {showcase?.metrics.campusesCount ?? meta.campuses.length}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">NUML Campuses Connected</p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-50">
                {showcase?.metrics.skillsCount ?? meta.skills.length}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Verified Campus Skills</p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {showcase?.metrics.activeRequests ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Live 24-Hour Requests</p>
            </div>
            <div>
              <p className="font-mono text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {showcase?.metrics.completedJobs ?? 0}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Verified Completed Jobs</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 01: How the Network Works */}
      <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Workflow</p>
          <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            How UniLink moves from ask to verified outcome
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Structured lifecycles protect privacy, eliminate stale listings, and ensure every rating belongs to real peer work.
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {
              num: '01. Post a 24h Request',
              body: 'Describe your task, select skill tags, target specific campuses or semesters, and choose online or in-person mode.',
            },
            {
              num: '02. Smart 12h Matching',
              body: 'Eligible verified peers receive real-time alerts in their 12-hour inbox without exposing your private university email.',
            },
            {
              num: '03. Accept & Chat Privately',
              body: 'Compare public offers and ratings, accept one helper to move the request into private processing, and coordinate inside in-app chat.',
            },
            {
              num: '04. Deliver & Build Reputation',
              body: 'Once delivered, close the job with a mandatory 1–5 star rating to update verified helper statistics and link portfolio proof.',
            },
          ].map((step) => (
            <div
              key={step.num}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
            >
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                {step.num}
              </h3>
              <p className="mt-2.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section 02: Live Active Requests & Verified Portfolio Showcase */}
      <section id="live-feed" className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
          <div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Campus Activity</p>
                <h2 className="mt-2 font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Live requests across NUML
                </h2>
              </div>

              {/* Interactive Category Filter Tabs */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center text-sm text-slate-500">
                No active requests in this category right now. Sign in with your @numl.edu.pk email to post the first one.
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredRequests.map((req) => {
                  const ttl = formatTimeRemaining(req.expiresAt);
                  return (
                    <article
                      key={req.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/60 p-5 flex flex-col justify-between gap-4"
                    >
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {req.category} <span aria-hidden="true">·</span> {req.campusName}{' '}
                          <span aria-hidden="true">·</span> {ttl.label}
                        </p>
                        <h3 className="mt-2 font-display text-base font-semibold text-slate-900 dark:text-slate-50 leading-snug">
                          {req.title}
                        </h3>
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                          {req.skills.join(' · ')}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                          {req.budgetAmount || (req.budgetType === 'free' ? 'Free Peer Help' : 'Negotiable')} ·{' '}
                          {req.workMode.replace('_', ' ')}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenAuth()}
                          className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Sign in to offer
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Verified Portfolio Showcase */}
          {showcase && showcase.featuredPortfolio.length > 0 && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Proof of Work</p>
                  <h3 className="mt-1 font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-50">
                    Verified student work &amp; campus projects
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAuth()}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap cursor-pointer"
                >
                  Explore Student Directory
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                {showcase.featuredPortfolio.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      {item.mediaUrl && isSafeHttpUrl(item.mediaUrl) && !failedImages[item.id] ? (
                        <img
                          src={item.mediaUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          onError={() => setFailedImages((f) => ({ ...f, [item.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-indigo-50 to-emerald-50 dark:from-slate-800 dark:to-slate-900 flex items-center justify-center p-6 text-center text-xs text-slate-500">
                          {item.title}
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {item.workOrigin === 'verified_platform' ? 'Verified Platform Work' : 'Personal Portfolio'}{' '}
                          <span aria-hidden="true">·</span> {item.campusName}
                        </p>
                        <h4 className="mt-1.5 font-display text-base font-semibold text-slate-900 dark:text-slate-50">
                          {item.title}
                        </h4>
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {item.description}
                        </p>
                      </div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        By {item.authorName}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Section 03: NUML Campuses, Safety Standards & FAQ */}
      <section id="campuses" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5 space-y-6">
          <div>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Multi-Campus Network</p>
            <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
              Built for all NUML campuses &amp; departments
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Target requests across the whole university or narrow down to your exact campus and semester.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {meta.campuses.map((c) => (
              <div
                key={c.id}
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5"
              >
                <p className="font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                <p className="text-slate-500 dark:text-slate-400">{c.city}</p>
              </div>
            ))}
          </div>
        </div>

        <div id="safety" className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-50">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>University Trust, Integrity &amp; Privacy</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  Private Institutional Email
                </p>
                <p>Your @numl.edu.pk address verifies your student status and is never displayed publicly on profiles or requests.</p>
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Academic Integrity Rule
                </p>
                <p>{BRAND_CONFIG.academicIntegrityNotice}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left text-sm font-semibold text-slate-900 dark:text-slate-100 cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="px-5 pb-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {item.a}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Quiet Website Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <BrandMark size={24} />
              <span className="font-display text-base font-bold text-slate-900 dark:text-slate-50">
                {BRAND_CONFIG.name}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {BRAND_CONFIG.institutionName} · Support: {BRAND_CONFIG.supportEmail}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {BRAND_CONFIG.directPaymentDisclaimer}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setPolicyModal('privacy')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setPolicyModal('terms')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Terms of Use
            </button>
            <button
              type="button"
              onClick={() => setPolicyModal('safety')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Safety Guidelines
            </button>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <PWAInstallButton compact />
          </div>
        </div>
      </footer>

      {/* Legal / Policy Information Modal */}
      {policyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-slate-50">
                {policyModal === 'privacy'
                  ? 'UniLink Privacy & Account Deletion Policy'
                  : policyModal === 'terms'
                    ? 'UniLink Terms of Use'
                    : 'NUML Campus Safety & Integrity Guidelines'}
              </h3>
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                aria-label="Close modal"
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {policyModal === 'privacy' && (
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>Private Verification:</strong> Your @numl.edu.pk address is used strictly for institutional verification, OTP login, and safety enforcement. It is never published on profiles or request cards.
                </p>
                <p>
                  <strong>Immediate Deletion Effect:</strong> {BRAND_CONFIG.privacyHighlights.deletedImmediately}
                </p>
                <p>
                  <strong>Minimal Retention:</strong> {BRAND_CONFIG.privacyHighlights.retainedMinimum}
                </p>
              </div>
            )}

            {policyModal === 'terms' && (
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>University Eligibility:</strong> Only current students and approved campus moderators holding a valid {meta.approvedDomains.join(', ')} email address may maintain an active UniLink account.
                </p>
                <p>
                  <strong>Peer Arrangements:</strong> {BRAND_CONFIG.directPaymentDisclaimer}
                </p>
                <p>
                  <strong>Verified Reviews:</strong> Each completed job supports one verified review from the requester. Fake or reciprocal job farming may result in account suspension.
                </p>
              </div>
            )}

            {policyModal === 'safety' && (
              <div className="space-y-3 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong>Academic Integrity:</strong> {BRAND_CONFIG.academicIntegrityNotice}
                </p>
                <p>
                  <strong>In-Person Meetings:</strong> For on-campus help, always meet in busy public university areas (libraries, cafeterias, or department labs) during daytime hours.
                </p>
                <p>
                  <strong>Blocks &amp; Moderation:</strong> You can block any user at any time to prevent profile viewing and messaging, or file a report for campus moderator review.
                </p>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPolicyModal(null)}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
