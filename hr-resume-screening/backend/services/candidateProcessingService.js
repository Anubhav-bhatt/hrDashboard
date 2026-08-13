const crypto = require('crypto');
const path = require('path');
const prisma = require('../config/prisma');
const { extractResumeText } = require('./resumeParser');
const { extractCandidateProfile } = require('./candidateExtractor');
const { checkDuplicateCandidate } = require('./duplicateService');
const { matchCandidateToJob } = require('./candidateMatcher');
const { generateCandidateInsights } = require('./candidateInsightService');
const { recordActivity } = require('./activityService');

/**
 * Unified Candidate Resume Ingestion & Processing Pipeline
 * Used by Single Upload, Bulk Files/Folder Upload, and Outlook Import.
 *
 * @param {Object} params
 * @param {string} params.jobId - Target recruitment job ID
 * @param {Buffer} params.buffer - In-memory resume file buffer
 * @param {string} params.fileName - Original file name
 * @param {string} [params.mimeType=''] - MIME type of file
 * @param {string} [params.sourceType='MANUAL_SINGLE'] - 'MANUAL_SINGLE' | 'MANUAL_BULK' | 'OUTLOOK'
 * @param {string} [params.relativePath=null] - Relative folder path for folder imports
 * @param {string} [params.sourceMessageId=null] - Outlook message ID (if applicable)
 * @param {string} [params.sourceAttachmentId=null] - Outlook attachment ID (if applicable)
 * @param {Object} [params.actor=null] - Signed-in recruiter recorded on the activity trail
 * @returns {Promise<Object>} Normalized result contract: { status, candidateId, fileName, score, candidate, message, warnings }
 */
