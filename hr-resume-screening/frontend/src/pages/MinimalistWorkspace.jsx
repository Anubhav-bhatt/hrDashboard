import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { getCandidates, getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useCandidateStatus } from '../hooks/useCandidateStatus';
import { useRecruitmentContext, buildAgentPath, SOURCE_WORKFLOWS } from '../context/RecruitmentContext';
import { useWorkspaceMode } from '../context/WorkspaceModeContext';
import CandidateQuickView from '../components/CandidateQuickView';
import { getCandidateActions } from '../components/candidate/CandidateActions';
import JobRail, { JobRailSelect } from '../components/workspace/JobRail';
import BestFits from '../components/workspace/BestFits';
import AIPowerTools from '../components/workspace/AIPowerTools';
import ProgressJourney from '../components/workspace/ProgressJourney';
import RecommendedNextStep from '../components/workspace/RecommendedNextStep';
import { deriveNextAction } from '../components/dashboard/NeedsAttention';
import WorkspacePage from '../components/layout/WorkspacePage';
import PageHeader from '../components/layout/PageHeader';
import { EmptyState, ErrorState, JobStatusBadge } from '../components/ui';

/**
 * The minimalist workspace.
 *
 * One role, its strongest candidates, and the four agents — nothing else. It is
 * a second *view* of the recruitment state, never a second copy of it: jobs come
 * from the same summary endpoint the jobs portal reads, candidates from the same
 * job-scoped listing the candidate browser reads, the shortlist runs through the
 * same mutation hook, the selection lives in the shared recruitment context, and
 * every agent is entered through the same `buildAgentPath` used everywhere else.
 *
 * That is what makes the two surfaces agree. Shortlist someone here and the
 * normal candidate list shows them shortlisted, because there was only ever one
 * write. Select two people here and the Comparison agent opens with them,
 * because the selection was never local to this page.
 */

/** How many candidates to load for a role. Enough to rank the top of the pool. */
const POOL_LIMIT = 20;

