import axios from 'axios';

/**
 * Where the browser sends API requests.
 *
 * In production this is the bare path `/api`, which means the page's own
 * origin. Vercel rewrites it to the Render backend server-side (see
 * frontend/vercel.json), so the browser only ever talks to one origin and the
 * auth cookies are first-party. That is the whole fix for Safari: WebKit's
 * tracking prevention refuses to store a cookie set by a third-party origin, so
 * while the browser called the Render host directly, sign-in could return 200,
 * set a cookie, and still leave the next request unauthenticated.
 *
 * Development keeps the existing strategy: VITE_API_URL, defaulting to the
 * local backend. Setting it to `/api` routes through the Vite dev proxy and is
 * recommended — see vite.config.js.
 */
const resolveBaseUrl = () => {
  const configured = import.meta.env.VITE_API_URL;

  if (import.meta.env.DEV) return configured || 'http://localhost:5000/api';
  if (!configured) return '/api';

  // A leftover absolute URL in the production environment would quietly
  // reinstate the cross-site architecture this exists to remove, and the
  // symptom — Safari signs in, then immediately signs out — looks nothing like
  // a stale environment variable. Prefer the same-origin path and say so.
  const isAbsolute = /^https?:\/\//i.test(configured);
  if (isAbsolute && import.meta.env.VITE_ALLOW_CROSS_ORIGIN_API !== 'true') {
    const sameOrigin =
      typeof window !== 'undefined' && configured.startsWith(window.location.origin);
    if (!sameOrigin) {
      console.warn(
        '[api] Ignoring a cross-origin VITE_API_URL in a production build and using /api instead. ' +
          'Cross-site auth cookies are not stored by Safari. Set VITE_ALLOW_CROSS_ORIGIN_API=true to override.'
      );
      return '/api';
    }
  }

  return configured;
};

const API_BASE_URL = resolveBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // The session lives in httpOnly cookies, so every request must send credentials.
  withCredentials: true
});

/** Subscribers notified when the API reports the session is gone. */
const unauthorizedHandlers = new Set();

export const onUnauthorized = (handler) => {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
};

/**
 * Normalizes every failure into a predictable shape so screens can render a
 * useful message instead of "Something went wrong".
 */
export const toApiError = (error) => {
  if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
    return { canceled: true, message: 'Request canceled.', status: null, code: 'CANCELED' };
  }

  const status = error?.response?.status ?? null;
  const payload = error?.response?.data;

  if (!error?.response) {
    return {
      canceled: false,
      status: null,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the server. Check that the API is running and try again.'
    };
  }

  return {
    canceled: false,
    status,
    code: payload?.code || `HTTP_${status}`,
    message:
      payload?.message ||
      (status >= 500
        ? 'The server ran into a problem completing this request. Please try again.'
        : 'This request could not be completed.')
  };
};

const notifyUnauthorized = (apiError) => {
  unauthorizedHandlers.forEach((handler) => {
    try {
      handler(apiError);
    } catch {
      /* a broken subscriber must not swallow the original error */
    }
  });
};

/* --------------------------------------------------------- refresh coordinator -- */

/**
 * The in-flight refresh, if there is one.
 *
 * A dashboard screen fires several requests at once, so an expired access token
 * surfaces as a handful of simultaneous 401s rather than one. Without this, each
 * would start its own refresh: the first rotates the token, the rest present the
 * one it just replaced, and the server — correctly — reads that as a replayed
 * token and revokes the session. The recruiter would be signed out by the act of
 * loading a page.
 *
 * Holding one promise means the first 401 refreshes and the others wait on it.
 */
let refreshInFlight = null;

/**
 * Renews the session at most once at a time.
 *
 * The refresh call is made with a bare axios instance rather than `api`, so it
 * cannot re-enter this interceptor. That is what bounds the retry: a failing
 * refresh returns a rejection to its waiters and never triggers another refresh.
 */
