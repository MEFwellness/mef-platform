# Four Doctors Assessment — Extraction Spec

Source: 5 score-sheet images provided by the user — "Dr. Happiness,"
"Dr. Quiet," "Dr. Diet," "Dr. Movement" (one YES/NO questionnaire page
each), plus a combined "Suggested Use of Exercise" master lookup table.
Transcribed verbatim (wording, spelling, and punctuation preserved as
printed). This document is the reverse-engineered implementation spec.
No application code has been written from it yet. A structured data file
(`questionnaire.json`) sits alongside this spec and mirrors it 1:1.

Every question is single-select Yes/No. Every option is worth either 0 or a
fixed point value printed next to it. Higher score = worse (this is a
lifestyle-gap/risk questionnaire, not a wellness score — nearly every
question is phrased as a positive practice, and answering **No** — i.e.
lacking that practice — is what scores points; **Yes** always scores 0).

Four questions on the Dr. Quiet page are gender-specific (2 framed "Men,"
2 framed "Women"). Nothing else in the instrument branches. See §6.

---

## 1. Categories (sub-questionnaires)

The instrument is composed of 4 categories ("Doctors"), each independently
scored, each rolled into one master "4 Doctor Total."

| #   | Category                                            | # Questions                                 | Sum of question points (computed)                       | Printed "4 Doctor Total" column max |
| --- | --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| 1   | Dr. Happiness                                       | 10                                          | **160**                                                 | 150                                 |
| 2   | Dr. Quiet                                           | 10 (8 apply to any one respondent — see §6) | **100** (all 10) / **80** (8, one gender pair excluded) | 110                                 |
| 3   | Dr. Diet                                            | 20                                          | **220**                                                 | 230                                 |
| 4   | Dr. Movement                                        | 14                                          | **150**                                                 | 150                                 |
| —   | **4 Doctor Total (per respondent, achievable max)** | 54 (8 apply from Dr. Quiet)                 | **610**                                                 | 650                                 |

Every question is binary: `Yes` / `No`, each with its own point value.
Options are listed as printed; the point value is shown for whichever
option is non-zero (the other option is always 0 unless noted).

---

## 2. Category: Dr. Happiness — Max 160

| #   | Question                                                                                                                      | Yes | No  |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| 1   | Do you have an overarching dream/legacy for your life?                                                                        | 0   | 20  |
| 2   | Do you have clearly defined goals to achieve your dream?                                                                      | 0   | 10  |
| 3   | Do you have a clear definition of what "happiness" is for you?                                                                | 0   | 10  |
| 4   | Do you Love yourself?                                                                                                         | 0   | 20  |
| 5   | Can you look into your own eyes in the mirror and honestly say, "I love you" to yourself?                                     | 0   | 20  |
| 6   | Do you have clearly defined core values regarding your needs for rest, inner spiritual practice, food, exercise and movement? | 0   | 10  |
| 7   | Do you feel happy about yourself and your life without needing to use or take any form of stimulants or drugs?                | 0   | 10  |
| 8   | Do you make time for unbound play, art or unstructured activities each day?                                                   | 0   | 20  |
| 9   | If you were to die today, would you die knowing that you have lived fully?                                                    | 0   | 20  |
| 10  | Are you doing what you love to do to make a living?                                                                           | 0   | 20  |

`Total: 20+10+10+20+20+10+10+20+20+20 = 160`

---

## 3. Category: Dr. Quiet — Max 100 (all 10) / 80 (8, per respondent)

| #   | Question                                                                                                                        | Yes | No  | Applies to |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --- | --- | ---------- |
| 1   | Do you get eight hours of sleep each night?                                                                                     | 0   | 10  | everyone   |
| 2   | Do you have your head on the pillow by 10:00pm most nights?                                                                     | 0   | 5   | everyone   |
| 3   | Upon rising, are you "quick" to get with it?                                                                                    | 0   | 5   | everyone   |
| 4   | Men: Do you have a healthy erection most mornings?                                                                              | 0   | 10  | men        |
| 5   | Men: Is your sexual performance optimal; can you bring a partner to orgasm without losing your erection?                        | 0   | 10  | men        |
| 6   | Women: Are you free of menstrual irregularities or vaginal dryness?                                                             | 0   | 10  | women      |
| 7   | Women: Do you have a healthy interest or desire for sex most days?                                                              | 0   | 10  | women      |
| 8   | Do you find yourself able to function well without coffee, tea, chocolate (cacao) or the use of stimulants throughout your day? | 0   | 10  | everyone   |
| 9   | Can you work and play throughout your day without feeling the need to sleep/nap?                                                | 0   | 20  | everyone   |
| 10  | Do you make adequate time for introspection, self-reflection and spiritual practice each day?                                   | 0   | 10  | everyone   |

`6 always-applicable questions: 10+5+5+10+20+10 = 60`
`+ one gender pair (either Q4+Q5, or Q6+Q7): 10+10 = 20`
`Per-respondent achievable max: 80`

