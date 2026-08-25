import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

/**
 * Which role and which candidates the recruiter is currently working on.
 *
 * Why this exists
 * ---------------
 * Every agent surface already accepts its context through the URL — `/ai/ranking
 * ?jobId=…`, `/ai/comparison?jobId=…&candidateIds=…&source=ranking` — and that
 * remains the mechanism a deep link, a refresh and a shared URL rely on. This
 * store does not replace it. It answers the cases a URL cannot:
 *
 *   - A surface entered without parameters ("AI ▸ Comparison" from the sidebar)
 *     can pick up the role the recruiter was already working on instead of
 *     opening blank and asking again.
 *   - Which candidates a ranking produced, and which a comparison used, so
 *     Screening can offer a way back to the comparison it came from.
 *   - What the recruiter is in the middle of, so a surface can name the next step.
 *
 * What it deliberately does NOT hold
 * ----------------------------------
 * Identifiers and small scalars. No candidate names, emails, phone numbers,
 * resume text, scores, job records, roles, permissions or tokens. Two reasons:
 * the store is mirrored into `sessionStorage`, and personal data does not belong
 * in browser storage; and every one of those values has an authoritative source
 * on the server, so a cached copy could only ever go stale or disagree.
 *
 * `activeFilters` carries the non-search candidate-list filters. The search term
 * is excluded on purpose: a recruiter searches by candidate name, and persisting
 * a typed name into storage is exactly the thing above. Search already round-trips
 * through the URL, which is where it belongs.
 *
 * This is presentation state, never authorization
 * ----------------------------------------------
 * Nothing here grants access to anything. Every request still sends its ids and
 * the backend re-authorises them against the session on every call. A tampered
 * `currentJobId` in sessionStorage buys an attacker a 403, not a job.
 */

export const RECRUITMENT_CONTEXT_STORAGE_KEY = 'hr-dashboard-recruitment-context';

/** Ceiling on any tracked id list. Comparison allows five; ten leaves headroom. */
const MAX_TRACKED_IDS = 10;

/** Ids are UUIDs in this system; the cap simply bounds what can be written. */
const MAX_ID_LENGTH = 64;

/** Recognised workflow origins, used to offer an accurate way back. */
export const SOURCE_WORKFLOWS = Object.freeze({
  job: 'job',
  candidates: 'candidates',
  ranking: 'ranking',
  comparison: 'comparison',
  screening: 'screening',
  profile: 'profile',
  dashboard: 'dashboard'
});

/** What the recruiter is currently doing, for next-step copy. */
export const RECRUITMENT_TASKS = Object.freeze({
  review: 'review',
  rank: 'rank',
  compare: 'compare',
  screen: 'screen',
  shortlist: 'shortlist',
  select: 'select',
  close: 'close'
});

const EMPTY_CONTEXT = Object.freeze({
  currentJobId: null,
  selectedCandidateIds: [],
  lastRankingCandidateIds: [],
  lastComparisonCandidateIds: [],
  sourceWorkflow: null,
  currentTask: null,
  activeFilters: {}
});

/** Everything that is meaningful only within one job. */
const JOB_SCOPED_KEYS = Object.freeze([
  'selectedCandidateIds',
  'lastRankingCandidateIds',
  'lastComparisonCandidateIds',
  'activeFilters'
]);

/** Filter keys allowed into storage. `search` is absent by design — see above. */
const PERSISTED_FILTER_KEYS = Object.freeze([
  'hrStatus',
  'skill',
  'minScore',
  'maxScore',
  'experience',
  'sort',
  'location',
  'qualification'
]);

/**
 * Accepts a usable id or returns null.
 *
 * Rejecting rather than coercing matters: a malformed value that survived into
 * state would be sent to the API as a job or candidate id.
 */
const sanitizeId = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ID_LENGTH) return null;
  // Ids travel in URLs and query strings; anything outside this set is not one.
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
};

