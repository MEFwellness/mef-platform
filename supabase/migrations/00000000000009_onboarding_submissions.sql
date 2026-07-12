-- Architecture v2.1, Section B.2. raw_payload preserves the complete
-- original submission verbatim, independent of the typed onboarding_answers
-- rows derived from it.
create table onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assessment_version_id uuid not null references onboarding_assessment_versions(id),
  submitted_at timestamptz not null default now(),
  timezone text not null,
  local_date date not null,
  raw_payload jsonb not null,
  superseded_at timestamptz
);

create index onboarding_submissions_user_idx on onboarding_submissions (user_id);
