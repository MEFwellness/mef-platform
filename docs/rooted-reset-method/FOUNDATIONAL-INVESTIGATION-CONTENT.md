# The Foundational Investigation — Complete Content Specification

**Prompt 4 deliverable — every question, answer option, branching rule, confidence logic, Root
Model output, Root Router output, coach output, member-facing copy, and completion experience.**
MEF Wellness · Governed by [The Rooted Reset Method, v2](./METHODOLOGY.md) and
[the Foundational Investigation architecture](./FOUNDATIONAL-INVESTIGATION.md) (Prompt 3, approved)
Status: **draft, ready for implementation review**

No code, migrations, or schema changes are included here — this is content and logic, in the same
spirit as Prompts 1–3. Where a real implementation choice is genuinely open (e.g. how this content
lands in `onboarding_assessment_versions`), it's flagged as a **Note for Prompt 5**, not decided
here.

---

## 0. Decisions carried forward from Prompt 3

Prompt 3 closed with six open recommendations. Approval to proceed to Prompt 4 is taken as approval
to proceed with the recommended default on each, restated here so any of them can still be
overridden before implementation:

1. **Five-moment grouping** — used as designed (§1 below).
2. **Stays inside `onboarding_submissions` / `onboarding_answers` / `onboarding_questions`** —
   assumed; see the Note for Prompt 5 in §1 on how the *new* content actually lands in those
   tables.
3. **8–10 minute target, 15–20 item budget** — the real item count below is **19 universal items**
   (see §1's "what's reused vs. new" — this is slightly higher than the estimate, and the reason is
   explained there, not glossed over).
4. **Concrete safety-flag trigger values** — defined in §3.
5. **Capacity gets its own explicit item** — done (`capacity_bandwidth`, §1/§2).
6. **Confidence meta-message copy** — written in §8.

---

## 1. What's reused vs. what's new

Per Prompt 3 Recommendation 2, this **evolves** the live Onboarding Assessment
(`onboarding_questions`, `assessment_version = 1`) rather than replacing it. All twelve of today's
live questions are kept, verbatim, with their existing `question_key`, `prompt_text`,
`answer_type`, and `allowed_values` unchanged. What changes is (a) which of the Method's twelve
Coaching Domains each one is understood to inform, resolved at the application layer, and (b) nine
new questions filling the gaps the current instrument has no coverage for at all.

**Per Method Recommendation 1, the stored `domain` column on every row — kept or new — is left
using today's five cluster values (`sleep`, `mind_stress`, `movement_energy`,
`nutrition_digestion`, `pain_structural`, or `all` for cluster-less items) exactly as `baseline.ts`
already handles.** The real twelve-domain resolution below is a second, coaching-layer mapping by
`question_key`, kept separate from the database column — no schema change, no stored-enum
expansion, exactly as Recommendation 1 called for.

| Existing question (unchanged) | Stored `domain` (unchanged) | Coaching Domain (new, app-layer) |
|---|---|---|
| `primary_concern` | `all` | Purpose & Motivation |
| `baseline_sleep_quality` | `sleep` | Sleep & Circadian Rhythm |
| `baseline_sleep_hours` | `sleep` | Sleep & Circadian Rhythm |
| `baseline_stress_level` | `mind_stress` | Stress & Nervous System Regulation |
| `baseline_energy_level` | `movement_energy` | Recovery & Energy Regulation |
| `baseline_digestion` | `nutrition_digestion` | Digestion & Gut Health |
| `baseline_pain_areas` | `pain_structural` | Pain & Structural Integrity |
| `baseline_movement_frequency` | `movement_energy` | Movement & Physical Capacity |
| `baseline_goals` | `all` | Purpose & Motivation |
| `readiness_importance` | `mind_stress` | Purpose & Motivation |
| `readiness_confidence` | `mind_stress` | Identity & Self-Concept |
| `readiness_actively_working` | `mind_stress` | Purpose & Motivation |

**Nine new questions**, filling every domain the existing twelve don't touch at all (Emotional
Resilience & Mood, Environment & Daily Rhythm, Relationships & Social Connection, Nutrition &
Metabolic Health, and Identity & Self-Concept's thin single-item coverage), plus Capacity (a
cross-domain read, not one of the twelve domains itself — Method v2 §2), plus the pain-severity
branch this domain currently lacks entirely (today's instrument records *where* it hurts but never
*how much*):

