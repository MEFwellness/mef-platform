-- Architecture v2.1, Section C. These are the two database-layer functions
-- every RLS policy in this sprint is built on. SECURITY DEFINER with an
-- explicit, pinned search_path — required so the function can read
-- user_roles/roles regardless of the calling context, and so it cannot be
-- tricked by a caller manipulating search_path into resolving a
-- same-named object from an untrusted schema.

create or replace function public.has_active_role(p_user uuid, p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.role = ur.role
    where ur.user_id = p_user
      and ur.role = p_role
      and ur.revoked_at is null
      and r.activation_status = 'active'
  );
$$;

comment on function public.has_active_role is
  'True only if the user has a non-revoked grant AND the role itself is
   activation_status = active. A grant to an inactive role (e.g.
   clinician_reviewer in Sprint 1) is inert here regardless of application
   code — this is the actual enforcement point, not a UI check.';

create or replace function public.is_active_coach_for(p_coach uuid, p_client uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.coach_client_assignments
    where coach_id = p_coach
      and client_id = p_client
      and status = 'active'
      and (end_date is null or end_date >= current_date)
  );
$$;

-- Both functions are executable by authenticated users (policies call them
-- as the querying user), but not by anon.
revoke all on function public.has_active_role(uuid, text) from public;
revoke all on function public.is_active_coach_for(uuid, uuid) from public;
grant execute on function public.has_active_role(uuid, text) to authenticated, service_role;
grant execute on function public.is_active_coach_for(uuid, uuid) to authenticated, service_role;
