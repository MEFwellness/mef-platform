-- The Signal Library's content: the vocabularies, the standardized signal
-- names, the registered sources and the dictionary each adapter reads.
--
-- Schema is migration 240. Nothing here creates a table and nothing here
-- touches any existing assessment.
--
-- EVERY ROW IS EDITABLE WITHOUT A DEPLOY. That is the point of this file
-- being a seed rather than a TypeScript constant: a coach adding a body
-- area, a symptom word or a standardized name is an insert, and wiring a
-- new question into an existing signal is one row in the source map.

-- ---------------------------------------------------------------------
-- 1. Categories. The coach's list groups by these, in this order.
-- ---------------------------------------------------------------------
insert into cross_system_signal_categories (category_key, position, display_name) values
  ('joint_movement',   1,  'Joint/Movement'),
  ('musculoskeletal',  2,  'Musculoskeletal'),
  ('posture_alignment',3,  'Posture/Alignment'),
  ('pain_discomfort',  4,  'Pain/Discomfort'),
  ('skin_immune',      5,  'Skin/Immune'),
  ('immune',           6,  'Immune'),
  ('kidney_bladder',   7,  'Kidney/Bladder'),
  ('digestion',        8,  'Digestion'),
  ('nutrition',        9,  'Nutrition/Fuel'),
  ('clearance_detox', 10,  'Clearance/Detox'),
  ('metabolic',       11,  'Metabolic'),
  ('stress',          12,  'Stress'),
  ('sleep',           13,  'Sleep'),
  ('hormonal',        14,  'Hormonal'),
  ('circulation',     15,  'Circulation'),
  ('respiratory',     16,  'Breathing/Respiratory'),
  ('neurological',    17,  'Neurological'),
  ('energy',          18,  'Energy'),
  ('mood',            19,  'Mood'),
  ('other',           20,  'Other')
on conflict (category_key) do nothing;

-- ---------------------------------------------------------------------
-- 2. Body areas. takes_side is false where Left / Right is not a
--    sensible question, so the entry tool skips the side selector.
-- ---------------------------------------------------------------------
insert into cross_system_body_areas (area_key, position, display_name, takes_side) values
  ('head',        1,  'Head',        false),
  ('jaw',         2,  'Jaw',         true),
  ('neck',        3,  'Neck',        true),
  ('shoulder',    4,  'Shoulder',    true),
  ('elbow',       5,  'Elbow',       true),
  ('wrist',       6,  'Wrist',       true),
  ('hand',        7,  'Hand',        true),
  ('upper_back',  8,  'Upper back',  true),
  ('mid_back',    9,  'Mid back',    true),
  ('low_back',   10,  'Low back',    true),
  ('chest',      11,  'Chest',       true),
  ('abdomen',    12,  'Abdomen',     false),
  ('pelvis',     13,  'Pelvis',      true),
  ('hip',        14,  'Hip',         true),
  ('knee',       15,  'Knee',        true),
  ('ankle',      16,  'Ankle',       true),
  ('foot',       17,  'Foot',        true),
  ('leg',        18,  'Leg',         true),
  ('arm',        19,  'Arm',         true),
  ('eyes',       20,  'Eyes',        true),
  ('throat',     21,  'Throat',      false),
  ('skin',       22,  'Skin',        false),
  ('whole_body', 23,  'Whole body',  false)
on conflict (area_key) do nothing;

-- ---------------------------------------------------------------------
-- 3. Symptom words. phrase is the lowercase form a composed name uses.
-- ---------------------------------------------------------------------
insert into cross_system_symptom_types (symptom_key, position, display_name, phrase, default_category_key) values
  ('pain',          1,  'Pain',              'pain',                  'pain_discomfort'),
  ('aching',        2,  'Aching',            'aching',                'pain_discomfort'),
  ('stiffness',     3,  'Stiffness',         'stiffness',             'musculoskeletal'),
  ('tightness',     4,  'Tightness',         'tightness',             'musculoskeletal'),
  ('clicking',      5,  'Clicking',          'clicking',              'joint_movement'),
  ('snapping',      6,  'Snapping',          'snapping',              'joint_movement'),
  ('locking',       7,  'Locking',           'locking',               'joint_movement'),
  ('instability',   8,  'Instability',       'instability',           'joint_movement'),
  ('reduced_range', 9,  'Reduced range',     'reduced range',         'joint_movement'),
  ('weakness',     10,  'Weakness',          'weakness',              'musculoskeletal'),
  ('cramping',     11,  'Cramping',          'cramping',              'musculoskeletal'),
  ('spasm',        12,  'Spasm',             'spasm',                 'musculoskeletal'),
  ('tingling',     13,  'Tingling',          'tingling',              'neurological'),
  ('numbness',     14,  'Numbness',          'numbness',              'neurological'),
  ('burning',      15,  'Burning',           'burning',               'pain_discomfort'),
  ('swelling',     16,  'Swelling',          'swelling',              'circulation'),
  ('heaviness',    17,  'Heaviness',         'heaviness',             'circulation'),
  ('flare_ups',    18,  'Flare-ups',         'flare-ups',             'skin_immune'),
  ('fatigue',      19,  'Fatigue',           'fatigue',               'energy'),
  ('other',        20,  'Other',             'signal',                'other')
on conflict (symptom_key) do nothing;

