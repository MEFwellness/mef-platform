# Rooted Reset Motion & Experience Design Bible v1

**Status:** Foundational reference document. Nothing in the app changed to produce this file — every rule below is either (a) formalizing a pattern that already exists somewhere in this codebase, cited by file, or (b) a new standard this Bible is establishing for Prompts 1 through 8 to build toward. Where the two disagree, this document says so explicitly rather than pretending the app is already finished.

**Scope:** `apps/consumer-web-app` — the only member/coach-facing app in this repo (`services/knowledge-engine-api` and `services/pattern-prioritization-engine` are empty stubs; `packages/mef-method-repository` is empty; see `docs/BUILD_STATUS.md`).

**How to use this document:** every future prompt that touches motion, pacing, or Root's voice should cite the specific section number it's implementing (see §14). If a prompt needs to deviate from a rule here, that's a signal to update this Bible first, not to quietly drift from it.

---

## 1. Core Philosophy

The app should never feel like software. It should feel like Root — the member's own root-cause coach — is present, personally guiding them. Not a dashboard they operate. Not a form they fill out. A relationship they're in.

Every screen must answer one question before it ships: **how do we make this person want to see what comes next?**

Three things a member must never feel, on any screen:
- **Overwhelmed** — too much at once. See §6 (Information Density Rules).
- **Alone** — like they're staring at raw data with no one interpreting it for them. Root is always the one noticing, explaining, and proposing. See §7 (Root's Behavior Rules).
- **Lost** — unsure what just happened, what's happening now, or what to do next. Every screen shows progress, state, or a clear next step. See §2's No Dead Screens rule.

This app already has real, working proof that this philosophy is achievable — not aspirational. `lib/core-values-snapshot/copy.ts` line 60: *"Here's what I noticed. Out of everything I asked, {top} came out on top... I'm not going to tell you why that is. I don't know yet. But it's worth paying attention to."* That is Root, in first person, building anticipation, and refusing to claim more than the data supports — three separate rules from §7, in one real sentence, already shipped. This Bible exists to make that the rule everywhere, not the exception in one assessment's closing screen.

---

## 2. Screen Classification: Moments vs. Tools

Every screen in the app is one or the other. Never both, never neither.

- **Moments** — experiences the member has occasionally, that carry emotional weight and deserve to be savored: onboarding, welcome, insight reveals, plan proposals, milestone/closing screens, guided capture. Cinematic pacing, progressive revelation, pauses, and emotional rhythm are appropriate here (§5).
- **Tools** — anything used habitually, where speed and responsiveness matter more than ceremony: daily check-in, logging, browsing, navigating, settings, coaching chat. These come alive through micro-interactions only (§9). **Never** add reveal pacing, typewriter effects, or auto-advance to a Tool.

**The No Dead Screens rule applies to both.** Every screen — Moment or Tool — must contain at least one living element: motion, transformation, progress, discovery, feedback, or emotional response. A totally static screen is a bug regardless of category. What differs is *how* that life shows up: a Moment can pace a reveal across several seconds; a Tool's life must be instant and responsive to the member's own action (a button compresses, a card lifts, a fill animates to the real number).

### A screen can contain both — the real precedent for how to split them

`components/FirstCheckInWelcome.tsx` and `components/FirstCheckinTransition.tsx` exist as a **separate Moment layer wrapped around the entry into the Check-In Tool**, only on a member's very first check-in. Confirmed by the check-in wizard's own dual-mode design (`project_checkin_four_screen_wizard` — "cinematic (first-ever) vs section modes"). This is the model to copy whenever a Tool has a meaningful first-time experience: build the Moment as its own wrapper/screen that hands off into the ordinary, fast Tool — never bake cinematic pacing into the Tool itself, even conditionally. The Tool must stay one honest, fast thing.

### Full Screen Inventory

Grouped by app area. "Base pacing" is the default; see the note column for first-time or state-dependent exceptions.

#### Public / pre-signup

| Screen(s) | Route(s) | Classification | Note |
|---|---|---|---|
| Login, signup, verify, password reset | `app/(auth)/*` | Tool | Transactional; must be fast, never gated behind ceremony |
| Prospect landing page | `app/start/page.tsx` | Moment (marketing, own rules) | Public, no member chrome, not in BottomNav — outside this Bible's Tool/Moment vocabulary, governed by conversion-design norms instead |
| Lead widget test harness | `app/lead-widget-test/page.tsx` | Tool (internal dev utility) | Not member-facing |
| Quick Wellness Check (guest preview) | `app/wellness-check/page.tsx` | Moment | Pre-signup persuasion experience — same family as Welcome (`project_guest_onboarding_coaching_redesign`, `project_premium_discovery_screen`) |

#### First run