const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE_URL}/auth/refresh`, null, { withCredentials: true })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
};

/**
 * 401 codes worth spending one refresh attempt on.
 *
 * All three describe the *access* token, not the session, and the refresh
 * endpoint is the only thing that can say whether the session itself is still
 * alive — so each gets exactly one attempt:
 *
 *   SESSION_EXPIRED  the token aged out. The ordinary case.
 *   AUTH_REQUIRED    no token at all. What a deep link looks like after the
 *                    access cookie reaches its Max-Age and the browser drops it.
 *   INVALID_SESSION  the token will not verify. Usually a cookie left over from
 *                    an older deployment, and after a signing-secret rotation it
 *                    is what every access token looks like while the refresh
 *                    token is still perfectly good.
 *
 * Attempting here is also what gets stale cookies cleared: a failed refresh is
 * answered with cookie-clearing headers, so the browser stops carrying a dead
 * credential instead of presenting it on every request forever.
 *
 * 403 is absent deliberately — that is an authorization answer, and no token
 * will change it.
 */
const RENEWABLE_CODES = new Set(['SESSION_EXPIRED', 'AUTH_REQUIRED', 'INVALID_SESSION']);

const isAuthEndpoint = (url = '') =>
  url.includes('/auth/login') ||
  url.includes('/auth/signup') ||
  url.includes('/auth/refresh') ||
  url.includes('/auth/logout');

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    const code = error?.response?.data?.code;
    const config = error?.config;
    const url = config?.url || '';

    // 403 is an authorization answer, not an authentication one: the recruiter
    // is known and simply may not do this. Renewing a token cannot change that,
    // and retrying would loop.
    if (status !== 401 || isAuthEndpoint(url)) return Promise.reject(error);

    // `/auth/me` is the provider's own bootstrap probe. It still gets the silent
    // refresh below, but never the notification: the provider is already
    // deciding what the session state is, and a first visit with no cookies at
    // all is an ordinary signed-out visitor, not an expired session to announce.
    const announce = !url.includes('/auth/me');

    // One attempt, tracked on the request itself, so a request can never be
    // retried twice and a failing refresh can never start another.
    if (RENEWABLE_CODES.has(code) && config && !config.__sessionRetried) {
      config.__sessionRetried = true;
      try {
        await refreshSession();
        return await api(config);
      } catch (refreshError) {
        // The refresh itself failed: the session is genuinely over. Announce it
        // once, describing why the *renewal* failed rather than why the original
        // request did — "your session expired" is the honest and useful message,
        // and the original 401 only ever says the access token was missing.
        if (announce) notifyUnauthorized(toApiError(refreshError));
        return Promise.reject(error);
      }
    }

    // A terminal authentication failure — INVALID_SESSION, or a renewable code
    // on a request that has already been retried once.
    if (announce) notifyUnauthorized(toApiError(error));

    return Promise.reject(error);
  }
);

/**
 * Startup needs no special case.
 *
 * The provider's `/auth/me` probe goes through the interceptor above like any
 * other request, so a still-valid refresh cookie is spent and the probe retried
 * before the provider ever sees a failure. The recruiter opening a deep link
 * with an expired access token lands on the page they asked for, not on the
 * dashboard and not on a sign-in screen that flashes past.
 */

/* ------------------------------------------------------------------- auth --- */

/**
 * Creates an account and returns the signed-in recruiter.
 *
 * The server sets the same session cookies login does, so there is no second
 * step: the response arriving means the person is already authenticated.
 */
export const signup = async ({ name, email, password }) => {
  const response = await api.post('/auth/signup', { name, email, password });
  return response.data;
};

export const login = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data;
};

export const fetchCurrentUser = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const updateProfile = async ({ name }) => {
  const response = await api.put('/auth/profile', { name });
  return response.data;
};

export const changePassword = async ({ currentPassword, newPassword }) => {
  const response = await api.post('/auth/change-password', { currentPassword, newPassword });
  return response.data;
};

/* ------------------------------------------------------------------ admin --- */

export const getAdminUsers = async (params = {}) => {
  const response = await api.get('/admin/users', { params });
  return response.data;
};

export const getAdminUser = async (id) => {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
};

export const updateAdminUserStatus = async (id, isActive) => {
  const response = await api.patch(`/admin/users/${id}/status`, { isActive });
  return response.data;
};

export const getAdminActivities = async (params = {}) => {
  const response = await api.get('/admin/activities', { params });
  return response.data;
};

/* -------------------------------------------------------------- analytics --- */

/**
 * Dashboard KPIs, pipeline, score bands, trend, top candidates, jobs overview
 * and recent activity.
 *
 * @param {Object} [params] Pass `{ jobId }` to scope every figure to one job.
 */
export const getDashboardOverview = async (params = {}, config = {}) => {
  const response = await api.get('/dashboard/overview', { params, ...config });
  return response.data;
};

/**
 * Jobs with aggregated candidate statistics for the jobs portal.
 *
 * @param {Object} [params] `{ search, sort, status, page, limit }`
 */
export const getJobsSummary = async (params = {}, config = {}) => {
  const response = await api.get('/jobs/summary', { params, ...config });
  return response.data;
};

/** Candidate statistics and requirement context for a single job. */
export const getJobSummary = async (jobId, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/summary`, config);
  return response.data;
};

