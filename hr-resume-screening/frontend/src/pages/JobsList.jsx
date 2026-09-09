import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Briefcase, Plus, Search, X } from 'lucide-react';
import {
  closeJob,
  deleteJob,
  getJobDeletionPreview,
  getJobShortlist,
  getJobsSummary,
  toApiError
} from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ToastProvider';
import { useAuth } from '../context/AuthContext';
import JobSummaryCard from '../components/jobs/JobSummaryCard';
import JobWorkItem from '../components/workspace/JobWorkItem';
import WorkspacePage from '../components/layout/WorkspacePage';
import { useWorkspaceMode } from '../context/WorkspaceModeContext';
import CloseJobDialog from '../components/jobs/CloseJobDialog';
import DeleteJobDialog from '../components/jobs/DeleteJobDialog';
import Pagination from '../components/Pagination';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from '../components/ui';

/** Sorts offered for active jobs. */
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'candidates', label: 'Most candidates' },
  { value: 'best_match', label: 'Best match' },
  { value: 'title', label: 'Title (A–Z)' }
];

/** Closed jobs are historical, so they sort by when they were filled. */
const CLOSED_SORT_OPTIONS = [
  { value: 'recently_closed', label: 'Recently closed' },
  { value: 'oldest_closed', label: 'Oldest closed' },
  { value: 'best_match', label: 'Best match' },
  { value: 'title', label: 'Title (A–Z)' }
];

/**
 * Two tabs, not three.
 *
 * A recruiter is either working live vacancies or looking at history; an "All"
 * tab mixing the two answers neither question well. Active is the default, and
 * `/jobs/closed` remains a real route so the history stays bookmarkable.
 */
const STATUS_TABS = [
  { value: 'OPEN', label: 'Active', countKey: 'open' },
  { value: 'CLOSED', label: 'Closed', countKey: 'closed' }
];

const PAGE_SIZE = 12;

/*
 * A placeholder shaped like the row it becomes.
 *
 * This used to be a card skeleton — a chip row, a four-up metric block and a
 * full-width button — laid out in a three-column grid, which is a layout this
 * page stopped having when the listing became a table. The first paint
 * therefore predicted the wrong page and the content jumped when it arrived.
 * One placeholder per row, at the row's own height, so nothing moves.
 */
const JobRowSkeleton = () => (
  <div className="flex items-center justify-between gap-4 px-5 py-4">
    <div className="min-w-0 flex-1 space-y-2">
      <Skeleton className="h-4 w-56 max-w-full" />
      <Skeleton className="h-3 w-40 max-w-full" />
    </div>
    <Skeleton className="h-4 w-24 shrink-0" />
  </div>
);

/**
 * Jobs portal — every recruitment job with its candidate statistics.
 *
 * Search, status filtering, sorting and pagination are all resolved by the API,
 * so the browser never receives jobs it will not show and a fifty-job workspace
 * costs the same as a five-job one. Each of those lives in the query string, so
 * a filtered view survives a refresh and can be shared.
 *
 * The same component serves the closed-jobs history: passing `lockedStatus`
 * fixes the lifecycle filter and hides the status tabs, which keeps one
 * implementation of searching and listing jobs rather than a near-duplicate.
 */
