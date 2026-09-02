import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MoreVertical,
  Trash2,
  Upload
} from 'lucide-react';
import { JobStatusBadge, cx } from '../ui';
import { formatDate } from '../../utils/format';
import { deriveNextAction } from '../dashboard/NeedsAttention';

/**
 * One role, scannable in a couple of seconds.
 *
 * Deliberately not a small job page: the title, where it is, what it screens
 * for, how far it has got, and one way in. Everything else — the JD, the full
 * skill list, salary, qualifications — lives in the workspace, where there is
 * room to read it.
 *
 * A note on fields. This card previously rendered `job.department` with a
 * fallback of "General" and `job.location` / `job.minExperience` beside it. None
 * of those three exist: the Job model has no department or location column, so
 * every card in the product displayed the word "General" as though it were data,
 * and the other two branches could never render. The real fields are
 * `requirements.preferredLocations` and `requirements.minimumExperience`, which
 * is what is read here — and when they are absent the line is simply omitted.
 */

/** A metric worth showing, or nothing. Zero is a real answer; null is not. */
const Metric = ({ value, label, tone = 'default' }) => (
  <div className="min-w-0">
    <p
      className={cx(
        'text-body font-bold tabular-nums leading-none',
        tone === 'strong' ? 'text-emerald-700' : 'text-slate-900'
      )}
    >
      {value}
    </p>
    <p className="text-meta text-slate-500 mt-1 truncate">{label}</p>
  </div>
);

