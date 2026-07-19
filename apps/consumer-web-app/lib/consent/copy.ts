/**
 * Consent surface copy, shown once on "Before we start" and recorded
 * per-item in consent_records. Structured so legal counsel can edit the
 * wording of any `body` field in place without touching layout: each
 * item is a plain { type, title, body } record rendered generically by
 * ConsentForm.tsx, so a wording change here is the entire change.
 *
 * `type` is a stored, RLS-covered enum value (consent_records.consent_type,
 * migration 5) read by hasCompletedConsent() to gate onboarding — it is
 * an internal record key, never shown to a member, so it stays stable
 * even where the visible `title` changes. CONSENT_VERSION is bumped
 * whenever body copy changes, so every consent_records row keeps an
 * exact record of which version a member agreed to and when.
 */

export const CONSENT_VERSION = 'v2';

export const CONSENT_ITEMS = [
  {
    type: 'terms_of_use',
    title: 'Terms of use',
    body:
      'By creating an account, you agree to use MEF Wellness for its intended ' +
      'purpose: tracking your daily wellness, working with your assigned coach, ' +
      'and completing the assessments and check-ins available on the platform. ' +
      'Keep your login credentials private, and let us know right away if you ' +
      'suspect unauthorized access to your account. We may update these terms ' +
      'as the platform evolves; continuing to use MEF Wellness after an update ' +
      'means you accept the current version.',
  },
  {
    type: 'privacy_policy',
    title: 'Privacy policy',
    body:
      'We collect what you enter directly (check-ins, assessments, profile ' +
      'details, messages to your coach) and what the platform observes as you ' +
      'use it (habit completions, progress history). This information is used ' +
      'to run your coaching experience: your assigned coach can see the data ' +
      'relevant to supporting you, and it is never sold or shared with ' +
      'advertisers. You can request a copy of your data or ask us to delete ' +
      'your account at any time from your profile settings or by contacting ' +
      'support.',
  },
  {
    type: 'wellness_education_disclaimer',
    title: 'Wellness education disclaimer',
    body:
      'MEF Wellness provides educational, non-diagnostic wellness coaching. ' +
      'It is not a substitute for professional medical advice, diagnosis, or ' +
      'treatment, and your coach is not acting as your physician. Always seek ' +
      'the advice of a qualified health provider with questions about a ' +
      'medical condition, and never disregard professional medical advice or ' +
      'delay seeking it because of something you read here.',
  },
  {
    type: 'ai_assisted_processing',
    title: 'Data usage notice',
    body:
      'Some of your check-in and assessment data is analyzed by automated ' +
      'systems to help surface patterns over time (trends in your sleep, ' +
      'energy, or mood, for example) and to power personalized coaching ' +
      'insights and progress tracking. This processing supports the ' +
      'education and pattern-recognition your coach uses to guide you; it ' +
      'never produces a diagnosis or makes a medical decision on your ' +
      'behalf, and a person, your coach, remains responsible for the ' +
      'guidance you receive.',
  },
] as const;

export type ConsentItemType = (typeof CONSENT_ITEMS)[number]['type'];
