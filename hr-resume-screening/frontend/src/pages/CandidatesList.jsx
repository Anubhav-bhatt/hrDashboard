import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { getAllCandidates, getCandidateFilterOptions, updateCandidateStatus, toApiError } from '../services/api';
import { useApiResource } from '../hooks/useApiResource';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ToastProvider';
import CandidateCard from '../components/CandidateCard';
import Pagination from '../components/Pagination';
import { Button, Card, EmptyState, ErrorState, ListSkeleton, cx } from '../components/ui';
import { HR_STATUS_META } from '../utils/format';

const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Highest match' },
  { value: 'score_asc', label: 'Lowest match' },
  { value: 'newest', label: 'Newest applied' },
  { value: 'oldest', label: 'Oldest applied' },
  { value: 'exp_desc', label: 'Most experience' },
  { value: 'exp_asc', label: 'Least experience' },
  { value: 'name_asc', label: 'Name (A–Z)' },
  { value: 'updated_desc', label: 'Recently updated' }
];

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Any experience' },
  { value: '0-2', label: '0–2 years' },
  { value: '2-4', label: '2–4 years' },
  { value: '4-6', label: '4–6 years' },
  { value: '6-10', label: '6–10 years' },
  { value: '10+', label: '10+ years' },
  { value: 'unknown', label: 'Not stated' }
];

const SCORE_OPTIONS = [
  { value: '', label: 'Any score' },
  { value: '90', label: '90%+ Excellent' },
  { value: '80', label: '80%+ Strong' },
  { value: '70', label: '70%+ Good' },
  { value: '60', label: '60%+ Partial' }
];

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'REVIEW', label: 'In Review' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'NOT_SUITABLE', label: 'Not Suitable' }
];

/** Filter keys mirrored into the URL, so refresh and Back preserve context. */
const FILTER_KEYS = ['search', 'hrStatus', 'minScore', 'maxScore', 'experienceRange', 'skill', 'location', 'sort', 'page', 'limit', 'jobId'];

/**
 * Cross-job candidate listing.
 *
 * All state lives in the query string: the dashboard cards can deep-link into a
 * filtered view, refreshing keeps the filters, and the browser Back button
 * behaves the way recruiters expect.
 */
