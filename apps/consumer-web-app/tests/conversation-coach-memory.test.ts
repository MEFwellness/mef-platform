/**
 * Pure unit tests for lib/conversation-coach/memoryExtraction.ts — a
 * deterministic keyword extractor, not a second LLM call, so this is
 * fully unit-testable with no Supabase/provider involved. Confirms both
 * that real signals are captured AND that casual conversation is NOT
 * turned into permanent memory (section 11's "never fabricate memory").
 */
import { describe, it, expect } from 'vitest';
import { extractMemoryCandidates } from '../lib/conversation-coach/memoryExtraction';

describe('extractMemoryCandidates — casual conversation stays casual', () => {
  it('returns nothing for ordinary chit-chat with no continuity signal', () => {
    expect(extractMemoryCandidates('Hey, just checking in for today.')).toEqual([]);
    expect(extractMemoryCandidates('Thanks!')).toEqual([]);
    expect(extractMemoryCandidates(null)).toEqual([]);
    expect(extractMemoryCandidates(undefined)).toEqual([]);
    expect(extractMemoryCandidates('   ')).toEqual([]);
  });
});

describe('extractMemoryCandidates — real signals', () => {
  it('extracts a barrier', () => {
    const result = extractMemoryCandidates("I didn't have time for my walk today, work was crazy.");
    expect(result).toHaveLength(1);
    expect(result[0]!.memoryType).toBe('barrier');
    expect(result[0]!.content.toLowerCase()).toContain("didn't have time");
  });

  it('extracts a successful strategy', () => {
    const result = extractMemoryCandidates(
      'The shorter breathing practice really helped me relax.'
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.memoryType).toBe('successful_strategy');
  });

  it('extracts a preference', () => {
    const result = extractMemoryCandidates('I would rather do mornings than evenings.');
    expect(result[0]!.memoryType).toBe('preference');
  });

  it('extracts a life event', () => {
    const result = extractMemoryCandidates('Things have been hard since I moved to a new city.');
    expect(result[0]!.memoryType).toBe('life_event');
  });

  it('extracts an action chosen', () => {
    const result = extractMemoryCandidates('I completed my movement challenge this morning.');
    expect(result[0]!.memoryType).toBe('action_chosen');
  });

  it('extracts a coach follow-up request with priority over a co-occurring barrier phrase', () => {
    const result = extractMemoryCandidates(
      "I want my coach to look at this — I didn't have time this week."
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.memoryType).toBe('coach_follow_up_request');
  });

  it('never returns more than one candidate per message', () => {
    const result = extractMemoryCandidates(
      "That worked well for me, but I didn't have time today, and I moved to a new city."
    );
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('truncates very long matched content', () => {
    const long = `I would rather ${'a'.repeat(400)}`;
    const result = extractMemoryCandidates(long);
    expect(result[0]!.content.length).toBeLessThanOrEqual(241);
  });
});