| Screen(s) | Route(s) | Classification | Note |
|---|---|---|---|
| Welcome (9 screens: logo, story, connected, 4 benefit cards, goal selection, primary goal) | `app/welcome/page.tsx` + `WelcomeFlow.tsx` | Moment | The app's single most cinematic sequence today — real precedent for §5 |
| Onboarding (consent, intro, adaptive question set, completion) | `app/onboarding/page.tsx` + `OnboardingIntro/ConsentForm/OnboardingFlow/OnboardingForm.tsx` | Moment | Adaptive question bank per concern (`lib/onboarding/adaptivePlan.ts`) |
| Post-verification display name | `app/name/page.tsx` | Tool | One field, no ceremony — correctly kept minimal per `project_account_creation_redesign` |
| First check-in welcome/transition | `components/FirstCheckInWelcome.tsx`, `FirstCheckinTransition.tsx` | Moment (wrapper only) | See "the real precedent" callout above |

#### Daily Tools

| Screen(s) | Route(s) | Classification | Note |
|---|---|---|---|
| Home dashboard | `app/dashboard/page.tsx` | Tool | Fast, habitual — but see §11, it is the app's primary "living" surface via micro-interaction, not pacing |
| Today (Daily Coaching Experience hub) | `app/today/page.tsx` | Tool | |
| Check-In (morning + evening, all screens, result) | `app/checkin/*` | Tool | Auto-advance was **built, then deliberately deleted** (`project_checkin_navigation_stability_fix`) — the strongest real precedent in this codebase for §5's auto-advance rule |
| Food Lens (log, new, barcode, label, manual, search, pantry, pattern, preferences, report, restaurant) | `app/food-lens/**` | Tool | High-frequency logging; speed over ceremony |
| Protein Ledger | `app/food-lens/protein/*` | Tool | Daily tally over existing food log (`project_protein_ledger_phase1b`) |
| Movement (hub, profile, session) | `app/movement/**` | Tool | |
| Exercise library | `app/exercises/*` | Tool | Reference/browse |
| Conversation with Root | `app/conversation/page.tsx`, `FloatingCoachLauncher/Panel.tsx` | Tool | Must feel like messaging speed; Root's *voice* rules (§7) still apply in full — pacing and voice are independent axes |
| Progress + timeline | `app/progress/*` | Tool | Chart-heavy but reference, not ceremony |
| Root Score detail | `app/root-score/page.tsx` | Tool | Reference view; reads only from `lib/scoring/service.ts`, never calculates |
| Root Map | `app/root-map/page.tsx` | Tool | Reference view over current understanding; new-segment reveals are a §12 concern, not a pacing one |
| What Root Is Noticing | `app/noticing/page.tsx` | Tool | Full-page promotion of what used to be a bottom sheet |
| Insights hub | `app/insights/page.tsx` | Tool | Navigational hub |
| Recommendations + experiments | `app/recommendations/page.tsx` | Tool | Mark done, start/reflect an experiment — action-oriented |
| Your Case | `app/case/page.tsx` | Tool | Presentation-only over existing goal/driver/correlation data |
| Profile, baseline, membership, connections, notifications, help | `app/profile/*`, `app/membership/page.tsx`, `app/connections/page.tsx`, `app/notifications/page.tsx`, `app/help/page.tsx` | Tool | Settings-class screens |

#### Assessments — split by phase

