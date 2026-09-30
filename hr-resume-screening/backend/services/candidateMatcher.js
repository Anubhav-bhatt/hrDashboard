/**
 * Intelligent JD ↔ Resume Matching and Scoring Engine
 *
 * Compares a Job Description and Candidate Resume dimension-by-dimension:
 *  - Required Skills (40 pts)
 *  - Experience: Total vs Relevant (25 pts)
 *  - Role Relevance (15 pts)
 *  - Preferred Skills (10 pts)
 *  - Projects / Practical Evidence (5 pts)
 *  - Education (5 pts)
 * Total: 100 points
 *
 * Produces structured evidence snippets, match classifications (EXACT, ALIAS, STRONG EVIDENCE, RELATED, MISSING),
 * identifies additional candidate skills, explicit skill gaps, and explainable score breakdowns.
 */

const weights = require('../utils/scoringWeights');
const {
  canonicalizeSkill,
  normalizeSkillList,
  areSkillsEquivalent
} = require('../utils/skillTaxonomy');
const { extractJobProfile } = require('./jdProfileService');
const { extractCandidateProfile } = require('./candidateProfileService');

/**
 * Calculates deterministic 0-100 job relevance score and requirement breakdown
 *
 * @param {Object} job - Job document with requirements or raw text
 * @param {Object} candidate - Candidate document or raw profile
 * @returns {Object} Match analysis result
 */
