import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, LogIn, Mail, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toApiError } from '../services/api';
import { Button, InlineAlert, Spinner } from '../components/ui';

/**
 * Sign-in screen. Candidate data is only reachable behind this screen, so the
 * form validates locally, reports server errors verbatim, and never reveals
 * whether an email address exists.
 */
const Login = () => {
  const { signIn, isAuthenticated, isLoading, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /*
   * The route the recruiter originally asked for, restored after signing in.
   *
   * Only a plain sign-in falls through to the named /dashboard URL — an
   * attempted deep link still wins, so protecting a route never costs the
   * recruiter the page they were trying to reach.
   */
  const redirectTo = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : '/dashboard';

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  if (isLoading) return <Spinner label="Checking your session…" className="min-h-screen" />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = 'Enter your work email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    clearSessionMessage();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      setFormError(apiError.message);
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/*
        Brand panel — hidden on small screens where the form matters most.
        Uses the fixed `ink` palette rather than a neutral token: this surface is
        meant to stay dark in both themes, and a token would invert it to light.
      */}
      <div className="hidden lg:flex flex-col justify-between bg-ink-900 text-slate-50 p-12 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, #38aaf5 0, transparent 45%), radial-gradient(circle at 80% 70%, #0270c4 0, transparent 40%)'
          }}
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-control bg-brand-600 flex items-center justify-center">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
            </div>
            <span className="text-lg font-bold tracking-tight">HR Screening</span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold tracking-tight leading-tight text-ink-100">
            Screen every applicant against the role, not a gut feeling.
          </h2>
          <p className="text-ink-300 text-body mt-4 leading-relaxed">
            Import resumes, score them against your job description with an explainable model, and move the
            right people forward faster.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              { icon: Users, text: 'Structured candidate profiles parsed from every resume' },
              { icon: Sparkles, text: 'Explainable 0–100 relevance scoring, no black box' },
              { icon: ShieldCheck, text: 'Candidate data stays behind authenticated access' }
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-meta text-ink-300">
                <Icon className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-ink-400">
          Scoring is a decision-support signal. Hiring decisions remain with your recruiters.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-control bg-brand-600 flex items-center justify-center text-white">
              <Sparkles className="w-[18px] h-[18px]" aria-hidden="true" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">HR Screening</span>
          </div>

          <h1 className="text-page-title">Sign in</h1>
          <p className="text-meta text-slate-500 mt-1.5">Use your recruiter account to access the dashboard.</p>

          {sessionMessage && <InlineAlert tone="warning" message={sessionMessage} className="mt-5" />}
          {formError && <InlineAlert tone="error" message={formError} className="mt-5" />}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="field-label">
                Work email <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
                <input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  className={`input pl-9 ${fieldErrors.email ? 'input-error' : ''}`}
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                />
              </div>
              {fieldErrors.email && (
                <p id="email-error" className="text-xs text-rose-600 mt-1.5 font-medium">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="field-label">
                Password <span className="text-rose-500" aria-hidden="true">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={`input pl-9 pr-10 ${fieldErrors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
                  }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-2 p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors duration-fast"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="password-error" className="text-xs text-rose-600 mt-1.5 font-medium">
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={submitting} className="w-full">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="text-xs text-slate-500 mt-6 leading-relaxed">
            Accounts are provisioned by your administrator. Run{' '}
            <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-[11px]">npm run seed:user</code> on the
            server to add a recruiter.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
