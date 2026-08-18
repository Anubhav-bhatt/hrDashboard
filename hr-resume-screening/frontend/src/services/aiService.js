import api from './api';

/**
 * The one place the browser talks to the AI layer.
 *
 * Every AI request goes through this module, for the same reason the rest of the
 * app funnels through `services/api.js`: when the provider behind `/api/ai/run`
 * changes — and it will, once a real one is connected — the change lands here
 * rather than in a dozen components holding their own `fetch` calls.
 *
 * It reuses the shared axios instance, so AI requests inherit the session cookie,
 * the 401 handling and the error normalization that every other request already
 * gets. There is no second HTTP client and no second auth path.
 *
 * What is *not* here is as deliberate as what is. There is no tool endpoint. The
 * tool registry built in the previous phase is backend-only and unreachable from
 * a browser by design — the path is React -> the application's API -> services,
 * never React -> tools.
 */

/**
 * Which AI features this installation has switched on.
 *
 * Returns booleans only — no provider name, no keys, no limits. A caller uses
 * this to decide what to offer; the server still enforces it independently, so a
 * client that ignored this could not reach a disabled mode anyway.
 *
 * @param {Object} [config] Axios config, e.g. `{ signal }`
 * @returns {Promise<{success: boolean, data: {enabled: boolean, modes: Object}}>}
 */
export const getAiConfig = async (config = {}) => {
  const response = await api.get('/ai/config', config);
  return response.data;
};

/**
 * Runs one agent turn.
 *
 * Present so the frontend -> `/api/ai/run` -> orchestrator -> provider path is
 * real and exercised rather than theoretical. The agent pages do not call it yet:
 * this phase builds their shell, and the orchestrator still answers from
 * MockAIProvider, so nothing here reaches a paid API.
 *
 * `context` carries identifiers only (a jobId, candidate ids, filters). Records
 * do not belong in it, and the server rejects any attempt to put `userId` or
 * `userRole` there — identity comes from the session, never from this payload.
 *
 * @param {Object} params
 * @param {string} params.mode One of the five agent mode ids
 * @param {string} params.message The recruiter's request
 * @param {Object} [params.context] `{ sessionId?, jobId?, candidateIds?, filters? }`
 * @param {Object} [config] Axios config, e.g. `{ signal }`
 */
export const runAgent = async ({ mode, message, context } = {}, config = {}) => {
  const response = await api.post('/ai/run', { mode, message, context }, config);
  return response.data?.data || response.data;
};

export default { getAiConfig, runAgent };
