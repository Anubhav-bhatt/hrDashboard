const prisma = require('../config/prisma');
const outlookService = require('../services/outlookService');
const { extractResumeText } = require('../services/resumeParser');
const { extractCandidateProfile } = require('../services/candidateExtractor');
const { checkDuplicateCandidate } = require('../services/duplicateService');
const { matchCandidateToJob } = require('../services/candidateMatcher');
const { generateCandidateInsights } = require('../services/candidateInsightService');
const { processCandidateResume } = require('../services/candidateProcessingService');
const { recordActivity } = require('../services/activityService');
const { listCandidatesForJob, getCandidateDetail } = require('../services/candidateService');
const { formatCandidateForApi } = require('../utils/candidateSerializer');
const { ASSIGNABLE_HR_STATUSES, LIST_SELECT } = require('../utils/candidateQuery');

const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const MAX_NOTE_LENGTH = 5000;


/** Job requirement bundle used by the matcher and compatibility flags. */
const buildJobRequirements = (job) => ({
  requiredSkills: job.requiredSkills || [],
  preferredSkills: job.preferredSkills || [],
  searchKeywords: job.searchKeywords || [],
  minimumExperience: job.minimumExperience || 0,
  maximumExperience: job.maximumExperience ?? null,
  salaryMin: job.salaryMin ?? null,
  salaryMax: job.salaryMax ?? null,
  preferredLocations: job.preferredLocations || [],
  qualifications: job.qualifications || [],
  preferredEducation: job.preferredEducation || [],
  roleKeywords: job.roleKeywords || []
});

/**
 * Loads a candidate that belongs to the given job. Returns null when either the
 * candidate does not exist or belongs to a different job, so a mismatched jobId
 * in the URL can never read or mutate another job's candidate.
 */
const findCandidateInJob = async (jobId, candidateId, options = {}) => {
  if (!jobId || !candidateId) return null;
  return prisma.candidate.findFirst({ where: { id: candidateId, jobId }, ...options });
};

const notFoundCandidate = (res) =>
  res.status(404).json({
    success: false,
    code: 'CANDIDATE_NOT_FOUND',
    message: 'This candidate profile could not be found for the selected job.'
  });

/**
 * @desc    Process candidate applications from Outlook in memory batches via Prisma
 * @route   POST /api/jobs/:jobId/candidates/process
 * @access  Private
 */
