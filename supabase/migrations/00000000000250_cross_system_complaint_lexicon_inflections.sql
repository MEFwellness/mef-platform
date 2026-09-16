-- ONE MORE CLASS OF MISS THE CLASSIFIER'S OWN TEST SUITE FOUND.
--
-- "Both knees hurt." classified as nothing at all. The lexicon held
-- "hurts" and not "hurt", so a plural subject ("my knees hurt", "both hips
-- ache") fell through every phrase while the singular form beside it
-- worked. That is not one missing word, it is one missing INFLECTION
-- across every generic complaint verb, and a member writing about two
-- knees is not an edge case.
--
-- The forms are added as rows rather than produced by a transform, which
-- is this feature's standing rule: a phrase with no row is skipped rather
-- than guessed at, and a stemmer would have started inventing matches
-- nobody reviewed.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('hurt',        'joint-aching', null, 6),
  ('hurting',     'joint-aching', null, 6),
  ('ache',        'joint-aching', null, 6),
  ('aching',      'joint-aching', null, 6),
  ('achy',        'joint-aching', null, 6),
  ('click',       'joint-aching', null, 8),
  ('clicked',     'joint-aching', null, 8),
  ('pop',         'joint-aching', null, 6),
  ('pops',        'joint-aching', null, 6),
  ('locking',     'joint-aching', null, 6),
  ('giving way',  'joint-aching', null, 8),
  ('swollen',     'joint-swelling', null, 8),
  ('stiffening',  'joint-aching', null, 6)
on conflict (phrase, signal_slug) do nothing;

-- The possessive contraction, which a phone keyboard produces constantly.
-- "my hip's been clicking" normalizes to "my hips been clicking", so the
-- form the matcher actually sees is the one that needs a row.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('hips been clicking',      'hip-clicking', 'hip',      30),
  ('hips been hurting',       'joint-aching', 'hip',      26),
  ('knees been hurting',      'joint-aching', 'knee',     26),
  ('shoulders been hurting',  'joint-aching', 'shoulder', 26),
  ('necks been hurting',      'neck-and-shoulder-tension', 'neck', 26),
  ('backs been hurting',      'low-back-ache', 'low_back', 26)
on conflict (phrase, signal_slug) do nothing;

-- "still" and "really" sit between a body part and its complaint often
-- enough to be worth their own forms: "my right hip is still clicking".
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('is still clicking',  'hip-clicking', null, 22),
  ('still clicking',     'joint-aching', null, 10),
  ('still hurts',        'joint-aching', null, 10),
  ('still sore',         'joint-aching', null, 10)
on conflict (phrase, signal_slug) do nothing;
