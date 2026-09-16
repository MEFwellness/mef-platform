-- THE CLASSIFIER'S VOCABULARY. Every word Root knows how to recognize, as
-- rows.
--
-- WHAT THIS IS AND IS NOT. It is a mapping from the ways a member actually
-- writes about her body onto canonical signal names that ALREADY EXIST in
-- migration 241. It is not a new vocabulary and it cannot become one:
-- every lexicon row below carries a foreign key onto
-- cross_system_signal_names, so a phrase can only ever be another way IN
-- to a name a coach has already reviewed. A phrase with no row is skipped
-- rather than guessed at, which is migration 241's own rule for question
-- refs, applied to sentences.
--
-- IT IDENTIFIES, IT NEVER DIAGNOSES. Read the right hand column: every
-- target is a description of what she said ("Skin breakouts", "Bloating
-- after eating", "Hip clicking"). None of them is a cause, a condition or
-- an organ said to be responsible for anything. What may be worth
-- reviewing alongside a complaint is the association map's job, in
-- migration 248, and that holds only what a coach put in it.
--
-- FREQUENCY WORDS USE THE BODY SYSTEMS SURVEY'S OWN SCALE (migration 221:
-- never 0, rarely 1, sometimes 3, often 6, almost always 8), so a member
-- writing "constantly" and a member answering "Almost always" land on one
-- comparable timeline rather than on two that never meet.

-- ---------------------------------------------------------------------
-- 1. The surfaces free text can arrive on.
--
-- THE FUTURE ONES ARE HERE ON PURPOSE. A journal and a pain check-in that
-- do not exist yet still get a row, because the point of this table is
-- that wiring one in later is a row and a call, not a schema change.
-- ---------------------------------------------------------------------
insert into cross_system_complaint_surfaces (surface_key, position, display_name, default_author_role) values
  ('daily_checkin_notes',      1,  'Daily check-in notes',        'member'),
  ('daily_checkin_concern',    2,  'Daily check-in concern',      'member'),
  ('pain_checkin',             3,  'Pain check-in',               'member'),
  ('assessment_free_text',     4,  'Assessment response',         'member'),
  ('questionnaire_free_text',  5,  'Questionnaire response',      'member'),
  ('client_comment',           6,  'Client comment',              'member'),
  ('journal_entry',            7,  'Journal entry',               'member'),
  ('food_checkin',             8,  'Food check-in',               'member'),
  ('sleep_checkin',            9,  'Sleep check-in',              'member'),
  ('coach_note',              10,  'Coach note',                  'coach'),
  ('coach_observation',       11,  'Coach observation',           'coach')