-- ---------------------------------------------------------------------
-- 4. The registered sources.
--
-- The four assessment ids are the fixed ones their own migrations set
-- (220, 225, 231 and the body assessment's registry entry), so a source
-- row resolves to the same definition in every environment.
-- ---------------------------------------------------------------------
insert into cross_system_signal_sources (source_key, position, display_name, assessment_definition_id) values
  ('body_systems_survey',        1, 'Rooted Reset Body Systems Survey',            'c1d8a4f2-97b3-4e56-8a0d-2f7b6c3e91a4'),
  ('whole_body_signal',          2, 'Rooted Reset Whole-Body Signal Assessment',   '5b9e2c74-3a81-4f6d-9c25-7e48d1b0af36'),
  ('breathing_pattern_check_in', 3, 'Breathing Pattern Check-In',                  '2f6a8c31-9d47-4b58-a0e3-6c1b7d92f405'),
  ('body_assessment',            4, 'Posture and movement assessment',             null),
  ('daily_check_in',             5, 'Daily Check-In',                              null),
  ('coach_entered',              6, 'Coach entered',                               null)
on conflict (source_key) do nothing;

-- ---------------------------------------------------------------------
-- 5. The standardized signal names.
--
-- THE SHARED ONES ARE THE POINT. "Cold hands or feet" appears once, and
-- three different questions in two different instruments map onto it in
-- section 6 below, so a coach opening it reads one timeline rather than
-- three near duplicate signals. A name is only shared where the two
-- questions genuinely ask the same thing: "Short of breath" and
-- "Breathless after one flight of stairs" stay separate, because the
-- second one names a load the first one does not.
--
-- is_coach_addable is false on the instrument level rollups. They are
-- real signals with real timelines, and they are not something a coach
-- types in mid conversation.
-- ---------------------------------------------------------------------

insert into cross_system_signal_names
  (signal_slug, display_name, category_key, default_body_area_key, default_symptom_key, search_terms, is_coach_addable)
values
  -- Body Systems Survey, the eleven system level rollups.
  ('bss-system-digestion',      'Digestion system signal',                   'digestion',       null, null, 'body systems section band', false),
  ('bss-system-blood-sugar',    'Blood sugar and energy system signal',      'metabolic',       null, null, 'body systems section band', false),
  ('bss-system-liver',          'Liver and detox system signal',             'clearance_detox', null, null, 'body systems section band', false),
  ('bss-system-adrenals',       'Adrenals and stress response system signal','stress',          null, null, 'body systems section band', false),
  ('bss-system-thyroid',        'Thyroid and metabolism system signal',      'metabolic',       null, null, 'body systems section band', false),
  ('bss-system-heart',          'Heart and circulation system signal',       'circulation',     null, null, 'body systems section band', false),
  ('bss-system-immune',         'Immune system signal',                      'immune',          null, null, 'body systems section band', false),
  ('bss-system-kidney',         'Kidney and bladder system signal',          'kidney_bladder',  null, null, 'body systems section band', false),
  ('bss-system-muscles',        'Muscles and joints system signal',          'musculoskeletal', null, null, 'body systems section band', false),
  ('bss-system-brain',          'Brain and nervous system signal',           'neurological',    null, null, 'body systems section band', false),
  ('bss-system-hormonal',       'Hormonal health system signal',             'hormonal',        null, null, 'body systems section band', false),

  -- Whole-Body Signal Assessment, the nine section level rollups. SECTION
  -- PERCENTAGES ONLY. No Zone, no chakra lens, no organ or gland list and
  -- no coach topic from that instrument reaches this library, and no row
  -- here has a field one could arrive in.
  ('wbs-section-fuel-quality',           'Fuel Quality section signal',              'nutrition',       null, null, 'whole body signal section band', false),
  ('wbs-section-fuel-rhythm',            'Fuel Rhythm section signal',               'nutrition',       null, null, 'whole body signal section band', false),
  ('wbs-section-digestive-flow',         'Digestive Flow section signal',            'digestion',       null, null, 'whole body signal section band', false),
  ('wbs-section-gut-environment',        'Gut Environment section signal',           'digestion',       null, null, 'whole body signal section band', false),
  ('wbs-section-clearance-elimination',  'Clearance and Elimination section signal', 'clearance_detox', null, null, 'whole body signal section band', false),
  ('wbs-section-stress-recovery',        'Stress and Recovery section signal',       'stress',          null, null, 'whole body signal section band', false),
  ('wbs-section-body-clock',             'Body Clock section signal',                'sleep',           null, null, 'whole body signal section band', false),
  ('wbs-section-hormone-pelvic-rhythm',  'Hormone and Pelvic Rhythm section signal', 'hormonal',        null, null, 'whole body signal section band', false),
  ('wbs-section-recovery-capacity',      'Recovery Capacity section signal',         'energy',          null, null, 'whole body signal section band', false),

  -- The Breathing Pattern Check-In's own total.
  ('breathing-pattern-total', 'Breathing pattern total score', 'respiratory', null, null, 'nijmegen breathing score', false),

  -- Digestion.
  ('bloating-after-eating',        'Bloating after eating',             'digestion', 'abdomen', null,        'bloat swollen distended', true),
  ('bloated-stomach',              'Bloated stomach',                   'digestion', 'abdomen', null,        'bloat swollen', true),
  ('excessive-gas',                'Excessive gas',                     'digestion', 'abdomen', null,        'wind flatulence', true),
  ('heartburn',                    'Heartburn',                         'digestion', 'chest',   'burning',   'reflux burning indigestion', true),
  ('acid-reflux-or-burping',       'Acid reflux or burping',            'digestion', 'throat',  null,        'belching reflux', true),
  ('fullness-long-after-meals',    'Fullness long after meals',         'digestion', 'abdomen', null,        'slow emptying heavy', true),
  ('stomach-pain-or-cramping',     'Stomach pain or cramping',          'digestion', 'abdomen', 'cramping',  'gut belly ache', true),
  ('loose-or-urgent-stools',       'Loose or urgent stools',            'digestion', 'abdomen', null,        'diarrhoea diarrhea bowel urgency', true),
  ('constipation',                 'Constipation',                      'digestion', 'abdomen', null,        'bowel infrequent blocked', true),
  ('nausea',                       'Nausea',                            'digestion', 'abdomen', null,        'queasy sick', true),
  ('undigested-food-in-stool',     'Undigested food in stool',          'digestion', 'abdomen', null,        'bowel absorption', true),

  -- Blood sugar, fuel and energy.
  ('shaky-when-meals-delayed',     'Shaky or irritable when a meal is delayed', 'metabolic', null, null, 'hangry low blood sugar', true),
  ('sleepy-after-eating',          'Sleepy after eating',               'metabolic', null, null,           'post meal slump', true),
  ('sugar-cravings',               'Sugar cravings',                    'nutrition', null, null,           'sweets craving', true),
  ('afternoon-caffeine-or-sugar',  'Needing caffeine or sugar in the afternoon', 'energy', null, null,      'slump crash', true),
  ('headaches-when-not-eaten',     'Headaches when not eaten',          'neurological', 'head', 'pain',     'hunger headache', true),
  ('waking-hungry-or-restless',    'Waking at night hungry or restless','sleep', null, null,                'night waking', true),
  ('energy-rises-and-crashes',     'Energy rising and crashing',        'energy', null, null,               'crash slump swing', true),
  ('tired-after-a-full-meal',      'Tired after a full meal',           'energy', null, null,               'fatigue after eating', true),
  ('persistent-thirst',            'Persistent thirst',                 'metabolic', null, null,            'thirsty dry mouth', true),

  -- Liver, clearance and detox.
  ('sensitivity-to-strong-smells', 'Sensitivity to strong smells',      'clearance_detox', null, null,      'perfume smoke chemical', true),
  ('unwell-after-alcohol',         'Feeling unwell after small amounts of alcohol', 'clearance_detox', null, null, 'alcohol intolerance', true),
  ('waking-between-1-and-3-am',    'Waking between 1 and 3 AM',         'sleep', null, null,                'night waking early hours', true),
  ('itchy-skin',                   'Itchy skin',                        'skin_immune', 'skin', null,        'itch pruritus', true),
  ('skin-breakouts',               'Skin breakouts',                    'skin_immune', 'skin', 'flare_ups', 'acne spots', true),
  ('skin-flare-ups',               'Skin flare-ups',                    'skin_immune', 'skin', 'flare_ups', 'eczema rash dermatitis', true),
  ('groggy-on-waking',             'Groggy on waking',                  'energy', null, null,               'foggy morning', true),
  ('unwell-after-greasy-food',     'Feeling unwell after greasy or fried food', 'clearance_detox', null, null, 'fat intolerance', true),
  ('dark-circles-under-eyes',      'Dark circles under the eyes',       'clearance_detox', 'eyes', null,    'shadows tired eyes', true),
  ('strong-reaction-to-caffeine-or-medication', 'Strong reaction to caffeine or medication', 'clearance_detox', null, null, 'sensitivity', true),

  -- Stress and adrenal load.
  ('waking-tired-after-full-sleep','Waking tired after a full night of sleep', 'energy', null, null,        'unrefreshed', true),
  ('late-night-second-wind',       'Late night second wind',            'sleep', null, null,                'wired at night', true),
  ('dizziness-on-standing',        'Dizziness on standing',             'neurological', 'head', null,       'lightheaded postural', true),
  ('salt-cravings',                'Salt cravings',                     'nutrition', null, null,            'salty craving', true),
  ('small-stresses-feel-harder',   'Small stresses feeling harder to handle', 'stress', null, null,         'low tolerance overwhelm', true),
  ('wired-and-tired',              'Wired and tired at the same time',  'stress', null, null,               'exhausted but alert', true),
  ('needing-caffeine-to-start',    'Needing caffeine to feel normal in the morning', 'energy', null, null,  'coffee dependence', true),
  ('heart-racing-under-stress',    'Heart racing under stress',         'circulation', 'chest', null,       'palpitations stress', true),
  ('slow-recovery-after-demanding-days', 'Slow recovery after a demanding day', 'energy', null, null,       'wiped out', true),
  ('light-sensitivity',            'Light sensitivity',                 'neurological', 'eyes', null,       'bright light photophobia', true),
  ('feeling-tense',                'Feeling tense',                     'stress', null, 'tightness',        'tension on edge', true),

  -- Thyroid and metabolic pace.
  ('feeling-cold-when-others-are-not', 'Feeling cold when others are comfortable', 'metabolic', null, null, 'cold intolerance', true),
  ('cold-hands-or-feet',           'Cold hands or feet',                'circulation', 'hand', null,        'cold extremities poor circulation', true),
  ('hair-thinning-or-shedding',    'Hair thinning or shedding',         'hormonal', null, null,             'hair loss', true),
  ('dry-skin',                     'Dry skin',                          'skin_immune', 'skin', null,        'dryness flaky', true),
  ('feeling-sluggish-or-slowed-down', 'Feeling sluggish or slowed down','energy', null, null,               'slow heavy', true),
  ('unexplained-weight-change',    'Unexplained weight change',         'metabolic', null, null,            'weight gain loss', true),
  ('morning-facial-puffiness',     'Morning facial puffiness',          'kidney_bladder', 'head', 'swelling','puffy face fluid', true),
  ('hoarse-voice',                 'Hoarse voice',                      'other', 'throat', null,            'voice croaky', true),

  -- Circulation and heart.
  ('heart-racing-or-palpitations', 'Heart racing or palpitations',      'circulation', 'chest', null,       'skipped beats flutter', true),
  ('pounding-heartbeat-at-rest',   'Pounding heartbeat at rest',        'circulation', 'chest', null,       'thumping heart', true),
  ('short-of-breath',              'Short of breath',                   'respiratory', 'chest', null,       'breathless air hunger', true),
  ('breathless-on-stairs',         'Breathless after one flight of stairs', 'respiratory', null, null,      'exertion breathless', true),
  ('ankle-or-foot-swelling',       'Ankle or foot swelling',            'circulation', 'ankle', 'swelling', 'oedema edema puffy', true),
  ('hands-or-feet-falling-asleep', 'Hands or feet falling asleep',      'neurological', 'hand', 'numbness', 'pins and needles', true),
  ('bruising-easily',              'Bruising easily',                   'circulation', 'skin', null,        'bruise', true),
  ('heavy-or-achy-legs',           'Heavy or achy legs after standing', 'circulation', 'leg', 'heaviness',  'tired legs', true),

  -- Immune.
  ('frequent-colds-or-infections', 'Frequent colds or infections',      'immune', null, null,               'sick often', true),
  ('slow-recovery-from-illness',   'Slow recovery from illness',        'immune', null, null,               'lingering', true),
  ('slow-wound-healing',           'Slow wound healing',                'immune', 'skin', null,             'cuts heal slowly', true),
  ('swollen-or-tender-glands',     'Swollen or tender glands',          'immune', 'neck', 'swelling',       'lymph nodes', true),
  ('cold-sores-or-mouth-ulcers',   'Cold sores or mouth ulcers',        'immune', null, null,               'herpes aphthous', true),
  ('congestion-without-illness',   'Congestion without being sick',     'immune', 'throat', null,           'stuffy runny nose', true),
  ('itchy-or-watery-eyes',         'Itchy or watery eyes',              'skin_immune', 'eyes', null,        'allergy hay fever', true),
  ('low-grade-fever-feeling',      'Feeling feverish without being sick','immune', null, null,              'temperature', true),
  ('food-triggered-reactions',     'Food triggered congestion, itching or swelling', 'skin_immune', null, null, 'food sensitivity allergy', true),

  -- Kidney and bladder.
  ('waking-at-night-to-urinate',   'Waking at night to urinate',        'kidney_bladder', null, null,       'nocturia', true),
  ('frequent-urination',           'Frequent urination',                'kidney_bladder', null, null,       'peeing often bladder', true),
  ('sudden-urge-to-urinate',       'Sudden urge to urinate',            'kidney_bladder', null, null,       'urgency bladder', true),
  ('burning-on-urination',         'Burning on urination',              'kidney_bladder', null, 'burning',  'stinging pee', true),
  ('dark-or-strong-smelling-urine','Dark or strong smelling urine',     'kidney_bladder', null, null,       'concentrated urine', true),
  ('end-of-day-fluid-retention',   'Rings, shoes or clothes tighter by evening', 'kidney_bladder', null, 'swelling', 'fluid retention', true),
  ('under-eye-puffiness',          'Under-eye puffiness in the morning','kidney_bladder', 'eyes', 'swelling','puffy eyes fluid', true),
  ('urine-leaking-with-effort',    'Urine leaking with a cough or sneeze', 'kidney_bladder', 'pelvis', null,'incontinence pelvic floor', true),

  -- Musculoskeletal and joints.
  ('morning-stiffness',            'Morning stiffness',                 'musculoskeletal', 'whole_body', 'stiffness', 'stiff on waking', true),
  ('joint-aching',                 'Joint aching',                      'joint_movement', null, 'aching',   'joint pain arthralgia', true),
  ('muscle-soreness-without-exercise', 'Muscle soreness without exercise', 'musculoskeletal', null, null,   'myalgia sore', true),
  ('muscle-cramps-or-spasms',      'Muscle cramps or spasms',           'musculoskeletal', null, 'cramping','cramp twitch', true),
  ('pain-limiting-daily-activity', 'Pain limiting daily activity',      'pain_discomfort', null, 'pain',    'functional limit', true),
  ('neck-and-shoulder-tension',    'Neck and shoulder tension',         'musculoskeletal', 'neck', 'tightness', 'tight traps', true),
  ('low-back-ache',                'Low-back ache',                     'musculoskeletal', 'low_back', 'aching', 'lumbar back pain', true),
  ('low-back-tightness',           'Low-back tightness',                'musculoskeletal', 'low_back', 'tightness', 'lumbar tight', true),
  ('joint-swelling',               'Joint swelling',                    'joint_movement', null, 'swelling', 'swollen joint effusion', true),
  ('everyday-tasks-feel-heavier',  'Everyday tasks feeling heavier',    'energy', null, null,               'weakness effort', true),
  ('old-injuries-flaring-up',      'Old injuries flaring up',           'musculoskeletal', null, 'flare_ups','recurrence', true),
  ('hip-clicking',                 'Hip clicking',                      'joint_movement', 'hip', 'clicking','click snap pop hip', true),
  ('stiff-fingers-or-arms',        'Stiff fingers or arms',             'musculoskeletal', 'arm', 'stiffness','hand stiffness', true),

  -- Brain, nerves and mood.
  ('trouble-concentrating',        'Trouble concentrating',             'neurological', null, null,         'focus attention', true),
  ('forgetfulness',                'Forgetfulness',                     'neurological', null, null,         'memory', true),
  ('brain-fog',                    'Brain fog',                         'neurological', null, null,         'foggy thinking cloudy', true),
  ('headaches',                    'Headaches',                         'neurological', 'head', 'pain',     'headache migraine', true),
  ('feeling-anxious-or-on-edge',   'Feeling anxious or on edge',        'mood', null, null,                 'anxiety worry', true),
  ('feeling-down-or-flat',         'Feeling down or flat',              'mood', null, null,                 'low mood flat', true),
  ('racing-mind-at-bedtime',       'Racing mind at bedtime',            'sleep', null, null,                'cannot switch off', true),
  ('dizziness',                    'Dizziness',                         'neurological', 'head', null,       'lightheaded vertigo', true),
  ('tingling-or-numbness-in-hands-or-feet', 'Tingling or numbness in hands or feet', 'neurological', 'hand', 'tingling', 'pins needles numb', true),
  ('overwhelm-in-busy-environments', 'Overwhelm in busy environments',  'neurological', null, null,         'sensory overload noise', true),
  ('feeling-confused',             'Feeling confused',                  'neurological', null, null,         'disoriented muddled', true),
  ('blurred-vision',               'Blurred vision',                    'neurological', 'eyes', null,       'vision blurry', true),

  -- Hormonal.
  ('irregular-cycle',              'Irregular cycle',                   'hormonal', null, null,             'period unpredictable', true),
  ('heavy-or-painful-periods',     'Heavy or painful periods',          'hormonal', 'pelvis', 'pain',       'menorrhagia dysmenorrhea', true),
  ('hot-flashes',                  'Hot flashes',                       'hormonal', null, null,             'flushes heat', true),
  ('night-sweats',                 'Night sweats',                      'hormonal', null, null,             'sweating at night', true),
  ('mood-shifts-through-the-month','Mood shifts through the month',     'mood', null, null,                 'cyclical mood', true),
  ('premenstrual-irritability',    'Premenstrual irritability or tearfulness', 'mood', null, null,          'pms', true),
  ('sleep-disruption-around-cycle','Sleep disruption around the cycle', 'sleep', null, null,                'cyclical sleep', true),
  ('cyclical-sugar-or-carb-cravings', 'Cyclical sugar or carb cravings','nutrition', null, null,            'pms cravings', true),
  ('skin-or-hair-changes',         'Skin or hair changes',              'hormonal', 'skin', null,           'texture change', true),
  ('cyclical-bloating-or-swelling','Cyclical bloating or swelling',     'hormonal', null, 'swelling',       'water retention cycle', true),
  ('lower-energy-than-before',     'Lower energy than before',          'energy', null, null,               'flat tired', true),
  ('reduced-motivation-or-drive',  'Reduced motivation or drive',       'mood', null, null,                 'drive apathy', true),
  ('muscle-loss-without-activity-change', 'Muscle loss without a change in activity', 'musculoskeletal', null, null, 'sarcopenia wasting', true),
  ('midsection-weight-gain',       'Midsection weight gain',            'metabolic', 'abdomen', null,       'belly fat central', true),
  ('flatter-or-more-irritable-mood','Flatter or more irritable mood',   'mood', null, null,                 'irritable flat', true),
  ('longer-recovery-after-exercise','Longer recovery after exercise',   'energy', null, null,               'doms recovery', true),
  ('lighter-or-broken-sleep',      'Lighter or broken sleep',           'sleep', null, null,                'broken sleep waking', true),

  -- Breathing.
  ('chest-pain',                   'Chest pain',                        'pain_discomfort', 'chest', 'pain', 'chest ache', true),
  ('chest-tightness',              'Chest tightness',                   'respiratory', 'chest', 'tightness','tight chest band', true),
  ('faster-or-deeper-breathing',   'Faster or deeper breathing',        'respiratory', 'chest', null,       'hyperventilation over breathing', true),
  ('unable-to-breathe-deeply',     'Unable to breathe deeply',          'respiratory', 'chest', null,       'shallow restricted breath', true),
  ('tingling-fingers',             'Tingling fingers',                  'neurological', 'hand', 'tingling', 'pins needles fingers', true),
  ('tightness-around-the-mouth',   'Tightness around the mouth',        'neurological', 'jaw', 'tightness', 'perioral tingling', true),

  -- Posture and movement, from the camera assessment.
  ('forward-head-posture',         'Forward head posture',              'posture_alignment', 'neck', null,      'head carriage cervical', true),
  ('rounded-shoulders',            'Rounded shoulders',                 'posture_alignment', 'shoulder', null,  'protracted shoulders', true),
  ('elevated-shoulder',            'Elevated shoulder',                 'posture_alignment', 'shoulder', null,  'high shoulder uneven', true),
  ('pelvic-tilt',                  'Pelvic tilt',                       'posture_alignment', 'pelvis', null,    'anterior posterior tilt', true),
  ('increased-upper-back-curve',   'Increased upper back curve',        'posture_alignment', 'upper_back', null,'kyphosis rounded back', true),
  ('lumbar-posture-outside-neutral','Lumbar posture outside neutral',   'posture_alignment', 'low_back', null,  'lordosis flat back', true),
  ('inward-knee-drift',            'Inward knee drift',                 'posture_alignment', 'knee', null,      'valgus knees in', true),
  ('foot-turnout',                 'Foot turnout',                      'posture_alignment', 'foot', null,      'toes out external rotation', true),
  ('weight-shift-to-one-side',     'Weight shift to one side',          'posture_alignment', 'whole_body', null,'loading asymmetry', true),
  ('observed-breathing-mechanics', 'Observed breathing mechanics',      'respiratory', 'chest', null,           'chest dominant diaphragmatic', true),
  ('uneven-hips',                  'Uneven hips',                       'posture_alignment', 'hip', null,       'hip asymmetry level', true),
  ('lateral-trunk-asymmetry',      'Lateral trunk asymmetry',           'posture_alignment', 'mid_back', null,  'side bend asymmetry', true),
  ('lower-crossed-pattern',        'Lower-crossed postural pattern',    'posture_alignment', 'pelvis', null,    'tight hips long back', true),
  ('sagittal-trunk-posture',       'Sagittal trunk posture',            'posture_alignment', 'mid_back', null,  'forward lean inclination', true),
  ('pelvic-drop',                  'Pelvic drop',                       'posture_alignment', 'pelvis', null,    'trendelenburg hip drop', true),

  -- The Daily Check-In's one body question.
  ('daily-pain-or-discomfort',     'Daily pain or discomfort',          'pain_discomfort', 'whole_body', 'pain','daily check in pain', true)
on conflict (signal_slug) do nothing;

-- ---------------------------------------------------------------------
-- 6. The dictionary. One source's own key to the standardized signal.
--
-- A KEY THAT IS NOT HERE IS SKIPPED, NOT GUESSED AT. The adapters read
-- this table and nothing else: there is no string transform anywhere in
-- the code that turns a question ref into a signal name, because a
-- transform would invent a signal out of a question nobody had reviewed.
-- ---------------------------------------------------------------------

-- Rooted Reset Body Systems Survey: the eleven section rollups.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug) values
  ('body_systems_survey', 'section', 'digestion',   'bss-system-digestion'),
  ('body_systems_survey', 'section', 'blood_sugar', 'bss-system-blood-sugar'),
  ('body_systems_survey', 'section', 'liver',       'bss-system-liver'),
  ('body_systems_survey', 'section', 'adrenals',    'bss-system-adrenals'),
  ('body_systems_survey', 'section', 'thyroid',     'bss-system-thyroid'),
  ('body_systems_survey', 'section', 'heart',       'bss-system-heart'),
  ('body_systems_survey', 'section', 'immune',      'bss-system-immune'),
  ('body_systems_survey', 'section', 'kidney',      'bss-system-kidney'),
  ('body_systems_survey', 'section', 'muscles',     'bss-system-muscles'),
  ('body_systems_survey', 'section', 'brain',       'bss-system-brain'),
  ('body_systems_survey', 'section', 'hormonal',    'bss-system-hormonal')
