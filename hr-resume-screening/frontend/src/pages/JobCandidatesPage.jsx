import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, Briefcase, Clock, DownloadCloud, Settings2, UserCheck, Users } from 'lucide-react';
import { getJobSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import CandidateBrowser from '../components/candidate/CandidateBrowser';
import { Badge, Card, EmptyState, ErrorState, Skeleton, cx } from '../components/ui';
import { formatDate } from '../utils/format';

/** Compact, job-scoped KPI tile. Not a link — the list below is already filtered. */
const JobKpi = ({ label, value, icon: Icon, tone = 'slate', hint }) => {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600'
  };

  return (
    <div className="rounded-card border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label uppercase text-slate-500">{label}</p>
        {Icon && (
          <span className={cx('w-7 h-7 rounded-control flex items-center justify-center shrink-0', tones[tone])}>
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-slate-900 mt-1.5 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
};

/**
 * Candidates for one job.
 *
 * The job comes from the route, so refreshing or bookmarking this URL reloads
 * the same job and the same candidate scope. Every candidate query is filtered
 * by `jobId` in PostgreSQL, not in the browser.
 */
const JobCandidatesPage = () => {
  const { jobId } = useParams();

  const { data, error, loading, refetch } = useApiResource((config) => getJobSummary(jobId, config), [jobId]);

  const job = data?.data?.job;
  const stats = data?.data?.stats;
  const threshold = data?.data?.strongMatchThreshold ?? 80;

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-card" />
          ))}
        </div>
        <Skeleton className="h-32 rounded-card" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        <Link to="/jobs" className="text-meta font-medium text-slate-500 hover:text-slate-900">
          ← All jobs
        </Link>
        {error.status === 404 ? (
          <EmptyState
            icon={Briefcase}
            title="Job not found"
            description="This job does not exist or has been deleted, so it has no candidate list."
            action={
              <Link to="/jobs" className="btn btn-sm btn-primary">
                Back to jobs
              </Link>
            }
          />
        ) : (
          <ErrorState title="Unable to load this job" error={error} onRetry={refetch} />
        )}
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb — Jobs / <title> / Candidates */}
      <nav aria-label="Breadcrumb" className="text-meta text-slate-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link to="/jobs" className="hover:text-slate-900 transition-colors duration-fast font-medium">
              Jobs
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">
            /
          </li>
          <li>
            <Link
              to={`/jobs/${job.id}`}
              className="hover:text-slate-900 transition-colors duration-fast font-medium max-w-[16rem] truncate inline-block align-bottom"
            >
              {job.title}
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">
            /
          </li>
          <li className="text-slate-900 font-semibold" aria-current="page">
            Candidates
          </li>
        </ol>
      </nav>

      {/* Job context header — the list is never shown without naming its job */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label uppercase text-brand-700">Job candidates</p>
          <h1 className="text-page-title sm:text-display mt-1.5">{job.title}</h1>
          <p className="text-meta text-slate-500 mt-1.5">
            {stats.candidateCount} candidate{stats.candidateCount === 1 ? '' : 's'} · created {formatDate(job.createdAt)}
          </p>

          {job.requiredSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="text-xs font-semibold text-slate-500">Required:</span>
              {job.requiredSkills.slice(0, 8).map((skill) => (
                <span key={skill} className="chip py-0.5 text-[11px]">
                  {skill}
                </span>
              ))}
              {job.requiredSkills.length > 8 && (
                <span className="chip py-0.5 text-[11px] text-slate-500">+{job.requiredSkills.length - 8}</span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Link to="/jobs" className="btn btn-md btn-ghost">
            ← All jobs
          </Link>
          <Link to={`/jobs/${job.id}/import`} className="btn btn-md btn-secondary">
            <DownloadCloud className="w-4 h-4" aria-hidden="true" />
            Add candidates
          </Link>
          <Link to={`/jobs/${job.id}`} className="btn btn-md btn-secondary">
            <Settings2 className="w-4 h-4" aria-hidden="true" />
            Job details
          </Link>
        </div>
      </div>

      {/* Job-scoped KPI row — contextual, not a second dashboard */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <JobKpi label="Total candidates" value={stats.candidateCount} icon={Users} tone="brand" />
        <JobKpi
          label={`${threshold}%+ matches`}
          value={stats.strongMatchCount}
          icon={Award}
          tone="emerald"
          hint="Strong alignment"
        />
        <JobKpi label="Shortlisted" value={stats.shortlistedCount} icon={UserCheck} tone="emerald" />
        <JobKpi label="Needs review" value={stats.needsReviewCount} icon={Clock} tone="amber" />
        <JobKpi
          label="Best match"
          value={stats.bestMatchScore === null ? '—' : `${stats.bestMatchScore}%`}
          icon={Award}
          tone="violet"
          hint={stats.averageMatchScore !== null ? `Average ${stats.averageMatchScore}%` : 'Not scored yet'}
        />
      </div>

      {stats.candidateCount > 0 && stats.analyzedCount < stats.candidateCount && (
        <Card padding="card-pad-sm" className="border-amber-200 bg-amber-50">
          <p className="text-meta text-amber-900">
            <strong>{stats.candidateCount - stats.analyzedCount}</strong> candidate
            {stats.candidateCount - stats.analyzedCount === 1 ? '' : 's'} on this role
            {stats.candidateCount - stats.analyzedCount === 1 ? ' has' : ' have'} not been scored yet.{' '}
            <Link to={`/jobs/${job.id}`} className="link">
              Open job details
            </Link>{' '}
            to run scoring.
          </p>
        </Card>
      )}

      {/* Candidate list, scoped to this job and ranked highest match first */}
      <CandidateBrowser jobId={job.id} defaultSort="score_desc" />
    </div>
  );
};

export default JobCandidatesPage;