on conflict (surface_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. The contexts a complaint can carry.
--
-- A CONTEXT IS SOMETHING SHE SAID, not something inferred. "after meals"
-- is in her sentence or it is not.
-- ---------------------------------------------------------------------
insert into cross_system_complaint_contexts (context_key, position, display_name) values
  ('on_waking',        1,  'On waking'),
  ('morning',          2,  'In the morning'),
  ('afternoon',        3,  'In the afternoon'),
  ('evening',          4,  'In the evening'),
  ('at_night',         5,  'At night'),
  ('after_meals',      6,  'After meals'),
  ('before_meals',     7,  'Between or before meals'),
  ('when_walking',     8,  'When walking'),
  ('when_sitting',     9,  'When sitting'),
  ('when_standing',   10,  'When standing'),
  ('with_exercise',   11,  'With exercise or training'),
  ('under_stress',    12,  'Under stress'),
  ('around_cycle',    13,  'Around the cycle'),
  ('at_work',         14,  'At work')
on conflict (context_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. The modifiers. Words that change the meaning of a match rather than
--    being one themselves.
-- ---------------------------------------------------------------------

-- SIDE.
insert into cross_system_complaint_modifiers (phrase, kind, side) values
  ('right',       'side', 'right'),
  ('right-hand',  'side', 'right'),
  ('rh',          'side', 'right'),
  ('left',        'side', 'left'),
  ('left-hand',   'side', 'left'),
  ('lh',          'side', 'left'),
  ('both',        'side', 'both'),
  ('both sides',  'side', 'both'),
  ('either side', 'side', 'both'),
  ('bilateral',   'side', 'both')
on conflict (phrase, kind) do nothing;

-- BODY AREA. The words she uses for a place, mapped onto migration 241's
-- own 23 areas.
insert into cross_system_complaint_modifiers (phrase, kind, body_area_key) values
  ('head',        'body_area', 'head'),
  ('jaw',         'body_area', 'jaw'),
  ('neck',        'body_area', 'neck'),
  ('shoulder',    'body_area', 'shoulder'),
  ('shoulders',   'body_area', 'shoulder'),
  ('elbow',       'body_area', 'elbow'),
  ('wrist',       'body_area', 'wrist'),
  ('hand',        'body_area', 'hand'),
  ('hands',       'body_area', 'hand'),
  ('upper back',  'body_area', 'upper_back'),
  ('mid back',    'body_area', 'mid_back'),
  ('middle back', 'body_area', 'mid_back'),
  ('low back',    'body_area', 'low_back'),
  ('lower back',  'body_area', 'low_back'),
  ('lumbar',      'body_area', 'low_back'),
  ('chest',       'body_area', 'chest'),
  ('abdomen',     'body_area', 'abdomen'),
  ('stomach',     'body_area', 'abdomen'),
  ('belly',       'body_area', 'abdomen'),
  ('tummy',       'body_area', 'abdomen'),
  ('gut',         'body_area', 'abdomen'),
  ('pelvis',      'body_area', 'pelvis'),
  ('pelvic',      'body_area', 'pelvis'),
  ('hip',         'body_area', 'hip'),
  ('hips',        'body_area', 'hip'),
  ('knee',        'body_area', 'knee'),
  ('knees',       'body_area', 'knee'),
  ('ankle',       'body_area', 'ankle'),
  ('ankles',      'body_area', 'ankle'),
  ('foot',        'body_area', 'foot'),
  ('feet',        'body_area', 'foot'),
  ('leg',         'body_area', 'leg'),
  ('legs',        'body_area', 'leg'),
  ('arm',         'body_area', 'arm'),
  ('arms',        'body_area', 'arm'),
  ('eyes',        'body_area', 'eyes'),
  ('throat',      'body_area', 'throat'),
  ('skin',        'body_area', 'skin')
on conflict (phrase, kind) do nothing;

-- CONTEXT.
insert into cross_system_complaint_modifiers (phrase, kind, context_key) values
  ('when i wake',          'context', 'on_waking'),
  ('when i wake up',       'context', 'on_waking'),
  ('on waking',            'context', 'on_waking'),
  ('waking up',            'context', 'on_waking'),
  ('first thing',          'context', 'morning'),
  ('in the morning',       'context', 'morning'),
  ('mornings',             'context', 'morning'),
  ('in the afternoon',     'context', 'afternoon'),
  ('afternoons',           'context', 'afternoon'),
  ('all afternoon',        'context', 'afternoon'),
  ('in the evening',       'context', 'evening'),
  ('evenings',             'context', 'evening'),
  ('at night',             'context', 'at_night'),
  ('during the night',     'context', 'at_night'),
  ('overnight',            'context', 'at_night'),
  ('after meals',          'context', 'after_meals'),
  ('after eating',         'context', 'after_meals'),
  ('after i eat',          'context', 'after_meals'),
  ('after food',           'context', 'after_meals'),
  ('after a meal',         'context', 'after_meals'),
  ('between meals',        'context', 'before_meals'),
  ('before eating',        'context', 'before_meals'),
  ('when i walk',          'context', 'when_walking'),
  ('when walking',         'context', 'when_walking'),
  ('while walking',        'context', 'when_walking'),
  ('on walking',           'context', 'when_walking'),
  ('when i sit',           'context', 'when_sitting'),
  ('when sitting',         'context', 'when_sitting'),
  ('sitting at my desk',   'context', 'when_sitting'),
  ('when standing',        'context', 'when_standing'),
  ('when i stand',         'context', 'when_standing'),
  ('when i train',         'context', 'with_exercise'),
  ('after training',       'context', 'with_exercise'),
  ('after exercise',       'context', 'with_exercise'),
  ('at the gym',           'context', 'with_exercise'),
  ('when i am stressed',   'context', 'under_stress'),
  ('when stressed',        'context', 'under_stress'),
  ('under stress',         'context', 'under_stress'),
  ('before my period',     'context', 'around_cycle'),
  ('around my period',     'context', 'around_cycle'),
  ('around my cycle',      'context', 'around_cycle'),
  ('at work',              'context', 'at_work')
on conflict (phrase, kind) do nothing;

-- FREQUENCY. The survey's own five points, reached by the words she uses.
insert into cross_system_complaint_modifiers
  (phrase, kind, frequency_key, frequency_label, frequency_numeric) values
  ('never',           'frequency', 'never',         'Never',         0),
  ('not at all',      'frequency', 'never',         'Never',         0),
  ('rarely',          'frequency', 'rarely',        'Rarely',        1),
  ('hardly ever',     'frequency', 'rarely',        'Rarely',        1),
  ('once in a while', 'frequency', 'rarely',        'Rarely',        1),
  ('occasionally',    'frequency', 'rarely',        'Rarely',        1),
  ('sometimes',       'frequency', 'sometimes',     'Sometimes',     3),
  ('now and then',    'frequency', 'sometimes',     'Sometimes',     3),
  ('on and off',      'frequency', 'sometimes',     'Sometimes',     3),
  ('often',           'frequency', 'often',         'Often',         6),
  ('a lot',           'frequency', 'often',         'Often',         6),
  ('frequently',      'frequency', 'often',         'Often',         6),
  ('most days',       'frequency', 'often',         'Often',         6),
  ('keeps',           'frequency', 'often',         'Often',         6),
  ('keep',            'frequency', 'often',         'Often',         6),
  ('always',          'frequency', 'almost_always', 'Almost always', 8),
  ('constantly',      'frequency', 'almost_always', 'Almost always', 8),
  ('all the time',    'frequency', 'almost_always', 'Almost always', 8),
  ('every day',       'frequency', 'almost_always', 'Almost always', 8),
  ('every night',     'frequency', 'almost_always', 'Almost always', 8)
on conflict (phrase, kind) do nothing;

-- NEGATION. A phrase that turns a match OFF rather than on.
--
-- WHY THIS MATTERS MORE THAN IT LOOKS. "no bloating this week" and "my
-- headaches have stopped" are her saying a thing is NOT happening, and a
-- matcher that read the word "bloating" and filed a signal would put an
-- alarm on her timeline out of a sentence that closed one. A negated
-- match writes nothing at all.
insert into cross_system_complaint_modifiers (phrase, kind) values
  ('no',           'negation'),
  ('not',          'negation'),
  ('never',        'negation'),
  ('without',      'negation'),
  ('free from',    'negation'),
  ('no more',      'negation'),
  ('stopped',      'negation'),
  ('gone',         'negation'),
  ('resolved',     'negation'),
  ('cleared up',   'negation'),
  ('settled down', 'negation'),
  ('havent had',   'negation'),
  ('have not had', 'negation'),
  ('hasnt been',   'negation'),
  ('has not been', 'negation'),
  ('dont have',    'negation'),
  ('do not have',  'negation'),
  ('nothing',      'negation')
on conflict (phrase, kind) do nothing;

-- ---------------------------------------------------------------------
-- 4. THE LEXICON ITSELF.
--
-- specificity breaks ties between phrases of similar length. The matcher
-- sorts by the phrase's own length first, so "waking up tired" beats
-- "tired" without needing a number; specificity is for the cases where
-- two phrases of the SAME length mean different things.
-- ---------------------------------------------------------------------

-- MUSCULOSKELETAL, JOINT AND PAIN. The body_area_key on a row is what
-- lets one canonical name serve every joint: "my knee is clicking" and
-- "my hip is clicking" are the same standardized signal at two places,
-- which is how the engine stays generic rather than growing a column per
-- body part.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('hip clicking',            'hip-clicking',   'hip',   30),
  ('hip clicks',              'hip-clicking',   'hip',   30),
  ('hip is clicking',         'hip-clicking',   'hip',   30),
  ('hip has been clicking',   'hip-clicking',   'hip',   32),
  ('hip keeps clicking',      'hip-clicking',   'hip',   32),
  ('clicking in my hip',      'hip-clicking',   'hip',   32),
  ('clicking hip',            'hip-clicking',   'hip',   30),
  ('hip popping',             'hip-clicking',   'hip',   28),
  ('hip snapping',            'hip-clicking',   'hip',   28),
  ('knee clicking',           'joint-aching',   'knee',  26),
  ('knee clicks',             'joint-aching',   'knee',  26),
  ('clicking knee',           'joint-aching',   'knee',  26),
  ('shoulder clicking',       'joint-aching',   'shoulder', 26),
  ('joint pain',              'joint-aching',   null,    20),
  ('joints ache',             'joint-aching',   null,    20),
  ('aching joints',           'joint-aching',   null,    20),
  ('sore joints',             'joint-aching',   null,    20),
  ('hip pain',                'joint-aching',   'hip',   24),
  ('hip aching',              'joint-aching',   'hip',   24),
  ('hip aches',               'joint-aching',   'hip',   24),
  ('hip hurts',               'joint-aching',   'hip',   24),
  ('hip is sore',             'joint-aching',   'hip',   24),
  ('hip bothering me',        'joint-aching',   'hip',   24),
  ('hip stiffness',           'joint-aching',   'hip',   24),
  ('hip feels unstable',      'joint-aching',   'hip',   24),
  ('knee pain',               'joint-aching',   'knee',  24),
  ('knee hurts',              'joint-aching',   'knee',  24),
  ('knee aching',             'joint-aching',   'knee',  24),
  ('knee is sore',            'joint-aching',   'knee',  24),
  ('knee feels unstable',     'joint-aching',   'knee',  24),
  ('shoulder pain',           'joint-aching',   'shoulder', 24),
  ('shoulder hurts',          'joint-aching',   'shoulder', 24),
  ('shoulder aching',         'joint-aching',   'shoulder', 24),
  ('shoulder is sore',        'joint-aching',   'shoulder', 24),
  ('shoulder bothering me',   'joint-aching',   'shoulder', 24),
  ('shoulder keeps bothering me', 'joint-aching', 'shoulder', 26),
  ('shoulder stiffness',      'joint-aching',   'shoulder', 24),
  ('frozen shoulder',         'joint-aching',   'shoulder', 24),
  ('ankle pain',              'joint-aching',   'ankle', 24),
  ('ankle hurts',             'joint-aching',   'ankle', 24),
  ('ankle is sore',           'joint-aching',   'ankle', 24),
  ('foot pain',               'joint-aching',   'foot',  24),
  ('foot hurts',              'joint-aching',   'foot',  24),
  ('elbow pain',              'joint-aching',   'elbow', 24),
  ('wrist pain',              'joint-aching',   'wrist', 24),
  ('jaw pain',                'joint-aching',   'jaw',   24),
  ('jaw clicking',            'joint-aching',   'jaw',   24),
  ('low back pain',           'low-back-ache',  'low_back', 26),
  ('lower back pain',         'low-back-ache',  'low_back', 26),
  ('low back ache',           'low-back-ache',  'low_back', 26),
  ('lower back ache',         'low-back-ache',  'low_back', 26),
  ('back pain',               'low-back-ache',  'low_back', 18),
  ('my back hurts',           'low-back-ache',  'low_back', 20),
  ('back is sore',            'low-back-ache',  'low_back', 20),
  ('low back tightness',      'low-back-tightness', 'low_back', 26),
  ('lower back tight',        'low-back-tightness', 'low_back', 26),
  ('back feels tight',        'low-back-tightness', 'low_back', 22),
  ('lumbar stiffness',        'low-back-tightness', 'low_back', 26),
  ('neck pain',               'neck-and-shoulder-tension', 'neck', 24),
  ('neck ache',               'neck-and-shoulder-tension', 'neck', 24),
  ('neck stiffness',          'neck-and-shoulder-tension', 'neck', 24),
  ('stiff neck',              'neck-and-shoulder-tension', 'neck', 24),
  ('neck tension',            'neck-and-shoulder-tension', 'neck', 24),
  ('tight shoulders',         'neck-and-shoulder-tension', 'shoulder', 24),
  ('neck and shoulder tension','neck-and-shoulder-tension','neck', 28),
  ('morning stiffness',       'morning-stiffness', null,  24),
  ('stiff in the morning',    'morning-stiffness', null,  24),
  ('stiff when i wake',       'morning-stiffness', null,  24),
  ('muscle cramps',           'muscle-cramps-or-spasms', null, 22),
  ('cramping',                'muscle-cramps-or-spasms', null, 16),
  ('muscle spasms',           'muscle-cramps-or-spasms', null, 22),
  ('muscle soreness',         'muscle-soreness-without-exercise', null, 20),
  ('sore muscles',            'muscle-soreness-without-exercise', null, 20),
  ('old injury',              'old-injuries-flaring-up', null, 20),
  ('old injuries',            'old-injuries-flaring-up', null, 20),
  ('flaring up again',        'old-injuries-flaring-up', null, 20),
  ('pain is limiting',        'pain-limiting-daily-activity', null, 22),
  ('cant do my normal',       'pain-limiting-daily-activity', null, 22),
  ('pain stops me',           'pain-limiting-daily-activity', null, 22)
on conflict (phrase, signal_slug) do nothing;

-- SKIN.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('breaking out',            'skin-breakouts', 'skin', 24),
  ('breakouts',               'skin-breakouts', 'skin', 24),
  ('break out',               'skin-breakouts', 'skin', 22),
  ('acne',                    'skin-breakouts', 'skin', 24),
  ('spots on my face',        'skin-breakouts', 'skin', 24),
  ('skin is breaking out',    'skin-breakouts', 'skin', 28),
  ('pimples',                 'skin-breakouts', 'skin', 24),
  ('skin flare',              'skin-flare-ups', 'skin', 24),
  ('eczema',                  'skin-flare-ups', 'skin', 24),
  ('rash',                    'skin-flare-ups', 'skin', 22),
  ('dermatitis',              'skin-flare-ups', 'skin', 24),
  ('psoriasis',               'skin-flare-ups', 'skin', 24),
  ('skin irritation',         'skin-flare-ups', 'skin', 22),
  ('itchy skin',              'itchy-skin',     'skin', 24),
  ('skin is itchy',           'itchy-skin',     'skin', 24),
  ('itching',                 'itchy-skin',     'skin', 18),
  ('dry skin',                'dry-skin',       'skin', 24),
  ('skin is dry',             'dry-skin',       'skin', 24),
  ('flaky skin',              'dry-skin',       'skin', 22)
on conflict (phrase, signal_slug) do nothing;

-- DIGESTION.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('bloated after meals',     'bloating-after-eating', 'abdomen', 30),
  ('bloated after eating',    'bloating-after-eating', 'abdomen', 30),
  ('bloating after meals',    'bloating-after-eating', 'abdomen', 30),
  ('bloating after eating',   'bloating-after-eating', 'abdomen', 30),
  ('bloated after i eat',     'bloating-after-eating', 'abdomen', 30),
  ('bloating',                'bloated-stomach',       'abdomen', 20),
  ('bloated',                 'bloated-stomach',       'abdomen', 20),
  ('stomach gets bloated',    'bloated-stomach',       'abdomen', 26),
  ('distended',               'bloated-stomach',       'abdomen', 20),
  ('gas',                     'excessive-gas',         'abdomen', 16),
  ('wind',                    'excessive-gas',         'abdomen', 14),
  ('flatulence',              'excessive-gas',         'abdomen', 20),
  ('heartburn',               'heartburn',             'chest',   24),
  ('indigestion',             'heartburn',             'chest',   22),
  ('acid reflux',             'acid-reflux-or-burping','throat',  24),
  ('reflux',                  'acid-reflux-or-burping','throat',  22),
  ('burping',                 'acid-reflux-or-burping','throat',  20),
  ('belching',                'acid-reflux-or-burping','throat',  20),
  ('constipated',             'constipation',          'abdomen', 24),
  ('constipation',            'constipation',          'abdomen', 24),
  ('cant go to the toilet',   'constipation',          'abdomen', 22),
  ('diarrhea',                'loose-or-urgent-stools','abdomen', 24),
  ('diarrhoea',               'loose-or-urgent-stools','abdomen', 24),
  ('loose stools',            'loose-or-urgent-stools','abdomen', 24),
  ('urgent stools',           'loose-or-urgent-stools','abdomen', 24),
  ('stomach pain',            'stomach-pain-or-cramping','abdomen', 24),
  ('stomach cramps',          'stomach-pain-or-cramping','abdomen', 24),
  ('tummy ache',              'stomach-pain-or-cramping','abdomen', 22),
  ('belly ache',              'stomach-pain-or-cramping','abdomen', 22),
  ('nausea',                  'nausea',                'abdomen', 24),
  ('nauseous',                'nausea',                'abdomen', 24),
  ('feel sick after eating',  'nausea',                'abdomen', 24),
  ('full long after',         'fullness-long-after-meals','abdomen', 24),
  ('food sits in my stomach', 'fullness-long-after-meals','abdomen', 26),
  ('food reactions',          'food-triggered-reactions', null, 24),
  ('react to certain foods',  'food-triggered-reactions', null, 26),
  ('food sensitivity',        'food-triggered-reactions', null, 24),
  ('certain foods bother me', 'food-triggered-reactions', null, 26)
on conflict (phrase, signal_slug) do nothing;

-- BLOOD SUGAR, FUEL, CRAVINGS AND ENERGY.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('craving sugar',           'sugar-cravings',   null, 26),
  ('sugar cravings',          'sugar-cravings',   null, 26),
  ('crave sugar',             'sugar-cravings',   null, 26),
  ('craving sweets',          'sugar-cravings',   null, 26),
  ('want something sweet',    'sugar-cravings',   null, 24),
  ('craving carbs',           'sugar-cravings',   null, 24),
  ('salt cravings',           'salt-cravings',    null, 24),
  ('craving salt',            'salt-cravings',    null, 24),
  ('afternoon crash',         'afternoon-caffeine-or-sugar', null, 26),
  ('afternoon slump',         'afternoon-caffeine-or-sugar', null, 26),
  ('need caffeine in the afternoon', 'afternoon-caffeine-or-sugar', null, 30),
  ('energy crashes',          'energy-rises-and-crashes', null, 26),
  ('energy crash',            'energy-rises-and-crashes', null, 26),
  ('energy is up and down',   'energy-rises-and-crashes', null, 26),
  ('shaky between meals',     'shaky-when-meals-delayed', null, 28),
  ('shaky when i dont eat',   'shaky-when-meals-delayed', null, 28),
  ('hangry',                  'shaky-when-meals-delayed', null, 24),
  ('irritable when hungry',   'shaky-when-meals-delayed', null, 28),
  ('sleepy after eating',     'sleepy-after-eating', null, 26),
  ('tired after eating',      'tired-after-a-full-meal', null, 26),
  ('need coffee to function', 'needing-caffeine-to-start', null, 28),
  ('exhausted',               'lower-energy-than-before', null, 18),
  ('no energy',               'lower-energy-than-before', null, 20),
  ('low energy',              'lower-energy-than-before', null, 20),
  ('energy is low',           'lower-energy-than-before', null, 20),
  ('worn out',                'lower-energy-than-before', null, 18),
  ('wiped out',               'slow-recovery-after-demanding-days', null, 20),
  ('sluggish',                'feeling-sluggish-or-slowed-down', null, 20),
  ('everything feels like effort', 'everyday-tasks-feel-heavier', null, 26)
on conflict (phrase, signal_slug) do nothing;

-- SLEEP.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('waking up tired',         'waking-tired-after-full-sleep', null, 30),
  ('wake up tired',           'waking-tired-after-full-sleep', null, 30),
  ('waking tired',            'waking-tired-after-full-sleep', null, 28),
  ('exhausted when i wake',   'waking-tired-after-full-sleep', null, 30),
  ('tired when i wake up',    'waking-tired-after-full-sleep', null, 30),
  ('not refreshed',           'waking-tired-after-full-sleep', null, 26),
  ('havent been sleeping',    'lighter-or-broken-sleep', null, 28),
  ('have not been sleeping',  'lighter-or-broken-sleep', null, 28),
  ('not sleeping well',       'lighter-or-broken-sleep', null, 28),
  ('sleeping badly',          'lighter-or-broken-sleep', null, 26),
  ('barely slept',            'lighter-or-broken-sleep', null, 26),
  ('broken sleep',            'lighter-or-broken-sleep', null, 26),
  ('restless sleep',          'lighter-or-broken-sleep', null, 26),
  ('waking during the night', 'lighter-or-broken-sleep', null, 28),
  ('waking in the night',     'lighter-or-broken-sleep', null, 28),
  ('poor sleep',              'lighter-or-broken-sleep', null, 24),
  ('cant get to sleep',       'racing-mind-at-bedtime', null, 26),
  ('cant fall asleep',        'racing-mind-at-bedtime', null, 26),
  ('mind is racing',          'racing-mind-at-bedtime', null, 26),
  ('cant switch off',         'racing-mind-at-bedtime', null, 26),
  ('second wind at night',    'late-night-second-wind', null, 28),
  ('wired at night',          'late-night-second-wind', null, 26),
  ('groggy',                  'groggy-on-waking', null, 20),
  ('night sweats',            'night-sweats', null, 24),
  ('sweating at night',       'night-sweats', null, 24)
on conflict (phrase, signal_slug) do nothing;

-- STRESS, MOOD AND NERVOUS SYSTEM.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('really stressed',         'feeling-tense', null, 26),
  ('very stressed',           'feeling-tense', null, 26),
  ('so stressed',             'feeling-tense', null, 26),
  ('stressed out',            'feeling-tense', null, 26),
  ('stressed',                'feeling-tense', null, 20),
  ('tense',                   'feeling-tense', null, 18),
  ('cant relax',              'feeling-tense', null, 24),
  ('cannot relax',            'feeling-tense', null, 24),
  ('wound up',                'feeling-tense', null, 22),
  ('overwhelmed',             'small-stresses-feel-harder', null, 24),
  ('everything feels like too much', 'small-stresses-feel-harder', null, 30),
  ('little things set me off','small-stresses-feel-harder', null, 28),
  ('wired and tired',         'wired-and-tired', null, 28),
  ('irritable',               'flatter-or-more-irritable-mood', null, 22),
  ('snappy',                  'flatter-or-more-irritable-mood', null, 22),
  ('short tempered',          'flatter-or-more-irritable-mood', null, 24),
  ('mood is all over the place', 'mood-shifts-through-the-month', null, 30),
  ('mood swings',             'mood-shifts-through-the-month', null, 26),
  ('up and down emotionally', 'mood-shifts-through-the-month', null, 28),
  ('anxious',                 'feeling-anxious-or-on-edge', null, 22),
  ('on edge',                 'feeling-anxious-or-on-edge', null, 22),
  ('anxiety',                 'feeling-anxious-or-on-edge', null, 22),
  ('feeling down',            'feeling-down-or-flat', null, 24),
  ('feeling flat',            'feeling-down-or-flat', null, 24),
  ('low mood',                'feeling-down-or-flat', null, 24),
  ('no motivation',           'reduced-motivation-or-drive', null, 24),
  ('cant be bothered',        'reduced-motivation-or-drive', null, 24),
  ('brain fog',               'brain-fog', null, 24),
  ('foggy',                   'brain-fog', null, 18),
  ('cant concentrate',        'trouble-concentrating', null, 26),
  ('cant focus',              'trouble-concentrating', null, 26),
  ('forgetful',               'forgetfulness', null, 22),
  ('dizzy',                   'dizziness', 'head', 20),
  ('lightheaded',             'dizziness', 'head', 22)
on conflict (phrase, signal_slug) do nothing;

-- HEADACHES.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('headaches',               'headaches', 'head', 24),
  ('headache',                'headaches', 'head', 24),
  ('migraine',                'headaches', 'head', 24),
  ('migraines',               'headaches', 'head', 24),
  ('head pressure',           'headaches', 'head', 24),
  ('tension headache',        'headaches', 'head', 26),
  ('my head hurts',           'headaches', 'head', 24),
  ('headache when i havent eaten', 'headaches-when-not-eaten', 'head', 32)
on conflict (phrase, signal_slug) do nothing;

-- HORMONAL AND CYCLE.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('period has been different','irregular-cycle', null, 30),
  ('irregular period',        'irregular-cycle', null, 26),
  ('irregular cycle',         'irregular-cycle', null, 26),
  ('cycle has changed',       'irregular-cycle', null, 26),
  ('missed period',           'irregular-cycle', null, 24),
  ('heavy period',            'heavy-or-painful-periods', 'pelvis', 26),
  ('painful period',          'heavy-or-painful-periods', 'pelvis', 26),
  ('period pain',             'heavy-or-painful-periods', 'pelvis', 26),
  ('cramps before my period', 'heavy-or-painful-periods', 'pelvis', 28),
  ('hot flashes',             'hot-flashes', null, 26),
  ('hot flushes',             'hot-flashes', null, 26),
  ('pms',                     'premenstrual-irritability', null, 22),
  ('premenstrual',            'premenstrual-irritability', null, 24),
  ('tearful before my period','premenstrual-irritability', null, 28)
on conflict (phrase, signal_slug) do nothing;

-- URINARY AND BLADDER.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('peeing a lot',            'frequent-urination', null, 26),
  ('urinating often',         'frequent-urination', null, 26),
  ('frequent urination',      'frequent-urination', null, 26),
  ('going to the toilet a lot','frequent-urination', null, 28),
  ('up in the night to pee',  'waking-at-night-to-urinate', null, 30),
  ('waking to urinate',       'waking-at-night-to-urinate', null, 30),
  ('getting up to pee',       'waking-at-night-to-urinate', null, 28),
  ('sudden urge to go',       'sudden-urge-to-urinate', null, 28),
  ('bladder urgency',         'sudden-urge-to-urinate', null, 26),
  ('burning when i pee',      'burning-on-urination', null, 28),
  ('leaking when i cough',    'urine-leaking-with-effort', 'pelvis', 30)
on conflict (phrase, signal_slug) do nothing;

-- BREATHING.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('short of breath',         'short-of-breath', 'chest', 26),
  ('out of breath',           'short-of-breath', 'chest', 26),
  ('breathless',              'short-of-breath', 'chest', 24),
  ('cant get a deep breath',  'unable-to-breathe-deeply', 'chest', 30),
  ('cant breathe deeply',     'unable-to-breathe-deeply', 'chest', 30),
  ('cant take a full breath', 'unable-to-breathe-deeply', 'chest', 30),
  ('sighing a lot',           'faster-or-deeper-breathing', 'chest', 26),
  ('breathing feels shallow', 'faster-or-deeper-breathing', 'chest', 28),
  ('chest feels tight',       'chest-tightness', 'chest', 26),
  ('tight chest',             'chest-tightness', 'chest', 26),
  ('breathless on the stairs','breathless-on-stairs', null, 30)
on conflict (phrase, signal_slug) do nothing;

-- IMMUNE, CIRCULATION AND THE REST.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('keep getting sick',       'frequent-colds-or-infections', null, 26),
  ('always getting colds',    'frequent-colds-or-infections', null, 26),
  ('run down',                'frequent-colds-or-infections', null, 20),
  ('takes ages to shake',     'slow-recovery-from-illness', null, 24),
  ('swollen glands',          'swollen-or-tender-glands', 'neck', 26),
  ('mouth ulcers',            'cold-sores-or-mouth-ulcers', null, 24),
  ('cold sore',               'cold-sores-or-mouth-ulcers', null, 24),
  ('stuffy nose',             'congestion-without-illness', 'throat', 24),
  ('congested',               'congestion-without-illness', 'throat', 22),
  ('itchy eyes',              'itchy-or-watery-eyes', 'eyes', 24),
  ('watery eyes',             'itchy-or-watery-eyes', 'eyes', 24),
  ('cold hands',              'cold-hands-or-feet', 'hand', 24),
  ('cold feet',               'cold-hands-or-feet', 'foot', 24),
  ('cold hands and feet',     'cold-hands-or-feet', 'hand', 28),
  ('heart racing',            'heart-racing-or-palpitations', 'chest', 26),
  ('palpitations',            'heart-racing-or-palpitations', 'chest', 26),
  ('swollen ankles',          'ankle-or-foot-swelling', 'ankle', 26),
  ('pins and needles',        'hands-or-feet-falling-asleep', 'hand', 26),
  ('numb hands',              'hands-or-feet-falling-asleep', 'hand', 26),
  ('bruise easily',           'bruising-easily', 'skin', 24),
  ('heavy legs',              'heavy-or-achy-legs', 'leg', 24),
  ('hair falling out',        'hair-thinning-or-shedding', null, 26),
  ('hair is thinning',        'hair-thinning-or-shedding', null, 26),
  ('feel the cold',           'feeling-cold-when-others-are-not', null, 24),
  ('always cold',             'feeling-cold-when-others-are-not', null, 24),
  ('weight has changed',      'unexplained-weight-change', null, 24),
  ('puffy face',              'morning-facial-puffiness', 'head', 24),
  ('dark circles',            'dark-circles-under-eyes', 'eyes', 24),
  ('sensitive to smells',     'sensitivity-to-strong-smells', null, 26),
  ('alcohol affects me',      'unwell-after-alcohol', null, 26),
  ('thirsty all the time',    'persistent-thirst', null, 26)
on conflict (phrase, signal_slug) do nothing;

-- The daily check-in's own body question, so a pain flow that posts a
-- level and a sentence lands on the same canonical name the adapter uses.
insert into cross_system_complaint_lexicon (phrase, signal_slug, body_area_key, specificity) values
  ('pain',                    'daily-pain-or-discomfort', 'whole_body', 8),
  ('discomfort',              'daily-pain-or-discomfort', 'whole_body', 8),
  ('sore',                    'daily-pain-or-discomfort', 'whole_body', 6),
  ('aching',                  'daily-pain-or-discomfort', 'whole_body', 6)
on conflict (phrase, signal_slug) do nothing;

-- The free text surfaces are signal sources too, so a classified complaint
-- writes an ordinary signal row naming an ordinary source. NO SECOND
-- SIGNAL STORE: this is migration 241's own table, gaining two rows.
insert into cross_system_signal_sources (source_key, position, display_name, assessment_definition_id) values
  ('member_reported', 7, 'Reported by the member', null),
  ('coach_reported',  8, 'Reported to the coach',  null)
on conflict (source_key) do nothing;