const processCandidateResume = async ({
  jobId,
  buffer,
  fileName = 'resume.pdf',
  mimeType = '',
  sourceType = 'MANUAL_SINGLE',
  relativePath = null,
  sourceMessageId = null,
  sourceAttachmentId = null,
  actor = null
}) => {
  const ext = path.extname(fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  // 1. Buffer & File Presence Validation
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      status: 'EMPTY_RESUME',
      fileName,
      message: 'Empty file buffer provided.'
    };
  }

  // 2. Size Limit Check (Max 10MB)
  const maxBytes = parseInt(process.env.MAX_RESUME_SIZE_MB || '10', 10) * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return {
      status: 'FAILED',
      fileName,
      message: `Resume file exceeds maximum allowed size of ${process.env.MAX_RESUME_SIZE_MB || 10}MB.`
    };
  }

  // 3. File Extension / MIME Format Validation
  const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'];
  const isAllowedExt = ALLOWED_EXTENSIONS.includes(ext);
  const isAllowedMime =
    lowerMime === 'application/pdf' ||
    lowerMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lowerMime === 'application/docx' ||
    lowerMime === 'text/plain';

  if (!isAllowedExt && !isAllowedMime) {
    return {
      status: 'UNSUPPORTED',
      fileName,
      message: `Unsupported file format "${ext || 'unknown'}". Only PDF, DOCX, and TXT resumes are supported.`
    };
  }

  try {
    // 4. SHA-256 Content Hash Calculation
    const resumeHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // 5. Job Record Fetch
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return {
        status: 'FAILED',
        fileName,
        message: 'Target recruitment job does not exist.'
      };
    }

    // 6. Job-Scoped Content Hash Duplicate Check
    const existingHash = await prisma.candidate.findFirst({
      where: {
        jobId: job.id,
        resumeHash
      },
      select: { id: true, name: true, overallScore: true }
    });

    if (existingHash) {
      return {
        status: 'DUPLICATE',
        candidateId: existingHash.id,
        candidateName: existingHash.name,
        fileName,
        score: existingHash.overallScore,
        message: 'Resume content has already been uploaded for this job.'
      };
    }

    // 7. Parse Text from Buffer (in-memory)
    let parsedText = '';
    try {
      const parsed = await extractResumeText({ buffer, mimeType, fileName });
      parsedText = parsed.text;
    } catch (parseErr) {
      return {
        status: parseErr.message.includes('SCANNED_DOCUMENT') ? 'EMPTY_RESUME' : 'FAILED',
        fileName,
        message: parseErr.message
      };
    }

    // 8. Extract Candidate Profile
    const profile = extractCandidateProfile(parsedText, { fileName });

    // 9. Secondary Duplicate Check (Email & Phone per Job)
    if (profile.email || profile.phone) {
      const dupCheck = await checkDuplicateCandidate(job.id, {
        email: profile.email,
        phone: profile.phone
      });

      if (dupCheck.isDuplicate) {
        return {
          status: 'DUPLICATE',
          candidateId: dupCheck.existingCandidateId,
          candidateName: profile.name,
          fileName,
          message: `Candidate matching ${dupCheck.reason === 'EMAIL_DUPLICATE' ? 'email' : 'phone'} already exists for this job.`
        };
      }
    }

    // 10. Deterministic Job Relevance Matching
    const jobReqs = {
      requiredSkills: job.requiredSkills || [],
      preferredSkills: job.preferredSkills || [],
      searchKeywords: job.searchKeywords || [],
      minimumExperience: job.minimumExperience || 0,
      maximumExperience: job.maximumExperience || null,
      salaryMin: job.salaryMin || null,
      salaryMax: job.salaryMax || null,
      preferredLocations: job.preferredLocations || [],
      qualifications: job.qualifications || [],
      preferredEducation: job.preferredEducation || [],
      roleKeywords: job.roleKeywords || []
    };

    const matchResult = matchCandidateToJob({ ...job, requirements: jobReqs }, profile);
    const insights = await generateCandidateInsights(profile, matchResult, jobReqs);

    // 11. Persist Candidate Record to PostgreSQL
    const uniqueMessageId = sourceMessageId || `manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const uniqueAttachmentId = sourceAttachmentId || `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Retain the original bytes so recruiters can open and download the real
    // document later. Outlook-sourced resumes are re-fetched live from Graph
    // instead, so they are not duplicated here.
    const storeBlob = process.env.STORE_RESUME_BLOB !== 'false' && sourceType !== 'OUTLOOK';

    const candidate = await prisma.candidate.create({
      data: {
        jobId: job.id,
        name: profile.name,
        nameSource: profile.nameSource,
        email: profile.email,
        alternateEmail: profile.alternateEmail,
        phone: profile.phone,
        alternatePhone: profile.alternatePhone,
        currentRole: profile.currentRole,
        headline: profile.headline,
        summary: profile.summary,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        totalExperience: profile.totalExperience,
        currentLocation: profile.currentLocation,
        preferredLocations: profile.preferredLocations || [],
        currentSalary: profile.currentSalary,
        expectedSalary: profile.expectedSalary,
        qualification: profile.qualification,
        skills: profile.skills || [],
        education: profile.education || [],
        projects: profile.projects || [],
        resumeText: parsedText,
        parsedProfile: profile.parsedProfile || null,
        source: sourceType,
        sourceRelativePath: relativePath || null,
        outlookMessageId: uniqueMessageId,
        outlookAttachmentId: uniqueAttachmentId,
        resumeFileName: fileName || 'resume.pdf',
        resumeMimeType: mimeType || 'application/pdf',
        resumeHash,
        resumeData: storeBlob ? buffer : null,
        resumeSize: buffer.length,
        overallScore: matchResult.overallScore,
        alignmentLabel: matchResult.alignmentLabel,
        requiredSkillScore: matchResult.requiredSkillScore,
        experienceScore: matchResult.experienceScore,
        roleScore: matchResult.roleScore,
        preferredSkillScore: matchResult.preferredSkillScore,
        projectScore: matchResult.projectScore,
        educationScore: matchResult.educationScore,
        matchedSkills: matchResult.matchedSkills || [],
        missingRequiredSkills: matchResult.missingRequiredSkills || [],
        matchedPreferredSkills: matchResult.matchedPreferredSkills || [],
        matchedKeywords: matchResult.matchedKeywords || [],
        strengths: insights.strengths || [],
        gaps: insights.gaps || [],
        analysisSummary: insights.summary || '',
        extractionStatus: profile.extractionStatus,
        extractionWarnings: profile.extractionWarnings || [],
        analyzedAt: new Date()
      }
    });

    await recordActivity({
      candidateId: candidate.id,
      actor,
      type: 'IMPORTED',
      description: `Resume imported via ${sourceType === 'OUTLOOK' ? 'Outlook' : 'direct upload'} and scored ${candidate.overallScore}%.`,
      metadata: { source: sourceType, fileName: candidate.resumeFileName, score: candidate.overallScore }
    });

    return {
      status: 'SUCCESS',
      candidateId: candidate.id,
      candidateName: candidate.name,
      fileName,
      score: candidate.overallScore,
      alignmentLabel: candidate.alignmentLabel,
      warnings: profile.extractionWarnings || [],
      candidate: {
        id: candidate.id,
        name: candidate.name,
        email: candidate.email,
        totalExperience: candidate.totalExperience,
        currentLocation: candidate.currentLocation,
        qualification: candidate.qualification,
        skills: candidate.skills,
        overallScore: candidate.overallScore,
        alignmentLabel: candidate.alignmentLabel
      }
    };
  } catch (err) {
    if (err.code === 'P2002') {
      return {
        status: 'DUPLICATE',
        fileName,
        message: 'Duplicate candidate resume detected for this job.'
      };
    }
    return {
      status: 'FAILED',
      fileName,
      message: `Failed to process candidate: ${err.message}`
    };
  }
};

module.exports = {
  processCandidateResume
};
