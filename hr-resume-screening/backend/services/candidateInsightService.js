/**
 * Generates concise strengths, gaps, and 2-3 sentence summary for candidate match analysis
 *
 * @param {Object} candidate - Candidate object
 * @param {Object} matchAnalysis - Output of candidateMatcher
 * @param {Object} jobRequirements - Job requirements
 * @returns {Promise<{ strengths: string[], gaps: string[], summary: string }>}
 */
const generateCandidateInsights = async (candidate, matchAnalysis, jobRequirements = {}) => {
  const strengths = [];
  const gaps = [];

  // 1. Skill Strengths & Gaps
  if (matchAnalysis.matchedSkills && matchAnalysis.matchedSkills.length > 0) {
    strengths.push(`Matches ${matchAnalysis.matchedSkills.length} key required technical skill(s): ${matchAnalysis.matchedSkills.join(', ')}.`);
  }

  if (matchAnalysis.missingRequiredSkills && matchAnalysis.missingRequiredSkills.length > 0) {
    gaps.push(`Missing required technical skill(s): ${matchAnalysis.missingRequiredSkills.join(', ')}.`);
  }

  if (matchAnalysis.matchedPreferredSkills && matchAnalysis.matchedPreferredSkills.length > 0) {
    strengths.push(`Demonstrates preferred skill(s): ${matchAnalysis.matchedPreferredSkills.join(', ')}.`);
  }

  // 2. Experience Strengths & Gaps
  const minExp = jobRequirements.minimumExperience || 0;
  if (candidate.totalExperience !== null && candidate.totalExperience !== undefined) {
    if (minExp > 0 && candidate.totalExperience >= minExp) {
      strengths.push(`Meets or exceeds the required ${minExp} years of experience (${candidate.totalExperience} years demonstrated).`);
    } else if (minExp > 0) {
      gaps.push(`Demonstrates ${candidate.totalExperience} years of experience, below the preferred ${minExp} years threshold.`);
    } else {
      strengths.push(`Possesses ${candidate.totalExperience} years of relevant professional experience.`);
    }
  } else {
    gaps.push('Total years of professional experience could not be explicitly confirmed from the resume text.');
  }

  // 3. Role & Project Strengths
  if (candidate.currentRole) {
    strengths.push(`Current/recent role as "${candidate.currentRole}" aligns well with target responsibilities.`);
  }

  // 4. Concise Summary Generation (Deterministic Template)
  let summary = `Candidate ${candidate.name} demonstrates a ${matchAnalysis.alignmentLabel.toLowerCase()} (${matchAnalysis.overallScore}% score). `;
  if (matchAnalysis.matchedSkills && matchAnalysis.matchedSkills.length > 0) {
    summary += `Key technical proficiencies include ${matchAnalysis.matchedSkills.slice(0, 4).join(', ')}. `;
  }
  if (matchAnalysis.missingRequiredSkills && matchAnalysis.missingRequiredSkills.length > 0) {
    summary += `Primary technical gap identified is ${matchAnalysis.missingRequiredSkills.slice(0, 2).join(', ')}.`;
  } else {
    summary += `All core required technical skills are well represented.`;
  }

  // 5. Optional Gemini API Summary Enhancement if GEMINI_API_KEY is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
      const fetch = require('isomorphic-fetch');
      const prompt = `Summarize candidate ${candidate.name}'s alignment for a recruitment role in 2 concise sentences based ONLY on this data:
Score: ${matchAnalysis.overallScore}% (${matchAnalysis.alignmentLabel})
Matched Skills: ${matchAnalysis.matchedSkills.join(', ') || 'None'}
Missing Skills: ${matchAnalysis.missingRequiredSkills.join(', ') || 'None'}
Experience: ${candidate.totalExperience !== null ? candidate.totalExperience + ' years' : 'Unknown'}
Do NOT alter scores or invent facts.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (aiText) {
        summary = aiText.trim();
      }
    } catch (err) {
      console.warn('Optional Gemini API call failed, using deterministic summary:', err.message);
    }
  }

  return {
    strengths,
    gaps,
    summary
  };
};

module.exports = {
  generateCandidateInsights
};
