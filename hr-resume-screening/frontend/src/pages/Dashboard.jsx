import React, { useState } from 'react';
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
  UserCheck,
  Users,
  ArrowRight,
  Bot
} from 'lucide-react';
import { getDashboardOverview, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import StatCard, { PipelineStage } from '../components/StatCard';
import { CandidateRow } from '../components/CandidateCard';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import RecentHires from '../components/dashboard/RecentHires';
import TopCandidates from '../components/dashboard/TopCandidates';
import CandidateQuickView from '../components/CandidateQuickView';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Skeleton,
  StatCardSkeleton,
  cx
} from '../components/ui';
import { formatRelativeTime, getScoreMeta } from '../utils/format';

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
  const [quickViewCandidate, setQuickViewCandidate] = useState(null);

  // Analytics stays collapsed until asked for. The first screen is for deciding
  // what to do next; the charts are for understanding a pipeline in depth.
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

  const selectedJobId = searchParams.get('jobId') || '';

  const { data, error, loading, refetch } = useApiResource(
    (config) => getDashboardOverview(selectedJobId ? { jobId: selectedJobId } : {}, config),
    [selectedJobId],
    { keepPreviousData: true }
  );

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

  const candidatesLink = (query = '') => {
    if (isJobScoped) return `/jobs/${scope.jobId}/candidates${query ? `?${query}` : ''}`;
    return `/candidates${query ? `?${query}` : ''}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600">
            Recruitment Command Center
          </span>
          <h1 className="text-page-title sm:text-display text-slate-900 mt-0.5">
            {greeting()}, {firstName}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
            {isJobScoped ? (
              <span>Filtered view for role: <strong className="text-slate-700">{scope?.jobTitle}</strong></span>
            ) : (
              <span>Overview of all active recruitment pipelines, applicants, and decisions.</span>
            )}
            <span className="text-slate-300">•</span>
            <Link to="/jobs/closed" className="hover:text-brand-600 font-medium">
              Closed jobs archive
            </Link>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Job Filter Selector */}
          <select
            className="select text-xs py-1.5 min-w-[12rem] bg-white border-slate-200"
            value={selectedJobId}
            onChange={(e) => handleJobChange(e.target.value)}
            aria-label="Filter dashboard by job"
          >
            <option value="">All Active Roles</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.title} ({job.candidateCount || 0})
              </option>
            ))}
          </select>

          <Link to="/jobs/new" className="btn btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" />
            <span>Create Job</span>
          </Link>
        </div>
      </div>

      {error && !overview && (
        <ErrorState
          title="Unable to load dashboard metrics"
          error={error}
          onRetry={refetch}
        />
      )}

      {/* KPI Stat Cards Grid */}
      <section aria-label="Key Performance Indicators">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {loading && !overview ? (
            Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
          ) : isJobScoped ? (
            <>
              <StatCard
                label="Candidates"
                value={metrics?.totalCandidates ?? 0}
                icon={Users}
                tone="brand"
                to={candidatesLink('sort=score_desc')}
                subtitle="In this role"
              />
              <StatCard
                label={`Strong Matches (${threshold}%+)`}
                value={metrics?.strongMatch ?? 0}
                icon={Award}
                tone="emerald"
                to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                subtitle="High alignment"
              />
              <StatCard
                label="Shortlisted"
                value={metrics?.shortlisted ?? 0}
                icon={UserCheck}
                tone="emerald"
                to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                subtitle="Under review"
              />
              <StatCard
                label="Awaiting Review"
                value={metrics?.pendingReview ?? 0}
                icon={Clock}
                tone="amber"
                to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                subtitle="Pending action"
              />
            </>
          ) : (
            <>
              <StatCard
                label="Active Jobs"
                value={metrics?.openJobs ?? 0}
                icon={Briefcase}
                tone="violet"
                to="/jobs"
                subtitle="Open positions"
              />
              {/* "Candidates", not "Total Applicants": the card navigates to
                  /candidates and sits beside a nav item of the same name, so the
                  label should match the destination. The accessible name is
                  derived from this label, and the e2e suites identify this card
                  by it. */}
              <StatCard
                label="Candidates"
                value={metrics?.totalCandidates ?? 0}
                icon={Users}
                tone="brand"
                to={candidatesLink('sort=score_desc')}
                subtitle="Across all roles"
              />
              <StatCard
                label="Shortlisted"
                value={metrics?.shortlisted ?? 0}
                icon={UserCheck}
                tone="emerald"
                to={candidatesLink('hrStatus=SHORTLISTED&sort=score_desc')}
                subtitle="High potential"
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

      {/* Actionable Needs Attention Row — the answer to "what should I do next?" */}
      {!isJobScoped && (
        <NeedsAttention jobs={jobOptions} threshold={threshold} loading={loading && !overview} />
      )}

      {/* Active roles and the AI shortcuts that operate on them. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Active Hiring Roles ({jobOptions.length})
            </h3>
            <Link to="/jobs" className="text-xs text-brand-600 font-semibold hover:underline">
              View all jobs →
            </Link>
          </div>

          <div className="card p-0 divide-y divide-slate-100 overflow-hidden">
            {jobOptions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active jobs yet. Create your first job to start screening.
              </div>
            ) : (
              jobOptions.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/jobs/${job.id}`}
                      className="font-bold text-sm text-slate-900 hover:text-brand-600 truncate block"
                    >
                      {job.title}
                    </Link>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {[job.department, job.location, `${job.candidateCount || 0} applicants`].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {job.shortlistedCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {job.shortlistedCount} shortlisted
                      </span>
                    )}
                    <Link to={`/jobs/${job.id}`} className="btn btn-sm btn-secondary text-xs">
                      Open
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* AI shortcuts */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            AI Recruitment Shortcuts
          </h3>
          <div className="card p-4 space-y-3 bg-gradient-to-br from-white to-slate-50 border-slate-200/80">
            <div className="flex items-center gap-2 text-brand-600 font-bold text-xs">
              <Bot className="w-4 h-4" />
              <span>AI Agent Suite</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Deterministic analysis tools operating with ₹0 API cost on your authentic candidate scores.
            </p>

            <div className="space-y-1.5 pt-1">
              <Link
                to="/ai/screening"
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-brand-50/60 text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Screen Candidate</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </Link>
              <Link
                to="/ai/ranking"
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-brand-50/60 text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Rank Candidate Pool</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </Link>
              <Link
                to="/ai/comparison"
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-brand-50/60 text-xs font-medium text-slate-700 transition-colors"
              >
                <span>Compare Candidates</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent hires — only meaningful across jobs, so a single-job dashboard
          stays focused on that job's pipeline. */}
      {!isJobScoped && (
        <RecentHires hires={overview?.recentHires || []} loading={loading && !overview} />
      )}

      {/*
        Analytics, collapsed by default.
        Nothing is hidden away permanently: the pipeline, match distribution, top
        candidates and recent candidates all live here. They simply no longer
        occupy the first screen, which is for deciding what to do next.
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
              <BarChart3 className="w-4 h-4 text-slate-500" aria-hidden="true" />
              Analytics
            </span>
            <span className="block text-meta text-slate-500 mt-0.5">
              Pipeline, match distribution, top candidates and recent applications.
            </span>
          </span>
          <ChevronDown
            className={cx(
              'w-4 h-4 text-slate-500 shrink-0 transition-transform duration-fast',
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
                  value={metrics?.bestMatchScore != null ? `${metrics.bestMatchScore}%` : '—'}
                  icon={Award}
                  tone="violet"
                  to={candidatesLink('sort=score_desc')}
                  subtitle="Highest scoring candidate"
                />
                <StatCard
                  label="Average match score"
                  value={metrics?.averageScore != null ? `${metrics.averageScore}%` : '—'}
                  icon={BarChart3}
                  tone="brand"
                  subtitle={metrics?.averageScore != null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'}
                />
                <StatCard
                  label="Needs review"
                  value={metrics?.needsReview ?? 0}
                  icon={Clock}
                  tone="amber"
                  to={candidatesLink('hrStatus=NEEDS_REVIEW')}
                  subtitle="Flagged for a second look"
                />
                <StatCard
                  label="Not suitable"
                  value={metrics?.notSuitable ?? 0}
                  icon={FileText}
                  tone="rose"
                  to={candidatesLink('hrStatus=NOT_SUITABLE')}
                  subtitle="Declined after screening"
                />
              </>
            ) : (
              <>
                <StatCard
                  label={`Strong matches (${threshold}%+)`}
                  value={metrics?.strongMatch ?? 0}
                  icon={Award}
                  tone="emerald"
                  to={candidatesLink(`minScore=${threshold}&sort=score_desc`)}
                  subtitle="Ranked by relevance"
                />
                <StatCard
                  label="Awaiting review"
                  value={metrics?.pendingReview ?? 0}
                  icon={Clock}
                  tone="amber"
                  to={candidatesLink('hrStatus=REVIEW,NEEDS_REVIEW&sort=score_desc')}
                  subtitle="Not yet screened"
                />
                <StatCard
                  label="Closed jobs"
                  value={metrics?.closedJobs ?? 0}
                  icon={Archive}
                  tone="brand"
                  to="/jobs/closed"
                  subtitle="Filled and archived"
                />
                <StatCard
                  label="Average match score"
                  value={metrics?.averageScore != null ? `${metrics.averageScore}%` : '—'}
                  icon={BarChart3}
                  tone="brand"
                  subtitle={metrics?.averageScore != null ? `Top score ${metrics.topScore}%` : 'No candidates scored yet'}
                />
              </>
            )}
          </div>
        )}

        {/* Top candidates + match distribution for the active scope */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TopCandidates
              candidates={overview?.topCandidates || []}
              loading={loading && !overview}
              jobTitle={isJobScoped ? scope.jobTitle : null}
              viewAllTo={candidatesLink('sort=score_desc')}
              onSelectCandidate={setQuickViewCandidate}
            />
          </div>

          <Card padding="p-0">
            <div className="p-5 pb-3">
              <CardHeader
                title="Match distribution"
                description={
                  isJobScoped
                    ? `Scored candidates on ${scope.jobTitle}.`
                    : 'Scored candidates by relevance band.'
                }
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
                          {band.count} <span className="text-slate-500">({pct}%)</span>
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

            {overview && metrics?.unanalyzed > 0 && (
              <div className="mx-5 mb-5 rounded-control border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs text-amber-900">
                  <strong>{metrics.unanalyzed}</strong> candidate{metrics.unanalyzed === 1 ? '' : 's'} not scored yet.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Hiring pipeline + recent candidates */}
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
                description={
                  isJobScoped
                    ? `Newest applications for ${scope.jobTitle}.`
                    : 'Newest applications across all roles.'
                }
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
                overview.recentCandidates
                  .slice(0, 6)
                  .map((candidate) => <CandidateRow key={candidate.id || candidate._id} candidate={candidate} />)
              ) : (
                <div className="p-5">
                  <EmptyState icon={FileText} title="No candidates yet" className="border-0 shadow-none py-6" />
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {overview?.generatedAt && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
          Live data, updated {formatRelativeTime(overview.generatedAt)}
          <Button variant="ghost" size="sm" onClick={refetch} className="ml-1">
            Refresh
          </Button>
        </p>
      )}

      {/* Candidate Quick View Slide-Over */}
      <CandidateQuickView
        candidate={quickViewCandidate}
        jobId={quickViewCandidate?.jobId}
        isOpen={Boolean(quickViewCandidate)}
        onClose={() => setQuickViewCandidate(null)}
      />
    </div>
  );
};

export default Dashboard;