| New question | Stored `domain` | Coaching Domain / concept |
|---|---|---|
| `identity_prior_attempts` | `all` | Identity & Self-Concept |
| `support_network` | `all` | Relationships & Social Connection |
| `daily_light_outdoor_time` | `sleep` | Environment & Daily Rhythm |
| `mood_pattern` | `mind_stress` | Emotional Resilience & Mood |
| `eating_pattern` | `nutrition_digestion` | Nutrition & Metabolic Health |
| `pain_impact_severity` *(conditional)* | `pain_structural` | Pain & Structural Integrity |
| `pain_duration` *(conditional)* | `pain_structural` | Pain & Structural Integrity |
| `pain_coach_followup_consent` *(conditional)* | `pain_structural` | Pain & Structural Integrity |
| `capacity_bandwidth` | `all` | Capacity |
| `closing_anything_else` | `all` | *(free, unrouted — coach context only)* |

**Total: 12 kept + 7 new universal + 2 conditional (shown only when pain is present/moderate-or-worse) + 1 closing reflection = 19 universal items, up to 2 conditional, 1 optional closing.**
This is above the 15–20 estimate's low end but inside its range at the top — the honest reason is
that all twelve existing questions earned their place (each maps cleanly to exactly one domain, none
are redundant with a new item), so nothing was cut just to hit a number. This is flagged again in
§11 as a deliberate, explained deviation rather than a silent overshoot.