on conflict (source_key, external_kind, external_key) do nothing;

-- Rooted Reset Body Systems Survey: every one of its questions, so a
-- notable individual response can be carried across as the signal it is.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug, body_area_key) values
  ('body_systems_survey', 'question', 'D1',  'bloating-after-eating',            null),
  ('body_systems_survey', 'question', 'D2',  'excessive-gas',                    null),
  ('body_systems_survey', 'question', 'D3',  'heartburn',                        null),
  ('body_systems_survey', 'question', 'D4',  'acid-reflux-or-burping',           null),
  ('body_systems_survey', 'question', 'D5',  'fullness-long-after-meals',        null),
  ('body_systems_survey', 'question', 'D6',  'stomach-pain-or-cramping',         null),
  ('body_systems_survey', 'question', 'D7',  'loose-or-urgent-stools',           null),
  ('body_systems_survey', 'question', 'D8',  'constipation',                     null),
  ('body_systems_survey', 'question', 'D9',  'nausea',                           null),
  ('body_systems_survey', 'question', 'D10', 'undigested-food-in-stool',         null),
  ('body_systems_survey', 'question', 'B1',  'shaky-when-meals-delayed',         null),
  ('body_systems_survey', 'question', 'B2',  'sleepy-after-eating',              null),
  ('body_systems_survey', 'question', 'B3',  'sugar-cravings',                   null),
  ('body_systems_survey', 'question', 'B4',  'afternoon-caffeine-or-sugar',      null),
  ('body_systems_survey', 'question', 'B5',  'headaches-when-not-eaten',         null),
  ('body_systems_survey', 'question', 'B6',  'waking-hungry-or-restless',        null),
  ('body_systems_survey', 'question', 'B7',  'energy-rises-and-crashes',         null),
  ('body_systems_survey', 'question', 'B8',  'tired-after-a-full-meal',          null),
  ('body_systems_survey', 'question', 'B9',  'persistent-thirst',                null),
  ('body_systems_survey', 'question', 'L1',  'sensitivity-to-strong-smells',     null),
  ('body_systems_survey', 'question', 'L2',  'unwell-after-alcohol',             null),
  ('body_systems_survey', 'question', 'L3',  'waking-between-1-and-3-am',        null),
  ('body_systems_survey', 'question', 'L4',  'itchy-skin',                       'skin'),
  ('body_systems_survey', 'question', 'L5',  'skin-breakouts',                   'skin'),
  ('body_systems_survey', 'question', 'L6',  'groggy-on-waking',                 null),
  ('body_systems_survey', 'question', 'L7',  'unwell-after-greasy-food',         null),
  ('body_systems_survey', 'question', 'L8',  'dark-circles-under-eyes',          'eyes'),
  ('body_systems_survey', 'question', 'L9',  'strong-reaction-to-caffeine-or-medication', null),
  ('body_systems_survey', 'question', 'A1',  'waking-tired-after-full-sleep',    null),
  ('body_systems_survey', 'question', 'A2',  'late-night-second-wind',           null),
  ('body_systems_survey', 'question', 'A3',  'dizziness-on-standing',            null),
  ('body_systems_survey', 'question', 'A4',  'salt-cravings',                    null),
  ('body_systems_survey', 'question', 'A5',  'small-stresses-feel-harder',       null),
  ('body_systems_survey', 'question', 'A6',  'wired-and-tired',                  null),
  ('body_systems_survey', 'question', 'A7',  'needing-caffeine-to-start',        null),
  ('body_systems_survey', 'question', 'A8',  'heart-racing-under-stress',        'chest'),
  ('body_systems_survey', 'question', 'A9',  'slow-recovery-after-demanding-days', null),
  ('body_systems_survey', 'question', 'A10', 'light-sensitivity',                'eyes'),
  ('body_systems_survey', 'question', 'T1',  'feeling-cold-when-others-are-not', null),
  ('body_systems_survey', 'question', 'T2',  'cold-hands-or-feet',               'hand'),
  ('body_systems_survey', 'question', 'T3',  'hair-thinning-or-shedding',        null),
  ('body_systems_survey', 'question', 'T4',  'dry-skin',                         'skin'),
  ('body_systems_survey', 'question', 'T5',  'feeling-sluggish-or-slowed-down',  null),
  ('body_systems_survey', 'question', 'T6',  'unexplained-weight-change',        null),
  ('body_systems_survey', 'question', 'T7',  'morning-facial-puffiness',         'head'),
  ('body_systems_survey', 'question', 'T8',  'constipation',                     null),
  ('body_systems_survey', 'question', 'T9',  'hoarse-voice',                     'throat'),
  ('body_systems_survey', 'question', 'H1',  'heart-racing-or-palpitations',     'chest'),
  ('body_systems_survey', 'question', 'H2',  'short-of-breath',                  'chest'),
  ('body_systems_survey', 'question', 'H3',  'breathless-on-stairs',             null),
  ('body_systems_survey', 'question', 'H4',  'ankle-or-foot-swelling',           'ankle'),
  ('body_systems_survey', 'question', 'H5',  'hands-or-feet-falling-asleep',     'hand'),
  ('body_systems_survey', 'question', 'H6',  'bruising-easily',                  'skin'),
  ('body_systems_survey', 'question', 'H7',  'heavy-or-achy-legs',               'leg'),
  ('body_systems_survey', 'question', 'H8',  'pounding-heartbeat-at-rest',       'chest'),
  ('body_systems_survey', 'question', 'H9',  'cold-hands-or-feet',               'hand'),
  ('body_systems_survey', 'question', 'I1',  'frequent-colds-or-infections',     null),
  ('body_systems_survey', 'question', 'I2',  'slow-recovery-from-illness',       null),
  ('body_systems_survey', 'question', 'I3',  'slow-wound-healing',               'skin'),
  ('body_systems_survey', 'question', 'I4',  'swollen-or-tender-glands',         'neck'),
  ('body_systems_survey', 'question', 'I5',  'cold-sores-or-mouth-ulcers',       null),
  ('body_systems_survey', 'question', 'I6',  'congestion-without-illness',       'throat'),
  ('body_systems_survey', 'question', 'I7',  'itchy-or-watery-eyes',             'eyes'),
  ('body_systems_survey', 'question', 'I8',  'low-grade-fever-feeling',          null),
  ('body_systems_survey', 'question', 'I9',  'food-triggered-reactions',         null),
  ('body_systems_survey', 'question', 'K1',  'waking-at-night-to-urinate',       null),
  ('body_systems_survey', 'question', 'K2',  'frequent-urination',               null),
  ('body_systems_survey', 'question', 'K3',  'sudden-urge-to-urinate',           null),
  ('body_systems_survey', 'question', 'K4',  'burning-on-urination',             null),
  ('body_systems_survey', 'question', 'K5',  'dark-or-strong-smelling-urine',    null),
  ('body_systems_survey', 'question', 'K6',  'end-of-day-fluid-retention',       null),
  ('body_systems_survey', 'question', 'K7',  'under-eye-puffiness',              'eyes'),
  ('body_systems_survey', 'question', 'K8',  'urine-leaking-with-effort',        'pelvis'),
  ('body_systems_survey', 'question', 'M1',  'morning-stiffness',                'whole_body'),
  ('body_systems_survey', 'question', 'M2',  'joint-aching',                     null),
  ('body_systems_survey', 'question', 'M3',  'muscle-soreness-without-exercise', null),
  ('body_systems_survey', 'question', 'M4',  'muscle-cramps-or-spasms',          null),
  ('body_systems_survey', 'question', 'M5',  'pain-limiting-daily-activity',     null),
  ('body_systems_survey', 'question', 'M6',  'neck-and-shoulder-tension',        'neck'),
  ('body_systems_survey', 'question', 'M7',  'low-back-ache',                    'low_back'),
  ('body_systems_survey', 'question', 'M8',  'joint-swelling',                   null),
  ('body_systems_survey', 'question', 'M9',  'everyday-tasks-feel-heavier',      null),
  ('body_systems_survey', 'question', 'M10', 'old-injuries-flaring-up',          null),
  ('body_systems_survey', 'question', 'N1',  'trouble-concentrating',            null),
  ('body_systems_survey', 'question', 'N2',  'forgetfulness',                    null),
  ('body_systems_survey', 'question', 'N3',  'brain-fog',                        null),
  ('body_systems_survey', 'question', 'N4',  'headaches',                        'head'),
  ('body_systems_survey', 'question', 'N5',  'feeling-anxious-or-on-edge',       null),
  ('body_systems_survey', 'question', 'N6',  'feeling-down-or-flat',             null),
  ('body_systems_survey', 'question', 'N7',  'racing-mind-at-bedtime',           null),
  ('body_systems_survey', 'question', 'N8',  'dizziness',                        'head'),
  ('body_systems_survey', 'question', 'N9',  'tingling-or-numbness-in-hands-or-feet', 'hand'),
  ('body_systems_survey', 'question', 'N10', 'overwhelm-in-busy-environments',   null),
  ('body_systems_survey', 'question', 'HA1', 'irregular-cycle',                  null),
  ('body_systems_survey', 'question', 'HA2', 'heavy-or-painful-periods',         'pelvis'),
  ('body_systems_survey', 'question', 'HA3', 'hot-flashes',                      null),
  ('body_systems_survey', 'question', 'HA4', 'night-sweats',                     null),
  ('body_systems_survey', 'question', 'HA5', 'mood-shifts-through-the-month',    null),
  ('body_systems_survey', 'question', 'HA6', 'premenstrual-irritability',        null),
  ('body_systems_survey', 'question', 'HA7', 'sleep-disruption-around-cycle',    null),
  ('body_systems_survey', 'question', 'HA8', 'cyclical-sugar-or-carb-cravings',  null),
  ('body_systems_survey', 'question', 'HA9', 'skin-or-hair-changes',             'skin'),
  ('body_systems_survey', 'question', 'HA10','cyclical-bloating-or-swelling',    null),
  ('body_systems_survey', 'question', 'HB1', 'lower-energy-than-before',         null),
  ('body_systems_survey', 'question', 'HB2', 'reduced-motivation-or-drive',      null),
  ('body_systems_survey', 'question', 'HB3', 'muscle-loss-without-activity-change', null),
  ('body_systems_survey', 'question', 'HB4', 'midsection-weight-gain',           'abdomen'),
  ('body_systems_survey', 'question', 'HB5', 'flatter-or-more-irritable-mood',   null),
  ('body_systems_survey', 'question', 'HB6', 'longer-recovery-after-exercise',   null),
  ('body_systems_survey', 'question', 'HB7', 'lighter-or-broken-sleep',          null),
  ('body_systems_survey', 'question', 'HB8', 'night-sweats',                     null)
