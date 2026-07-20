-- Membership Tiers.
--
-- There is no subscription/billing/plan data model in this codebase today
-- (see docs/DEPLOYMENT.md and Sprint 1's own README: "Roles / membership
-- structure" — access is entirely role-based via has_active_role(), and
-- app/membership/page.tsx is a static informational page, not backed by
-- any table). This migration adds the first tier catalog, purely additive
-- and inert until application code reads it — it does not touch
-- has_active_role(), user_roles, roles, or any existing RLS policy, so
-- current auth, coach access, and enrollment behavior are unaffected.
--
-- Same catalog-table shape/precedent as `roles` (migration 3): a small
-- text-keyed reference table, seeded once, read by any authenticated user.
create table membership_tiers (
  key text primary key,
  display_name text not null,
  -- Ordering for "does member meet minimum tier X" comparisons.
  rank int not null unique
);

insert into membership_tiers (key, display_name, rank) values
  ('free_trial', 'Free Trial', 0),
  ('membership', 'Membership', 1),
  ('holistic_reset', 'Holistic Reset', 2);

alter table membership_tiers enable row level security;

create policy authenticated_read_membership_tiers on membership_tiers
  for select
  using (auth.role() = 'authenticated');

create policy platform_admin_all_membership_tiers on membership_tiers
  for all
  using (public.has_active_role(auth.uid(), 'platform_administrator'));

-- Nullable, not required at signup — no assessment or feature reads this
-- column yet, so leaving it unset for a brand new profile breaks nothing.
-- Existing profiles are backfilled below to 'membership' (not 'free_trial'
-- or 'holistic_reset'): today every authenticated member already has full,
-- ungated access to every assessment and feature in the product (per the
-- inventory: "Gating is entirely role-based," no tier ever restricted
-- anyone). 'membership' is the middle tier — backfilling to it preserves
-- current real behavior without retroactively granting the top program
-- tier ('holistic_reset', which implies program enrollment nobody has) or
-- downgrading anyone to the trial tier. This is a product-facing default,
-- not a technical necessity; revisit if the actual member base skews
-- differently than this assumption.
alter table profiles
  add column membership_tier text references membership_tiers(key);

update profiles set membership_tier = 'membership' where membership_tier is null;

comment on column profiles.membership_tier is
  'Additive to role-based auth, not a replacement for it. Backfilled to
   membership for every pre-existing profile at migration time (see this
   migration''s own comment) to preserve current ungated behavior. Not yet
   read by any enforcement path — see lib/assessment-registry/membership.ts.';
