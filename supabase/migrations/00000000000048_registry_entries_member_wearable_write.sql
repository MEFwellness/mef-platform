-- registry_entries deliberately had no member insert/update policy at all
-- (migration 40's own docblock: "a member never authors or mutates a
-- registry entry directly in this milestone — only the coach-triggered
-- publish orchestration... and future server-side adapters write here").
-- Wearable sync is exactly the future adapter that migration anticipated,
-- but unlike body-assessment/coach-intelligence findings (which require a
-- coach review gate before they're trustworthy), a member's own passive
-- biometric sync has no coach-approval step at all — it runs entirely
-- under the member's own session (app/actions/wearables.ts,
-- app/api/cron/wearable-daily's service-role job is the only other
-- writer). Scoped narrowly to domain='wearable' and
-- source_feature='wearable_daily_metric' so a member still can never
-- write a posture/breathing/nutrition/etc. registry entry directly — only
-- their own wearable-derived metrics.
create policy member_insert_own_wearable_registry_entries on registry_entries
  for insert
  with check (
    member_id = auth.uid()
    and domain = 'wearable'
    and source_feature = 'wearable_daily_metric'
  );

-- Needed for the adapter's own supersede step (lib/registry/adapters/wearables.ts
-- marks yesterday's entry status='superseded' when today's sync writes a
-- fresh one for the same code) — same narrow domain scoping as the insert
-- policy above.
create policy member_update_own_wearable_registry_entries on registry_entries
  for update
  using (member_id = auth.uid() and domain = 'wearable')
  with check (member_id = auth.uid() and domain = 'wearable');
