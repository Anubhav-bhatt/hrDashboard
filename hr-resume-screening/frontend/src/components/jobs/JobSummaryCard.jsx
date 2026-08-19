import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  UserPlus,
  Users,
  MoreVertical,
  Upload,
  Bot,
  Sparkles,
  Archive,
  ExternalLink,
  MapPin,
  Building
} from 'lucide-react';
import { Avatar, JobStatusBadge, Button, cx } from '../ui';
import { formatDate, formatExperience, formatRelativeTime } from '../../utils/format';

const PROCESSING_META = {
  COMPLETED: { label: 'All scored', variant: 'success' },
  READY_FOR_ANALYSIS: { label: 'Ready to score', variant: 'warning' },
  IMPORTING: { label: 'Importing', variant: 'info' },
  NEW: { label: 'New', variant: 'neutral' }
};

export const JobSummaryCard = ({
  job,
  strongMatchThreshold = 80,
  compact = false,
  onCloseJob
}) => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isClosed = job.status === 'CLOSED';
  const hire = job.selectedCandidate || null;
  const canClose = !isClosed && job.shortlistedCount > 0;
  const bodyHref = isClosed ? `/jobs/${job.id}` : `/jobs/${job.id}/candidates`;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  return (
    <div className="card hover:shadow-card-hover hover:border-slate-300 transition duration-150 flex flex-col justify-between relative group">
      {/* Top Details & Header */}
      <div className={compact ? 'p-4' : 'p-5'}>
        {/* Status + Department + Action menu */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <JobStatusBadge status={job.status} />
            <span className="text-[11px] font-medium text-slate-400">
              {job.department || 'General'}
            </span>
          </div>

          {/* Contextual ⋯ Action Menu */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Job actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-1 w-48 rounded-xl bg-white border border-slate-200 shadow-xl py-1 z-30 text-xs animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  <span>Job Workspace</span>
                </Link>

                {!isClosed && (
                  <>
                    <Link
                      to={`/jobs/${job.id}/import`}
                      className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      <span>Import Resumes</span>
                    </Link>

                    <Link
                      to={`/ai/ranking?jobId=${job.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Bot className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Rank Candidates (AI)</span>
                    </Link>

                    {canClose && onCloseJob && (
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 text-amber-700 hover:bg-amber-50 text-left border-t border-slate-100 mt-1"
                        onClick={() => {
                          setMenuOpen(false);
                          onCloseJob(job);
                        }}
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Close & Select Hire</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Job Title */}
        <Link
          to={bodyHref}
          className="font-bold text-base text-slate-900 hover:text-indigo-600 transition-colors line-clamp-2 mt-2 block"
        >
          {job.title}
        </Link>

        {/* Location & Experience requirements */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1.5">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
              {job.location}
            </span>
          )}
          {typeof job.minExperience === 'number' && (
            <span>Min {job.minExperience} yrs exp</span>
          )}
        </div>

        {/* Required Skills Chips */}
        {job.requiredSkills?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {job.requiredSkills.slice(0, 3).map((skill, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600"
              >
                {skill}
              </span>
            ))}
            {job.requiredSkills.length > 3 && (
              <span className="text-[10px] text-slate-400 self-center">
                +{job.requiredSkills.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Closed Role Summary */}
        {isClosed && (
          <div className="mt-3.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            {hire ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Hired Candidate
                </p>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="min-w-0">
                    <p className="font-bold text-xs text-slate-900 truncate">{hire.name}</p>
                    <p className="text-[10px] text-slate-500 truncate">{hire.currentRole || 'Candidate'}</p>
                  </div>
                  {typeof hire.overallScore === 'number' && (
                    <span className="text-xs font-extrabold text-emerald-600 tabular-nums">
                      {hire.overallScore}%
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Position filled and closed.</p>
            )}
            <p className="text-[10px] text-slate-400 mt-2 border-t border-slate-200/60 pt-1.5">
              Closed on {formatDate(job.closedAt)}
            </p>
          </div>
        )}
      </div>

      {/* Footer Metrics & Actions */}
      {!isClosed && (
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <div>
              <span className="font-extrabold text-slate-900">{job.candidateCount || 0}</span>
              <span className="text-slate-400 ml-1">applicants</span>
            </div>
            {job.shortlistedCount > 0 && (
              <div className="text-emerald-600 font-semibold">
                <span>{job.shortlistedCount}</span>
                <span className="ml-1">shortlisted</span>
              </div>
            )}
          </div>

          <Link
            to={bodyHref}
            className="btn btn-sm btn-ghost text-xs font-semibold hover:bg-slate-100 text-indigo-600"
          >
            Review
            <ArrowRight className="w-3 h-3 ml-1" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default JobSummaryCard;
