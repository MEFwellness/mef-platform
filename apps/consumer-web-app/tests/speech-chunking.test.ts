/**
 * lib/speech/serverTextToSpeech.ts splits long coach replies into
 * sentence-grouped chunks before sending each to /api/speech — this is
 * part 3's "long responses divided into shorter spoken sections," and
 * also keeps each individual server request small and fast. Pure
 * function, no Audio/fetch involved, so it's testable directly.
 */
import { describe, it, expect } from 'vitest';
import { splitIntoChunks } from '../lib/speech/serverTextToSpeech';

describe('splitIntoChunks', () => {
  it('keeps a short message as a single chunk', () => {
    const chunks = splitIntoChunks('You did great today.');
    expect(chunks).toEqual(['You did great today.']);
  });

  it('groups multiple short sentences into one chunk under the length cap', () => {
    const chunks = splitIntoChunks('First sentence. Second sentence. Third sentence.');
    expect(chunks).toHaveLength(1);
  });

  it('splits once accumulated sentences would exceed the chunk length cap', () => {
    const longSentence = 'This is a fairly long sentence meant to take up a good chunk of space. '.repeat(4);
    const chunks = splitIntoChunks(longSentence);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400);
    }
  });

  it('never drops any sentence content', () => {
    const text = 'One. Two. Three. Four. Five.';
    const chunks = splitIntoChunks(text);
    expect(chunks.join(' ')).toContain('One.');
    expect(chunks.join(' ')).toContain('Five.');
  });

  it('falls back to the whole text when there is no sentence punctuation', () => {
    const chunks = splitIntoChunks('no punctuation here just words');
    expect(chunks).toEqual(['no punctuation here just words']);
  });
});