const CandidatesList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const params = useMemo(() => {
    const result = {};
    FILTER_KEYS.forEach((key) => {
      const value = searchParams.get(key);
      if (value) result[key] = value;
    });
    return result;
  }, [searchParams]);

  // The search box is local so typing stays responsive; the URL is updated once
  // the recruiter pauses.
  const [searchInput, setSearchInput] = useState(params.search || '');
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  const [showFilters, setShowFilters] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(null);

  // Keep the input in sync when navigation changes the URL (Back button, cards).
  useEffect(() => {
    setSearchInput(params.search || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.search]);

  const updateParams = useCallback(
    (changes, { resetPage = true } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(changes).forEach(([key, value]) => {
            if (value === '' || value === null || value === undefined) next.delete(key);
            else next.set(key, String(value));
          });
          // Any filter change invalidates the current page number.
          if (resetPage && !('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // Push the debounced search term into the URL.
  useEffect(() => {
    const current = params.search || '';
    if (debouncedSearch === current) return;
    updateParams({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queryKey = FILTER_KEYS.map((k) => params[k] || '').join('|');

  const { data, error, loading, refetching, refetch, setData } = useApiResource(
    (config) => getAllCandidates({ sort: 'score_desc', limit: 20, ...params }, config),
    [queryKey],
    { keepPreviousData: true }
  );

  const { data: filterData } = useApiResource((config) => getCandidateFilterOptions(config), []);

  const candidates = data?.data || [];
  const pagination = data?.pagination;
  const statusCounts = data?.facets?.statusCounts || {};
  const skillOptions = filterData?.data?.skills || [];
  const locationOptions = filterData?.data?.locations || [];

  const activeFilters = useMemo(
    () =>
      [
        params.search && { key: 'search', label: `Search: "${params.search}"` },
        params.hrStatus && {
          key: 'hrStatus',
          label: `Status: ${params.hrStatus
            .split(',')
            .map((s) => HR_STATUS_META[s]?.label || s)
            .join(', ')}`
        },
        params.minScore && { key: 'minScore', label: `Score ≥ ${params.minScore}%` },
        params.maxScore && { key: 'maxScore', label: `Score ≤ ${params.maxScore}%` },
        params.experienceRange && {
          key: 'experienceRange',
          label: `Experience: ${EXPERIENCE_OPTIONS.find((o) => o.value === params.experienceRange)?.label || params.experienceRange}`
        },
        params.skill && { key: 'skill', label: `Skill: ${params.skill}` },
        params.location && { key: 'location', label: `Location: ${params.location}` }
      ].filter(Boolean),
    [params]
  );

  const clearAllFilters = () => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  /** Optimistic status change with rollback on failure. */
  const handleStatusChange = async (candidate, status) => {
    const previous = candidate.hrStatus;
    setStatusUpdating(candidate._id);

    setData((current) =>
      current
        ? { ...current, data: current.data.map((c) => (c._id === candidate._id ? { ...c, hrStatus: status } : c)) }
        : current
    );

    try {
      await updateCandidateStatus(candidate.jobId, candidate._id, status);
      toast.success(`${candidate.name} marked as ${HR_STATUS_META[status]?.label || status}.`);
      // A status filter is active, so the row may no longer belong in the list.
      if (params.hrStatus) refetch();
    } catch (err) {
      setData((current) =>
        current
          ? { ...current, data: current.data.map((c) => (c._id === candidate._id ? { ...c, hrStatus: previous } : c)) }
          : current
      );
      toast.error(toApiError(err).message);
    } finally {
      setStatusUpdating(null);
    }
  };

  const hasActiveFilters = activeFilters.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-label uppercase text-brand-700">Talent pool</p>
          <h1 className="text-page-title sm:text-display mt-1.5">Candidates</h1>
          <p className="text-meta text-slate-500 mt-1.5">
            {loading && !data
              ? 'Loading candidates…'
              : pagination
                ? `${pagination.total} candidate${pagination.total === 1 ? '' : 's'}${hasActiveFilters ? ' match your filters' : ' across every role'}.`
                : 'Search, filter and screen applicants across every role.'}
          </p>
        </div>

        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          size="md"
          icon={SlidersHorizontal}
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="candidate-filters"
        >
          Filters{hasActiveFilters ? ` (${activeFilters.length})` : ''}
        </Button>
      </div>

      {/* Search + sort */}
      <Card padding="card-pad-sm" className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" aria-hidden="true" />
            <label htmlFor="candidate-search" className="sr-only">
              Search candidates by name, email, phone, skill, role or location
            </label>
            <input
              id="candidate-search"
              type="search"
              className="input pl-9 pr-9"
              placeholder="Search name, email, phone, skill, role or location…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors duration-fast"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 shrink-0">
            <span className="text-meta text-slate-500 whitespace-nowrap">Sort by</span>
            <select
              className="select w-auto min-w-[10.5rem]"
              value={params.sort || 'score_desc'}
              onChange={(e) => updateParams({ sort: e.target.value })}
              aria-label="Sort candidates"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scroll-slim -mx-1 px-1 pb-0.5">
          {STATUS_TABS.map((tab) => {
            const active = (params.hrStatus || '') === tab.value;
            const count = tab.value ? statusCounts[tab.value] : pagination?.total;

            return (
              <button
                key={tab.value || 'all'}
                type="button"
                onClick={() => updateParams({ hrStatus: tab.value })}
                aria-pressed={active}
                className={cx(
                  'px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors duration-fast border',
                  active
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                {tab.label}
                {count !== undefined && count !== null && (
                  <span className={cx('ml-1.5 tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Advanced filters */}
        {showFilters && (
          <div id="candidate-filters" className="pt-3 divider grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-slide-up">
            <div>
              <label htmlFor="filter-score" className="field-label">Match score</label>
              <select
                id="filter-score"
                className="select"
                value={params.minScore || ''}
                onChange={(e) => updateParams({ minScore: e.target.value, maxScore: '' })}
              >
                {SCORE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-experience" className="field-label">Experience</label>
              <select
                id="filter-experience"
                className="select"
                value={params.experienceRange || ''}
                onChange={(e) => updateParams({ experienceRange: e.target.value })}
              >
                {EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-skill" className="field-label">Skill</label>
              <select
                id="filter-skill"
                className="select"
                value={params.skill || ''}
                onChange={(e) => updateParams({ skill: e.target.value })}
              >
                <option value="">Any skill</option>
                {skillOptions.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.value} ({s.count})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-location" className="field-label">Location</label>
              <select
                id="filter-location"
                className="select"
                value={params.location || ''}
                onChange={(e) => updateParams({ location: e.target.value })}
              >
                <option value="">Any location</option>
                {locationOptions.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.value} ({l.count})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-3 divider">
            <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              Active:
            </span>
            {activeFilters.map((filter) => (
              <span key={filter.key} className="chip">
                {filter.label}
                <button
                  type="button"
                  onClick={() => {
                    if (filter.key === 'search') setSearchInput('');
                    updateParams({ [filter.key]: '' });
                  }}
                  className="text-slate-400 hover:text-rose-600 transition-colors duration-fast rounded"
                  aria-label={`Remove filter: ${filter.label}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear all
            </Button>
          </div>
        )}
      </Card>

      {/* Results */}
      {error && !data ? (
        <ErrorState title="Unable to load candidates" error={error} onRetry={refetch} />
      ) : loading && !data ? (
        <ListSkeleton rows={5} />
      ) : candidates.length === 0 ? (
        <EmptyState
          icon={Users}
          title={hasActiveFilters ? 'No candidates match these filters' : 'No candidates yet'}
          description={
            hasActiveFilters
              ? 'Try widening your criteria — remove a filter or clear the search term.'
              : 'Create a job and upload resumes, or import applications from Outlook, to build your talent pool.'
          }
          action={
            hasActiveFilters ? (
              <>
                <Button variant="primary" size="sm" onClick={clearAllFilters}>
                  Clear filters
                </Button>
                <Link to="/candidates" className="btn btn-sm btn-secondary">
                  View all candidates
                </Link>
              </>
            ) : (
              <Link to="/jobs/new" className="btn btn-sm btn-primary">
                Create a job
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className={cx('space-y-3 transition-opacity duration-fast', refetching && 'opacity-60')} aria-busy={refetching}>
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate._id}
                candidate={candidate}
                showJob
                actions={
                  <label className="sm:mt-1">
                    <span className="sr-only">Change status for {candidate.name}</span>
                    <select
                      value={candidate.hrStatus || 'REVIEW'}
                      onChange={(e) => handleStatusChange(candidate, e.target.value)}
                      disabled={statusUpdating === candidate._id}
                      className="select h-8 py-0 pl-2.5 text-xs w-auto max-w-[8.5rem]"
                    >
                      {Object.entries(HR_STATUS_META).map(([value, meta]) => (
                        <option key={value} value={value}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </label>
                }
              />
            ))}
          </div>

          <Pagination
            pagination={pagination}
            onPageChange={(page) => {
              updateParams({ page }, { resetPage: false });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onLimitChange={(limit) => updateParams({ limit })}
            className="pt-2"
          />
        </>
      )}
    </div>
  );
};

export default CandidatesList;
