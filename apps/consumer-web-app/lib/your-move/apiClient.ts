/**
 * Server-only client for Your Move's Exercise API (exercise-api.ymove.app)
 * — the SOLE Exercise Library catalog source (migration 119; ExerciseAPI.dev
 * has been removed entirely). Browse mode populates exercise_catalog ahead
 * of time (scripts/exercise-media/fetch-your-move-catalog.ts); this client
 * is never called live from a browse/search request.
 *
 * Two hard constraints from Your Move's own terms, enforced here:
 *
 * 1. Video/thumbnail URLs are pre-signed and expire after 48 hours. This
 *    client NEVER persists one — `getExercise` returns it to the caller for
 *    immediate use (fetch-at-play-time) or for one-shot poster extraction;
 *    any caching of the returned URL happens at the call site with an
 *    explicit short TTL (see lib/your-move/catalog.ts's cacheVideoUrl),
 *    never here.
 *
 * 2. Browse (`listExercises`) always sends `includeVideos=false` — matching,
 *    auditing, and pagination must never request video fields, since doing
 *    so counts against the monthly exercise cap. Only `getExercise` (used
 *    exclusively at actual playback/extraction time) requests video.
 */

const YOUR_MOVE_BASE_URL = 'https://exercise-api.ymove.app/api/v2';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

/** API-documented max — requests above this are rejected by the vendor. */
export const YOUR_MOVE_MAX_PAGE_SIZE = 50;

export type YourMoveErrorCode =
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'INVALID_PARAMETER'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'NOT_CONFIGURED';

export class YourMoveApiError extends Error {
  constructor(
    public readonly code: YourMoveErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'YourMoveApiError';
  }
}

export type YourMoveVideo = {
  url: string;
  tag: 'white-background' | 'gym-shot';
  orientation?: string;
};

/**
 * The raw shape Your Move returns for one exercise. In browse mode
 * (includeVideos=false), every field from videoUrl through videos is
 * omitted entirely by the vendor — never present, not present-but-null —
 * so callers must treat this as the full truth of what's on the wire, not
 * assume absence means "no video" (see hasVideo for that).
 */
export type YourMoveExercise = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  instructions?: string[] | null;
  importantPoints?: string[] | null;
  muscleGroup: string;
  secondaryMuscles?: string[] | null;
  equipment: string;
  category?: string | null;
  difficulty?: string | null;
  exerciseType?: string[] | null;
  hasVideo: boolean;
  hasVideoWhite: boolean;
  hasVideoGym: boolean;
  videoUrl?: string | null;
  videoHlsUrl?: string | null;
  thumbnailUrl?: string | null;
  videoDurationSecs?: number | null;
  videos?: YourMoveVideo[];
};

export type YourMoveListParams = {
  muscleGroup?: string;
  exerciseType?: string;
  equipment?: string;
  difficulty?: string;
  hasVideo?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
};

export type YourMoveListResult = {
  data: YourMoveExercise[];
  page: number;
  pageSize: number;
  /** Present when the vendor's response includes a browse_mode _notice — confirms no quota was spent on this call. */
  browseMode: boolean;
};

/**
 * The exercise shape embedded in a generate response — a strict subset of
 * YourMoveExercise's fields (no importantPoints, secondaryMuscles,
 * exerciseType, or any has_video-family/video-family field). Confirmed against the
 * live endpoint: every embedded exercise carries `videoExcludedReason:
 * "browse_mode"`, i.e. this is exactly browse-mode-shaped data, free of
 * charge, same as listExercises — never assume "no video field" here
 * means "no video," only that this call didn't request one.
 */
export type YourMoveGeneratedExercise = {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  instructions?: string[] | null;
  muscleGroup: string;
  equipment: string;
  difficulty?: string | null;
  videoExcludedReason?: string;
};

export type YourMoveGeneratedExerciseEntry = {
  exercise: YourMoveGeneratedExercise;
  sets: number;
  reps: string;
  restSeconds: number;
  order?: number;
};

