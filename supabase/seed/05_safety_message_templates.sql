-- Approved, versioned member-facing safety copy. Calm, supportive, direct,
-- non-diagnostic: the same warm coaching voice as lib/wellness/coaching.ts,
-- never alarming or judgmental. One generic template per classification
-- level, plus category-specific overrides for the handful of concerns
-- where a more specific message meaningfully helps the member (self-harm,
-- chest pain/breathing, medication, diagnosis requests). See
-- lib/safety/messages.ts for the fallback resolution order.

insert into safety_message_templates (template_key, classification_level, concern_category, version, title, body) values

-- ---- COACHING_WITH_CAUTION (generic) ----
(
  'coaching_with_caution__generic',
  'coaching_with_caution',
  null,
  1,
  'A gentle note before we continue',
  'What you''ve shared is something we want to be thoughtful about. We''ll keep today''s guidance general and conservative, and your coach will be able to see this if you''d like to talk it through further.'
),

-- ---- MEDICAL_EVALUATION_RECOMMENDED (generic + 2 category overrides) ----
(
  'medical_evaluation_recommended__generic',
  'medical_evaluation_recommended',
  null,
  1,
  'This is worth checking with a healthcare professional',
  'We''re not able to evaluate or diagnose medical conditions here, so this is best explored with a licensed healthcare professional who can properly assess it. In the meantime, we''re glad to help with general wellness support (sleep, hydration, stress, and gentle movement) and to help you prepare questions for that conversation.'
),
(
  'medical_evaluation_recommended__diagnosis_requests',
  'medical_evaluation_recommended',
  'diagnosis_requests',
  1,
  'We can''t diagnose, but we can help you prepare',
  'Identifying or naming a medical condition isn''t something we''re able to do here. That needs a licensed healthcare professional who can properly evaluate it. We can help you get ready for that conversation, and we''re glad to keep supporting the general wellness side of things in the meantime.'
),
(
  'medical_evaluation_recommended__out_of_scope_medical',
  'medical_evaluation_recommended',
  'out_of_scope_medical',
  1,
  'This falls outside what we can guide on here',
  'Treatment plans and prescriptions need to come from a licensed healthcare professional. That''s outside what we''re able to offer. We''re glad to keep helping with the general wellness habits that support you day to day.'
),

-- ---- COACH_REVIEW_REQUIRED (generic + 2 category overrides) ----
(
  'coach_review_required__generic',
  'coach_review_required',
  null,
  1,
  'Your coach will take a look at this',
  'To make sure you get guidance that''s right for your situation, we''re holding off on personalized coaching for this specific topic until your coach has reviewed it. Everything else in your coaching experience (sleep, stress, hydration, and your other wellness priorities) continues as normal in the meantime.'
),
(
  'coach_review_required__medication_questions',
  'coach_review_required',
  'medication_questions',
  1,
  'Let''s loop your coach in on medication questions',
  'Questions about starting, stopping, or changing a medication need to go through your coach and, where appropriate, your prescribing healthcare provider. We''re not able to guide on that here. We''ve flagged this for your coach to follow up with you, and the rest of your coaching experience continues as usual.'
),
(
  'coach_review_required__severe_worsening_pain',
  'coach_review_required',
  'severe_worsening_pain',
  1,
  'We want your coach to know about this pain',
  'Pain that''s severe or getting worse deserves a closer look from your coach before we continue personalized guidance on it. We''ve let your coach know. If this feels urgent or is getting worse quickly, please contact a healthcare professional directly.'
),

-- ---- SAFETY_RESPONSE_ONLY (generic + 2 category overrides) ----
(
  'safety_response_only__generic',
  'safety_response_only',
  null,
  1,
  'Please prioritize your immediate safety',
  'What you''ve described may need prompt attention from a healthcare professional or emergency services. Please reach out to a medical professional, local emergency services, or someone you trust right now. We''ve let your coach know, and we''re here for the rest of your wellness journey once you''ve gotten the support you need.'
),
(
  'safety_response_only__self_harm_crisis',
  'safety_response_only',
  'self_harm_crisis',
  1,
  'You matter, and support is available right now',
  'What you''ve shared sounds really hard, and we want you to have real support right now. Please reach out to a crisis line, a healthcare professional, or someone you trust immediately. In the US, you can call or text 988 (Suicide & Crisis Lifeline) anytime. We''ve let your coach know so they can follow up with you directly. Your other wellness priorities will still be here when you''re ready.'
),
(
  'safety_response_only__chest_pain_breathing',
  'safety_response_only',
  'chest_pain_breathing',
  1,
  'Please seek medical attention now',
  'Chest pain or trouble breathing can be serious and needs prompt medical attention. Please contact emergency services or a healthcare professional right away rather than waiting on guidance here. We''ve let your coach know. We''re here for the rest of your wellness journey once you''ve been seen.'
);