Assessments are neither purely Moments nor purely Tools; they split cleanly by phase, and this split is already real in the codebase (`components/closing-screen/ClosingScreenPrimitives.tsx` exists specifically because two different assessments' closing screens needed the same staged-reveal mechanics). Applies to WBSA, Core Values Snapshot, Life Signal Check, Readiness Pulse, Primal Pattern Diet Type, and the generic points-scored engine (CHEK HLC1 / Four Doctors / Short-HAQ):

| Phase | Route pattern | Classification | Note |
|---|---|---|---|
| Catalog / browse | `app/questionnaires/page.tsx` | Tool | Filter, resume, gate |
| Taking the assessment | `.../[key]/take/page.tsx` | Tool-paced | Answer efficiently, no forced dwell — same reasoning as daily check-in |
| Results / closing screen | `.../[key]/results/[id]/page.tsx` | **Moment** | The payoff — cinematic, first-completion-only (see §13's Signature Moment template, built from this exact code) |
| History / category detail | `.../history/page.tsx`, `.../category/[id]/page.tsx` | Tool | Reference |
| Body Assessment (camera capture) | `app/assessment/*` | **Moment** | Explicit product direction found in `app/globals.css`: *"this feels like professional equipment analyzing me, not a phone camera... elegance over speed"* — the richest single motion system in the app (scan-sweep, ring-glow, capture-flash/check, countdown-pop) |

#### Reset Plan

| Screen(s) | Route | Classification | Note |
|---|---|---|---|
| Personal Reset Plan (proposal, daily flow) | `app/reset-plan/page.tsx` | Moment | Real copy already in `lib/reset-plan/copy.ts`: *"This is Root's first act as your coach, not another questionnaire"* |

#### Coach-facing (all Tools, no exceptions)

`app/coach/**` in its entirety — dashboard, client detail, WBSA/assessment review, programs (assign/build/generate), protein review, question bank editor, review queue, corrective programs. **A coach is triaging many members quickly; no coach-facing screen ever gets cinematic pacing, regardless of how rich the underlying data is.** This is a hard rule, not a default: a coach viewing the same closing-screen data a member sees in a Moment should see it as an instant, dense Tool view.

#### Admin

`app/admin/**` — internal test/config tooling. Tool, no exceptions, no member-facing polish required beyond basic usability.

---

## 3. Animation Vocabulary

Every animation the app uses (or should use going forward) falls into one of nine types. For each: exact duration, easing, when to use, when never to, and its naming convention. Durations and curves below are not invented — they're the values already load-bearing in `app/globals.css`, formalized here as the required palette (see §4 for the full timing scale these draw from).

Naming convention for all of them: **`mef-{subject}-{verb}`**, kebab-case, defined as a CSS class backed by a `@keyframes` block in `app/globals.css`, each with a one-paragraph comment stating which real screen/component owns it and why — matching every existing entry in that file. Pure-JS timing math that a Server Component might need to import stays in its own plain (non-`'use client'`) module, named `{screen}{Purpose}Ms` — see `lib/introRevealTiming.ts` for the pattern, and its own header comment for the exact Next.js bug (Client Component export poisoning) this convention avoids.

| Type | Real example | Duration / easing | When to use | When never to use |
|---|---|---|---|---|
| **Fade** | `.mef-fade-in` | 450ms, `ease-out` | Content that should appear without moving: body copy, buttons, anything that would look busy if it also traveled | As a Moment's sole primary-headline entrance — pair with slide or scale for something with more presence. Fade is also the universal reduced-motion *fallback* for almost every other type (see §10) |
| **Slide** | `.mef-fade-up`, `.mef-screen-enter` / `-exit` | 320–500ms, `ease-out` | Card/section entrances; one screen's content replacing another's | Loops; any travel distance beyond ~14px (the app's own max observed value) — this is a settle, not a slide-in-from-offscreen effect |
| **Scale** | `.mef-scale-settle`, `.mef-mood-face-pop`, `.mef-capture-check`, `.mef-countdown-pop` | 380–600ms, overshoot `cubic-bezier(0.34, 1.56, 0.64, 1)` | Confirmations, celebratory settles, one focal element (a logo, an icon, a selected face) | Multiple simultaneous elements scaling at once — reads as chaos. One focal element at a time, always |
| **Stagger** | `.mef-checkin-stagger`, `.mef-animate-in` + per-item `animationDelay` | 400–500ms per item, ~80–120ms delay step, `ease-out` | Lists of related items entering in reading order | More than ~6–8 items — the delay tail becomes a wait, not a rhythm. Cap it (§6) |
| **Breathe** | `.mef-root-score-breathe`, `.mef-pulse-dot` | 2.2–6s, `ease-in-out infinite` | Signaling "this is alive and current" on a data object, or a waiting/pending state — ambient only | On text; on more than one element per screen — competing breathing reads as noise, not calm |
| **Grow** | `ProgressConnector` width fill (`closing-screen/ClosingScreenPrimitives.tsx`) | 700ms, `ease-out` | Progress bars, fill meters, anything literally representing an accumulating real value | Decoratively, with no real value behind it — grow must always map to a number that exists |
| **Ripple** (bleed) | `.mef-bleed-fill` | 400ms, `ease-out`, `clip-path` circle grown from the tap's own coordinates | Selection confirmation on tap — the exact point of contact visibly answers | Hover-only desktop affordances — this effect is meaningless without a real origin point |
| **Pulse** | `.mef-voice-pulse` | 1.4s, `ease-in-out infinite` | Live/listening states only (e.g. microphone actively capturing) | Anything not literally live right now — a static "new" badge must never pulse; that's what Breathe or a plain dot is for |
| **Float** | *(not yet built — standardized here for §10's ambient work)* | 8–12s, `translateY` drift ≤ 6px, opacity capped ≤ 0.15, `ease-in-out infinite` | Background particles/orbs only, within §10's ambient motion budget | Any foreground or interactive element; always the first thing disabled under the low-power fallback |

---

## 4. Timing and Easing Standards

### The duration scale

Six tiers. Every animation in the app must use a value from this table — no arbitrary durations. Each tier is anchored to real, currently-shipped values so this isn't a theoretical scale being imposed on the app; it's the app's own existing consistency, made mandatory.

| Tier | Range | Real example(s) | Use |
|---|---|---|---|
| **Instant** | 100ms | *(reserved — not yet used; for state flips with no visual travel, e.g. a checkbox toggle)* | Binary state changes a member expects to feel immediate |
| **Quick** | 150–200ms | `.mef-press` (150ms), `.mef-screen-exit` (180ms) | Button press compression, an outgoing screen leaving |
| **Standard** | 300–320ms | `.mef-screen-enter` (320ms) | An incoming screen, a typical element entrance |
| **Deliberate** | 400–500ms | `.mef-checkin-stagger` (400ms), `.mef-fade-in` (450ms), `.mef-fade-up` / `.mef-pop-in` (500ms) | The default "something appeared" beat — the workhorse duration |
| **Cinematic** | 600–900ms | `.mef-scale-settle` (600ms), `.mef-scale-fade-in` (700ms), `.mef-close-gold-sweep` (900ms) | Moment-only reveal beats; never used in a Tool |
| **Epic** | 2000ms+ | `.mef-title-logo-in` (2000ms), `.mef-scan-sweep` loop (2800ms), `.mef-root-score-breathe` loop (6000ms) | Reserved for a true signature-moment opener or slow ambient loops — never gates required interaction |

### Standard easing curves

| Curve | Value | Real example | Use |
|---|---|---|---|
| Standard ease-out | CSS `ease-out` | Most of the table above | Default for anything entering or settling |
| Overshoot spring | `cubic-bezier(0.34, 1.56, 0.64, 1)` | `.mef-scale-settle`, `.mef-mood-face-pop`, `.mef-capture-check` | Confirmations and celebratory settles — see Scale in §3 |
| Slow deceleration | `cubic-bezier(0.16, 1, 0.3, 1)` | `.mef-title-logo-in` — used exactly **once** in the whole app | Reserved for the single most important opening beat only (Welcome, screen 1). Its rarity is what gives that logo its weight — do not reuse this casually |
| Symmetric ease-in-out | `cubic-bezier(0.45, 0, 0.55, 1)` / plain `ease-in-out` | `.mef-scan-sweep`, `.mef-ring-glow`, `.mef-pulse-dot`, `.mef-root-score-breathe`, `.mef-voice-pulse` | Anything looping or breathing — a looped `ease-out` visibly "arrives and stops" awkwardly each cycle; this curve doesn't |
| Draw curve | `cubic-bezier(0.65, 0, 0.35, 1)` | `.mef-close-check-draw` | Stroke-draw/path reveals specifically |
| Step | `step-end` | `.mef-caret-blink` | Hard on/off toggles only (a blinking cursor) |

No new animation ships with a duration or curve outside these two tables. If a genuinely new need doesn't fit, that's a signal to add a tier here first, with a real cited use case — not to write an arbitrary value inline.

---

## 5. Cinematic Pacing Rules (Moments Only)

### The reveal rhythm template

Fade in → headline appears → pause → body fades in → pause → button appears. Exact beats, in ms, using the scale from §4:

1. **0ms** — screen container fades in (`.mef-fade-in`, Deliberate/450ms) or the container itself is already visible and content reveals inside it.
2. **0ms** — headline begins. If typewritten (see reading-speed rule below), it types at a fixed rate. If it's a static reveal, it uses Scale or Slide at Cinematic tier (600–700ms) so it reads as the moment's focal entrance, not a routine fade.
3. **Pause** — headline finishes, then a beat of true stillness before body copy starts. `lib/introRevealTiming.ts`'s `INTRO_REVEAL_TYPEWRITER_SETTLE_MS` (300ms) is the standardized length of this pause — use it verbatim, don't invent a new pause length per screen.
4. **Body fades in** — `.mef-fade-in`, Deliberate tier, optionally staggered per line at `INTRO_REVEAL_LINE_STEP_MS` (400ms) per line if there's more than one line.
5. **Pause** — same 300ms beat before the button appears. The button is the last thing to earn the member's attention, never competing with the words for it.
6. **Button appears** — Deliberate fade, plus one difference from every other element on the screen: the button's language must follow §7's curiosity-language rule, never a bare "Continue" inside a Moment.

### Reading-speed rule (grounded in real, shipped math)

`lib/introRevealTiming.ts` already codifies the app's typewriter rate: **45ms per character**, plus a fixed 300ms settle, plus 400ms per subsequent line (`introRevealFollowUpDelayMs`). That's roughly 22 characters/second — deliberately unhurried, tuned for a coach speaking, not a terminal printing. **This is now the mandatory rate for any new typewriter effect anywhere in the app.** Do not tune a new value per screen.

For non-typewriter reveals (a whole block fading in at once rather than typing out), apply the same reading-speed discipline differently: the block must remain on screen, uninterrupted, for at least `wordCount / 3` seconds (≈180 words/minute, a comfortable silent-reading pace) before any auto-advance or forced transition is even eligible to fire.

### Auto-advance: tightly scoped, not banned outright

The real precedent here cuts both ways, and this Bible reconciles it:

- `app/welcome/WelcomeFlow.tsx`'s pages 1–7 **do** auto-advance today (per `app/globals.css`'s own comment: "timed, auto-advancing pages"). This is acceptable *only* because those specific beats are near-zero-reading-content, ambient-pacing beats (a logo settling, a background fading) — not places a member is asked to absorb a decision-bearing sentence.
- `app/checkin`'s wizard **had** auto-advance and it was **deliberately removed** (`project_checkin_navigation_stability_fix` — "auto-advance deleted entirely, Continue-only ... X/Back verified working live"). This is the load-bearing precedent: once a screen contains real content a member needs to read and act on, auto-advance becomes a stability and trust problem, not a nicety.

**The rule going forward:** auto-advance is permitted only on pure-pacing beats with no decision and no substantial reading content, it must never exceed the reading-speed floor above, and it must always have a manual skip-forward affordance (a tap anywhere, or a visible "skip" control) so an impatient member is never trapped waiting on a screen they've already absorbed. The instant a beat contains a sentence a member might read slowly, or a choice they need to make, auto-advance is off and a real button per §7 is required — full stop, no exceptions, matching the check-in precedent.

---

## 6. Information Density Rules

**Maximum per screen in a Moment: one major idea, two supporting sentences, one action.** If a screen needs more than that to do its job, it isn't one screen — split it, or convert the excess into one of the patterns below.

**Any paragraph over 50 words must be converted.** Never ship a wall of body copy in a Moment. Conversion patterns, each with a real or specified example:

| Pattern | When to reach for it | Example |
|---|---|---|
| **Conversational sequence** | A paragraph that's actually several related observations | `lib/core-values-snapshot/copy.ts`'s branch copy already reads as a sequence of short beats ("Here's what I noticed... But when I asked... I'm not going to tell you why that is") rather than one dense paragraph |
| **Animation** | An idea that's fundamentally about change over time | A trend line drawing in (`components/ScrollDrawIn.tsx`, `AnimatedEnergyTrendChart.tsx`) instead of a sentence describing the trend |
| **Question** | An idea better absorbed by the member answering it than reading it | Onboarding's adaptive question banks (`lib/onboarding/concernBanks/*`) — the app already prefers asking over telling wherever possible |
| **Reveal** | A finding that lands harder if it's uncovered rather than stated up front | The closing-screen staged reveal (`ClosingScreenPrimitives.tsx`) — a checkmark that draws itself, a progress line that fills, before the number appears |
| **Card** | A set of parallel, comparable facts | Root Map's per-domain cards (`components/root-map/`), Recommendation cards |
| **Timeline** | Anything with a "then, then, then" shape | The Journey/`JourneyProgressLine` component in `ClosingScreenPrimitives.tsx` — literally a timeline of completed conversations |
| **Carousel** | Several equally-weighted options with no inherent reading order | `components/dashboard/QuickActionsCarousel.tsx` |
| **Choice** | A paragraph that's actually justifying a decision the member should just make | Welcome's goal-selection screens instead of a paragraph explaining why goals matter |

---

## 7. Root's Behavior Rules

Root is not a feature label on the UI. Root is the coach the member is in a relationship with. Every rule below already has real precedent in this codebase — this section formalizes what's working and closes the gaps.

- **First-person presence language.** Root says "I noticed," "I've been thinking," "I waited until I had enough information" — never "the app has detected" or a passive/third-person construction. Already extensively real: `lib/core-values-snapshot/copy.ts`, `lib/life-signal-check/copy.ts` ("I noticed that"), `lib/feed/copy.ts` ("I've been following your recent progress"), `lib/readiness-pulse/copy.ts` ("Here is what I noticed"), `lib/brain/copy.ts`. Any new copy that reaches for "the system found..." should be rewritten before it ships.
- **Root builds anticipation before reveals**, never dumps results cold. This is what §5's pacing template exists to serve — the pause beats aren't decoration, they're Root visibly taking a breath before telling the member something.
- **Root remembers.** Memory callbacks must reference the member's actual past entries, intake answers, and milestones — never a generic "as we discussed." `lib/core-values-snapshot/copy.ts` line 215: *"Your instincts and your 90-day pick pointed two different ways. I noticed that."* — a real callback to two specific, named prior data points, not a vague gesture at "your history."
- **The Honest Discovery Rule.** Root never claims an insight, pattern, or discovery it cannot back with the member's real data. No fake surprises, ever. Already a hard architectural discipline in this codebase, not just a copy guideline: `lib/reset-plan/copy.ts`'s own header comment states *"nothing is invented when data is missing"*, citing the established null-context pattern from `lib/life-signal-check/adjacency.ts`. §12's Progressive Trust Timeline exists specifically to operationalize this rule over time — Root can only reveal what the evidence at hand actually supports.
- **No guilt, ever.** If a member disappears and returns, Root says "I'm glad you're back." Never "You missed X days," never a streak-broken message, never a guilt-tinged nudge. **This is a gap, not existing precedent** — a grep of every `lib/*/copy.ts` file in this repo found no "glad you're back" (or equivalent) copy yet. This is real work for one of Prompts 1–8: audit every re-engagement/inactivity surface (push notifications, dashboard empty states after a gap, streak-adjacent copy) and rewrite anything that currently frames absence as a failure.
- **Celebrate growth and specific behavior, not streaks.** "You logged three high-protein meals this week, up from one last week" beats "5-day streak!" A streak counts days; growth copy names the actual thing that changed.
- **Continue buttons use curiosity language inside a Moment.** "Show me," "Let's find out," "I'm ready" — never a bare "Continue." **Also a real gap**: 11 existing literal `'Continue'` button labels were found across the codebase today. Not all of them are wrong — a `Continue` inside a Tool (assessment-taking flow, a settings wizard) is fine and expected, since §2 explicitly exempts Tools from Moment-only copy rules. The audit work for Prompts 1–8 is to find which of those 11 sit inside a Moment (per the §2 inventory) and rewrite only those.

---

## 8. App Copy Rules

- Correct punctuation everywhere: commas, periods, colons, parentheses, used properly.
- **Absolutely no em dashes anywhere in app copy** — not in headlines, body text, buttons, notifications, or error messages. (This rule is about member-facing copy only; engineering comments in the codebase, including this Bible's own source, are not app copy and are exempt.)
- Warm, personal, coach-like tone throughout — Root talks like the practitioner it is, per §7, not like a form.
- Inclusive of all members: no assumptions about body type, gender, family structure, ability, or fitness background baked into copy.

---

## 9. Micro-Interaction Standards

These are what make Tools feel alive without ever slowing them down.

- **Button press compression.** `.mef-press` — Quick tier (150ms), `transform: scale(0.97)` on `:active`, plus color/shadow transition on the same timing. A physical feedback cue, not a state-color change. Reduced motion keeps the color/shadow transition but drops the scale.
- **Card lift on tap.** Not yet a named, reusable class in `app/globals.css` — standardize now as `.mef-card-lift`: Quick tier (150–200ms), a small `translateY(-2px)` plus a shadow increase, same `ease-out` as `.mef-press`. Reserve `.mef-press`'s scale-down for buttons/tappable controls; reserve lift for cards that open into something on tap.
- **Selection ripple.** `.mef-bleed-fill` (§3, Ripple) — the color visibly bleeds outward from the exact tap point. This is the app's answer to a generic ripple; don't introduce a second, competing ripple treatment.
- **Progress fill.** `ProgressConnector`'s width animation (§3, Grow) — 700ms `ease-out`, always tied to a real accumulating value.
- **Success states.** Follow the closing-screen precedent: a checkmark that draws itself (`.mef-close-check-draw`, 500ms, draw curve) rather than an instant swap to a checkmark icon. Reserve the once-only gold sweep (`.mef-close-gold-sweep`) for genuine first-completion celebrations, never for routine confirmations (a saved food log entry does not get a gold sweep — that would cheapen it for the moments that should feel special).
- **Haptic feedback.** Gets haptics: a completed check-in, a logged meal saved, a milestone/closing-screen celebration, an assessment submitted. Never gets haptics: passive scrolling, screen navigation, opening a card, anything that fires more than once per user action (no haptic-per-keystroke, no haptic-per-scroll-tick).
- **Loading states.** Replace every generic spinner with purposeful, Root-voiced language: "Looking for patterns...", "Checking what's changed...", "Putting this together..." — never a bare spinner with no text, and never generic "Loading..." Copy should hint at what Root is actually doing, matching whatever the screen is about to reveal.
- **Empty states.** Never a blank screen or a generic "No data yet." Root-voiced, forward-looking: what will appear here, and what's the one action that fills it. `components/FirstCheckInWelcome.tsx` and the dashboard's pre-first-check-in hero gating (`components/dashboard/HomeHero.tsx` — hides score/greeting-only until `hasCheckins`) are the real precedent for "don't show an empty version of the populated UI, show a purpose-built empty state instead."

---

## 10. Ambient Motion Rules

Subtle background life — slow gradients, floating particles, breathing elements — must stay subconscious. It should never be the thing a member consciously notices; it should be the thing that makes the screen feel alive if they stopped and looked.

**Intensity limits:**
- Opacity delta on any ambient element: ≤ 15 percentage points (matches `.mef-root-score-breathe`'s real 0.55→0.85 range).
- Scale delta: ≤ 5% (matches `.mef-root-score-breathe`'s 1→1.04).
- Position drift (Float, §3): ≤ 6px.
- Never more than one breathing/pulsing/floating element visible on screen at once (per §3's Breathe rule) — layered ambient motion reads as noise, not calm.
- Ambient motion never blocks or delays a member's ability to interact with anything on the screen. It runs entirely independent of, and behind, real content.

**Low-power fallback — mandatory, three separate triggers, any one is sufficient to disable:**
1. **`prefers-reduced-motion: reduce`.** Already the dominant discipline in `app/globals.css` — every single keyframe block in that file has a matching `@media (prefers-reduced-motion: reduce)` override, most falling back to a plain opacity fade or `animation: none`. This is not a suggestion in this codebase, it's the established, universal pattern. Every new animation must ship with its own reduced-motion fallback in the same PR, no exceptions.
2. **Low battery.** Not yet implemented anywhere in the codebase (checked: no `getBattery()` usage found). New work for Prompts 1–8: gate ambient-only motion (never core functional animation) behind the Battery Status API where available, falling back gracefully where it isn't (most browsers have deprecated/restricted it — treat its absence as "don't gate," not as an error).
3. **Older/low-power devices.** No device-tier detection exists yet either. Where feasible, a cheap proxy (`navigator.hardwareConcurrency` or a simple frame-timing check) can stand in; this is lower priority than the other two triggers since `prefers-reduced-motion` already covers the accessibility-critical case.

**Reduced-motion accessibility support is mandatory for every animation in the app, ambient or not** — this line applies to §3 through §13 in full, not just this section.

---

## 11. Living Dashboard Rules

The Home dashboard (`app/dashboard/page.tsx`) is a Tool by pacing (§2) but the app's primary example of "same information, evolving presentation" — it must never look identical two days in a row.

- **Time-of-day greeting and palette shifts.** The hero (`components/dashboard/HomeHero.tsx`) already carries a photo hero with a dark diagonal gradient and a greeting; extend this with a genuine time-of-day read (morning/midday/evening tone shift in the greeting copy and gradient warmth), not just a static "Hello."
- **Card prioritization logic.** The current zoned layout (Quick Actions, Today, Your Path, What Root Is Noticing, Trends, Coming Up — per `project_home_dashboard_redesign`) is fixed-order today. The living version reorders or resizes zones based on real state: a member with a fresh, unread finding sees "What Root Is Noticing" surface higher; a member mid-Reset-Plan sees "Your Path" surface higher. Reordering must be driven by real state, per the Honest Discovery Rule (§7) — never a fake "for you" heuristic with nothing behind it.
- **Subtle celebration states.** When something real just happened — a milestone, a completed assessment, a streak-free growth moment (§7) — the relevant card gets a one-time celebratory treatment (the gold-sweep/draw-check vocabulary from §3/§9), gated the same way `useCloseScreenReveal` gates the closing screens: once per real event, never on every visit.
- **Discovery moment slots.** Reserve visual space in the "What Root Is Noticing" zone specifically for new findings crossing the Progressive Trust Timeline (§12) — this is where a member first sees that Root has unlocked a new kind of insight about them.
- Scroll-based reveal (`components/dashboard/RevealOnScroll.tsx`, already respects `prefers-reduced-motion`) stays as the entrance mechanism for zones; this section is about what's *inside* each zone changing, not about re-litigating how zones enter.

---

## 12. Progressive Trust Timeline

What Root is willing to say grows as evidence accumulates — this is the Honest Discovery Rule (§7) applied over time, not a marketing gimmick. An insight type is *unlocked* only once the underlying data genuinely supports it; it is never faked early to seem more impressive.

| Stage | What Root can now say | Backed by |
|---|---|---|
| Week 1 | Simple observations ("I noticed your sleep was shorter last night") | A single day's check-in/log data |
| Week 2 | Connections ("I noticed your energy dips on the days after shorter sleep") | Multi-day co-occurrence, still descriptive |
| Week 3 | Predictions ("Based on last night, today may feel like a lower-energy day") | Enough repeated co-occurrence to forecast forward, not just describe backward |
| Month 2 | Patterns ("This has now happened four times this month") | A named recurring pattern, not a one-off connection — this is exactly what `lib/intelligence-engine/crossAssessmentCorrelations.ts` (the real Spearman correlation engine, `project_correlation_engine`) and `member_pattern_states` already compute |
| Month 3 | Relationships ("Your sleep and your stress check-ins move together") | Cross-domain correlation with real statistical grounding, not just same-domain repetition |
| Month 6 | Forecasting | Enough longitudinal history for Root to project forward with real confidence, not a guess dressed as one |

This ladder is already architecturally possible today, not purely aspirational: the Universal Health Finding Registry (`registry_entries`, `docs/BUILD_STATUS.md` §"Built & Complete #2") and the correlation engine feeding `member_pattern_states` are real, shipped systems this timeline can read from. What's new here is the *presentation discipline*: gating which stage of language a given member's Root is allowed to use based on how much real evidence that specific member has, not unlocking richer-sounding copy on a fixed calendar regardless of whether the data backs it.

---

## 13. Signature Moments

One unforgettable moment per Experience (assessment, Reset Plan, major milestone): the screen quiets, everything fades, one sentence, a pause, then the reveal.

**This template is not hypothetical — it is already built and shipped**, in `components/closing-screen/ClosingScreenPrimitives.tsx`, for Life Signal Check and Core Values Snapshot's closing screens (per that file's own header: *"the premium payoff closing screen redesign"*). This section formalizes that real implementation as the required pattern for every future Experience's closing moment.

### The template, with real timing

1. **Quiet.** No new content enters until the member's already-settled on the closing screen — no simultaneous reveals competing for attention.
2. **One sentence.** The screen states the single headline result plainly, per §6's density rule — not a paragraph of scoring detail.
3. **Pause**, then the staged reveal begins: `useDelayedReveal` gates *mounting* the next piece of content (not just CSS-hiding it) until its delay has elapsed — critical detail, because a typewriter effect merely hidden by `opacity: 0` would finish typing invisibly before ever becoming visible. Mount-gating, not visibility-gating.
4. **The reveal itself:** a checkmark draws its own path (`.mef-close-check-draw`, 500ms, draw curve, §4) inside a circle that draws its own ring (`.mef-close-check-circle`, 450ms, `ease-out`) — not an instant icon swap.
5. **A single, one-shot gold sweep** (`.mef-close-gold-sweep`, 900ms, `ease-in-out`, 500ms delay) crosses the just-completed item exactly once. Never loops — a looping celebration stops reading as a celebration.
6. **The journey/progress line fills** (`JourneyProgressLine`, `ProgressConnector` at Grow-type 700ms) to reflect the real completion count, landing a beat after the sweep.

**First-completion-only, by design.** `useCloseScreenReveal` gates the entire staged sequence behind a `localStorage` key unique per experience+session (`mef-close-seen:{storageKey}`) — every revisit after the first renders the final, settled state instantly, no replay. This is the mandatory pattern for every Signature Moment: **ceremony exactly once per real milestone, instant and calm on every return visit.** A member should never feel like they're sitting through the same "movie" twice.

**Reduced motion:** the entire staged sequence is skipped outright (not merely sped up) when `prefers-reduced-motion: reduce` is set — `useCloseScreenReveal` checks this before ever setting `play = true`. This is stricter than most of §3's per-animation fallbacks (which usually substitute a plain fade) and is the correct call specifically for Signature Moments: a multi-second staged sequence has no dignified "reduced" version, so it simply doesn't run.

---

## 14. Implementation Map

Proposed mapping of this Bible's sections to Prompts 1 through 8. **This mapping is this document's own proposal, not a pre-existing build plan handed down separately** — no Prompts 1–8 spec was provided alongside Prompt 0. Confirm or adjust this map before starting Prompt 1; either way, once confirmed, each prompt should cite its row here directly rather than re-deriving scope.

| Prompt | Focus | Bible sections implemented |
|---|---|---|
| **1** | Motion infrastructure: formalize the timing scale and easing curves as real, reusable Tailwind/CSS tokens; audit every existing `app/globals.css` keyframe against §3/§4 and close any gaps (e.g. the missing Instant/100ms tier, the not-yet-built Float type) | §3 (Animation Vocabulary), §4 (Timing and Easing Standards) |
| **2** | Screen classification audit: walk the full §2 inventory, confirm/correct each Moment vs. Tool call against how the screen actually behaves today, and flag any Tool that's accidentally carrying Moment-style pacing (or vice versa) | §2 (Screen Classification) |
| **3** | Onboarding and Welcome: apply §5's pacing template and §6's density rules end-to-end across the Welcome and Onboarding Moments, since these are the member's first impression | §5 (Cinematic Pacing), §6 (Information Density), §13 (Signature Moments, for onboarding completion) |
| **4** | Daily Tools micro-interactions: apply §9 across Check-In, Food Lens, Movement, Protein Ledger — press/lift/ripple/fill/success/loading/empty states, with zero pacing changes since these are Tools | §9 (Micro-Interaction Standards) |
| **5** | Living Dashboard: implement §11's time-of-day shifts, real prioritization logic, celebration states, and discovery slots on `app/dashboard/page.tsx` | §11 (Living Dashboard Rules) |
| **6** | Assessment closing screens: extend `ClosingScreenPrimitives.tsx`'s already-proven template (§13) to every assessment that doesn't yet have it (WBSA, Readiness Pulse, Primal Pattern, the generic points-scored engine, Reset Plan) | §13 (Signature Moments), §5 (Cinematic Pacing) |
| **7** | Root's voice and copy pass: close the two real gaps identified in §7 (no-guilt return copy; the 11 bare "Continue" buttons that fall inside Moments) plus a full em-dash/punctuation audit per §8 | §7 (Root's Behavior Rules), §8 (App Copy Rules) |
| **8** | Ambient motion, accessibility, and the Progressive Trust Timeline: build the low-power/battery/device-tier fallback triggers from §10 that don't exist yet, and wire §12's evidence-gated insight-language ladder into the intelligence surfaces (`/noticing`, `/root-map`, `/insights`) that already have the underlying data | §10 (Ambient Motion Rules), §12 (Progressive Trust Timeline) |

---

*End of v1. This document should be updated, not superseded, as Prompts 1–8 land — each prompt's actual implementation should be checked against its row above and this Bible corrected if reality diverges from the plan.*
