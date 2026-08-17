/**
 * Pre-AI scoring & ranking baseline.
 *
 *   npm run test:scoring
 *
 * Every value below is a golden pin of what the deterministic engine produces
 * today. The other suites assert that scoring is *reasonable* (">= 85", "lower
 * than 70"); this one asserts it is *unchanged*. That distinction is the point:
 * a weight nudged by two points, a rounding change, or an alignment band moved
 * by one would keep every existing assertion green while silently re-ranking
 * every candidate list in the product.
 *
 * These are behaviour pins, not correctness claims. If a scoring rule is ever
 * deliberately changed, the expected values here are meant to be updated in the
 * same commit — the failure is the notification that ranking moved.
 *
 * Nothing here touches the database or the network.
 */
const { createSuite, assert } = require('./harness');

const weights = require('../utils/scoringWeights');
const { STRONG_MATCH_MIN, EXCELLENT_MATCH_MIN, SCORE_BANDS } = require('../utils/scoreThresholds');
const { matchCandidateToJob } = require('../services/candidateMatcher');
const { generateCandidateInsights } = require('../services/candidateInsightService');
const { parseSort } = require('../utils/candidateQuery');

const suite = createSuite('Scoring & ranking baseline (pre-AI pins)');
const { test, testAsync } = suite;

/* ------------------------------------------------------------ fixtures ---- */

const JOB = {
  title: 'Senior React Developer',
  requirements: {
    requiredSkills: ['React', 'TypeScript', 'JavaScript', 'Redux', 'REST API'],
    preferredSkills: ['Next.js', 'Tailwind CSS'],
    minimumExperience: 4,
    preferredEducation: ['Bachelor'],
    roleKeywords: ['Frontend', 'Developer']
  }
};

const FULL_MATCH = {
  name: 'Rahul Sharma',
  totalExperience: 5,
  skills: ['React', 'TypeScript', 'JavaScript', 'Redux', 'REST API', 'Next.js'],
  currentRole: 'Senior Frontend Developer',
  education: ["Bachelor's in Computer Science"],
  projects: ['Enterprise Dashboard']
};

const PARTIAL_MATCH = {
  name: 'Amit Kumar',
  totalExperience: 3,
  skills: ['React', 'JavaScript'],
  currentRole: 'Frontend Developer',
  education: ['Diploma in IT'],
  projects: []
};

const UNKNOWN_EXPERIENCE = {
  name: 'Sneha Patel',
  totalExperience: null,
  skills: ['React'],
  currentRole: null,
  education: [],
  projects: []
};

const NO_SKILLS = {
  name: 'Nobody',
  totalExperience: 0,
  skills: [],
  currentRole: null,
  education: [],
  projects: []
};

/** The subscore fields every match result carries, compared as one object. */
const breakdown = (match) => ({
  overallScore: match.overallScore,
  alignmentLabel: match.alignmentLabel,
  requiredSkillScore: match.requiredSkillScore,
  experienceScore: match.experienceScore,
  roleScore: match.roleScore,
  preferredSkillScore: match.preferredSkillScore,
  projectScore: match.projectScore,
  educationScore: match.educationScore
});

/** Runs `fn` with no AI provider key present, then restores the environment. */
const withoutAiKey = async (fn) => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
};

