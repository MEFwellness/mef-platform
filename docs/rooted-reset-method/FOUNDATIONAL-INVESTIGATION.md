# The Foundational Investigation — Design Specification

**Prompt 3 deliverable — architecture only (no questions, no schema, no code)**
MEF Wellness · Governed by [The Rooted Reset Method, v2](./METHODOLOGY.md)
Status: **draft, pending approval before Prompt 4**

---

## How to read this document

This document does not modify the Rooted Reset Method. It designs the first thing built *under*
it: the **Foundational Investigation**, the single mandatory Core Investigation every member
completes at Stage 1 of the Coaching Journey (Method v2 §4), and the instrument that produces the
Root Model's first Signals for all twelve Coaching Domains (§5) at once.

Every design decision below cites either the Method (§ references are to `METHODOLOGY.md` v2) or
real, already-shipped platform code — this spec treats both as constraints, not suggestions.
Where no real system exists yet to build on, that's stated explicitly rather than invented.

**What already exists that this spec builds on, not around:**

| System | What it gives this spec |
|---|---|
| `onboarding_submissions` / `onboarding_answers` / `onboarding_questions` (`lib/onboarding/baseline.ts`) | The engine the Foundational Investigation evolves, not replaces — five answer types (numeric, enum, multi_select, boolean, free_text), and three non-answer statuses (`not_sure`, `not_applicable`, `prefer_not_to_answer`) already built into the schema. |
| `DOMAIN_ORDER` (`lib/onboarding/baseline.ts`) | The five existing visible clusters (`sleep`, `mind_stress`, `movement_energy`, `nutrition_digestion`, `pain_structural`) this spec's member-facing grouping extends rather than discards. |
| `root_score_snapshots.root_confidence_level` (migration `00000000000061`) | An existing, real four-level confidence vocabulary — `building` / `low` / `moderate` / `high` — reused directly below instead of inventing a new one. |
| Assessment Registry (`lib/assessment-registry/registry.ts`) | The six live Focused-Investigation-candidate engines (Onboarding Assessment, Nutrition & Lifestyle Questionnaire, Four Doctors Assessment, Primal Pattern Diet Type, Body Assessment, Short Health Assessment Questionnaire) this spec's Root Router logic escalates into. |
| `checkpoint_label` / `onboarding_baselines` (migrations `00000000000011`, `00000000000025`) | The dormant 30/90-day reassessment cadence Method v2 §9 and Recommendation 4 already flagged — this spec does not re-solve it, only notes where it will eventually matter. |
| `onboarding_questions.primary_concern` (migration `00000000000068`) | An existing goal/concern enum — a partial seed for Purpose & Motivation, but *what* someone wants to work on, not *why* it matters to them, which is the gap this spec's "You & Why You're Here" moment (§4 below) is designed to close. |
| Coaching Safety system — `safety_classifications` / `safety_review_queue` (Coach Review Queue) / `lib/intelligence/safety.ts`'s `AREA_TO_RESTRICTED_TOPICS` (migration `00000000000028`) | The real, already-live escalation path for anything safety-relevant. This spec routes safety flags into that system rather than proposing a second one. |

---

## 1. Purpose

The Foundational Investigation is the member's first encounter with the Method — and the Method's
first encounter with the member. Per Method v2 §4 (Stage 1) and §6, it is the one universal, light,
breadth-over-depth instrument every member completes before anything else, and it exists to do
exactly three things at once:

1. **Seed the Root Model.** Write at least one Signal into every one of the twelve Coaching
   Domains (§5), so no domain starts the relationship as a total unknown.
2. **Give the Root Router its first real decision.** Provide enough Priority and Confidence
   signal, per domain, that the Root Router (§7 of the Method) can answer "what are we trying to
   understand next?" without guessing.
3. **Establish the Method's voice.** Be the member's first experience of curiosity over diagnosis
   (Method v2 §1, conviction 4 and "note on stance") — so the tone of everything that follows is
   already set correctly.