**Note for Prompt 5:** how this content actually lands in `onboarding_assessment_versions` /
`onboarding_questions` — editing `assessment_version = 1` in place (as migration
`00000000000068` already did for `primary_concern`'s options) versus introducing
`assessment_version = 2` with fresh rows for every question, including re-inserted kept ones (since
`unique(question_key, question_version)` means a kept row can't be shared byte-for-byte across two
`assessment_version_id`s without a version bump) — is an implementation decision, not resolved
here.

---

## 2. The complete question set

Organized by the five visible moments, in default flow order (Prompt 3 §5), followed by the
Capacity coda and closing reflection. `✓/✓/✓` in the skip column means all three of
`allows_not_sure` / `allows_not_applicable` / `allows_prefer_not_to_answer` stay at the schema's
default of `true`; anything else is called out explicitly.

### Moment 1 — You & Why You're Here

| Order | Key | Prompt (member-facing) | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 1 | `primary_concern` *(kept)* | "What brought you here today?" | enum | pain · energy · sleep · stress · weight · digestion · movement · performance · healthy_aging · habits · general_optimization · other | ✓/✓/✓ |
| 2 | `baseline_goals` *(kept)* | "What would you like to feel or be able to do in the next 90 days?" | free_text | — | ✓/✓/✓ |
| 3 | `readiness_importance` *(kept)* | "How important is making a change right now, on a scale of 0 to 10?" | numeric (0–10) | endpoints: Not Important / Extremely Important | ✓/✓/✓ |
| 4 | `readiness_actively_working` *(kept)* | "Are you already actively working on this?" | boolean | Yes / No | ✓/✓/✓ |
| 5 | `readiness_confidence` *(kept)* | "How confident are you that you can make this change, 0 to 10?" | numeric (0–10) | endpoints: Not Confident / Extremely Confident | ✓/✓/✓ |
| 6 | `identity_prior_attempts` **(new)** | "Have you tried to make changes like this before?" | enum | `first_time` (This is my first real try) · `tried_before_some_success` (I've tried before and had some success) · `tried_many_times` (I've tried many times) · `not_sure` | allows_not_sure: n/a (already an option) · allows_not_applicable: false · allows_prefer_not_to_answer: true |
| 7 | `support_network` **(new)** | "Do you have people in your life who support the changes you're trying to make?" | enum | `yes_strongly` (Yes, strongly) · `somewhat` (Somewhat) · `not_really` (Not really) · `not_sure` | allows_not_applicable: false · rest default |

### Moment 2 — Sleep & Rhythm

| Order | Key | Prompt | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 8 | `baseline_sleep_quality` *(kept)* | "How would you rate your typical sleep quality?" | numeric (1–5) | endpoints: Very Poor / Excellent | ✓/✓/✓ |
| 9 | `baseline_sleep_hours` *(kept)* | "On a typical night, how many hours do you sleep?" | enum | `<5` · `5-6` · `6-7` · `7-8` · `8+` | ✓/✓/✓ |
| 10 | `daily_light_outdoor_time` **(new)** | "How much natural light and time outdoors do you usually get in a day?" | enum | `a_lot` · `some` · `very_little` · `not_sure` | default |

### Moment 3 — Mind & Stress

| Order | Key | Prompt | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 11 | `baseline_stress_level` *(kept)* | "How would you rate your everyday stress?" | numeric (1–5) | endpoints: Very Low / Very High | ✓/✓/✓ |
| 12 | `mood_pattern` **(new)** | "Overall, how has your mood been lately?" | enum | `mostly_steady_and_good` · `up_and_down` · `mostly_low` · `not_sure` | allows_not_applicable: false · rest default |

### Moment 4 — Body & Movement

| Order | Key | Prompt | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 13 | `baseline_movement_frequency` *(kept)* | "How many days a week do you currently move intentionally?" | enum | `0` · `1-2` · `3-4` · `5+` | ✓/✓/✓ |
| 14 | `baseline_energy_level` *(kept)* | "How is your energy most days?" | numeric (1–5) | endpoints: Very Low / Very High | ✓/✓/✓ |
| 15 | `baseline_pain_areas` *(kept)* | "Do you have any areas of ongoing discomfort?" | multi_select | neck · shoulders · upper_back · lower_back · hips · knees · none | ✓/✓/✓ |
| 15a | `pain_impact_severity` **(new, conditional)** | "How much does that discomfort affect your daily life right now?" | enum | `mild_barely_notice` · `moderate_manageable_but_present` · `significant_hard_to_ignore` | allows_not_sure: false · allows_not_applicable: false · allows_prefer_not_to_answer: true. **Shown only if `baseline_pain_areas` ≠ `["none"]`.** |
| 15b | `pain_duration` **(new, conditional)** | "How long has this been going on?" | enum | `just_started` · `a_few_weeks` · `months_or_longer` | allows_not_sure: false · allows_not_applicable: false · allows_prefer_not_to_answer: true. **Shown only if `pain_impact_severity` is moderate or significant.** |
| 15c | `pain_coach_followup_consent` **(new, conditional)** | "Would it be okay for your coach to reach out about this directly?" | boolean | Yes / No | allows_not_sure: false · allows_not_applicable: false · allows_prefer_not_to_answer: true. **Shown only if `pain_impact_severity` is moderate or significant.** |

### Moment 5 — Nutrition & Digestion

| Order | Key | Prompt | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 16 | `eating_pattern` **(new)** | "How would you describe your eating patterns most days?" | enum | `structured_and_consistent` · `mostly_consistent` · `pretty_irregular` · `not_sure` | default |
| 17 | `baseline_digestion` *(kept)* | "How would you describe your digestion?" | numeric (1–5) | endpoints: Very Poor / Excellent | ✓/✓/✓ |

### Coda — Right Now, and closing

| Order | Key | Prompt | Type | Options | Skip flags |
|---|---|---|---|---|---|
| 18 | `capacity_bandwidth` **(new)** | "How much bandwidth do you feel you have right now for making changes?" | enum | `a_lot` · `some` · `a_little` · `none_right_now` · `not_sure` | default |
| 19 | `closing_anything_else` **(new)** | "Anything else you'd like your coach to know before you begin?" | free_text | — | fully optional; `prefer_not_to_answer` is effectively the default non-response |

---

## 3. Branching rules

There is exactly **one structural branch** in the Foundational Investigation, and one **blanket
routing rule** that applies across the whole instrument rather than branching the flow itself.

**Branch 1 — Pain severity cascade (Moment 4).**
```
baseline_pain_areas answered, value ≠ ["none"]
  → show pain_impact_severity
      significant_hard_to_ignore
        → show pain_duration
        → show pain_coach_followup_consent
        → Priority: needs attention now
        → Safety classification: urgent_symptom (see §4)
      moderate_manageable_but_present
        → show pain_duration
        → show pain_coach_followup_consent
        → Priority: needs attention now
        → Safety classification:
            duration = just_started  → urgent_symptom
            duration = a_few_weeks / months_or_longer → pain_severity (non-urgent)
      mild_barely_notice
        → no further branch
        → Priority: worth watching
        → No safety classification
baseline_pain_areas answered, value = ["none"]
  → skip the entire pain_impact_severity / pain_duration / pain_coach_followup_consent branch
  → Priority: quiet
```
This is the concrete mechanism behind Prompt 3 §7's safety gate for the Pain & Structural
Integrity domain, and the reason today's instrument's `baseline_pain_areas` alone was never enough
to drive it — location without severity can't distinguish "mentioned once, barely notice it" from
"significant and ongoing."

**Blanket rule — free text is never a branch point, it's a safety-classifier input.**
`baseline_goals` and `closing_anything_else` (and any other free-text response) do **not** trigger
inline branching. Instead, per §3's grounding, every free-text response is passed through the
platform's existing safety classification pipeline (the same pipeline `lib/intelligence/safety.ts`
already routes dynamic coaching content and check-in free text through) exactly as it already
handles member-authored text elsewhere. If that pipeline independently classifies something as
safety-relevant, it creates its own `safety_classifications` row and Coach Review Queue entry, on
its own timeline — it does not pause or redirect the Foundational Investigation itself. See §10
for why this, and not a dedicated screening question, is the deliberate design choice for mood.

