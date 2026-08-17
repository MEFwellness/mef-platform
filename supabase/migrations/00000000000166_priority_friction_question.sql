-- The friction question.
--
-- AUDIT-ADAPTIVE-REVEAL.md, 2.17: "the friction question does not exist for
-- the priority loop." Rule 7 requires that when an action is not completed
-- before a new one is assigned, the member is asked what got in the way.
-- Nothing asked. What existed instead was a silent counter: three
-- consecutive ignored days changed the FRAMING, two framing changes with no
-- response escalated to a coach and stopped offering it. The member was
-- never asked why.
--
-- This adds the asking. Four columns on the outcome ledger, because that is
-- where the rest of one decision's story already lives and a second table
-- would mean two places that could disagree about the same day.
--
--   friction_asked_at     when Root put the question in front of her
--   friction_reason       her tapped answer, from a closed set
--   friction_note         her own words, when she typed any
--   friction_answered_at  when she answered
--
-- The closed set is deliberately short and deliberately blameless. Every
-- option is a fact about the day or about the suggestion, and none of them
-- is a fact about her: there is no "did not feel like it" and there will
-- not be one. `something_else` is the escape hatch that keeps the list
-- short without forcing an answer that is not true.
--
-- Nothing here changes the existing guardrails. If she ignores the question
-- itself, `friction_answered_at` stays null and the engine's current silent
-- behaviour proceeds exactly as before. See lib/coaching-direction/friction.ts.

alter table member_coaching_decisions
  add column if not exists friction_asked_at timestamptz,
  add column if not exists friction_reason text,
  add column if not exists friction_note text,
  add column if not exists friction_answered_at timestamptz;

alter table member_coaching_decisions
  drop constraint if exists member_coaching_decisions_friction_reason_check;

alter table member_coaching_decisions
  add constraint member_coaching_decisions_friction_reason_check
  check (
    friction_reason is null
    or friction_reason in (
      'no_time',
      'too_hard',
      'forgot',
      'not_relevant',
      'something_else'
    )
  );

-- A note without a reason is not a valid answer: the tapped answer is what
-- the engine reads, and free text is additional colour for a coach. Enforced
-- rather than trusted, because the write path is a server action and a
-- future one could forget.
alter table member_coaching_decisions
  drop constraint if exists member_coaching_decisions_friction_note_requires_reason;

alter table member_coaching_decisions
  add constraint member_coaching_decisions_friction_note_requires_reason
  check (friction_note is null or friction_reason is not null);

comment on column member_coaching_decisions.friction_asked_at is
  'When Root asked the member what got in the way. Set once, on the day the ignore window closed, BEFORE any approach change: the question comes first, and the reword only happens if she does not answer.';

comment on column member_coaching_decisions.friction_reason is
  'Her tapped answer. A closed, blameless set: no_time, too_hard, forgot, not_relevant, something_else. Every option is a fact about the day or about the suggestion, never about her.';

comment on column member_coaching_decisions.friction_note is
  'Her own words, when she typed any. Read by a coach; the engine reads only friction_reason, so a free-text answer can never be parsed into a decision about her.';

comment on column member_coaching_decisions.friction_answered_at is
  'When she answered. Null after asking means she ignored the question itself, which is a real outcome: the engine then proceeds with its ordinary approach change exactly as it did before this existed.';

-- Members already hold read/insert/update on their own decisions (migration
-- 150). No new policy is needed and none is added: a narrower grant would
-- be a second, conflicting rule about the same rows.

create index if not exists member_coaching_decisions_friction_pending_idx
  on member_coaching_decisions (member_id, thread_key)
  where friction_asked_at is not null and friction_answered_at is null;