It is explicitly **not** trying to reach a conclusion about the member. Per the new Method v2
principle in §3 — every investigation must reduce uncertainty — its job is to reduce uncertainty
*evenly and broadly*, not to resolve any one domain. Depth is Focused Investigations' job (Method
§6), not this one's.

It replaces, functionally, today's Onboarding Assessment (`app/onboarding/`) — the same slot in
the member journey, evolved to the Method's twelve-domain resolution instead of today's five.

---

## 2. Success criteria

The Foundational Investigation is working if, at completion:

- **Every domain has at least one Signal.** No domain enters the Root Model as literally empty —
  including the four domains with no existing instrumentation (Identity & Self-Concept, Purpose &
  Motivation, Relationships & Social Connection, Environment & Daily Rhythm; Method §5). A blank
  domain is a design failure, not an acceptable gap.
- **Every domain has an assigned initial Confidence.** Never "unknown" — always at least
  `building` (§6 below).
- **The Root Router can produce one confident first recommendation** without asking the member
  anything further first.
- **The member's stated goal/concern is captured in their own words**, not just an enum pick —
  Purpose is load-bearing (Method principle 7), not decorative, from the very first investigation.
- **No domain was silently skipped by design.** The four uninstrumented domains still get a light
  Signal even though the Method has no Focused Investigation to escalate them into yet (§7 edge
  case below).
- **Completion time stays inside the target window** (§5) — breadth, not endurance.
- **The member's stated emotional exit state is "understood," not "interrogated.”** This is a
  design constraint on tone and pacing (§8), not just an aspiration.

---

## 3. Coaching questions answered

The Foundational Investigation exists to answer these questions — for the Root Model, not for the
member to see phrased this way:

1. **Which domains currently show something worth watching, and which are currently quiet?**
   The raw input to Priority (§6, §7).
2. **Is the member's regulation capacity (stress, sleep, nervous system) currently stable enough
   to safely optimize elsewhere?** The first real test of Method conviction 2 ("regulate before
   you optimize") for this specific member.
3. **What is the member's current Capacity** (Method v2 §2 — nervous-system, logistical, emotional
   bandwidth) **for taking on coaching load right now?** Distinct from Priority: gates how hard the
   Root Router should push, even into a high-priority domain.
4. **What is the member's stated "why," in their own words** — even before Purpose & Motivation has
   a real Focused Investigation to go deeper with?
5. **Is there anything safety-relevant that should override normal sequencing** and route straight
   into the existing Coaching Safety system (`safety_classifications` / Coach Review Queue) rather
   than into a standard next-investigation or Experiment recommendation?
6. **Where is Confidence lowest in a way that matters** — i.e., which domain's uncertainty, if
   reduced next, would most change what the Method recommends? (Method principle 5.)

---

## 4. Domain coverage

All twelve Coaching Domains are touched. To keep the *member-facing* shape simple — and to reuse,
not discard, the existing five-cluster UI pattern (`DOMAIN_ORDER`) — the twelve domains are grouped
into **five visible moments**, matching the Method's own "many-to-one" mapping philosophy (§5):
existing clusters stay intact, and the four uninstrumented domains are folded into whichever moment
they fit best thematically, rather than inventing a sixth visible section.

| Moment (member-facing) | Coaching Domains inside | Existing cluster | Light-touch items (proposed budget) |
|---|---|---|---|
| **Body & Movement** | Movement & Physical Capacity · Recovery & Energy Regulation · Pain & Structural Integrity | `movement_energy`, `pain_structural` | 1–2 per domain (3–6 total) |
| **Sleep & Rhythm** | Sleep & Circadian Rhythm · Environment & Daily Rhythm *(New)* | `sleep` | 1–2 per domain (2–4 total) |
| **Mind & Stress** | Stress & Nervous System Regulation · Emotional Resilience & Mood | `mind_stress` | 1–2 per domain (2–4 total) |
| **Nutrition & Digestion** | Nutrition & Metabolic Health · Digestion & Gut Health | `nutrition_digestion` | 1–2 per domain (2–4 total) |
| **You & Why You're Here** | Identity & Self-Concept *(New)* · Purpose & Motivation *(New)* · Relationships & Social Connection *(New)* | *(none — net-new)* | 1–2 per domain (3–6 total) |

