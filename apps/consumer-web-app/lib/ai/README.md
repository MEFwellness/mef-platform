# AI Coaching Engine Foundation

Infrastructure for a coaching intelligence system, not a chatbot. Every
recommendation this system produces must reference the real member data
that caused it (`supporting_data` on every insight/recommendation/action).
Nothing here calls an external AI provider yet — see "What's deliberately
not built yet" below.

## How data flows

```
event happens (a check-in, an onboarding submission, a coach note...)
  -> lib/ai/events.ts        emitAndDispatch() writes an ai_events row,
                              then calls the dispatcher inline
  -> lib/ai/dispatcher.ts    finds which enabled agents respond to this
                              event type (lib/ai/agents/registry.ts),
                              loads active rules for each, runs the
                              deterministic rules engine
  -> lib/ai/rules/           facts.ts turns real check-in history into
                              named facts; engine.ts evaluates each
                              rule's condition tree against those facts
  -> lib/ai/agents/*.ts      each responding agent converts its own rule
                              matches into insight/recommendation/action
                              drafts, plus whatever extra deterministic
                              logic it owns beyond what a simple rule can
                              express (reusing lib/wellness/* and
                              lib/onboarding/* calculations directly —
                              never re-deriving a score a second way)
  -> lib/ai/data.ts          the dispatcher persists each drafted item:
                              insight -> recommendation -> action, in that
                              order, each linked to the one before it
  -> lib/ai/memory.ts        before persisting an action, the dispatcher
                              checks wasRecentlyActioned() so the same
                              agent+action_type doesn't fire again for the
                              same member within its cooldown window
```

Database schema: `supabase/migrations/00000000000027_ai_infrastructure.sql`.
Seeded agent registry + the three example rules from the milestone brief:
`supabase/seed/04_ai_agents_and_rules.sql`.

## Adding a new agent

1. Create `lib/ai/agents/<name>.ts` implementing `AiAgentDefinition`
   (`key`, `respondsTo`, `handle()`).
2. Add it to `AGENT_DEFINITIONS` in `lib/ai/agents/registry.ts`.
3. Add a row to `ai_agents` (a migration, or an admin surface once one
   exists) so `enabled` has somewhere to live.

Nothing else changes — the dispatcher, every existing agent, and the
rules engine are untouched. This is the "new agents can be added without
changing the existing system" requirement the milestone asked for.

## Adding a new deterministic rule

Insert a row into `ai_rules` (`rule_key`, `agent_key`,
`trigger_event_types`, `conditions`, `produces`). No code change needed —
`lib/ai/rules/engine.ts` interprets `conditions`/`produces` as data. See
the three seeded rules in `supabase/seed/04_ai_agents_and_rules.sql` for
the condition grammar (`{ fact, operator, value }` leaves combined with
`{ all: [...] }` / `{ any: [...] }`) and the `produces` shape
(`insightType`, `actionType`, `title`, `descriptionTemplate` with
`{{fact}}` placeholders, `confidence`, `requiresCoachApproval`).

## What's deliberately not built yet

- **No LLM provider is wired up.** `lib/ai/providers/` is an interface +
  a registry of `UnconfiguredProvider` stubs that throw if called. Wiring
  a real provider means implementing `AiProvider` and calling
  `registerProvider()` — no other file changes.
- **No prompt template content.** `ai_prompt_templates` exists with zero
  seeded rows; `content` defaults to `''`.
- **No background worker.** `dispatchEvent()` runs inline, synchronously,
  right after `emitAiEvent()` — there's no queue consumer process in this
  stack. `ai_events.processed_at` is already nullable and already gets
  set at the end of a successful dispatch specifically so a future worker
  can `select * from ai_events where processed_at is null` and this
  function barely changes, only who calls it does.
- **No scheduled/cron-triggered events.** Every event this milestone
  actually emits is triggered by a member or coach taking an action
  (check-in, onboarding, a coach note). Events that describe _absence_ of
  action (`member_missed_checkin`, `member_inactive`) are defined in the
  schema and agents already subscribe to them, but nothing emits them —
  that needs a scheduled job this milestone doesn't build. The
  `missed_checkins_accountability` rule is seeded and wired to fire
  opportunistically off the events that do exist (a check-in or a coach
  note gives the dispatcher a reason to load recent history anyway), but
  full correctness (catching a member who never comes back at all) needs
  that future scheduled job.
- **No admin UI.** `ai_agents.enabled`/`config` and `ai_actions`'
  approval workflow exist in the schema and RLS already supports a coach
  updating a pending action's approval state — no page reads or writes
  any of it yet.
- **No conversations, no coaching messages.** Everything this system
  produces today is a structured row in `ai_insights`/`ai_recommendations`/
  `ai_actions`. Nothing renders it to a member or coach yet.