/* --------------------------------------------------------------- candidates -- */

/** Cross-job candidate listing with filters, sorting and pagination. */
export const getAllCandidates = async (params = {}, config = {}) => {
  const response = await api.get('/candidates', { params, ...config });
  return response.data;
};

/** Full candidate profile by ID (no job ID required). */
export const getCandidateProfile = async (candidateId, config = {}) => {
  const response = await api.get(`/candidates/${candidateId}`, config);
  return response.data;
};

/** Distinct skills, locations and qualifications present in the candidate pool. */
export const getCandidateFilterOptions = async (config = {}) => {
  const response = await api.get('/candidates/filters', config);
  return response.data;
};

/** Candidates for one job, with filters, sorting and pagination. */
export const getCandidates = async (jobId, params = {}, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/candidates`, { params, ...config });
  return response.data;
};

/** Job-scoped candidate profile. */
export const getCandidateById = async (jobId, candidateId, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/candidates/${candidateId}`, config);
  return response.data;
};

export const updateCandidateStatus = async (jobId, candidateId, status) => {
  const response = await api.patch(`/jobs/${jobId}/candidates/${candidateId}/status`, { status });
  return response.data;
};

export const updateCandidateNotes = async (jobId, candidateId, notes) => {
  const response = await api.patch(`/jobs/${jobId}/candidates/${candidateId}/notes`, { notes });
  return response.data;
};

/** Appends a timestamped note to the candidate's note history. */
export const addCandidateNote = async (jobId, candidateId, body) => {
  const response = await api.post(`/jobs/${jobId}/candidates/${candidateId}/notes`, { body });
  return response.data;
};

export const analyzeCandidate = async (jobId, candidateId) => {
  const response = await api.post(`/jobs/${jobId}/candidates/${candidateId}/analyze`);
  return response.data;
};

export const analyzeAllCandidates = async (jobId) => {
  const response = await api.post(`/jobs/${jobId}/candidates/analyze-all`);
  return response.data;
};

/**
 * URL for the original resume document. Authentication travels on the session
 * cookie, so this URL can be used directly by window.open and iframes.
 */
export const getCandidateResumeUrl = (jobId, candidateId, { download = false } = {}) =>
  `${API_BASE_URL}/jobs/${jobId}/candidates/${candidateId}/resume${download ? '?download=1' : ''}`;

/**
 * Fetches the resume bytes and returns a same-origin blob URL for previewing.
 *
 * The document is deliberately not embedded straight from the API URL: that
 * would be a cross-origin frame, which the API's framing protections correctly
 * refuse. Reading the bytes with the session cookie and rendering them from a
 * blob keeps those protections intact and lets the browser's PDF viewer work.
 *
 * The caller owns the returned URL and must revoke it.
 */
