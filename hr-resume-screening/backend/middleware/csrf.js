const { isOriginAllowed } = require('../config/origins');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Origin check on state-changing requests.
 *
 * Cookies authenticate this API, so a request forged by another site would
 * arrive with the recruiter's session attached. Two things stop that, and both
 * are deliberate:
 *
 *   1. `sameSite=lax` on the auth cookies. A cross-site POST/PATCH/DELETE does
 *      not carry them at all, which is the actual defence.
 *   2. This check. Every current browser sends `Origin` on an unsafe method, so
 *      a forged request either names a foreign origin — rejected here — or
 *      names an allowed one, which means it came from our own page.
 *
 * A missing `Origin` is allowed through. That is server-to-server tooling and
 * the test suite, neither of which is a browser and neither of which a third
 * party can cause a recruiter's browser to send. Requiring the header instead
 * would break every non-browser client while adding nothing: a browser cannot
 * be persuaded to omit it on an unsafe method.
 *
 * Note this runs after CORS. A cross-origin *XHR* from a foreign page is already
 * refused its preflight; this additionally covers form posts and navigations,
 * which are not preflighted at all.
 */
const requireTrustedOrigin = (allowedOrigins) => (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  if (isOriginAllowed(origin, allowedOrigins)) return next();

  console.warn(`[Security] Rejected ${req.method} ${req.path} from untrusted origin.`);
  return res.status(403).json({
    success: false,
    code: 'FORBIDDEN',
    message: 'This request could not be completed.'
  });
};

module.exports = { requireTrustedOrigin, SAFE_METHODS };
