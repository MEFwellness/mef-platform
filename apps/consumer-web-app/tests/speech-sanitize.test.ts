/**
 * Unit tests for lib/speech/sanitizeForSpeech.ts — pure function, no
 * browser APIs. Confirms markdown/technical formatting is stripped before
 * a reply is spoken aloud (part 2), and that ordinary sentence content
 * survives untouched.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeForSpeech } from '../lib/speech/sanitizeForSpeech';

describe('sanitizeForSpeech', () => {
  it('leaves plain sentences untouched', () => {
    expect(sanitizeForSpeech('Sleep has been declining this week.')).toBe(
      'Sleep has been declining this week.'
    );
  });

  it('strips bold and italic emphasis markers, keeping the text', () => {
    expect(sanitizeForSpeech('This is **important** and *worth noting*.')).toBe(
      'This is important and worth noting.'
    );
  });

  it('strips inline and fenced code formatting', () => {
    expect(sanitizeForSpeech('Try `10 minutes` of walking.')).toBe('Try 10 minutes of walking.');
    expect(sanitizeForSpeech('before\n```\ncode block\n```\nafter')).toBe('before after');
  });

  it('strips markdown links, keeping only the link text', () => {
    expect(sanitizeForSpeech('See [this article](https://example.com/sleep) for more.')).toBe(
      'See this article for more.'
    );
  });

  it('strips bare URLs entirely', () => {
    expect(sanitizeForSpeech('Visit https://example.com/sleep-tips now.')).toBe('Visit now.');
  });

  it('strips list markers at the start of a line', () => {
    const input = '- First point\n- Second point\n1. Numbered point';
    expect(sanitizeForSpeech(input)).toBe('First point Second point Numbered point');
  });

  it('collapses multiple blank lines into a single spoken pause', () => {
    expect(sanitizeForSpeech('First paragraph.\n\nSecond paragraph.')).toBe(
      'First paragraph.. Second paragraph.'
    );
  });

  it('collapses excess whitespace', () => {
    expect(sanitizeForSpeech('Too    many     spaces.')).toBe('Too many spaces.');
  });

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeForSpeech('  padded text  ')).toBe('padded text');
  });
});
