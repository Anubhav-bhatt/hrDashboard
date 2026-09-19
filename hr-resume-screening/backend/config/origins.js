/**
 * Which browser origins this API trusts.
 *
 * One list serves two jobs that must never disagree: which origins CORS will
 * answer with credentials, and which origins may send a state-changing request.
 * Keeping them in one place means a host can't be trusted for one and not the
 * other.
 *
 * The list is exact-match only. An earlier revision accepted any origin ending
 * in `.vercel.app` and any origin *containing* `localhost`, which meant
 * `https://anything.vercel.app` (a free, instant signup) and
 * `https://localhost.attacker.example` (an ordinary domain that merely has the
 * word in it) were both handed `Access-Control-Allow-Credentials: true`. Either
 * one could read candidate records out of a signed-in recruiter's browser.
 *
 * That pattern existed to keep Vercel preview deployments working. It is no
 * longer needed: the frontend reaches the API through a same-origin rewrite, so
 * previews are same-origin too and make no cross-origin request to allow.
 */

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
];

/** Trailing slashes are stripped so `https://app.example/` and `https://app.example` match. */
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

/**
 * Builds the allow list from the environment.
 *
 * Development adds localhost defaults so a fresh clone runs without
 * configuration. Production adds nothing implicitly — every trusted origin is
 * named in FRONTEND_URL, and the server refuses to start if none is.
 */
const buildAllowedOrigins = (env = process.env) => {
  const configured = env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : [];
  const defaults = env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;

  return Array.from(
    new Set([...configured, ...defaults].map(normalizeOrigin).filter(Boolean))
  );
};

/** Exact membership. No suffix matching, no substring matching. */
const isOriginAllowed = (origin, allowedOrigins) =>
  allowedOrigins.includes(normalizeOrigin(origin));

module.exports = { DEV_ORIGINS, normalizeOrigin, buildAllowedOrigins, isOriginAllowed };
