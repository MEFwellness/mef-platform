-- Architecture v2.1, Section B.1. granted_by / revoked_by are a Sprint 1
-- addition beyond the v2.1 minimal column set — needed for the admin
-- interface's "grant/revoke coach role" and audit trail requirement.
-- Not a scope expansion: it's implied by task 9 (admin can grant/revoke
-- roles) and task 10 (tests must prove non-self-assignment), which need to
-- know who performed the grant.
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null references roles(role),
  organization_id uuid references organizations(id),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id)
);

create index user_roles_active_idx on user_roles (user_id, role) where revoked_at is null;
