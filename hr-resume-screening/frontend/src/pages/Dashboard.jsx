import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Archive,
  Award,
  BarChart3,
  Briefcase,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Sparkles,
  UserCheck,
  Users,
  TrendingUp,
  ArrowRight,
  Search,
  Bot
} from 'lucide-react';
import { getDashboardOverview, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import NeedsAttention from '../components/dashboard/NeedsAttention';
import RecentHires from '../components/dashboard/RecentHires';
import TopCandidates from '../components/dashboard/TopCandidates';
import CandidateQuickView from '../components/CandidateQuickView';
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
import { formatDate, formatRelativeTime } from '../utils/format';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const Dashboard = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [quickViewCandidate, setQuickViewCandidate] = useState(null);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Recruitment Command Center
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 mt-0.5">
            {greeting()}, {firstName}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isJobScoped ? (
              <span>Filtered view for role: <strong className="text-slate-700 dark:text-slate-200">{scope?.jobTitle}</strong></span>
            ) : (
              <span>Overview of all active recruitment pipelines, applicants, and decisions.</span>
            )}
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <Link to="/jobs/closed" className="hover:text-indigo-600 dark:hover:text-indigo-400 font-medium">
              Closed jobs archive
            </Link>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Job Filter Selector */}
          <select
            className="select text-xs py-1.5 min-w-[12rem] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
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

          <Link to="/jobs/create" className="btn btn-sm btn-primary">
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
              <StatCard
                label="Total Applicants"
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

      {/* Actionable Needs Attention Row */}
      {!isJobScoped && (
        <NeedsAttention jobs={jobOptions} threshold={threshold} loading={loading && !overview} />
      )}

      {/* Tabbed Recruiter Center */}
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto scroll-slim">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={cx(
              'px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Pipeline & Active Roles
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('top-candidates')}
            className={cx(
              'px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeTab === 'top-candidates'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Top Scored Candidates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('recent-hires')}
            className={cx(
              'px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeTab === 'recent-hires'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            Recent Hires
          </button>
        </div>

        {/* Tab 1: Pipeline & Active Roles */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Active Roles List */}
              <div className="lg:col-span-2 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Active Hiring Roles ({jobOptions.length})
                  </h3>
                  <Link to="/jobs" className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                    View all jobs →
                  </Link>
                </div>

                <div className="card p-0 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
                  {jobOptions.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No active jobs yet. Create your first job to start screening.
                    </div>
                  ) : (
                    jobOptions.slice(0, 5).map((job) => (
                      <div
                        key={job.id}
                        className="p-3.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/jobs/${job.id}`}
                            className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 truncate block"
                          >
                            {job.title}
                          </Link>
                          <p className="text-xs text-slate-400 truncate mt-0.5">
                            {job.department || 'Engineering'} • {job.location || 'Remote'} • {job.candidateCount || 0} applicants
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {job.shortlistedCount > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {job.shortlistedCount} shortlisted
                            </span>
                          )}
                          <Link
                            to={`/jobs/${job.id}`}
                            className="btn btn-sm btn-secondary text-xs"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right: AI Quick Tools Card */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  AI Recruitment Shortcuts
                </h3>
                <div className="card p-4 space-y-3 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-900/60 border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                    <Bot className="w-4 h-4" />
                    <span>AI Agent Suite</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Deterministic analysis tools operating with ₹0 API cost on your authentic candidate scores.
                  </p>

                  <div className="space-y-1.5 pt-1">
                    <Link
                      to="/ai/screening"
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <span>Screen Candidate</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/ai/ranking"
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <span>Rank Candidate Pool</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                    <Link
                      to="/ai/comparison"
                      className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/30 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors"
                    >
                      <span>Compare Candidates</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Hires */}
            {!isJobScoped && (
              <RecentHires hires={overview?.recentHires || []} loading={loading && !overview} />
            )}
          </div>
        )}

        {/* Tab 2: Top Candidates */}
        {activeTab === 'top-candidates' && (
          <TopCandidates
            candidates={overview?.topCandidates || []}
            threshold={threshold}
            loading={loading && !overview}
            onSelectCandidate={(cand) => setQuickViewCandidate(cand)}
          />
        )}

        {/* Tab 3: Recent Hires */}
        {activeTab === 'recent-hires' && (
          <RecentHires hires={overview?.recentHires || []} loading={loading && !overview} />
        )}
      </div>

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