export type YourMoveGeneratedWorkout = {
  name: string;
  muscleGroup: string;
  muscleGroups: string[];
  muscleGroupsRequested: string[];
  difficulty: string;
  estimatedMinutes: number;
  exerciseCount: number;
  exercises: YourMoveGeneratedExerciseEntry[];
  warmup: YourMoveGeneratedExerciseEntry[];
  cooldown: YourMoveGeneratedExerciseEntry[];
};

export type YourMoveGenerateWorkoutParams = {
  /** One or more muscle groups — joined with a comma, matching the vendor's own multi-value convention (confirmed live: `muscleGroup=chest,back`). */
  muscleGroups: string[];
  equipment?: string | undefined;
  difficulty?: string | undefined;
};

export type YourMoveGeneratedProgramDay = {
  day: number;
  name: string;
  muscleGroup: string;
  muscleGroups: string[];
  exercises: YourMoveGeneratedExerciseEntry[];
  warmup: YourMoveGeneratedExerciseEntry[];
  cooldown: YourMoveGeneratedExerciseEntry[];
};

export type YourMoveGeneratedProgram = {
  name: string;
  goal: string;
  difficulty: string;
  daysPerWeek: number;
  /** The vendor's own reported week count for this template — confirmed live to always come back 4 regardless of what's requested; the vendor generates one repeating week and expects the caller to replicate it, per its own `notes` field below. Never trust this over the coach's actually-requested week count. */
  weeks: number;
  split: string;
  weeklySchedule: YourMoveGeneratedProgramDay[];
  notes?: string;
};

export type YourMoveGenerateProgramParams = {
  goal: string;
  /** Not honored by the vendor (confirmed live — output is always a fixed one-week template regardless of this value); sent anyway in case that changes, but callers must replicate weeklySchedule themselves for the coach's requested week count. */
  weeks?: number | undefined;
  difficulty?: string | undefined;
};

export type YourMoveUsage = {
  plan: string;
  status: string;
  minutesUsed: number;
  minutesLimit: number;
  minutesRemaining: number;
  percentUsed: number;
  rateLimit: number;
  monthlyExercisesUsed: number;
  monthlyExerciseLimit: number | 'unlimited';
  whiteVideoAccess: boolean;
  premiumVideoAccess: boolean;
  trialEndsAt: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string };
};

function toErrorCode(raw: string | undefined): YourMoveErrorCode {
  const known: YourMoveErrorCode[] = [
    'INVALID_API_KEY',
    'RATE_LIMITED',
    'NOT_FOUND',
    'INVALID_PARAMETER',
    'INTERNAL_ERROR',
  ];
  return (known as string[]).includes(raw ?? '') ? (raw as YourMoveErrorCode) : 'INTERNAL_ERROR';
}

