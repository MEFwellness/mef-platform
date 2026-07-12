-- Sprint 1 task 11 continued.

-- One active assignment: coach.one -> member.one
insert into coach_client_assignments (coach_id, client_id, assigned_by, status, start_date)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'active', current_date - 14
);

-- One revoked assignment: coach.one was assigned to member.two, then revoked —
-- demonstrates that revocation removes access without a replacement assignment.
insert into coach_client_assignments (
  coach_id, client_id, assigned_by, status, start_date, end_date,
  revoked_at, revoked_by, revocation_reason
) values (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  '44444444-4444-4444-4444-444444444444',
  'revoked', current_date - 30, current_date - 10,
  now() - interval '10 days', '44444444-4444-4444-4444-444444444444',
  'Client requested a different coach (seed data example)'
);

-- Consent: member.one has completed all four required consents.
insert into consent_records (user_id, consent_type, version, granted_at) values
  ('11111111-1111-1111-1111-111111111111', 'terms_of_use', 'v1-placeholder', now() - interval '14 days'),
  ('11111111-1111-1111-1111-111111111111', 'privacy_policy', 'v1-placeholder', now() - interval '14 days'),
  ('11111111-1111-1111-1111-111111111111', 'wellness_education_disclaimer', 'v1-placeholder', now() - interval '14 days'),
  ('11111111-1111-1111-1111-111111111111', 'ai_assisted_processing', 'v1-placeholder', now() - interval '14 days');

-- member.two has only partially consented — useful for exercising the
-- "consent required before onboarding" gate in tests.
insert into consent_records (user_id, consent_type, version, granted_at) values
  ('22222222-2222-2222-2222-222222222222', 'terms_of_use', 'v1-placeholder', now() - interval '2 days');

-- Sample onboarding submission for member.one, via the same atomic function
-- the app uses — exercises submit_onboarding() as part of seeding, not just
-- a raw insert, so seed data proves the function works end to end.
-- auth.uid() reads sub from the request.jwt.claims setting — impersonate
-- member.one for this block so submit_onboarding()/submit_daily_checkin()
-- (which key everything off auth.uid()) attribute the seeded rows correctly.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text,
  true
);

select submit_onboarding(
  1,
  'America/New_York',
  '{"seed": true, "note": "synthetic onboarding submission"}'::jsonb,
  '[
    {"question_key":"primary_concern","question_version":1,"answer_status":"answered","value":"sleep"},
    {"question_key":"baseline_sleep_quality","question_version":1,"answer_status":"answered","value":2},
    {"question_key":"baseline_sleep_hours","question_version":1,"answer_status":"answered","value":"5-6"},
    {"question_key":"baseline_stress_level","question_version":1,"answer_status":"answered","value":4},
    {"question_key":"baseline_energy_level","question_version":1,"answer_status":"answered","value":2},
    {"question_key":"baseline_digestion","question_version":1,"answer_status":"answered","value":3},
    {"question_key":"baseline_pain_areas","question_version":1,"answer_status":"answered","value":["lower_back"]},
    {"question_key":"baseline_movement_frequency","question_version":1,"answer_status":"answered","value":"1-2"},
    {"question_key":"baseline_goals","question_version":1,"answer_status":"answered","value":"Sleep through the night and stop relying on afternoon coffee."},
    {"question_key":"readiness_importance","question_version":1,"answer_status":"answered","value":8},
    {"question_key":"readiness_confidence","question_version":1,"answer_status":"answered","value":6},
    {"question_key":"readiness_actively_working","question_version":1,"answer_status":"answered","value":true}
  ]'::jsonb
);

-- Habits, seeded directly (no coach assignment UI for habits in Sprint 1)
insert into habits (user_id, title, domain, target_frequency, assigned_by)
values
  ('11111111-1111-1111-1111-111111111111', '10 diaphragmatic breaths before bed', 'mind_stress', 'daily',
   '33333333-3333-3333-3333-333333333333'),
  ('11111111-1111-1111-1111-111111111111', '10-minute walk after lunch', 'movement_energy', 'daily',
   '33333333-3333-3333-3333-333333333333');

-- Sample daily check-ins for member.one, via submit_daily_checkin(), including
-- one same-day edit to demonstrate checkin_version incrementing safely.
select submit_daily_checkin(
  'America/New_York', current_date - 2,
  3, '6-7h', 3, 3, 3, 1, 'light', false, null
);
select submit_daily_checkin(
  'America/New_York', current_date - 1,
  2, '5-6h', 2, 4, 3, 1, 'none', false, 'Rough night, work deadline stress.'
);
-- Edit of yesterday's check-in — inserts checkin_version = 2 for the same local_date.
select submit_daily_checkin(
  'America/New_York', current_date - 1,
  2, '5-6h', 2, 4, 2, 2, 'none', false, 'Rough night, work deadline stress. Also some lower back tightness this morning.'
);
select submit_daily_checkin(
  'America/New_York', current_date,
  4, '7-8h', 4, 2, 4, 0, 'moderate', false, null
);

select set_config('request.jwt.claims', '', true);
