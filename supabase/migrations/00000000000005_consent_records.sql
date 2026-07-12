-- Architecture v2.1, Section B.1. Four consent types required before
-- onboarding per Sprint 1 task 6. Placeholder copy lives in the app layer
-- (lib/consent/copy.ts), clearly labeled as requiring legal review — this
-- table only stores which version + when, never the copy itself.
create table consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  consent_type text not null check (consent_type in (
    'terms_of_use',
    'privacy_policy',
    'wellness_education_disclaimer',
    'ai_assisted_processing'
  )),
  version text not null,
  granted_at timestamptz,
  revoked_at timestamptz
);

create index consent_records_user_id_idx on consent_records (user_id);
