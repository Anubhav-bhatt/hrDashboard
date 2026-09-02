/**
 * OpenRouter Provider implementation.
 *
 * Implements the AIProvider contract for OpenRouter models (e.g. openai/gpt-4o-mini).
 * For mode='assistant', uses structured JSON Schema outputs with schema enforcement, timeouts, and normalized error mapping.
 * For specialist modes (screening, ranking, comparison, insights), executes deterministic domain logic to preserve
 * official Match Scores, tie-break algorithms, and security boundaries.
 *
 * Supports an injectable `transport` function for deterministic unit/integration testing
 * with zero external API calls and ₹0 test cost.
 */

const { MockAIProvider } = require('./MockAIProvider');
const {
  AiError,
  aiProviderNotConfigured,
  aiProviderUnavailable,
  aiProviderTimeout,
  aiProviderError
} = require('../errors/ai.errors');
const { ASSISTANT_SYSTEM_PROMPT } = require('../prompts/assistantSystemPrompt');
const {
  ASSISTANT_INTENT_SCHEMA,
  validateAssistantIntent
} = require('./schemas/assistantIntent.schema');

const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_OUTPUT_TOKENS = 500;

class OpenRouterProvider extends MockAIProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.apiKey] OpenRouter API key
   * @param {string} [options.model] Model slug (defaults to openai/gpt-4o-mini)
   * @param {string} [options.baseUrl] OpenRouter base URL
   * @param {number} [options.timeoutMs] Request timeout in milliseconds
   * @param {number} [options.maxOutputTokens] Maximum output tokens
   * @param {Function} [options.transport] Injectable transport for tests
   */
  constructor({
    apiKey = process.env.OPENROUTER_API_KEY,
    model = process.env.AI_MODEL || DEFAULT_MODEL,
    baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
    transport = null
  } = {}) {
    super();
    this.name = 'openrouter';
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey || null;
    this.timeoutMs = timeoutMs;
    this.maxOutputTokens = maxOutputTokens;
    this.transport = transport;
  }

  get capabilities() {
    return {
      structuredOutput: true,
      streaming: false,
      toolCalling: true
    };
  }

  /**
   * Forward-compatible standard generation interface for OpenRouter.
   *
   * @param {Object} params
   * @param {Array<Object>} params.messages Standard message list [{ role, content }]
   * @param {Object} [params.responseSchema] Expected JSON schema definition
   * @param {Object} [params.metadata]
   * @param {number} [params.timeoutMs] Optional per-request timeout in ms
   * @returns {Promise<{ content: string, structuredData?: Object, usage: Object, provider: string, model: string }>}
   */
  async generate({ messages = [], responseSchema = null, metadata = {}, timeoutMs = null }) {
    if (!this.apiKey && !this.transport) {
      throw aiProviderNotConfigured('openrouter');
    }

    const effectiveTimeout = timeoutMs || this.timeoutMs;
    const schemaToUse = responseSchema || ASSISTANT_INTENT_SCHEMA;

    const payload = {
      model: this.model,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'assistant_intent',
          strict: true,
          schema: schemaToUse
        }
      },
      max_tokens: this.maxOutputTokens,
      temperature: 0
    };

    let responseData;

    if (this.transport) {
      // Test seam: execute injected mock transport
      try {
        responseData = await this.transport(payload, { timeoutMs: effectiveTimeout });
      } catch (err) {
        if (err.name === 'AbortError') {
          throw aiProviderTimeout(effectiveTimeout);
        }
        if (err instanceof AiError) {
          throw err;
        }
        throw aiProviderError(err);
      }
    } else {
      // Live production execution via native fetch with AbortController
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), effectiveTimeout);

      try {
        const endpoint = `${this.baseUrl}/chat/completions`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0].trim() : 'http://localhost:5173',
            'X-Title': 'HR Recruitment Screening AI Assistant'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timer);

        if (res.status === 401 || res.status === 403) {
          throw aiProviderNotConfigured('openrouter');
        }

        if (res.status === 429) {
          throw new AiError(
            'AI_PROVIDER_RATE_LIMITED',
            'OpenRouter API rate limit exceeded. Please retry shortly.',
            429
          );
        }

        if (res.status >= 500) {
          throw aiProviderUnavailable('openrouter');
        }

        if (!res.ok) {
          const errBody = await res.text().catch(() => '');
          throw new AiError(
            'AI_PROVIDER_ERROR',
            `OpenRouter request failed with status ${res.status}.`,
            502
          );
        }

        responseData = await res.json();
      } catch (err) {
        clearTimeout(timer);
        if (err.name === 'AbortError') {
          throw aiProviderTimeout(effectiveTimeout);
        }
        if (err instanceof AiError) {
          throw err;
        }
        throw aiProviderError(err);
      }
    }

    const rawChoice = responseData?.choices?.[0]?.message?.content;
    if (!rawChoice || typeof rawChoice !== 'string') {
      throw new AiError(
        'AI_PROVIDER_INVALID_RESPONSE',
        'OpenRouter response contained no message content.',
        502
      );
    }

    let parsedStructured = null;
    try {
      parsedStructured = JSON.parse(rawChoice);
    } catch {
      throw new AiError(
        'AI_PROVIDER_INVALID_RESPONSE',
        'OpenRouter response was not valid JSON.',
        502
      );
    }

    const usage = {
      promptTokens: responseData.usage?.prompt_tokens ?? null,
      completionTokens: responseData.usage?.completion_tokens ?? null,
      totalTokens: responseData.usage?.total_tokens ?? null,
      costUsd: null
    };

    return {
      content: rawChoice,
      structuredData: parsedStructured,
      usage,
      provider: 'openrouter',
      model: this.model
    };
  }

  /**
   * Handles request execution.
   * For mode='assistant': runs OpenRouter structured language interpretation.
   * For specialist modes: runs deterministic analysis algorithms.
   *
   * @param {import('../types/ai.types').AIRequest} request
   * @returns {Promise<import('../types/ai.types').AIProviderResult>}
   */
  async run(request) {
    if (request.mode === 'assistant') {
      const userMessage = request.message || '';
      const messages = [
        { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ];

      const result = await this.generate({
        messages,
        timeoutMs: this.timeoutMs
      });

      const validation = validateAssistantIntent(result.structuredData);
      if (!validation.valid) {
        throw new AiError(
          'AI_PROVIDER_INVALID_RESPONSE',
          `OpenRouter response failed schema validation: ${validation.error}`,
          502
        );
      }

      return {
        mode: request.mode,
        content: result.content,
        structuredData: validation.data,
        usage: result.usage,
        provider: this.name,
        model: this.model
      };
    }

    // Specialist modes preserve deterministic score & evidence evaluation
    return super.run(request);
  }
}

module.exports = {
  OpenRouterProvider,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL
};
