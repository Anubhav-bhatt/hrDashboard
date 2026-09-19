const prisma = require('../config/prisma');
const { ensureWorkspaceForUser } = require('../services/workspaceService');

/**
 * Gives a test account a workspace to work in.
 *
 * Jobs are workspace-owned and `requireAuth` refuses a session whose account has
 * no membership, so a suite that creates a user directly has to create the
 * workspace too — exactly as signup and the seeding paths do. Without this a
 * fixture user authenticates and is then refused by every scoped route, which
 * looks like a broken product rather than a missing fixture row.
 *
 * Idempotent: calling it twice for the same user returns the same workspace.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @param {string} [options.name] Display name used to label the workspace
 * @param {string} [options.email] Fallback label when there is no name
 * @returns {Promise<string>} The workspace id
 */
const ensureTestWorkspace = (userId, { name = 'Test Recruiter', email = 'test@example.invalid' } = {}) =>
  ensureWorkspaceForUser(prisma, { userId, userName: name, email });

/**
 * Adds a second account to an existing workspace.
 *
 * Used where a suite needs two people who can see the same records — proving a
 * route is closed by *role* rather than by tenancy, for instance. Putting them
 * in separate workspaces would make that test pass for the wrong reason.
 */
const addWorkspaceMember = async (workspaceId, userId, role = 'MEMBER') => {
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId } },
    update: { role },
    create: { workspaceId, userId, role }
  });
  return workspaceId;
};

/** Removes the workspaces and memberships a suite created. */
const cleanupTestWorkspaces = async (userIds = []) => {
  if (!userIds.length) return;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: { in: userIds } },
    select: { workspaceId: true }
  });
  const workspaceIds = memberships.map((m) => m.workspaceId);
  await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
  if (workspaceIds.length) {
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  }
};

module.exports = { ensureTestWorkspace, addWorkspaceMember, cleanupTestWorkspaces };
