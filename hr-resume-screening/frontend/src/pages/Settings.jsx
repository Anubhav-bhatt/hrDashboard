import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mail,
  Monitor,
  Shield,
  ShieldCheck,
  User
} from 'lucide-react';
import { disconnectOutlook, getOutlookConnectUrl, getOutlookStatus, toApiError } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ToastProvider';
import ThemeSelector from '../components/ThemeSelector';
import { Avatar, Badge, Button, Card, CardHeader, InlineAlert, PageHeader, Skeleton } from '../components/ui';

/**
 * Settings — account, appearance and integrations.
 *
 * These three used to be spread across the sidebar, the top bar and the account
 * menu, where a recruiter met them on every screen despite touching them a few
 * times a year. Gathering them here is what allows daily navigation to be four
 * destinations, and it also means the mailbox connection is only checked when
 * somebody actually looks at it.
 */
const Settings = () => {
  const { user, signOut, changeUserPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [outlook, setOutlook] = useState({ loading: true, connected: false, email: '', displayName: '' });
  const [disconnecting, setDisconnecting] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Scroll to security section if hash is #security
  useEffect(() => {
    if (location.hash === '#security') {
      const el = document.getElementById('security');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  // Re-read after the OAuth redirect returns with ?outlook_connected.
  const outlookRedirect = searchParams.get('outlook_connected');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await getOutlookStatus({ signal: controller.signal });
        if (!active) return;
        setOutlook({
          loading: false,
          connected: Boolean(response.data?.connected),
          email: response.data?.email || '',
          displayName: response.data?.displayName || ''
        });
      } catch {
        if (active) setOutlook({ loading: false, connected: false, email: '', displayName: '' });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [outlookRedirect]);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectOutlook();
      setOutlook({ loading: false, connected: false, email: '', displayName: '' });
      toast.success('Outlook mailbox disconnected.');
    } catch (error) {
      toast.error(toApiError(error).message);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.info('You have been signed out.');
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordSuccess('');
    setPasswordError('');

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }

    if (!newPassword || newPassword.length < 10) {
      setPasswordError('New password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirm password do not match.');
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    setPasswordSaving(true);
    try {
      await changeUserPassword({ currentPassword, newPassword });
      setPasswordSuccess(
        "Password changed successfully. For security, you've been signed out of existing sessions. Redirecting to sign in..."
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: {
            message:
              "Password changed successfully. For security, you've been signed out of existing sessions. Please sign in again with your new password."
          }
        });
      }, 1500);
    } catch (err) {
      const apiErr = toApiError(err);
      setPasswordError(apiErr.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Workspace" title="Settings" description="Your account, how the app looks, and connected services." />

      {/*
        Section navigation.
        On desktop it is a quiet left rail; on mobile the same list becomes a
        horizontal row of anchors. Either way it is real in-page anchors rather
        than tab state, so a link to a section works and Back behaves normally.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] gap-5 lg:gap-8">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex lg:flex-col gap-1 overflow-x-auto scroll-slim -mx-1 px-1 lg:mx-0 lg:px-0">
            {[
              { href: '#account', label: 'Account', icon: User },
              { href: '#security', label: 'Security', icon: Shield },
              { href: '#appearance', label: 'Appearance', icon: Monitor },
              { href: '#integrations', label: 'Integrations', icon: Mail }
            ].map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="flex items-center gap-2.5 h-9 px-3 rounded-control text-body font-medium text-slate-600
                             hover:bg-slate-100 hover:text-slate-900 transition-colors duration-fast whitespace-nowrap
                             focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
                >
                  <item.icon className="w-[18px] h-[18px] text-slate-400 shrink-0" aria-hidden="true" />
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-5">
          {/* ------------------------------------------------------ Account --- */}
          <Card id="account" className="scroll-mt-20">
            <CardHeader
              title="Account"
              description="The recruiter account you are signed in with."
              icon={User}
            />
            <div className="mt-4 flex items-center gap-4">
              <Avatar name={user?.name || user?.email} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-card-title text-slate-900 truncate">{user?.name || 'Recruiter'}</p>
                <p className="text-meta text-slate-500 truncate">{user?.email}</p>
                <Badge variant="brand" className="mt-2">
                  {user?.role === 'ADMIN' ? 'Administrator' : 'Recruiter'}
                </Badge>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <p className="text-meta text-slate-500">Signing out ends this session on this device.</p>
              <Button variant="secondary" icon={LogOut} onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </Card>

          {/* ----------------------------------------------------- Security --- */}
          <Card id="security" className="scroll-mt-20">
            <CardHeader
              title="Security"
              description="Change your password and manage credentials."
              icon={Shield}
            />

            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4 max-w-xl" noValidate>
              {passwordSuccess && (
                <InlineAlert
                  tone="success"
                  message={passwordSuccess}
                  className="mb-4"
                />
              )}
              {passwordError && (
                <InlineAlert
                  tone="error"
                  message={passwordError}
                  className="mb-4"
                />
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-current-password"
                  className="block text-body font-medium text-slate-700"
                >
                  Current password
                </label>
                <div className="relative">
                  <input
                    id="settings-current-password"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => {
                      setCurrentPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Enter your current password"
                    className="input w-full pr-10"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-new-password"
                  className="block text-body font-medium text-slate-700"
                >
                  New password
                </label>
                <div className="relative">
                  <input
                    id="settings-new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Enter new password (min. 10 characters)"
                    className="input w-full pr-10"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Must be at least 10 characters. After updating, all existing sessions on other devices will be invalidated.
                </p>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-confirm-password"
                  className="block text-body font-medium text-slate-700"
                >
                  Confirm new password
                </label>
                <div className="relative">
                  <input
                    id="settings-confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    placeholder="Confirm your new password"
                    className="input w-full pr-10"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  For security, changing password invalidates all sessions and requires fresh login.
                </p>
                <Button
                  type="submit"
                  variant="primary"
                  icon={KeyRound}
                  loading={passwordSaving}
                  disabled={passwordSaving || !currentPassword || !newPassword}
                >
                  Change password
                </Button>
              </div>
            </form>
          </Card>

          {/* -------------------------------------------------- Integrations --- */}
          <Card id="integrations" className="scroll-mt-20">
            <CardHeader
              title="Integrations"
              description="Connect a mailbox to import candidate applications automatically."
              icon={Mail}
            />

            <div className="mt-4 rounded-card border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold text-slate-900 inline-flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    Microsoft Outlook
                  </p>

                  {outlook.loading ? (
                    <Skeleton className="h-3 w-40 mt-2" />
                  ) : outlook.connected ? (
                    <>
                      <Badge variant="success" className="mt-2">
                        Connected
                      </Badge>
                      <p className="text-meta text-slate-600 mt-2 truncate" title={outlook.email}>
                        {outlook.email || outlook.displayName || 'Mailbox connected'}
                      </p>
                    </>
                  ) : (
                    <>
                      <Badge variant="neutral" className="mt-2">
                        Not connected
                      </Badge>
                      <p className="text-meta text-slate-500 mt-2">
                        Uploading resumes works without this. Connect a mailbox only if you want to pull applications
                        straight from email.
                      </p>
                    </>
                  )}
                </div>

                {!outlook.loading &&
                  (outlook.connected ? (
                    <Button variant="secondary" onClick={handleDisconnect} loading={disconnecting}>
                      Disconnect
                    </Button>
                  ) : (
                    <a href={getOutlookConnectUrl()} className="btn btn-md btn-primary shrink-0">
                      Connect mailbox
                    </a>
                  ))}
              </div>
            </div>
          </Card>

          {/* --------------------------------------------------- Appearance --- */}
          <Card id="appearance" className="scroll-mt-20">
            <CardHeader title="Appearance" description="Applies to this browser." icon={Monitor} />
            <div className="mt-4">
              <ThemeSelector />
            </div>
            <p className="text-meta text-slate-500 mt-3">
              System follows your device's light or dark setting.
            </p>
          </Card>

          <Card>
            <CardHeader title="Candidate data" description="How this workspace handles personal data." icon={ShieldCheck} />
            <ul className="mt-3 space-y-2 text-meta text-slate-600 list-disc pl-4">
              <li>Candidate details are only visible to signed-in recruiters.</li>
              <li>Resumes are streamed through the app, never from a public link.</li>
              <li>Match scores are decision support — every hiring decision stays with your team.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Settings;