/** Sanitises, de-duplicates and bounds a list of ids, preserving order. */
const sanitizeIdList = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    const id = sanitizeId(entry);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_TRACKED_IDS) break;
    }
  }
  return out;
};

/** Keeps only allow-listed keys holding primitive values. */
const sanitizeFilters = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const key of PERSISTED_FILTER_KEYS) {
    const entry = value[key];
    if (entry === undefined || entry === null || entry === '') continue;
    if (typeof entry === 'string') {
      if (entry.length <= 120) out[key] = entry;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      out[key] = entry;
    } else if (typeof entry === 'boolean') {
      out[key] = entry;
    }
  }
  return out;
};

const sanitizeEnum = (value, allowed) =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(allowed, value) ? value : null;

/** Rebuilds a trusted context object from an untrusted one. */
const sanitizeContext = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_CONTEXT };
  return {
    currentJobId: sanitizeId(raw.currentJobId),
    selectedCandidateIds: sanitizeIdList(raw.selectedCandidateIds),
    lastRankingCandidateIds: sanitizeIdList(raw.lastRankingCandidateIds),
    lastComparisonCandidateIds: sanitizeIdList(raw.lastComparisonCandidateIds),
    sourceWorkflow: sanitizeEnum(raw.sourceWorkflow, SOURCE_WORKFLOWS),
    currentTask: sanitizeEnum(raw.currentTask, RECRUITMENT_TASKS),
    activeFilters: sanitizeFilters(raw.activeFilters)
  };
};

/**
 * sessionStorage, not localStorage.
 *
 * The context names candidates the recruiter is evaluating. That belongs to one
 * working session on one tab, and should not still be sitting on the machine
 * tomorrow. Closing the tab is the end of it.
 */
const readStoredContext = () => {
  try {
    const raw = window.sessionStorage.getItem(RECRUITMENT_CONTEXT_STORAGE_KEY);
    if (!raw) return { ...EMPTY_CONTEXT };
    return sanitizeContext(JSON.parse(raw));
  } catch {
    // Unavailable, disabled or corrupt — an empty context is always valid.
    return { ...EMPTY_CONTEXT };
  }
};

