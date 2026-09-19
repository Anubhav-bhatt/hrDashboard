import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, LogIn, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toApiError } from '../services/api';
import { Button, InlineAlert, Spinner } from '../components/ui';
import AuthLayout from '../components/auth/AuthLayout';
import { AuthField, PasswordField } from '../components/auth/AuthFields';

/**
 * Sign-in screen.
 *
 * Candidate data is only reachable behind this screen, so the form validates
 * locally, reports server errors verbatim, and never reveals whether an email
 * address exists.
 */
const Login = () => {
  const { signIn, isAuthenticated, isLoading, sessionMessage, clearSessionMessage } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const emailRef = useRef(null);
  const passwordRef = useRef(null);

  // Arriving from signup with "this address is taken" carries the address over,
  // so it does not have to be typed a second time.
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
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
    // With the address already filled in, the password is what is missing.
    if (location.state?.email) passwordRef.current?.focus();
    else emailRef.current?.focus();
  }, [location.state]);

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
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link
            to="/signup"
            className="font-semibold text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {sessionMessage && <InlineAlert tone="warning" message={sessionMessage} className="mt-5" />}
      {formError && <InlineAlert tone="error" message={formError} className="mt-5" />}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <AuthField
          id="email"
          label="Work email"
          icon={Mail}
          type="email"
          // `username` rather than `email`: paired with `current-password`, this
          // is what tells a password manager the two fields are one credential.
          autoComplete="username"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }));
          }}
          error={fieldErrors.email}
          inputRef={emailRef}
        />

        <PasswordField
          icon={Lock}
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: undefined }));
          }}
          error={fieldErrors.password}
          inputRef={passwordRef}
        />

        <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
