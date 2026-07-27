# UX & Visual Design Audit — Daily Member Loop (Batch 1)

**Date:** 2026-07-27
**Scope:** Home, Today, every screen of the morning check-in, and the check-in ending screen. Nothing else audited this pass.
**Method:** Visual review only, against the screenshots in `/docs/screens/`. No code was read to form any judgment below — everything here is what actually renders. No code was changed.

## Images viewed

**Home:** `dashboard-populated.png`, `dashboard-empty.png`
**Today:** `today-populated.png`, `today-empty.png`
**Morning check-in — cinematic mode (brand-new member, one question per screen):** `checkin-morning-01-empty.png` through `checkin-morning-10-empty.png` (all 10)
**Morning check-in — section mode (returning member, grouped questions per screen):** `checkin-morning-01-populated.png` through `checkin-morning-04-populated.png` (all 4)
**Check-in ending screen (the in-flow "Today, in one color" moment):** `checkin-morning-ending-empty.png`, `checkin-morning-ending-populated.png`

**Excluded, and why:**

- `checkin-result-empty.png` and `checkin-result-populated.png` — both images show only a gray loading skeleton, not real content. Per this audit's own rule, a screen I haven't actually seen render doesn't get audited. This page needs to be re-captured (with a short wait after navigation) before it can be reviewed.
- `dashboard-populated-tablet.png`, `dashboard-empty-tablet.png`, `today-populated-tablet.png`, `checkin-morning-01-populated-tablet.png` — tablet variants exist but weren't opened this pass; this batch is mobile-only by design, matching the app's own mobile-first positioning.

**A capture-method caveat, not a screen finding:** in the raw `today-populated.png` file, the Home/Check-in/Today tab bar appears to visibly repeat partway down the page, inside the Movement card. This is very likely an artifact of how a fixed-position element gets flattened into one continuous full-page image, not something a real person scrolling the page would ever see — a fixed nav bar doesn't leave a ghost copy behind as you scroll past it. It's called out here only so it isn't mistaken for a real bug; it is not carried into the findings below.

---

## Home

### Populated (member with history)

**What's working:**

- The hero — full-bleed sunset-over-water photo, logo lockup, avatar, "Good morning, Member" in Cormorant Garamond over a dark scrim — is genuinely premium. It reads closer to Calm's or Oura's app-open moment than to a typical SaaS dashboard, and the palette is respected throughout (no stray colors in the hero itself).
- "Today's Numbers" (Water/Sleep/Stress/Pain/Mood/Digestion/Movement) is a clean, evenly-weighted grid — every card is the same size, same icon-left layout, same type scale. Nothing here is crowded or misaligned.
- "What Root Is Noticing" uses two different image treatments (a dark silhouette card and a lighter map-style card) placed side by side — deliberate visual variety rather than a wall of identical white cards, and it doesn't fight the two anchor colors.
- "Why You're Seeing This" / "Ask your coach why" pattern (also on Today, see below) is the single best trust element in this batch. Naming the reason behind a recommendation, in plain language, with an escape hatch to ask a human, is exactly what separates a premium coaching product from a generic tracker.

**What's weak:**

- The wearable-connect card ("Get the Most From Root") sits directly on top of the member's own real data on first paint — she hasn't seen her own Root Score, her streak, or her Daily Brief yet, and the first thing asking for her attention is a device-connection upsell. It's a real card with a real dismiss option ("Maybe Later"), not a bug, but the _timing_ competes with the hero's own "welcome back" moment instead of following it.
- The Energy Trend card renders with a title ("Last 3 check-ins") and no visible chart line at all. This account has real check-in history, so an empty chart is unexpected — but a chart that draws itself in on mount (documented elsewhere as a clip-path reveal) can also just be caught mid-animation by a screenshot. I can't tell which from a still image, and I'm not going to guess. Someone should load `/dashboard` in a real browser and confirm the line actually appears.

**Premium-feel read:** the hero alone would hold up next to Oura or Calm; the wearable modal's timing is the one thing that undercuts it on first open.

### Empty (brand-new member, no check-ins yet)

**What's working:**

- The empty state doesn't try to fake data or show zeroed-out charts — it replaces the whole "Today's Numbers" section with a single, calm card: an icon, "Let's get started," one sentence explaining what check-ins unlock, and one button. That restraint is the right call for a first-run screen and is worth calling out explicitly rather than inventing a change.
- The single CTA ("Complete your first check-in") is the only actionable element on the page — hierarchy here is unambiguous.

