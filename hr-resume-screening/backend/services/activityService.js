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

/** Most recent activity entries for a candidate, newest first. */
const getActivityForCandidate = async (candidateId, limit = 50) =>
  prisma.candidateActivity.findMany({
    where: { candidateId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
  });

module.exports = { recordActivity, getActivityForCandidate };
