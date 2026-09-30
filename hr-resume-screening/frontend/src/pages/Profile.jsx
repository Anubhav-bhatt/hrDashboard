import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  User,
  Mail,
  Shield,
  KeyRound,
  Building,
  Calendar,
  Clock,
  Save,
  Lock,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toApiError } from '../services/api';
import { Avatar, Button, Card, InlineAlert, cx } from '../components/ui';

const Profile = () => {
  const { user, workspace, updateUserProfile, changeUserPassword } = useAuth();
  const location = useLocation();

  // Profile edit state
  const [name, setName] = useState(user?.name || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  // Scroll to password section if hash is #password
  useEffect(() => {
    if (location.hash === '#password') {
      const el = document.getElementById('password-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileSuccess('');
    setProfileError('');

    if (!name.trim()) {
      setProfileError('Full name cannot be empty.');
      return;
    }

    setProfileSaving(true);
    try {
      await updateUserProfile({ name: name.trim() });
      setProfileSuccess('Profile name updated successfully.');
    } catch (err) {
      const apiErr = toApiError(err);
      setProfileError(apiErr.message);
    } finally {
      setProfileSaving(false);
    }
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

    setPasswordSaving(true);
    try {
      await changeUserPassword({ currentPassword, newPassword });
      setPasswordSuccess('Password changed successfully. Your account is secured.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const apiErr = toApiError(err);
      setPasswordError(apiErr.message);
    } finally {
      setPasswordSaving(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Personal Profile & Security</h1>
        <p className="text-sm text-slate-500 mt-1">
          Manage your personal account settings, credentials, and workspace information.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Account Overview Card */}
        <Card padding="p-6" className="md:col-span-1 space-y-6 bg-white border border-slate-200">
          <div className="flex flex-col items-center text-center">
            <Avatar name={user?.name} size="lg" className="w-20 h-20 text-2xl font-bold mb-3 shadow-soft" />
            <h2 className="text-lg font-bold text-slate-900 truncate w-full">{user?.name}</h2>
            <p className="text-xs text-slate-500 truncate w-full">{user?.email}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={cx(
                  'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider',
                  user?.role === 'ADMIN'
                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                    : 'bg-brand-50 text-brand-700 border border-brand-200'
                )}
              >
                <Shield className="w-3 h-3" />
                {user?.role || 'RECRUITER'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Active
              </span>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
            <div className="flex items-start gap-2.5 text-slate-600">
              <Building className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-900 block">Workspace</span>
                <span className="text-slate-500">{workspace?.name || 'Default Workspace'}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-900 block">Member Since</span>
                <span className="text-slate-500">{formatDate(user?.createdAt)}</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-slate-600">
              <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-slate-900 block">Last Active</span>
                <span className="text-slate-500">{formatDateTime(user?.lastLoginAt)}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Right Column: Edit Profile & Password Sections */}
        <div className="md:col-span-2 space-y-6">
          {/* Edit Profile Information */}
          <Card padding="p-6" className="bg-white border border-slate-200">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <User className="w-5 h-5 text-brand-600" />
              <h2 className="text-base font-bold text-slate-900">Profile Information</h2>
            </div>

            {profileSuccess && <InlineAlert tone="success" message={profileSuccess} className="mb-4" />}
            {profileError && <InlineAlert tone="error" message={profileError} className="mb-4" />}

            <form onSubmit={handleProfileSubmit} className="space-y-4">
              <div>
                <label htmlFor="profile-name" className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name
                </label>
                <div className="relative rounded-md shadow-sm">
                  <input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={120}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    placeholder="Your Full Name"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  This name is displayed across recruitment activities and candidate audit trails.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-slate-500 text-sm cursor-not-allowed">
                  <Mail className="w-4 h-4 text-slate-400" />
                  <span className="truncate">{user?.email}</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Email address is your primary login identifier and is managed by administrators.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={Save}
                  loading={profileSaving}
                  disabled={profileSaving || name.trim() === user?.name}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>

          {/* Change Password Card */}
          <Card id="password-section" padding="p-6" className="bg-white border border-slate-200">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
              <KeyRound className="w-5 h-5 text-amber-600" />
              <h2 className="text-base font-bold text-slate-900">Change Password</h2>
            </div>

            {passwordSuccess && <InlineAlert tone="success" message={passwordSuccess} className="mb-4" />}
            {passwordError && <InlineAlert tone="error" message={passwordError} className="mb-4" />}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label htmlFor="current-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Password
                </label>
                <div className="relative rounded-md shadow-sm">
                  <input
                    id="current-password"
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    placeholder="Enter current password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="new-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <div className="relative rounded-md shadow-sm">
                  <input
                    id="new-password"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={10}
                    className="w-full px-3 py-2 pr-10 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    placeholder="Enter at least 10 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Must be at least 10 characters long, not easily guessable, and differing from your current password.
                </p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <div className="relative rounded-md shadow-sm">
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-colors"
                    placeholder="Repeat new password"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  icon={Lock}
                  loading={passwordSaving}
                  disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                >
                  Update Password
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Profile;