const writeStoredContext = (context) => {
  try {
    window.sessionStorage.setItem(RECRUITMENT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    /* Storage full or blocked; the in-memory context still works for this view. */
  }
};

const clearStoredContext = () => {
  try {
    window.sessionStorage.removeItem(RECRUITMENT_CONTEXT_STORAGE_KEY);
  } catch {
    /* Nothing to do — the in-memory reset below is what callers depend on. */
  }
};

const RecruitmentContext = createContext(null);

export const RecruitmentProvider = ({ children }) => {
  const { user, isLoading: authLoading } = useAuth();
  const [context, setContext] = useState(readStoredContext);

  // Mirror every change into storage so a refresh resumes where it left off.
  useEffect(() => {
    writeStoredContext(context);
  }, [context]);

  /*
   * A different account must never inherit the previous one's working context.
   *
   * Keyed on the user id rather than on the sign-out call, so this also covers a
   * session that expired and was replaced, and a second account signing in on the
   * same tab. The first observed id is recorded without clearing, so an ordinary
   * refresh keeps the context it just restored.
   *
   * Waiting for `isLoading` to settle is essential, not defensive. While the
   * session is being established `user` is legitimately null, so comparing
   * against it would read every page load as "null -> signed-in user", i.e. an
   * account switch, and wipe the context milliseconds after it was restored.
   */
  const knownUserRef = useRef(undefined);
  useEffect(() => {
    if (authLoading) return;

    const userId = user?.id ?? null;
    if (knownUserRef.current === undefined) {
      knownUserRef.current = userId;
      return;
    }
    if (knownUserRef.current !== userId) {
      knownUserRef.current = userId;
      clearStoredContext();
      setContext({ ...EMPTY_CONTEXT });
    }
  }, [authLoading, user?.id]);

  /**
   * Selects the active role, discarding anything scoped to the previous one.
   *
   * This is the invalidation rule the whole store rests on: candidate ids belong
   * to the job they were chosen under. Carrying Job A's shortlist into Job B
   * would put one role's candidates into another role's comparison — wrong
   * answers presented with total confidence, and a request the backend would
   * reject only if it happened to notice.
   */
  const setJob = useCallback((jobId) => {
    const nextJobId = sanitizeId(jobId);
    setContext((prev) => {
      if (prev.currentJobId === nextJobId) return prev;
      const cleared = JOB_SCOPED_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: EMPTY_CONTEXT[key] }),
        {}
      );
      return { ...prev, ...cleared, currentJobId: nextJobId };
    });
  }, []);

  const setSelectedCandidates = useCallback((ids) => {
    const next = sanitizeIdList(ids);
    setContext((prev) =>
      prev.selectedCandidateIds.join(',') === next.join(',') ? prev : { ...prev, selectedCandidateIds: next }
    );
  }, []);

  const toggleCandidate = useCallback((candidateId, max = MAX_TRACKED_IDS) => {
    const id = sanitizeId(candidateId);
    if (!id) return;
    setContext((prev) => {
      const selected = prev.selectedCandidateIds;
      if (selected.includes(id)) {
        return { ...prev, selectedCandidateIds: selected.filter((entry) => entry !== id) };
      }
      if (selected.length >= max) return prev;
      return { ...prev, selectedCandidateIds: [...selected, id] };
    });
  }, []);

  const clearSelectedCandidates = useCallback(() => {
    setContext((prev) => (prev.selectedCandidateIds.length === 0 ? prev : { ...prev, selectedCandidateIds: [] }));
  }, []);

  /** Remembers what a ranking produced, so a later surface can reuse the order. */
  const recordRanking = useCallback((jobId, candidateIds) => {
    const id = sanitizeId(jobId);
    const ids = sanitizeIdList(candidateIds);
    setContext((prev) => ({
      ...prev,
      currentJobId: id || prev.currentJobId,
      lastRankingCandidateIds: ids,
      sourceWorkflow: SOURCE_WORKFLOWS.ranking,
      currentTask: RECRUITMENT_TASKS.rank
    }));
  }, []);

  /** Remembers which candidates a comparison ran on, for the trip back. */
  const recordComparison = useCallback((jobId, candidateIds) => {
    const id = sanitizeId(jobId);
    const ids = sanitizeIdList(candidateIds);
    setContext((prev) => ({
      ...prev,
      currentJobId: id || prev.currentJobId,
      lastComparisonCandidateIds: ids,
      currentTask: RECRUITMENT_TASKS.compare
    }));
  }, []);

  const setSourceWorkflow = useCallback((workflow) => {
    const next = sanitizeEnum(workflow, SOURCE_WORKFLOWS);
    setContext((prev) => (prev.sourceWorkflow === next ? prev : { ...prev, sourceWorkflow: next }));
  }, []);

  const setTask = useCallback((task) => {
    const next = sanitizeEnum(task, RECRUITMENT_TASKS);
    setContext((prev) => (prev.currentTask === next ? prev : { ...prev, currentTask: next }));
  }, []);

  const setActiveFilters = useCallback((filters) => {
    const next = sanitizeFilters(filters);
    setContext((prev) =>
      JSON.stringify(prev.activeFilters) === JSON.stringify(next) ? prev : { ...prev, activeFilters: next }
    );
  }, []);

  /** Drops everything scoped to a job but keeps the job itself selected. */
  const clearCandidateContext = useCallback(() => {
    setContext((prev) => ({
      ...prev,
      selectedCandidateIds: [],
      lastRankingCandidateIds: [],
      lastComparisonCandidateIds: [],
      activeFilters: {}
    }));
  }, []);

  const clearAll = useCallback(() => {
    clearStoredContext();
    setContext({ ...EMPTY_CONTEXT });
  }, []);

  const value = useMemo(
    () => ({
      ...context,
      setJob,
      setSelectedCandidates,
      toggleCandidate,
      clearSelectedCandidates,
      recordRanking,
      recordComparison,
      setSourceWorkflow,
      setTask,
      setActiveFilters,
      clearCandidateContext,
      clearAll,
      isCandidateSelected: (candidateId) => context.selectedCandidateIds.includes(candidateId),
      hasJobContext: Boolean(context.currentJobId)
    }),
    [
      context,
      setJob,
      setSelectedCandidates,
      toggleCandidate,
      clearSelectedCandidates,
      recordRanking,
      recordComparison,
      setSourceWorkflow,
      setTask,
      setActiveFilters,
      clearCandidateContext,
      clearAll
    ]
  );

  return <RecruitmentContext.Provider value={value}>{children}</RecruitmentContext.Provider>;
};