const matchCandidateToJob = (job, candidate) => {
  // 1. Build or normalize Job Profile
  let jobProfile;
  if (job.description || job.rawText) {
    jobProfile = extractJobProfile(job);
  } else {
    const reqs = job.requirements || job || {};
    jobProfile = {
      title: job.title || '',
      roleFamily: 'general',
      seniority: 'mid',
      requiredSkills: normalizeSkillList(reqs.requiredSkills || []),
      preferredSkills: normalizeSkillList(reqs.preferredSkills || []),
      minimumExperience: reqs.minimumExperience || 0,
      preferredEducation: reqs.preferredEducation || [],
      roleKeywords: reqs.roleKeywords || [],
      responsibilities: []
    };
  }

  // 2. Build or normalize Candidate Profile
  let candProfile;
  if (candidate.resumeText || candidate.parsedProfile || candidate.employmentHistory) {
    candProfile = extractCandidateProfile(candidate, { targetRoleFamily: jobProfile.roleFamily });
  } else {
    // Legacy mock object / pre-extracted candidate
    candProfile = {
      name: candidate.name || 'Candidate',
      skills: normalizeSkillList(candidate.skills || []),
      totalExperience: candidate.totalExperience !== undefined ? candidate.totalExperience : null,
      relevantExperience: candidate.relevantExperience !== undefined ? candidate.relevantExperience : candidate.totalExperience,
      currentRole: candidate.currentRole || candidate.headline || null,
      education: candidate.education || [],
      projects: candidate.projects || [],
      skillEvidence: {}
    };
  }

  const reqSkills = jobProfile.requiredSkills || [];
  const prefSkills = jobProfile.preferredSkills || [];
  const candSkills = candProfile.skills || [];

  // -------------------------------------------------------------
  // 1. REQUIRED SKILLS SCORING (40 pts)
  // -------------------------------------------------------------
  let requiredSkillPoints = weights.REQUIRED_SKILLS;
  const matchedRequiredSkills = [];
  const missingRequiredSkills = [];
  const requiredSkillMatches = [];

  if (reqSkills.length > 0) {
    let weightedMatchSum = 0;
    const hasWorkOrProjects = (candProfile.employmentHistory && candProfile.employmentHistory.length > 0) ||
      (candProfile.projects && candProfile.projects.length > 0);

    reqSkills.forEach((reqSkill) => {
      // Find matching skill in candidate skills
      const matchedCandSkill = candSkills.find((candSkill) => areSkillsEquivalent(reqSkill, candSkill));

      if (matchedCandSkill) {
        matchedRequiredSkills.push(reqSkill);
        const evidenceData = candProfile.skillEvidence?.[matchedCandSkill] || candProfile.skillEvidence?.[reqSkill];

        let matchType = 'EXACT';
        let confidence = 'HIGH';
        let skillWeight = 1.0;

        if (evidenceData) {
          if (evidenceData.depth === 'professional') {
            matchType = 'STRONG EVIDENCE';
            confidence = 'HIGH';
            skillWeight = 1.0;
          } else if (evidenceData.depth === 'project') {
            matchType = 'STRONG EVIDENCE';
            confidence = 'HIGH';
            skillWeight = 1.0;
          } else if (evidenceData.depth === 'summary') {
            confidence = 'MEDIUM';
            skillWeight = 0.9;
          } else {
            confidence = hasWorkOrProjects ? 'MEDIUM' : 'LOW';
            skillWeight = hasWorkOrProjects ? 0.9 : 0.75;
          }
        }

        weightedMatchSum += skillWeight;

        // If matched via alias rather than identical string
        if (reqSkill.toLowerCase() !== matchedCandSkill.toLowerCase() && matchType === 'EXACT') {
          matchType = 'ALIAS';
        }

        const snippet = evidenceData?.snippets?.[0] || null;

        requiredSkillMatches.push({
          requirement: reqSkill,
          matchedSkill: matchedCandSkill,
          status: 'MATCHED',
          matchType,
          confidence,
          evidence: snippet,
          source: evidenceData?.sources?.[0] || 'skills'
        });
      } else {
        missingRequiredSkills.push(reqSkill);
        requiredSkillMatches.push({
          requirement: reqSkill,
          matchedSkill: null,
          status: 'MISSING',
          matchType: 'MISSING',
          confidence: 'NONE',
          evidence: null,
          source: null
        });
      }
    });

    const ratio = weightedMatchSum / reqSkills.length;
    requiredSkillPoints = ratio * weights.REQUIRED_SKILLS;
  } else {
    // If JD has no specified required skills, treat candidate skills as matched
    matchedRequiredSkills.push(...candSkills);
  }

  // -------------------------------------------------------------
  // 2. PREFERRED SKILLS SCORING (10 pts)
  // -------------------------------------------------------------
  let preferredSkillPoints = weights.PREFERRED_SKILLS;
  const matchedPreferredSkills = [];
  const preferredSkillMatches = [];

  if (prefSkills.length > 0) {
    let weightedPrefSum = 0;
    const hasWorkOrProjects = (candProfile.employmentHistory && candProfile.employmentHistory.length > 0) ||
      (candProfile.projects && candProfile.projects.length > 0);

    prefSkills.forEach((prefSkill) => {
      const matchedCandSkill = candSkills.find((candSkill) => areSkillsEquivalent(prefSkill, candSkill));

      if (matchedCandSkill) {
        matchedPreferredSkills.push(prefSkill);
        const evidenceData = candProfile.skillEvidence?.[matchedCandSkill] || candProfile.skillEvidence?.[prefSkill];
        const snippet = evidenceData?.snippets?.[0] || null;
        let skillWeight = 1.0;
        if (evidenceData && evidenceData.depth === 'list' && !hasWorkOrProjects) {
          skillWeight = 0.75;
        }
        weightedPrefSum += skillWeight;

        preferredSkillMatches.push({
          requirement: prefSkill,
          matchedSkill: matchedCandSkill,
          status: 'MATCHED',
          matchType: prefSkill.toLowerCase() === matchedCandSkill.toLowerCase() ? 'EXACT' : 'ALIAS',
          confidence: evidenceData?.depth === 'professional' ? 'HIGH' : 'MEDIUM',
          evidence: snippet
        });
      } else {
        preferredSkillMatches.push({
          requirement: prefSkill,
          matchedSkill: null,
          status: 'MISSING',
          matchType: 'MISSING',
          confidence: 'NONE',
          evidence: null
        });
      }
    });

    const ratio = weightedPrefSum / prefSkills.length;
    preferredSkillPoints = ratio * weights.PREFERRED_SKILLS;
  }

  // -------------------------------------------------------------
  // 3. EXPERIENCE SCORING (25 pts)
  // -------------------------------------------------------------
  let experiencePoints = weights.EXPERIENCE;
  const minExp = jobProfile.minimumExperience || (job.requirements && job.requirements.minimumExperience) || 0;
  const candTotalExp = candProfile.totalExperience;
  const candRelevantExp = candProfile.relevantExperience !== undefined && candProfile.relevantExperience !== null
    ? candProfile.relevantExperience
    : candTotalExp;

  if (minExp > 0) {
    if (candTotalExp !== null && candTotalExp !== undefined) {
      if (candRelevantExp !== null && candRelevantExp !== undefined && candRelevantExp >= minExp) {
        experiencePoints = weights.EXPERIENCE;
      } else if (candTotalExp >= minExp && (candRelevantExp === null || candRelevantExp === undefined || candRelevantExp === candTotalExp)) {
        // Preserves exact baseline behavior when candRelevantExp equals candTotalExp
        experiencePoints = weights.EXPERIENCE;
      } else if (candRelevantExp !== null && candRelevantExp !== undefined && candRelevantExp > 0) {
        // If relevant experience is below minimum but candidate has relevant work
        if (candTotalExp === candRelevantExp) {
          experiencePoints = (candRelevantExp / minExp) * weights.EXPERIENCE;
        } else {
          // Candidate has some relevant experience and additional other experience
          const relevantRatio = Math.min(1, candRelevantExp / minExp);
          const totalRatio = Math.min(1, candTotalExp / minExp);
          experiencePoints = (relevantRatio * 0.85 + totalRatio * 0.15) * weights.EXPERIENCE;
        }
      } else if (candTotalExp > 0 && (candRelevantExp === 0 || candRelevantExp === null)) {
        // Candidate has general experience but zero relevant experience for the target role
        // Cap experience credit at 40% of points (10 pts maximum)
        experiencePoints = Math.min(10, (candTotalExp / minExp) * weights.EXPERIENCE * 0.4);
      } else {
        experiencePoints = 0;
      }
    } else {
      // Conservative partial score if experience is unknown (exact baseline: 12.5 pts)
      experiencePoints = weights.EXPERIENCE * 0.5;
    }
  }

  // -------------------------------------------------------------
  // 4. ROLE RELEVANCE SCORING (15 pts)
  // -------------------------------------------------------------
  let rolePoints = weights.ROLE_RELEVANCE * 0.5; // Baseline 7.5
  const jobTitleLower = (jobProfile.title || job.title || '').toLowerCase();
  const candRoleLower = (candProfile.currentRole || '').toLowerCase();
  const hasWorkTenure = (candTotalExp !== null && candTotalExp > 0) || (candProfile.employmentHistory && candProfile.employmentHistory.length > 0);

  if (candRoleLower) {
    if (jobTitleLower.includes(candRoleLower) || candRoleLower.includes(jobTitleLower)) {
      rolePoints = hasWorkTenure ? weights.ROLE_RELEVANCE : weights.ROLE_RELEVANCE * 0.5;
    } else if (
      (jobTitleLower.includes('react') && candRoleLower.includes('frontend')) ||
      (jobTitleLower.includes('frontend') && candRoleLower.includes('react')) ||
      (jobTitleLower.includes('developer') && candRoleLower.includes('engineer'))
    ) {
      rolePoints = weights.ROLE_RELEVANCE * 0.85; // 12.75
    } else if (
      (jobTitleLower.includes('full stack') && (candRoleLower.includes('frontend') || candRoleLower.includes('backend'))) ||
      (jobTitleLower.includes('backend') && candRoleLower.includes('software engineer'))
    ) {
      rolePoints = weights.ROLE_RELEVANCE * 0.75;
    } else if (candProfile.employmentHistory && candProfile.employmentHistory.length > 0) {
      // Check if candidate held relevant roles in their work history
      const hasRelevantPastRole = candProfile.employmentHistory.some((e) => {
        const past = (e.role || '').toLowerCase();
        return (
          (jobTitleLower.includes('react') && (past.includes('frontend') || past.includes('react'))) ||
          (jobTitleLower.includes('frontend') && (past.includes('react') || past.includes('frontend')))
        );
      });
      rolePoints = hasRelevantPastRole ? weights.ROLE_RELEVANCE * 0.8 : weights.ROLE_RELEVANCE * 0.4;
    } else {
      rolePoints = weights.ROLE_RELEVANCE * 0.4;
    }
  } else if (candSkills.length > 0) {
    rolePoints = weights.ROLE_RELEVANCE * 0.7; // 10.5
  }

  // -------------------------------------------------------------
  // 5. PROJECTS SCORING (5 pts)
  // -------------------------------------------------------------
  let projectPoints = weights.PROJECTS * 0.5; // Baseline 2.5
  const hasProjects = (candProfile.projects && candProfile.projects.length > 0);
  const hasExperience = (candProfile.employmentHistory && candProfile.employmentHistory.length > 0);

  if (hasProjects || hasExperience) {
    projectPoints = weights.PROJECTS; // 5 pts
  }

  // -------------------------------------------------------------
  // 6. EDUCATION SCORING (5 pts)
  // -------------------------------------------------------------
  let educationPoints = weights.EDUCATION; // Default 5 pts
  const reqEdu = jobProfile.preferredEducation || (job.requirements && job.requirements.preferredEducation) || [];
  const candEdu = candProfile.education || [];

  if (reqEdu.length > 0) {
    const hasMatch = reqEdu.some((degree) =>
      candEdu.some((cDegree) => cDegree.toLowerCase().includes(degree.toLowerCase()))
    );
    educationPoints = hasMatch ? weights.EDUCATION : weights.EDUCATION * 0.5; // 2.5 pts
  }

  // -------------------------------------------------------------
  // 7. KEYWORDS MATCHING
  // -------------------------------------------------------------
  const searchKeywords = job.searchKeywords || (job.requirements && job.requirements.searchKeywords) || [];
  const matchedKeywords = [];
  const missingKeywords = [];

  const fullText = [
    candProfile.resumeText || '',
    candProfile.currentRole || '',
    candSkills.join(' '),
    (candProfile.projects || []).join(' ')
  ].join(' ').toLowerCase();

  if (searchKeywords.length > 0) {
    searchKeywords.forEach((kw) => {
      const lowerKw = kw.trim().toLowerCase();
      if (lowerKw && fullText.includes(lowerKw)) {
        matchedKeywords.push(kw);
      } else {
        missingKeywords.push(kw);
      }
    });
  }

  // -------------------------------------------------------------
  // 8. COMPATIBILITY FLAGS
  // -------------------------------------------------------------
  const targetMinExp = minExp;
  const maxExp = job.maximumExperience || (job.requirements && job.requirements.maximumExperience) || null;

  let experienceMatch = null;
  if (candTotalExp !== null && candTotalExp !== undefined) {
    if (maxExp !== null && maxExp !== undefined) {
      experienceMatch = candTotalExp >= targetMinExp && candTotalExp <= maxExp;
    } else {
      experienceMatch = candTotalExp >= targetMinExp;
    }
  }

  const preferredLocations = job.preferredLocations || (job.requirements && job.requirements.preferredLocations) || [];
  const candLocation = candProfile.currentLocation;
  let locationMatch = null;

  if (preferredLocations.length > 0) {
    if (candLocation) {
      const normalizeLoc = (l) => l.toLowerCase().replace('gurgaon', 'gurugram').replace('bangalore', 'bengaluru').trim();
      const normCandLoc = normalizeLoc(candLocation);
      locationMatch = preferredLocations.some((l) => normalizeLoc(l) === normCandLoc || normCandLoc.includes(normalizeLoc(l)));
    } else {
      locationMatch = null;
    }
  }

  const jobQualifications = job.qualifications || (job.requirements && job.requirements.qualifications) || [];
  const candQual = candidate.qualification;
  let qualificationMatch = null;

  if (jobQualifications.length > 0) {
    if (candQual) {
      const normQual = (q) => q.toLowerCase().replace(/[.\s]/g, '').trim();
      const cQualNorm = normQual(candQual);
      qualificationMatch = jobQualifications.some((q) => normQual(q) === cQualNorm || cQualNorm.includes(normQual(q)));
    } else {
      qualificationMatch = null;
    }
  }

  const salMin = job.salaryMin !== undefined ? job.salaryMin : (job.requirements && job.requirements.salaryMin);
  const salMax = job.salaryMax !== undefined ? job.salaryMax : (job.requirements && job.requirements.salaryMax);
  const candSalary = candProfile.expectedSalary || candProfile.currentSalary;
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

  // -------------------------------------------------------------
  // 9. ADDITIONAL SKILLS & KEY EVIDENCE
  // -------------------------------------------------------------
  // Skills candidate has that are NOT in required or preferred
  const allJobSkills = [...reqSkills, ...prefSkills];
  const additionalSkills = candSkills.filter(
    (cs) => !allJobSkills.some((js) => areSkillsEquivalent(cs, js))
  );

  // Extract key evidence bullets
  const keyEvidence = [];
  requiredSkillMatches.forEach((m) => {
    if (m.evidence && keyEvidence.length < 4 && !keyEvidence.includes(m.evidence)) {
      keyEvidence.push(m.evidence);
    }
  });
  if (keyEvidence.length < 4) {
    preferredSkillMatches.forEach((m) => {
      if (m.evidence && keyEvidence.length < 4 && !keyEvidence.includes(m.evidence)) {
        keyEvidence.push(m.evidence);
      }
    });
  }

  // -------------------------------------------------------------
  // 10. TOTAL SCORE & ALIGNMENT LABEL
  // -------------------------------------------------------------
  const totalScore = requiredSkillPoints + preferredSkillPoints + experiencePoints + rolePoints + projectPoints + educationPoints;
  const overallScore = Math.max(0, Math.min(100, Math.round(totalScore)));

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
    // Enriched Intelligent Matching Fields
    requiredSkillMatches,
    preferredSkillMatches,
    additionalSkills,
    keyEvidence,
    experienceDetails: {
      requiredYears: minExp,
      totalYears: candTotalExp,
      relevantYears: candRelevantExp,
      isRelevantMatch: candRelevantExp >= minExp
    },
    roleRelevanceDetails: {
      targetRole: jobProfile.title || job.title,
      candidateRole: candProfile.currentRole,
      roleScore: Math.round(rolePoints)
    },
    jobProfile: {
      title: jobProfile.title,
      roleFamily: jobProfile.roleFamily,
      seniority: jobProfile.seniority,
      requiredSkills: jobProfile.requiredSkills,
      preferredSkills: jobProfile.preferredSkills,
      minimumExperience: jobProfile.minimumExperience
    },
    analyzedAt: new Date()
  };
};

module.exports = {
  matchCandidateToJob
};
