/**
 * lib/your-move/apiClient.ts's generateWorkout/generateProgram — the two
 * new coach-facing generation endpoints. Real network calls are mocked
 * (spending Your Move's live quota from an automated test run isn't
 * appropriate, even though a manual live probe during this task's
 * research confirmed both endpoints return 200 and spend zero exercise
 * quota — see docs/BUILD_STATUS.md). This proves the client builds the
 * right request and unwraps the right response shape, including the two
 * vendor quirks discovered live: `muscleGroup` takes a comma-joined list
 * for multi-muscle workouts, and `weeks` is accepted but never actually
 * changes the vendor's output (always a fixed one-week template) — a
 * caller-side fact `generatedProgramToDraft` (tested separately) depends on.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { YourMoveApiClient, YourMoveApiError } from '../lib/your-move/apiClient';

function lastYourMoveUrl(): string {
  const mockFn = globalThis.fetch as unknown as { mock: { calls: unknown[][] } };
  const calls = mockFn.mock.calls.filter((call) => String(call[0]).startsWith('https://exercise-api.ymove.app'));
  return String(calls[calls.length - 1]?.[0]);
}

function mockYourMoveFetch(handler: (url: string) => { status: number; body: unknown }) {
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.startsWith('https://exercise-api.ymove.app')) return realFetch(input, init);
      const { status, body } = handler(url);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      } as Response;
    })
  );
}

describe('YourMoveApiClient.generateWorkout', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('joins multiple muscle groups with a comma and omits equipment/difficulty when not given', async () => {
    mockYourMoveFetch(() => ({
      status: 200,
      body: {
        data: {
          name: 'Chest, Back Workout',
          muscleGroup: 'chest',
          muscleGroups: ['chest', 'back'],
          muscleGroupsRequested: ['chest', 'back'],
          difficulty: 'intermediate',
          estimatedMinutes: 30,
          exerciseCount: 2,
          exercises: [],
          warmup: [],
          cooldown: [],
        },
      },
    }));

    const client = new YourMoveApiClient('fake-key');
    const result = await client.generateWorkout({ muscleGroups: ['chest', 'back'] });

    const url = lastYourMoveUrl();
    expect(url).toContain('/workouts/generate?');
    expect(url).toContain('muscleGroup=chest%2Cback');
    expect(url).not.toContain('equipment=');
    expect(url).not.toContain('difficulty=');
    expect(result.muscleGroups).toEqual(['chest', 'back']);
  });

  it('includes equipment and difficulty when given', async () => {
    mockYourMoveFetch(() => ({
      status: 200,
      body: {
        data: {
          name: 'Chest Workout',
          muscleGroup: 'chest',
          muscleGroups: ['chest'],
          muscleGroupsRequested: ['chest'],
          difficulty: 'beginner',
          estimatedMinutes: 36,
          exerciseCount: 6,
          exercises: [],
          warmup: [],
          cooldown: [],
        },
      },
    }));

    const client = new YourMoveApiClient('fake-key');
    await client.generateWorkout({ muscleGroups: ['chest'], equipment: 'dumbbell', difficulty: 'beginner' });

    const url = lastYourMoveUrl();
    expect(url).toContain('equipment=dumbbell');
    expect(url).toContain('difficulty=beginner');
  });

  it('surfaces a vendor error as a typed YourMoveApiError instead of a partial result', async () => {
    mockYourMoveFetch(() => ({
      status: 401,
      body: { error: { code: 'INVALID_API_KEY', message: 'bad key' } },
    }));

    const client = new YourMoveApiClient('fake-key');
    await expect(client.generateWorkout({ muscleGroups: ['chest'] })).rejects.toBeInstanceOf(YourMoveApiError);
  });
});

describe('YourMoveApiClient.generateProgram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends goal/weeks/difficulty and returns the vendor payload as-is (weeks is a vendor quirk callers must not trust)', async () => {
    mockYourMoveFetch(() => ({
      status: 200,
      body: {
        data: {
          name: 'Upper/Lower 4-Day - Strength',
          goal: 'strength',
          difficulty: 'intermediate',
          daysPerWeek: 4,
          // Real vendor behavior confirmed live: this is always 4
          // regardless of the `weeks` param sent — proven here by
          // deliberately returning a value that does NOT match the
          // request, same as production.
          weeks: 4,
          split: 'Upper/Lower 4-Day',
          weeklySchedule: [],
          notes: 'Repeat this weekly schedule for 4 weeks.',
        },
      },
    }));

    const client = new YourMoveApiClient('fake-key');
    const result = await client.generateProgram({ goal: 'strength', weeks: 2, difficulty: 'intermediate' });

    const url = lastYourMoveUrl();
    expect(url).toContain('goal=strength');
    expect(url).toContain('weeks=2');
    expect(url).toContain('difficulty=intermediate');
    // The client itself doesn't correct the vendor's ignored `weeks` — it
    // hands back exactly what the vendor said. generatedProgramToDraft
    // (tested in your-move-generation-mapping.test.ts) is what overrides
    // this with the coach's actual request.
    expect(result.weeks).toBe(4);
  });
});
