import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  // The session lives in an httpOnly cookie, so every request must send credentials.
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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || '';

    // A 401 anywhere other than the auth probe itself means the session ended.
    if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/me')) {
      unauthorizedHandlers.forEach((handler) => {
        try {
          handler(toApiError(error));
        } catch {
          /* a broken subscriber must not swallow the original error */
        }
      });
    }

    return Promise.reject(error);
  }
);

/* ------------------------------------------------------------------- auth --- */

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

/* -------------------------------------------------------------- analytics --- */

/** Dashboard KPIs, pipeline, score bands, trend and recent activity. */
export const getDashboardOverview = async (config = {}) => {
  const response = await api.get('/analytics/overview', config);
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
