-- Sprint 1 task 11. Synthetic users only. Fixed UUIDs purely so the rest of
-- the seed files (and the tests) can reference them predictably.
--
-- Runs during `supabase db reset` as the postgres superuser, which bypasses
-- RLS by default — this is the correct, intended way to seed data; it is
-- not a path a real client can reach.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'member.one@example.test',
   crypt('DevPassword123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Member One","timezone":"America/New_York"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'member.two@example.test',
   crypt('DevPassword123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Member Two","timezone":"America/Los_Angeles"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'coach.one@example.test',
   crypt('DevPassword123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Coach One","timezone":"America/New_York"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'admin.one@example.test',
   crypt('DevPassword123!', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Admin One","timezone":"America/New_York"}',
   now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id, id::text,
       jsonb_build_object('sub', id::text, 'email', email),
       'email', now(), now(), now()
from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444'
);

-- handle_new_user() fired for each insert above, creating profiles +
-- a 'member' role grant for all four. Now layer on coach / admin roles.

insert into user_roles (user_id, role, granted_at)
values
  ('33333333-3333-3333-3333-333333333333', 'coach', now()),
  ('44444444-4444-4444-4444-444444444444', 'platform_administrator', now());
