import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Briefcase, Plus, Search, X } from 'lucide-react';
import { getJobsSummary } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import JobSummaryCard from '../components/jobs/JobSummaryCard';
import Pagination from '../components/Pagination';
import { Button, Card, EmptyState, ErrorState, PageHeader, Skeleton, cx } from '../components/ui';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'candidates', label: 'Most candidates' },
  { value: 'best_match', label: 'Best match' },
  { value: 'title', label: 'Title (A–Z)' }
];

const PAGE_SIZE = 12;

const JobCardSkeleton = () => (
  <div className="card card-pad space-y-4">
    <div className="flex items-start justify-between gap-3">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-5 w-20 rounded-pill" />
    </div>
    <Skeleton className="h-3 w-52" />
    <div className="flex gap-1.5">
      <Skeleton className="h-5 w-14 rounded-pill" />
      <Skeleton className="h-5 w-16 rounded-pill" />
    </div>
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-14 rounded-control" />
      ))}
    </div>
    <Skeleton className="h-9 w-full rounded-control" />
  </div>
);

/**
 * Jobs portal — every recruitment job with its candidate statistics.
 *
 * Search and sort are resolved by the API (title, JD filename and skills are
 * matched in PostgreSQL) so the browser never receives jobs it will not show.
 * Search, sort and page live in the query string, so a filtered view survives a
 * refresh and can be shared.
 */
const JobsList = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = searchParams.get('sort') || 'newest';
  const urlSearch = searchParams.get('search') || '';
  const page = Math.max(parseInt(searchParams.get('page'), 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(urlSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const updateParams = (changes, { resetPage = true } = {}) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(changes).forEach(([key, value]) => {
          if (value === '' || value === null || value === undefined) next.delete(key);
          else next.set(key, String(value));
        });
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
    (config) => getJobsSummary({ sort, search: urlSearch }, config),
    [sort, urlSearch],
    { keepPreviousData: true }
  );

  const jobs = data?.data || [];
  const threshold = data?.meta?.strongMatchThreshold ?? 80;

  // Jobs are paginated client-side: the portal holds tens of jobs, not the
  // thousands that make candidate paging a server concern.
  const totalPages = Math.max(Math.ceil(jobs.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const visible = useMemo(
    () => jobs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [jobs, currentPage]
  );

  const totals = useMemo(
    () =>
      jobs.reduce(
        (acc, job) => ({
          candidates: acc.candidates + job.candidateCount,
          strong: acc.strong + job.strongMatchCount,
          shortlisted: acc.shortlisted + job.shortlistedCount
        }),
        { candidates: 0, strong: 0, shortlisted: 0 }
      ),
    [jobs]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Recruitment"
        title="Jobs"
        description={
          loading && !data
            ? 'Loading roles…'
            : jobs.length === 0
              ? 'Manage open roles and review their candidate pipelines.'
              : `${jobs.length} role${jobs.length === 1 ? '' : 's'} · ${totals.candidates} candidate${
                  totals.candidates === 1 ? '' : 's'
                } · ${totals.strong} strong match${totals.strong === 1 ? '' : 'es'} · ${totals.shortlisted} shortlisted`
        }
        actions={
          <Link to="/jobs/new" className="btn btn-md btn-primary">
            <Plus className="w-4 h-4" aria-hidden="true" />
            Create job
          </Link>
        }
      />

      {/* Search + sort */}
      <Card padding="card-pad-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
            <label htmlFor="job-search" className="sr-only">
              Search jobs by title, JD file or required skill
            </label>
            <input
              id="job-search"
              type="search"
              className="input pl-9 pr-9"
              placeholder="Search jobs…"
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
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {/* Results */}
      {error && !data ? (
        <ErrorState title="Unable to load jobs" error={error} onRetry={refetch} />
      ) : loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }, (_, i) => (
            <JobCardSkeleton key={i} />
          ))}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={urlSearch ? 'No jobs match your search' : 'No jobs yet'}
          description={
            urlSearch
              ? 'Try a different job title, JD file name or skill.'
              : 'Create your first job and upload a JD to begin candidate screening.'
          }
          action={
            urlSearch ? (
              <Button variant="primary" size="sm" onClick={() => setSearchInput('')}>
                Clear search
              </Button>
            ) : (
              <Link to="/jobs/new" className="btn btn-sm btn-primary">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Create job
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className={cx('grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5', loading && 'opacity-60')}>
            {visible.map((job) => (
              <JobSummaryCard key={job.id} job={job} strongMatchThreshold={threshold} />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination
              pagination={{
                page: currentPage,
                limit: PAGE_SIZE,
                total: jobs.length,
                totalPages,
                hasNextPage: currentPage < totalPages,
                hasPreviousPage: currentPage > 1
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
    </div>
  );
};

export default JobsList;
