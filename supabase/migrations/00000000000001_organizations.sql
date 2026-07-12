-- Architecture v2.1, Section B.1 — must exist before profiles.
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type text not null default 'individual'
    check (org_type in ('individual', 'corporate', 'clinical_partner')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table organizations is
  'Foundation, schema-only for corporate/clinical tenancy. Sprint 1 users have organization_id = null.';
