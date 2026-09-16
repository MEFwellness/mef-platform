-- THE VOCABULARY THE DEEP MAP NEEDS, and nothing else.
--
-- WHAT THIS IS FOR. Migration 248 seeded eighteen broad starter entries.
-- The map this build grows from them names every major joint on its own,
-- the muscle regions around them, the posture patterns coaching reads, the
-- organ and gland groupings a holistic framework works in, and the
-- lifestyle load underneath all of it. Several of those have nothing in
-- the Signal Library to point AT: there is no sacroiliac joint in the body
-- area list, no upper crossed pattern in the posture names, and no way to
-- say a knee grinds.
--
-- IT ADDS THROUGH THE EXISTING INFRASTRUCTURE, NEVER BESIDE IT. Every row
-- below goes into migration 240's own tables, under migration 240's own
-- coach only fence. There is no second signal store, no second vocabulary
-- and no second set of policies. A name added here behaves exactly like one
-- of the original 159: the coach's entry tool can reach it, the lexicon can
-- point a phrase at it, and the map can name it.
--
-- IT IDENTIFIES, IT NEVER DIAGNOSES. Read the display names below. Every
-- one of them is a description of what somebody reported or what somebody
-- observed ("Knee grinding", "Jaw clenching or teeth grinding", "Upper
-- crossed postural pattern"). Not one is a cause, a condition or an organ
-- said to be responsible for anything. What may be worth reviewing
-- alongside one is the Association Map's job, and that holds only what a
-- coach put in it.

-- ---------------------------------------------------------------------
-- 1. BODY AREAS. Seven, and each one exists because the map needs to be
--    able to point at it.
--
--    THE SACROILIAC JOINT IS THE ONE REAL GAP. The original 23 areas
--    covered the cervical, thoracic and lumbar spine as neck, upper back,
--    mid back and low back, and every other major joint by name. The SI
--    joint had nowhere to go and was being folded into the pelvis, which
--    is a region rather than a joint.
--
--    The other six are muscle regions. A member writes "my hamstrings are
--    tight" far more often than she writes "my posterior thigh", and a
--    complaint that lands on a region no area names loses its location.
-- ---------------------------------------------------------------------
insert into cross_system_body_areas (area_key, position, display_name, takes_side) values
  ('si_joint',   24, 'Sacroiliac joint', true),
  ('ribs',       25, 'Ribs',             true),
  ('glute',      26, 'Glutes',           true),
  ('groin',      27, 'Groin',            true),
  ('thigh',      28, 'Thigh',            true),
  ('hamstring',  29, 'Hamstrings',       true),
  ('calf',       30, 'Calf',             true)
on conflict (area_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. SYMPTOM WORDS. The ways real people describe a sensation that the
--    original twenty did not hold.
--
--    A SYMPTOM WORD IS NOT A SIGNAL. It is the noun a composed name uses,
--    so a coach tapping Knee and Grinding in the entry tool composes a
--    name the library can hold. The phrase column is the lowercase form
--    that composition uses.
-- ---------------------------------------------------------------------
insert into cross_system_symptom_types (symptom_key, position, display_name, phrase, default_category_key) values
  ('throbbing',   21, 'Throbbing',  'throbbing',  'pain_discomfort'),
  ('grinding',    22, 'Grinding',   'grinding',   'joint_movement'),
  ('popping',     23, 'Popping',    'popping',    'joint_movement'),
  ('pinching',    24, 'Pinching',   'pinching',   'pain_discomfort'),
  ('soreness',    25, 'Soreness',   'soreness',   'musculoskeletal'),
  ('itching',     26, 'Itching',    'itching',    'skin_immune'),
  ('pressure',    27, 'Pressure',   'pressure',   'pain_discomfort'),
  ('sharp',       28, 'Sharp pain', 'sharp pain', 'pain_discomfort')
on conflict (symptom_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. STANDARDIZED SIGNAL NAMES.
--
--    WHY EACH GROUP EXISTS is written above it. Nothing below duplicates
--    one of the 159 that already exist: the generic joint and muscle names
--    take their location from the body area on the row, which is exactly
--    how 'joint-aching' already works, so "Joint grinding" plus Knee is
--    one name rather than twelve.
-- ---------------------------------------------------------------------

-- JOINT AND MOVEMENT. The sensations a joint complaint actually arrives
-- in, each taking its area from the words she wrote.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('joint-grinding',          'Joint grinding',                'joint_movement', null, 'grinding',   'grinding crunching crepitus gritty', true),
  ('joint-popping',           'Joint popping or snapping',     'joint_movement', null, 'popping',    'popping snapping cracking clicking', true),
  ('joint-clicking',          'Joint clicking',                'joint_movement', null, 'clicking',   'clicking clicks noisy joint', true),
  ('joint-locking',           'Joint locking or catching',     'joint_movement', null, 'locking',    'locking catching sticking jammed', true),
  ('joint-instability',       'Joint instability or giving way','joint_movement', null, 'instability','giving way unstable wobbly buckling', true),
  ('reduced-joint-range',     'Reduced joint range',           'joint_movement', null, 'reduced_range', 'stiff limited range cannot move fully', true),
  ('joint-stiffness',         'Joint stiffness',               'joint_movement', null, 'stiffness',  'stiff seized tight joint', true),
  ('joint-pain',              'Joint pain',                    'pain_discomfort', null, 'pain',      'joint pain hurts sore', true),
  ('sharp-or-pinching-pain',  'Sharp or pinching pain',        'pain_discomfort', null, 'pinching',  'sharp stabbing pinching nipping', true),
  ('throbbing-pain',          'Throbbing pain',                'pain_discomfort', null, 'throbbing', 'throbbing pulsing pounding', true),
  ('burning-sensation',       'Burning sensation',             'pain_discomfort', null, 'burning',   'burning hot stinging', true),
  ('pressure-or-fullness',    'Pressure or fullness',          'pain_discomfort', null, 'pressure',  'pressure full heavy squeezing', true),
  ('pain-after-activity',     'Pain after activity',           'pain_discomfort', null, 'pain',      'sore after training delayed onset', true),
  ('jaw-clicking',            'Jaw clicking or grinding',      'joint_movement', 'jaw', 'clicking',  'tmj jaw clicks pops grinds', true),
  ('jaw-clenching',           'Jaw clenching or teeth grinding','musculoskeletal', 'jaw', 'tightness','bruxism clenching grinding teeth', true)
on conflict (signal_slug) do nothing;

-- MUSCLE AND SOFT TISSUE. Tension and dysfunction patterns, as a coach
-- hears them described.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('muscle-tightness',        'Muscle tightness',              'musculoskeletal', null, 'tightness', 'tight tension knotted', true),
  ('muscle-weakness',         'Muscle weakness',               'musculoskeletal', null, 'weakness',  'weak no strength giving out', true),
  ('muscle-soreness',         'Muscle soreness',               'musculoskeletal', null, 'soreness',  'sore tender achy muscle', true),
  ('muscle-pulling-sensation','Muscle pulling sensation',      'musculoskeletal', null, 'tightness', 'pulling strained tugging', true),
  ('trigger-point-tenderness','Tender spot in a muscle',       'musculoskeletal', null, 'soreness',  'knot trigger point tender spot', true),
  ('slow-warm-up',            'Slow to warm up in movement',   'musculoskeletal', 'whole_body', 'stiffness', 'takes a while to loosen up', true),
  ('one-sided-tension',       'Tension on one side',           'musculoskeletal', null, 'tightness', 'always the same side lopsided', true)
on conflict (signal_slug) do nothing;

-- NERVE SENSATION, kept apart from muscle and joint because a coach reads
-- them differently and because the existing hand and foot names are
-- location locked.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('numbness',                'Numbness',                      'neurological', null, 'numbness',  'numb dead no feeling', true),
  ('tingling',                'Tingling',                      'neurological', null, 'tingling',  'tingling pins and needles buzzing', true),
  ('radiating-sensation',     'Sensation travelling down a limb','neurological', null, 'tingling','shooting radiating travels down', true)
on conflict (signal_slug) do nothing;

-- POSTURE PATTERNS. The five the brief names. Three of them existed
-- already (forward head, lower crossed, lumbar posture outside neutral);
-- these are the ones that did not.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('upper-crossed-pattern',   'Upper-crossed postural pattern','posture_alignment', 'upper_back', null, 'rounded shoulders forward head upper cross', true),
  ('flat-back-pattern',       'Flat-back postural pattern',    'posture_alignment', 'low_back', null,   'flat back reduced lumbar curve', true),
  ('sway-back-pattern',       'Sway-back postural pattern',    'posture_alignment', 'pelvis', null,     'sway back hips forward', true),
  ('rib-flare',               'Rib flare',                     'posture_alignment', 'ribs', null,       'ribs flared lower ribs lifted', true),
  ('head-carried-forward-at-work','Head carried forward at a desk','posture_alignment', 'neck', null,   'desk posture screen neck', true)
on conflict (signal_slug) do nothing;

-- NERVOUS SYSTEM LOAD AND STRESS PHYSIOLOGY. The existing set held
-- feeling tense, wired and tired and small stresses feeling harder. These
-- are the rest of what a coach listens for.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('shallow-breathing-under-stress','Breathing gets shallow under stress','stress', 'chest', null, 'holding breath shallow chest breathing', true),
  ('startles-easily',         'Startles easily',               'stress', null, null,         'jumpy on edge startled', true),
  ('difficulty-switching-off','Difficulty switching off',      'stress', null, null,         'cannot relax always on wound up', true),
  ('irritability',            'Irritability',                  'mood', null, null,          'snappy short fuse irritable', true),
  ('tearfulness',             'Tearfulness',                   'mood', null, null,          'crying tearful emotional', true),
  ('low-motivation',          'Low motivation',                'mood', null, null,          'cannot get going flat unmotivated', true)
on conflict (signal_slug) do nothing;

-- SLEEP. Three the existing set did not hold.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('trouble-falling-asleep',  'Trouble falling asleep',        'sleep', null, null, 'cannot get to sleep takes ages to drop off', true),
  ('waking-early-unable-to-return','Waking early and unable to return to sleep','sleep', null, null, 'awake at 4am early waking', true),
  ('restless-legs-at-night',  'Restless legs at night',        'sleep', 'leg', null, 'restless legs twitchy legs at night', true)
on conflict (signal_slug) do nothing;

-- HYDRATION AND ELIMINATION. Hydration had only persistent thirst, and
-- elimination had constipation and loose stools and nothing about rhythm.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('drinking-little-water',   'Drinking little water',         'kidney_bladder', null, null, 'hardly drink water not thirsty', true),
  ('dry-mouth',               'Dry mouth',                     'kidney_bladder', 'throat', null, 'dry mouth parched', true),
  ('infrequent-bowel-rhythm', 'Bowel rhythm slower than usual','digestion', 'abdomen', null, 'not going every day slowed bowels', true),
  ('straining-with-stools',   'Straining with stools',         'digestion', 'abdomen', null, 'straining hard to pass', true),
  ('excessive-sweating',      'Sweating more than usual',      'clearance_detox', 'skin', null, 'sweating a lot clammy', true),
  ('skin-rash',               'Skin rash',                     'skin_immune', 'skin', 'flare_ups', 'rash red patches hives', true),
  ('skin-itching',            'Skin itching',                  'skin_immune', 'skin', 'itching', 'itchy scratching', true)
on conflict (signal_slug) do nothing;

-- BLOOD SUGAR, ENERGY AND FUEL. Two gaps the lifestyle half of the map
-- needs to be able to point at.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('skipping-meals',          'Skipping meals',                'nutrition', null, null, 'missed lunch not eating regularly', true),
  ('irritable-when-hungry',   'Irritable when hungry',         'metabolic', null, null, 'hangry snappy when hungry', true),
  ('energy-dip-mid-afternoon','Energy dip in the afternoon',   'energy', null, null, 'afternoon slump three oclock crash', true)
on conflict (signal_slug) do nothing;

-- BREATHING, IMMUNE AND CIRCULATION. Three the deep map names that the
-- existing set did not carry.
insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  ('mouth-breathing',         'Mouth breathing',               'respiratory', 'throat', null, 'breathing through mouth blocked nose', true),
  ('sighing-or-yawning-often','Sighing or yawning often',      'respiratory', 'chest', null, 'sighing yawning air hunger', true),
  ('puffy-or-heavy-limbs',    'Puffy or heavy limbs',          'circulation', 'leg', 'heaviness', 'puffy swollen heavy legs arms', true)
on conflict (signal_slug) do nothing;

-- ---------------------------------------------------------------------
-- 4. WHERE A SIGNAL'S WORDS CAME FROM.
--
--    WHY A SIGNAL NEEDS THIS AND THE REPORT'S OWN SURFACE IS NOT ENOUGH.
--    A complaint report already records its surface, and before this build
--    exactly one surface existed, so a coach reading a Signals list could
--    assume any member reported row came from her check-in notes. With the
--    check-in concern box, the discomfort box, the Evening Reflection, the
--    mid-day concern flag, the intake, her messages and two coach surfaces
--    all writing into the same list, "where did she say this" is a
--    question the row itself has to answer.
--
--    COPIED IN AT CAPTURE TIME, like source_label above it and for the
--    same reason: renaming a surface next year must not rewrite what a
--    coach was told last year about where a complaint came from.
--
--    NULL ON EVERY ROW THAT IS NOT A CLASSIFIED COMPLAINT. A questionnaire
--    answer has no surface and is not given a made up one.
-- ---------------------------------------------------------------------
alter table cross_system_signals
  add column complaint_surface_key text references cross_system_complaint_surfaces(surface_key),
  add column complaint_surface_label text;

comment on column cross_system_signals.complaint_surface_key is
  'The free text surface a classified complaint arrived on. Null on every row that did not come from a sentence.';

-- ---------------------------------------------------------------------
-- 5. A RESOLUTION IS A CLASSIFICATION, NOT A SILENCE.
--
--    THE DEFECT THIS FIXES. The matcher recognized "my headaches have
--    stopped" and then threw the whole match away, so a member closing out
--    a symptom produced nothing at all: no classification, no row, and no
--    way for a coach to know she had said it. The Signal Library is append
--    over time and the engine reads the LATEST row, which means the
--    silence left her older complaint standing as the newest thing she had
--    said on the subject. A sentence that closes something out has to
--    WRITE, and it has to write a row that reads as settled.
--
--    This column records which kind of statement the words were, so the
--    coach's card can say "reported as settled" rather than showing a
--    complaint she has just told the app she no longer has.
-- ---------------------------------------------------------------------
alter table cross_system_complaint_classifications
  add column is_resolution boolean not null default false;

comment on column cross_system_complaint_classifications.is_resolution is
  'True when her words closed this signal out rather than reported it. The signal row written for one of these carries a nought, which the evidence layer already reads as resolved.';

-- ---------------------------------------------------------------------
-- 6. THE SURFACES THIS BUILD WIRES THAT HAD NO ROW YET.
--
--    Migration 247 registered eleven, including a journal and a pain
--    check-in that do not exist. Three surfaces that DO exist were missing
--    from it, because the corrected build wired only the check-in notes and
--    did not have to name them. Adding one is a row, exactly as that
--    migration promised.
--
--    THREE OF THE ELEVEN ARE USED AS REGISTERED rather than duplicated:
--    'client_comment' is the message she sends her coach, 'coach_note' is
--    the note a coach writes on her, and 'coach_observation' is the note a
--    coach types on a signal she enters by hand. Registering a second key
--    for any of those would have split one surface into two labels a coach
--    would have to learn were the same thing.
-- ---------------------------------------------------------------------
insert into cross_system_complaint_surfaces (surface_key, position, display_name, default_author_role) values
  ('daily_checkin_discomfort', 12, 'Daily check-in discomfort note', 'member'),
  ('evening_reflection',       13, 'Evening Reflection',             'member'),
  ('concern_flag',             14, 'Concern raised during the day',  'member')
on conflict (surface_key) do nothing;
