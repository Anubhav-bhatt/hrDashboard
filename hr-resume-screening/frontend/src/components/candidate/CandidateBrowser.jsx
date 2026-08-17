import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import {
  getAllCandidates,
  getCandidateFilterOptions,
  getCandidates,
  toApiError,
  updateCandidateStatus
} from '../../services/api';
import { useApiResource } from '../../hooks/useApiResource';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../ToastProvider';
import CandidateCard from '../CandidateCard';
import Pagination from '../Pagination';
import { Button, Card, EmptyState, ErrorState, FilterChip, ListSkeleton, StatusBadge, cx } from '../ui';
import Drawer from '../ui/Drawer';
import { HR_STATUS_META } from '../../utils/format';

export const SORT_OPTIONS = [
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
  { value: 'SELECTED', label: 'Selected' },
  { value: 'NOT_SUITABLE', label: 'Not Suitable' }
];

/**
 * "Best matches" is a score preset rather than a status, so it is expressed as a
 * minimum score and uses the threshold the server reports. There is deliberately
 * no second definition of "strong" in the frontend.
 */
const BEST_MATCH_TAB = { id: 'best', label: 'Best matches' };

/** Filter keys mirrored into the query string. */
const FILTER_KEYS = [
  'search',
  'hrStatus',
  'minScore',
  'maxScore',
  'experienceRange',
  'skill',
  'location',
  'qualification',
  'sort',
  'page',
  'limit',
  'jobId'
];

/**
 * Candidate search, filtering, sorting and pagination.
 *
 * Shared by the global candidate list and the job-scoped list so both behave
 * identically. When `jobId` is supplied the scope is fixed to that job — it is
 * taken from the route, applied in the API request, and cannot be overridden by
 * a query parameter, which is what keeps one job's candidates out of another's
 * list even if a URL is hand-edited.
 *
 * @param {Object} props
 * @param {string} [props.jobId] Fixes the list to a single job
 * @param {string} [props.defaultSort='score_desc'] Highest match first by default
 * @param {React.ReactNode} [props.extraFilters] Additional filter controls (e.g. a job selector)
 * @param {Function} [props.onLoaded] Receives the response so a parent can show counts
 */
