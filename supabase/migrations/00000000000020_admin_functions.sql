-- Sprint 1 task 9. SECURITY INVOKER — these rely entirely on the existing
-- platform_admin_all_user_roles / platform_admin_all_assignments RLS
-- policies (migration 16) to authorize the write. A non-admin calling
-- these functions gets a Postgres permission failure from the underlying
-- INSERT, not a bypass — the function adds validation, not privilege.

create or replace function public.grant_coach_role(p_target_user uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if exists (
    select 1 from user_roles
    where user_id = p_target_user and role = 'coach' and revoked_at is null
  ) then
    raise exception 'User % already has an active coach role grant', p_target_user;
  end if;

  insert into user_roles (user_id, role, granted_by, granted_at)
  values (p_target_user, 'coach', auth.uid(), now())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_coach_role(p_target_user uuid)
returns void
language plpgsql
as $$
begin
  update user_roles
  set revoked_at = now(), revoked_by = auth.uid()
  where user_id = p_target_user and role = 'coach' and revoked_at is null;
end;
$$;

create or replace function public.assign_client_to_coach(p_coach_id uuid, p_client_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_coach_id = p_client_id then
    raise exception 'A coach cannot be assigned as their own client';
  end if;

  if not exists (
    select 1 from user_roles
    where user_id = p_coach_id and role = 'coach' and revoked_at is null
  ) then
    raise exception 'Target user % does not have an active coach role grant', p_coach_id;
  end if;

  -- Superseding an existing active assignment for this client is an
  -- explicit two-step: revoke the old one, then create the new one. This
  -- function only creates; callers revoke first via revoke_assignment().
  if exists (
    select 1 from coach_client_assignments
    where client_id = p_client_id and status = 'active'
  ) then
    raise exception 'Client % already has an active coach assignment — revoke it first', p_client_id;
  end if;

  insert into coach_client_assignments (coach_id, client_id, assigned_by)
  values (p_coach_id, p_client_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revoke_assignment(p_assignment_id uuid, p_reason text)
returns void
language plpgsql
as $$
begin
  update coach_client_assignments
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revocation_reason = p_reason
  where id = p_assignment_id and status = 'active';
end;
$$;

grant execute on function public.grant_coach_role(uuid) to authenticated;
grant execute on function public.revoke_coach_role(uuid) to authenticated;
grant execute on function public.assign_client_to_coach(uuid, uuid) to authenticated;
grant execute on function public.revoke_assignment(uuid, text) to authenticated;
