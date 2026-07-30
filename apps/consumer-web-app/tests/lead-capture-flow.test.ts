import { describe, it, expect } from 'vitest';
import {
  classifyTopic,
  nextStage,
  extractNameAndEmail,
  determineLeadTemperature,
  determineRoutingDestination,
  shouldRetryEmailCapture,
  MAX_EMAIL_RETRIES,
} from '../lib/lead-capture/flow';

describe('lead-capture flow — classifyTopic', () => {
  it('matches an exact quick-reply value case-insensitively', () => {
    expect(classifyTopic('Pain')).toBe('pain');
    expect(classifyTopic('sleep')).toBe('sleep');
  });

  it('classifies free-typed text via keyword match', () => {
    expect(classifyTopic('My lower back has been really sore')).toBe('pain');
    expect(classifyTopic("I'm exhausted by 2pm every day")).toBe('energy');
    expect(classifyTopic("I can't stay asleep past 3am")).toBe('sleep');
    expect(classifyTopic('Work has me completely overwhelmed')).toBe('stress');
  });

  it('falls back to general when nothing matches, rather than guessing wrong', () => {
    expect(classifyTopic('Just checking things out')).toBe('general');
  });
});

describe('lead-capture flow — nextStage', () => {
  it('advances linearly through the follow-up stages', () => {
    expect(nextStage('opening')).toBe('follow_up_1');
    expect(nextStage('follow_up_1')).toBe('follow_up_2');
    expect(nextStage('follow_up_2')).toBe('follow_up_3');
    expect(nextStage('follow_up_3')).toBe('insight_capture');
  });

  it('insight_capture advances to routed, and routed is terminal', () => {
    expect(nextStage('insight_capture')).toBe('routed');
    expect(nextStage('routed')).toBe('routed');
  });
});

describe('lead-capture flow — extractNameAndEmail', () => {
  it('parses a "name, email" reply', () => {
    const result = extractNameAndEmail('John, john@example.com');
    expect(result.name).toBe('John');
    expect(result.email).toBe('john@example.com');
  });

  it('parses a "name email" reply with no comma', () => {
    const result = extractNameAndEmail('Sarah sarah.jones@example.com');
    expect(result.name).toBe('Sarah');
    expect(result.email).toBe('sarah.jones@example.com');
  });

  it('returns a null email when none is present', () => {
    const result = extractNameAndEmail('just my name, no email yet');
    expect(result.email).toBeNull();
  });

  it('returns a null name when only an email is given', () => {
    const result = extractNameAndEmail('test@example.com');
    expect(result.email).toBe('test@example.com');
    expect(result.name).toBeNull();
  });
});

describe('lead-capture flow — determineLeadTemperature / determineRoutingDestination', () => {
  it('is hot only for pain + an expressed-readiness message', () => {
    expect(determineLeadTemperature('pain', ["I'm ready to book something"])).toBe('hot');
  });

  it('is warm for pain with no readiness signal', () => {
    expect(determineLeadTemperature('pain', ['just looking around for now'])).toBe('warm');
  });

  it('is warm for a non-pain topic even with a readiness signal', () => {
    expect(determineLeadTemperature('energy', ["I'm ready to fix this"])).toBe('warm');
  });

  it('routes hot to discovery_call and warm to quiz_guide', () => {
    expect(determineRoutingDestination('hot')).toBe('discovery_call');
    expect(determineRoutingDestination('warm')).toBe('quiz_guide');
  });
});

describe('lead-capture flow — shouldRetryEmailCapture', () => {
  it('allows retries up to MAX_EMAIL_RETRIES, then stops', () => {
    for (let i = 0; i < MAX_EMAIL_RETRIES; i++) {
      expect(shouldRetryEmailCapture(i)).toBe(true);
    }
    expect(shouldRetryEmailCapture(MAX_EMAIL_RETRIES)).toBe(false);
  });
});