export const fetchCandidateResumeObjectUrl = async (jobId, candidateId, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/candidates/${candidateId}/resume`, {
    responseType: 'blob',
    ...config
  });

  const type = response.headers?.['content-type'] || response.data.type || 'application/octet-stream';
  return URL.createObjectURL(new Blob([response.data], { type }));
};

/**
 * Downloads the resume through XHR so a failure surfaces as an in-app message
 * instead of a browser error page, then hands the blob to the browser to save.
 */
export const downloadCandidateResume = async (jobId, candidateId, fileName = 'resume') => {
  const response = await api.get(`/jobs/${jobId}/candidates/${candidateId}/resume`, {
    params: { download: 1 },
    responseType: 'blob'
  });

  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so the download has started.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  return true;
};

/* -------------------------------------------------------------------- jobs -- */

export const getJobs = async (config = {}) => {
  const response = await api.get('/jobs', config);
  return response.data;
};

export const getJobById = async (id, config = {}) => {
  const response = await api.get(`/jobs/${id}`, config);
  return response.data;
};

export const updateJobCriteria = async (id, payload) => {
  const response = await api.patch(`/jobs/${id}/search-criteria`, payload);
  return response.data;
};

export const createJob = async (formData) => {
  const response = await api.post('/jobs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const parseJobDescription = async (payload) => {
  if (payload instanceof FormData) {
    const response = await api.post('/jobs/parse-jd', payload, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
  const response = await api.post('/jobs/parse-jd', payload);
  return response.data;
};

/* ---------------------------------------------------------------- closure -- */

/** Shortlisted candidates eligible to be chosen as the hire. */
export const getJobShortlist = async (jobId, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/shortlist`, config);
  return response.data;
};

/**
 * Records the hired candidate and closes the job.
 *
 * Only the candidate id is sent: the recruiter's choice is the decision, and the
 * server already holds the score. Validation is repeated server-side.
 */
export const closeJob = async (jobId, selectedCandidateId) => {
  const response = await api.post(`/jobs/${jobId}/close`, { selectedCandidateId });
  return response.data;
};

/**
 * Permanently deletes a closed job and every record it owns.
 *
 * Not the same operation as closing, and deliberately not named as though it
 * were: closing archives a hiring cycle, this destroys it and releases the
 * storage. The confirmation phrase — the job's own title — is re-checked on the
 * server, so this call cannot succeed just because a dialog was rendered.
 */
/** What deleting a closed job would destroy — measured, so the dialog can state real figures. */
export const getJobDeletionPreview = async (jobId, config = {}) => {
  const response = await api.get(`/jobs/${jobId}/deletion-preview`, config);
  return response.data;
};

export const deleteJob = async (jobId, confirmation) => {
  const response = await api.delete(`/jobs/${jobId}`, { data: { confirmation } });
  return response.data;
};

/* ------------------------------------------------------------ resume upload -- */

export const uploadSingleCandidate = async (jobId, file) => {
  const formData = new FormData();
  formData.append('resume', file);

  const response = await api.post(`/jobs/${jobId}/candidates/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

export const uploadBulkCandidates = async (jobId, files, relativePaths = []) => {
  const formData = new FormData();
  files.forEach((f) => formData.append('resumes', f));
  if (relativePaths && relativePaths.length > 0) {
    formData.append('relativePaths', JSON.stringify(relativePaths));
  }

  const response = await api.post(`/jobs/${jobId}/candidates/bulk-upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

/* ----------------------------------------------------------------- outlook -- */

export const getOutlookStatus = async (config = {}) => {
  const response = await api.get('/outlook/status', config);
  return response.data;
};

export const getOutlookFolders = async () => {
  const response = await api.get('/outlook/folders');
  return response.data;
};

export const searchOutlookEmails = async (jobId, payload) => {
  const response = await api.post(`/jobs/${jobId}/outlook/search`, payload);
  return response.data;
};

export const disconnectOutlook = async () => {
  const response = await api.post('/outlook/disconnect');
  return response.data;
};

export const processCandidates = async (jobId, applications) => {
  const response = await api.post(`/jobs/${jobId}/candidates/process`, { applications });
  return response.data;
};

/** Starts the Microsoft OAuth flow as a full-page navigation. */
export const getOutlookConnectUrl = () => `${API_BASE_URL}/outlook/connect`;

export default api;
