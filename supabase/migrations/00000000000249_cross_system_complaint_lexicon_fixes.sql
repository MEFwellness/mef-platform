-- THREE DEFECTS THE FIRST REAL RUN OF THE CLASSIFIER FOUND, and the
-- vocabulary changes that fix them. Each was found by driving the matcher
-- over the brief's own example sentences against the seeded lexicon, and
-- each is a class of error rather than one sentence.

-- ---------------------------------------------------------------------
-- 1. A NEGATION CAN FOLLOW THE THING IT NEGATES.
--
-- "my headaches have stopped" was classified as a headache signal. The
-- matcher only looked BEHIND a match for a negating word, which catches
-- "no bloating" and misses every sentence where she puts the closing word
-- afterwards. That is the worse direction to be wrong in: the Signal
-- Library is append over time and the engine reads the LATEST row, so a
-- sentence saying a thing has finished would have outranked the truth.
--
-- So negation gets a direction. The words that only ever PRECEDE stay as
-- they are, and the words that only ever FOLLOW move to a new kind.
-- ---------------------------------------------------------------------

alter table cross_system_complaint_modifiers
  drop constraint cross_system_complaint_modifiers_kind_check;

alter table cross_system_complaint_modifiers
  add constraint cross_system_complaint_modifiers_kind_check
  check (kind in ('side', 'body_area', 'context', 'frequency', 'negation', 'negation_after'));

-- These five are only ever said after the thing. "stopped" before a
-- complaint is not a negation of it, and leaving them in the backward list
-- while also reading forward would have negated "headaches" in "my
-- headaches are bad, no bloating though".
delete from cross_system_complaint_modifiers
  where kind = 'negation'
    and phrase in ('stopped', 'gone', 'resolved', 'cleared up', 'settled down');

insert into cross_system_complaint_modifiers (phrase, kind) values
  ('stopped',       'negation_after'),
  ('has stopped',   'negation_after'),
  ('have stopped',  'negation_after'),
  ('gone',          'negation_after'),
  ('are gone',      'negation_after'),
  ('have gone',     'negation_after'),
  ('resolved',      'negation_after'),
  ('cleared up',    'negation_after'),
  ('settled down',  'negation_after'),
  ('is better now', 'negation_after'),
  ('are better now','negation_after'),
  ('is fine now',   'negation_after')
on conflict (phrase, kind) do nothing;

-- ---------------------------------------------------------------------
-- 2. A GENERIC PAIN WORD WAS PINNING ITSELF TO THE WHOLE BODY.
--
-- "My right hip has been clicking and aching when I walk" produced the hip
-- clicking correctly and then a SECOND row reading "whole body daily pain
-- or discomfort", because the bare words pain, aching, sore and discomfort
-- carried whole_body as their own area. The brief's own worked example
-- expects the second row to be the hip's, and it is right: the area is
-- sitting in her sentence, four words away.
--
-- Two changes. The generic words now point at "Joint aching", which is the
-- canonical name that takes an area rather than the one that is fixed to
-- the whole body. And they carry NO area of their own, so the area comes
-- from what she actually wrote, which is what the matcher's body-area
-- window is for.
--
-- "Daily pain or discomfort" stays exactly what it was: the Daily
-- Check-In's own numeric question, filed by that adapter. It is no longer
-- reachable from free text, which is correct, because a sentence is not
-- that question.
-- ---------------------------------------------------------------------

delete from cross_system_complaint_lexicon
  where signal_slug = 'daily-pain-or-discomfort'
    and phrase in ('pain', 'discomfort', 'sore', 'aching');

insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('pain',       'joint-aching', null, 8),
  ('painful',    'joint-aching', null, 8),
  ('discomfort', 'joint-aching', null, 8),
  ('aching',     'joint-aching', null, 6),
  ('aches',      'joint-aching', null, 6),
  ('sore',       'joint-aching', null, 6),
  ('hurts',      'joint-aching', null, 6),
  ('stiff',      'joint-aching', null, 6),
  ('stiffness',  'joint-aching', null, 6),
  ('tight',      'joint-aching', null, 4),
  ('tightness',  'joint-aching', null, 4),
  ('bothering me','joint-aching', null, 8),
  ('clicking',   'joint-aching', null, 8),
  ('clicks',     'joint-aching', null, 8),
  ('popping',    'joint-aching', null, 6),
  ('unstable',   'joint-aching', null, 6),
  ('instability','joint-aching', null, 6),
  ('weak',       'joint-aching', null, 4)
on conflict (phrase, signal_slug) do nothing;

-- ---------------------------------------------------------------------
-- 3. PHRASES THE BRIEF'S OWN EXAMPLES USE AND THE LEXICON DID NOT HOLD.
--
-- "My mood has been all over the place" classified as nothing at all,
-- because the seeded phrase was "mood is all over the place" and she wrote
-- "has been". A lexicon that only holds one tense of a sentence is a
-- lexicon that misses most of them, so the common auxiliaries are covered
-- directly rather than by a transform, which is this feature's rule.
-- ---------------------------------------------------------------------

insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('all over the place',           'mood-shifts-through-the-month', null, 26),
  ('mood has been all over the place','mood-shifts-through-the-month', null, 32),
  ('mood is up and down',          'mood-shifts-through-the-month', null, 28),
  ('emotionally reactive',         'mood-shifts-through-the-month', null, 26),
  ('mood swings',                  'mood-shifts-through-the-month', null, 26),
  ('havent been sleeping well',    'lighter-or-broken-sleep', null, 30),
  ('not been sleeping',            'lighter-or-broken-sleep', null, 28),
  ('sleeping poorly',              'lighter-or-broken-sleep', null, 26),
  ('cant sleep',                   'lighter-or-broken-sleep', null, 24),
  ('couldnt sleep',                'lighter-or-broken-sleep', null, 24),
  ('slept badly',                  'lighter-or-broken-sleep', null, 24),
  ('exhausted when i wake up',     'waking-tired-after-full-sleep', null, 32),
  ('shattered',                    'lower-energy-than-before', null, 20),
  ('drained',                      'lower-energy-than-before', null, 20),
  ('knackered',                    'lower-energy-than-before', null, 20),
  ('period has changed',           'irregular-cycle', null, 28),
  ('periods have changed',         'irregular-cycle', null, 28),
  ('cycle is different',           'irregular-cycle', null, 28),
  ('skin is breaking out badly',   'skin-breakouts', 'skin', 32),
  ('breaking out badly',           'skin-breakouts', 'skin', 30),
  ('hip keeps clicking and bothering me', 'hip-clicking', 'hip', 34),
  ('bloated after meals',          'bloating-after-eating', 'abdomen', 32),
  ('really bloated',               'bloated-stomach', 'abdomen', 24),
  ('gets bloated',                 'bloated-stomach', 'abdomen', 22)
on conflict (phrase, signal_slug) do nothing;
