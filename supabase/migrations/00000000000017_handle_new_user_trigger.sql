-- Architecture v2.1 / Sprint 1 task 5. Safe profile creation after signup.
-- Runs as SECURITY DEFINER (bypasses RLS by design — this is the one
-- legitimate write path into profiles and user_roles that isn't a direct
-- client call). The role is always hardcoded to 'member'; any role-like
-- value a client puts in signup metadata is ignored. This is the mechanism
-- behind "do not allow clients to choose elevated roles during registration."
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'timezone', 'America/New_York')
  );

  -- Hardcoded 'member' — never derived from client-supplied data.
  insert into public.user_roles (user_id, role, granted_at)
  values (new.id, 'member', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