const processApplications = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { applications = [] } = req.body;

    if (!Array.isArray(applications) || applications.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'No candidate applications provided for processing.'
      });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }

    const connection = await prisma.outlookConnection.findFirst({ orderBy: { connectedAt: 'desc' } });
    if (!connection) {
      return res.status(401).json({
        success: false,
        code: 'OUTLOOK_NOT_CONNECTED',
        message: 'Microsoft Outlook is not connected. Please connect your mailbox before importing.'
      });
    }

    const concurrencyLimit = parseInt(process.env.RESUME_PROCESS_CONCURRENCY || '5', 10);
    const batches = chunkArray(applications, concurrencyLimit);

    let processedCount = 0;
    let duplicatesCount = 0;
    let failedCount = 0;
    const itemResults = [];

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (app) => {
          const { messageId, attachmentId, receivedAt, senderName, senderEmail, fileName, mimeType } = app;

          if (!messageId || !attachmentId) {
            failedCount++;
            itemResults.push({ fileName: fileName || 'unknown', status: 'FAILED', reason: 'Missing message or attachment ID.' });
            return;
          }

          try {
            const duplicateCheck = await checkDuplicateCandidate(job.id, {
              outlookMessageId: messageId,
              outlookAttachmentId: attachmentId,
              email: senderEmail
            });

            if (duplicateCheck.isDuplicate) {
              duplicatesCount++;
              itemResults.push({ fileName: fileName || 'resume.pdf', status: 'DUPLICATE', candidateId: duplicateCheck.existingCandidateId });
              return;
            }

            const attachment = await outlookService.getAttachmentBuffer(
              connection.accessToken,
              messageId,
              attachmentId
            );
            const parsed = await extractResumeText({
              buffer: attachment.buffer,
              mimeType: attachment.mimeType || mimeType,
              fileName: attachment.fileName || fileName
            });

            const profile = extractCandidateProfile(parsed.text, {
              senderName,
              senderEmail,
              fileName: attachment.fileName || fileName
            });

            if (profile.email) {
              const secondaryDup = await checkDuplicateCandidate(job.id, { email: profile.email, phone: profile.phone });
              if (secondaryDup.isDuplicate) {
                duplicatesCount++;
                itemResults.push({ fileName: attachment.fileName || fileName, status: 'DUPLICATE', candidateId: secondaryDup.existingCandidateId });
                return;
              }
            }

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
                parsedProfile: profile.parsedProfile || null,
                source: 'OUTLOOK',
                outlookMessageId: messageId,
                outlookAttachmentId: attachmentId,
                resumeFileName: attachment.fileName || fileName || 'resume.pdf',
                resumeMimeType: attachment.mimeType || mimeType || 'application/pdf',
                resumeSize: attachment.buffer ? attachment.buffer.length : null,
                receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
                extractionStatus: profile.extractionStatus,
                extractionWarnings: profile.extractionWarnings || [],
                resumeText: parsed.text
              }
            });

            await recordActivity({
              candidateId: candidate.id,
              actor: req.user,
              type: 'IMPORTED',
              description: 'Resume imported from Outlook mailbox.',
              metadata: { source: 'OUTLOOK', fileName: candidate.resumeFileName }
            });

            processedCount++;
            itemResults.push({ candidateId: candidate.id, name: candidate.name, fileName: candidate.resumeFileName, status: 'SUCCESS' });
          } catch (err) {
            if (err.code === 'P2002') {
              duplicatesCount++;
              itemResults.push({ fileName: fileName || 'resume.pdf', status: 'DUPLICATE' });
            } else {
              failedCount++;
              itemResults.push({ fileName: fileName || 'resume.pdf', status: 'FAILED', reason: err.message });
            }
          }
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: { total: applications.length, processed: processedCount, duplicates: duplicatesCount, failed: failedCount, items: itemResults }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Analyze job relevance for a single candidate using Prisma
 * @route   POST /api/jobs/:jobId/candidates/:candidateId/analyze
 * @access  Private
 */
const analyzeCandidate = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });

    const candidate = await findCandidateInJob(jobId, candidateId);
    if (!candidate) return notFoundCandidate(res);

    const jobReqs = buildJobRequirements(job);
    const candProfile = formatCandidateForApi(candidate, job);
    const matchResult = matchCandidateToJob({ ...job, requirements: jobReqs }, candProfile);
    const insights = await generateCandidateInsights(candProfile, matchResult, jobReqs);

    const updated = await prisma.candidate.update({
      where: { id: candidate.id },
      data: {
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
        analyzedAt: new Date()
      }
    });

    await recordActivity({
      candidateId: updated.id,
      actor: req.user,
      type: 'ANALYZED',
      description: `Relevance re-scored: ${matchResult.overallScore}% (${matchResult.alignmentLabel}).`,
      metadata: { score: matchResult.overallScore, label: matchResult.alignmentLabel }
    });

    return res.status(200).json({ success: true, data: formatCandidateForApi(updated, job) });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Batch analyze all candidates for a job using Prisma
 * @route   POST /api/jobs/:jobId/candidates/analyze-all
 * @access  Private
 */
