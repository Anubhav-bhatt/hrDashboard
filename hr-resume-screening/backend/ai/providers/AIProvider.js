/**
 * The provider contract.
 *
 * This is the seam that keeps the application independent of any particular LLM
 * vendor. Agent modes and the orchestrator depend on this shape and nothing
 * else, so adding a real vendor later means adding one subclass here — no mode,
 * no controller and no route changes.
 *
 * The rule this enforces:
 *
 *     Agent -> AIProvider -> MockAIProvider today, a real vendor later
 *
 * Only files inside `ai/providers/` may import a vendor SDK. Nothing outside this
 * directory should ever name one.
 */

/**
 * Abstract base. Subclasses declare their identity and implement `run`.
 *
 * @abstract
 */
class AIProvider {
  /**
   * @param {Object} options
   * @param {string} options.name Provider identifier reported on responses, e.g. `mock`.
   * @param {string} options.model Model identifier reported on responses, e.g. `mock-v1`.
   */
  constructor({ name, model }) {
    if (new.target === AIProvider) {
      throw new Error('AIProvider is abstract; construct a concrete provider instead.');
    }
    if (!name || !model) {
      throw new Error('A provider must declare both a name and a model.');
    }

    this.name = name;
    this.model = model;
  }

  /**
   * Handles one AI request.
   *
   * Implementations must resolve with an {@link AIProviderResult} and must not
   * measure their own duration — the orchestrator times the call, which keeps a
   * provider's output deterministic and therefore assertable.
   *
   * @abstract
   * @param {import('../types/ai.types').AIRequest} request
   * @returns {Promise<import('../types/ai.types').AIProviderResult>}
   */
  // eslint-disable-next-line no-unused-vars
  async run(request) {
    throw new Error(`${this.constructor.name} must implement run(request).`);
  }

  /** Zero-cost usage record, shared by every local provider. */
  static emptyUsage() {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
  }
}

module.exports = { AIProvider };