This yields roughly **15–20 total light-touch items** across all five moments plus one or two
short open reflection prompts (§5) — deliberately fewer than today's Onboarding Assessment's
question count despite covering more domains (twelve vs. five), because each item is designed to
be answerable in a single tap or a short phrase, not a deep-dive question. This is a real product
reduction from today's instrument and is flagged for explicit sign-off in the closing
Recommendations.

**Why "You & Why You're Here" matters most here:** these three domains have zero existing
instrumentation anywhere on the platform (Method §5, Recommendation 2). The Foundational
Investigation is the *only* place they get any Signal at all until Prompt 2+ builds their Focused
Investigations — see the Root Router edge case in §7.

---

## 5. Investigation flow

**Structure:** Welcome → brief framing → five moments (any order the member prefers within
reason, default order as tabled in §4) → one or two short open reflection prompts → completion.

**Default moment order** runs from lowest-friction/most-affirming to more specific, ending on the
member's own words:
`You & Why You're Here` (warm open, sets relational tone) → `Sleep & Rhythm` → `Mind & Stress` →
`Body & Movement` → `Nutrition & Digestion` → closing reflection prompts.

Leading with "You & Why You're Here" is a deliberate coaching choice, not an arbitrary ordering:
it means the member's first substantive interaction with the Method is being asked who they are
and why they're here — not a body-systems checklist — which is the concrete expression of Method
conviction 4 (curiosity as method) applied to sequencing itself.

**Ideal completion time: 8–10 minutes, hard ceiling 12.** This is intentionally faster than
today's ~15-minute Onboarding Assessment (`estimatedMinutes: 15` in the Assessment Registry)
despite covering more than double the domain resolution (twelve vs. five), because breadth-first
items are lighter per item, not because there are fewer moments to get through.

**Progress experience:** no bare numeric counter ("Question 7 of 22"). Progress is shown as
moment-level ("You & Why You're Here" → "Sleep & Rhythm" → …), five soft steps, not fifteen-plus
question ticks — consistent with §8's premium, conversational framing.

**Skippability:** every item accepts the existing `not_sure` / `not_applicable` /
`prefer_not_to_answer` statuses already modeled in `onboarding_answers`. This is the mechanism by
which uncertainty gets represented honestly (§6) rather than forcing a guess.

---

## 6. Root Model outputs

For each of the twelve domains, the Foundational Investigation writes:

- **One or more Signals** (raw values, in the Method's vocabulary — Method v2 §2), never
  pre-aggregated into a false Pattern.
- **An initial Priority classification** — a plain three-value read: *quiet*, *worth watching*, or
  *needs attention now* — derived from signal content and any safety-flag hit (§7).
- **An initial Confidence level**, reusing the platform's existing four-value vocabulary
  (`root_score_snapshots.root_confidence_level`): `building`, `low`, `moderate`, `high`.
- **A Capacity reading** — one light self-report of current bandwidth, feeding the Root Router's
  pacing decision (Method conviction 2), not any single domain.
- **The member's own words** for at least Purpose & Motivation, captured verbatim as a narrative
  signal, not reduced to an enum.

**Confidence is capped low by design, almost everywhere, on purpose.** Per the Method's own
definition (v2 §2), a Pattern requires recurrence or clustering — something a single light-touch
pass structurally cannot yet establish. So for nearly every domain, the honest initial Confidence
is `building`, occasionally `low` if a signal is unusually specific or corroborated by more than
one item within the same domain. `moderate` or `high` confidence is not a realistic Foundational
Investigation output and the design should not manufacture it. The one exception is
**Priority**, not Confidence: a single severe or safety-relevant signal can justify *needs
attention now* Priority immediately, even while Confidence about the full picture stays `building`
— severity of a single data point and certainty about the whole domain are different axes, and the
Root Model should never conflate them.

**How uncertainty is represented, concretely:**
- A domain answered fully but lightly → `building` confidence, normal Priority path.
- A domain with one or more `not_sure` / `prefer_not_to_answer` responses → confidence stays at
  its floor (`building`) and this is recorded as *itself* informative — a domain the member isn't
  sure about, or isn't ready to discuss yet, is a real signal for the Root Router's next-question
  choice, not a gap to paper over.
- A domain left entirely untouched (abandonment — see §10) → recorded as genuinely unknown, never
  defaulted to "quiet"/fine. An unanswered domain must never be silently treated as a good sign.

---

## 7. Root Router decision logic

The Root Router consumes the Foundational Investigation's output and answers, per Method v2 §7,
**"what are we trying to understand next?"** — following the Method's existing five-step decision
order (safety gate → priority → recency decay → member agency → coach override), applied here for
the very first time in a member's journey.

**Step 0 — Safety gate (before anything else).** Any Foundational Investigation item that touches
an area with a real mapping in the existing Coaching Safety system's
`AREA_TO_RESTRICTED_TOPICS` (today: `pain` → `pain_severity`/`urgent_symptom`, `mood` →
`self_harm`) is evaluated against that system, not against Root Router priority logic. A hit
routes into `safety_classifications` and the Coach Review Queue exactly as the platform's existing
Intelligence Engine safety integration already does — this spec adds no second escalation path.
While a safety classification is open, the Root Router does not recommend a Lifestyle Experiment
in that domain, full stop.

**Steps 1–5 — everything else**, evaluated per domain, produce one of three actions:

| Condition | Action | Why |
|---|---|---|
| Domain's Priority is *needs attention now* or *worth watching*, **and** a live Focused Investigation maps to it | **Trigger a Focused Investigation** | The domain has both signal and somewhere real to send the member — investigating further would materially reduce uncertainty (Method principle 5). |
| Domain shows a specific, mild, already-actionable friction with a well-understood fix | **Recommend a Lifestyle Experiment first** | Per Method principle 6, a deeper instrument wouldn't change what's already clear enough to act on — going straight to a small, reversible Experiment respects principle 5 (don't investigate what won't change the action). |
| Domain reads *quiet*, **or** no live Focused Investigation exists for it yet | **Continue observation via the Whole-Person Check-in / Daily Check-ins** | Either nothing is currently wrong, or nothing exists to escalate into — in both cases, recency decay (Method §7, step 3) is what eventually re-surfaces the domain, not a forced instrument that doesn't exist. |

**Concrete domain → Focused Investigation mapping**, using the live Assessment Registry:

| Domain | Escalates to (if flagged) |
|---|---|
| Pain & Structural Integrity | Body Assessment (camera-based, coach-reviewed) |
| Movement & Physical Capacity, Recovery & Energy Regulation | Four Doctors Assessment |
| Nutrition & Metabolic Health, Digestion & Gut Health | Nutrition & Lifestyle Questionnaire, or the Short Health Assessment Questionnaire where breadth across several flagged domains at once is more useful than one deep pass |
| Stress & Nervous System Regulation, Emotional Resilience & Mood, Sleep & Circadian Rhythm | Short Health Assessment Questionnaire — the only live instrument with matching categories (stress, sleep, energy, focus) today; there is no dedicated single-domain instrument for stress or sleep alone yet |
| Identity & Self-Concept, Purpose & Motivation, Relationships & Social Connection, Environment & Daily Rhythm | **None exist.** These domains can only ever resolve to the Whole-Person Check-in tier until Prompt 2+ builds their Focused Investigations (Method §5, Recommendation 2). |

**The Root Router presents exactly one primary recommendation to the member**, in the Method's
coach voice (§8 below), while logging its full internal ranking for the coach view (§9) — this
mirrors Method §7's "member agency" step: the system's full reasoning stays available even though
only one thing is surfaced at a time.

---

## 8. Member experience

Tone throughout: conversational, warm, curiosity-forward, in the Method's own voice (v2 §1 "note
on stance") — "what we're noticing," "worth watching," never "you have" or a raw score.

**Welcome.** Frames the Foundational Investigation as the start of an ongoing relationship, not a
form: something closer to "let's get to know each other" than "let's assess you." Sets the
expectation explicitly — a handful of short moments, not a long intake.

**Introduction.** One short screen explaining what's about to happen and why it's short on
purpose: "We're not trying to figure everything out today — just enough to know where to start."
This is the member-facing translation of "breadth before depth" (§1).

**Progress experience.** Five soft moment-level steps (§5), never a bare question counter. Each
moment transition briefly affirms what was just shared before moving on — a small acknowledgment,
not a summary dump.

**Completion screen.** Warm, immediate, and forward-looking: thanks the member, sets the
expectation that this is a first impression that "gets sharper as we go" (directly operationalizing
Method v2's "held loosely, not scored" stance), and previews that their Root Map is ready.

**Initial Root Map.** Organized by **Priority**, not raw Confidence — "what stood out" and "what's
looking steady" — never a five-domain (or twelve-domain) grid of numbers. Confidence language is
reserved for one reassuring meta-message rather than a per-domain meter, since at this stage
almost every domain is honestly `building`; showing that as a number everywhere would read as
"we don't know anything about you yet," which is true but not useful or encouraging to state
domain-by-domain.

**"What we understand so far."** Two to four plain-language bullets synthesizing the domains with
the clearest signal — written as observations, not conclusions ("Sounds like mornings are your
steadiest time" rather than "Movement domain: moderate").

**"What we're still learning."** An explicit, positively-framed list of what's still open —
presented as genuine curiosity (Method conviction 4), not as an admission of missing data. This is
where the four uninstrumented domains show up honestly: named as things the Method is looking
forward to understanding, not hidden because there's no instrument for them yet.

**Why the next investigation was selected.** One clear, specific sentence connecting something the
member actually shared to the specific next step — never "the algorithm recommends this." E.g.,
grounded in what they said about sleep or energy, not a generic "here's what's next."

---

## 9. Coach experience

The coach's view is the same underlying Root Model, shown with full precision — this is where
Method principle 9 ("coaches amplified, not replaced") is realized structurally: the coach sees
everything the member's softened view intentionally doesn't.

- **Root Model summary.** All twelve domains, one line each: Signal(s) captured, Priority, and
  Confidence — using the real `building`/`low`/`moderate`/`high` vocabulary directly, unsoftened.
- **Root Map.** The same visual concept as the member's, denser — includes the four uninstrumented
  domains explicitly marked as such, not omitted.
- **Confidence by domain.** Explicit for all twelve, including the near-universal `building` read
  — so a coach immediately understands this is day one, not a sparse or broken read.
- **Highest-priority coaching opportunities.** A ranked list with the specific signal(s) behind
  each ranking — the coach sees *why*, not just the order.
- **Recommended next investigation.** The Root Router's top pick, plus the fuller ranked
  alternates it considered (§7) — so a coach can override with context the algorithm doesn't have,
  consistent with the Method's coach-override step.
- **Suggested lifestyle experiment (if applicable).** Shown with its rationale and a guardrail
  check against the existing two-concurrent-experiment cap (Method §8) — the coach never sees a
  suggestion that would silently violate it.
- **Safety flags, if any, surface first and separately** — routed through the existing Coach
  Review Queue, not buried inside the general Root Model summary.

---

## 10. Edge cases

- **Heavy use of `not_sure` / `prefer_not_to_answer`.** Confidence stays at its floor across many
  domains by design (§6) — the Root Router does not stall waiting for a stronger signal. It falls
  back to recommending the Whole-Person Check-in as the safe default action, and flags to the coach
  that this member's Foundational read was unusually low-signal overall, which is itself
  coaching-relevant information, not a system failure.
- **A safety-relevant response.** Short-circuits everything else (§7, Step 0) into the existing
  Coaching Safety system. This spec does not invent new escalation behavior — only routes into
  what already exists.
- **Mid-investigation abandonment.** Untouched domains are recorded as genuinely unknown, never
  defaulted to "quiet." A missing domain must never be scored as a good sign purely because nothing
  was said.
- **Internally inconsistent answers** (e.g., sleep rated great alongside a severe-fatigue signal
  elsewhere). The Root Model does not silently reconcile this. Per the Investigation contract's
  "narrative/qualitative observation" contribution type (Method §6), a real contradiction is
  surfaced to the coach as its own flag, not averaged away.
- **The four uninstrumented domains, regardless of what's found.** Even a strong, specific signal
  in Identity, Purpose, Relationships, or Environment can never trigger "another investigation" —
  there isn't one yet. The Root Router must treat "no instrument exists" as a distinct case from
  "investigation not currently warranted," not conflate them, or a strong finding in these domains
  will look to the member like it was ignored.
- **Reassessing the Foundational Investigation later.** Out of scope for this spec by design —
  per `lib/onboarding/baseline.ts`, a member's baseline is always their *earliest* submission and
  is never overwritten; ongoing signal after day one is the Whole-Person Check-in and Reassessment
  framework's job (Method §9), not a repeat of the Foundational Investigation itself. Flagged, not
  solved, here.

---

## 11. Future expansion recommendations

- Once Identity, Purpose, Relationships, and Environment get real Focused Investigations
  (Method Recommendation 2), revisit this instrument's light-touch items for those four domains so
  they don't duplicate what the new Focused Investigation will also ask — a direct application of
  "earn the next question" (Method principle 4) to the Foundational Investigation's own design,
  not just to what comes after it.
- Consider a lighter "Renewal" variant of this instrument (Method §10) for a member re-entering
  Discovery in a single domain after a life event — same light-touch pattern, scoped to one moment
  instead of all five, rather than a separate instrument built from scratch.
- Once the Whole-Person Check-in ships, revisit whether domains that read `quiet` at Foundational
  time should get a lighter check-in cadence than domains that read `worth watching` — an adaptive
  cadence rather than one uniform rhythm for every domain.
- Consider versioning the Foundational Investigation the same way the other five live engines are
  versioned in the Assessment Registry (`currentVersion`, `versionLockingRequired`), so its
  light-touch item set can evolve without breaking historical baseline comparability.

---

## Recommendations before the actual investigation is written

1. **Approve the five-moment visible grouping in §4** (Body & Movement / Sleep & Rhythm / Mind &
   Stress / Nutrition & Digestion / You & Why You're Here), including which existing cluster each
   New domain gets folded into. This is a real UI-structure decision and Prompt 4 needs it settled
   before writing items.

2. **Confirm the Foundational Investigation stays inside the existing `onboarding_submissions` /
   `onboarding_answers` / `onboarding_questions` tables**, evolved rather than replaced — this spec
   assumes that (lowest risk, consistent with the Assessment Registry's own description of the
   Onboarding Assessment as supporting "unlimited reassessments"), but Prompt 4 needs this
   explicitly confirmed before it can define answer types per item.

3. **Confirm the 8–10 minute / 15–20 item target explicitly.** This is a real reduction in question
   count from today's instrument (in exchange for more than doubled domain resolution) and may
   warrant product sign-off before Prompt 4 writes to that budget.

4. **Decide the concrete safety-flag trigger values.** This spec establishes *that* certain
   responses must route into the existing Coaching Safety system (§7) and reuses its existing
   `pain` / `mood` area mapping, but which specific item and which specific answer value counts as
   a trigger is a question-writing-time decision Prompt 4 owns, not an architecture-time one.

5. **Confirm whether Capacity gets its own explicit light-touch item** (this spec assumes yes — one
   simple bandwidth self-report) or is inferred only from existing stress/sleep signals. This
   changes the domain coverage item count in §4 and should be settled before Prompt 4.

6. **Decide the exact language for the member-facing Confidence meta-message** in §8 (the single
   reassuring "this gets sharper as we go" line) — copywriting detail, but one that materially
   affects whether the completion experience feels premium or clinical, so it's worth a deliberate
   pass rather than treating it as filler text in Prompt 4.

---

*End of Prompt 3 deliverable. Awaiting approval before Prompt 4.*