const MinimalistWorkspace = () => {
  const navigate = useNavigate();
  const { prefersReducedMotion, transitioning, isMinimal, enterMinimal } = useWorkspaceMode();

  /*
   * The route implies the mode.
   *
   * `/focus` is a real URL, so it can be bookmarked, pasted, or reached with the
   * Back button after leaving minimal mode — and in all three cases the stored
   * mode is still "normal", which used to render this workspace inside the full
   * sidebar and breadcrumbs. Arriving here *is* the request to be in minimal
   * mode, so adopt it. Reaching the route directly leaves no origin to return
   * to, so Exit falls back to the dashboard.
   */
  const adoptedMode = useRef(false);
  useEffect(() => {
    // Once per mount. Without the guard, leaving minimal mode flips `isMinimal`
    // false while this component is still mounted for one render, and the effect
    // would turn it straight back on — the exit button would appear inert.
    if (adoptedMode.current) return;
    adoptedMode.current = true;
    if (!isMinimal) enterMinimal();
  }, [enterMinimal, isMinimal]);
  const {
    currentJobId,
    selectedCandidateIds,
    setJob,
    toggleCandidate
  } = useRecruitmentContext();

  const [quickViewCandidate, setQuickViewCandidate] = useState(null);

  /* ------------------------------------------------------------------ jobs -- */

  const {
    data: jobsData,
    error: jobsError,
    loading: jobsLoading,
    refetch: refetchJobs
  } = useApiResource(
    (config) => getJobsSummary({ status: 'OPEN', sort: 'newest', limit: 50 }, config),
    []
  );

  const jobs = useMemo(() => jobsData?.data || [], [jobsData]);

  /*
   * The focused role.
   *
   * The shared context wins, so arriving from anywhere else in the application
   * lands on the role already being worked on. Only when it holds nothing — or
   * names a role that is not open — does the first job stand in.
   */
  const selectedJobId = useMemo(() => {
    if (currentJobId && jobs.some((job) => job.id === currentJobId)) return currentJobId;
    return jobs[0]?.id || null;
  }, [currentJobId, jobs]);

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  // Adopt the fallback into the shared context, so the tools and every surface
  // entered from them agree with what is on screen.
  useEffect(() => {
    if (selectedJobId && selectedJobId !== currentJobId) setJob(selectedJobId);
  }, [currentJobId, selectedJobId, setJob]);

  /* ------------------------------------------------------------ candidates -- */

  const {
    data: poolData,
    error: poolError,
    loading: poolLoading,
    refetch: refetchPool,
    setData: setPoolData
  } = useApiResource(
    (config) => getCandidates(selectedJobId, { sort: 'score_desc', limit: POOL_LIMIT }, config),
    [selectedJobId],
    { enabled: Boolean(selectedJobId), keepPreviousData: true }
  );

  const candidates = useMemo(() => poolData?.data || [], [poolData]);
  const threshold = poolData?.facets?.strongMatchThreshold ?? 80;
  const strongCount = poolData?.facets?.strongMatchCount ?? 0;
  const totalCandidates = poolData?.pagination?.total ?? selectedJob?.candidateCount ?? 0;

  /* ------------------------------------------------------------- selection -- */

  const selectedCandidates = useMemo(
    () => selectedCandidateIds.map((id) => candidates.find((c) => c._id === id)).filter(Boolean),
    [candidates, selectedCandidateIds]
  );

  /*
   * Who the Screen card will act on.
   *
   * One selected candidate means the recruiter has already said who. Otherwise
   * the strongest fit stands in — and the card names them, so the assumption is
   * visible rather than silent. `candidates` is sorted by score descending, so
   * its head is the same candidate Best Fits shows first.
   */
  const screenCandidate = selectedCandidates.length === 1 ? selectedCandidates[0] : candidates[0] || null;

  /*
   * The one thing to do next on the focused role.
   *
   * Reuses `deriveNextAction` — the same funnel ordering the dashboard's
   * attention cards and the job workspace both read — rather than restating the
   * rules for minimal mode. Two copies of that ordering would let minimal mode
   * recommend something the standard job page contradicts, and a recruiter who
   * switched modes would stop trusting either.
   *
   * The job summary already carries every count the function reads, so this is a
   * presentation of existing derived state and computes no second opinion.
   */
  const nextAction = useMemo(
    () => (selectedJob ? deriveNextAction(selectedJob, threshold) : null),
    [selectedJob, threshold]
  );

  /*
   * One secondary way out of the recommendation, never a competing row of them.
   * When the recommendation is already "add candidates", offering it again below
   * would be the same button twice, so the assistant stands in.
   */
  const secondaryStep = useMemo(() => {
    if (!selectedJob) return null;
    if (nextAction?.kind === 'add-candidates') {
      return { label: 'Ask Assistant', to: '/ai' };
    }
    return { label: 'Add candidates', to: `/jobs/${selectedJob.id}/import` };
  }, [nextAction, selectedJob]);

  const handleSelectJob = useCallback(
    (jobId) => {
      // setJob also discards the previous role's selection, so nothing from one
      // role can travel into another role's comparison.
      setJob(jobId);
    },
    [setJob]
  );

  const handleToggleSelect = useCallback(
    (candidate) => {
      // Five is the comparison ceiling the agent enforces; matching it here means
      // the recruiter is stopped at the point of choosing rather than on arrival.
      toggleCandidate(candidate._id, 5);
    },
    [toggleCandidate]
  );

  /* ---------------------------------------------------------- status write -- */

  const handleStatusUpdated = useCallback(
    (candidateId, status) => {
      const update = (candidate) =>
        candidate?._id === candidateId
          ? { ...candidate, hrStatus: status, isSelected: status === 'SELECTED' }
          : candidate;

      setPoolData((current) => (current ? { ...current, data: current.data.map(update) } : current));
      setQuickViewCandidate(update);
      // The rail's counts are derived from candidate status, so they are now stale.
      refetchJobs();
    },
    [refetchJobs, setPoolData]
  );

  const {
    updatingId: statusUpdating,
    changeStatus: handleStatusChange
  } = useCandidateStatus({ onUpdated: handleStatusUpdated });

  /* ------------------------------------------------------------- actions --- */

  const handleQuickLook = useCallback((candidate) => setQuickViewCandidate(candidate), []);

  const handleScreen = useCallback(
    (candidate) => {
      navigate(
        buildAgentPath('screening', {
          jobId: candidate.jobId,
          candidateId: candidate._id,
          source: SOURCE_WORKFLOWS.dashboard
        })
      );
    },
    [navigate]
  );

  const handleShortlist = useCallback(
    (candidate) => handleStatusChange(candidate, 'SHORTLISTED'),
    [handleStatusChange]
  );

  const handleOpenFullProfile = useCallback(
    (candidate) => {
      setQuickViewCandidate(null);
      navigate(`/candidates/${candidate._id}`);
    },
    [navigate]
  );

  const getActionsFor = useCallback(
    (candidate) =>
      getCandidateActions({
        candidate,
        isCompared: selectedCandidateIds.includes(candidate._id),
        comparisonDisabled: selectedCandidateIds.length >= 5,
        isShortlisting: statusUpdating === candidate._id,
        onView: handleQuickLook,
        onScreen: handleScreen,
        onCompare: handleToggleSelect,
        onShortlist: handleShortlist
      }),
    [handleQuickLook, handleScreen, handleShortlist, handleToggleSelect, selectedCandidateIds, statusUpdating]
  );

  /* --------------------------------------------------------------- render -- */

  // Animate the reveal on entry and whenever the focused role changes, but never
  // for a reduced-motion user.
  const animate = !prefersReducedMotion;

  if (jobsError && !jobsData) {
    return <ErrorState title="Unable to load your roles" error={jobsError} onRetry={refetchJobs} />;
  }

  if (!jobsLoading && jobs.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="No open roles"
        description="Minimal mode focuses on one open role at a time. Create a job to begin."
        action={
          <Link to="/jobs/new" className="btn btn-sm btn-primary">
            Create a job
          </Link>
        }
      />
    );
  }

  /*
   * The context line under the role name.
   *
   * Counts only, in plain words, and only words the numbers support: "strong" is
   * said about candidates who clear the server's threshold and about nobody else.
   */
  const contextLine = (() => {
    if (!selectedJob) return null;
    if (totalCandidates === 0) return 'No candidates yet.';
    const people = `${totalCandidates} candidate${totalCandidates === 1 ? '' : 's'}`;
    return strongCount > 0 ? `${people} · ${strongCount} strong` : people;
  })();

  return (
    <WorkspacePage className={transitioning ? 'focus-workspace-enter' : undefined}>
      <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6 lg:gap-8 min-w-0">
        {/* The rail becomes a select below lg, where a vertical list of roles
            would cost more height than the answer it leads to. */}
        <JobRail
          className="hidden lg:block"
          jobs={jobs}
          selectedJobId={selectedJobId}
          onSelect={handleSelectJob}
          loading={jobsLoading}
        />
        <JobRailSelect
          className="lg:hidden"
          jobs={jobs}
          selectedJobId={selectedJobId}
          onSelect={handleSelectJob}
          loading={jobsLoading}
        />

        <div className="min-w-0 space-y-5">
          {/*
            Level 1 — what is happening. The role being worked on, named once,
            with its lifecycle state beside it. Nothing here repeats the rail.
          */}
          {selectedJob && (
            <PageHeader
              title={selectedJob.title || 'Untitled role'}
              badge={<JobStatusBadge status={selectedJob.status} />}
              description={contextLine}
              className="pb-3 mb-0"
            />
          )}

          {/*
            Level 1 continued — where this role has got to. Guidance only: every
            stage is derived from the job's own counts and the backend lifecycle
            stays authoritative over what is actually possible.
          */}
          {selectedJob && <ProgressJourney job={selectedJob} />}

          {/*
            Level 2 — what to do next, as one dominant action. `deriveNextAction`
            returns null when a role needs nothing, and then this simply does not
            render rather than inventing busywork.
          */}
          {nextAction && (
            <RecommendedNextStep
              title={nextAction.fact}
              description={nextAction.detail}
              actionLabel={nextAction.actionLabel}
              to={nextAction.to}
              icon={nextAction.icon}
              secondaryActionLabel={secondaryStep?.label}
              secondaryTo={secondaryStep?.to}
            />
          )}

          {poolError && !poolData ? (
            <ErrorState title="Unable to load candidates" error={poolError} onRetry={refetchPool} />
          ) : (
            <BestFits
              // Remounting on the role change is what replays the reveal, so a
              // new answer arrives rather than mutating in place.
              key={selectedJobId || 'none'}
              job={selectedJob}
              candidates={candidates}
              strongCount={strongCount}
              threshold={threshold}
              totalCandidates={totalCandidates}
              loading={poolLoading}
              selectedIds={selectedCandidateIds}
              selectionDisabled={selectedCandidateIds.length >= 5}
              onQuickLook={handleQuickLook}
              onToggleSelect={handleToggleSelect}
              animate={animate}
            />
          )}

          <AIPowerTools
            job={selectedJob}
            candidateCount={totalCandidates}
            selectedCandidates={selectedCandidates}
            screenCandidate={screenCandidate}
          />
        </div>
      </div>

      {/* The same quick look the candidate list opens — one panel, one set of
          actions, one shortlist. */}
      <CandidateQuickView
        candidate={quickViewCandidate}
        isOpen={Boolean(quickViewCandidate)}
        onClose={() => setQuickViewCandidate(null)}
        onOpenFullProfile={handleOpenFullProfile}
        onStatusChange={handleStatusChange}
        statusUpdating={statusUpdating === quickViewCandidate?._id}
        actions={quickViewCandidate ? getActionsFor(quickViewCandidate) : []}
      />
    </WorkspacePage>
  );
};

export default MinimalistWorkspace;
