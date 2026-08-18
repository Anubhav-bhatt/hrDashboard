/**
 * Tool permissions, mapped onto the application's actual authorization model.
 *
 * What that model currently is, stated plainly: the backend authenticates every
 * data route with `middleware/auth.requireAuth`, and `requireRole` exists and is
 * exported but is applied to **no route**. So today a signed-in RECRUITER and a
 * signed-in ADMIN can read exactly the same jobs, candidates, scores and
 * analytics. There is authentication, and there is no role-based differentiation.
 *
 * The table below mirrors that rather than inventing something stricter or more
 * permissive. Both roles get the four read permissions, because both roles can
 * already read all of this through the HTTP API. Granting the AI less would be a
 * fiction — the same user can open the same data in the dashboard. Granting it
 * more is the thing that must never happen, and cannot: there is nothing more to
 * grant, since no tool writes.
 *
 * When real RBAC arrives, ROLE_PERMISSIONS is the single place that changes, and
 * every tool inherits the new rules without being touched.
 *
 * The rule this file enforces: an agent acts as the signed-in user and can reach
 * nothing that user could not reach themselves. It is never an administrator.
 */

/** Permission identifiers declared by tools. */
const PERMISSIONS = Object.freeze({
  JOBS_READ: 'jobs.read',
  CANDIDATES_READ: 'candidates.read',
  SCORES_READ: 'scores.read',
  ANALYTICS_READ: 'analytics.read'
});

const ALL_READ_PERMISSIONS = Object.freeze([
  PERMISSIONS.JOBS_READ,
  PERMISSIONS.CANDIDATES_READ,
  PERMISSIONS.SCORES_READ,
  PERMISSIONS.ANALYTICS_READ
]);

/**
 * Role -> granted permissions.
 *
 * Keys match the `role` values the User model stores ("RECRUITER" | "ADMIN",
 * see prisma/schema.prisma). A role that is not listed gets nothing.
 */
const ROLE_PERMISSIONS = Object.freeze({
  RECRUITER: ALL_READ_PERMISSIONS,
  ADMIN: ALL_READ_PERMISSIONS
});

/**
 * Resolves the permissions an execution context carries.
 *
 * Identity is read from the context built by `ai/context/AgentContext.js`, which
 * takes `userId` and `userRole` from the verified session and rejects any request
 * that tries to supply them. That is what makes this trustworthy: there is no
 * path by which a request body reaches `context.userRole`.
 *
 * A context with no authenticated user resolves to no permissions at all, so an
 * unauthenticated caller is refused rather than defaulted.
 *
 * @param {{userId?: string|null, userRole?: string|null}} [context]
 * @returns {Set<string>}
 */
const resolvePermissions = (context) => {
  if (!context || !context.userId || !context.userRole) return new Set();

  // Own-property lookup against a frozen literal: a role named "constructor"
  // cannot resolve an inherited member.
  const role = String(context.userRole);
  const granted = Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role) ? ROLE_PERMISSIONS[role] : [];

  return new Set(granted);
};

/**
 * @param {{userId?: string|null, userRole?: string|null}} context
 * @param {string} permission
 * @returns {boolean}
 */
const hasPermission = (context, permission) => resolvePermissions(context).has(permission);

module.exports = {
  PERMISSIONS,
  ALL_READ_PERMISSIONS,
  ROLE_PERMISSIONS,
  resolvePermissions,
  hasPermission
};