const analyzeAllCandidates = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });

    const jobReqs = buildJobRequirements(job);

    // Resume blobs are excluded — batch scoring only needs profile fields.
    const candidates = await prisma.candidate.findMany({ where: { jobId }, select: LIST_SELECT });

    if (candidates.length === 0) {
      return res.status(200).json({ success: true, data: { total: 0, analyzed: 0, failed: 0 } });
    }

    const concurrencyLimit = parseInt(process.env.MATCH_PROCESS_CONCURRENCY || '10', 10);
    const batches = chunkArray(candidates, concurrencyLimit);

    let analyzedCount = 0;
    let failedCount = 0;

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (cand) => {
          try {
            const candProfile = formatCandidateForApi(cand, job);
            const matchResult = matchCandidateToJob({ ...job, requirements: jobReqs }, candProfile);
            const insights = await generateCandidateInsights(candProfile, matchResult, jobReqs);

            await prisma.candidate.update({
              where: { id: cand.id },
              data: {
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
                analyzedAt: new Date()
              }
            });
            analyzedCount++;
          } catch (err) {
            failedCount++;
            console.error(`[Analyze] Candidate ${cand.id} failed: ${err.message}`);
          }
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: { total: candidates.length, analyzed: analyzedCount, failed: failedCount }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update candidate human HR review status using Prisma
 * @route   PATCH /api/jobs/:jobId/candidates/:candidateId/status
 * @access  Private
 */
const updateCandidateStatus = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;
    const { status } = req.body || {};

    // SELECTED is excluded: it is the hiring outcome and is only ever reached by
    // closing the job, so that the candidate's status and the job's recorded
    // hire are written together and cannot drift apart.
    if (!status || !ASSIGNABLE_HR_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: `Invalid status. Allowed values: ${ASSIGNABLE_HR_STATUSES.join(', ')}.`
      });
    }

    // Scoped lookup first: without it a mismatched jobId would still mutate the
    // candidate, letting one job's URL change another job's records.
    const existing = await findCandidateInJob(jobId, candidateId, { select: { id: true, hrStatus: true } });
    if (!existing) return notFoundCandidate(res);

    // Historical integrity: the hire recorded against a closed job must stay
    // recorded. Allowing a revert here would leave the job pointing at a
    // candidate who no longer shows as selected.
    if (existing.hrStatus === 'SELECTED') {
      return res.status(409).json({
        success: false,
        code: 'CANDIDATE_ALREADY_SELECTED',
        message: 'This candidate was selected for the role. Their status cannot be changed.'
      });
    }

    if (existing.hrStatus === status) {
      const unchanged = await prisma.candidate.findUnique({ where: { id: existing.id }, select: LIST_SELECT });
      return res.status(200).json({ success: true, data: formatCandidateForApi(unchanged) });
    }

    const candidate = await prisma.candidate.update({
      where: { id: existing.id },
      data: { hrStatus: status },
      select: LIST_SELECT
    });

    await recordActivity({
      candidateId: candidate.id,
      actor: req.user,
      type: 'STATUS_CHANGED',
      description: `Status changed from ${existing.hrStatus} to ${status}.`,
      metadata: { from: existing.hrStatus, to: status }
    });

    return res.status(200).json({ success: true, data: formatCandidateForApi(candidate) });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update HR recruiter notes for a candidate using Prisma
 * @route   PATCH /api/jobs/:jobId/candidates/:candidateId/notes
 * @access  Private
 */
const updateCandidateNotes = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;
    const { notes = '' } = req.body || {};

    if (typeof notes !== 'string') {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Notes must be text.' });
    }

    const trimmed = notes.trim();
    if (trimmed.length > MAX_NOTE_LENGTH) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: `Notes cannot exceed ${MAX_NOTE_LENGTH} characters.`
      });
    }

    const existing = await findCandidateInJob(jobId, candidateId, { select: { id: true, notes: true } });
    if (!existing) return notFoundCandidate(res);

    const candidate = await prisma.candidate.update({
      where: { id: existing.id },
      data: { notes: trimmed },
      select: LIST_SELECT
    });

    if (trimmed && trimmed !== (existing.notes || '')) {
      await recordActivity({
        candidateId: candidate.id,
        actor: req.user,
        type: 'NOTE_ADDED',
        description: 'Recruiter notes updated.'
      });
    }

    return res.status(200).json({ success: true, data: formatCandidateForApi(candidate) });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Append a timestamped recruiter note
 * @route   POST /api/jobs/:jobId/candidates/:candidateId/notes
 * @access  Private
 */
