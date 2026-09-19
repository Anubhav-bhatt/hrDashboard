/**
 * Creates or updates a recruiter account.
 *
 *   npm run seed:user -- recruiter@company.com "StrongPassword123" "Full Name" ADMIN
 *
 * Falls back to SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME from
 * the environment when arguments are omitted. Passwords are never logged.
 */
require('dotenv').config();
const prisma = require('../config/prisma');
const { hashPassword } = require('../services/authService');
const { ensureWorkspaceForUser } = require('../services/workspaceService');

const run = async () => {
  const [emailArg, passwordArg, nameArg, roleArg] = process.argv.slice(2);

  const email = (emailArg || process.env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = passwordArg || process.env.SEED_ADMIN_PASSWORD || '';
  const name = nameArg || process.env.SEED_ADMIN_NAME || 'HR Administrator';
  const role = (roleArg || 'ADMIN').toUpperCase();

  if (!email || !email.includes('@')) {
    console.error('[Seed] A valid email address is required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[Seed] Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!['ADMIN', 'RECRUITER'].includes(role)) {
    console.error('[Seed] Role must be ADMIN or RECRUITER.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);

  // The account and its workspace are created together. Without a workspace the
  // account signs in successfully and is then refused by every scoped query.
  const { user, workspaceId } = await prisma.$transaction(async (tx) => {
    const created = await tx.user.upsert({
      where: { email },
      update: { passwordHash, name, role, isActive: true },
      create: { email, passwordHash, name, role }
    });
    const ws = await ensureWorkspaceForUser(tx, { userId: created.id, userName: name, email });
    return { user: created, workspaceId: ws };
  });

  console.log(`[Seed] Recruiter account ready: ${user.email} (role ${user.role}, id ${user.id})`);
  console.log(`[Seed] Workspace: ${workspaceId}`);
};

run()
  .catch((err) => {
    console.error('[Seed] Failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