on conflict (source_key, external_kind, external_key) do nothing;

-- Rooted Reset Whole-Body Signal Assessment: ITS NINE SECTION SIGNAL
-- PERCENTAGES AND NOTHING ELSE. No Zone key, no chakra lens, no organ or
-- gland list and no individual answer is mapped, because that
-- instrument's practitioner layer is fenced where it is and this library
-- is not a second door into it.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug) values
  ('whole_body_signal', 'section', 'fuel_quality',          'wbs-section-fuel-quality'),
  ('whole_body_signal', 'section', 'fuel_rhythm',           'wbs-section-fuel-rhythm'),
  ('whole_body_signal', 'section', 'digestive_flow',        'wbs-section-digestive-flow'),
  ('whole_body_signal', 'section', 'gut_environment',       'wbs-section-gut-environment'),
  ('whole_body_signal', 'section', 'clearance_elimination', 'wbs-section-clearance-elimination'),
  ('whole_body_signal', 'section', 'stress_recovery',       'wbs-section-stress-recovery'),
  ('whole_body_signal', 'section', 'body_clock',            'wbs-section-body-clock'),
  ('whole_body_signal', 'section', 'hormone_pelvic_rhythm', 'wbs-section-hormone-pelvic-rhythm'),
  ('whole_body_signal', 'section', 'recovery_capacity',     'wbs-section-recovery-capacity')
