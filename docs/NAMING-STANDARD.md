# The Naming Standard

Every name that reaches a member or a coach follows this. It applies to
assessment names, section titles, finding labels, domain names, conclusion
strings, notification titles, and any generated copy.

## The rule

**A name describes what the member experiences, or what the check looks at.
It never names a condition, a pathogen, an organ dysfunction, or a
deficiency.**

A member reading any name in this app must not be able to conclude that the
app found a disease. The app gathers what she reports and notices patterns in
it. It does not diagnose, and its vocabulary must not imply that it does.

## What that rules out

- **Conditions and diagnoses.** No "disruption", "dysfunction", "insufficiency",
  "deficiency", "disorder", "syndrome", "imbalance", "pathology".
- **Pathogens.** No "fungal", "parasite", "candida", "infection", "bacterial".
- **Organs and body systems as the subject of a finding.** No "adrenal",
  "thyroid", "liver", "kidney", "hepatic", "renal", "endocrine". A name may
  say what she notices; it may not name the organ she is meant to infer is at
  fault.
- **Clinical process words.** No "detoxification", "metabolic", "circadian",
  "musculoskeletal", "cardiovascular", "neurological", "immune",
  "inflammatory", "hormonal", "cognitive", "gastrointestinal".
- **Severity framed as a medical grade.** No "elevated", "abnormal",
  "chronic", "acute", "clinical", "diagnosis", "diagnostic", "pathological".
- **Blame words.** No "deficiency", "poor", "failure", "non-compliant". A name
  is about a thing, never a verdict on the person.

## What it asks for instead

- **Her words, or the plainest version of them.** "Sleep that has not been
  leaving you rested" rather than "Poor Sleep Quality".
- **The experience, not the mechanism.** "Bloating, cravings and gut
  discomfort" rather than "Gut Fungal & Parasite Concerns".
- **What the check asks about, when the experience is too broad to name.**
  "How you are handling stress and demand" rather than "Adrenal &
  Stress-Response Patterns".
- **Plain words.** If a name needs a glossary, it is the wrong name.

## Voice

Case View is the model. Short, plain, honest about how little is behind
something, never clinical, never alarming, never reassuring beyond the
evidence.

## Punctuation

**No em dashes anywhere in app copy.** Use commas, periods, colons, or
parentheses. This applies to member copy and coach copy equally.

## Where it is enforced

- `lib/naming/standard.ts` holds the banned-word list and
  `checkNamingStandard()`, which every name in the app is asserted against by
  `tests/naming-standard.test.ts`.
- `lib/naming/findingNames.ts` holds the one map from a finding's stable
  `domain::code` key to its plain-language name. Renaming a finding is an edit
  to one line in that file, and it lands on every screen at once because every
  screen reads the finding through the Member Interpretation Layer, which reads
  this map.
- `lib/naming/displayNames.ts` holds every raw stored value's plain-language
  name. An unmapped value throws in development and degrades to a humanized
  string in production, so a new enum value fails loudly for the person adding
  it rather than quietly leaking to a coach.
- `docs/BUILD_STATUS.md` carries the before-and-after table for every rename
  that has already happened.

## Renaming something that already exists

Names are stored. `registry_entries.label` holds the display text a finding was
written with, and `unified_assessment_sections.title` holds an assessment's own
section names.

1. Change the map in `lib/naming/`. Every live render follows immediately,
   because the Member Interpretation Layer authors its statements from the map
   rather than from the stored label.
2. Write a migration that **supersedes** the stored text, never deletes or
   updates it in place. A stored row is a record of what a member was told on
   the day she was told it, and that record is not ours to rewrite.
3. Add the old name to `BANNED_NAMES` in `lib/naming/standard.ts` so it can
   never come back.
