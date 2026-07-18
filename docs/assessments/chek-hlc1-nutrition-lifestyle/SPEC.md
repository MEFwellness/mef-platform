# CHEK Nutrition and Lifestyle Questionnaires for HLC 1 — Extraction Spec

Source: scanned PDF pages provided by user, titled "CHEK Nutrition and Lifestyle
Questionnaires for HLC 1". Transcribed verbatim (wording, spelling/typos, and
punctuation preserved as printed — including "Rice-aroni", "Arbey's",
"as apposed to", and "Nurtasweet").

This document is the reverse-engineered implementation spec. No application
code has been written from it yet. A structured data file
(`questionnaire.json`) sits alongside this spec and mirrors it 1:1.

---

## 1. Categories (sub-questionnaires)

The instrument is composed of 7 categories, each independently scored, each
mapped to one or more CHEK "Zones," and each rolled into one master Total
Score.

| # | Category | Zones | # Questions | Max Score |
|---|----------|-------|-------------|-----------|
| 1 | You Are What You Eat | 1, 2 & 3 | 25 | 130 |
| 2 | Stress | 4 | 12 | 81 |
| 3 | Circadian Health | 2 | 10 | 90 |
| 4 | You Are When You Eat | 3 | 10 | 50 |
| 5 | Digestive System Health | 1, 2 & 3 | 11 | 81 |
| 6 | Fungus & Parasites | 3 & 4 | 13 | 115 |
| 7 | Detoxification System Health | 3 & 4 | 10 | 88 |
| — | **Total Score** | — | **91** | **635** |

Fungus & Parasites max was re-verified against a complete, uncropped scan of
the page (all 13 "No (0)" options legible, no additional questions). The
per-question sum is 115. The master score sheet's printed column max of 195
is treated as a typo in that summary sheet (most likely a 9/1 digit
transposition of "115") rather than a missing question — see §5 and §10.
The Total Score max is corrected from the sheet's printed 715 to **635**
accordingly (130+81+90+50+81+115+88).

Each question is single-select (pick exactly one option/checkbox). Two
question shapes recur throughout:

- **Binary**: `Yes (n)` / `No (0)`
- **Frequency**: `Yes (check option below)` framing a nested single-select of
  `No (0)` plus 2–4 frequency tiers, each with its own point value (the tiers
  are the actual answer set — "Yes" is not itself a selectable option in this
  shape, it's a header for the checkbox list below it)

One question (Fungus & Parasites Q5) is a plain 3-way multiple choice
(Stress free / Mildly stressful / Very stressful) with no Yes/No framing.

---

## 2. Category: You Are What You Eat (Zones 1, 2 & 3) — Max 130

| # | Question | Type | Options (label → points) | Max |
|---|----------|------|---------------------------|-----|
| 1 | Do you shop less frequently than every four days? | Binary | Yes→1, No→0 | 1 |
| 2 | Do you eat more packaged (frozen or canned) fruits and vegetables than fresh? | Binary | Yes→3, No→0 | 3 |
| 3 | Do you eat more cooked vegetables than raw? | Binary | Yes→3, No→0 | 3 |
| 4 | Do you eat vegetables with less than two meals daily? | Binary | Yes→5, No→0 | 5 |
| 5 | Do you buy more non-organic vegetables than organic vegetables? | Binary | Yes→5, No→0 | 5 |
| 6 | Do you use a microwave oven? | Frequency | No→0, 1-2 times per week→2, 3-4 times per week→5, more than 4 times per week→10 | 10 |
| 7 | Do you eat quick cook grains such as Rice-aroni, Quaker Oats or Minute rice more often than slow cooked organic whole grains? | Binary | Yes→5, No→0 | 5 |
| 8 | Do you eat white bread more often than whole grain breads? | Binary | Yes→5, No→0 | 5 |
| 9 | Do you drink pasteurized/homogenized milk, or eat cheeses frequently? | Frequency | No→0, 1-2 times per week→1, 3 times per week→3, more than 3 times per week→5 | 5 |
| 10 | Do you eat non-organic yogurts that are low fat, presweetened or have fruit added? | Frequency | No→0, 1-2 times per week→1, 3 times per week→3, more than 3 times per week→5 | 5 |
| 11 | Do you eat typical store bought eggs from cage raised chickens (as apposed to free range, grain fed eggs)? | Binary | Yes→5, No→0 | 5 |
| 12 | Do you eat red meat more than once every four days? | Binary | Yes→3, No→0 | 3 |
| 13 | Do you commonly eat meats (beef, chicken, turkey) from sources other than a free-range and hormone-free source? | Binary | Yes→3, No→0 | 3 |
| 14 | Do you eat canned fish more frequently than fresh fish? | Binary | Yes→3, No→0 | 3 |
| 15 | Do you use commercial salad dressings? | Frequency | No→0, once a week→1, twice per week→2, more than 2 times per week→3 | 3 |
| 16 | Do you use Mayonnaise or products containing hydrogenated oils? | Frequency | No→0, once a week→1, twice per week→2, more than 2 times per week→5 | 5 |
| 17 | Do you eat nuts and/or seeds that are roasted and/or salted? | Binary | Yes→1, No→0 | 1 |
| 18 | Do you use white table sugar as a sweetener? | Frequency | No→0, once a week→1, 2-3 times per week→3, more than 3 times per week→5 | 5 |
| 19 | Do you use artificial sweeteners such as Sweet-n-Low, Equal or Nurtasweet? | Frequency | No→0, once a week→1, 2-3 times per week→5, more than 3 times per week→10 | 10 |
| 20 | Do you use standard white table salt? | Binary | Yes→5, No→0 | 5 |
| 21 | Do you eat TV dinners or other highly processed foods more than three times a week? | Binary | Yes→5, No→0 | 5 |
| 22 | Do you eat from fast food restaurants like McDonald's, Arbey's, Wendy's, etc…? | Frequency | No→0, 1-2 times per week→2, 3 times per week→5, more than 3 times per week→10 | 10 |
| 23 | Do you eat from vending machines? | Frequency | No→0, 1-2 times per week→2, 3 times per week→5, more than 3 times per week→10 | 10 |
| 24 | Do you drink tap water? | Binary | Yes→10, No→0 | 10 |
| 25 | Do you eat some form of store bought dessert, such as ice cream, cookies, donuts, cakes or pies after dinner most nights? | Frequency | No→0, once a week→1, 2-3 times per week→3, more than 3 times per week→5 | 5 |

Category Total Score: sum of selected points, range 0–130.
Priority bands (from master score sheet): **High 50–130 · Moderate 30–49 · Low 0–29**

---

## 3. Category: Stress (Zone 4) — Max 81

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Do you eat more or less when stressed than when not stressed? | Binary | Yes→10, No→0 | 10 |
| 2 | Do you worry over job, income or money problems? | Binary | Yes→10, No→0 | 10 |
| 3 | Are any of your relationships causing you stress? | Binary | Yes→10, No→0 | 10 |
| 4 | Do you often feel anxious? | Binary | Yes→5, No→0 | 5 |
| 5 | Do you often feel upset when things go wrong or feel that things go wrong often? | Binary | Yes→5, No→0 | 5 |
| 6 | Do you lash out at others? | Binary | Yes→5, No→0 | 5 |
| 7 | Do you feel your sex drive is lower than normal for you? | Binary | Yes→5, No→0 | 5 |
| 8 | Do you feel stressed due to lack of intimacy in one or more relationships? | Binary | Yes→5, No→0 | 5 |
| 9 | Have you had reduced contact with friends (feeling antisocial) or an increase in contact because you feel you need to vent your frustrations or stresses to others? | Binary | Yes→3, No→0 | 3 |
| 10 | Do you feel isolated or suffer from loneliness? | Binary | Yes→3, No→0 | 3 |
| 11 | Do you take any form of medication prescribed by a physician directly or indirectly related to stress in your life or a psychological disorder? | Binary | Yes→15, No→0 | 15 |
| 12 | Do you lose more than two days of work a year due to illness? | Binary | Yes→5, No→0 | 5 |

Category Total Score: 0–81.
Priority bands: **High 40–81 · Moderate 20–39 · Low 0–19**

---

## 4. Category: Circadian Health (Zone 2) — Max 90

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Do you live in the same time zone you were born in? | Binary (inverted) | Yes→0, No→5 | 5 |
| 2 | Do you travel across time zones more than once a month? | Binary | Yes→10, No→0 | 10 |
| 3 | Do you wake up feeling un-rested and in need of more sleep? | Frequency | No→0, once a week→1, 3 times per week→5, more than 3 times per week→10 | 10 |
| 4 | Do you commonly go to bed after 10:30 PM? | Binary | Yes→10, No→0 | 10 |
| 5 | Are the times you have bowel movements consistent and predictable on a daily basis? | Binary (inverted) | Yes→0, No→5 | 5 |
| 6 | Do you suffer from reduced memory since moving to a new time zone or since traveling across time zones? | Binary | Yes→10, No→0 | 10 |
| 7 | Has your sense of hunger changed from being hungry at breakfast (upon rising), lunch (mid-day) and dinner times (sunset) since moving to a new time zone or traveling across time zones frequently (> 1 x Mo.)? | Binary | Yes→10, No→0 | 10 |
| 8 | Do you wake up at night between 1:00 am and 4:00 am and have a hard time falling back to sleep? | Frequency | No→0, once a week→1, 3 times per week→5, more than 3 times per week→10 | 10 |
| 9 | Do you tend to have a hard time staying awake in the afternoon after eating lunch? | Frequency | No→0, once a week→1, 3 times per week→5, more than 3 times per week→10 | 10 |
| 10 | Do you do shift work that requires you to stay up late at night? | Binary | Yes→10, No→0 | 10 |

Note: Q1 and Q5 are inverted binaries — "No" scores points, "Yes" scores 0 —
exactly as printed on the form (unusual relative to the rest of the
instrument, preserved as-is).

Category Total Score: 0–90.
Priority bands: **High 50–90 · Moderate 30–49 · Low 0–29**

---

## 5. Category: You Are When You Eat (Zone 3) — Max 50

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Do you frequently skip meals? | Binary | Yes→3, No→0 | 3 |
| 2 | Do you typically go more than four hours without eating? | Frequency | No→0, 1-2 times per week→1, 3 times per week→2, more than 3 times per week→3 | 3 |
| 3 | Do you sometimes skip breakfast? | Frequency | No→0, 2 times per week→1, 3 times per week→5, more than 3 times per week→10 | 10 |
| 4 | Do you avoid fats when eating? | Binary | Yes→5, No→0 | 5 |
| 5 | Do you frequently eat carbohydrates (i.e. breads, bagels, cookies, pasta, fruit, cereals, muffins, crackers, chocolate, or candy) by themselves? | Binary | Yes→5, No→0 | 5 |
| 6 | Do you get hungry or crave sweets within two hours after eating a meal? | Binary | Yes→5, No→0 | 5 |
| 7 | Do you use caffeine and/or sugar containing drinks (i.e. coffee, tea, sodas, fruit juices with sucrose, corn syrup or added sugar)? | Frequency | No→0, 1 cup a day→1, 2 cups per day→3, more than 2 cups per day→5 | 5 |
| 8 | Have you tried diets to lose weight? | Frequency | No→0, once→1, twice→2, three-five times→5, more than five times→10 | 10 |
| 9 | Do you have difficulty burning fat around your belly, hips or thighs even with regular exercise? | Binary | Yes→3, No→0 | 3 |
| 10 | Do you eat your largest meal at night? | Binary | Yes→1, No→0 | 1 |

Category Total Score: 0–50.
Priority bands: **High 20–50 · Moderate 10–19 · Low 0–9**

---

## 6. Category: Digestive System Health (Zones 1, 2 & 3) — Max 81

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Do you experience lower abdominal bloating? | Frequency | No→0, 1-2 times per week→3, 3 times per week→5, more than 3 times per week→10 | 10 |
| 2 | Do you frequently have loose stools or diarrhea? | Frequency | No→0, once a week→1, 3 or more times per week→5 | 5 |
| 3 | Do you experience constipation or stools that are compact/hard to pass? | Frequency | No→0, 1-2 times per week→3, 3 or more times per week→5 | 5 |
| 4 | Do you find that you often burp/belch after meals? | Binary | Yes→3, No→0 | 3 |
| 5 | Do you frequently have gas? | Binary | Yes→3, No→0 | 3 |
| 6 | Do you crave certain foods, such as bread, chocolate, certain fruit, and red meat, if you have not eaten them in a day or two? | Binary | Yes→5, No→0 | 5 |
| 7 | Do you have a poor appetite and/or feel worse after eating? | Frequency | No→0, 1-2 times per week→3, 3 times per week→5, more 3 times per week→10 | 10 |
| 8 | Do you have an excessive appetite and/or sweet cravings? | Binary | Yes→5, No→0 | 5 |
| 9 | Do you frequently (more than twice a week) experience abdominal pain, cramps or general abdominal discomfort? | Binary | Yes→20, No→0 | 20 |
| 10 | Do you have indigestion, heartburn or upset stomach? | Frequency | No→0, 1-2 times per week→3, 3 times per week→5, more than 3 times per week→10 | 10 |
| 11 | Do you get a headache after eating? | Frequency | No→0, 1-2 times per week→3, more than 3 times per week→5 | 5 |

Category Total Score: 0–81.
Priority bands: **High 40–81 · Moderate 20–39 · Low 0–19**

---

## 7. Category: Fungus & Parasites (Zones 3 & 4) — Max 115 (re-verified)

Re-verified 2026-07-18 against a second, complete/uncropped scan of this
page. All 13 questions and both options on every binary question (including
Q9's previously-cropped "No (0)") are confirmed legible and unchanged from
the first pass.

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Have you ever been given general anesthesia? | Binary | Yes→10, No→0 | 10 |
| 2 | Have you ever taken antibiotics? | Binary | Yes→10, No→0 | 10 |
| 3 | Have you been or are you being treated for any condition requiring that you take medical drugs? | Binary | Yes→10, No→0 | 10 |
| 4 | In general, are your bowel movements loose, hard or foul smelling? | Binary | Yes→10, No→0 | 10 |
| 5 | Would you consider your life to be: | Multiple choice | Stress free→0, Mildly stressful→5, Very stressful→10 | 10 |
| 6 | Do you currently suffer from any digestive disorder or frequently have pain in the region above or below the navel? | Binary | Yes→10, No→0 | 10 |
| 7 | Do you have mercury amalgam fillings in your mouth? | Binary | Yes→10, No→0 | 10 |
| 8 | Do you have two different kinds of metal in your mouth; i.e., gold and silver or mercury amalgam and gold or silver? | Binary | Yes→5, No→0 | 5 |
| 9 | Do you experience itching in the ears, nose or rectum area? | Binary | Yes→10, No→0 | 10 |
| 10 | Do you have or have you had dandruff in the past year? | Binary | Yes→10, No→0 | 10 |
| 11 | Do you regularly eat or drink products containing sugar, white flour, processed dairy products? | Binary | Yes→5, No→0 | 5 |
| 12 | Do you crave sugar, fruit or milk if you don't have either of these items for more than three days? | Binary | Yes→10, No→0 | 10 |
| 13 | Do you find that regardless of how much you eat you get hungry quickly? | Binary | Yes→5, No→0 | 5 |

Category Total Score: 0–115. **Verified — matches the printed page exactly.**

Priority bands: the master score sheet's boundary rows (60 and 40) are kept
as the intended clinical thresholds; only the top of the High Priority band
is corrected from the sheet's printed (and almost certainly mistyped) 195
down to the questionnaire's real ceiling of 115: **High 60–115 · Moderate
40–59 · Low 0–39**

---

## 8. Category: Detoxification System Health (Zones 3 & 4) — Max 88

| # | Question | Type | Options | Max |
|---|----------|------|---------|-----|
| 1 | Are your eyes sensitive to bright light? | Binary | Yes→3, No→0 | 3 |
| 2 | Do you suffer from irritability and have difficulty relaxing? | Binary | Yes→10, No→0 | 10 |
| 3 | Do you often feel fatigued and sluggish? | Binary | Yes→10, No→0 | 10 |
| 4 | Do you suffer from frequent headaches? | Frequency | No→0, once a week→1, 3 or more per week→5 | 5 |
| 5 | Do you have dark circles and/or puffiness under eyes? | Frequency | No→0, once a week→3, 2-3 times per week→5, more than 3 times per week→10 | 10 |
| 6 | Are you sensitive to perfumes, paint fumes, traffic fumes, detergents or cigarette smoke? | Frequency | No→0, mildly→3, moderately→5, very→10 | 10 |
| 7 | Have you been unable to lose cellulite with diet and/or exercise? | Binary | Yes→10, No→0 | 10 |
| 8 | Are you currently, or have you in the past, been frequently exposed to industrial or agricultural chemicals, such as solvents, cleaning fluids, paint fumes, plant sprays and fertilizers? | Frequency | No→0, brief exposure→3, more than once a week→5, daily→10 | 10 |
| 9 | Do you experience mental sluggishness, poor memory or poor concentration? | Frequency | No→0, 1-2 times per week→3, 3 times per week→5, more than 3 times per week→10 | 10 |
| 10 | Do you suffer from skin reactions such as rashes, itching or burning, for which the cause is unknown? | Frequency | No→0, 1-2 times per month→3, 3 times per month→5, more than 3 times per month→10 | 10 |

Category Total Score: 0–88.
Priority bands: **High 40–88 · Moderate 20–39 · Low 0–19**

---

## 9. Scoring & Master Score Sheet

### Category score
`categoryScore = sum(points of the single option selected per question in that category)`

### Total Score
`totalScore = sum(categoryScore for all 7 categories)`, range **0–635**
(corrected — see §7 and §10; the printed sheet's 715 assumed the
mistyped 195 for Fungus & Parasites).

### Master score sheet layout (as printed)
Columns, in order: You Are What You Eat (Zones 1,2&3) · Stress (Zone 4) ·
Circadian Health (Zone 2) · You Are When You Eat (Zone 3) · Digestive System
Health (Zones 1,2&3) · Fungus & Parasites (Zones 3&4) · Detoxification System
Health (Zones 3&4) · Total Score.

Each column is banded into three color-coded priority rows — **High Priority
(red)**, **Moderate Priority (yellow)**, **Low Priority (green)** — read
top-to-bottom from the column's max score down to 0. The Total Score column
uses a frown/neutral/smile glyph in place of a numeric midpoint but follows
the same three-band structure. There are two blank rows below the sheet
("Score 1", "Score 2") for recording two administrations of the assessment
(e.g., baseline and follow-up) plus `Name`, `Date 1`, `Date 2` fields.

### Priority bands (derived from the red/yellow and yellow/green boundary
rows printed on the score sheet)

| Category | High Priority | Moderate Priority | Low Priority |
|---|---|---|---|
| You Are What You Eat | 50–130 | 30–49 | 0–29 |
| Stress | 40–81 | 20–39 | 0–19 |
| Circadian Health | 50–90 | 30–49 | 0–29 |
| You Are When You Eat | 20–50 | 10–19 | 0–9 |
| Digestive System Health | 40–81 | 20–39 | 0–19 |
| Fungus & Parasites | 60–115 | 40–59 | 0–39 |
| Detoxification System Health | 40–88 | 20–39 | 0–19 |
| **Total Score** | **300–635** | **170–299** | **0–169** |

Higher score = worse / higher priority for intervention (this is a risk
questionnaire, not a wellness score — most "bad" answers score positive
points, "good" answers score 0).

Internal consistency check: 130 + 81 + 90 + 50 + 81 + **115** + 88 = **635**.
This is now fully bottom-up: every category max is the verified sum of its
own question options, and the Total Score max is the sum of those seven
verified category maxes. Nothing here depends on a number that was only
printed on the summary sheet.

---

## 10. Verification

Per-question point sums were independently computed and checked against the
category max cells printed on the master score sheet:

| Category | Computed sum | Printed sheet max | Match? |
|---|---|---|---|
| You Are What You Eat | 130 | 130 | ✅ |
| Stress | 81 | 81 | ✅ |
| Circadian Health | 90 | 90 | ✅ |
| You Are When You Eat | 50 | 50 | ✅ |
| Digestive System Health | 81 | 81 | ✅ |
| Fungus & Parasites | 115 | 195 (printed) | ❌ resolved, see below |
| Detoxification System Health | 88 | 88 | ✅ |
| **Total** | **635** | 715 (printed) | ❌ resolved, see below |

**Resolution (2026-07-18):** the original pass flagged Fungus & Parasites
because its 13-question sum (115) didn't match the score sheet's printed
column max (195), and question 9's "No (0)" option had been cropped out of
the first scan, leaving open the possibility of a missing/misread value. A
second, complete/uncropped scan of the page was reviewed: all 13 questions
and every option — including Q9's "No (0)" — are present and unchanged from
the first transcription. There is no missing question and no misread option
on the questionnaire page itself.

That makes the questionnaire page (the actual source of truth per the task
brief) internally consistent at 115, and points to the master score sheet's
"195" cell as the error — most plausibly a 9/1 digit transposition of "115"
(a one-character difference), rather than the reverse (inventing an extra
80 points' worth of options that don't appear anywhere on the page). The
Total Score max is corrected in lockstep, from the sheet's printed 715 down
to **635** (130+81+90+50+81+115+88), since 715 was arithmetically dependent
on the same 195 figure.

**Status: fully verified.** All 91 questions across all 7 categories, every
answer option, and every point value have been captured and are now
internally consistent bottom-up (question → category max → total max), with
no category left unverified. `questionnaire.json` marks `fungus_and_parasites`
as `"verified": true` with `maxScore: 115` and an `amendment` note recording
this correction for traceability, rather than silently rewriting history.