const CandidateBrowser = ({ jobId = null, defaultSort = 'score_desc', extraFilters = null, onLoaded }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const params = useMemo(() => {
    const result = {};
    FILTER_KEYS.forEach((key) => {
      const value = searchParams.get(key);
      if (value) result[key] = value;
    });
    // The route's job always wins over anything in the query string.
    if (jobId) result.jobId = jobId;
    return result;
  }, [searchParams, jobId]);

  const [searchInput, setSearchInput] = useState(params.search || '');
  const debouncedSearch = useDebouncedValue(searchInput, 350);
  // Secondary filters live in a drawer so the toolbar stays scannable instead of
  // presenting every control at once.
  const [showFilters, setShowFilters] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(null);

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
          if (resetPage && !('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  useEffect(() => {
    const current = params.search || '';
    if (debouncedSearch === current) return;
    updateParams({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const queryKey = FILTER_KEYS.map((k) => params[k] || '').join('|');

  const { data, error, loading, refetching, refetch, setData } = useApiResource(
    (config) => {
      const query = { sort: defaultSort, limit: 20, ...params };
      // The job-scoped endpoint enforces the scope server-side.
      return jobId ? getCandidates(jobId, query, config) : getAllCandidates(query, config);
    },
    [queryKey, jobId],
    { keepPreviousData: true }
  );

  const { data: filterData } = useApiResource((config) => getCandidateFilterOptions(config), []);

  useEffect(() => {
    if (data && onLoaded) onLoaded(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const candidates = data?.data || [];
  const pagination = data?.pagination;
  const statusCounts = data?.facets?.statusCounts || {};
  const strongMatchCount = data?.facets?.strongMatchCount;
  const allCount = data?.facets?.allCount;
  // The strong-match threshold is the server's, never a second frontend constant.
  const threshold = data?.facets?.strongMatchThreshold ?? 80;
  const skillOptions = filterData?.data?.skills || [];
  const locationOptions = filterData?.data?.locations || [];
  const qualificationOptions = filterData?.data?.qualifications || [];

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
          label: `Experience: ${
            EXPERIENCE_OPTIONS.find((o) => o.value === params.experienceRange)?.label || params.experienceRange
          }`
        },
        params.skill && { key: 'skill', label: `Skill: ${params.skill}` },
        params.location && { key: 'location', label: `Location: ${params.location}` },
        params.qualification && { key: 'qualification', label: `Qualification: ${params.qualification}` }
      ].filter(Boolean),
    [params]
  );

  const hasActiveFilters = activeFilters.length > 0;

  const clearAllFilters = () => {
    setSearchInput('');
    // The job scope is part of the route here, so clearing filters must not
    // clear it; only the filter keys are dropped.
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams();
        if (!jobId && prev.get('jobId')) next.set('jobId', prev.get('jobId'));
        return next;
      },
      { replace: true }
    );
  };

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

  return (
    <div className="space-y-5">
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

          {/* On narrow screens these wrap below the search rather than being
              squeezed beside it, which is what caused horizontal overflow. */}
          <div className="flex items-center gap-2 sm:shrink-0">
            <label className="flex items-center gap-2 flex-1 sm:flex-initial min-w-0">
              <span className="text-meta text-slate-500 whitespace-nowrap hidden sm:inline">Sort by</span>
              <select
                className="select w-full sm:w-auto sm:min-w-[10.5rem]"
                value={params.sort || defaultSort}
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

            <Button
              variant={showFilters ? 'primary' : 'secondary'}
              size="md"
              icon={SlidersHorizontal}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="candidate-filters"
              className="shrink-0"
            >
              <span className="hidden sm:inline">More filters</span>
              <span className="sm:hidden">Filters</span>
              {hasActiveFilters ? ` (${activeFilters.length})` : ''}
            </Button>
          </div>
        </div>

        {/*
          Quick presets. These cover what a recruiter wants nine times out of ten,
          which is what lets the rest of the filters live behind the drawer.
          Counts come from the API and ignore the active preset, so they always
          say how many candidates the other tabs hold.
        */}
        <div
          role="group"
          aria-label="Filter candidates"
          className="flex items-center gap-1.5 overflow-x-auto scroll-slim -mx-1 px-1 pb-0.5"
        >
          {(() => {
            const bestActive = !params.hrStatus && String(params.minScore || '') === String(threshold);
            const tabButton = (key, label, count, active, onClick) => (
              <button
                key={key}
                type="button"
                onClick={onClick}
                aria-pressed={active}
                className={cx(
                  'px-3 py-1.5 rounded-pill text-xs font-semibold whitespace-nowrap transition-colors duration-fast border',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
                  active
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                )}
              >
                {label}
                {count !== undefined && count !== null && (
                  <span className={cx('ml-1.5 tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>
                    {count}
                  </span>
                )}
              </button>
            );

            return [
              tabButton('all', 'All', allCount ?? pagination?.total, !params.hrStatus && !bestActive, () =>
                updateParams({ hrStatus: '', minScore: '' })
              ),
              tabButton(BEST_MATCH_TAB.id, BEST_MATCH_TAB.label, strongMatchCount, bestActive, () =>
                updateParams({ hrStatus: '', minScore: String(threshold), sort: 'score_desc' })
              ),
              ...STATUS_TABS.filter((tab) => tab.value).map((tab) =>
                tabButton(tab.value, tab.label, statusCounts[tab.value] ?? 0, params.hrStatus === tab.value, () =>
                  updateParams({ hrStatus: tab.value, minScore: '' })
                )
              )
            ];
          })()}
        </div>


        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 pt-3 divider">
            <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              Active:
            </span>
            {activeFilters.map((filter) => (
              <FilterChip
                key={filter.key}
                label={filter.label}
                onRemove={() => {
                  if (filter.key === 'search') setSearchInput('');
                  updateParams({ [filter.key]: '' });
                }}
              />
            ))}
            <Button variant="ghost" size="sm" onClick={clearAllFilters}>
              Clear all
            </Button>
          </div>
        )}
      </Card>

      {/* Secondary filters — kept out of the toolbar until asked for. */}
      <Drawer
        open={showFilters}
        onClose={() => setShowFilters(false)}
        title="More filters"
        description="Narrow the list further. Filters combine with the toolbar above."
        footer={
          <>
            <Button variant="ghost" size="md" onClick={clearAllFilters}>
              Clear all
            </Button>
            <Button variant="primary" size="md" onClick={() => setShowFilters(false)}>
              Done
            </Button>
          </>
        }
      >
        {/* Kept mounted under an id the toolbar button references, so the
            expanded relationship is announced correctly. */}
        <div id="candidate-filters" className="space-y-4">
          {extraFilters}

          {/* The four filters recruiters reach for most. They used to sit in the
              toolbar; behind the drawer the list opens with search and sort only,
              and nothing has been taken away. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="drawer-filter-score" className="field-label">
                Match score
              </label>
              <select
                id="drawer-filter-score"
                className="select"
                value={params.minScore || ''}
                onChange={(e) => updateParams({ minScore: e.target.value, maxScore: '' })}
              >
                {SCORE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="drawer-filter-experience" className="field-label">
                Experience
              </label>
              <select
                id="drawer-filter-experience"
                className="select"
                value={params.experienceRange || ''}
                onChange={(e) => updateParams({ experienceRange: e.target.value })}
              >
                {EXPERIENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="drawer-filter-location" className="field-label">
                Location
              </label>
              <select
                id="drawer-filter-location"
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

            <div>
              <label htmlFor="drawer-filter-skill" className="field-label">
                Skill
              </label>
              <select
                id="drawer-filter-skill"
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
          </div>

          <div>
            <label htmlFor="drawer-filter-qualification" className="field-label">
              Qualification
            </label>
            <select
              id="drawer-filter-qualification"
              className="select"
              value={params.qualification || ''}
              onChange={(e) => updateParams({ qualification: e.target.value })}
            >
              <option value="">Any qualification</option>
              {qualificationOptions.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.value} ({q.count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="drawer-filter-maxscore" className="field-label">
              Maximum match score
            </label>
            <select
              id="drawer-filter-maxscore"
              className="select"
              value={params.maxScore || ''}
              onChange={(e) => updateParams({ maxScore: e.target.value })}
            >
              <option value="">No upper limit</option>
              <option value="89">Below 90%</option>
              <option value="79">Below 80%</option>
              <option value="69">Below 70%</option>
              <option value="59">Below 60%</option>
            </select>
            <p className="text-xs text-slate-500 mt-1.5">
              Combine with a minimum score to review a single band.
            </p>
          </div>

          <div className="pt-4 divider">
            <p className="field-label">Review status</p>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_TABS.filter((t) => t.value).map((tab) => {
                const active = (params.hrStatus || '') === tab.value;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => updateParams({ hrStatus: active ? '' : tab.value })}
                    aria-pressed={active}
                    className={cx(
                      'px-3 py-1.5 rounded-pill text-xs font-semibold border transition-colors duration-fast',
                      active
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {tab.label}
                    {statusCounts[tab.value] !== undefined && (
                      <span className={cx('ml-1.5 tabular-nums', active ? 'text-white/80' : 'text-slate-400')}>
                        {statusCounts[tab.value]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Drawer>

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
              : jobId
                ? 'No resumes have been imported for this role yet.'
                : 'Create a job and upload resumes, or import applications from Outlook, to build your talent pool.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="primary" size="sm" onClick={clearAllFilters}>
                Clear filters
              </Button>
            ) : jobId ? (
              <Link to={`/jobs/${jobId}/import`} className="btn btn-sm btn-primary">
                Add candidates
              </Link>
            ) : (
              <Link to="/jobs/new" className="btn btn-sm btn-primary">
                Create a job
              </Link>
            )
          }
        />
      ) : (
        <>
          <div
            className={cx('space-y-3 transition-opacity duration-fast', refetching && 'opacity-60')}
            aria-busy={refetching}
          >
            {candidates.map((candidate) => (
              <CandidateCard
                key={candidate._id}
                candidate={candidate}
                showJob={!jobId}
                actions={
                  // A hired candidate's status is final, so the control becomes
                  // a read-only badge rather than a dropdown the server rejects.
                  candidate.hrStatus === 'SELECTED' ? (
                    <div className="sm:mt-1">
                      <StatusBadge status="SELECTED" />
                    </div>
                  ) : (
                    <label className="sm:mt-1">
                      <span className="sr-only">Change status for {candidate.name}</span>
                      <select
                        value={candidate.hrStatus || 'REVIEW'}
                        onChange={(e) => handleStatusChange(candidate, e.target.value)}
                        disabled={statusUpdating === candidate._id}
                        className="select h-8 py-0 pl-2.5 text-xs w-auto max-w-[8.5rem]"
                      >
                        {/* Selection happens by closing the job, not here. */}
                        {Object.entries(HR_STATUS_META)
                          .filter(([value]) => value !== 'SELECTED')
                          .map(([value, meta]) => (
                            <option key={value} value={value}>
                              {meta.label}
                            </option>
                          ))}
                      </select>
                    </label>
                  )
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

export default CandidateBrowser;
