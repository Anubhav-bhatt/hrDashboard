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
import { cx } from './ui';

const STATIC_ACTIONS = [
  // Navigation
  { id: 'nav-dashboard', label: 'Go to Dashboard', category: 'Navigation', icon: LayoutDashboard, path: '/' },
  { id: 'nav-jobs', label: 'View All Jobs', category: 'Navigation', icon: Briefcase, path: '/jobs' },
  { id: 'nav-create-job', label: 'Create New Job', category: 'Jobs', icon: Plus, path: '/jobs/create' },
  { id: 'nav-candidates', label: 'Candidates Directory', category: 'Navigation', icon: Users, path: '/candidates' },
  { id: 'nav-import', label: 'Import Resumes', category: 'Actions', icon: Upload, path: '/import' },
  
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
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);

      // Load jobs for dynamic search
      setLoadingJobs(true);
      getJobsSummary({ limit: 50 })
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

  const filteredStatic = STATIC_ACTIONS.filter((action) =>
    action.label.toLowerCase().includes(cleanQuery) ||
    action.category.toLowerCase().includes(cleanQuery)
  );

  const filteredJobs = cleanQuery
    ? jobs.filter((j) =>
        (j.title || '').toLowerCase().includes(cleanQuery) ||
        (j.department || '').toLowerCase().includes(cleanQuery) ||
        (j.location || '').toLowerCase().includes(cleanQuery)
      ).map((j) => ({
        id: `job-${j.id}`,
        label: j.title || 'Untitled Role',
        subtitle: `${j.department || 'General'} • ${j.location || 'Remote'}`,
        category: 'Jobs',
        icon: Briefcase,
        path: `/jobs/${j.id}`
      }))
    : [];

  const allItems = [...filteredJobs, ...filteredStatic];

  const handleSelect = (item) => {
    if (!item) return;
    onClose();
    navigate(item.path);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
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
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-sm text-slate-900 placeholder-slate-400"
            placeholder="Type a command or search jobs, candidates..."
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
              No matching commands or jobs found for "{query}".
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