/**
 * Reads the recruitment context.
 *
 * Returns an inert context rather than throwing when no provider is above it, so
 * a component can be rendered in isolation — a test, a story — without having to
 * stand up the whole provider tree. A missing provider degrades to "no context
 * known", which every consumer already handles.
 */
export const useRecruitmentContext = () => {
  const value = useContext(RecruitmentContext);
  if (value) return value;
  return {
    ...EMPTY_CONTEXT,
    setJob: () => {},
    setSelectedCandidates: () => {},
    toggleCandidate: () => {},
    clearSelectedCandidates: () => {},
    recordRanking: () => {},
    recordComparison: () => {},
    setSourceWorkflow: () => {},
    setTask: () => {},
    setActiveFilters: () => {},
    clearCandidateContext: () => {},
    clearAll: () => {},
    isCandidateSelected: () => false,
    hasJobContext: false
  };
};

/**
 * Resolves the job a surface should work on, and keeps the store in step.
 *
 * The URL wins whenever it names a job. That ordering is what makes a deep link,
 * a bookmark and a refresh authoritative — a stored value silently overriding an
 * explicit `?jobId=` would make the same URL mean different things on different
 * machines. The store is the fallback for an entry that names nothing, which is
 * how "AI ▸ Ranking" from the sidebar arrives already pointed at the role the
 * recruiter was working on.
 *
 * @param {string} urlJobId The `jobId` search parameter, or '' when absent
 * @returns {{ jobId: string, fromContext: boolean }}
 */
export const useResolvedJobId = (urlJobId) => {
  const { currentJobId, setJob } = useRecruitmentContext();
  const fromUrl = sanitizeId(urlJobId);

  // Adopt whatever the URL states, so a handoff updates the working context.
  useEffect(() => {
    if (fromUrl && fromUrl !== currentJobId) setJob(fromUrl);
  }, [fromUrl, currentJobId, setJob]);

  return {
    jobId: fromUrl || currentJobId || '',
    fromContext: !fromUrl && Boolean(currentJobId)
  };
};

/**
 * Builds an agent URL that carries its context.
 *
 * Centralised so the eight or so places that link into an agent cannot drift on
 * parameter names, and so a link stays a real href — middle-clickable,
 * copy-pasteable, and back-button correct — rather than a JS navigation.
 *
 * @param {string} mode Agent mode id ('ranking' | 'comparison' | 'screening' | 'insights')
 * @param {Object} params
 * @returns {string}
 */
export const buildAgentPath = (mode, { jobId, candidateId, candidateIds, source } = {}) => {
  const base = mode === 'assistant' ? '/ai' : `/ai/${mode}`;
  const query = new URLSearchParams();

  const job = sanitizeId(jobId);
  if (job) query.set('jobId', job);

  const candidate = sanitizeId(candidateId);
  if (candidate) query.set('candidateId', candidate);

  const ids = sanitizeIdList(candidateIds);
  if (ids.length > 0) query.set('candidateIds', ids.join(','));

  const origin = sanitizeEnum(source, SOURCE_WORKFLOWS);
  if (origin) query.set('source', origin);

  const search = query.toString();
  return search ? `${base}?${search}` : base;
};

export default RecruitmentContext;