async function request<T>(path: string, apiKey: string, timeoutMs: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${YOUR_MOVE_BASE_URL}${path}`, {
        method: 'GET',
        headers: { 'X-API-Key': apiKey },
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if (response.status === 429) {
        const json = (await response.json().catch(() => null)) as
          | (ErrorEnvelope & { retryAfterMs?: number })
          | null;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(json?.retryAfterMs ?? RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new YourMoveApiError(
          'RATE_LIMITED',
          json?.error?.message ?? 'Your Move rate limit exceeded',
          429,
          json?.retryAfterMs
        );
      }

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as ErrorEnvelope | null;
        const code = toErrorCode(json?.error?.code);
        const message = json?.error?.message ?? `Your Move API returned ${response.status}`;

        if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
          lastError = new YourMoveApiError(code, message, response.status);
          await sleep(RETRY_BASE_DELAY_MS * attempt);
          continue;
        }
        throw new YourMoveApiError(code, message, response.status);
      }

      return (await response.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof YourMoveApiError) throw err;

      lastError = err;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
      throw new YourMoveApiError(
        'NETWORK_ERROR',
        isAbort ? `Your Move request timed out after ${timeoutMs}ms` : 'Your Move request failed',
        0
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new YourMoveApiError('NETWORK_ERROR', 'Your Move request failed', 0);
}

export class YourMoveApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  /**
   * Browse mode ONLY — always forces includeVideos=false regardless of
   * what's passed in, since this method exists specifically for
   * quota-free matching/auditing/pagination. Callers that actually need
   * video must use getExercise for that one exercise, at the moment
   * they're about to use it.
   */
  listExercises(params: YourMoveListParams = {}): Promise<YourMoveListResult> {
    const search = new URLSearchParams();
    if (params.muscleGroup) search.set('muscleGroup', params.muscleGroup);
    if (params.exerciseType) search.set('exerciseType', params.exerciseType);
    if (params.equipment) search.set('equipment', params.equipment);
    if (params.difficulty) search.set('difficulty', params.difficulty);
    if (params.hasVideo !== undefined) search.set('hasVideo', String(params.hasVideo));
    if (params.search) search.set('search', params.search);
    search.set('page', String(params.page ?? 1));
    search.set('pageSize', String(Math.min(params.pageSize ?? YOUR_MOVE_MAX_PAGE_SIZE, YOUR_MOVE_MAX_PAGE_SIZE)));
    search.set('includeVideos', 'false');

    return request<{ data: YourMoveExercise[]; _notice?: { reason?: string } }>(
      `/exercises?${search.toString()}`,
      this.apiKey,
      this.timeoutMs
    ).then((result) => ({
      data: result.data,
      page: params.page ?? 1,
      pageSize: Math.min(params.pageSize ?? YOUR_MOVE_MAX_PAGE_SIZE, YOUR_MOVE_MAX_PAGE_SIZE),
      browseMode: result._notice?.reason === 'browse_mode',
    }));
  }

  /**
   * Always returns video fields and always counts toward the monthly
   * exercise cap (per Your Move's own docs) — call this ONLY at the
   * moment a member taps play, or during one-time poster extraction. Never
   * call this to enumerate/browse the catalog.
   */
  async getExercise(id: string): Promise<YourMoveExercise> {
    const result = await request<{ data: YourMoveExercise }>(
      `/exercises/${encodeURIComponent(id)}`,
      this.apiKey,
      this.timeoutMs
    );
    return result.data;
  }

  async getUsage(): Promise<YourMoveUsage> {
    const result = await request<{ data: YourMoveUsage }>('/usage', this.apiKey, this.timeoutMs);
    return result.data;
  }

  /**
   * Single-session workout generation — coach-facing only (see
   * app/actions/your-move-generation.ts for the caller-side coach gate;
   * this client has no notion of roles). Confirmed live: every embedded
   * exercise is browse-mode-shaped (no video fields, no quota spent) —
   * same free-of-charge status as listExercises, verified against a real
   * account's /usage before and after.
   */
  generateWorkout(params: YourMoveGenerateWorkoutParams): Promise<YourMoveGeneratedWorkout> {
    const search = new URLSearchParams();
    search.set('muscleGroup', params.muscleGroups.join(','));
    if (params.equipment) search.set('equipment', params.equipment);
    if (params.difficulty) search.set('difficulty', params.difficulty);

    return request<{ data: YourMoveGeneratedWorkout }>(
      `/workouts/generate?${search.toString()}`,
      this.apiKey,
      this.timeoutMs
    ).then((result) => result.data);
  }

  /** Multi-day program generation — same quota-free, coach-facing-only posture as generateWorkout. */
  generateProgram(params: YourMoveGenerateProgramParams): Promise<YourMoveGeneratedProgram> {
    const search = new URLSearchParams();
    search.set('goal', params.goal);
    if (params.weeks) search.set('weeks', String(params.weeks));
    if (params.difficulty) search.set('difficulty', params.difficulty);

    return request<{ data: YourMoveGeneratedProgram }>(
      `/programs/generate?${search.toString()}`,
      this.apiKey,
      this.timeoutMs
    ).then((result) => result.data);
  }
}

/** Returns null when YMOVE_API_KEY isn't set — callers surface a NOT_CONFIGURED state rather than crashing, same convention as buildExerciseApiClientFromEnv. */
export function buildYourMoveApiClientFromEnv(): YourMoveApiClient | null {
  const apiKey = process.env.YMOVE_API_KEY;
  if (!apiKey) return null;
  return new YourMoveApiClient(apiKey);
}