---

## 4. Category: Dr. Diet — Max 220

| #   | Question                                                                                                                                             | Yes | No  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| 1   | Is your diet composed of mostly organic produce (vegetables and fruits)?                                                                             | 0   | 10  |
| 2   | Do you eat primarily free-range organic meats?                                                                                                       | 0   | 20  |
| 3   | Do you include wild caught fish in your diet?                                                                                                        | 0   | 10  |
| 4   | Do you eat a variety of foods each day during the week and as seasons change?                                                                        | 0   | 10  |
| 5   | Is your diet composed primarily of unprocessed whole foods?                                                                                          | 0   | 10  |
| 6   | Do you change how much flesh foods you eat, based on your body-mind needs day-to-day?                                                                | 0   | 10  |
| 7   | Do you eat in a calm quiet atmosphere and taste and thoroughly chew your food?                                                                       | 0   | 10  |
| 8   | Do you move at least 12 inches (30cm) of feces daily and feel a sense of complete elimination?                                                       | 0   | 10  |
| 9   | Is your digestion, assimilation and elimination optimal?                                                                                             | 0   | 10  |
| 10  | Is your skin healthy?                                                                                                                                | 0   | 10  |
| 11  | Are you drinking approximately half your bodyweight in ounces of high quality water each day?                                                        | 0   | 10  |
| 12  | Do you feel satiated after eating?                                                                                                                   | 0   | 10  |
| 13  | Do you feel energized after eating?                                                                                                                  | 0   | 10  |
| 14  | Are you free of food cravings such as chocolate or cacao, sugary treats, grains or fats?                                                             | 0   | 10  |
| 15  | Do your bodily odors (breath, armpits, etc.) smell neutral?                                                                                          | 0   | 10  |
| 16  | Do your bowel movements have a healthy earthy smell?                                                                                                 | 0   | 10  |
| 17  | Do you tend to eat three meals a day at regular times?                                                                                               | 0   | 10  |
| 18  | Are your teeth and gums healthy?                                                                                                                     | 0   | 10  |
| 19  | Are you rotating your foods and drinks (water not included) so that you are not eating the same basic foods more than once every three to four days? | 0   | 20  |
| 20  | Is either breakfast or lunch the largest meal of your day?                                                                                           | 0   | 10  |

`Total: 10+20+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+10+20+10 = 220`

---

## 5. Category: Dr. Movement — Max 150

| #   | Question                                                                                        | Yes | No  |
| --- | ----------------------------------------------------------------------------------------------- | --- | --- |
| 1   | When you take a deep breath, does your belly expand before your chest moves?                    | 0   | 10  |
| 2   | Do you get a minimum of 30 minutes of exercise each day?                                        | 0   | 10  |
| 3   | Can you exercise regardless of current body and movement challenges?                            | 0   | 10  |
| 4   | Do you consider yourself at optimal weight and body fat for your body?                          | 0   | 10  |
| 5   | Is your metabolism functioning optimally?                                                       | 0   | 20  |
| 6   | Do you easily put on muscle mass/strength with resistance exercise?                             | 0   | 10  |
| 7   | Do you consider yourself emotionally stable?                                                    | 0   | 10  |
| 8   | Can you maintain mental focus easily and naturally?                                             | 0   | 10  |
| 9   | Do you stretch and mobilize your body to maintain structural balance and energy flow regularly? | 0   | 10  |
| 10  | Does your body look and feel younger than your actual age?                                      | 0   | 10  |
| 11  | Is your body-mind healthy and fit enough to effectively support the creation of your dreams?    | 0   | 10  |
| 12  | Can you exercise easily without the use of stimulants or performance enhancements?              | 0   | 10  |
| 13  | Do you find that your thoughts and beliefs support your overarching dreams and goals?           | 0   | 10  |
| 14  | Do you warm up quickly and feel good and fully functional to begin exercise?                    | 0   | 10  |

`Total: 10+10+10+10+20+10+10+10+10+10+10+10+10+10 = 150`

---

## 6. Gender-conditional questions (Dr. Quiet, §3)

Questions 4–5 ("Men") and 6–7 ("Women") are mutually exclusive branches of
the same underlying construct (sexual health), not four independent
questions everyone answers. No field anywhere in the current product
schema (profile, onboarding) stores gender, and this instrument is the
only place that needs it.

**Resolution**: a single, product-authored (non-verbatim, not part of the
scored instrument) intake prompt — "To ask the right two questions in this
section, how do you identify?" (Male / Female / Prefer not to say) — is
shown once, immediately before question 4, at take-time. It is stored as
per-assessment-attempt context, not written to the member's profile. See
the engine `contextQuestions` mechanism (implementation plan, Phase 1).
Selecting "Prefer not to say" skips both pairs; that respondent's Dr. Quiet
achievable max drops to 60 (see §3) and their category score/priority is
computed against that smaller max, not against 80.

---

## 7. Scoring & Master "Suggested Use of Exercise" Table

### Category score