**What's weak:** nothing worth flagging. This is the strongest screen in the batch.

**Premium-feel read:** calm, confident, and un-crowded — this is the bar the rest of the loop should be held to.

---

## Today

### Populated

**What's working:**

- The header block (eyebrow label, Cormorant "Today," two status pills, italic tagline) establishes a clear sense of place — she knows what day-type this is ("Monday · Planning") and what mode ("Educate") without reading a paragraph.
- "Today's Lesson" is genuinely excellent: a real citation (CDC), a 2-minute time estimate, and a "Learn More" link. This is the single best "does this feel high-end" moment on the page — it reads like content a real coach would hand someone, not filler copy.
- "Talk to Root" offering two low-friction options ("Through today's challenge" / "I need an easier option") and the "Save for later / Not today" pair under "Mark today's action complete" are both quietly well-considered — neither forces a binary "did it / failed it" choice, which matters for a wellness app people are supposed to want to keep opening.
- "Why You're Seeing This" repeats the trust pattern from Home. Good — this should stay consistent everywhere it appears.

**What's weak:**

- The water tracker's "0 of 8 cups today" renders the "0" in red. Zero cups at whatever time this check-in happened is a neutral, expected state, not a failure state — red is normally an alarm/error color in this same UI (it's used that way on the stress and pain scales later in this batch). Using it here for "you haven't logged yet today" risks a small jolt of unwarranted guilt on a screen whose whole job is to feel supportive.
- "Today's Focus" and "A Note From Root" sit back-to-back and say almost the same thing in different words (both explain that movement is today's focus because of a check-in pattern). Adjacent cards repeating the same point is the kind of thing that makes a long page feel longer than it needs to.
- The "Update today's check-in" button sits inside a card that's already dark green, and the button itself is only a slightly darker green — the primary action on this card doesn't pop the way a primary action should. Worth confirming the actual contrast between button fill and card fill.
- This is a long page — roughly five phone-screens of continuous content before reaching the feedback controls at the bottom. Nothing on it is individually bad, but the redundancy above is a concrete place to shorten it without cutting anything a member actually needs.

**Premium-feel read:** the coaching copy and "Today's Lesson" are the best writing in the batch; the page just asks for more scrolling than its own content strictly requires.

### Empty

**What's working:** identical restraint to Home's empty state — one card, one sentence, one button, no attempt to show placeholder charts or fake activity.

**What's weak:** nothing to flag.

**Premium-feel read:** consistent with Home's empty state — calm and honest about having nothing to show yet.

---

## Morning check-in — cinematic mode (brand-new member, one question per screen)

Screens 1, 2, 3, 5, 6, 7, 9 are all the same template applied to a different single question — a labeled five-point scale (faces, fill-bars, rings, or plain option rows) with one "Continue" button. That template is genuinely good and I'm not going to write the same paragraph seven times:

**What's working (applies to all seven of the above):**

- Every scale uses a distinct, purpose-built visual metaphor — faces for mood, a filling pill for energy, concentric rings for stress, moons for sleep quality — rather than five identical generic buttons relabeled each time. That's real design effort and it reads calm and considered, not clinical.
- The selected option is unmistakable everywhere it uses a filled card (mood, energy) — no doubt what's chosen.
- The progress dial (dots + a Home button + a back chevron) is present and identical on every screen, so orientation and exit are never in question.

**What's weak, specific to individual screens in this set:**

- **Screen 7 ("How groggy did you feel when you first woke up?")** is the one scale in the entire flow that drops to bare numbers (1–5) with no word anchors at all. Every other five-point scale in this batch — mood, energy, stress, sleep quality, and the later pain-severity scale — labels both ends in words ("Very Low… Excellent," "None… Severe"). Here, nothing tells her whether 1 or 5 is the groggy end. That's a real, isolated inconsistency, not a style preference.
- **Screen 3 ("stress")** — the selected state uses a small rust/brown color swatch under "Calm," while the unselected ramp indicators under each option (visible faintly beneath each icon) suggest a green-to-red severity ramp where "Calm" should read as the cool/green end. A brownish-red selected fill on the mildest option looks backwards relative to its own ramp, and it's also a color that isn't one of the three locked brand colors. Worth a direct look at what color `CompressingRings`' selected state actually uses for each of its five options.

**Screen 4 (sleep quality + bedtime/wake dial), screen 8 (pain location), and screen 10 (notes) are distinct enough to call out individually:**

- **Screen 4** is the best single screen in this entire batch. The circular bedtime/wake dial — warm gradient ring, Cormorant "8h" centered, "Bedtime 10:30 PM / Wake 6:30 AM" readout — is a genuinely premium piece of UI, on par with Oura's own sleep-ring visualization. Say so plainly: nothing here needs to change.
  - The one real weakness on this screen: the five sleep-quality moons' selected state is a **solid gold fill covering the entire tile** (icon and label both turn white against a gold card). The brief for this audit states gold is an accent and is never a fill for a whole card — this is a direct instance of that. (Worth knowing before deciding what to do about it: this was a deliberate, already-shipped fix from a prior task, not an oversight — so this is a real tension between the current brand rule and a decision already made, not a new mistake. Flagging it because the rule was given to me as a hard constraint for this review; the mood scale on the very first screen of this same flow has the identical pattern.)
- **Screen 8 ("Where is it, mainly?")** has a real, reproducible layout bug: the persistent "Continue" button visually overlaps the last two options in the list ("Widespread" and "Other"), sitting directly on top of their text. This list has ten stacked full-width rows plus the standard header — enough content that a sticky bottom button without matching bottom padding will always end up covering whatever content happens to scroll into its footprint. See the Critical item in the priority list below; this is not a one-off, it recurs on every section-mode screen too.
- **Screen 10 ("Anything else")** is clean and low-pressure: an optional textarea, a "Nothing to add today" pill, and the coach-note opt-in card explicitly stating "Only sent if you check this." That last line matters — it removes any anxiety about accidentally alerting a coach, which is exactly the kind of small trust-building detail this audit is meant to protect.

**Premium-feel read for this whole set:** the individual question templates are calm, distinctive, and clearly considered — the sleep dial in particular is a real showpiece — but the groggy-scale's missing labels and the pain screen's button overlap are the kind of small, concrete inconsistencies that chip away at "this was made by people who sweat every detail."

---

## Morning check-in — section mode (returning member, grouped questions per screen)

**What's working:**

- Grouping related questions (mood/energy/stress together, sleep together, body/pain together, notes/habits together) instead of one-per-screen is the right call for a returning member who already knows the drill — it respects her time, which cinematic mode explicitly should not (and doesn't) do for a first-timer.
- "You've already logged this day. Update anything below." at the top of every screen is a clear, reassuring statement of state — she immediately knows this is an edit, not a fresh entry, and the final button correctly says "Update check-in" rather than "Save check-in."
- Selected-state colors for the individual scales are unambiguous — no doubt which option is chosen anywhere in this set.

**What's weak:**

- **This is the same overlap bug as cinematic screen 8, and it happens on every single one of these four screens** — screen 1's "Continue" button sits on top of the "About how much screen time…" question and its first answer option; screen 2's button covers the yes/no follow-up beneath the sleep dial; screen 3's button covers "Knees" through "Other" in the pain-location list; screen 4's button covers roughly a third of the coach-note card. This is systemic, not incidental: any section-mode screen whose grouped questions add up to more than one phone screen's height will have real content sitting behind the button. Because these are grouped screens with several questions each, this is the more consequential of the two occurrences — it isn't an edge case that only shows up once with ten pain-location options, it's the normal state of this mode.
- Every one of these four screens repeats the full descriptive header ("A few gentle questions so Root understands how today actually feels. Takes about a minute.") and the "Morning Readiness / Evening Reflection (optional)" tab switcher, identically, every time. That paragraph is appropriate framing for screen 1 of a flow; by screen 3 or 4, mid-answer, it's dead weight pushing the actual question further down a screen that's already fighting for vertical space against the overlap bug above.
- The stress scale's selected-color inconsistency noted under cinematic screen 3 is visible again here (screen 1) — same finding, same root cause, now confirmed present in both modes.

**Premium-feel read:** the pacing decision (group for returning members, one-at-a-time for first-timers) is smart and worth keeping; the button-overlap bug is the one thing in this entire batch serious enough to actually erode trust, because it happens on every screen of the mode most returning members will see every single day.

---

## Check-in ending screen ("Today, in one color")

Both captures (new-member and returning-member) show the identical layout: a soft blurred color orb, "Today, in one color," "Built from how you actually answered — nothing added," and a Continue button.

**What's working:**

- "Built from how you actually answered — nothing added" is a strong, honest line — it pre-empts any suspicion that the reveal is generic or gamified, which matters for a self-report tool that depends on members trusting it's not nudging them.
- The moment itself — pause, one color, one line, move on — is well-paced. It doesn't overstay its welcome with animation or make her read anything more after a multi-screen check-in.

**What's weak:**

- In **both** captures, across two different accounts with two different sets of answers, the "color" is the same pale, low-saturation grayish-green blur — barely distinguishable from the cream page background behind it. If this moment is meant to be the emotional payoff of the whole check-in ("see today, as a color"), a color that reads as almost no color at all undercuts it. This may be entirely correct behavior for these two particular answer sets, or it may mean the reveal is under-saturated across the board — a static image can't tell me which, but two-for-two identical-looking results is enough to flag as worth checking against a wider range of real answers (e.g., an intentionally rough day vs. an intentionally great one) to confirm the colors are actually distinguishable from each other and from the background.

**Premium-feel read:** the pacing and copy are right; the payoff itself is currently too quiet to actually land as a payoff.

---

## Combined priority list (max 15, ranked by tier)

### Critical

1. **The sticky "Continue" button overlaps question content on every section-mode check-in screen** (`checkin-morning-01` through `-04-populated`) — add enough bottom padding to the scrollable content that the button never sits on top of an option, a question, or the coach-note card. This is the one item in this whole batch that can cause a wrong or skipped answer, not just a wrong feeling.
2. **The same overlap bug recurs on cinematic screen 8** (pain-location list, 10 options) — same root cause, same fix, listed separately only because it's a different screen and both need to be confirmed fixed independently.

### High impact

3. **The groggy scale (cinematic screen 7) has no word anchors**, unlike every other five-point scale in the flow — add "Not groggy… Very groggy" (or equivalent) labels to match the rest of the set.
4. **Remove the repeated intro paragraph + Morning/Evening tab switcher from section-mode screens 2–4** — keep them on screen 1 only, so the actual questions sit higher on every subsequent screen.
5. **Confirm the Energy Trend chart on Home actually draws a line for an account with real history** — it currently renders with a title and nothing else; rule out whether this is a true empty state or an animation the screenshot caught too early.
6. **Re-capture `/checkin/result` properly** (both states currently show only a loading skeleton) so this screen can actually be audited — it's the last unreviewed step of the morning flow.

### Medium

7. **Recheck the stress scale's ("CompressingRings") selected-state color** — "Calm" renders in a rust/brown tone that doesn't match its own implied green-to-red severity ramp and isn't one of the three locked brand colors; confirm the five option colors are mapped correctly and stay on-palette.
8. **Resolve the gold-fill tension on the mood scale (all screens) and sleep-quality moons (screen 4)** — both use a solid gold card for the selected state, which this audit's own brief states gold should never do. Since this was a deliberate prior fix, this needs a decision (change the fill, or formally revise the rule) rather than a silent code change.
9. **Change the water tracker's "0 cups" from red to a neutral tone** on Today — zero logged so far today isn't a failure state, and red is otherwise reserved for alarm/high-severity states elsewhere in this same product.
10. **Merge or clearly differentiate "Today's Focus" and "A Note From Root"** on Today — as captured, the two adjacent cards make the same point about movement in different words.
11. **Increase the visual separation between the "Update today's check-in" button and its own card** on Today — a dark-on-dark-green button doesn't pop the way the page's single primary action should.
12. **Verify the check-in ending screen's color reveal produces genuinely distinguishable colors** across a wider range of real answers — two different accounts currently produce the same near-invisible pale tone.

### Nice to have

13. **Reconsider the timing of the wearable-connect modal on Home** — it currently appears before a returning member sees her own Daily Brief/streak on open; consider surfacing it after that first glance, not in front of it.
14. **Shorten Today's path to its own feedback controls** — once item 10 is resolved, re-measure whether the page still runs to roughly five phone-screens of scrolling before "Was this helpful?", and look for one more section that can be tightened.
15. **Double-check the body text color used for every screen's descriptive subhead** (e.g. "A few gentle questions so Root understands how today actually feels") against the cream background for contrast ratio — it reads as acceptable in these captures but is light enough to be worth measuring directly rather than eyeballing.
