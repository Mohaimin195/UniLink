import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, KeyRound, Mail, Moon, ShieldCheck, Sun } from 'lucide-react';
import { BRAND_CONFIG } from '../config/brand.ts';
import { apiFetch, setAuthToken } from '../lib/api.ts';
import type { MeResponse, PlatformMeta } from '../types/unilink.ts';
import type { ThemeMode } from '../hooks/useTheme.ts';
import { BrandMark } from './BrandMark.tsx';
import { PWAInstallButton } from './PWAWidgets.tsx';

interface AuthGatewayProps {
  meta: PlatformMeta;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onAuthenticated: (me: MeResponse) => void;
  initialPendingUser?: MeResponse | null;
  initialEmail?: string;
  onBackToHome?: () => void;
}

export const AuthGateway: React.FC<AuthGatewayProps> = ({
  meta,
  theme,
  onToggleTheme,
  onAuthenticated,
  initialPendingUser = null,
  initialEmail = '',
  onBackToHome,
}) => {
  const [step, setStep] = useState<'email' | 'otp' | 'profile'>(
    initialPendingUser ? 'profile' : 'email',
  );
  const [email, setEmail] = useState(initialEmail);
  const [showSandboxAccounts, setShowSandboxAccounts] = useState(false);
  const [code, setCode] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [deliveredVia, setDeliveredVia] = useState<'smtp' | 'preview' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Onboarding Profile state
  const [displayName, setDisplayName] = useState(initialPendingUser?.profile?.display_name || '');
  const [campusId, setCampusId] = useState(meta.campuses[0]?.id || '');
  const [departmentId, setDepartmentId] = useState(meta.departments[0]?.id || '');
  const [programmeId, setProgrammeId] = useState('');
  const [semester, setSemester] = useState(2);
  const [workMode, setWorkMode] = useState<'online' | 'in_person' | 'either'>('either');
  const [bio, setBio] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Easypaisa']);
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [genderOptIn, setGenderOptIn] = useState(false);

  useEffect(() => {
    const progs = meta.programmes.filter((p) => p.department_id === departmentId);
    setProgrammeId(progs[0]?.id || '');
  }, [departmentId, meta.programmes]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleRequestOtp = async (e?: React.FormEvent, overrideEmail?: string) => {
    if (e) e.preventDefault();
    const targetEmail = (overrideEmail ?? email).trim();
    if (!targetEmail) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        deliveredVia: 'smtp' | 'preview';
        previewOtp?: string;
        resendCooldownSeconds: number;
      }>('/api/auth/request-otp', {
        method: 'POST',
        body: JSON.stringify({ email: targetEmail }),
      });
      setEmail(targetEmail);
      setDeliveredVia(res.deliveredVia);
      setPreviewOtp(res.previewOtp || null);
      setCooldown(res.resendCooldownSeconds || 60);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{
        token: string;
        needsProfileCompletion: boolean;
      }>('/api/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      setAuthToken(res.token);
      const me = await apiFetch<MeResponse>('/api/auth/me');
      if (res.needsProfileCompletion || me.user.account_status === 'pending_profile') {
        setDisplayName(me.profile?.display_name || '');
        setStep('profile');
      } else {
        onAuthenticated(me);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSkillIds.length === 0) {
      setError('Please select at least one skill tag so peers can discover or match with you.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({
          displayName,
          bio,
          campusId,
          departmentId,
          programmeId: programmeId || null,
          semester,
          workMode,
          preferredPaymentMethods: paymentMethods,
          gender: gender || null,
          genderMatchingOptIn: Boolean(gender && genderOptIn),
          showGenderPublicly: false,
          skills: selectedSkillIds.map((id) => ({
            skillId: id,
            proficiency: 'intermediate',
            offeringService: true,
          })),
        }),
      });
      const me = await apiFetch<MeResponse>('/api/auth/me');
      onAuthenticated(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 12 ? [...prev, id] : prev,
    );
  };

  const togglePayment = (method: string) => {
    setPaymentMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col lg:flex-row">
      {/* Left Brand & Editorial Context Panel */}
      <div className="relative lg:w-1/2 xl:w-[52%] min-h-[260px] lg:min-h-screen flex flex-col justify-between overflow-hidden bg-slate-900">
        <img
          src="/src/assets/images/campus_collaboration_hero_1795450615151.jpg"
          alt="NUML students collaborating with laptops and notebooks"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/65 to-indigo-950/50" />

        <div className="relative z-10 p-6 sm:p-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BrandMark size={34} />
            <span className="font-display text-xl font-bold tracking-tight text-white">
              {BRAND_CONFIG.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton compact />
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label="Toggle color theme"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-white/20 bg-slate-900/60 text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="relative z-10 p-6 sm:p-10 lg:p-12 max-w-xl">
          <p className="text-xs font-medium tracking-wide text-emerald-300">
            {BRAND_CONFIG.institutionName} · {meta.approvedDomains.join(', ')}
          </p>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
            {BRAND_CONFIG.shortPromise}
          </h1>
          <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed">
            Post 24-hour help requests, get matched with peers across NUML campuses, compare transparent offers, chat safely inside the app, and earn verified ratings tied to real completed jobs.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-white/15 pt-6 text-xs text-slate-200">
            <div>
              <p className="font-semibold text-white">University-Only</p>
              <p className="mt-1 text-slate-300">Exact {meta.approvedDomains.join(', ')} email OTP required.</p>
            </div>
            <div>
              <p className="font-semibold text-white">24h Fresh Feed</p>
              <p className="mt-1 text-slate-300">Requests auto-expire in 24h; alerts refresh every 12h.</p>
            </div>
            <div>
              <p className="font-semibold text-white">Verified Reputation</p>
              <p className="mt-1 text-slate-300">1 completed job = 1 verified rating.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Interactive Auth / Onboarding Column */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-lg">
          {step === 'email' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs">
              {onBackToHome && (
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to UniLink Home</span>
                </button>
              )}
              <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Verified Student Access</span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Sign in or join UniLink
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Enter your official NUML email address. Public domains such as Gmail or Yahoo are blocked automatically.
              </p>

              <form onSubmit={(e) => handleRequestOtp(e)} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="uni-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    University Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="uni-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your.name@numl.edu.pk"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <span>{loading ? 'Sending code...' : 'Send 6-Digit Verification Code'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              {!meta.smtpConfigured && (
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSandboxAccounts((s) => !s)}
                    className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <span>Preview Mode: Sample Test Accounts</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSandboxAccounts ? 'rotate-180' : ''}`} />
                  </button>
                  {showSandboxAccounts && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(undefined, 'hamza.tariq@numl.edu.pk')}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Student (hamza.tariq@numl.edu.pk)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRequestOtp(undefined, 'admin@numl.edu.pk')}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Admin (admin@numl.edu.pk)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'otp' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <KeyRound className="w-4 h-4" />
                <span>One-Time Code Verification</span>
              </div>
              <h2 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                Enter your 6-digit code
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                Sent to <span className="font-medium text-slate-900 dark:text-slate-100">{email}</span>. Expires in 10 minutes.
              </p>

              {deliveredVia === 'preview' && previewOtp && (
                <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50 dark:bg-emerald-950/50 p-3.5 text-xs text-emerald-900 dark:text-emerald-100">
                  <p className="font-semibold">Preview OTP Fallback (SMTP not configured)</p>
                  <p className="mt-1">
                    Use verification code:{' '}
                    <button
                      type="button"
                      onClick={() => setCode(previewOtp)}
                      className="font-mono font-bold text-sm underline decoration-emerald-500 cursor-pointer"
                    >
                      {previewOtp}
                    </button>{' '}
                    (click to fill)
                  </p>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="otp-code" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    6-Digit Code
                  </label>
                  <input
                    id="otp-code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-center font-mono text-xl tracking-[0.35em] tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setCode('');
                    setError('');
                  }}
                  className="hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
                >
                  Change email
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || loading}
                  onClick={() => handleRequestOtp()}
                  className="hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-50 cursor-pointer"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {step === 'profile' && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-xs max-h-[85vh] overflow-y-auto">
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                Complete Your Student Profile
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Your university email is verified and kept private. Tell NUML peers your campus, department, and skills.
              </p>

              <form onSubmit={handleCompleteProfile} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Campus</label>
                    <select
                      value={campusId}
                      onChange={(e) => setCampusId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {meta.campuses.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Department</label>
                    <select
                      value={departmentId}
                      onChange={(e) => setDepartmentId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {meta.departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Current Semester</label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
                        <option key={s} value={s}>Semester {s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Work Mode</label>
                    <select
                      value={workMode}
                      onChange={(e) => setWorkMode(e.target.value as 'online' | 'in_person' | 'either')}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    >
                      <option value="either">Online or In-Person</option>
                      <option value="online">Online Only</option>
                      <option value="in_person">On-Campus / In-Person</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Short Bio</label>
                  <textarea
                    rows={2}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="What can you help peers with, or what are you studying?"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Select Your Skills ({selectedSkillIds.length}/12)
                  </label>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex flex-wrap gap-1.5">
                    {meta.skills.map((s) => {
                      const active = selectedSkillIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSkill(s.id)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Preferred Payment Methods (informational only; no wallet numbers stored)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Easypaisa', 'JazzCash', 'NayaPay', 'Bank transfer', 'Cash / in person', 'Free / no payment required'].map(
                      (pm) => {
                        const active = paymentMethods.includes(pm);
                        return (
                          <button
                            key={pm}
                            type="button"
                            onClick={() => togglePayment(pm)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer ${
                              active
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {pm}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Optional Comfort Matching Preference (voluntary)
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value as 'male' | 'female' | '')}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Prefer not to set</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    {gender && (
                      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={genderOptIn}
                          onChange={(e) => setGenderOptIn(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        Use privately for comfort matching (hidden from public profile)
                      </label>
                    )}
                  </div>
                </div>

                {error && (
                  <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/50 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-lg bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Saving Profile...' : 'Enter UniLink Feed'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
