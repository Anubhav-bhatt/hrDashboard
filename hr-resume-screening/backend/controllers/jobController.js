const prisma = require('../config/prisma');
const { extractJDText } = require('../services/jdParser');
const { extractJDRequirements } = require('../services/jdRequirementExtractor');
const outlookService = require('../services/outlookService');
const { getJobSummaries, getJobStatusCounts } = require('../services/jobSummaryService');
const { STRONG_MATCH_MIN } = require('../utils/scoreThresholds');
const {
  closeJob,
  getShortlistedCandidates,
  JobClosureError,
  SELECTED_CANDIDATE_SELECT
} = require('../services/jobClosureService');

/**
 * @desc    Create a new recruitment job with uploaded JD using Prisma
 * @route   POST /api/jobs
 * @access  Public
 */
const createJob = async (req, res, next) => {
  try {
    const { title } = req.body;
    const file = req.file;

    // Validate title
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Job title is required.'
      });
    }

    // Validate JD File presence
    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'Job Description file is required.'
      });
    }

    // Extract text from JD file in memory
    const extractedText = await extractJDText(file);

    // Extract structured requirements from JD text
    const reqs = extractJDRequirements(extractedText, title.trim());

    // Save job to PostgreSQL via Prisma
    const job = await prisma.job.create({
      data: {
        title: title.trim(),
        jdFileName: file.originalname,
        jdMimeType: file.mimetype,
        jdText: extractedText,
        requiredSkills: reqs.requiredSkills || [],
        preferredSkills: reqs.preferredSkills || [],
        roleKeywords: reqs.roleKeywords || [],
        minimumExperience: reqs.minimumExperience || 0,
        preferredEducation: reqs.preferredEducation || []
      }
    });

    return res.status(201).json({
      success: true,
      data: {
        _id: job.id,
        id: job.id,
        title: job.title,
        jdFileName: job.jdFileName,
        createdAt: job.createdAt,
        requirements: {
          requiredSkills: job.requiredSkills,
          preferredSkills: job.preferredSkills,
          minimumExperience: job.minimumExperience,
          preferredEducation: job.preferredEducation,
          roleKeywords: job.roleKeywords
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all recruitment jobs with aggregated candidate statistics
 * @route   GET /api/jobs
 * @access  Private
 *
 * Supports ?search, ?sort (newest | oldest | candidates | best_match | title)
 * and ?limit. Statistics come from grouped PostgreSQL queries — the previous
 * implementation ran three counts per job, so this no longer scales with the
 * number of jobs.
 */
const getAllJobs = async (req, res, next) => {
  try {
    const [result, statusCounts] = await Promise.all([
      getJobSummaries({
        sort: req.query.sort,
        search: req.query.search,
        status: req.query.status,
        limit: req.query.limit,
        page: req.query.page
      }),
      // Counts for the All / Active / Closed selector, under the same search
      // term but ignoring the current lifecycle filter.
      getJobStatusCounts({ search: req.query.search })
    ]);

    return res.status(200).json({
      success: true,
      data: result.jobs,
      meta: {
        total: result.pagination.total,
        pagination: result.pagination,
        statusCounts,
        strongMatchThreshold: STRONG_MATCH_MIN
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Aggregated job statistics for the jobs portal
 * @route   GET /api/jobs/summary
 * @access  Private
 *
 * Identical payload to GET /api/jobs; exposed under an explicit name so the
 * portal's intent is clear at the call site.
 */
const getJobsSummary = async (req, res, next) => {
  try {
    const [result, statusCounts] = await Promise.all([
      getJobSummaries({
        sort: req.query.sort,
        search: req.query.search,
        status: req.query.status,
        limit: req.query.limit,
        page: req.query.page
      }),
      getJobStatusCounts({ search: req.query.search })
    ]);

    return res.status(200).json({
      success: true,
      data: result.jobs,
      meta: {
        total: result.pagination.total,
        pagination: result.pagination,
        statusCounts,
        strongMatchThreshold: STRONG_MATCH_MIN
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single job details including full extracted JD text and job metrics via Prisma
 * @route   GET /api/jobs/:id
 * @access  Public
 */
const getJobById = async (req, res, next) => {
  try {
    const { id } = req.params;

    let job = await prisma.job.findUnique({
      where: { id }
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    // Lazy load requirements if missing from legacy records
    if (!job.requiredSkills || job.requiredSkills.length === 0) {
      const reqs = extractJDRequirements(job.jdText, job.title);
      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          requiredSkills: reqs.requiredSkills || [],
          preferredSkills: reqs.preferredSkills || [],
          roleKeywords: reqs.roleKeywords || [],
          minimumExperience: reqs.minimumExperience || 0,
          preferredEducation: reqs.preferredEducation || []
        }
      });
    }

    // Compute Metrics & Score Tier Distribution
    const candidatesCount = await prisma.candidate.count({ where: { jobId: job.id } });
    const analyzedCount = await prisma.candidate.count({
      where: { jobId: job.id, overallScore: { not: null } }
    });

    const tier90 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 90 } } });
    const tier80_89 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 80, lt: 90 } } });
    const tier70_79 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { gte: 70, lt: 80 } } });
    const tierBelow70 = await prisma.candidate.count({ where: { jobId: job.id, overallScore: { lt: 70 } } });

    // Aggregate Import Sessions
    const importSessions = await prisma.importSession.findMany({ where: { jobId: job.id } });
    const applicationsFound = importSessions.reduce((acc, sess) => acc + (sess.emailsFound || 0), 0);

    // Operational processing badge, distinct from the persisted OPEN/CLOSED
    // lifecycle returned as `status` below.
    let processingStatus = 'NEW';
    if (candidatesCount > 0 && analyzedCount === 0) processingStatus = 'IMPORTING';
    else if (candidatesCount > 0 && analyzedCount < candidatesCount) processingStatus = 'READY_FOR_ANALYSIS';
    else if (candidatesCount > 0 && analyzedCount === candidatesCount) processingStatus = 'COMPLETED';

    const shortlistedCount = await prisma.candidate.count({
      where: { jobId: job.id, hrStatus: 'SHORTLISTED' }
    });

    // Projection only: enough to render the closed-job banner, never the resume.
    const selectedCandidate = job.selectedCandidateId
      ? await prisma.candidate.findUnique({
          where: { id: job.selectedCandidateId },
          select: SELECTED_CANDIDATE_SELECT
        })
      : null;

    return res.status(200).json({
      success: true,
      data: {
        _id: job.id,
        id: job.id,
        title: job.title,
        status: job.status,
        isClosed: job.status === 'CLOSED',
        closedAt: job.closedAt,
        selectedCandidateId: job.selectedCandidateId,
        selectedCandidate,
        // Drives whether the Close Job action is offered.
        canClose: job.status === 'OPEN' && shortlistedCount > 0,
        shortlistedCount,
        jdFileName: job.jdFileName,
        jdMimeType: job.jdMimeType,
        jdText: job.jdText,
        requirements: {
          requiredSkills: job.requiredSkills || [],
          preferredSkills: job.preferredSkills || [],
          searchKeywords: job.searchKeywords || [],
          minimumExperience: job.minimumExperience || 0,
          maximumExperience: job.maximumExperience || null,
          salaryMin: job.salaryMin || null,
          salaryMax: job.salaryMax || null,
          salaryCurrency: job.salaryCurrency || 'INR',
          preferredLocations: job.preferredLocations || [],
          qualifications: job.qualifications || [],
          preferredEducation: job.preferredEducation || [],
          roleKeywords: job.roleKeywords || []
        },
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        metrics: {
          applicationsFound: applicationsFound || candidatesCount,
          candidatesCount,
          analyzedCount,
          shortlistedCount,
          processingStatus,
          scoreTiers: {
            tier90,
            tier80_89,
            tier70_79,
            tierBelow70
          }
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update Job search criteria & requirements via Prisma
 * @route   PATCH /api/jobs/:id or PATCH /api/jobs/:id/search-criteria
 * @access  Public
 */
const updateJobSearchCriteria = async (req, res, next) => {
  try {
    const id = req.params.id || req.params.jobId;
    const {
      requiredSkills,
      preferredSkills,
      searchKeywords,
      minimumExperience,
      maximumExperience,
      salaryMin,
      salaryMax,
      salaryCurrency,
      preferredLocations,
      qualifications
    } = req.body;

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    const updateData = {};

    // Helper for string array deduplication & cleaning
    const sanitizeStringArray = (arr, maxLen, fieldName) => {
      if (!Array.isArray(arr)) return undefined;
      const clean = [];
      const seenLower = new Set();
      for (const item of arr) {
        if (typeof item === 'string' && item.trim().length > 0) {
          const trimmed = item.trim();
          const lower = trimmed.toLowerCase();
          if (seenLower.has(lower)) {
            continue;
          }
          seenLower.add(lower);
          clean.push(trimmed);
        }
      }
      if (clean.length > maxLen) {
        throw new Error(`Maximum of ${maxLen} entries allowed for ${fieldName}.`);
      }
      return clean;
    };

    if (requiredSkills !== undefined) {
      updateData.requiredSkills = sanitizeStringArray(requiredSkills, 50, 'required skills');
    }
    if (preferredSkills !== undefined) {
      updateData.preferredSkills = sanitizeStringArray(preferredSkills, 50, 'preferred skills');
    }
    if (searchKeywords !== undefined) {
      updateData.searchKeywords = sanitizeStringArray(searchKeywords, 50, 'search keywords');
    }
    if (preferredLocations !== undefined) {
      updateData.preferredLocations = sanitizeStringArray(preferredLocations, 20, 'preferred locations');
    }
    if (qualifications !== undefined) {
      updateData.qualifications = sanitizeStringArray(qualifications, 20, 'qualifications');
    }

    // Experience validation
    if (minimumExperience !== undefined) {
      if (minimumExperience !== null && (typeof minimumExperience !== 'number' || minimumExperience < 0)) {
        return res.status(400).json({ success: false, message: 'Minimum experience must be a non-negative number.' });
      }
      updateData.minimumExperience = minimumExperience;
    }

    if (maximumExperience !== undefined) {
      if (maximumExperience !== null && (typeof maximumExperience !== 'number' || maximumExperience < 0)) {
        return res.status(400).json({ success: false, message: 'Maximum experience must be a non-negative number.' });
      }
      updateData.maximumExperience = maximumExperience;
    }

    const effectiveMinExp = updateData.minimumExperience !== undefined ? updateData.minimumExperience : job.minimumExperience;
    const effectiveMaxExp = updateData.maximumExperience !== undefined ? updateData.maximumExperience : job.maximumExperience;

    if (effectiveMinExp !== null && effectiveMaxExp !== null && effectiveMaxExp < effectiveMinExp) {
      return res.status(400).json({ success: false, message: 'Maximum experience cannot be less than minimum experience.' });
    }

    // Salary validation
    if (salaryMin !== undefined) {
      if (salaryMin !== null && (typeof salaryMin !== 'number' || salaryMin < 0)) {
        return res.status(400).json({ success: false, message: 'Minimum salary cannot be negative.' });
      }
      updateData.salaryMin = salaryMin;
    }

    if (salaryMax !== undefined) {
      if (salaryMax !== null && (typeof salaryMax !== 'number' || salaryMax < 0)) {
        return res.status(400).json({ success: false, message: 'Maximum salary cannot be negative.' });
      }
      updateData.salaryMax = salaryMax;
    }

    const effectiveMinSal = updateData.salaryMin !== undefined ? updateData.salaryMin : job.salaryMin;
    const effectiveMaxSal = updateData.salaryMax !== undefined ? updateData.salaryMax : job.salaryMax;

    if (effectiveMinSal !== null && effectiveMaxSal !== null && effectiveMaxSal < effectiveMinSal) {
      return res.status(400).json({ success: false, message: 'Maximum salary cannot be less than minimum salary.' });
    }

    if (salaryCurrency !== undefined) {
      updateData.salaryCurrency = salaryCurrency || 'INR';
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Job search criteria updated successfully.',
      data: {
        _id: updatedJob.id,
        id: updatedJob.id,
        title: updatedJob.title,
        updatedAt: updatedJob.updatedAt,
        requirements: {
          requiredSkills: updatedJob.requiredSkills,
          preferredSkills: updatedJob.preferredSkills,
          searchKeywords: updatedJob.searchKeywords,
          minimumExperience: updatedJob.minimumExperience,
          maximumExperience: updatedJob.maximumExperience,
          salaryMin: updatedJob.salaryMin,
          salaryMax: updatedJob.salaryMax,
          salaryCurrency: updatedJob.salaryCurrency,
          preferredLocations: updatedJob.preferredLocations,
          qualifications: updatedJob.qualifications,
          preferredEducation: updatedJob.preferredEducation,
          roleKeywords: updatedJob.roleKeywords
        }
      }
    });
  } catch (error) {
    if (error.message && error.message.includes('Maximum of')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Search Outlook emails for candidate applications for a job
 * @route   POST /api/jobs/:jobId/outlook/search
 * @access  Public
 */
const searchOutlookEmailsForJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { folderId, folderName, fromDate, toDate } = req.body;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found.'
      });
    }

    const connection = await prisma.outlookConnection.findFirst({ orderBy: { connectedAt: 'desc' } });
    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'Microsoft Outlook is not connected. Please connect your account.'
      });
    }

    if (!folderId) {
      return res.status(400).json({
        success: false,
        message: 'Mail folder selection is required.'
      });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'Both From Date and To Date are required.'
      });
    }

    const searchResult = await outlookService.getMessagesByFolderAndDate(
      connection.accessToken || 'MOCK_ACCESS_TOKEN_SEARCH',
      folderId,
      fromDate,
      toDate
    );

    await prisma.importSession.create({
      data: {
        jobId: job.id,
        folderId,
        folderName: folderName || folderId,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        emailsFound: searchResult.emailsScanned,
        resumesFound: searchResult.resumesDiscovered
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        jobId: job.id,
        jobTitle: job.title,
        folderId,
        folderName: folderName || folderId,
        fromDate,
        toDate,
        emailsScanned: searchResult.emailsScanned,
        resumesDiscovered: searchResult.resumesDiscovered,
        nonResumeEmails: searchResult.nonResumeEmails,
        applications: searchResult.applications
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Shortlisted candidates eligible to be selected as the hire
 * @route   GET /api/jobs/:jobId/shortlist
 * @access  Private
 *
 * Populates the close-job dialog. Returns only SHORTLISTED candidates of this
 * job, as a projection — enough to identify a person, nothing more.
 */
const getJobShortlist = async (req, res, next) => {
  try {
    const { jobId } = req.params;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, status: true }
    });

    if (!job) {
      return res.status(404).json({ success: false, code: 'JOB_NOT_FOUND', message: 'Job not found.' });
    }

    const candidates = await getShortlistedCandidates(jobId);

    return res.status(200).json({
      success: true,
      data: candidates,
      meta: {
        jobId: job.id,
        jobTitle: job.title,
        jobStatus: job.status,
        total: candidates.length,
        canClose: job.status === 'OPEN' && candidates.length > 0
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Record the hired candidate and close the job
 * @route   POST /api/jobs/:jobId/close
 * @access  Private
 *
 * The recruiter chooses the candidate; the request carries only their id. Score
 * plays no part — it is decision support, not the decision. All validation and
 * the state change happen in one transaction inside jobClosureService.
 */
const closeJobById = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { selectedCandidateId } = req.body || {};

    const job = await closeJob({
      jobId,
      selectedCandidateId,
      actor: req.user || null
    });

    return res.status(200).json({
      success: true,
      message: `${job.title} closed. ${job.selectedCandidate?.name || 'The selected candidate'} was selected.`,
      data: job
    });
  } catch (error) {
    if (error instanceof JobClosureError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    next(error);
  }
};

module.exports = {
  createJob,
  getAllJobs,
  getJobsSummary,
  getJobById,
  getJobShortlist,
  closeJobById,
  updateJobSearchCriteria,
  searchOutlookEmailsForJob
};
