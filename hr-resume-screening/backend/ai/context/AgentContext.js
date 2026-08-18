/**
 * Agent context: validation and normalization of the execution metadata that
 * travels with an AI request.
 *
 * Two ideas govern this file.
 *
 * The first is that context carries *identifiers*, not data. A jobId, not a job.
 * Candidate ids, not candidate profiles. Later phases resolve those identifiers
 * through controlled tools that call the existing business services, which is
 * what keeps authorization and business rules in one place. If whole records were
 * allowed in here the context would quietly become a second database with none of
 * the first one's rules, and a resume would end up in every log line and every
 * provider payload.
 *
 * The second is that the client is not trusted. `userId`, `userRole` and
 * `requestId` are server-owned; a request that tries to supply them is rejected
 * rather than silently corrected, so an attempt to escalate a role shows up
 * instead of disappearing. Everything else is whitelisted by key, checked by
 * type, and bounded in size.
 */
const crypto = require('crypto');
const { aiRequestInvalid } = require('../errors/ai.errors');

/** Keys a client may send. Anything else is refused. */
const CLIENT_CONTEXT_KEYS = Object.freeze(['sessionId', 'jobId', 'candidateIds', 'filters']);

/** Keys the server owns. A client that sends one of these is refused. */
const SERVER_OWNED_KEYS = Object.freeze(['userId', 'userRole', 'requestId']);

/**
 * Identifier shape. The application's ids are UUIDs, which fit comfortably; the
 * character class also rules out anything that could be mistaken for a path, a
 * query fragment or a log-injected newline.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Filter keys must look like plain field names. */
const FILTER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;

/**
 * Key names refused outright.
 *
 * The pattern above already excludes `__proto__` (it may not start with an
 * underscore), but `constructor` and `prototype` are ordinary-looking words that
 * match it perfectly. The filter bag itself is built with `Object.create(null)`,
 * so assigning them would be harmless here — but these values are destined for
 * query builders in later phases, and the moment one of them copies a filter onto
 * a normal object literal, a key named `constructor` stops being harmless. Cheap
 * to refuse now, and it makes the guarantee true wherever the value ends up.
 */
const DENIED_FILTER_KEYS = Object.freeze(['__proto__', 'constructor', 'prototype']);

const LIMITS = Object.freeze({
  candidateIds: 50,
  filterKeys: 20,
  filterStringLength: 200,
  filterArrayItems: 50
});

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string|null}
 */
const requireId = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw aiRequestInvalid(`context.${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!ID_PATTERN.test(trimmed)) {
    throw aiRequestInvalid(`context.${field} is not a valid identifier.`);
  }
  return trimmed;
};

/**
 * @param {unknown} value
 * @returns {string[]}
 */
const requireIdList = (value) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw aiRequestInvalid('context.candidateIds must be an array of identifiers.');
  }
  if (value.length > LIMITS.candidateIds) {
    throw aiRequestInvalid(`context.candidateIds cannot contain more than ${LIMITS.candidateIds} entries.`);
  }

  const seen = new Set();
  for (const entry of value) {
    const id = requireId(entry, 'candidateIds');
    if (id) seen.add(id);
  }
  return Array.from(seen);
};

/**
 * Validates one filter value.
 *
 * Primitives and flat arrays of primitives only. Rejecting nested objects is the
 * specific rule that stops a caller passing a loaded record — or a resume — in
 * through the filter bag.
 *
 * @param {string} key
 * @param {unknown} value
 */
const requireFilterValue = (key, value) => {
  const primitive = (item) => {
    if (typeof item === 'string') {
      if (item.length > LIMITS.filterStringLength) {
        throw aiRequestInvalid(
          `context.filters.${key} exceeds the ${LIMITS.filterStringLength}-character limit for a filter value.`
        );
      }
      return item;
    }
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) {
        throw aiRequestInvalid(`context.filters.${key} must be a finite number.`);
      }
      return item;
    }
    if (typeof item === 'boolean') return item;

    throw aiRequestInvalid(
      `context.filters.${key} must be a string, number, boolean, or an array of those. ` +
        'Context carries identifiers and filters, not records.'
    );
  };

  if (Array.isArray(value)) {
    if (value.length > LIMITS.filterArrayItems) {
      throw aiRequestInvalid(`context.filters.${key} cannot contain more than ${LIMITS.filterArrayItems} entries.`);
    }
    return value.map(primitive);
  }

  return primitive(value);
};

/**
 * @param {unknown} value
 * @returns {Object}
 */
const requireFilters = (value) => {
  const filters = Object.create(null);
  if (value === undefined || value === null) return filters;

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw aiRequestInvalid('context.filters must be an object.');
  }

  // Own properties only, so nothing is picked up off a prototype.
  const keys = Object.keys(value);
  if (keys.length > LIMITS.filterKeys) {
    throw aiRequestInvalid(`context.filters cannot contain more than ${LIMITS.filterKeys} keys.`);
  }

  for (const key of keys) {
    if (!FILTER_KEY_PATTERN.test(key) || DENIED_FILTER_KEYS.includes(key.toLowerCase())) {
      throw aiRequestInvalid('context.filters contains an unsupported key name.');
    }
    const resolved = requireFilterValue(key, value[key]);
    if (resolved !== undefined) filters[key] = resolved;
  }

  return filters;
};

/**
 * Builds a validated context.
 *
 * @param {unknown} raw Context as supplied by the client. Absent is fine.
 * @param {Object} [options]
 * @param {{id?: string, role?: string}|null} [options.user] The authenticated
 *   user, from `req.user`. The only source of identity.
 * @param {string} [options.requestId] Correlation id; generated when omitted.
 * @returns {Readonly<import('../types/ai.types').AgentContext>}
 * @throws {AiError} AI_REQUEST_INVALID
 */
const normalizeAgentContext = (raw, { user = null, requestId } = {}) => {
  if (raw !== undefined && raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    throw aiRequestInvalid('context must be an object.');
  }

  const source = raw || {};

  for (const key of Object.keys(source)) {
    if (SERVER_OWNED_KEYS.includes(key)) {
      throw aiRequestInvalid(`context.${key} is set by the server and cannot be supplied by a client.`);
    }
    if (!CLIENT_CONTEXT_KEYS.includes(key)) {
      throw aiRequestInvalid(
        `context.${key} is not a supported context field. Supported fields: ${CLIENT_CONTEXT_KEYS.join(', ')}.`
      );
    }
  }

  return Object.freeze({
    requestId: requestId || crypto.randomUUID(),
    // Identity comes from the verified session, never from the request body.
    userId: user && user.id ? user.id : null,
    userRole: user && user.role ? user.role : null,
    sessionId: requireId(source.sessionId, 'sessionId'),
    jobId: requireId(source.jobId, 'jobId'),
    candidateIds: Object.freeze(requireIdList(source.candidateIds)),
    filters: Object.freeze(requireFilters(source.filters))
  });
};

module.exports = {
  CLIENT_CONTEXT_KEYS,
  SERVER_OWNED_KEYS,
  DENIED_FILTER_KEYS,
  LIMITS,
  normalizeAgentContext
};
