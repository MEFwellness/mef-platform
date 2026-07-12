/**
 * PLACEHOLDER COPY — REQUIRES LEGAL REVIEW BEFORE ANY REAL USER SEES IT.
 *
 * Per Architecture v2.1 Section H, the actual wording of every consent
 * surface is a legal dependency, not an engineering decision. This file
 * exists so Sprint 1 has a working consent flow to build and test against;
 * none of this text should be treated as final. CONSENT_VERSION is bumped
 * whenever the copy changes, and every consent_records row stores exactly
 * which version the member agreed to and when.
 */

export const CONSENT_VERSION = 'v1-placeholder';

export const CONSENT_ITEMS = [
  {
    type: 'terms_of_use',
    title: 'Terms of use',
    body:
      'PLACEHOLDER — LEGAL REVIEW REQUIRED. By continuing, you agree to use ' +
      'MEF Wellness in accordance with our terms of use.'
  },
  {
    type: 'privacy_policy',
    title: 'Privacy policy',
    body:
      'PLACEHOLDER — LEGAL REVIEW REQUIRED. This explains what data we ' +
      'collect, how it is stored, and who can access it, including your ' +
      'assigned coach.'
  },
  {
    type: 'wellness_education_disclaimer',
    title: 'Wellness education disclaimer',
    body:
      'PLACEHOLDER — LEGAL REVIEW REQUIRED. MEF Wellness provides ' +
      'educational, non-diagnostic wellness coaching. It is not a substitute ' +
      'for professional medical advice, diagnosis, or treatment. Always seek ' +
      'the advice of a qualified health provider with questions about a ' +
      'medical condition.'
  },
  {
    type: 'ai_assisted_processing',
    title: 'AI-assisted processing disclosure',
    body:
      'PLACEHOLDER — LEGAL REVIEW REQUIRED. Some of your check-in data may ' +
      'be processed by automated systems, including AI models, to help ' +
      'surface patterns and educational content. No automated system ' +
      'diagnoses you or makes medical decisions on your behalf.'
  }
] as const;

export type ConsentItemType = (typeof CONSENT_ITEMS)[number]['type'];