on conflict (source_key, external_kind, external_key) do nothing;

-- Breathing Pattern Check-In: the total, and the sixteen items.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug, body_area_key) values
  ('breathing_pattern_check_in', 'metric', 'total_score',              'breathing-pattern-total',       null),
  ('breathing_pattern_check_in', 'item',   'chest_pain',               'chest-pain',                    'chest'),
  ('breathing_pattern_check_in', 'item',   'feeling_tense',            'feeling-tense',                 null),
  ('breathing_pattern_check_in', 'item',   'blurred_vision',           'blurred-vision',                'eyes'),
  ('breathing_pattern_check_in', 'item',   'dizzy_spells',             'dizziness',                     'head'),
  ('breathing_pattern_check_in', 'item',   'feeling_confused',         'feeling-confused',              null),
  ('breathing_pattern_check_in', 'item',   'faster_deeper_breathing',  'faster-or-deeper-breathing',    'chest'),
  ('breathing_pattern_check_in', 'item',   'short_of_breath',          'short-of-breath',               'chest'),
  ('breathing_pattern_check_in', 'item',   'tight_chest',              'chest-tightness',               'chest'),
  ('breathing_pattern_check_in', 'item',   'bloated_stomach',          'bloated-stomach',               'abdomen'),
  ('breathing_pattern_check_in', 'item',   'tingling_fingers',         'tingling-fingers',              'hand'),
  ('breathing_pattern_check_in', 'item',   'unable_to_breathe_deeply', 'unable-to-breathe-deeply',      'chest'),
  ('breathing_pattern_check_in', 'item',   'stiff_fingers_arms',       'stiff-fingers-or-arms',         'arm'),
  ('breathing_pattern_check_in', 'item',   'tight_round_mouth',        'tightness-around-the-mouth',    'jaw'),
  ('breathing_pattern_check_in', 'item',   'cold_hands_feet',          'cold-hands-or-feet',            'hand'),
  ('breathing_pattern_check_in', 'item',   'palpitations',             'heart-racing-or-palpitations',  'chest'),
  ('breathing_pattern_check_in', 'item',   'feelings_of_anxiety',      'feeling-anxious-or-on-edge',    null)