const JobsList = ({ lockedStatus = null, title = 'Jobs', eyebrow = 'Recruitment' }) => {
  const { isMinimal } = useWorkspaceMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const isHistory = lockedStatus === 'CLOSED';
  const sortOptions = isHistory ? CLOSED_SORT_OPTIONS : SORT_OPTIONS;
  const defaultSort = isHistory ? 'recently_closed' : 'newest';

  const sort = searchParams.get('sort') || defaultSort;
  const urlSearch = searchParams.get('search') || '';
  const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);
  // On the history route the lifecycle is fixed, so an active job can never be
  // reached by editing the query string. Elsewhere the portal opens on active
  // work; ?status=CLOSED and an explicit ?status= (all jobs) both still resolve.
  const rawStatus = searchParams.get('status');
  const status = lockedStatus ?? (rawStatus === null ? 'OPEN' : rawStatus);

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const toast = useToast();
  const { user } = useAuth();
  // Closure from the portal. The dialog's shortlist is fetched only when a
  // recruiter actually opens it, so listing jobs costs no extra queries.
  const [closingJob, setClosingJob] = useState(null);
  const [shortlist, setShortlist] = useState([]);
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState('');
  /*
   * Permanent deletion from the list.
   *
   * Same two-step contract as the job workspace: measure what is there, then
   * require the role's own title typed back. Offered only to an ADMIN, because
   * that is what the API enforces — showing it to a recruiter would be showing
   * an action that returns 403.
   */
  const canDelete = user?.role === 'ADMIN';
  const [deletingJob, setDeletingJob] = useState(null);
  const [deletePreview, setDeletePreview] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const openDeleteDialog = async (job) => {
    setDeleteError('');
    try {
      const response = await getJobDeletionPreview(job.id);
      setDeletePreview(response?.data || null);
      setDeletingJob(job);
    } catch (err) {
      toast.error(toApiError(err).message);
    }
  };

  const confirmDelete = async (confirmation) => {
    setDeleteSubmitting(true);
    setDeleteError('');
    try {
      const response = await deleteJob(deletingJob.id, confirmation);
      const removed = response?.data?.deleted;
      const title = deletingJob.title;
      setDeletingJob(null);
      setDeletePreview(null);
      toast.success(
        removed
          ? `${title} and ${removed.candidates.toLocaleString('en-IN')} candidate records were permanently deleted.`
          : `${title} was permanently deleted.`
      );
      // Refetch rather than splicing the row out: the closed-job count and the
      // page boundaries both changed, and the server is the authority on both.
      refetch();
    } catch (err) {
      setDeleteError(toApiError(err).message);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openCloseDialog = async (job) => {
    setCloseError('');
    try {
      const response = await getJobShortlist(job.id);
      const candidates = response?.data || [];
      if (candidates.length === 0) {
        toast.error('Shortlist at least one candidate before closing this job.');
        return;
      }
      setShortlist(candidates);
      setClosingJob(job);
    } catch (err) {
      toast.error(toApiError(err).message);
    }
  };

  const confirmClose = async (selectedCandidateId) => {
    setCloseSubmitting(true);
    setCloseError('');
    try {
      const response = await closeJob(closingJob.id, selectedCandidateId);
      const hire = response?.data?.selectedCandidate;
      const title = closingJob.title;
      setClosingJob(null);
      toast.success(hire?.name ? `Job closed. ${hire.name} was selected for ${title}.` : 'Job closed successfully.');
      // Refetch rather than patching locally: the job may now belong to a
      // different tab, and the status counts have changed.
      refetch();
    } catch (err) {
      setCloseError(toApiError(err).message);
    } finally {
      setCloseSubmitting(false);
    }
  };

  const updateParams = (changes, { resetPage = true } = {}) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(changes).forEach(([key, value]) => {
          if (value === '' || value === null || value === undefined) next.delete(key);
          else next.set(key, String(value));
        });
        // A new search or filter invalidates the current page number.
        if (resetPage && !('page' in changes)) next.delete('page');
        return next;
      },
      { replace: true }
    );
  };

  // Push the debounced term into the URL.
  React.useEffect(() => {
    if (debouncedSearch === urlSearch) return;
    updateParams({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  React.useEffect(() => {
    setSearchInput(urlSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSearch]);

  const { data, error, loading, refetch } = useApiResource(
    (config) => getJobsSummary({ sort, search: urlSearch, status, page, limit: PAGE_SIZE }, config),
    [sort, urlSearch, status, page],
    { keepPreviousData: false }
  );

  const jobs = data?.data || [];
  const threshold = data?.meta?.strongMatchThreshold ?? 80;
  const pagination = data?.meta?.pagination || null;
  const statusCounts = data?.meta?.statusCounts || { all: 0, open: 0, closed: 0 };
  const total = pagination?.total ?? jobs.length;

  /*
   * The page header states purpose; the count belongs with the results.
   *
   * It used to carry both, so the one number a recruiter scans for was embedded
   * in a sentence at the top of the page, a long way from the grid it described.
   */
  const describe = () =>
    isHistory
      ? 'Roles that were filled, and who was selected for each.'
      : 'Manage your open roles and review their candidates.';

  /**
   * The authoritative result count.
   *
   * Taken from the API's pagination total, never from `jobs.length` — the array
   * is one page of twelve, so on a workspace with thirty roles the page length
   * would report "12 jobs found" no matter how many actually matched.
   */
  const resultCount = () => {
    // Plain "job", not "active job": the selected tab already says which
    // lifecycle is being listed, and qualifying the noun twice reads as clutter.
    const label = `${total.toLocaleString('en-IN')} job${total === 1 ? '' : 's'} found`;
    return urlSearch ? `${label} for “${urlSearch}”` : label;
  };

  /** Empty state wording depends on why nothing is showing. */
  const renderEmpty = () => {
    if (urlSearch) {
      return (
        <EmptyState
          icon={Search}
          title={`No jobs found for “${urlSearch}”`}
          description="Try a different search or clear the current filters."
          action={
            <Button variant="primary" size="sm" onClick={() => setSearchInput('')}>
              Clear search
            </Button>
          }
        />
      );
    }

    if (isHistory || status === 'CLOSED') {
      return (
        <EmptyState
          icon={Archive}
          title="No closed jobs yet"
          description="Jobs appear here after a candidate is selected and the job is closed."
        />
      );
    }

    if (status === 'OPEN') {
      return (
        <EmptyState
          icon={Briefcase}
          title="No active jobs"
          description="Create a new job to start candidate screening."
          action={
            <Link to="/jobs/new" className="btn btn-sm btn-primary">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Create job
            </Link>
          }
        />
      );
    }

    return (
      <EmptyState
        icon={Briefcase}
        title="No jobs yet"
        description="Create your first job and upload a JD to begin candidate screening."
        action={
          <Link to="/jobs/new" className="btn btn-sm btn-primary">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Create job
          </Link>
        }
      />
    );
  };

  return (
    <WorkspacePage>
      <PageHeader
        eyebrow={eyebrow}
        /*
          Minimal Mode names the page the way its rail does. The rail says
          "Active Jobs", so a page headed plainly "Jobs" reads as a different
          destination from the one the recruiter just clicked.
        */
        title={isMinimal && !isHistory ? 'Active jobs' : title}
        description={describe()}
        actions={
          // One dominant action on this page. Creating a job is the only thing a
          // recruiter starts from here that is not already on a card.
          <Link to="/jobs/new" className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create job
          </Link>
        }
      />

      {/* Search, status filter and sort */}
      <Card padding="card-pad-sm">
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
              <label htmlFor="job-search" className="sr-only">
                {isHistory ? 'Search closed jobs by title, skill or selected candidate' : 'Search jobs by title, skill or selected candidate'}
              </label>
              <input
                id="job-search"
                type="search"
                className="input pl-9 pr-9"
                placeholder={isHistory ? 'Search closed jobs…' : 'Search by job title, skill or candidate…'}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors duration-fast"
                  aria-label="Clear job search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 shrink-0">
              <span className="text-meta text-slate-500 whitespace-nowrap">Sort</span>
              <select
                className="select w-auto min-w-[10rem]"
                value={sort}
                onChange={(e) => updateParams({ sort: e.target.value })}
                aria-label="Sort jobs"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Active / Closed. Rendered on both /jobs and /jobs/closed so the two
              read as one page rather than a navigation hierarchy to learn.
              Counts come from the API under the current search term, so they
              always describe what switching tab would actually show.

              Withheld in Minimal Mode, where the rail already lists Active Jobs
              and Closed Jobs as separate destinations: the same choice offered
              twice on one screen is the density this mode exists to remove.
              Nothing becomes unreachable — the lifecycle filter still comes from
              the route and the ?status parameter. */}
          {!isMinimal && (
          <div role="group" aria-label="Filter jobs by status" className="flex flex-wrap items-center gap-1.5">
            {STATUS_TABS.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.countKey}
                  type="button"
                  onClick={() => {
                    // From the history route, switching to Active returns to the
                    // portal, carrying the search term across.
                    if (isHistory) {
                      if (tab.value === 'OPEN') {
                        navigate(`/jobs${urlSearch ? `?search=${encodeURIComponent(urlSearch)}` : ''}`);
                      }
                      return;
                    }
                    updateParams({ status: tab.value });
                  }}
                  aria-pressed={active}
                  className={cx(
                    'inline-flex items-center gap-1.5 h-8 px-3 rounded-pill text-meta font-medium border transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                    active
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  )}
                >
                  {tab.label}
                  <span className={cx('tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>
                    {statusCounts[tab.countKey] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
          )}
        </div>
      </Card>

      {/* Results */}
      {error && !data ? (
        <ErrorState title="Unable to load jobs" error={error} onRetry={refetch} />
      ) : loading && !data ? (
        <div className="card p-0 overflow-hidden divide-y divide-slate-100">
          {Array.from({ length: 6 }, (_, i) => (
            <JobRowSkeleton key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        renderEmpty()
      ) : (
        <>
          {/* The count sits directly above the grid it describes, and is announced
              politely so a filter change is reported rather than only shown. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-meta text-slate-600" aria-live="polite">
              {resultCount()}
            </p>
            {pagination && pagination.totalPages > 1 && (
              <p className="text-meta text-slate-500 tabular-nums">
                Page {pagination.page} of {pagination.totalPages}
              </p>
            )}
          </div>

          {/*
            Minimal Mode lists the same roles as work, not as a table.
            One line of counts, one named next step, and the title as the way in
            to everything else — the numeric columns, the column header and the
            per-row status chips all belong to the Standard table below, which is
            unchanged. Both branches render from the same query and the same
            page of results, so switching mode re-composes what is already
            loaded and issues no request.
          */}
          {isMinimal ? (
            <div className={cx('card p-0 overflow-hidden', loading && 'opacity-60')}>
              <ul className="divide-y divide-slate-100 px-5">
                {jobs.map((job) => (
                  <JobWorkItem key={job.id} job={job} threshold={threshold} />
                ))}
              </ul>
            </div>
          ) : (
          <div className={cx('card p-0 overflow-hidden', loading && 'opacity-60')}>
            {/*
              The header carries the shared `jobs-grid` template, so its columns
              are the same tracks the rows below use rather than a second
              declaration that can drift from them.

              It appears only where the table itself does. Below 1024px the rows
              are stacked cards, and a column header standing over a stack of
              cards labels nothing.
            */}
            <div
              data-jobs-header
              className="jobs-grid hidden items-center border-b border-slate-200 bg-slate-50 px-5 py-3
                         text-label uppercase text-slate-500 lg:grid"
            >
              <span>Role</span>
              <span className="text-right">Candidates</span>
              <span className="text-right">Strong</span>
              <span className="text-right">Shortlisted</span>
              {/*
                A closed role has no next step — its hiring is finished — so the
                column names what it actually holds on each page rather than
                promising an action the row cannot offer.
              */}
              <span>{isHistory || status === 'CLOSED' ? 'Outcome' : 'Next'}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {jobs.map((job) => (
                <JobSummaryCard
                  key={job.id}
                  job={job}
                  compact
                  strongMatchThreshold={threshold}
                  onCloseJob={openCloseDialog}
                  onDeleteJob={canDelete ? openDeleteDialog : undefined}
                />
              ))}
            </div>
          </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <Pagination
              pagination={{
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                totalPages: pagination.totalPages,
                hasNextPage: pagination.page < pagination.totalPages,
                hasPreviousPage: pagination.page > 1
              }}
              onPageChange={(next) => {
                updateParams({ page: next }, { resetPage: false });
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="pt-2"
            />
          )}
        </>
      )}

      {deletingJob && deletePreview && (
        <DeleteJobDialog
          job={{ title: deletingJob.title }}
          counts={deletePreview.counts}
          submitting={deleteSubmitting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={() => {
            setDeletingJob(null);
            setDeletePreview(null);
            setDeleteError('');
          }}
        />
      )}

      {closingJob && (
        <CloseJobDialog
          jobTitle={closingJob.title}
          candidates={shortlist}
          submitting={closeSubmitting}
          error={closeError}
          onConfirm={confirmClose}
          onClose={() => {
            setClosingJob(null);
            setCloseError('');
          }}
        />
      )}
    </WorkspacePage>
  );
};

export default JobsList;
