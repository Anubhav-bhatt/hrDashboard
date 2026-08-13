const prisma = require('../config/prisma');

/**
 * Checks whether a candidate application is a duplicate for the specified job using Prisma
 *
 * @param {string} jobId
 * @param {Object} applicationData - { outlookMessageId, outlookAttachmentId, email, phone }
 * @returns {Promise<{ isDuplicate: boolean, existingCandidateId?: string, reason?: string }>}
 */
const checkDuplicateCandidate = async (jobId, applicationData) => {
  const { outlookMessageId, outlookAttachmentId, email, phone } = applicationData;

  // Check 1: Exact Outlook message + attachment ID match
  if (outlookMessageId && outlookAttachmentId) {
    const existingAttachment = await prisma.candidate.findFirst({
      where: {
        jobId,
        outlookMessageId,
        outlookAttachmentId
      },
      select: { id: true }
    });

    if (existingAttachment) {
      return {
        isDuplicate: true,
        existingCandidateId: existingAttachment.id,
        reason: 'EXACT_ATTACHMENT_DUPLICATE'
      };
    }
  }

  // Check 2: Same normalized candidate email for this job
  if (email) {
    const existingEmail = await prisma.candidate.findFirst({
      where: {
        jobId,
        email: {
          equals: email.toLowerCase().trim(),
          mode: 'insensitive'
        }
      },
      select: { id: true }
    });

    if (existingEmail) {
      return {
        isDuplicate: true,
        existingCandidateId: existingEmail.id,
        reason: 'EMAIL_DUPLICATE'
      };
    }
  }

  // Check 3: Same normalized candidate phone for this job
  if (phone) {
    const existingPhone = await prisma.candidate.findFirst({
      where: {
        jobId,
        phone: phone.trim()
      },
      select: { id: true }
    });

    if (existingPhone) {
      return {
        isDuplicate: true,
        existingCandidateId: existingPhone.id,
        reason: 'PHONE_DUPLICATE'
      };
    }
  }

  return { isDuplicate: false };
};

module.exports = {
  checkDuplicateCandidate
};
