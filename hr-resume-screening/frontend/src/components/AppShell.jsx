import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Sparkles,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { disconnectOutlook, getOutlookConnectUrl, getOutlookStatus, toApiError } from '../services/api';
import { useToast } from './ToastProvider';
import { Avatar, Button, cx } from './ui';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/candidates', label: 'Candidates', icon: Users },
  { to: '/jobs', label: 'Jobs', icon: Briefcase }
];

/**
 * Application chrome: sidebar navigation on desktop, a slide-over drawer on
 * mobile, and a top bar carrying the Outlook connection state and account menu.
 */
const AppShell = ({ children }) => {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const toast = useToast();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [outlook, setOutlook] = useState({ loading: true, connected: false, email: '' });

  const accountRef = useRef(null);

  // Close transient UI on navigation.
  useEffect(() => {
    setMobileNavOpen(false);
    setAccountOpen(false);
  }, [location.pathname, location.search]);

  // Outlook status is re-read after the OAuth redirect adds ?outlook_connected.
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
          email: response.data?.email || ''
        });
      } catch {
        if (active) setOutlook({ loading: false, connected: false, email: '' });
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [location.search]);

  // Dismiss the account menu on outside click or Escape.
  useEffect(() => {
    if (!accountOpen) return undefined;

    const onPointerDown = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) setAccountOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  // Lock body scroll behind the mobile drawer.
  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  const handleDisconnect = async () => {
    try {
      await disconnectOutlook();
      setOutlook({ loading: false, connected: false, email: '' });
      toast.success('Outlook mailbox disconnected.');
    } catch (error) {
      toast.error(toApiError(error).message);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.info('You have been signed out.');
  };

  const navLinkClass = ({ isActive }) =>
    cx(
      'flex items-center gap-2.5 px-3 py-2 rounded-control text-meta font-medium transition-colors duration-fast',
      isActive ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    );

  const SidebarContent = (
    <>
      <Link to="/" className="flex items-center gap-2.5 px-1 py-1 rounded-control">
        <div className="w-9 h-9 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
          <Sparkles className="w-4.5 h-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="text-card-title text-slate-900 leading-tight truncate">Resume Screening</p>
          <p className="text-[11px] text-slate-500">Recruitment dashboard</p>
        </div>
      </Link>

      <nav className="mt-6 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
            <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 pt-6 divider">
        <Link to="/jobs/new" className="btn btn-md btn-primary w-full">
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create job
        </Link>
      </div>

      {/* Outlook connection state */}
      <div className="mt-auto pt-6">
        <div className="rounded-card border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-label uppercase text-slate-500">
            <Mail className="w-3.5 h-3.5" aria-hidden="true" />
            Outlook
          </div>

          {outlook.loading ? (
            <p className="text-xs text-slate-400 mt-2">Checking…</p>
          ) : outlook.connected ? (
            <>
              <p className="text-xs font-semibold text-emerald-700 mt-2 truncate" title={outlook.email}>
                {outlook.email || 'Connected'}
              </p>
              <button
                type="button"
                onClick={handleDisconnect}
                className="text-[11px] font-semibold text-slate-500 hover:text-rose-700 mt-1.5 transition-colors duration-fast rounded"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="text-xs text-slate-500 mt-2">Not connected. Resume upload still works.</p>
              <a href={getOutlookConnectUrl()} className="btn btn-sm btn-secondary w-full mt-2.5">
                Connect mailbox
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3 focus:px-4 focus:py-2 focus:bg-white focus:rounded-control focus:shadow-overlay focus:text-meta focus:font-semibold"
      >
        Skip to main content
      </a>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col border-r border-slate-200 bg-white px-4 py-5 z-30">
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-slate-900/40 animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="relative w-72 max-w-[85vw] bg-white px-4 py-5 flex flex-col shadow-overlay animate-slide-in-right"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <Button
              variant="ghost"
              size="iconSm"
              icon={X}
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-4 right-3"
              aria-label="Close navigation menu"
            />
            {SidebarContent}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-14 border-b border-slate-200 bg-white/90 backdrop-blur flex items-center gap-3 px-4 sm:px-6">
          <Button
            variant="ghost"
            size="iconSm"
            icon={Menu}
            className="lg:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileNavOpen}
          />

          <div className="lg:hidden flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-control bg-brand-600 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
            </div>
            <span className="text-card-title truncate">Resume Screening</span>
          </div>

          <div className="flex-1" />

          {!outlook.loading && (
            <span
              className={cx(
                'hidden sm:inline-flex badge',
                outlook.connected ? 'badge-success' : 'badge-neutral'
              )}
              title={outlook.connected ? `Outlook connected: ${outlook.email}` : 'Outlook not connected'}
            >
              <span
                className={cx('w-1.5 h-1.5 rounded-pill', outlook.connected ? 'bg-emerald-500' : 'bg-slate-400')}
                aria-hidden="true"
              />
              {outlook.connected ? 'Outlook connected' : 'Outlook offline'}
            </span>
          )}

          {/* Account menu */}
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-control hover:bg-slate-100 transition-colors duration-fast"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <Avatar name={user?.name || user?.email} size="sm" />
              <span className="hidden sm:block text-meta font-semibold text-slate-800 max-w-[10rem] truncate">
                {user?.name || user?.email}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
            </button>

            {accountOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-60 card shadow-overlay p-0 overflow-hidden animate-slide-up"
              >
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-meta font-semibold text-slate-900 truncate">{user?.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  <span className="badge badge-brand mt-2">{user?.role === 'ADMIN' ? 'Administrator' : 'Recruiter'}</span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-meta font-medium text-slate-700 hover:bg-slate-50 transition-colors duration-fast"
                >
                  <LogOut className="w-4 h-4 text-slate-400" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main id="main-content" className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          {children}
        </main>

        <footer className="px-4 sm:px-6 py-6 max-w-[1400px] mx-auto">
          <p className="text-xs text-slate-400 border-t border-slate-200 pt-5">
            Relevance scores are decision-support signals only. Every hiring decision stays with your recruiters.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default AppShell;
