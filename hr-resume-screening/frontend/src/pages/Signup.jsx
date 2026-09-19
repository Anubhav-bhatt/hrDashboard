import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Lock, Mail, UserPlus, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toApiError } from '../services/api';
import { Button, InlineAlert, Spinner } from '../components/ui';
import AuthLayout from '../components/auth/AuthLayout';
import { AuthField, PasswordField } from '../components/auth/AuthFields';

/**
 * Create an account.
 *
 * Three fields, because three is what it takes to make an account that can do
 * real work. Company size, team, industry and the rest can be learned later from
 * what someone actually does, and asking for them here only buys drop-off.
 *
 * There is no role question. A public form is not a place to choose your own
 * permissions, and a recruiter should not have to know the product's role model
 * before they have seen the product.
 */
const Signup = () => {
  const { signUp, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const nameRef = useRef(null);

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  if (isLoading) return <Spinner label="Checking your session…" className="min-h-screen" />;
  // Already signed in: there is nothing to create, so go to the work.
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const update = (field) => (event) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  /**
   * Checked here as well as on the server.
   *
   * Not for security — the server is the authority and repeats all of it — but
   * so an obvious mistake is answered immediately instead of after a round trip.
   */
  const validate = () => {
    const errors = {};
    if (!form.name.trim()) errors.name = 'Enter your full name.';
    if (!form.email.trim()) errors.email = 'Enter your work email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errors.email = 'Enter a valid email address.';
    }
    if (!form.password) errors.password = 'Choose a password.';
    else if (form.password.length < 10) errors.password = 'Use at least 10 characters.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await signUp({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      // Already authenticated by the time this resolves, so go straight to work.
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const apiError = toApiError(error);
      const serverFields = error?.response?.data?.errors;

      // What the recruiter typed is kept. Clearing the form after a recoverable
      // failure means retyping an email address to fix a password.
      if (serverFields && typeof serverFields === 'object') {
        setFieldErrors(serverFields);
        // The field messages say it; a banner repeating them is noise.
        if (apiError.code !== 'VALIDATION_ERROR' && apiError.code !== 'EMAIL_IN_USE') {
          setFormError(apiError.message);
        }
      } else {
        setFormError(apiError.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const emailTaken = fieldErrors.email && /already exists/i.test(fieldErrors.email);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start screening candidates in a few minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:text-brand-800 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {formError && <InlineAlert tone="error" message={formError} className="mt-5" />}

      {emailTaken && (
        <div className="mt-5">
          <InlineAlert tone="warning" message="An account already exists with this email." />
          {/* The way out is offered next to the problem, so the answer to "this
              address is taken" is one click rather than a hunt for the link. */}
          <Link
            to="/login"
            state={{ email: form.email.trim() }}
            className="inline-block mt-2 text-meta font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            Sign in instead
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <AuthField
          id="name"
          label="Full name"
          icon={User}
          type="text"
          autoComplete="name"
          placeholder="Anubhav Bhatt"
          value={form.name}
          onChange={update('name')}
          error={fieldErrors.name}
          inputRef={nameRef}
        />

        <AuthField
          id="email"
          label="Work email"
          icon={Mail}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          value={form.email}
          onChange={update('email')}
          error={fieldErrors.email}
        />

        <PasswordField
          icon={Lock}
          autoComplete="new-password"
          value={form.password}
          onChange={update('password')}
          error={fieldErrors.password}
          hint="At least 10 characters."
        />

        <Button type="submit" variant="primary" size="lg" icon={UserPlus} loading={submitting} className="w-full">
          {submitting ? 'Creating your account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Signup;
