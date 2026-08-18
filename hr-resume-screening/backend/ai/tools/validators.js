/**
 * Tool input validation.
 *
 * The project has no schema library (no zod, joi or yup in package.json) — it
 * hand-writes validation in controllers and in `ai/context/AgentContext.js`. These
 * helpers follow that convention rather than introducing a dependency for one
 * layer.
 *
 * Two rules run through all of it. Nothing is silently coerced: a limit of
 * `"abc"` is an error, not a fallback to the default, because a caller that asked
 * for something meaningless should be told so. And every input is a primitive or
 * a bounded array of primitives — no object from a caller is ever forwarded to a
 * service, which is what keeps a Prisma `where` clause, a raw SQL fragment or an
 * arbitrary query expression from arriving as "input".
 */
const { toolInvalidInput, toolLimitExceeded } = require('../errors/tool.errors');

/**
 * Identifier shape. The application's ids are UUIDs; this also rules out
 * anything resembling a path, an operator or an injected newline.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const BOUNDS = Object.freeze({
  searchLength: 200,
  skillLength: 60,
  skillCount: 20,
  locationLength: 120,
  qualificationLength: 120
});

/**
 * Refuses any key the tool does not declare.
 *
 * Strict rather than lenient: an unrecognised key usually means the caller
 * believes it is filtering by something that is in fact being ignored, and a
 * silently dropped filter on a candidate search is a safety problem, not a
 * cosmetic one.
 *
 * @param {unknown} input
 * @param {string[]} allowed
 * @returns {Object}
 */
const requireObject = (input, allowed) => {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw toolInvalidInput('Tool input must be an object.');
  }

  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw toolInvalidInput(`"${key}" is not a supported input. Supported: ${allowed.join(', ')}.`);
    }
  }
  return input;
};

/**
 * @param {unknown} value
 * @param {string} field
 * @param {Object} [options]
 * @param {boolean} [options.required=true]
 */
const requireId = (value, field, { required = true } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw toolInvalidInput(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw toolInvalidInput(`${field} must be a string.`);

  const trimmed = value.trim();
  if (!ID_PATTERN.test(trimmed)) throw toolInvalidInput(`${field} is not a valid identifier.`);
  return trimmed;
};

/**
 * A page size, bounded by the configured ceiling.
 *
 * Above the maximum is an explicit TOOL_LIMIT_EXCEEDED rather than a silent
 * clamp, so a caller asking for 5000 candidates learns that it did not get them.
 *
 * @param {unknown} value
 * @param {Object} options
 * @param {number} options.defaultLimit
 * @param {number} options.maxLimit
 */
const requireLimit = (value, { defaultLimit, maxLimit }) => {
  if (value === undefined || value === null || value === '') return defaultLimit;

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw toolInvalidInput('limit must be an integer.');
  }
  if (value < 1) throw toolInvalidInput('limit must be at least 1.');
  if (value > maxLimit) {
    throw toolLimitExceeded(`limit cannot exceed ${maxLimit}. Requested ${value}.`);
  }
  return value;
};

/**
 * A row offset.
 *
 * The underlying listing services paginate by page number, so an offset is only
 * expressible when it lands on a page boundary. Rejecting the rest is deliberate:
 * quietly rounding an offset would return a different window of candidates than
 * the caller asked for, and a ranking read off by a few rows is worse than an
 * error.
 *
 * @param {unknown} value
 * @param {number} limit
 */
const requireOffset = (value, limit) => {
  if (value === undefined || value === null || value === '') return 0;

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw toolInvalidInput('offset must be an integer.');
  }
  if (value < 0) throw toolInvalidInput('offset cannot be negative.');
  if (value % limit !== 0) {
    throw toolInvalidInput(`offset must be a multiple of limit (${limit}); received ${value}.`);
  }
  return value;
};

/**
 * @param {unknown} value
 * @param {string[]} allowed
 * @param {string} field
 */
const requireEnum = (value, allowed, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw toolInvalidInput(`${field} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw toolInvalidInput(`${field} must be a string.`);

  const normalized = value.trim().toUpperCase();
  if (!allowed.includes(normalized)) {
    throw toolInvalidInput(`${field} must be one of: ${allowed.join(', ')}.`);
  }
  return normalized;
};

/** A 0-100 score bound. */
const requireScore = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw toolInvalidInput(`${field} must be a number.`);
  }
  if (value < 0 || value > 100) throw toolInvalidInput(`${field} must be between 0 and 100.`);
  return value;
};

/**
 * @param {unknown} value
 * @param {string} field
 * @param {Object} [options]
 */
const requireStringArray = (
  value,
  field,
  { maxItems = BOUNDS.skillCount, maxLength = BOUNDS.skillLength } = {}
) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw toolInvalidInput(`${field} must be an array of strings.`);
  if (value.length > maxItems) {
    throw toolLimitExceeded(`${field} cannot contain more than ${maxItems} entries.`);
  }

  const cleaned = [];
  for (const entry of value) {
    if (typeof entry !== 'string') throw toolInvalidInput(`${field} must contain only strings.`);
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) {
      throw toolInvalidInput(`Each ${field} entry must be ${maxLength} characters or fewer.`);
    }
    cleaned.push(trimmed);
  }
  return cleaned;
};

/** A free-text search term. */
const requireText = (value, field, maxLength) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw toolInvalidInput(`${field} must be a string.`);

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    throw toolInvalidInput(`${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
};

/** @param {unknown} value */
const requireBoolean = (value, field) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') throw toolInvalidInput(`${field} must be true or false.`);
  return value;
};

module.exports = {
  ID_PATTERN,
  BOUNDS,
  requireObject,
  requireId,
  requireLimit,
  requireOffset,
  requireEnum,
  requireScore,
  requireStringArray,
  requireText,
  requireBoolean
};
