const prisma = require('../config/prisma');

/**
 * Platform Activity Audit Trail Service
 *
 * Records and retrieves platform-wide business and security events:
 * - Authentication: LOGIN, LOGOUT, ACCOUNT_CREATED, PROFILE_UPDATED, PASSWORD_CHANGED
 * - User Administration: USER_STATUS_CHANGED, USER_ROLE_CHANGED
 * - Recruitment Operations: JOB_CREATED, JOB_UPDATED, JOB_CLOSED, CANDIDATE_IMPORTED,
 *   CANDIDATE_SHORTLISTED, CANDIDATE_STATUS_CHANGED, SCREENING_RUN, RANKING_RUN, COMPARISON_RUN
 *
 * Privacy Guarantees (Phase 19 & Phase 59):
 * - Never stores plaintext passwords, password hashes, access/refresh tokens, full resumes,
 *   email bodies or secrets in metadata.
 */

const FORBIDDEN_METADATA_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'accessToken',
  'refreshToken',
  'token',
  'jwt',
  'secret',
  'resumeData',
  'resumeText',
  'emailBody',
  'body'
]);

/**
 * Deeply scrubs forbidden keys from metadata objects.
 */
const sanitizeMetadata = (obj, depth = 0) => {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  if (Array.isArray(obj)) return obj.map((item) => sanitizeMetadata(item, depth + 1));

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue;
    if (value && typeof value === 'object') {
      clean[key] = sanitizeMetadata(value, depth + 1);
    } else if (typeof value === 'string') {
      // Truncate overly long metadata strings to 500 chars
      clean[key] = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    } else {
      clean[key] = value;
    }
  }
  return clean;
};

/**
 * Records a platform activity event. Non-blocking and resilient to failure.
 */
const recordPlatformActivity = async ({
  userId = null,
  userName = 'System',
  userEmail = null,
  action,
  entityType = null,
  entityId = null,
  entityName = null,
  description,
  metadata = null
}) => {
  try {
    const cleanMeta = metadata ? sanitizeMetadata(metadata) : null;
    return await prisma.platformActivity.create({
      data: {
        userId,
        userName: userName || 'System',
        userEmail,
        action,
        entityType,
        entityId: entityId ? String(entityId) : null,
        entityName: entityName ? String(entityName).slice(0, 200) : null,
        description: description || action,
        metadata: cleanMeta
      }
    });
  } catch (err) {
    console.warn(`[PlatformActivity] Failed to record ${action}:`, err.message);
    return null;
  }
};

/**
 * Records a platform activity within an existing transaction.
 */
const recordPlatformActivityWithin = async (
  tx,
  {
    userId = null,
    userName = 'System',
    userEmail = null,
    action,
    entityType = null,
    entityId = null,
    entityName = null,
    description,
    metadata = null
  }
) => {
  const cleanMeta = metadata ? sanitizeMetadata(metadata) : null;
  return tx.platformActivity.create({
    data: {
      userId,
      userName: userName || 'System',
      userEmail,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      entityName: entityName ? String(entityName).slice(0, 200) : null,
      description: description || action,
      metadata: cleanMeta
    }
  });
};

/**
 * Retrieves platform activities with filtering and pagination.
 */
const getPlatformActivities = async ({
  userId = null,
  action = null,
  startDate = null,
  endDate = null,
  page = 1,
  limit = 25
} = {}) => {
  const where = {};

  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (startDate || endDate) {
    where.createdAt = {};
    if (startDate) where.createdAt.gte = new Date(startDate);
    if (endDate) where.createdAt.lte = new Date(endDate);
  }

  const take = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

  const [activities, totalCount] = await Promise.all([
    prisma.platformActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true
          }
        }
      }
    }),
    prisma.platformActivity.count({ where })
  ]);

  return {
    activities,
    pagination: {
      total: totalCount,
      page: Math.floor(skip / take) + 1,
      limit: take,
      totalPages: Math.ceil(totalCount / take)
    }
  };
};

module.exports = {
  recordPlatformActivity,
  recordPlatformActivityWithin,
  getPlatformActivities,
  sanitizeMetadata
};
