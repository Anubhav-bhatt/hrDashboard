const prisma = require('../config/prisma');

/**
 * Appends an entry to a candidate's recruitment activity trail.
 *
 * Logging is best-effort: a failure here must never break the recruiter action
 * that triggered it. Personal data (resume text, full contact details, tokens)
 * is deliberately never written to this trail — only what happened, by whom.
 *
 * @param {Object} params
 * @param {string} params.candidateId
 * @param {Object|null} [params.actor] Signed-in user ({ id, name }) or null for system events
 * @param {string} params.type IMPORTED | STATUS_CHANGED | NOTE_ADDED | ANALYZED | RESUME_VIEWED
 * @param {string} params.description Human-readable summary
 * @param {Object} [params.metadata] Small, non-sensitive structured detail
 */
const recordActivity = async ({ candidateId, actor = null, type, description, metadata = null }) => {
  if (!candidateId || !type || !description) return null;

  try {
    return await prisma.candidateActivity.create({
      data: {
        candidateId,
        actorId: actor && actor.id ? actor.id : null,
        actorName: actor && actor.name ? actor.name : 'System',
        type,
        description: String(description).slice(0, 500),
        metadata: metadata || undefined
      }
    });
  } catch (err) {
    console.warn(`[Activity] Could not record ${type} for candidate ${candidateId}: ${err.message}`);
    return null;
  }
};

/**
 * Same as recordActivity but written through a caller-supplied transaction
 * client, and deliberately *not* error-swallowing.
 *
 * Job closure records its audit trail as part of the same transaction that flips
 * the statuses, so a job can never end up closed without the matching history.
 * A failure here must therefore roll the whole closure back rather than be
 * logged and ignored.
 *
 * @param {Object} tx Prisma transaction client
 * @param {Object} params Same shape as recordActivity
 */
const recordActivityWithin = (tx, { candidateId, actor = null, type, description, metadata = null }) =>
  tx.candidateActivity.create({
    data: {
      candidateId,
      actorId: actor && actor.id ? actor.id : null,
      actorName: actor && actor.name ? actor.name : 'System',
      type,
      description: String(description).slice(0, 500),
      metadata: metadata || undefined
    }
  });

/** Most recent activity entries for a candidate, newest first. */
const getActivityForCandidate = async (candidateId, limit = 50) =>
  prisma.candidateActivity.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
  });

module.exports = { recordActivity, recordActivityWithin, getActivityForCandidate };
