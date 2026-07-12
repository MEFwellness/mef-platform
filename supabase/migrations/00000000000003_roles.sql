-- Architecture v2.1, Section B.1. All seven roles exist now; only three are
-- active in Sprint 1. activation_status is the database-layer gate that
-- makes an inactive role inert regardless of what a client sends.
create table roles (
  role text primary key,
  activation_status text not null default 'inactive'
    check (activation_status in ('active', 'inactive'))
);

insert into roles (role, activation_status) values
  ('member', 'active'),
  ('coach', 'active'),
  ('platform_administrator', 'active'),
  ('clinician_reviewer', 'inactive'),
  ('corporate_administrator', 'inactive'),
  ('organization_administrator', 'inactive'),
  ('api_client', 'inactive');
