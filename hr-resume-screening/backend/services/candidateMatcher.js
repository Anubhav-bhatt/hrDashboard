const weights = require('../utils/scoringWeights');
const { normalizeSkillList } = require('../utils/skillNormalization');

/**
 * Calculates deterministic 0-100 job relevance score and requirement breakdown
 *
 * @param {Object} job - Job document with requirements
 * @param {Object} candidate - Candidate document
 * @returns {Object} Match analysis result
 */
const matchCandidateToJob = (job, candidate) => {
  const reqs = job.requirements || {
    requiredSkills: [],
    preferredSkills: [],
    minimumExperience: 0,
    preferredEducation: [],
    roleKeywords: []
  };

  const candSkills = normalizeSkillList(candidate.skills || []);
  const reqSkills = normalizeSkillList(reqs.requiredSkills || []);
  const prefSkills = normalizeSkillList(reqs.preferredSkills || []);

  // 1. Required Skills Score (40 pts)
  let requiredSkillPoints = weights.REQUIRED_SKILLS;
  const matchedRequiredSkills = [];
  const missingRequiredSkills = [];

  if (reqSkills.length > 0) {
    reqSkills.forEach(skill => {
      if (candSkills.includes(skill)) {
        matchedRequiredSkills.push(skill);
      } else {
        missingRequiredSkills.push(skill);
      }
    });

    const ratio = matchedRequiredSkills.length / reqSkills.length;
    requiredSkillPoints = ratio * weights.REQUIRED_SKILLS;
  } else {
    // If JD has no specified required skills, copy candidate skills as matched
    matchedRequiredSkills.push(...candSkills);
  }

  // 2. Preferred Skills Score (10 pts)
  let preferredSkillPoints = weights.PREFERRED_SKILLS;
  const matchedPreferredSkills = [];

  if (prefSkills.length > 0) {
    prefSkills.forEach(skill => {
      if (candSkills.includes(skill)) {
        matchedPreferredSkills.push(skill);
      }
    });
    const ratio = matchedPreferredSkills.length / prefSkills.length;
    preferredSkillPoints = ratio * weights.PREFERRED_SKILLS;
  }

  // 3. Experience Score (25 pts)
  let experiencePoints = weights.EXPERIENCE;
  const minExp = reqs.minimumExperience || 0;
  const candExp = candidate.totalExperience;

  if (minExp > 0) {
    if (candExp !== null && candExp !== undefined) {
      if (candExp >= minExp) {
        experiencePoints = weights.EXPERIENCE;
      } else {
        experiencePoints = (candExp / minExp) * weights.EXPERIENCE;
      }
    } else {
      // Conservative partial score if experience is unknown
      experiencePoints = weights.EXPERIENCE * 0.5;
    }
  }

  // 4. Role Relevance Score (15 pts)
  let rolePoints = weights.ROLE_RELEVANCE * 0.5; // Baseline
  const jobTitleLower = (job.title || '').toLowerCase();
  const candRoleLower = (candidate.currentRole || '').toLowerCase();

  if (candRoleLower) {
    if (jobTitleLower.includes(candRoleLower) || candRoleLower.includes(jobTitleLower)) {
      rolePoints = weights.ROLE_RELEVANCE;
    } else if (
      (jobTitleLower.includes('react') && candRoleLower.includes('frontend')) ||
      (jobTitleLower.includes('frontend') && candRoleLower.includes('react')) ||
      (jobTitleLower.includes('developer') && candRoleLower.includes('engineer'))
    ) {
      rolePoints = weights.ROLE_RELEVANCE * 0.85;
    }
  } else if (candSkills.length > 0) {
    rolePoints = weights.ROLE_RELEVANCE * 0.7;
  }

  // 5. Projects Score (5 pts)
  let projectPoints = weights.PROJECTS * 0.5;
  if ((candidate.projects && candidate.projects.length > 0) || (candidate.experienceHistory && candidate.experienceHistory.length > 0)) {
    projectPoints = weights.PROJECTS;
  }

  // 6. Education Score (5 pts)
  let educationPoints = weights.EDUCATION;
  const reqEdu = reqs.preferredEducation || [];
  const candEdu = candidate.education || [];

  if (reqEdu.length > 0) {
    const hasMatch = reqEdu.some(degree =>
      candEdu.some(cDegree => cDegree.toLowerCase().includes(degree.toLowerCase()))
    );
    educationPoints = hasMatch ? weights.EDUCATION : weights.EDUCATION * 0.5;
  }

  // 7. Domain Search Keywords Matching
  const searchKeywords = reqs.searchKeywords || job.searchKeywords || [];
  const matchedKeywords = [];
  const missingKeywords = [];

  const fullText = [
    candidate.resumeText || '',
    candidate.currentRole || '',
    (candidate.skills || []).join(' '),
    (candidate.projects || []).join(' ')
  ].join(' ').toLowerCase();

  if (searchKeywords.length > 0) {
    searchKeywords.forEach(kw => {
      const lowerKw = kw.trim().toLowerCase();
      if (lowerKw && fullText.includes(lowerKw)) {
        matchedKeywords.push(kw);
      } else {
        missingKeywords.push(kw);
      }
    });
  }

  // 8. Compatibility Indicators Calculation
  const targetMinExp = reqs.minimumExperience || job.minimumExperience || 0;
  const maxExp = reqs.maximumExperience || job.maximumExperience || null;

  let experienceMatch = null;
  if (candExp !== null && candExp !== undefined) {
    if (maxExp !== null && maxExp !== undefined) {
      experienceMatch = candExp >= targetMinExp && candExp <= maxExp;
    } else {
      experienceMatch = candExp >= targetMinExp;
    }
  }

  const preferredLocations = reqs.preferredLocations || job.preferredLocations || [];
  const candLocation = candidate.currentLocation;
  let locationMatch = null;

  if (preferredLocations.length > 0) {
    if (candLocation) {
      const normalizeLoc = l => l.toLowerCase().replace('gurgaon', 'gurugram').replace('bangalore', 'bengaluru').trim();
      const normCandLoc = normalizeLoc(candLocation);
      locationMatch = preferredLocations.some(l => normalizeLoc(l) === normCandLoc || normCandLoc.includes(normalizeLoc(l)));
    } else {
      locationMatch = null;
    }
  }

  const jobQualifications = reqs.qualifications || job.qualifications || [];
  const candQual = candidate.qualification;
  let qualificationMatch = null;

  if (jobQualifications.length > 0) {
    if (candQual) {
      const normQual = q => q.toLowerCase().replace('.', '').trim();
      const cQualNorm = normQual(candQual);
      qualificationMatch = jobQualifications.some(q => normQual(q) === cQualNorm || cQualNorm.includes(normQual(q)));
    } else {
      qualificationMatch = null;
    }
  }

  const salMin = reqs.salaryMin !== undefined ? reqs.salaryMin : job.salaryMin;
  const salMax = reqs.salaryMax !== undefined ? reqs.salaryMax : job.salaryMax;
  const candSalary = candidate.expectedSalary || candidate.currentSalary;
  let salaryMatch = null;

  if (salMin !== null || salMax !== null) {
    if (candSalary !== null && candSalary !== undefined) {
      if (salMin !== null && salMax !== null) {
        salaryMatch = candSalary >= salMin && candSalary <= salMax;
      } else if (salMin !== null) {
        salaryMatch = candSalary >= salMin;
      } else if (salMax !== null) {
        salaryMatch = candSalary <= salMax;
      }
    } else {
      salaryMatch = null;
    }
  }

  // Sum Category Scores
  const totalScore = requiredSkillPoints + preferredSkillPoints + experiencePoints + rolePoints + projectPoints + educationPoints;
  const overallScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  // Alignment Label
  let alignmentLabel = 'Low Alignment';
  if (overallScore >= 90) alignmentLabel = 'Excellent Alignment';
  else if (overallScore >= 80) alignmentLabel = 'Strong Alignment';
  else if (overallScore >= 70) alignmentLabel = 'Good Alignment';
  else if (overallScore >= 60) alignmentLabel = 'Partial Alignment';

  return {
    overallScore,
    alignmentLabel,
    requiredSkillScore: Math.round(requiredSkillPoints),
    experienceScore: Math.round(experiencePoints),
    roleScore: Math.round(rolePoints),
    preferredSkillScore: Math.round(preferredSkillPoints),
    projectScore: Math.round(projectPoints),
    educationScore: Math.round(educationPoints),
    matchedSkills: matchedRequiredSkills,
    missingRequiredSkills,
    matchedPreferredSkills,
    matchedKeywords,
    missingKeywords,
    compatibilityFlags: {
      experienceMatch,
      locationMatch,
      qualificationMatch,
      salaryMatch
    },
    analyzedAt: new Date()
  };
};

module.exports = {
  matchCandidateToJob
};