on conflict (source_key, external_kind, external_key) do nothing;

-- The camera posture and movement assessment's finding types.
--
-- 'custom' IS DELIBERATELY ABSENT. A coach defined observation has no
-- standardized name by definition, and inventing one from free text is
-- exactly what this dictionary exists to prevent.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug, body_area_key) values
  ('body_assessment', 'finding_type', 'forward_head',             'forward-head-posture',            'neck'),
  ('body_assessment', 'finding_type', 'rounded_shoulders',        'rounded-shoulders',               'shoulder'),
  ('body_assessment', 'finding_type', 'elevated_shoulder',        'elevated-shoulder',               'shoulder'),
  ('body_assessment', 'finding_type', 'pelvic_tilt',              'pelvic-tilt',                     'pelvis'),
  ('body_assessment', 'finding_type', 'thoracic_kyphosis',        'increased-upper-back-curve',      'upper_back'),
  ('body_assessment', 'finding_type', 'lumbar_posture',           'lumbar-posture-outside-neutral',  'low_back'),
  ('body_assessment', 'finding_type', 'knee_valgus',              'inward-knee-drift',               'knee'),
  ('body_assessment', 'finding_type', 'foot_turnout',             'foot-turnout',                    'foot'),
  ('body_assessment', 'finding_type', 'weight_shift',             'weight-shift-to-one-side',        'whole_body'),
  ('body_assessment', 'finding_type', 'breathing_pattern',        'observed-breathing-mechanics',    'chest'),
  ('body_assessment', 'finding_type', 'hip_asymmetry',            'uneven-hips',                     'hip'),
  ('body_assessment', 'finding_type', 'lateral_trunk_asymmetry',  'lateral-trunk-asymmetry',         'mid_back'),
  ('body_assessment', 'finding_type', 'lower_crossed_pattern',    'lower-crossed-pattern',           'pelvis'),
  ('body_assessment', 'finding_type', 'sagittal_trunk_posture',   'sagittal-trunk-posture',          'mid_back'),
  ('body_assessment', 'finding_type', 'pelvic_drop_screening',    'pelvic-drop',                     'pelvis')
on conflict (source_key, external_kind, external_key) do nothing;

-- The Daily Check-In's one body question.
insert into cross_system_signal_source_map (source_key, external_kind, external_key, signal_slug, body_area_key) values
  ('daily_check_in', 'metric', 'pain_discomfort_level', 'daily-pain-or-discomfort', 'whole_body')
on conflict (source_key, external_kind, external_key) do nothing;
