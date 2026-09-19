const prisma = require('../config/prisma');

/**
 * Workspaces — the tenant boundary.
 *
 * One authority decides who may see a record: `Job.workspaceId`. Candidates,
 * notes, activities and import sessions are reached *through* their job rather
 * than carrying their own copy of the owner, so there is nothing to keep in sync
 * and no way for a candidate to disagree with its job about who owns it.
 *
 * Everything here fails closed. A request with no resolved workspace gets no
 * records — never "all records", which is what the absence of a filter would
 * have meant before this existed.
 */

/** The workspace created by the tenancy migration to hold pre-tenancy data. */
const LEGACY_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const WORKSPACE_ROLES = Object.freeze({ OWNER: 'OWNER', MEMBER: 'MEMBER' });

/**
 * Names a new workspace after its creator, because the recruiter never chose one.
 *
 * Signup asks for a name and an email and nothing else, so this has to be
 * derived. It is a label, not an identifier — two workspaces may share a name.
 */
const defaultWorkspaceName = (userName, email) => {
  const person = String(userName || '').trim();
  if (person) return `${person.split(/\s+/)[0]}'s workspace`;
  const local = String(email || '').split('@')[0];
  return local ? `${local}'s workspace` : 'My workspace';
};

/**
 * Creates a workspace and makes the user its owner.
 *
 * Takes a transaction client so signup can create the user, the workspace and
 * the membership as one unit — a half-made account with no workspace would be
 * able to sign in and then see nothing, with no way to recover.
 */
const createWorkspaceForUser = async (client, { userId, userName, email, name }) => {
  const workspace = await client.workspace.create({
    data: { name: name || defaultWorkspaceName(userName, email) }
  });

  await client.workspaceMember.create({
    data: { workspaceId: workspace.id, userId, role: WORKSPACE_ROLES.OWNER }
  });

  return workspace;
};

/**
 * The workspace a user acts in.
 *
 * A person could belong to several later; today signup creates exactly one, so
 * the oldest membership is "their" workspace. Returns null when there is none,
 * and callers treat that as "show nothing" rather than "show everything".
 */
const resolveWorkspaceId = async (userId) => {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true }
  });
  return membership ? membership.workspaceId : null;
};

/**
 * Ensures a user has somewhere to work.
 *
 * Used by the account-seeding paths, which create users directly rather than
 * through signup. Without this an operator-created account would authenticate
 * successfully and then be refused by every scoped query.
 */
const ensureWorkspaceForUser = async (client, { userId, userName, email }) => {
  const existing = await client.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { workspaceId: true }
  });
  if (existing) return existing.workspaceId;

  const workspace = await createWorkspaceForUser(client, { userId, userName, email });
  return workspace.id;
};

/**
 * A `where` fragment restricting a Job query to one workspace.
 *
 * Returns an unsatisfiable clause when there is no workspace, so a caller that
 * forgets to check still returns nothing. The failure mode of a missing filter
 * has to be an empty list, not the whole table.
 */
const jobScope = (workspaceId) => (workspaceId ? { workspaceId } : { workspaceId: '__no_workspace__' });

/**
 * The same restriction for models that reach their workspace through a job:
 * Candidate, and through Candidate the notes and activities.
 */
const throughJobScope = (workspaceId) => ({ job: jobScope(workspaceId) });

/**
 * Confirms a job belongs to the workspace before anything is done with it.
 *
 * This is what stops id guessing. Every `/api/jobs/:jobId/...` route runs it
 * before the handler, so a valid session plus someone else's job id reads as
 * "not found" rather than returning their candidates.
 */
const jobBelongsToWorkspace = async (jobId, workspaceId) => {
  if (!jobId || !workspaceId) return false;
  const match = await prisma.job.findFirst({ where: { id: jobId, workspaceId }, select: { id: true } });
  return Boolean(match);
};

module.exports = {
  LEGACY_WORKSPACE_ID,
  WORKSPACE_ROLES,
  defaultWorkspaceName,
  createWorkspaceForUser,
  ensureWorkspaceForUser,
  resolveWorkspaceId,
  jobScope,
  throughJobScope,
  jobBelongsToWorkspace
};