`categoryScore = sum(points of the single option selected per question in that category, counting only questions that apply to this respondent)`

### 4 Doctor Total

`total = sum(categoryScore for all 4 categories)`

### Master table (as printed)

| Suggested Use of Exercise          | 4 Doctor Total              | Dr. Happiness              | Dr. Quiet                | Dr. Diet                    | Dr. Movement               |
| ---------------------------------- | --------------------------- | -------------------------- | ------------------------ | --------------------------- | -------------------------- |
| Work-In (red)                      | 650 / 580 / 510 / 410 / 310 | 150 / 140 / 130 / 100 / 70 | 110 / 100 / 90 / 80 / 70 | 230 / 200 / 180 / 130 / 100 | 150 / 140 / 120 / 100 / 70 |
| Caution — In-Out Balance? (yellow) | 280 / 250 / 240 / 230 / 200 | 60 / – / – / – / 50        | 60 / – / 50 / – / 40     | 90 / 80 / 70 / 60 / 50      | 60 / – / – / – / 50        |
| Workout To Ability (green)         | 150 / 100 / 80 / 60 / 40    | 40 / 30 / 20 / 10 / 0      | 30 / 20 / – / 10 / 0     | 40 / 30 / 20 / 10 / 0       | 40 / 30 / 20 / 10 / 0      |

This is a printed discrete lookup grid (a nomogram meant for a member to
place one mark per column on paper), not the contiguous min/max bands this
product's scoring engine requires. It's also built on the printed column
maxes (150/110/230/150/650), which — per §1 — don't match the verified
per-question sums for 3 of the 4 categories.

**Resolution**: each row's value is treated as a percentage of that
category's own _printed_ column max (matching the paper form's intent —
severity as a proportion of the full scale), then that percentage is
re-applied to the category's _verified_ (question-sum) max to get the
digital band boundary. This preserves the instrument's relative severity
grading even where the sheet's absolute printed numbers don't reconcile,
following the same principle used elsewhere in this platform's assessment
documentation: question-level truth takes precedence over a summary-sheet
number. `low.min` is 0 in every case (there's no ambiguity at the floor).

| Category           | Printed max | Verified max | Printed red-floor / yellow-floor | Scaled `high.min`             | Scaled `moderate.min`         |
| ------------------ | ----------- | ------------ | -------------------------------- | ----------------------------- | ----------------------------- |
| Dr. Happiness      | 150         | 160          | 70 / 50                          | 70/150 × 160 = **75**         | 50/150 × 160 = **55**         |
| Dr. Quiet          | 110         | 80           | 70 / 40                          | 70/110 × 80 = **50**          | 40/110 × 80 = **30**          |
| Dr. Diet           | 230         | 220          | 100 / 50                         | 100/230 × 220 = **95**        | 50/230 × 220 = **50**         |
| Dr. Movement       | 150         | 150          | 70 / 50                          | 70 (no scaling — max matches) | 50 (no scaling — max matches) |
| **4 Doctor Total** | 650         | 610          | 310 / 200                        | 310/650 × 610 = **290**       | 200/650 × 610 = **190**       |

### Priority bands (final, used in `questionnaire.json`)

| Category           | High Priority | Moderate Priority | Low Priority |
| ------------------ | ------------- | ----------------- | ------------ |
| Dr. Happiness      | 75–160        | 55–74             | 0–54         |
| Dr. Quiet          | 50–80         | 30–49             | 0–29         |
| Dr. Diet           | 95–220        | 50–94             | 0–49         |
| Dr. Movement       | 70–150        | 50–69             | 0–49         |
| **4 Doctor Total** | **290–610**   | **190–289**       | **0–189**    |

---

## 8. Verification

| Category           | Computed sum                       | Printed sheet max | Match?                                                  |
| ------------------ | ---------------------------------- | ----------------- | ------------------------------------------------------- |
| Dr. Happiness      | 160                                | 150               | ❌ resolved — see §7, scaled bands, `verified: false`   |
| Dr. Quiet          | 100 (all 10) / 80 (per-respondent) | 110               | ❌ resolved — see §6–7, scaled bands, `verified: false` |
| Dr. Diet           | 220                                | 230               | ❌ resolved — see §7, scaled bands, `verified: false`   |
| Dr. Movement       | 150                                | 150               | ✅ `verified: true`                                     |
| **4 Doctor Total** | 610 (per-respondent achievable)    | 650               | ❌ resolved — see §7                                    |

**Status**: content captured and internally consistent bottom-up (question
→ category max → total max) for all 4 categories. No corrected/uncropped
source page is available to fully close the 3 remaining discrepancies
against the master table — they're resolved via the proportional-scaling
method in §7 (documented, not silent) and each affected category is
marked `verified: false` with an
`amendment` note in `questionnaire.json`, so a content reviewer can
tighten these bands later against the original source book if it becomes
available, without that being a breaking change (question text, options,
and point values themselves are already fully verified against the
provided images — only the band _thresholds_ carry this caveat).