const addCandidateNote = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;
    const { body = '' } = req.body || {};

    const trimmed = typeof body === 'string' ? body.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'Note text is required.' });
    }
    if (trimmed.length > MAX_NOTE_LENGTH) {
      return res.status(422).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: `A note cannot exceed ${MAX_NOTE_LENGTH} characters.`
      });
    }

    const existing = await findCandidateInJob(jobId, candidateId, { select: { id: true } });
    if (!existing) return notFoundCandidate(res);

    const note = await prisma.candidateNote.create({
      data: {
        candidateId: existing.id,
        authorId: req.user ? req.user.id : null,
        authorName: req.user ? req.user.name : 'Recruiter',
        body: trimmed
      }
    });

    await recordActivity({
      candidateId: existing.id,
      actor: req.user,
      type: 'NOTE_ADDED',
      description: 'Added a recruiter note.'
    });

    return res.status(201).json({
      success: true,
      data: { id: note.id, body: note.body, authorName: note.authorName, createdAt: note.createdAt }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Stream the candidate's original resume document
 * @route   GET /api/jobs/:jobId/candidates/:candidateId/resume
 * @access  Private
 *
 * Serves the stored bytes for uploaded resumes and re-fetches from Microsoft
 * Graph for Outlook-sourced ones. When neither is possible the endpoint returns
 * 404 rather than substituting placeholder content, so a recruiter is never
 * shown a document that is not the candidate's actual resume.
 */
const getCandidateResumeStream = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;
    const wantsDownload = req.query.download === '1' || req.query.download === 'true';

    const candidate = await findCandidateInJob(jobId, candidateId, {
      select: {
        id: true,
        source: true,
        resumeData: true,
        resumeFileName: true,
        resumeMimeType: true,
        outlookMessageId: true,
        outlookAttachmentId: true
      }
    });

    if (!candidate) return notFoundCandidate(res);

    let buffer = candidate.resumeData || null;
    let fileName = candidate.resumeFileName || 'resume.pdf';
    let mimeType = candidate.resumeMimeType || 'application/octet-stream';

    if (!buffer && String(candidate.source || '').toUpperCase() === 'OUTLOOK') {
      const connection = await prisma.outlookConnection.findFirst({ orderBy: { connectedAt: 'desc' } });
      if (!connection || !connection.accessToken) {
        return res.status(409).json({
          success: false,
          code: 'RESUME_SOURCE_UNAVAILABLE',
          message: 'This resume is stored in Outlook. Reconnect the mailbox to open the original document.'
        });
      }

      try {
        const attachment = await outlookService.getAttachmentBuffer(
          connection.accessToken,
          candidate.outlookMessageId,
          candidate.outlookAttachmentId
        );
        buffer = attachment.buffer;
        fileName = attachment.fileName || fileName;
        mimeType = attachment.mimeType || mimeType;
      } catch (err) {
        console.error(`[Resume] Outlook fetch failed for candidate ${candidate.id}: ${err.message}`);
        return res.status(502).json({
          success: false,
          code: 'RESUME_FETCH_FAILED',
          message: 'The original resume could not be retrieved from Outlook. Please try again later.'
        });
      }
    }

    if (!buffer || !buffer.length) {
      return res.status(404).json({
        success: false,
        code: 'RESUME_NOT_STORED',
        message: 'The original resume file is not available for this candidate. The extracted resume text is still viewable on the profile.'
      });
    }

    await recordActivity({
      candidateId: candidate.id,
      actor: req.user,
      type: 'RESUME_VIEWED',
      description: wantsDownload ? 'Downloaded the original resume.' : 'Opened the original resume.'
    });

    // The filename is candidate-controlled, so it is quoted and percent-encoded
    // to keep it from breaking out of the Content-Disposition header.
    const safeName = String(fileName).replace(/[\r\n"\\]/g, '_');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `${wantsDownload ? 'attachment' : 'inline'}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    // Allows the dashboard to read these bytes with an authenticated fetch and
    // render them from a same-origin blob URL. The app-wide framing protections
    // (X-Frame-Options, frame-ancestors) stay intact, because the document is
    // never embedded cross-origin.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get candidate profiles for a job with multi-attribute filtering,
 *          sorting and pagination
 * @route   GET /api/jobs/:jobId/candidates
 * @access  Private
 */
const getCandidatesByJob = async (req, res, next) => {
  try {
    const result = await listCandidatesForJob(req.params.jobId, req.query);

    if (!result) {
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }

    return res.status(200).json({
      success: true,
      data: result.candidates,
      pagination: result.pagination,
      facets: result.facets
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a full candidate profile including parsed resume sections,
 *          recruiter notes and activity trail
 * @route   GET /api/jobs/:jobId/candidates/:candidateId
 * @access  Private
 */
const getCandidateById = async (req, res, next) => {
  try {
    const { jobId, candidateId } = req.params;

    const data = await getCandidateDetail(candidateId, { jobId, includeResumeText: true });
    if (!data) return notFoundCandidate(res);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload & process a single candidate resume in real time using unified pipeline
 * @route   POST /api/jobs/:jobId/candidates/upload
 * @access  Private
 */
const uploadSingleCandidate = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Resume file is required.'
      });
    }

    const result = await processCandidateResume({
      jobId,
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sourceType: 'MANUAL_SINGLE',
      actor: req.user
    });

    if (result.status === 'SUCCESS') {
      return res.status(201).json({
        success: true,
        message: 'Candidate resume processed and scored successfully.',
        data: result
      });
    }

    if (result.status === 'DUPLICATE') {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_CANDIDATE',
        message: result.message || 'Duplicate candidate resume detected for this job.',
        data: result
      });
    }

    return res.status(422).json({
      success: false,
      code: result.status,
      message: result.message || 'Failed to process candidate resume.',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Upload & process a chunk of bulk/folder candidate resumes with bounded concurrency
 * @route   POST /api/jobs/:jobId/candidates/bulk-upload
 * @access  Private
 */
const uploadBulkCandidates = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const files = req.files || [];
    let relativePaths = [];

    if (req.body.relativePaths) {
      try {
        relativePaths =
          typeof req.body.relativePaths === 'string' ? JSON.parse(req.body.relativePaths) : req.body.relativePaths;
      } catch (e) {
        relativePaths = [];
      }
    }

    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'No resume files uploaded.'
      });
    }

    const maxBulkLimit = parseInt(process.env.MAX_BULK_RESUME_FILES || '2000', 10);
    if (files.length > maxBulkLimit) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: `Too many resumes selected. Maximum allowed per request is ${maxBulkLimit}.`
      });
    }

    const concurrency = parseInt(process.env.RESUME_PROCESS_CONCURRENCY || '5', 10);

    // Index is bound before dispatch so each file keeps its own relative path;
    // incrementing a shared counter inside concurrent callbacks would mismatch.
    const indexedFiles = files.map((file, index) => ({ file, index }));
    const batches = chunkArray(indexedFiles, concurrency);

    const itemResults = [];
    let successCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    let unsupportedCount = 0;

    for (const batch of batches) {
      await Promise.all(
        batch.map(async ({ file, index }) => {
          const relPath = Array.isArray(relativePaths) && relativePaths[index] ? relativePaths[index] : null;

          try {
            const result = await processCandidateResume({
              jobId,
              buffer: file.buffer,
              fileName: file.originalname,
              mimeType: file.mimetype,
              sourceType: 'MANUAL_BULK',
              relativePath: relPath,
              actor: req.user
            });

            itemResults.push(result);
            if (result.status === 'SUCCESS') successCount++;
            else if (result.status === 'DUPLICATE') duplicateCount++;
            else if (result.status === 'UNSUPPORTED') unsupportedCount++;
            else failedCount++;
          } catch (err) {
            failedCount++;
            itemResults.push({ status: 'FAILED', fileName: file.originalname, message: err.message });
          }
        })
      );
    }

    return res.status(200).json({
      success: true,
      data: {
        total: files.length,
        processed: itemResults.length,
        successCount,
        duplicateCount,
        failedCount,
        unsupportedCount,
        items: itemResults
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadSingleCandidate,
  uploadBulkCandidates,
  processApplications,
  analyzeCandidate,
  analyzeAllCandidates,
  updateCandidateStatus,
  updateCandidateNotes,
  addCandidateNote,
  getCandidateResumeStream,
  getCandidatesByJob,
  getCandidateById
};
