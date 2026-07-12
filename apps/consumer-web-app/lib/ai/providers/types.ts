/**
 * Provider abstraction — business logic (the rules engine, every agent)
 * must never import an OpenAI/Anthropic/Google SDK directly, or a
 * provider swap becomes a rewrite instead of a config change. Nothing in
 * this milestone calls a real provider; this interface exists so that
 * when the sprint that adds LLM-assisted narration arrives (per
 * services/knowledge-engine-api's own README: "LLM orchestration — the
 * only service permitted to call a model provider"), it has a contract to
 * implement rather than inventing one under deadline.
 */

export type AiCompletionRequest = {
  /** Which prompt template this came from, for logging/tracing — not resolved into content yet, since ai_prompt_templates is intentionally empty this milestone. */
  templateKey?: string;
  systemPrompt?: string;
  userPrompt: string;
  maxOutputTokens?: number;
  temperature?: number;
};

export type AiCompletionResult = {
  content: string;
  provider: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
};

export interface AiProvider {
  readonly name: string;
  generateCompletion(request: AiCompletionRequest): Promise<AiCompletionResult>;
}
