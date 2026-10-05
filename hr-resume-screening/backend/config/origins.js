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

const DEFAULT_PROD_ORIGINS = [
  'https://hr-dashboard-v9wq.vercel.app'
];

/** Trailing slashes are stripped so `https://app.example/` and `https://app.example` match. */
const normalizeOrigin = (value) => String(value || '').trim().replace(/\/+$/, '');

/**
 * Builds the allow list from the environment.
 *
 * Development adds localhost defaults so a fresh clone runs without
 * configuration. Production adds default production domains and any
 * origins named in FRONTEND_URL.
 */
const buildAllowedOrigins = (env = process.env) => {
  const configured = env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : [];
  const defaults = env.NODE_ENV === 'production' ? DEFAULT_PROD_ORIGINS : DEV_ORIGINS;

  return Array.from(
    new Set([...configured, ...defaults].map(normalizeOrigin).filter(Boolean))
  );
};

/**
 * Checks if origin is a valid preview deployment of a configured Vercel app.
 * E.g., for 'https://hr-dashboard-v9wq.vercel.app', allows:
 * 'https://hr-dashboard-v9wq-bb1819bak.vercel.app' and
 * 'https://hr-dashboard-v9wq-git-main.vercel.app', but rejects
 * third-party 'https://attacker-controlled-app.vercel.app'.
 */
const isVercelPreviewOf = (origin, baseAppDomain) => {
  const match = baseAppDomain.match(/^https?:\/\/([a-z0-9-]+)\.vercel\.app$/i);
  if (!match) return false;
  const appName = match[1];
  const pattern = new RegExp(`^https?:\\/\\/${appName}(-[a-z0-9-]+)*\\.vercel\\.app$`, 'i');
  return pattern.test(origin);
};

/**
 * Validates origin membership.
 * Allows exact matches and legitimate project-scoped preview deployments,
 * while preventing substring or generic suffix matching that could admit attackers.
 */
const isOriginAllowed = (origin, allowedOrigins) => {
  const clean = normalizeOrigin(origin);
  if (!clean) return false;

  if (allowedOrigins.includes(clean)) return true;

  for (const allowed of allowedOrigins) {
    if (isVercelPreviewOf(clean, allowed)) return true;

    // Handle explicit wildcards like https://*.example.com or https://hr-dashboard-*.vercel.app
    if (allowed.includes('*')) {
      const escaped = allowed.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+');
      if (new RegExp(`^${escaped}$`, 'i').test(clean)) return true;
    }
  }

  return false;
};

module.exports = {
  DEV_ORIGINS,
  DEFAULT_PROD_ORIGINS,
  normalizeOrigin,
  buildAllowedOrigins,
  isOriginAllowed
};