export const JobSummaryCard = ({ job, strongMatchThreshold = 80, compact = false, onCloseJob, onDeleteJob }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const isClosed = job.status === 'CLOSED';
  const hire = job.selectedCandidate || null;
  const canClose = !isClosed && job.shortlistedCount > 0;
  const bodyHref = isClosed ? `/jobs/${job.id}` : `/jobs/${job.id}/candidates`;

  const reqs = job.requirements || {};
  const location = reqs.preferredLocations?.[0] || null;
  const minExperience = typeof reqs.minimumExperience === 'number' && reqs.minimumExperience > 0
    ? reqs.minimumExperience
    : null;
  const bestMatch = typeof job.bestMatchScore === 'number' ? job.bestMatchScore : null;
  const nextAction = !isClosed ? deriveNextAction(job, strongMatchThreshold) : null;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    // Escape closes it too — a menu that only a mouse can dismiss traps a
    // keyboard user who opened it by accident.
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  if (compact) {
    const facts = [
      `${(job.candidateCount || 0).toLocaleString('en-IN')} candidate${job.candidateCount === 1 ? '' : 's'}`,
      job.strongMatchCount > 0 ? `${job.strongMatchCount} strong match${job.strongMatchCount === 1 ? '' : 'es'}` : null,
      job.shortlistedCount > 0 ? `${job.shortlistedCount} shortlisted` : null,
      isClosed && hire?.name ? `Selected: ${hire.name}` : null
    ].filter(Boolean);

    return (
      <article className="jobs-grid jobs-row group">
        <div className="min-w-0">
          {/*
            The badge holds its place beside the title rather than wrapping onto
            a line of its own. Allowed to wrap it added a whole line to the row
            for long roles — the height came from the badge, not from the title
            that actually needed the space.
          */}
          <div className="flex items-start gap-2">
            {/*
              The role stays the dominant field and is allowed two lines before
              it truncates. A bounded `minmax` on the column is what keeps a long
              title from dragging the numeric and action columns out of
              alignment, so the title does not have to be cut short to protect
              them.
            */}
            <h3 className="text-card-title text-slate-900 min-w-0 break-words line-clamp-2">
              <Link
                to={`/jobs/${job.id}`}
                className="rounded hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {job.title}
              </Link>
            </h3>
            <span className="shrink-0 mt-0.5">
              <JobStatusBadge status={job.status} />
            </span>
          </div>
          {/*
            Below the table breakpoint this line is where the counts are read,
            which is why the numeric columns can be dropped there rather than
            crushed.
          */}
          <p className="text-meta text-slate-600 mt-1 truncate">{facts.join(' · ')}</p>
        </div>

        <p className="jobs-row-metric">{(job.candidateCount || 0).toLocaleString('en-IN')}</p>
        <p className={cx('jobs-row-metric', job.strongMatchCount > 0 ? '!text-emerald-700' : '!text-slate-500')}>
          {job.strongMatchCount || '—'}
        </p>
        <p className="jobs-row-metric">{job.shortlistedCount || '—'}</p>

        {/*
          A quiet text action, anchored to the left of its column so the space
          between it and the shortlisted figure is the column gap on every row —
          not a leftover that shrinks as the label grows. The "Next:" prefix it
          used to carry has gone: the column is headed Next, so the row was
          saying it twice, and the repetition cost 38px in the one column that
          did not have it to spare.
        */}
        <Link
          to={nextAction?.to || `/jobs/${job.id}`}
          className="jobs-row-next btn btn-sm btn-ghost text-brand-700"
          aria-label={`${nextAction?.actionLabel || 'View hiring summary'} for ${job.title}`}
        >
          {nextAction?.actionLabel || 'View hiring summary'}
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-fast" aria-hidden="true" />
        </Link>
      </article>
    );
  }

  return (
    <div
      className="card group relative flex flex-col justify-between
                 transition-[transform,box-shadow,border-color] duration-slow
                 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card-hover
                 focus-within:border-slate-300 focus-within:shadow-card-hover"
    >
      <div className={compact ? 'p-4' : 'p-5'}>
        <div className="flex items-start justify-between gap-2">
          <JobStatusBadge status={job.status} />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="p-1 rounded-control text-slate-400 hover:text-slate-700 hover:bg-slate-100
                         transition-colors duration-fast focus-visible:outline-none
                         focus-visible:ring-2 focus-visible:ring-brand-500"
              aria-label={`Actions for ${job.title}`}
            >
              <MoreVertical className="w-4 h-4" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-52 rounded-card bg-white border border-slate-200
                           shadow-overlay py-1 z-30 animate-fade-in"
                onClick={(e) => e.stopPropagation()}
              >
                <Link
                  to={`/jobs/${job.id}`}
                  role="menuitem"
                  className="flex items-center gap-2 px-3 py-2 text-meta text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                  <span>Job workspace</span>
                </Link>

                {!isClosed && (
                  <>
                    <Link
                      to={`/jobs/${job.id}/import`}
                      role="menuitem"
                      className="flex items-center gap-2 px-3 py-2 text-meta text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Upload className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                      <span>Add candidates</span>
                    </Link>

                    <Link
                      to={`/ai/ranking?jobId=${job.id}`}
                      role="menuitem"
                      className="flex items-center gap-2 px-3 py-2 text-meta text-slate-700 hover:bg-slate-50"
                      onClick={() => setMenuOpen(false)}
                    >
                      <Bot className="w-3.5 h-3.5 text-brand-600" aria-hidden="true" />
                      <span>Rank candidates</span>
                    </Link>

                    {canClose && onCloseJob && (
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full flex items-center gap-2 px-3 py-2 text-meta text-amber-800
                                   hover:bg-amber-50 text-left border-t border-slate-100 mt-1"
                        onClick={() => {
                          setMenuOpen(false);
                          onCloseJob(job);
                        }}
                      >
                        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Close job</span>
                      </button>
                    )}
                  </>
                )}

                {/*
                  Deletion lives in the overflow menu, never as a button on the
                  row. A red control repeated down a list of finished roles is a
                  standing invitation to a mistake, and this one cannot be undone
                  — it is reached deliberately or not at all. Shown only to an
                  ADMIN, matching what the API will actually allow.
                */}
                {isClosed && onDeleteJob && (
                  <button
                    type="button"
                    role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 text-meta text-rose-700
                               hover:bg-rose-50 text-left border-t border-slate-100 mt-1"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteJob(job);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Delete job data</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <h3 className="mt-2.5">
          <Link
            to={bodyHref}
            className="text-card-title text-slate-900 hover:text-brand-700 transition-colors duration-fast
                       line-clamp-2 block rounded focus-visible:outline-none
                       focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {job.title}
          </Link>
        </h3>

        {/* Only rendered when the role actually states one of these. */}
        {(location || minExperience !== null) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-slate-500 mt-1.5">
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
                {location}
              </span>
            )}
            {minExperience !== null && <span>Min {minExperience} yrs experience</span>}
          </p>
        )}

        {job.requiredSkills?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            {job.requiredSkills.slice(0, 3).map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center px-2 py-0.5 rounded-control bg-slate-100 text-meta text-slate-600"
              >
                {skill}
              </span>
            ))}
            {job.requiredSkills.length > 3 && (
              <span className="text-meta text-slate-500">+{job.requiredSkills.length - 3}</span>
            )}
          </div>
        )}

        {isClosed && (
          <div className="mt-4 rounded-control border border-slate-200 bg-slate-50 p-3">
            {hire ? (
              <>
                <p className="text-label uppercase text-emerald-700 inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                  Hired
                </p>
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  <div className="min-w-0">
                    <p className="text-meta font-bold text-slate-900 truncate">{hire.name}</p>
                    {hire.currentRole && <p className="text-meta text-slate-500 truncate">{hire.currentRole}</p>}
                  </div>
                  {typeof hire.overallScore === 'number' && (
                    <span className="text-meta font-bold text-emerald-700 tabular-nums shrink-0">
                      {hire.overallScore}%
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="text-meta text-slate-600">Closed without a recorded selection.</p>
            )}
            <p className="text-meta text-slate-500 mt-2 pt-2 border-t border-slate-200">
              Closed {formatDate(job.closedAt)}
            </p>
          </div>
        )}
      </div>

      {/*
        Progress, as four numbers.
        Best match is omitted rather than shown as 0% when nothing is scored —
        an unscored pool has no best match, and 0% would read as a bad one.
      */}
      {!isClosed && (
        <div className="px-5 pb-4">
          {/*
            Two by two, not one by four.
            The card sits in a three-column grid, so it is about 370px wide and a
            quarter of that is ~85px — enough to truncate "Strong 80%+" to
            "Strong 80…". Two columns give every label room to read in full at
            every breakpoint the grid produces.
          */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 py-4 border-t border-slate-100">
            <Metric value={(job.candidateCount || 0).toLocaleString('en-IN')} label="Candidates" />
            <Metric
              value={job.strongMatchCount || 0}
              label={`Strong ${strongMatchThreshold}%+`}
              tone={job.strongMatchCount > 0 ? 'strong' : 'default'}
            />
            <Metric value={job.shortlistedCount || 0} label="Shortlisted" />
            <Metric value={bestMatch !== null ? `${bestMatch}%` : '—'} label="Best match" />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-meta text-slate-500">Created {formatDate(job.createdAt)}</span>
            <Link
              to={bodyHref}
              className="btn btn-sm btn-ghost text-brand-700"
              aria-label={`Open ${job.title}`}
            >
              Open job
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-fast" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobSummaryCard;