---

## 4. Confidence and Priority logic

**Global rules (apply to every domain):**
- **Priority** is a three-value read — `quiet` / `worth watching` / `needs attention now` — set per
  domain from that domain's own item(s) only.
- **Confidence** starts at `building` for every domain by default. It can rise to `low` — never
  higher, per Prompt 3's architecture — only when **two or more items in the same domain
  corroborate the same direction.** Single-item domains (the majority — see the per-domain table
  below) stay at `building` no matter how clear that one item's answer is; clarity of one signal is
  not the same as confidence about the domain, per Method v2 §1's "note on stance."
- A `not_sure` / `prefer_not_to_answer` response never gets treated as a neutral or "quiet" signal —
  it keeps that item's domain at `building` and is logged as a **declined/uncertain** flag,
  separate from an actual quiet finding (Prompt 3 §6).
- An unanswered domain (abandonment) is recorded as genuinely unknown — never defaulted to quiet.

**Per-domain resolution:**

| Coaching Domain | Item(s) | Priority rule | Confidence ceiling |
|---|---|---|---|
| Purpose & Motivation | `primary_concern`, `baseline_goals`, `readiness_importance`, `readiness_actively_working` | needs attention now if `readiness_importance` ≤ 3 or `baseline_goals` declined; worth watching if `readiness_importance` 4–6 or not actively working; quiet if `readiness_importance` ≥ 7 and actively working and goals answered | `low` if ≥ 2 items corroborate |
| Identity & Self-Concept | `readiness_confidence`, `identity_prior_attempts` | needs attention now if `readiness_confidence` ≤ 3; worth watching if 4–6 or `tried_many_times`; quiet if ≥ 7 and `first_time`/`tried_before_some_success` | `low` if both corroborate |
| Relationships & Social Connection | `support_network` | needs attention now if `not_really`; worth watching if `somewhat`/`not_sure`; quiet if `yes_strongly` | `building` only (single item) |
| Sleep & Circadian Rhythm | `baseline_sleep_quality`, `baseline_sleep_hours` | needs attention now if quality ≤ 2 or hours `<5`; worth watching if quality = 3 or hours `5-6`/`6-7`; quiet if quality ≥ 4 and hours `7-8`/`8+` | `low` if both corroborate |
| Environment & Daily Rhythm | `daily_light_outdoor_time` | needs attention now if `very_little`; worth watching if `some`/`not_sure`; quiet if `a_lot` | `building` only |
| Stress & Nervous System Regulation | `baseline_stress_level` | needs attention now if ≥ 4; worth watching if = 3; quiet if ≤ 2 | `building` only |
| Emotional Resilience & Mood | `mood_pattern` | needs attention now if `mostly_low`; worth watching if `up_and_down`/`not_sure`; quiet if `mostly_steady_and_good` | `building` only |
| Movement & Physical Capacity | `baseline_movement_frequency` | needs attention now if `0`; worth watching if `1-2`; quiet if `3-4`/`5+` | `building` only |
| Recovery & Energy Regulation | `baseline_energy_level` | needs attention now if ≤ 2; worth watching if = 3; quiet if ≥ 4 | `building` only |
| Pain & Structural Integrity | `baseline_pain_areas`, `pain_impact_severity`, `pain_duration` | per the cascade in §3 | `low` if severity + ≥ 1 area corroborate |
| Nutrition & Metabolic Health | `eating_pattern` | needs attention now if `pretty_irregular`; worth watching if `mostly_consistent`/`not_sure`; quiet if `structured_and_consistent` | `building` only |
| Digestion & Gut Health | `baseline_digestion` | needs attention now if ≤ 2; worth watching if = 3; quiet if ≥ 4 | `building` only |

