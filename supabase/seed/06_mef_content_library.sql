-- The MEF Knowledge Library — curated, reviewed lesson/action/reflection
-- bundles the Daily Coaching Feed selects from (lib/feed/selector.ts).
-- Nothing here is diagnostic or a medical treatment plan; every item is
-- general wellness education, non-invasive, and safety_classification
-- never exceeds 'medical_evaluation_recommended' (content needing a
-- coach's review before delivery doesn't belong in an auto-delivered
-- library at all — see migration 30's header comment).

insert into mef_content_items (
  content_key, title, summary, body, estimated_reading_minutes, four_doctors_category,
  topics, symptoms_or_concerns, goals, safety_classification, contraindication_tags,
  evidence_sources, author, reviewer, status, version, publication_date, last_reviewed_date,
  content_format, difficulty_level, eligibility_rules, suggested_action, reflection_prompt
) values

(
  'stress_calming_nervous_system',
  'Calming Your Nervous System After a Stressful Day',
  'A short, practical look at how your body shifts out of "on alert" mode — and what actually helps it downshift.',
  'When stress builds up, your body stays in a heightened, "on alert" state long after the stressful moment has passed. That lingering activation is normal — it is not a sign anything is wrong. What helps is giving your body clear signals that it is safe to settle: slower breathing, a change of environment, and a few minutes without new demands on your attention. Even five quiet minutes, done consistently, teaches your nervous system that "on alert" is temporary, not permanent.',
  2, 'doctor_quiet',
  '["stress", "nervous system", "recovery"]', '["elevated stress", "tension"]', '["reduce stress", "improve recovery"]',
  'standard_coaching', '[]',
  '[{"title": "NIMH — 5 Things You Should Know About Stress", "url": "https://www.nimh.nih.gov/health/publications/stress"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "stress"}',
  'Set a timer for 5 minutes today and sit somewhere quiet with no screen — just notice your breathing.',
  'What is one moment today when you felt your body finally "settle down"?'
),

(
  'sleep_wind_down_routine',
  'Building a Wind-Down Routine',
  'Your body responds to consistent cues — a simple wind-down routine helps signal that sleep is coming.',
  'Falling asleep easily is often less about willpower and more about consistent cues. A wind-down routine — the same few steps, in the same order, most nights — teaches your body to associate those steps with sleep approaching. It does not need to be elaborate: dimming lights, putting your phone away, and a few minutes of quiet reading or stretching can be enough. The consistency matters more than the specific activities.',
  2, 'doctor_quiet',
  '["sleep", "routine"]', '["difficulty falling asleep", "poor sleep quality"]', '["improve sleep"]',
  'standard_coaching', '[]',
  '[{"title": "Sleep Foundation — Bedtime Routines for Adults", "url": "https://www.sleepfoundation.org"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "sleep"}',
  'Pick one calming step (dim lights, put your phone in another room, or stretch) and do it tonight before bed.',
  'What is one thing that made tonight''s wind-down feel different from a typical night?'
),

(
  'sleep_consistent_schedule',
  'Why a Consistent Sleep Schedule Matters',
  'Going to bed and waking up around the same time — even on weekends — supports deeper, more restorative sleep.',
  'Your body has an internal clock that thrives on regularity. Going to bed and waking up at roughly the same time each day — yes, even on weekends — helps that internal clock stay aligned, which tends to make falling asleep easier and waking up less groggy. A shifting schedule, even by a couple of hours, can leave you feeling like you are perpetually adjusting to a new time zone.',
  2, 'doctor_quiet',
  '["sleep", "consistency"]', '["irregular sleep schedule", "fatigue"]', '["improve sleep", "improve consistency"]',
  'standard_coaching', '[]',
  '[{"title": "CDC — Sleep and Sleep Disorders", "url": "https://www.cdc.gov/sleep"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "sleep"}',
  'Choose a target bedtime for tonight that is within 30 minutes of when you actually plan to sleep — and aim for it.',
  'How close was your actual bedtime to your target — and what got in the way, if anything?'
),

(
  'hydration_energy_connection',
  'Hydration and Your Energy Levels',
  'Even mild dehydration can show up as fatigue, brain fog, or a mid-afternoon slump.',
  'It is easy to mistake mild dehydration for tiredness, since the symptoms overlap so much: low energy, trouble concentrating, a dull headache. Your body needs water for nearly every process, including regulating energy. A simple habit — a glass of water with each meal and one in between — covers a meaningful amount of ground without requiring you to track ounces all day.',
  2, 'doctor_diet',
  '["hydration", "energy"]', '["fatigue", "low energy"]', '["improve hydration", "improve energy"]',
  'standard_coaching', '[]',
  '[{"title": "CDC — Water and Healthier Drinks", "url": "https://www.cdc.gov/nutrition"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "hydration"}',
  'Drink a full glass of water as soon as you notice this lesson, and one more with your next meal.',
  'Did you notice any difference in energy or focus after drinking more water today?'
),

(
  'hydration_habit_stacking',
  'Making Water Part of Your Routine',
  '"Habit stacking" — attaching a new habit to one you already do — makes hydration easier to remember.',
  'The easiest habits to keep are the ones you do not have to remember on their own. "Habit stacking" means attaching a new habit to something you already do reliably — brushing your teeth, starting your car, sitting down at your desk. Keeping a water bottle in the same spot as one of those daily anchors turns hydration into something automatic rather than another thing to track.',
  1, 'doctor_diet',
  '["hydration", "habits"]', '["inconsistent hydration"]', '["improve hydration", "improve consistency"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'tip', 'beginner', '{"priorityMetric": "hydration"}',
  'Place a water bottle next to something you touch every day (your keys, your desk, your coffee maker).',
  'What existing daily habit could you attach a glass of water to tomorrow?'
),

(
  'breathing_box_breathing',
  'Box Breathing for Quick Stress Relief',
  'A simple four-count breathing pattern used by everyone from athletes to first responders to settle quickly.',
  'Box breathing is a simple pattern: inhale for 4 counts, hold for 4, exhale for 4, hold for 4, then repeat. The structure itself is calming — it gives your mind something specific and simple to focus on while your breathing naturally slows. It takes about a minute to feel a difference and can be done anywhere, seated or standing, without anyone noticing.',
  1, 'doctor_quiet',
  '["breathing", "stress"]', '["acute stress", "feeling overwhelmed"]', '["reduce stress"]',
  'standard_coaching', '[]',
  '[{"title": "NHLBI — Breathing Exercises", "url": "https://www.nhlbi.nih.gov"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'practice', 'beginner', '{"priorityMetric": "stress"}',
  'Try 4 rounds of box breathing right now: in for 4, hold for 4, out for 4, hold for 4.',
  'Did you notice a physical shift (slower heart rate, relaxed shoulders) after a few rounds?'
),

(
  'breathing_diaphragmatic',
  'Belly Breathing Basics',
  'Shallow, chest-only breathing can reinforce a stressed state — breathing from your belly helps reverse it.',
  'When stressed, breathing tends to become shallow and chest-based, which can actually reinforce the feeling of being on edge. Diaphragmatic ("belly") breathing works against that: place a hand on your belly, breathe in slowly through your nose so your belly rises more than your chest, then exhale slowly. A few minutes of this signals your body that it is safe to relax.',
  2, 'doctor_quiet',
  '["breathing", "stress", "recovery"]', '["shallow breathing", "tension"]', '["reduce stress", "improve recovery"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'practice', 'beginner', '{}',
  'Spend 2 minutes breathing so your belly (not just your chest) rises and falls with each breath.',
  'How did belly breathing feel different from your normal breathing pattern?'
),

(
  'movement_short_daily_walk',
  'The Power of a Short Daily Walk',
  'A 10-minute walk is a realistic, sustainable way to support mood, energy, and circulation.',
  'You do not need an intense workout to benefit from movement. A 10-minute walk gets your circulation going, tends to lift mood, and is realistic enough to actually stick with on busy days. If it fits, stepping outside adds daylight exposure too, which can help regulate your sleep-wake cycle. The goal is consistency, not intensity.',
  2, 'doctor_movement',
  '["movement", "energy", "mood"]', '["low energy", "sedentary days"]', '["improve movement", "improve mood"]',
  'standard_coaching', '[]',
  '[{"title": "CDC — Benefits of Physical Activity", "url": "https://www.cdc.gov/physicalactivity"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "movement"}',
  'Take a 10-minute walk today, at whatever pace feels comfortable.',
  'How did your energy or mood feel right after the walk compared to before it?'
),

(
  'movement_gentle_stretching',
  'Gentle Stretching for Stiff Mornings',
  'A few slow stretches can ease morning stiffness without requiring a full workout.',
  'Stiffness after waking or after sitting for a while is common, and gentle stretching is often enough to ease it — no full workout required. Slow, controlled movement through your neck, shoulders, and hips for even 3-5 minutes can noticeably loosen things up. The key word is gentle: stretching should feel like a release, never like pushing through pain.',
  2, 'doctor_movement',
  '["movement", "stiffness"]', '["morning stiffness", "tightness"]', '["improve movement"]',
  'standard_coaching', '["pain_severity"]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'practice', 'beginner', '{}',
  'Do 3-5 minutes of slow, gentle stretching for your neck, shoulders, and hips.',
  'Which area felt the most noticeable relief after stretching?'
),

(
  'back_pain_supportive_movement',
  'Movement That Supports a Healthy Back',
  'Gentle, regular movement — not bed rest — is generally what helps a healthy back stay comfortable.',
  'It is a common instinct to move less when your back feels uncomfortable, but gentle, regular movement is generally more supportive than prolonged rest for everyday back comfort. Light activities like walking or slow stretching keep the muscles around your spine engaged without strain. This is general wellness education, not a treatment plan — if back discomfort is severe, sudden, or worsening, that is worth discussing with a healthcare professional rather than working through it alone.',
  3, 'doctor_movement',
  '["back health", "movement", "posture"]', '["mild back discomfort", "stiffness"]', '["improve movement", "reduce discomfort"]',
  'coaching_with_caution', '["pain_severity"]',
  '[{"title": "MedlinePlus — Back Pain", "url": "https://medlineplus.gov/backpain.html"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "pain"}',
  'Take a slow 5-10 minute walk today, keeping your posture relaxed and upright.',
  'Did gentle movement today change how your back felt, even slightly?'
),

(
  'posture_everyday_awareness',
  'Everyday Posture Awareness',
  'Small posture adjustments throughout the day add up more than one "perfect" stretch.',
  'Posture is less about holding one perfect position and more about avoiding staying in any one position for too long. Noticing when you have been hunched over a screen and taking a moment to reset — shoulders back, ears over shoulders, feet flat — a few times a day does more than a single stretching session. Setting a periodic reminder can help build the habit.',
  2, 'doctor_movement',
  '["posture", "movement"]', '["poor posture", "desk fatigue"]', '["improve movement", "reduce discomfort"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'tip', 'beginner', '{}',
  'Set a reminder for 3 times today to check and reset your posture for 10 seconds.',
  'What position did you catch yourself in most often today?'
),

(
  'posture_desk_setup',
  'Setting Up a Body-Friendly Workspace',
  'A few adjustments to your desk setup can meaningfully reduce strain over a full workday.',
  'Your workspace shapes your posture more than willpower does. A monitor at eye level, feet flat on the floor (or a footrest), and elbows near a 90-degree angle at your keyboard all reduce the strain that builds up over a workday. These are small, one-time adjustments that pay off continuously rather than requiring ongoing effort.',
  2, 'doctor_movement',
  '["posture", "workspace"]', '["desk fatigue", "neck strain"]', '["reduce discomfort"]',
  'standard_coaching', '[]',
  '[{"title": "OSHA — Computer Workstations", "url": "https://www.osha.gov"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{}',
  'Adjust one thing about your workspace today — monitor height, chair position, or foot support.',
  'Which single adjustment made the biggest difference to how you felt?'
),

(
  'digestion_mindful_eating',
  'Eating Slowly for Better Digestion',
  'Slowing down while eating gives your body time to properly signal fullness and digest comfortably.',
  'Eating quickly can outpace your body''s natural fullness signals, which take a little time to register. Slowing down — putting your fork down between bites, chewing thoroughly — gives your digestive system a better chance to work comfortably and helps you notice when you are actually satisfied. It is a small shift that can meaningfully change how you feel after meals.',
  2, 'doctor_diet',
  '["digestion", "eating habits"]', '["digestive discomfort", "overeating"]', '["improve digestion"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "digestion"}',
  'At your next meal, put your utensil down between bites at least a few times.',
  'Did eating more slowly change how full or comfortable you felt afterward?'
),

(
  'digestion_fiber_hydration',
  'Fiber, Water, and Gut Comfort',
  'Fiber and water work together — enough of one without the other can make digestion feel worse, not better.',
  'Fiber supports digestion, but it needs water to do its job well — increasing fiber without enough hydration can actually make things feel more uncomfortable, not less. The two work as a pair: vegetables, fruits, and whole grains alongside consistent water intake throughout the day tend to support more comfortable, regular digestion than focusing on either alone.',
  2, 'doctor_diet',
  '["digestion", "hydration", "nutrition"]', '["digestive discomfort"]', '["improve digestion", "improve hydration"]',
  'standard_coaching', '[]',
  '[{"title": "MedlinePlus — Dietary Fiber", "url": "https://medlineplus.gov/dietaryfiber.html"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{"priorityMetric": "digestion"}',
  'Add one extra glass of water alongside your next fiber-rich meal (vegetables, fruit, or whole grains).',
  'How did your digestion feel over the following few hours?'
),

(
  'recovery_rest_days_matter',
  'Why Rest Days Matter as Much as Activity',
  'Rest is when your body actually adapts and recovers — it is not "wasted" time.',
  'It is tempting to think of rest days as a pause from progress, but recovery is when your body actually adapts to the activity you have been doing. Muscles repair, energy stores replenish, and your nervous system gets a chance to settle during rest — skipping it consistently tends to backfire as fatigue or irritability rather than faster progress. A planned rest day is part of the plan, not a break from it.',
  2, 'doctor_quiet',
  '["recovery", "rest"]', '["fatigue", "overtraining"]', '["improve recovery"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{}',
  'If today is a lower-energy day, let it be one — skip strenuous activity and prioritize rest instead.',
  'How did giving yourself permission to rest today feel, physically or mentally?'
),

(
  'recovery_active_recovery',
  'Active Recovery: Movement That Restores',
  'Light movement — not total stillness — often helps you recover faster than doing nothing at all.',
  'Recovery does not always mean total stillness. "Active recovery" — light walking, gentle stretching, easy movement — often helps you feel better faster than doing nothing at all, by keeping blood flow moving without adding strain. The goal on a recovery day is ease, not effort: if it starts to feel like a workout, it has gone too far.',
  2, 'doctor_movement',
  '["recovery", "movement"]', '["soreness", "fatigue"]', '["improve recovery", "improve movement"]',
  'standard_coaching', '["pain_severity"]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'practice', 'beginner', '{}',
  'Do 10-15 minutes of easy, low-effort movement today — a slow walk or light stretching.',
  'How did light movement feel compared to a full rest day or a hard workout?'
),

(
  'consistency_small_steps',
  'Small, Consistent Steps Beat Big Pushes',
  'A modest habit you actually keep beats an ambitious one you abandon after a week.',
  'It is common to start big — an ambitious new routine — and burn out within a week. Small, sustainable steps tend to win over time simply because they are easier to keep doing. A 5-minute habit done consistently for a month builds more real change than an hour-long routine attempted for three days and abandoned. Progress compounds; consistency is what lets it compound.',
  2, 'doctor_happiness',
  '["consistency", "habits", "motivation"]', '["inconsistency", "burnout"]', '["improve consistency"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{}',
  'Pick one wellness habit and commit to a smaller version of it (half the time or effort) for just today.',
  'Did making the habit smaller make it easier to actually follow through?'
),

(
  'consistency_travel',
  'Staying on Track While Traveling',
  'Travel disrupts routines for almost everyone — the goal is a lighter version of your routine, not a perfect one.',
  'Travel — new time zones, unfamiliar schedules, less control over meals — makes consistency harder for nearly everyone, not just you. The most realistic goal while traveling is not maintaining your full routine perfectly, but keeping a lighter version of it: a few minutes of movement, reasonable hydration, and getting sleep when you can. An imperfect but present routine beats an abandoned one.',
  2, 'doctor_happiness',
  '["consistency", "travel"]', '["disrupted routine"]', '["improve consistency"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'tip', 'beginner', '{}',
  'If you are traveling or off your usual schedule today, pick just one small wellness habit to keep.',
  'Which single habit felt most doable to keep, even with a disrupted schedule?'
),

(
  'four_doctors_intro',
  'Meet the Four Doctors',
  'A simple, whole-person framework MEF coaching is built around: Diet, Quiet, Movement, and Happiness.',
  'MEF coaching is organized around a simple idea: lasting wellness comes from attention to four connected areas, sometimes called the "Four Doctors." Doctor Diet covers nutrition and hydration. Doctor Quiet covers rest, sleep, and stress recovery. Doctor Movement covers physical activity and posture. Doctor Happiness covers mood, connection, and motivation. No single area works in isolation — a change in one tends to show up in the others, which is why your coaching experience often draws connections across all four rather than treating them separately.',
  3, 'doctor_happiness',
  '["four doctors", "wellness framework"]', '[]', '["understand the four doctors framework"]',
  'standard_coaching', '[]',
  '[]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'lesson', 'beginner', '{}',
  'Think about which of the Four Doctors (Diet, Quiet, Movement, Happiness) feels most in need of attention this week.',
  'Which of the Four Doctors do you feel most connected to right now — and which feels most neglected?'
),

(
  'happiness_gratitude_practice',
  'A Simple Gratitude Practice',
  'Naming a few specific things you are grateful for is a brief, evidence-informed way to support mood.',
  'Gratitude practices are simple by design: naming a few specific things you are grateful for, even briefly, has been associated with improved mood over time. Specificity matters more than length — "grateful for my coffee this morning" tends to land better than a vague general statement. It takes under a minute and requires nothing but a moment of attention.',
  1, 'doctor_happiness',
  '["mood", "gratitude", "mental wellbeing"]', '["low mood"]', '["improve mood"]',
  'standard_coaching', '[]',
  '[{"title": "NIH News in Health — Practicing Gratitude", "url": "https://newsinhealth.nih.gov"}]',
  'MEF Wellness Team', 'MEF Clinical Review Panel', 'published', 1, '2026-01-05', '2026-01-05',
  'practice', 'beginner', '{"priorityMetric": "mood"}',
  'Write down (or think through) 3 specific things you are grateful for today.',
  'Did anything surprise you about what came to mind when you thought about gratitude?'
);
