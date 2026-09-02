import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  LayoutDashboard,
  Briefcase,
  Users,
  Upload,
  Bot,
  Sparkles,
  ListOrdered,
  GitCompare,
  TrendingUp,
  Settings,
  Plus,
  ArrowRight,
  Command,
  X
} from 'lucide-react';
import { getJobsSummary } from '../services/api';
import { buildAgentPath, SOURCE_WORKFLOWS, useRecruitmentContext } from '../context/RecruitmentContext';
import { cx } from './ui';

const STATIC_ACTIONS = [
  // Navigation
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    subtitle: 'View hiring priorities and recruitment overview',
    category: 'Navigation',
    icon: LayoutDashboard,
    path: '/dashboard'
  },
  { id: 'nav-jobs', label: 'View All Jobs', category: 'Navigation', icon: Briefcase, path: '/jobs' },
  // `/jobs/new` is the real route. This previously pointed at `/jobs/create`,
  // which matches no static route and therefore resolved to `/jobs/:id` with an
  // id of "create" — a job lookup that could only 404.
  { id: 'nav-create-job', label: 'Create New Job', category: 'Jobs', icon: Plus, path: '/jobs/new' },
  { id: 'nav-candidates', label: 'Candidates Directory', category: 'Navigation', icon: Users, path: '/candidates' },
  // Importing is always into a specific job — there is no job-less import screen,
  // which is why the old bare `/import` fell through to Not Found. Instead of a
  // dead path, this asks which job and then goes straight there.
  { id: 'nav-import', label: 'Import Resumes', category: 'Actions', icon: Upload, requiresJob: true },

  // AI Tools
  { id: 'ai-workspace', label: 'Open AI Recruitment Workspace', category: 'AI Tools', icon: Bot, path: '/ai' },
  { id: 'ai-screening', label: 'Screen Candidate with AI', category: 'AI Tools', icon: Sparkles, path: '/ai/screening' },
  { id: 'ai-ranking', label: 'Rank Candidates by Match Fit', category: 'AI Tools', icon: ListOrdered, path: '/ai/ranking' },
  { id: 'ai-comparison', label: 'Compare Candidates Side-by-Side', category: 'AI Tools', icon: GitCompare, path: '/ai/comparison' },
  { id: 'ai-insights', label: 'View Recruitment Insights', category: 'AI Tools', icon: TrendingUp, path: '/ai/insights' },
  
  // System
  { id: 'nav-settings', label: 'Settings & Integrations', category: 'System', icon: Settings, path: '/settings' }
];

