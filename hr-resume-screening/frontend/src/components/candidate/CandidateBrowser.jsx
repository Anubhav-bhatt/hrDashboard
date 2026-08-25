import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Filter, GitCompare, Search, SlidersHorizontal, Users, X } from 'lucide-react';
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
import CandidateQuickView from '../CandidateQuickView';
import Pagination from '../Pagination';
import { Avatar, Button, Card, EmptyState, ErrorState, FilterChip, Skeleton, cx } from '../ui';
import Drawer from '../ui/Drawer';
import { CandidateActionButtons, getCandidateActions } from './CandidateActions';
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

const CandidateGridSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-6" aria-label="Loading candidates">
    {Array.from({ length: 8 }, (_, index) => (
      <div key={index} className="card min-h-[17.5rem] p-5">
        <div className="flex items-start justify-between">
          <Skeleton className="h-10 w-10 rounded-pill" />
          <div className="space-y-2">
            <Skeleton className="ml-auto h-6 w-14" />
            <Skeleton className="ml-auto h-2 w-16" />
          </div>
        </div>
        <Skeleton className="mt-5 h-5 w-2/3" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-6 w-16 rounded-pill" />
          <Skeleton className="h-6 w-20 rounded-pill" />
          <Skeleton className="h-6 w-14 rounded-pill" />
        </div>
        <div className="mt-8 flex justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-6 w-20 rounded" />
        </div>
      </div>
    ))}
  </div>
);

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
  const navigate = useNavigate();
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
  const [statusErrors, setStatusErrors] = useState({});
  const [quickViewCandidate, setQuickViewCandidate] = useState(null);
  const [mobileActionsCandidate, setMobileActionsCandidate] = useState(null);
  const [comparisonCandidates, setComparisonCandidates] = useState([]);

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
  const comparisonJobId = comparisonCandidates[0]?.jobId || null;
  const comparisonIds = useMemo(
    () => new Set(comparisonCandidates.map((candidate) => candidate._id)),
    [comparisonCandidates]
  );
  const quickViewIndex = quickViewCandidate
    ? candidates.findIndex((candidate) => candidate._id === quickViewCandidate._id)
    : -1;

  // Keep an open drawer in sync after a successful status update without
  // discarding it when a filter removes the candidate from the current page.
  useEffect(() => {
    if (!data) return;
    const syncCandidate = (current) => {
      if (!current) return null;
      return candidates.find((candidate) => candidate._id === current._id) || current;
    };
    setQuickViewCandidate(syncCandidate);
    setMobileActionsCandidate(syncCandidate);
  }, [data]);

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

  const replaceCandidateStatus = useCallback((candidateId, status) => {
    const update = (candidate) =>
      candidate?._id === candidateId ? { ...candidate, hrStatus: status, isSelected: status === 'SELECTED' } : candidate;

    setData((current) =>
      current ? { ...current, data: current.data.map(update) } : current
    );
    setQuickViewCandidate(update);
    setMobileActionsCandidate(update);
    setComparisonCandidates((current) => current.map(update));
  }, [setData]);

  const handleStatusChange = useCallback(async (candidate, status) => {
    if (!candidate || status === candidate.hrStatus || statusUpdating) return;

    setStatusUpdating(candidate._id);
    setStatusErrors((current) => ({ ...current, [candidate._id]: null }));

    try {
      await updateCandidateStatus(candidate.jobId, candidate._id, status);
      replaceCandidateStatus(candidate._id, status);
      toast.success(
        status === 'SHORTLISTED'
          ? 'Candidate shortlisted'
          : `${candidate.name} marked as ${HR_STATUS_META[status]?.label || status}.`
      );
      if (params.hrStatus && params.hrStatus !== status) refetch();
    } catch (err) {
      const apiError = toApiError(err);
      if (status === 'SHORTLISTED') {
        setStatusErrors((current) => ({ ...current, [candidate._id]: apiError.message }));
      }
      toast.error(apiError.message);
    } finally {
      setStatusUpdating(null);
    }
  }, [params.hrStatus, refetch, replaceCandidateStatus, statusUpdating, toast]);

  const handleView = useCallback((candidate) => {
    setMobileActionsCandidate(null);
    setQuickViewCandidate(candidate);
  }, []);

  const moveQuickView = useCallback((direction) => {
    setQuickViewCandidate((current) => {
      if (!current) return current;
      const index = candidates.findIndex((candidate) => candidate._id === current._id);
      const next = candidates[index + direction];
      return next || current;
    });
  }, [candidates]);

  const handlePreviousCandidate = useCallback(() => moveQuickView(-1), [moveQuickView]);
  const handleNextCandidate = useCallback(() => moveQuickView(1), [moveQuickView]);

  const handleOpenFullProfile = useCallback((candidate) => {
    setQuickViewCandidate(null);
    navigate(`/candidates/${candidate._id}`);
  }, [navigate]);

  const handleScreen = useCallback((candidate) => {
    const query = new URLSearchParams({ jobId: candidate.jobId, candidateId: candidate._id });
    navigate(`/ai/screening?${query.toString()}`);
  }, [navigate]);

  const handleToggleCompare = useCallback((candidate) => {
    setComparisonCandidates((current) => {
      const alreadySelected = current.some((item) => item._id === candidate._id);
      if (alreadySelected) return current.filter((item) => item._id !== candidate._id);

      if (current.length >= 5) {
        toast.error('You can compare up to 5 candidates at once.');
        return current;
      }
      if (current.length > 0 && current[0].jobId !== candidate.jobId) {
        toast.error('Comparison candidates must belong to the same job.');
        return current;
      }

      return [...current, {
        _id: candidate._id,
        jobId: candidate.jobId,
        name: candidate.name,
        hrStatus: candidate.hrStatus
      }];
    });
  }, [toast]);

  const handleShortlist = useCallback((candidate) => {
    handleStatusChange(candidate, 'SHORTLISTED');
  }, [handleStatusChange]);

  const handleCompareSelected = useCallback(() => {
    if (!comparisonJobId || comparisonCandidates.length < 2 || comparisonCandidates.length > 5) return;
    const query = new URLSearchParams({
      jobId: comparisonJobId,
      candidateIds: comparisonCandidates.map((candidate) => candidate._id).join(','),
      source: 'candidates'
    });
    navigate(`/ai/comparison?${query.toString()}`);
  }, [comparisonCandidates, comparisonJobId, navigate]);

  const getActionsFor = useCallback((candidate) => getCandidateActions({
    candidate,
    isCompared: comparisonIds.has(candidate._id),
    comparisonDisabled:
      (Boolean(comparisonJobId) && comparisonJobId !== candidate.jobId) ||
      (comparisonCandidates.length >= 5 && !comparisonIds.has(candidate._id)),
    isShortlisting: statusUpdating === candidate._id,
    onView: handleView,
    onScreen: handleScreen,
    onCompare: handleToggleCompare,
    onShortlist: handleShortlist
  }), [
    comparisonCandidates.length,
    comparisonIds,
    comparisonJobId,
    handleScreen,
    handleShortlist,
    handleToggleCompare,
    handleView,
    statusUpdating
  ]);

  return (
    <div className={cx('space-y-5', comparisonCandidates.length > 0 && 'pb-28')}>
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

      <CandidateQuickView
        candidate={quickViewCandidate}
        isOpen={Boolean(quickViewCandidate)}
        onClose={() => setQuickViewCandidate(null)}
        onOpenFullProfile={handleOpenFullProfile}
        onStatusChange={handleStatusChange}
        onPrevious={handlePreviousCandidate}
        onNext={handleNextCandidate}
        hasPrevious={quickViewIndex > 0}
        hasNext={quickViewIndex >= 0 && quickViewIndex < candidates.length - 1}
        statusUpdating={statusUpdating === quickViewCandidate?._id}
        actions={quickViewCandidate ? getActionsFor(quickViewCandidate) : []}
      />

      <Drawer
        open={Boolean(mobileActionsCandidate)}
        onClose={() => setMobileActionsCandidate(null)}
        title={mobileActionsCandidate?.name || 'Candidate actions'}
        description="Choose an action for this candidate."
      >
        {mobileActionsCandidate && (
          <CandidateActionButtons
            actions={getActionsFor(mobileActionsCandidate)}
            layout="list"
            onAction={() => setMobileActionsCandidate(null)}
          />
        )}
      </Drawer>

      <div className="flex flex-wrap items-end justify-between gap-3 pt-1">
        <div>
          <h2 className="text-section text-slate-900">Candidate results</h2>
          <p className="mt-1 text-meta text-slate-500">
            {pagination?.total === undefined
              ? 'Loading the current candidate result set.'
              : `${pagination.total} candidate${pagination.total === 1 ? '' : 's'} in this result set.`}
          </p>
        </div>
        {refetching && <span className="text-xs font-medium text-slate-500" role="status">Updating results...</span>}
      </div>

      {error && !data ? (
        <ErrorState title="Unable to load candidates" error={error} onRetry={refetch} />
      ) : loading && !data ? (
        <CandidateGridSkeleton />
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
            className={cx(
              'grid grid-cols-1 gap-4 transition-opacity duration-fast md:grid-cols-2 md:gap-x-5 md:gap-y-6 xl:grid-cols-3 xl:gap-x-6 xl:gap-y-8',
              refetching && 'opacity-60'
            )}
            aria-busy={refetching}
          >
            {candidates.map((candidate) => {
              const isCompared = comparisonIds.has(candidate._id);
              const comparisonDisabled =
                (Boolean(comparisonJobId) && comparisonJobId !== candidate.jobId) ||
                (comparisonCandidates.length >= 5 && !isCompared);

              return (
                <CandidateCard
                  key={candidate._id}
                  candidate={candidate}
                  isCompared={isCompared}
                  comparisonDisabled={comparisonDisabled}
                  isShortlisting={statusUpdating === candidate._id}
                  error={statusErrors[candidate._id]}
                  onView={handleView}
                  onScreen={handleScreen}
                  onCompare={handleToggleCompare}
                  onShortlist={handleShortlist}
                  onOpenMobileActions={setMobileActionsCandidate}
                  onRetry={handleShortlist}
                />
              );
            })}
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

      {comparisonCandidates.length > 0 && (
        <div className="candidate-selection-bar" role="region" aria-label="Candidate comparison selection">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex -space-x-2 shrink-0" aria-hidden="true">
              {comparisonCandidates.slice(0, 4).map((candidate) => (
                <Avatar key={candidate._id} name={candidate.name} size="sm" className="ring-2 ring-white" />
              ))}
            </div>
            <div className="min-w-0" aria-live="polite">
              <p className="text-meta font-semibold text-slate-900">
                {comparisonCandidates.length} candidate{comparisonCandidates.length === 1 ? '' : 's'} selected
              </p>
              <p className="hidden sm:block text-xs text-slate-500 truncate">
                {comparisonCandidates.map((candidate) => candidate.name).join(', ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setComparisonCandidates([])}>
              Clear
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={GitCompare}
              onClick={handleCompareSelected}
              disabled={comparisonCandidates.length < 2}
            >
              <span className="hidden sm:inline">Compare candidates</span>
              <span className="sm:hidden">Compare</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateBrowser;
