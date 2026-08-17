import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Award,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Plus,
  Sparkles,
  UserCheck,
  Users,
  XCircle
} from 'lucide-react';
import { getDashboardOverview, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import StatCard, { PipelineStage } from '../components/StatCard';
import { CandidateRow } from '../components/CandidateCard';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import RecentHires from '../components/dashboard/RecentHires';
import TopCandidates from '../components/dashboard/TopCandidates';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCardSkeleton,
  cx
} from '../components/ui';
import { formatDate, formatRelativeTime, getScoreMeta } from '../utils/format';

const STAGE_BARS = {
  REVIEW: 'bg-slate-400',
  NEEDS_REVIEW: 'bg-amber-500',
  SHORTLISTED: 'bg-emerald-500',
  NOT_SUITABLE: 'bg-rose-400'
};

/** Greeting based on local time — a small touch that makes the page feel alive. */
const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const Dashboard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // Analytics stays collapsed until asked for. The first screen is for deciding
  // what to do next; the charts are for understanding a pipeline in depth.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  // The selected job lives in the URL, so a job-scoped dashboard can be
  // refreshed, bookmarked and shared.
  const selectedJobId = searchParams.get('jobId') || '';

  const { data, error, loading, refetch } = useApiResource(
    (config) => getDashboardOverview(selectedJobId ? { jobId: selectedJobId } : {}, config),
    [selectedJobId],
    { keepPreviousData: true }
  );

  // Job options come from PostgreSQL, never a hard-coded list. Active jobs only:
  // the dashboard is an operational view, and closed roles are browsed through
  // the closed-jobs history instead of crowding the selector.
  const { data: jobsData } = useApiResource(
    (config) => getJobsSummary({ sort: 'candidates', status: 'OPEN' }, config),
    []
  );
  const jobOptions = jobsData?.data || [];

  const overview = data?.data;
  const metrics = overview?.metrics;
  const scope = overview?.scope;
  const isJobScoped = Boolean(scope?.jobId);
  const threshold = overview?.strongMatchThreshold ?? 80;
  const firstName = (user?.name || '').split(' ')[0] || 'there';

  const selectedJob = useMemo(
    () => jobOptions.find((job) => job.id === selectedJobId) || null,
    [jobOptions, selectedJobId]
  );

  const handleJobChange = (jobId) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (jobId) next.set('jobId', jobId);
        else next.delete('jobId');
        return next;
      },
      { replace: true }
    );
  };

  /** Candidate-list link that carries the active job scope. */
  const candidatesLink = (query = '') => {
    if (isJobScoped) return `/jobs/${scope.jobId}/candidates${query ? `?${query}` : ''}`;
    return `/candidates${query ? `?${query}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="min-w-0">
          <p className="text-label uppercase text-brand-700">Recruitment dashboard</p>
          <h1 className="text-page-title sm:text-display mt-1.5">
            {greeting()}, {firstName}
          </h1>

          {/* Scope indicator — never leave a recruiter guessing whether the
              numbers are global or for one role. */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-meta text-slate-500">Viewing:</span>
            {isJobScoped ? (
              <>
                <Badge variant="brand">{scope.jobTitle}</Badge>
                <button
                  type="button"
                  onClick={() => handleJobChange('')}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-900 underline decoration-slate-300 transition-colors duration-fast rounded"
                >
                  Show all jobs
                </button>
              </>
            ) : (
              <Badge variant="neutral">All jobs</Badge>
            )}
          </div>

          <p className="text-meta text-slate-500 mt-2">
            {loading && !overview
              ? 'Loading your hiring snapshot…'
              : metrics
                ? isJobScoped
                  ? `${metrics.pendingReview} of ${metrics.totalCandidates} candidate${
                      metrics.totalCandidates === 1 ? '' : 's'
                    } on this role are waiting on your review.`
                  : `${metrics.pendingReview} candidate${
                      metrics.pendingReview === 1 ? '' : 's'
                    } waiting on your review across ${metrics.totalJobs} open role${metrics.totalJobs === 1 ? '' : 's'}.`
                : 'Your hiring snapshot across every open role.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Job selector */}
          <label className="flex items-center gap-2">
            <span className="text-meta text-slate-500 whitespace-nowrap">Job</span>
            <select
              className="select w-auto min-w-[13rem] max-w-[18rem]"
              value={selectedJobId}
              onChange={(e) => handleJobChange(e.target.value)}
              aria-label="Filter the dashboard by job"
            >
              <option value="">All jobs</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} ({job.candidateCount})
                </option>
              ))}
            </select>
          </label>

          <Link to={candidatesLink()} className="btn btn-md btn-secondary">
            <Users className="w-4 h-4" aria-hidden="true" />
            {isJobScoped ? 'Candidates' : 'All candidates'}
          </Link>
          <Link to="/jobs/new" className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create job
          </Link>
        </div>
      </div>

      {error && !overview && (
        <ErrorState
          title="Unable to load your dashboard"
          error={error}
          onRetry={refetch}
          action={
            <Link to="/candidates" className="btn btn-sm btn-secondary">
              Go to candidates
            </Link>
          }
        />
      )}

      {/*
        Four headline figures, each a full-surface link.
        Across the workspace these answer "how much work is open, and how far has
        it got?"; inside one job they answer the same about that job. Everything
        else that used to sit here — average score, needs review, not suitable,
        score bands, pipeline — moved into Analytics below, one click away.
      */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading && !overview ? (
            Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
          ) : isJobScoped ? (
            <>
              <StatCard
                label="Candidates"
                value={metrics?.totalCandidates}
                icon={Users}
                tone="brand"
                to={candidatesLink('sort=score_desc')}
                subtitle="In this role"
              />
              <StatCard
                label={`Strong matches (${threshold}%+)`}
                value={metrics?.strongMatch}
                icon={Award}
                tone="emerald"
                to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                subtitle="Ranked by relevance"
              />
              <StatCard
                label="Shortlisted"
                value={metrics?.shortlisted}
                icon={UserCheck}
                tone="emerald"
                to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                subtitle="Under consideration"
              />
              <StatCard
                label="Awaiting review"
                value={metrics?.pendingReview}
                icon={Clock}
                tone="amber"
                to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                subtitle="Not yet screened"
              />
            </>
          ) : (
            <>
              <StatCard
                label="Active jobs"
                value={metrics?.openJobs ?? 0}
                icon={Briefcase}
                tone="violet"
                to="/jobs?status=OPEN"
                subtitle="Roles being screened"
              />
              <StatCard
                label="Candidates"
                value={metrics?.totalCandidates}
                icon={Users}
                tone="brand"
                to={candidatesLink('sort=score_desc')}
                trend={metrics?.candidatesThisMonth > 0 ? metrics.candidatesThisMonth : undefined}
                trendLabel={metrics?.candidatesThisMonth > 0 ? 'this month' : 'View candidates'}
              />
              <StatCard
                label="Shortlisted"
                value={metrics?.shortlisted}
                icon={UserCheck}
                tone="emerald"
                to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                subtitle="Under consideration"
              />
              <StatCard
                label="Hires"
                value={metrics?.selectedCandidates ?? 0}
                icon={CheckCircle2}
                tone="emerald"
                to={candidatesLink('hrStatus=SELECTED')}
                subtitle="Candidates selected"
              />
            </>
          )}
        </div>

      </section>

      {/* What should I do next? Derived from the job summaries already loaded for
          the selector, so this costs no extra request. */}
      {!isJobScoped && (
        <NeedsAttention jobs={jobOptions} threshold={threshold} loading={loading && !overview} />
      )}

      {/* Recent hires — only meaningful across jobs, so a single-job dashboard
          stays focused on that job's pipeline. */}
      {!isJobScoped && <RecentHires hires={overview?.recentHires || []} loading={loading && !overview} />}

      {/*
        Analytics, collapsed by default.
        Nothing was removed: the pipeline, score distribution, top candidates,
        secondary metrics and recent activity all still live here. They simply no
        longer occupy the first screen, which is for deciding what to do next.
      */}
      <section aria-label="Analytics">
        <button
          type="button"
          onClick={() => setAnalyticsOpen((open) => !open)}
          aria-expanded={analyticsOpen}
          aria-controls="dashboard-analytics"
          className="w-full card card-pad-sm flex items-center justify-between gap-3 text-left
                     hover:border-slate-300 transition-colors duration-fast
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="min-w-0">
            <span className="section-title flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-slate-400" aria-hidden="true" />
              Analytics
            </span>
            <span className="block text-meta text-slate-500 mt-0.5">
              Pipeline, score distribution, top candidates and recent activity.
            </span>
          </span>
          <ChevronDown
            className={cx(
              'w-4 h-4 text-slate-400 shrink-0 transition-transform duration-fast',
              analyticsOpen && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      </section>

      <div id="dashboard-analytics" hidden={!analyticsOpen} className="space-y-5">
        {/* Secondary metrics, kept out of the headline row. */}
        {overview && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {isJobScoped ? (
              <>
                <StatCard
                  label="Best match"
                  value={metrics.bestMatchScore !== null ? `${metrics.bestMatchScore}%` : '—'}
                  icon={Award}
                  tone="violet"
                  to={candidatesLink('sort=score_desc')}
                  subtitle="Highest scoring candidate"
                />
                <StatCard
                  label="Average match score"
                  value={metrics.averageScore !== null ? `${metrics.averageScore}%` : '—'}
                  icon={BarChart3}
                  tone="brand"
                  subtitle={metrics.averageScore !== null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'}
                />
                <StatCard
                  label="Needs review"
                  value={metrics.needsReview}
                  icon={Clock}
                  tone="amber"
                  to={candidatesLink('hrStatus=NEEDS_REVIEW')}
                  subtitle="Flagged for a second look"
                />
                <StatCard
                  label="Not suitable"
                  value={metrics.notSuitable}
                  icon={XCircle}
                  tone="rose"
                  to={candidatesLink('hrStatus=NOT_SUITABLE')}
                  subtitle="Declined after screening"
                />
              </>
            ) : (
              <>
                <StatCard
                  label={`Strong matches (${threshold}%+)`}
                  value={metrics.strongMatch}
                  icon={Award}
                  tone="emerald"
                  to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                  subtitle="Ranked by relevance"
                />
                <StatCard
                  label="Awaiting review"
                  value={metrics.pendingReview}
                  icon={Clock}
                  tone="amber"
                  to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                  subtitle="Not yet screened"
                />
                <StatCard
                  label="Closed jobs"
                  value={metrics.closedJobs ?? 0}
                  icon={Archive}
                  tone="brand"
                  to="/jobs/closed"
                  subtitle="Filled and archived"
                />
                <StatCard
                  label="Average match score"
                  value={metrics.averageScore !== null ? `${metrics.averageScore}%` : '—'}
                  icon={BarChart3}
                  tone="brand"
                  subtitle={metrics.averageScore !== null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'}
                />
              </>
            )}
          </div>
        )}

      {/* Top candidates for the active scope */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <TopCandidates
            candidates={overview?.topCandidates || []}
            loading={loading && !overview}
            jobTitle={isJobScoped ? scope.jobTitle : null}
            viewAllTo={candidatesLink('sort=score_desc')}
          />
        </div>

        {/* Score distribution for the active scope */}
        <Card padding="p-0">
          <div className="p-5 pb-3">
            <CardHeader
              title="Match distribution"
              description={isJobScoped ? `Scored candidates on ${scope.jobTitle}.` : 'Scored candidates by relevance band.'}
            />
          </div>

          <div className="px-5 pb-5 space-y-3">
            {loading && !overview ? (
              Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : overview?.scoreBands?.some((b) => b.count > 0) ? (
              overview.scoreBands.map((band) => {
                const total = overview.scoreBands.reduce((sum, b) => sum + b.count, 0);
                const pct = total > 0 ? Math.round((band.count / total) * 100) : 0;
                const meta = getScoreMeta(band.min === 0 ? 10 : band.min);

                return (
                  <Link
                    key={band.key}
                    to={candidatesLink(
                      `minScore=${band.min}${band.max < 100 ? `&maxScore=${Math.floor(band.max)}` : ''}&sort=score_desc`
                    )}
                    className="group block focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 rounded"
                    aria-label={`${band.count} candidates scored ${band.label}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-700 group-hover:text-brand-700 transition-colors duration-fast">
                        {band.label}
                      </span>
                      <span className="tabular-nums text-slate-500">
                        {band.count} <span className="text-slate-400">({pct}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full rounded-pill bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-pill transition-all duration-slow ${meta.bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="text-meta text-slate-500 py-4">
                No candidates have been scored{isJobScoped ? ' on this role' : ''} yet.
              </p>
            )}
          </div>

          {overview && metrics.unanalyzed > 0 && (
            <div className="mx-5 mb-5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs text-amber-900">
                <strong>{metrics.unanalyzed}</strong> candidate{metrics.unanalyzed === 1 ? '' : 's'} not scored yet.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Pipeline + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" padding="p-0">
          <div className="p-5 pb-2">
            <CardHeader
              title="Hiring pipeline"
              description={
                isJobScoped
                  ? `Review stages for ${scope.jobTitle}.`
                  : 'Every stage links to the matching candidate list.'
              }
            />
          </div>

          <div className="px-1 pb-3">
            {loading && !overview ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-1.5 w-full" />
                  </div>
                ))}
              </div>
            ) : overview?.pipeline?.some((s) => s.count > 0) ? (
              overview.pipeline.map((stage) => (
                <PipelineStage
                  key={stage.key}
                  label={stage.label}
                  description={stage.description}
                  count={stage.count}
                  percentage={stage.percentage}
                  barClass={STAGE_BARS[stage.key]}
                  to={candidatesLink(`hrStatus=${stage.key}&sort=score_desc`)}
                />
              ))
            ) : (
              <div className="p-4">
                <EmptyState
                  icon={Users}
                  title="No candidates in the pipeline yet"
                  description={
                    isJobScoped
                      ? 'Import resumes for this role to start screening.'
                      : 'Create a job, then upload resumes or import them from Outlook.'
                  }
                  action={
                    isJobScoped ? (
                      <Link to={`/jobs/${scope.jobId}/import`} className="btn btn-sm btn-primary">
                        Add candidates
                      </Link>
                    ) : (
                      <Link to="/jobs/new" className="btn btn-sm btn-primary">
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Create your first job
                      </Link>
                    )
                  }
                  className="border-0 shadow-none py-8"
                />
              </div>
            )}
          </div>
        </Card>

        <Card padding="p-0">
          <div className="p-5 pb-3">
            <CardHeader
              title="Recent candidates"
              description={isJobScoped ? `Newest applications for ${scope.jobTitle}.` : 'Newest applications across all roles.'}
              actions={
                <Link to={candidatesLink('sort=newest')} className="btn btn-sm btn-ghost">
                  View all
                </Link>
              }
            />
          </div>

          <div className="divide-y divide-slate-100 border-t border-slate-100">
            {loading && !overview ? (
              Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <Skeleton className="w-8 h-8 rounded-pill" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-44" />
                  </div>
                </div>
              ))
            ) : overview?.recentCandidates?.length ? (
              overview.recentCandidates.slice(0, 6).map((candidate) => (
                <CandidateRow key={candidate._id} candidate={candidate} />
              ))
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={FileText}
                  title="No candidates yet"
                  className="border-0 shadow-none py-6"
                />
              </div>
            )}
          </div>
        </Card>
      </div>
      </div>

      {overview?.generatedAt && (
        <p className="text-xs text-slate-400 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
          Live data, updated {formatRelativeTime(overview.generatedAt)}
          <Button variant="ghost" size="sm" onClick={refetch} className="ml-1">
            Refresh
          </Button>
        </p>
      )}
    </div>
  );
};

export default Dashboard;