export const CommandPalette = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { currentJobId } = useRecruitmentContext();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  /*
   * An action that needs a job it was not given.
   *
   * Rather than sending the recruiter to a screen that will ask for a job, the
   * palette asks here and then goes straight to the destination. One step
   * instead of two, and the answer never has to be repeated.
   */
  const [pendingAction, setPendingAction] = useState(null);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setPendingAction(null);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Load jobs for dynamic search
      setLoadingJobs(true);
      getJobsSummary({ status: 'OPEN', limit: 50 })
        .then((res) => {
          const list = res?.data || (Array.isArray(res) ? res : []);
          setJobs(list);
        })
        .catch(() => {})
        .finally(() => setLoadingJobs(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter items
  const cleanQuery = query.toLowerCase().trim();

  const matchesJob = (job) =>
    (job.title || '').toLowerCase().includes(cleanQuery) ||
    (job.department || '').toLowerCase().includes(cleanQuery) ||
    (job.location || '').toLowerCase().includes(cleanQuery);

  /** The role the recruiter is already working on, if it is one we loaded. */
  const activeJob = currentJobId ? jobs.find((job) => job.id === currentJobId) || null : null;

  /**
   * Where an action goes once a job is known.
   *
   * Centralised so the direct path and the "which job?" path cannot resolve
   * differently for the same action.
   */
  const resolveJobPath = (actionId, jobId) => {
    if (actionId === 'nav-import') return `/jobs/${jobId}/import`;
    if (actionId === 'ctx-rank') return buildAgentPath('ranking', { jobId, source: SOURCE_WORKFLOWS.dashboard });
    if (actionId === 'ctx-candidates') return `/jobs/${jobId}/candidates`;
    return `/jobs/${jobId}`;
  };

  /*
   * Commands phrased around the role in hand.
   *
   * The palette already knows which job the recruiter is on, so it can offer the
   * next things they would do to it by name instead of making them navigate to
   * the job and start again.
   */
  const contextActions = activeJob
    ? [
        {
          id: 'ctx-import',
          label: `Add candidates to ${activeJob.title}`,
          category: 'This role',
          icon: Upload,
          path: `/jobs/${activeJob.id}/import`
        },
        {
          id: 'ctx-candidates',
          label: `View ${activeJob.title} candidates`,
          category: 'This role',
          icon: Users,
          path: `/jobs/${activeJob.id}/candidates`
        },
        {
          id: 'ctx-rank',
          label: `Rank ${activeJob.title} candidates`,
          category: 'This role',
          icon: ListOrdered,
          path: buildAgentPath('ranking', { jobId: activeJob.id, source: SOURCE_WORKFLOWS.dashboard })
        }
      ].filter((action) => action.label.toLowerCase().includes(cleanQuery) || 'this role'.includes(cleanQuery))
    : [];

  const filteredStatic = STATIC_ACTIONS.filter((action) =>
    action.label.toLowerCase().includes(cleanQuery) ||
    action.category.toLowerCase().includes(cleanQuery)
  );

  const filteredJobs = cleanQuery
    ? jobs.filter(matchesJob).map((j) => ({
        id: `job-${j.id}`,
        label: j.title || 'Untitled Role',
        subtitle: `${j.department || 'General'} • ${j.location || 'Remote'}`,
        category: 'Jobs',
        icon: Briefcase,
        path: `/jobs/${j.id}`
      }))
    : [];

  // Step two: the action is chosen, only the job is missing.
  const jobChoices = pendingAction
    ? jobs
        .filter((job) => (cleanQuery ? matchesJob(job) : true))
        .map((job) => ({
          id: `pick-${job.id}`,
          label: job.title || 'Untitled Role',
          subtitle: `${job.candidateCount || 0} candidate${job.candidateCount === 1 ? '' : 's'}`,
          category: 'Choose a job',
          icon: Briefcase,
          path: resolveJobPath(pendingAction.id, job.id)
        }))
    : [];

  const allItems = pendingAction ? jobChoices : [...contextActions, ...filteredJobs, ...filteredStatic];

  const handleSelect = (item) => {
    if (!item) return;

    // An action that needs a job and has none: stay open and ask, rather than
    // navigating somewhere that would ask on our behalf.
    if (item.requiresJob && !item.path) {
      if (activeJob) {
        onClose();
        navigate(resolveJobPath(item.id, activeJob.id));
        return;
      }
      setPendingAction(item);
      setQuery('');
      setSelectedIndex(0);
      inputRef.current?.focus();
      return;
    }

    onClose();
    navigate(item.path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      // Escape backs out of the job question before it closes the palette.
      if (pendingAction) {
        setPendingAction(null);
        setQuery('');
        setSelectedIndex(0);
        return;
      }
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < allItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allItems[selectedIndex]) {
        handleSelect(allItems[selectedIndex]);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-slate-950/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="w-full max-w-xl bg-white border border-slate-200 rounded-card shadow-overlay overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200 bg-slate-50/50">
          {pendingAction ? (
            <span
              className="inline-flex items-center gap-1.5 shrink-0 rounded-pill bg-brand-50 border border-brand-200 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
            >
              <Upload className="w-3 h-3" aria-hidden="true" />
              {pendingAction.label}
            </span>
          ) : (
            <Search className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
          )}
          <input
            ref={inputRef}
            type="text"
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-slate-900 placeholder-slate-400"
            placeholder={
              pendingAction ? 'Which job? Type to filter…' : 'Type a command or search jobs, candidates...'
            }
            aria-label={pendingAction ? `Choose a job for ${pendingAction.label}` : 'Search commands and jobs'}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="overflow-y-auto scroll-slim divide-y divide-slate-100 p-2">
          {allItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {pendingAction
                ? loadingJobs
                  ? 'Loading your jobs…'
                  : 'No matching job. Press Escape to go back.'
                : `No matching commands or jobs found for "${query}".`}
            </div>
          ) : (
            allItems.map((item, idx) => {
              const Icon = item.icon || ArrowRight;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cx(
                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-colors',
                    isSelected
                      ? 'bg-brand-50 text-brand-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Icon className={cx('w-4 h-4 shrink-0', isSelected ? 'text-brand-600' : 'text-slate-400')} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{item.label}</p>
                      {item.subtitle && (
                        <p className="text-[11px] text-slate-400 font-normal truncate">{item.subtitle}</p>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider shrink-0">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono bg-slate-200 px-1 py-0.2 rounded text-[10px]">↑</kbd> <kbd className="font-mono bg-slate-200 px-1 py-0.2 rounded text-[10px]">↓</kbd> to navigate</span>
            <span><kbd className="font-mono bg-slate-200 px-1 py-0.2 rounded text-[10px]">↵</kbd> to select</span>
          </div>
          <span>HR Screening OS</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