const run = async () => {
  /* --------------------------------------------- weights & thresholds --- */

  suite.group('Scoring weights and band thresholds');

  test('the category weight table is unchanged', () => {
    assert.deepStrictEqual(weights, {
      REQUIRED_SKILLS: 40,
      EXPERIENCE: 25,
      ROLE_RELEVANCE: 15,
      PREFERRED_SKILLS: 10,
      PROJECTS: 5,
      EDUCATION: 5
    });
  });

  test('the weights still total exactly 100 points', () => {
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    assert.strictEqual(total, 100, `weights sum to ${total}`);
  });

  test('strong and excellent match thresholds are unchanged', () => {
    assert.strictEqual(STRONG_MATCH_MIN, 80);
    assert.strictEqual(EXCELLENT_MATCH_MIN, 90);
  });

  test('score bands cover 0-100 without gaps or overlap', () => {
    assert.deepStrictEqual(
      SCORE_BANDS.map((band) => [band.key, band.min]),
      [
        ['excellent', 90],
        ['strong', 80],
        ['good', 70],
        ['partial', 60],
        ['low', 0]
      ]
    );

    // Read low-to-high, each band must start where the one below it ends.
    const ascending = [...SCORE_BANDS].reverse();
    ascending.forEach((band, index) => {
      if (index === 0) return;
      const below = ascending[index - 1];
      assert.ok(band.min > below.max, `${band.key} overlaps ${below.key}`);
      assert.ok(band.min - below.max < 0.01, `gap between ${below.key} and ${band.key}`);
    });
    assert.strictEqual(ascending[ascending.length - 1].max, 100, 'top band ends at 100');
  });

  /* ---------------------------------------------- match score golden ----- */

  suite.group('Deterministic match scores');

  test('a candidate meeting every requirement scores exactly as before', () => {
    assert.deepStrictEqual(breakdown(matchCandidateToJob(JOB, FULL_MATCH)), {
      overallScore: 93,
      alignmentLabel: 'Excellent Alignment',
      requiredSkillScore: 40,
      experienceScore: 25,
      roleScore: 13,
      preferredSkillScore: 5,
      projectScore: 5,
      educationScore: 5
    });
  });

  test('a partial match scores exactly as before', () => {
    assert.deepStrictEqual(breakdown(matchCandidateToJob(JOB, PARTIAL_MATCH)), {
      overallScore: 53,
      alignmentLabel: 'Low Alignment',
      requiredSkillScore: 16,
      experienceScore: 19,
      roleScore: 13,
      preferredSkillScore: 0,
      projectScore: 3,
      educationScore: 3
    });
  });

  test('unknown experience still earns the conservative half credit', () => {
    assert.deepStrictEqual(breakdown(matchCandidateToJob(JOB, UNKNOWN_EXPERIENCE)), {
      overallScore: 36,
      alignmentLabel: 'Low Alignment',
      requiredSkillScore: 8,
      // Half of the 25-point experience weight, because absent is not zero.
      experienceScore: 13,
      roleScore: 11,
      preferredSkillScore: 0,
      projectScore: 3,
      educationScore: 3
    });
  });

  test('a candidate matching nothing scores exactly as before', () => {
    assert.deepStrictEqual(breakdown(matchCandidateToJob(JOB, NO_SKILLS)), {
      overallScore: 13,
      alignmentLabel: 'Low Alignment',
      requiredSkillScore: 0,
      experienceScore: 0,
      roleScore: 8,
      preferredSkillScore: 0,
      projectScore: 3,
      educationScore: 3
    });
  });

  test('matched and missing skill lists are unchanged', () => {
    const match = matchCandidateToJob(JOB, PARTIAL_MATCH);
    assert.deepStrictEqual(match.matchedSkills, ['React', 'JavaScript']);
    assert.deepStrictEqual(match.missingRequiredSkills, ['TypeScript', 'Redux', 'REST API']);
    assert.deepStrictEqual(match.matchedPreferredSkills, []);
  });

  test('alignment labels sit on their documented boundaries', () => {
    const labelFor = (score) => {
      if (score >= 90) return 'Excellent Alignment';
      if (score >= 80) return 'Strong Alignment';
      if (score >= 70) return 'Good Alignment';
      if (score >= 60) return 'Partial Alignment';
      return 'Low Alignment';
    };

    for (const candidate of [FULL_MATCH, PARTIAL_MATCH, UNKNOWN_EXPERIENCE, NO_SKILLS]) {
      const match = matchCandidateToJob(JOB, candidate);
      assert.strictEqual(
        match.alignmentLabel,
        labelFor(match.overallScore),
        `${candidate.name}: ${match.overallScore} labelled ${match.alignmentLabel}`
      );
    }
  });

  test('scoring is repeatable and free of hidden state', () => {
    const runs = [1, 2, 3].map(() => breakdown(matchCandidateToJob(JOB, FULL_MATCH)));
    assert.deepStrictEqual(runs[0], runs[1]);
    assert.deepStrictEqual(runs[1], runs[2]);
  });

  test('scoring does not mutate the job or the candidate it is given', () => {
    const job = JSON.parse(JSON.stringify(JOB));
    const candidate = JSON.parse(JSON.stringify(FULL_MATCH));

    matchCandidateToJob(job, candidate);

    assert.deepStrictEqual(job, JOB, 'job was mutated');
    assert.deepStrictEqual(candidate, FULL_MATCH, 'candidate was mutated');
  });

  /* ----------------------------------------------------- ranking order --- */

  suite.group('Candidate ranking order');

  test('the default listing sort ranks by score, placing unscored candidates last', () => {
    assert.deepStrictEqual(parseSort(undefined), [
      { overallScore: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' }
    ]);
    assert.deepStrictEqual(parseSort('score_desc'), parseSort(undefined));
  });

  test('ranking the fixtures by score keeps the established order', () => {
    const ranked = [NO_SKILLS, FULL_MATCH, UNKNOWN_EXPERIENCE, PARTIAL_MATCH]
      .map((candidate) => ({ name: candidate.name, score: matchCandidateToJob(JOB, candidate).overallScore }))
      .sort((a, b) => b.score - a.score);

    assert.deepStrictEqual(
      ranked.map((entry) => entry.name),
      ['Rahul Sharma', 'Amit Kumar', 'Sneha Patel', 'Nobody']
    );
  });

  /* --------------------------------------- insight generation boundary --- */

  suite.group('Insight generation stays deterministic and offline');

  await testAsync('with no provider key the summary is the deterministic template', () =>
    withoutAiKey(async () => {
      const match = matchCandidateToJob(JOB, FULL_MATCH);
      const insights = await generateCandidateInsights(FULL_MATCH, match, JOB.requirements);

      assert.strictEqual(
        insights.summary,
        'Candidate Rahul Sharma demonstrates a excellent alignment (93% score). ' +
          'Key technical proficiencies include React, TypeScript, JavaScript, Redux. ' +
          'All core required technical skills are well represented.'
      );
    }));

  await testAsync('strengths and gaps are derived only from the match result', () =>
    withoutAiKey(async () => {
      const match = matchCandidateToJob(JOB, PARTIAL_MATCH);
      const insights = await generateCandidateInsights(PARTIAL_MATCH, match, JOB.requirements);

      assert.deepStrictEqual(insights.strengths, [
        'Matches 2 key required technical skill(s): React, JavaScript.',
        'Current/recent role as "Frontend Developer" aligns well with target responsibilities.'
      ]);
      assert.deepStrictEqual(insights.gaps, [
        'Missing required technical skill(s): TypeScript, Redux, REST API.',
        'Demonstrates 3 years of experience, below the preferred 4 years threshold.'
      ]);
    }));

  await testAsync('generating insights never alters the score it was handed', () =>
    withoutAiKey(async () => {
      const match = matchCandidateToJob(JOB, FULL_MATCH);
      const before = breakdown(match);

      await generateCandidateInsights(FULL_MATCH, match, JOB.requirements);

      assert.deepStrictEqual(breakdown(match), before, 'insight generation changed the score');
    }));

  await testAsync('insight generation is repeatable', () =>
    withoutAiKey(async () => {
      const match = matchCandidateToJob(JOB, FULL_MATCH);
      const first = await generateCandidateInsights(FULL_MATCH, match, JOB.requirements);
      const second = await generateCandidateInsights(FULL_MATCH, match, JOB.requirements);
      assert.deepStrictEqual(first, second);
    }));

  const { failed } = suite.summary();
  process.exit(failed > 0 ? 1 : 0);
};

run();
