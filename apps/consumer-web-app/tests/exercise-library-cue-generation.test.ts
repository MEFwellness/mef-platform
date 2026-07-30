import { describe, it, expect } from 'vitest';
import { generateCues, type CueGenerationInput } from '../lib/exercise-library/cueGeneration';

function baseInput(overrides: Partial<CueGenerationInput> = {}): CueGenerationInput {
  return {
    name: 'Test Exercise',
    instructions: [],
    exerciseTips: [],
    primaryMuscles: [],
    equipment: null,
    force: null,
    mechanic: null,
    ...overrides,
  };
}

describe('generateCues', () => {
  it('produces 2-3 cues from the vendor\'s own instructions/tips when at least 2 instruction steps exist', () => {
    const result = generateCues(
      baseInput({
        instructions: ['Stand with feet shoulder-width apart.', 'Lower into a squat, keeping your chest up.'],
        exerciseTips: ['Keep your knees tracking over your toes.'],
      })
    );
    expect(result.source).toBe('vendor_instructions');
    expect(result.cues.length).toBeGreaterThanOrEqual(2);
    expect(result.cues.length).toBeLessThanOrEqual(3);
    expect(result.cues[0]).toContain('Stand with feet');
  });

  it('falls back to the muscle/equipment/force template when the vendor gives fewer than 2 instruction steps', () => {
    const result = generateCues(
      baseInput({
        instructions: ['Just do it.'],
        primaryMuscles: ['quadriceps'],
        equipment: 'barbell',
        force: 'push',
      })
    );
    expect(result.source).toBe('template');
    expect(result.cues).toHaveLength(3);
    expect(result.cues.join(' ')).toContain('barbell');
    expect(result.cues.join(' ')).toContain('quadriceps');
  });

  it('template fallback never crashes and still returns 3 cues with no metadata at all', () => {
    const result = generateCues(baseInput());
    expect(result.source).toBe('template');
    expect(result.cues).toHaveLength(3);
    expect(result.cues.every((c) => c.length > 0)).toBe(true);
  });

  it('truncates an overly long vendor instruction rather than overflowing the card', () => {
    const long = 'A'.repeat(200);
    const result = generateCues(baseInput({ instructions: [long, 'Second step here.'] }));
    expect(result.cues[0]!.length).toBeLessThan(100);
  });
});