**Capacity** (not one of the twelve domains — a cross-domain pacing input, Method v2 §2):
`a_lot`/`some` → normal Root Router pacing. `a_little` → Root Router limits itself to a single
lightest next step (never investigation + Experiment together). `none_right_now` → Root Router
recommends nothing beyond the Whole-Person Check-in this cycle, regardless of how many domains
read needs-attention-now — this is Method conviction 2 ("regulate before you optimize") enforced
literally, not just thematically.

---

## 5. Root Model outputs

For each submission, the Foundational Investigation writes, per domain: one or more Signals (the
raw answer, including its declined/uncertain status if applicable), the resolved Priority, the
resolved Confidence, and — for Pain & Structural Integrity only, when the cascade fires — a linked
reference to whatever `safety_classifications` row got created. Separately, it writes one
cross-domain Capacity reading and one narrative Signal from `closing_anything_else` (unrouted —
available to the coach, not resolved into any domain's Priority).

This is the full set of writes; nothing here decays, resolves, or gets marked confident beyond what
§4 allows. Per Method §9, a later Reflection or Reassessment supersedes these with a "supersedes"
pointer — this submission's rows are never edited in place.

---

## 6. Root Router outputs

Applying Method v2 §7's decision order to this instrument's output:

**Step 0 — Safety gate.** Any `urgent_symptom` or `pain_severity` classification created by the
Pain cascade (§3) goes to the Coach Review Queue immediately, independent of everything else below.
While one is open, the Root Router will not recommend a Lifestyle Experiment in Pain & Structural
Integrity — it can still recommend investigating further.

**Steps 1–5 — action per domain**, using Prompt 3 §7's three-way rule:

| Priority | Live Focused Investigation exists? | Action |
|---|---|---|
| needs attention now / worth watching | Yes | Trigger that Focused Investigation |
| worth watching, single well-understood friction | — | Recommend a Lifestyle Experiment first |
| quiet, or no instrument exists | — | Continue via Whole-Person Check-in |

**Tie-break, when more than one domain reads needs-attention-now with a live instrument available**
(not fully specified in Prompt 3 — resolved here, concretely):
1. Prefer the domain still at `building` confidence over one already at `low` — more remaining
   uncertainty to reduce (Method principle 5).
2. If still tied, prefer whichever live instrument's coverage spans the *most* currently-flagged
   domains at once (efficiency: one investigation resolving several open questions beats several
   narrow ones).
3. If still tied, regulation domains (Sleep, Stress) outrank optimization domains (Recovery,
   Nutrition) — Method conviction 2, as a final tiebreak only.

**Worked example**, to make this concrete. A hypothetical member answers: `readiness_importance` 8,
actively working, goals answered → Purpose quiet. `readiness_confidence` 5, tried before with some
success → Identity worth watching. `support_network` somewhat → Relationships worth watching.
`daily_light_outdoor_time` very little → Environment needs attention now (no instrument exists).
`baseline_sleep_quality` 2, hours 5-6 → Sleep needs attention now, confidence `low`.
`baseline_stress_level` 4 → Stress needs attention now, confidence `building`. `mood_pattern`
up and down → Mood worth watching. `baseline_movement_frequency` 1-2 → Movement worth watching.
`baseline_energy_level` 2 → Recovery needs attention now, confidence `building`. Pain: lower back,
moderate, months-long, consent declined → needs attention now, `pain_severity` classification
(non-urgent), confidence `low`. `eating_pattern` mostly consistent → Nutrition worth watching.
`baseline_digestion` 3 → Digestion worth watching. `capacity_bandwidth` some → normal pacing.

Needs-attention-now domains with a live instrument: **Sleep** (`low` confidence), **Stress**
(`building`), **Recovery** (`building`), **Pain** (`low`, already under non-urgent Coach Review
Queue). Applying the tie-break: Stress and Recovery are both still `building` — more remaining
uncertainty than Sleep or Pain. Between them, the **Short Health Assessment Questionnaire** covers
Stress, Sleep, and Energy (Recovery) categories simultaneously, so it beats Four Doctors
Assessment (which would only speak to Recovery) on tiebreak rule 2 — one instrument resolving three
open domains at once. **Primary recommendation: the Short Health Assessment Questionnaire**, with
Body Assessment (for Pain) logged as the ranked alternate, and Movement & Physical Capacity's
worth-watching, well-understood friction ("add one more movement day") logged as the suggested
Lifestyle Experiment, offered as a secondary, lighter option alongside the primary recommendation.
Environment & Daily Rhythm stays at Whole-Person Check-in — flagged honestly, not hidden, because
no instrument exists for it yet.

---

## 7. Coach experience output

After this specific instrument, the coach's view (per Prompt 3 §9) resolves to concrete content:

- **Root Model summary** — twelve lines, one per domain, in the exact form:
  `Domain — Priority — Confidence — Signal(s)`. E.g. `Sleep & Circadian Rhythm — needs attention
  now — low — quality 2/5, 5–6 hrs/night.`
- **Root Map** — the same, grouped by Priority (needs attention now → worth watching → quiet),
  with the four uninstrumented-when-flagged domains (here: Environment) explicitly marked "no
  instrument yet" rather than omitted.
- **Confidence by domain** — the real `building`/`low` values, unsoftened, all twelve.
- **Highest-priority coaching opportunities** — ranked: Sleep, Stress, Recovery, Pain (with its
  Coach Review Queue link), Environment (flagged, no instrument).
- **Recommended next investigation** — Short Health Assessment Questionnaire, with the one-line
  "why" from §6, plus Body Assessment logged as the alternate.
- **Suggested lifestyle experiment** — "Add one more intentional movement day" (Movement & Physical
  Capacity), tagged against the two-concurrent-experiment guardrail (Method §8), not yet active.
- **Safety flags first, separately** — the Pain `pain_severity` (non-urgent) Coach Review Queue
  entry, shown above the general summary, noting consent was declined so outreach should be
  member-initiated framing, not a cold contact.

---

## 8. Member-facing copy

**Welcome**
> Welcome to Rooted Reset. Before we build anything together, we'd like to get to know you — not
> everything about you, just enough to know where to start. This isn't a form to get through. It's
> the beginning of an ongoing conversation.

**Introduction**
> We're not trying to figure everything out today — just enough to know where to start. A handful
> of short moments, about 8–10 minutes, and you can skip anything you're not ready to answer yet.

**Moment transitions** (shown briefly between moments, not as a summary — a small
acknowledgment):
- Into Sleep & Rhythm: *"Good start. Let's talk about rest."*
- Into Mind & Stress: *"Thanks for sharing that. Now, how you've been feeling."*
- Into Body & Movement: *"Onto how your body's been doing."*
- Into Nutrition & Digestion: *"Almost there — a couple questions about food and digestion."*
- Into the Capacity coda: *"One last thing before we wrap up."*

**Completion screen**
> That's it — thank you. What you just shared is a first impression, and it gets sharper every time
> we talk. Your Root Map is ready.

**Confidence meta-message** (the single reassuring line, shown once, not per domain):
> Everything below is what we're noticing so far — not a verdict. The more we get to know you, the
> more accurate this gets.

**"What we understand so far"** (using the §6 worked example):
> - Sleep's been rough lately — that's worth a closer look together.
> - Stress has been running high, and it sounds connected.
> - Your motivation is real and clear — that's a strong place to build from.

**"What we're still learning"**
> - We don't yet have a dedicated way to explore your environment and daily rhythm — but what you
>   shared about getting outside less lately is noted, and it matters to us.
> - We're still getting to know how you experience movement day to day.

**"Why the next investigation was selected"**
> Based on what you shared about sleep, stress, and energy, we'd like to go a little deeper there
> next — the Short Health Assessment Questionnaire covers all three in one go, so we're not asking
> you to repeat yourself.

---

## 9. Completion experience — full walkthrough

1. Member answers `closing_anything_else` (or skips it) and taps "Finish."
2. Brief, unhurried transition screen — no spinner-as-suspense, just the completion copy from §8.
3. **Root Map** renders, grouped by Priority per §7's coach-view logic but in the member's softened
   voice (§8): "what stood out" first, "what's looking steady" after.
4. **Confidence meta-message** (§8) appears once, above the Root Map, not repeated per domain.
5. **"What we understand so far"** and **"What we're still learning"** render as two short,
   plain-language lists directly under the Root Map.
6. **The single next-step recommendation** renders last, with its one-sentence "why" (§8) —
   framed as an invitation ("Ready to go a little deeper on sleep and stress?"), not a mandate, with
   an obvious way to accept, defer, or explore something else instead — Method §7's "member agency"
   step, made literal in the UI.
7. If a Lifestyle Experiment was also identified as a secondary option (§6's Movement example), it's
   offered underneath as a lighter, optional alternative — never competing for primary visual
   weight with the main recommendation.
8. Pain-related Coach Review Queue routing (if triggered) happens silently in the background — the
   member is never shown "your coach has been flagged"; the coach experience (§7) carries that,
   consistent with the safety system's existing member-facing conservatism.

---

## 10. Responsible-design note: why there's no dedicated mood/crisis screening question

`mood_pattern` (§2) is a plain, light self-report — never a validated clinical screening
instrument, and deliberately not a direct question about self-harm or crisis, even though the
platform's existing safety system already has a real `mood` → `self_harm` mapping
(`lib/intelligence/safety.ts`'s `AREA_TO_RESTRICTED_TOPICS`). Writing a genuine crisis-screening
question is a real clinical and legal design decision — appropriate scope for a dedicated,
reviewed effort, not something to embed as a side effect of a breadth-first onboarding
instrument on a non-clinical wellness coaching platform. Instead, §3's blanket rule routes every
free-text response (where a member might volunteer something serious in their own words) through
the same safety classification pipeline the platform already uses elsewhere, so nothing is missed
— without the Foundational Investigation ever asking a leading question it isn't equipped to act
on safely. If the platform wants a real screening instrument later, that belongs to its own
reviewed, clinically-informed design effort — not folded into this one.

---

## 11. Recommendations before implementation

1. **19 universal items vs. the 15–20 estimate.** Confirm this is acceptable — the overshoot comes
   entirely from preserving all twelve existing questions rather than cutting any to hit a round
   number (§1). If a tighter budget is truly required, `readiness_actively_working` (boolean,
   thinnest signal of the four Purpose & Motivation items) is the single best candidate to fold
   into `readiness_importance`'s interpretation instead of asking separately.
2. **Resolve the assessment-versioning mechanics** flagged in §1's Note for Prompt 5 before writing
   any migration — in-place content update to `assessment_version = 1`, or a new
   `assessment_version = 2`, changes what a migration needs to do.
3. **Confirm the Pain cascade's safety-classification thresholds** in §3 (`significant` always
   `urgent_symptom`; `moderate` + `just_started` also `urgent_symptom`; `moderate` + longer duration
   as non-urgent `pain_severity`) against whoever owns the Coaching Safety system's classification
   policy — this spec proposes a reasonable mapping onto existing categories, but doesn't have the
   authority to finalize clinical-adjacent thresholds unilaterally.
4. **Confirm the Root Router tie-break rules in §6** (building-confidence-first, then
   broadest-instrument, then regulate-before-optimize) — this is new logic beyond what Prompt 3
   specified, resolved here for the first time, and worth a second look before it's implemented.
5. **Sign off on the exact copy in §8** — it's written in the Method's voice as designed, but
   member-facing copy is worth a dedicated pass by whoever owns brand voice before it ships
   verbatim.

---

*End of Prompt 4 deliverable.*
