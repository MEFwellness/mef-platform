/**
 * Server-only ExerciseAPI.dev client for the permanent Exercise Library.
 * The only thing that ever reads EXERCISE_API_KEY — never imported from a
 * client component. app/api/exercises/route.ts and
 * app/api/exercises/[id]/route.ts are the only callers; the browser only
 * ever talks to those routes, never to ExerciseAPI.dev directly, so the
 * key never reaches client JS, HTML, or a network response the browser
 * can inspect.
 *
 * Supersedes the earlier ExerciseAPI.dev trial (formerly
 * lib/dev/exerciseApiTestClient.ts) now that the vendor evaluation is over
 * and this is the real integration — same retry/timeout/error-mapping
 * behavior, carried forward rather than reinvented.
 */

const EXERCISE_API_BASE_URL = 'https://api.exerciseapi.dev/v1';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

export type ExerciseApiErrorCode =
  | 'INVALID_API_KEY'
  | 'RATE_LIMIT_EXCEEDED'
  | 'OVERAGE_CAP_EXCEEDED'
  | 'PAGINATION_DEPTH_EXCEEDED'
  | 'INVALID_PARAMETER'
  | 'NOT_FOUND'
  | 'SEARCH_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED';

export class ExerciseApiError extends Error {
  constructor(
    public readonly code: ExerciseApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ExerciseApiError';
  }
}

export type ExerciseApiVideo = {
  url: string;
  format?: string;
  resolution?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  generatedWith?: string;
  generatedAt?: string;
};

/** The raw shape ExerciseAPI.dev returns for one exercise — normalized into ExerciseLibraryExercise by normalize.ts before it reaches any UI. */
export type ExerciseApiExercise = {
  id: string;
  name: string;
  keywords?: string[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string | null;
  force?: 'push' | 'pull' | 'static' | null;
  level?: 'beginner' | 'intermediate' | 'advanced';
  mechanic?: 'compound' | 'isolation' | null;
  category?: string;
  instructions?: string[];
  exerciseTips?: string[];
  commonMistakes?: string[];
  safetyInfo?: string | null;
  overview?: string | null;
  variations?: string[];
  images?: string[];
  videos?: ExerciseApiVideo[];
};

export type ExerciseApiSearchParams = {
  q?: string | undefined;
  category?: string | undefined;
  muscle?: string | undefined;
  equipment?: string | undefined;
  level?: string | undefined;
  force?: string | undefined;
  mechanic?: string | undefined;
  hasVideo?: boolean | undefined;
  random?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

export type ExerciseApiSearchResult = {
  data: ExerciseApiExercise[];
  total: number | null;
  limit: number;
  offset: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string; hint?: string; docs_url?: string; details?: unknown };
};

function toErrorCode(raw: string | undefined): ExerciseApiErrorCode {
  const known: ExerciseApiErrorCode[] = [
    'INVALID_API_KEY',
    'RATE_LIMIT_EXCEEDED',
    'OVERAGE_CAP_EXCEEDED',
    'PAGINATION_DEPTH_EXCEEDED',
    'INVALID_PARAMETER',
    'NOT_FOUND',
    'SEARCH_TIMEOUT',
    'INTERNAL_ERROR',
  ];
  return (known as string[]).includes(raw ?? '') ? (raw as ExerciseApiErrorCode) : 'INTERNAL_ERROR';
}

async function request<T>(path: string, apiKey: string, timeoutMs: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${EXERCISE_API_BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as ErrorEnvelope | null;
        const code = toErrorCode(json?.error?.code);
        const message = json?.error?.message ?? `ExerciseAPI.dev returned ${response.status}`;
        const retryAfterHeader = response.headers.get('Retry-After');

        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          lastError = new ExerciseApiError(code, message, response.status);
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }

        throw new ExerciseApiError(
          code,
          message,
          response.status,
          retryAfterHeader ? Number(retryAfterHeader) : undefined,
          json?.error?.details
        );
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof ExerciseApiError) throw err;

      lastError = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw new ExerciseApiError(
        'NETWORK_ERROR',
        isAbort
          ? `ExerciseAPI.dev request timed out after ${timeoutMs}ms`
          : 'ExerciseAPI.dev request failed',
        0
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ExerciseApiError('NETWORK_ERROR', 'ExerciseAPI.dev request failed', 0);
}

function buildQuery(params: ExerciseApiSearchParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.category) search.set('category', params.category);
  if (params.muscle) search.set('muscle', params.muscle);
  if (params.equipment) search.set('equipment', params.equipment);
  if (params.level) search.set('level', params.level);
  if (params.force) search.set('force', params.force);
  if (params.mechanic) search.set('mechanic', params.mechanic);
  if (params.hasVideo !== undefined) search.set('hasVideo', String(params.hasVideo));
  if (params.random !== undefined) search.set('random', String(params.random));
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  return search.toString();
}

export class ExerciseApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  searchExercises(params: ExerciseApiSearchParams): Promise<ExerciseApiSearchResult> {
    const qs = buildQuery(params);
    return request<ExerciseApiSearchResult>(
      `/exercises${qs ? `?${qs}` : ''}`,
      this.apiKey,
      this.timeoutMs
    );
  }

  async getExercise(id: string): Promise<ExerciseApiExercise> {
    const result = await request<{ data: ExerciseApiExercise }>(
      `/exercises/${encodeURIComponent(id)}`,
      this.apiKey,
      this.timeoutMs
    );
    return result.data;
  }

  async getMuscles(): Promise<unknown> {
    return request(`/muscles`, this.apiKey, this.timeoutMs);
  }

  async getEquipmentOptions(): Promise<unknown> {
    return request(`/equipment`, this.apiKey, this.timeoutMs);
  }

  async getCategories(): Promise<unknown> {
    return request(`/categories`, this.apiKey, this.timeoutMs);
  }
}

/** Returns null when EXERCISE_API_KEY isn't set — callers surface a NOT_CONFIGURED state rather than crashing. */
export function buildExerciseApiClientFromEnv(): ExerciseApiClient | null {
  const apiKey = process.env.EXERCISE_API_KEY;
  if (!apiKey) return null;
  return new ExerciseApiClient(apiKey);
}
