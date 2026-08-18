const orchestrator = require('../ai/orchestrator/AgentOrchestrator');
const { AiError } = require('../ai/errors/ai.errors');
const { resolveAiConfig, isModeEnabled } = require('../ai/config/aiConfig');
const { AGENT_MODE_IDS } = require('../ai/modes/agentModes');

/**
 * @desc    Run one AI request through the orchestrator
 * @route   POST /api/ai/run
 * @access  Private (mounted behind requireAuth in server.js)
 *
 * The controller is deliberately thin. Every decision — whether AI is on, whether
 * the mode is real, whether its flag is set, whether the input is acceptable,
 * which provider answers — belongs to the orchestrator, so the HTTP layer cannot
 * develop a second, divergent set of rules.
 *
 * AiError is translated here into a response, mirroring how `jobController`
 * handles `JobClosureError`. Anything else is handed to the existing global error
 * handler untouched, which is what keeps an unexpected AI fault from behaving
 * differently to any other unexpected fault in the application.
 */
const runAgent = async (req, res, next) => {
  try {
    const body = req.body;

    // A JSON array or a bare scalar parses fine but is not a request.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({
        success: false,
        code: 'AI_REQUEST_INVALID',
        message: 'Request body must be a JSON object containing at least a mode and a message.'
      });
    }

    const { mode, message, context } = body;

    const result = await orchestrator.run(
      { mode, message, context },
      // Identity comes from the verified session only. Nothing in the body can
      // influence who the request runs as.
      { user: req.user || null }
    );

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AiError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        message: error.message
      });
    }
    return next(error);
  }
};

/**
 * @desc    Report which AI features are switched on for the signed-in recruiter
 * @route   GET /api/ai/config
 * @access  Private (mounted behind requireAuth in server.js)
 *
 * The browser needs to know whether to offer AI navigation at all, and which of
 * the five agents are live. It must learn that without learning anything else:
 * this returns booleans only.
 *
 * Deliberately absent are the provider name, the retrieval limits, the raw
 * environment values and every configuration warning. None of those are secrets
 * today — the mock provider needs no key, so there is no key to leak — but the
 * shape of this response is what a future paid integration would inherit, and a
 * payload that never carried provider detail cannot start carrying it by
 * accident. `describeAiConfig` exists for server-side diagnostics and is
 * intentionally not reused here.
 *
 * A mode is reported enabled only when the master switch and its own flag are
 * both on, which is the same rule `/run` enforces. The UI cannot offer a route
 * the orchestrator would refuse.
 */
const getConfig = async (req, res, next) => {
  try {
    const config = resolveAiConfig();

    // Built from the known mode list rather than from config.modes, so a stray
    // environment key can never introduce a mode the application does not have.
    const modes = {};
    for (const id of AGENT_MODE_IDS) {
      modes[id] = isModeEnabled(config, id);
    }

    return res.status(200).json({
      success: true,
      data: { enabled: config.enabled, modes }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { runAgent, getConfig };
