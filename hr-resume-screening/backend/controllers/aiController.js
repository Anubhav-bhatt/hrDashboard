const orchestrator = require('../ai/orchestrator/AgentOrchestrator');
const { AiError } = require('../ai/errors/ai.errors');

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

module.exports = { runAgent };
