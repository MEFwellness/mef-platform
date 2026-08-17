/**
 * The Visibility Catalog — every thing in the member app, and the one rule
 * that decides whether she sees it.
 *
 * READ THIS BEFORE ADDING A FEATURE. A new entry with `{ kind: 'always' }`
 * is the thing this whole layer exists to prevent. "Always" is a real
 * answer for a handful of things (the check-in, safety, the day's one
 * priority) and a wrong answer for everything else. If you cannot say who
 * needs it, set `couldNotInferRule: true` so it shows up in the report and
 * gets a real rule later, rather than quietly becoming permanent furniture.
 *
 * Every rule reads from the Member Interpretation Layer's canonical
 * findings and evidence tiers, from her intake answers, or from something
 * she actually did. No rule reads raw member data and reaches its own
 * verdict, which is how visibility and interpretation are kept from
 * disagreeing.
 *
 * Water tracking is the working model this generalizes (migration 163):
 * one real answer at intake decides whether a whole feature exists for her,
 * three states with "not asked yet" behaving safely, and every surface
 * asking one place rather than inventing its own answer. The difference
 * here is that the answer is stored per feature instead of per column, so
 * adding the eightieth feature does not add the eightieth column.
 */

import type { FeatureDefinition, FeatureKey } from './types';

/**
 * The concern values `primary_concern` actually allows (migration 68), and
 * the anchor question keys `lib/onboarding/adaptivePlan.ts` guarantees are
 * asked of every member exactly once. Rules below reference these by name
 * so a typo is a compile error rather than a rule that silently never
 * fires.
 */
export const INTAKE = {
  primaryConcern: 'primary_concern',
  sleepQuality: 'baseline_sleep_quality',
  stressLevel: 'baseline_stress_level',
  energyLevel: 'baseline_energy_level',
  digestion: 'baseline_digestion',
  painAreas: 'baseline_pain_areas',
  movementFrequency: 'baseline_movement_frequency',
  hydration: 'baseline_hydration',
} as const;

const PAIN_AREAS = ['neck', 'shoulders', 'upper_back', 'lower_back', 'hips', 'knees'] as const;

/**
 * The scales, and which end is the concerning one. Sleep, energy and
 * digestion run 1 (very poor) to 5 (excellent), so LOW is the concern.
 * Stress runs 1 (very low) to 5 (very high), so HIGH is the concern. This
 * is `lib/onboarding/scale.ts`'s own endpoint labelling, restated here as
 * the reason the two directions below are not a mistake.
 */
const CONCERNING_QUALITY = 3; // at most: "okay" or worse on a 1-5 quality scale
const CONCERNING_STRESS = 4; // at least: "high" or worse

/**
 * FEATURE KEYS. Exported so a surface imports the constant rather than
 * typing the string, which means renaming one is a compile error rather
 * than a card that silently never renders again.
 */
export const F = {
  // ---- Always on, and each one says why ----
  checkinDaily: 'checkin.daily',
  checkinEvening: 'checkin.evening',
  safetyFlagConcern: 'safety.flag_concern',
  safetyCoachMessages: 'safety.coach_messages',
  priorityCard: 'home.priority_card',
  rootScore: 'home.root_score',
  dailyBrief: 'home.daily_brief',
  talkToRoot: 'feature.talk_to_root',

  // ---- Home ----
  homeWeeklyReview: 'home.weekly_review',
  homeInviteCards: 'home.invite_cards',
  homeQuickActionCase: 'home.quick_action_case',
  homeQuickActionMovement: 'home.quick_action_movement',
  homeAssignedPrograms: 'home.assigned_programs',
  homeActiveExperiments: 'home.active_experiments',
  homeResetPlan: 'home.reset_plan',
  homeMovementAssessmentCard: 'home.movement_assessment_card',
  homeQuestionnairesCard: 'home.questionnaires_card',
  homeComprehensiveCard: 'home.comprehensive_assessment_card',
  homeNoticingCarousel: 'home.noticing_carousel',
  homeTrendsEnergy: 'home.trends_energy',
  homeNextSession: 'home.next_session',
  homeWearableConnect: 'home.wearable_connect',

  // ---- Today ----
  todayRecommendations: 'today.recommendations',
  todayLesson: 'today.lesson',
  todayNumbers: 'today.numbers_grid',
  todayTotals: 'today.totals',
  todayCapability: 'today.capability',
  todayPastLessons: 'today.past_lessons',

  // ---- Trackers ----
  trackerWater: 'tracker.water',
  trackerMovementLevel: 'tracker.movement_level',
  trackerHabits: 'tracker.habits',
  trackerFoodLens: 'tracker.food_lens',

  // ---- Progress ----
  progressWellnessStory: 'progress.wellness_story',
  progressCoachingInsights: 'progress.coaching_insights',
  progressWellnessPatterns: 'progress.wellness_patterns',
  progressWellnessIdentity: 'progress.wellness_identity',
  progressRecommendations: 'progress.recommendations',
  progressTrends: 'progress.trends',
  progressConsistency: 'progress.consistency',
  progressAssessmentFindings: 'progress.assessment_findings',
  progressComparison: 'progress.comparison',
  progressTimeline: 'progress.timeline',
  progressHistory: 'progress.history',

  // ---- Feature modules ----
  featureRootMap: 'feature.root_map',
  featureCaseView: 'feature.case_view',
  featureInsights: 'feature.insights',
  featureNoticing: 'feature.noticing',
  featureRecommendations: 'feature.recommendations',
  featureMovement: 'feature.movement',
  featureQuestionnaires: 'feature.questionnaires',
  featureBodyAssessment: 'feature.body_assessment',
  featureResetPlan: 'feature.reset_plan',
  featurePrograms: 'feature.programs',
  featureWearables: 'feature.wearables',
  featureNotifications: 'feature.notifications',

  // ---- Assessments (registry keys) ----
  assessmentOnboarding: 'assessment.onboarding-health-history',
  assessmentNutritionLifestyle: 'assessment.chek-hlc1-nutrition-lifestyle',
  assessmentFourDoctors: 'assessment.four-doctors',
  assessmentPrimalPattern: 'assessment.primal-pattern-diet-type',
  assessmentBody: 'assessment.body-assessment',
  assessmentReadinessToChange: 'assessment.readiness-to-change',
  assessmentShortHaq: 'assessment.short-haq',
  assessmentFinding1Love: 'assessment.finding-1-love',
  assessmentWbsa: 'assessment.wbsa',
  assessmentCoreValues: 'assessment.core-values-snapshot',
  assessmentLifeSignal: 'assessment.life-signal-check',
  assessmentReadinessPulse: 'assessment.readiness-pulse',

  // ---- Follow-up question sets, inside the daily check-in ----
  questionsSleep: 'questions.sleep',
  questionsStress: 'questions.stress',
  questionsDigestion: 'questions.digestion',
  questionsMovement: 'questions.movement',
  questionsMechanics: 'questions.mechanics',
  questionsFuel: 'questions.fuel',
  questionsContext: 'questions.context',
} as const;

/**
 * The check-in's rotating driver probes, grouped by the driver domain they
 * belong to (`driver_domains`, migration 106). A probe is only ever offered
 * when its domain's question set is revealed, which is what "an answer can
 * open a short follow-up set, and unanswered branches simply never appear"
 * means in this app's own existing machinery rather than a second one.
 *
 * CTX (Context) is deliberately always revealed: it is the "what else was
 * going on" set, it belongs to no concern, and hiding it would remove the
 * one place a member can tell Root about something the rules do not know.
 */
export const DRIVER_DOMAIN_TO_FEATURE: Record<string, FeatureKey> = {
  SLP: F.questionsSleep,
  STR: F.questionsStress,
  DIG: F.questionsDigestion,
  MOV: F.questionsMovement,
  MEC: F.questionsMechanics,
  FUE: F.questionsFuel,
  CTX: F.questionsContext,
};

export const VISIBILITY_CATALOG: FeatureDefinition[] = [
  // ===================================================================
  // SAFETY AND THE DAILY LOOP. Exempt in both directions.
  // ===================================================================
  {
    key: F.checkinDaily,
    kind: 'feature',
    surface: 'today',
    label: 'Daily check-in',
    whoNeedsThis:
      'Everyone. The check-in is what feeds safety monitoring, so it can never be hidden from anyone for any reason.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
    safetyCritical: true,
  },
  {
    key: F.checkinEvening,
    kind: 'feature',
    surface: 'today',
    label: 'Evening reflection',
    whoNeedsThis:
      'Everyone, for the same reason as the daily check-in: it carries the same free-text box that routes into safety review.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
    safetyCritical: true,
  },
  {
    key: F.safetyFlagConcern,
    kind: 'feature',
    surface: 'none',
    label: 'Flag a concern',
    whoNeedsThis: 'Everyone, always. A member must always be able to raise something.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
    safetyCritical: true,
  },
  {
    key: F.safetyCoachMessages,
    kind: 'card',
    surface: 'today',
    label: 'Messages from your coach',
    whoNeedsThis:
      'Everyone. A coach reaching out is never something a visibility rule may swallow.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
    safetyCritical: true,
  },
  {
    key: F.priorityCard,
    kind: 'card',
    surface: 'home',
    label: "Today's one priority",
    whoNeedsThis:
      'Everyone. This is the single primary action on Home and the one place the day is decided. Protected: the Priority Card decision engine is out of scope for this layer.',
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.talkToRoot,
    kind: 'feature',
    surface: 'nav',
    label: 'Talk to Root',
    whoNeedsThis:
      'Everyone. It is the one way to ask a question the app did not anticipate, and it routes free text into safety classification.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
    safetyCritical: true,
  },

  // ===================================================================
  // HOME
  // ===================================================================
  {
    key: F.rootScore,
    kind: 'card',
    surface: 'home',
    label: 'Root Score',
    whoNeedsThis:
      'Everyone once there is anything behind it. Before her first check-in the number is not about her, so it waits.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 1 }],
    revealSentence: 'You have logged your first day, so your Root Score is on now.',
    touchedBy: { kind: 'signal', signal: 'has_root_score_snapshot' },
  },
  {
    key: F.dailyBrief,
    kind: 'card',
    surface: 'home',
    label: "Root's daily brief",
    whoNeedsThis:
      'Anyone with a logged day to report back. It reads her own numbers to her, so with no numbers it has nothing to say.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 1 }],
    revealSentence: 'Now that you have logged a day, I can tell you what I am seeing each morning.',
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: F.homeWeeklyReview,
    kind: 'card',
    surface: 'home',
    label: 'Weekly Root Review',
    whoNeedsThis:
      'A member with a real week behind her. The review is a look back and needs something to look back at.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 3 }],
    revealSentence: 'You have a few days logged now, so I have started putting a weekly look back together for you.',
    touchedBy: { kind: 'signal', signal: 'has_weekly_review' },
  },
  {
    key: F.homeInviteCards,
    kind: 'card',
    surface: 'home',
    label: 'Invitations from your coach and from Root',
    whoNeedsThis:
      'A member with something genuinely waiting for her: a coach assignment, or the next unstarted conversation in the opening arc. It renders nothing at all when there is neither, which is why it is on the short "always" list rather than carrying a rule.',
    /**
     * ALWAYS, and stated as such on purpose.
     *
     * This carried `{ kind: 'behavior', signal: 'days_since_signup',
     * atLeast: 0 }`, which is true of every member who has ever existed. It
     * was a placeholder wearing a real rule's clothes, and the coach's
     * visibility screen duly reported "She has days since signup of at
     * least 0", which explains nothing to anybody.
     *
     * The honest answer is that this card is always eligible and gates
     * itself on having genuine content: `DashboardInviteCards` renders
     * nothing when there is neither a coach assignment nor an unstarted
     * opening conversation. Both of those are things she is owed rather
     * than things she has to earn, so a rule to earn them would be wrong
     * too. Found by reading the coach screen's own explanation back.
     */
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.homeQuickActionCase,
    kind: 'card',
    surface: 'home',
    label: 'Case shortcut',
    whoNeedsThis:
      'A member who has an investigation to look at. Before anything has been found, a shortcut to her case is a shortcut to an empty room.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: 'Something has come up more than once, so I have opened your case where you can follow it.',
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.homeQuickActionMovement,
    kind: 'card',
    surface: 'home',
    label: 'Movement shortcut',
    whoNeedsThis:
      'A member for whom movement is actually a topic: she said so at intake, she has discomfort, or she has started logging sessions.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['pain', 'weight', 'movement', 'performance', 'healthy_aging'] } },
      { kind: 'intake_answer', questionKey: INTAKE.movementFrequency, when: { op: 'equals', values: ['0', '1-2'] } },
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'finding_tier', domain: 'movement_physical_capacity', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
      { kind: 'behavior', signal: 'movement_days', atLeast: 1 },
    ],
    revealSentence: 'You mentioned movement is part of what you are working on, so I have put it within reach.',
    touchedBy: { kind: 'behavior', signal: 'movement_days' },
  },
  {
    key: F.homeAssignedPrograms,
    kind: 'card',
    surface: 'home',
    label: 'Programs your coach assigned',
    whoNeedsThis: 'A member whose coach has actually assigned her something.',
    revealWhen: [{ kind: 'coach_assigned' }],
    revealSentence: 'Your coach has put a program together for you.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.homeActiveExperiments,
    kind: 'card',
    surface: 'home',
    label: 'Active experiments',
    whoNeedsThis: 'A member who has actually started one.',
    revealWhen: [],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_active_experiment' },
  },
  {
    key: F.homeResetPlan,
    kind: 'card',
    surface: 'home',
    label: 'Personal Reset Plan',
    whoNeedsThis: 'A member whose coach has granted her one.',
    revealWhen: [{ kind: 'coach_assigned' }],
    revealSentence: 'Your coach has put a reset plan together for you.',
    touchedBy: { kind: 'signal', signal: 'has_reset_plan' },
  },
  {
    key: F.homeMovementAssessmentCard,
    kind: 'card',
    surface: 'home',
    label: 'Guided posture and movement assessment card',
    whoNeedsThis:
      'A member with a movement or discomfort reason to be photographed and looked at, or one whose coach has asked for it.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'movement_physical_capacity', minTier: 'emerging_pattern' },
    ],
    revealSentence:
      'You mentioned some discomfort, so I have opened the guided movement assessment for you.',
    touchedBy: { kind: 'assessment', keys: ['body-assessment'] },
  },
  {
    key: F.homeQuestionnairesCard,
    kind: 'card',
    surface: 'home',
    label: 'Questionnaires summary card',
    whoNeedsThis:
      'A member with at least one questionnaire actually open to her. A progress bar over a library she cannot enter is furniture.',
    revealWhen: [{ kind: 'behavior', signal: 'assessments_completed', atLeast: 1 }, { kind: 'coach_assigned' }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'assessments_completed' },
  },
  {
    key: F.homeComprehensiveCard,
    kind: 'card',
    surface: 'home',
    label: 'Comprehensive assessment card',
    whoNeedsThis:
      'A member far enough in that a full reassessment is a real next step, or one whose coach has scheduled it.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'behavior', signal: 'checkin_days', atLeast: 21 },
    ],
    revealSentence: 'You have three weeks of days logged, so it is worth doing the full picture again.',
    touchedBy: { kind: 'assessment', keys: ['onboarding-health-history'] },
  },
  {
    key: F.homeNoticingCarousel,
    kind: 'card',
    surface: 'home',
    label: 'What Root is noticing',
    whoNeedsThis:
      'A member with something to notice. Below the data floor there is nothing honest to put in it.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: 'Something has shown up more than once, so I have started keeping notes for you here.',
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.homeTrendsEnergy,
    kind: 'card',
    surface: 'home',
    label: 'Energy trend chart',
    whoNeedsThis:
      'A member with enough logged days for a line to mean anything. Seven is the number this app already tells her is enough.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: 'You have seven days logged, so your energy trend is worth looking at now.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.homeNextSession,
    kind: 'card',
    surface: 'home',
    label: 'Next session row',
    whoNeedsThis:
      'Nobody, today. There is no booking system, so this row has only ever said "nothing scheduled yet, coming soon" to every member forever. Retired rather than left advertising something that does not exist.',
    revealWhen: [],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.homeWearableConnect,
    kind: 'card',
    surface: 'home',
    label: 'Connect a wearable',
    whoNeedsThis:
      'A member whose own recovery or sleep has come up more than once, where a device would genuinely add something, or who already has one connected.',
    revealWhen: [
      { kind: 'behavior', signal: 'wearables_connected', atLeast: 1 },
      { kind: 'finding_tier', domain: 'recovery_energy_regulation', minTier: 'emerging_pattern' },
      { kind: 'finding_tier', domain: 'sleep_circadian_rhythm', minTier: 'emerging_pattern' },
    ],
    revealSentence:
      'Your sleep and recovery keep coming up, and a watch or ring would let me see them overnight. Entirely optional.',
    touchedBy: { kind: 'behavior', signal: 'wearables_connected' },
  },

  // ===================================================================
  // TODAY
  // ===================================================================
  {
    key: F.todayRecommendations,
    kind: 'card',
    surface: 'today',
    label: "Today's recommendations",
    whoNeedsThis: 'A member with a logged day or a connected device behind the lines it prints.',
    revealWhen: [
      { kind: 'behavior', signal: 'checkin_days', atLeast: 1 },
      { kind: 'behavior', signal: 'wearables_connected', atLeast: 1 },
    ],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: F.todayLesson,
    kind: 'card',
    surface: 'today',
    label: "Today's lesson and challenge",
    whoNeedsThis:
      'Everyone past their first check-in. The lesson is the daily coaching content and is not about any one concern.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 1 }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: F.todayNumbers,
    kind: 'card',
    surface: 'today',
    label: "Today's numbers",
    whoNeedsThis: 'A member who has logged today. It is a readout of the check-in she just did.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 1 }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: F.todayTotals,
    kind: 'card',
    surface: 'today',
    label: 'Your totals',
    whoNeedsThis:
      'A member with totals worth showing. Two zeroes side by side on day one is a scoreboard of things she has not done.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 3 }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },
  {
    key: F.todayCapability,
    kind: 'card',
    surface: 'today',
    label: 'What unlocks next',
    whoNeedsThis:
      'A member close enough to the threshold for the count to be encouraging rather than a long way off.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 3 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.todayPastLessons,
    kind: 'card',
    surface: 'today',
    label: 'Past lessons',
    whoNeedsThis: 'A member with a past. It is a history list.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 3 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },

  // ===================================================================
  // TRACKERS
  // ===================================================================
  {
    key: F.trackerWater,
    kind: 'tracker',
    surface: 'today',
    label: 'Water tracker',
    whoNeedsThis:
      'A member who said at intake that water is a problem for her, or whose coach turned it on. This is the working model the rest of this catalog generalizes, and it keeps its own flag (profiles.hydration_focus, migration 163) as the authority. The rule here mirrors that flag rather than replacing it.',
    revealWhen: [
      {
        kind: 'intake_answer',
        questionKey: INTAKE.hydration,
        when: { op: 'equals', values: ['very_little', 'a_few_glasses'] },
      },
    ],
    revealSentence: 'You mentioned water is hard to stay on top of, so I have put a simple tracker on your day.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.trackerMovementLevel,
    kind: 'tracker',
    surface: 'today',
    label: 'Movement level tracker',
    whoNeedsThis:
      'A member for whom movement is a topic. The audit found this shown every day to a member with zero movement days in thirteen, which is a tracker asking her to fail.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['pain', 'weight', 'movement', 'performance', 'healthy_aging', 'energy'] } },
      { kind: 'intake_answer', questionKey: INTAKE.movementFrequency, when: { op: 'equals', values: ['0', '1-2'] } },
      { kind: 'finding_tier', domain: 'movement_physical_capacity', minTier: 'early_indication' },
      { kind: 'behavior', signal: 'movement_days', atLeast: 1 },
    ],
    revealSentence: 'You said moving more is part of this, so logging it is one tap on your day now.',
    touchedBy: { kind: 'behavior', signal: 'movement_days' },
  },
  {
    key: F.trackerHabits,
    kind: 'tracker',
    surface: 'today',
    label: 'Habit list',
    whoNeedsThis: 'A member who actually has habits set up.',
    revealWhen: [],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_habit' },
  },
  {
    key: F.trackerFoodLens,
    kind: 'tracker',
    surface: 'nav',
    label: 'Food Lens',
    whoNeedsThis:
      'A member with a nutrition, digestion or weight reason to look at what she eats, or who has already scanned something.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['digestion', 'weight', 'energy', 'performance'] } },
      { kind: 'intake_answer', questionKey: INTAKE.digestion, when: { op: 'at_most', value: CONCERNING_QUALITY } },
      { kind: 'finding_tier', domain: 'nutrition_metabolic_health', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'digestion_gut_health', minTier: 'early_indication' },
      { kind: 'behavior', signal: 'food_entries', atLeast: 1 },
    ],
    revealSentence: 'Food keeps coming up in what you told me, so I have opened Food Lens for you.',
    touchedBy: { kind: 'behavior', signal: 'food_entries' },
  },

  // ===================================================================
  // PROGRESS
  // ===================================================================
  {
    key: F.progressWellnessStory,
    kind: 'card',
    surface: 'progress',
    label: 'Where you are right now',
    whoNeedsThis: 'A member past the data floor, where a summary is a reading rather than a guess.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressCoachingInsights,
    kind: 'card',
    surface: 'progress',
    label: 'Coaching insights',
    whoNeedsThis: 'A member with something noticed to be insightful about.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.progressWellnessPatterns,
    kind: 'card',
    surface: 'progress',
    label: 'Wellness patterns',
    whoNeedsThis:
      'A member with enough logged days that the word pattern is honest. This is the same threshold the interpretation layer uses before it will say the word.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'supported_by_checkins' }],
    revealSentence: 'Enough of your check-ins line up now that I can show you the patterns in them.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressWellnessIdentity,
    kind: 'card',
    surface: 'progress',
    label: 'Wellness identity',
    whoNeedsThis: 'A member past the data floor.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressRecommendations,
    kind: 'card',
    surface: 'progress',
    label: 'Recommendations',
    whoNeedsThis: 'A member with a finding behind the recommendation.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.progressTrends,
    kind: 'card',
    surface: 'progress',
    label: 'Trends',
    whoNeedsThis:
      'A member with seven logged days. The panel already says as much in its own empty state, so this is that sentence made structural.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: 'You have seven days logged, so your trends are worth reading now.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressConsistency,
    kind: 'card',
    surface: 'progress',
    label: 'Consistency',
    whoNeedsThis: 'A member with enough recorded days for an average to be an average.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 7 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressAssessmentFindings,
    kind: 'card',
    surface: 'progress',
    label: 'From your assessments',
    whoNeedsThis: 'A member with assessment findings.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'early_indication' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.progressComparison,
    kind: 'card',
    surface: 'progress',
    label: 'Baseline against latest',
    whoNeedsThis: 'A member who has completed the intake more than once. There is nothing to compare otherwise.',
    revealWhen: [{ kind: 'behavior', signal: 'assessments_completed', atLeast: 2 }],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['onboarding-health-history'] },
  },
  {
    key: F.progressTimeline,
    kind: 'feature',
    surface: 'progress',
    label: 'Your health timeline',
    whoNeedsThis: 'A member with a timeline. It is a history view.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 3 }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.progressHistory,
    kind: 'card',
    surface: 'progress',
    label: 'Check-in history',
    whoNeedsThis: 'A member with check-ins to list.',
    revealWhen: [{ kind: 'behavior', signal: 'checkin_days', atLeast: 1 }],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'checkin_days' },
  },

  // ===================================================================
  // FEATURE MODULES
  // ===================================================================
  {
    key: F.featureRootMap,
    kind: 'feature',
    surface: 'none',
    label: 'Root Map',
    whoNeedsThis: 'A member with findings to place on it.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'early_indication' }],
    revealSentence: 'You have enough on the board now for your Root Map to be worth opening.',
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.featureCaseView,
    kind: 'feature',
    surface: 'none',
    label: 'Case View',
    whoNeedsThis:
      'A member with something being investigated. Protected: the Case View itself is out of scope for this layer and only its entry point is decided here.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.featureInsights,
    kind: 'feature',
    surface: 'none',
    label: 'Insights',
    whoNeedsThis: 'A member with repeated signals to list.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.featureNoticing,
    kind: 'feature',
    surface: 'none',
    label: "What we're noticing",
    whoNeedsThis: 'A member with findings.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'early_indication' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.featureRecommendations,
    kind: 'feature',
    surface: 'none',
    label: 'Recommendations',
    whoNeedsThis: 'A member with a finding behind the recommendation.',
    revealWhen: [{ kind: 'finding_tier', minTier: 'emerging_pattern' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_registry_finding' },
  },
  {
    key: F.featureMovement,
    kind: 'feature',
    surface: 'none',
    label: 'Movement',
    whoNeedsThis: 'The same member the movement shortcut is for.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['pain', 'weight', 'movement', 'performance', 'healthy_aging'] } },
      { kind: 'intake_answer', questionKey: INTAKE.movementFrequency, when: { op: 'equals', values: ['0', '1-2'] } },
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'finding_tier', domain: 'movement_physical_capacity', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
      { kind: 'behavior', signal: 'movement_days', atLeast: 1 },
    ],
    revealSentence: 'Movement is part of what you came here for, so I have opened it up for you.',
    touchedBy: { kind: 'behavior', signal: 'movement_days' },
  },
  {
    key: F.featureQuestionnaires,
    kind: 'feature',
    surface: 'none',
    label: 'Questionnaires library',
    whoNeedsThis:
      'A member with at least one questionnaire genuinely open to her, so the library is a place to go rather than a wall of locks.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'behavior', signal: 'assessments_completed', atLeast: 1 },
      { kind: 'finding_tier', minTier: 'emerging_pattern' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'assessments_completed' },
  },
  {
    key: F.featureBodyAssessment,
    kind: 'feature',
    surface: 'none',
    label: 'Body assessment screen',
    whoNeedsThis: 'The same member the movement assessment card is for.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['body-assessment'] },
  },
  {
    key: F.featureResetPlan,
    kind: 'feature',
    surface: 'none',
    label: 'Reset plan screen',
    whoNeedsThis: 'A member who has been granted one.',
    revealWhen: [{ kind: 'coach_assigned' }],
    revealSentence: null,
    touchedBy: { kind: 'signal', signal: 'has_reset_plan' },
  },
  {
    key: F.featurePrograms,
    kind: 'feature',
    surface: 'none',
    label: 'Programs',
    whoNeedsThis: 'A member with an assigned program.',
    revealWhen: [{ kind: 'coach_assigned' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
  {
    key: F.featureWearables,
    kind: 'feature',
    surface: 'none',
    label: 'Device connections',
    whoNeedsThis: 'The same member the connect card is for, plus anyone who already has one.',
    revealWhen: [
      { kind: 'behavior', signal: 'wearables_connected', atLeast: 1 },
      { kind: 'finding_tier', domain: 'recovery_energy_regulation', minTier: 'emerging_pattern' },
      { kind: 'finding_tier', domain: 'sleep_circadian_rhythm', minTier: 'emerging_pattern' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'behavior', signal: 'wearables_connected' },
  },
  {
    key: F.featureNotifications,
    kind: 'feature',
    surface: 'none',
    label: 'Notifications',
    whoNeedsThis:
      'Everyone. A coach or a safety review reaching her must never be behind a visibility rule.',
    revealWhen: [{ kind: 'safety' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
    safetyCritical: true,
  },

  // ===================================================================
  // ASSESSMENTS
  // ===================================================================
  {
    key: F.assessmentOnboarding,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Health history intake',
    whoNeedsThis: 'Everyone. It is the one mandatory instrument and everything else routes from it.',
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['onboarding-health-history'] },
  },
  {
    key: F.assessmentCoreValues,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Core Values Snapshot',
    whoNeedsThis:
      'Everyone. It is the first conversation of the opening arc and needs no reason beyond being new here.',
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['core-values-snapshot'] },
  },
  {
    key: F.assessmentLifeSignal,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Life Signal Check',
    whoNeedsThis:
      'A member who has finished the Core Values Snapshot. This is the live prerequisite chain, migrated into this layer as a structured rule instead of a free-text note nothing could run.',
    revealWhen: [{ kind: 'completed_assessment', keys: ['core-values-snapshot'] }],
    revealSentence: 'You finished the first conversation, so the next one is open.',
    touchedBy: { kind: 'assessment', keys: ['life-signal-check'] },
  },
  {
    key: F.assessmentReadinessPulse,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Readiness Pulse',
    whoNeedsThis: 'A member who has finished the Life Signal Check. The same live chain.',
    revealWhen: [{ kind: 'completed_assessment', keys: ['life-signal-check'] }],
    revealSentence: 'You finished the second conversation, so the last one is open.',
    touchedBy: { kind: 'assessment', keys: ['readiness-pulse'] },
  },
  {
    key: F.assessmentNutritionLifestyle,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Nutrition and Lifestyle Questionnaire',
    whoNeedsThis:
      'A member whose eating or digestion has come up, at intake or in her findings. This is the trigger the retired unlock engine already declared for it, now actually running.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['digestion', 'weight', 'energy'] } },
      { kind: 'intake_answer', questionKey: INTAKE.digestion, when: { op: 'at_most', value: CONCERNING_QUALITY } },
      { kind: 'finding_tier', domain: 'nutrition_metabolic_health', minTier: 'emerging_pattern' },
      { kind: 'finding_tier', domain: 'digestion_gut_health', minTier: 'emerging_pattern' },
    ],
    revealSentence:
      'Digestion keeps coming up in your check-ins, so I have opened a longer nutrition questionnaire for you.',
    touchedBy: { kind: 'assessment', keys: ['chek-hlc1-nutrition-lifestyle'] },
  },
  {
    key: F.assessmentFourDoctors,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Four Doctors',
    whoNeedsThis:
      'A member with something showing up in more than one area, which is exactly what a breadth screener is for.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'finding_tier', minTier: 'emerging_pattern' },
    ],
    revealSentence: 'A few different things have come up, so a wider look across them is worth doing.',
    touchedBy: { kind: 'assessment', keys: ['four-doctors'] },
  },
  {
    key: F.assessmentPrimalPattern,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Primal Pattern Diet Type',
    whoNeedsThis:
      'A member working on what she eats. It is a classification, not a problem finder, so it needs a nutrition reason rather than a severity.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['digestion', 'weight', 'energy', 'performance'] } },
      { kind: 'finding_tier', domain: 'nutrition_metabolic_health', minTier: 'emerging_pattern' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['primal-pattern-diet-type'] },
  },
  {
    key: F.assessmentBody,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Body Assessment',
    whoNeedsThis: 'The same member the movement assessment card is for.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['body-assessment'] },
  },
  {
    key: F.assessmentShortHaq,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Short health assessment',
    whoNeedsThis: 'A member her coach has asked to take it, or one with discomfort affecting daily function.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'emerging_pattern' },
    ],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['short-haq'] },
  },
  {
    key: F.assessmentWbsa,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Whole-Body Systems Assessment',
    whoNeedsThis:
      'A member with a broad, repeated picture. It is the widest instrument in the library and is wasted on a member with one early indication.',
    revealWhen: [
      { kind: 'coach_assigned' },
      { kind: 'finding_tier', minTier: 'supported_by_checkins' },
    ],
    revealSentence: 'Enough has built up across your check-ins that the full systems questionnaire is worth doing.',
    touchedBy: { kind: 'assessment', keys: ['wbsa'] },
  },
  {
    key: F.assessmentFinding1Love,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Finding 1 Love',
    whoNeedsThis:
      'Coach assignment only. It is not built yet, so nothing else can honestly reveal it.',
    revealWhen: [{ kind: 'coach_assigned' }],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['finding-1-love'] },
  },
  {
    key: F.assessmentReadinessToChange,
    kind: 'assessment',
    surface: 'questionnaires',
    label: 'Readiness to Change',
    whoNeedsThis:
      'Nobody yet. It is a catalog row with no questions and no route, so there is nothing to reveal.',
    revealWhen: [],
    revealSentence: null,
    touchedBy: { kind: 'assessment', keys: ['readiness-to-change'] },
  },

  // ===================================================================
  // FOLLOW-UP QUESTION SETS INSIDE THE DAILY CHECK-IN
  // ===================================================================
  {
    key: F.questionsSleep,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Sleep follow-up questions',
    whoNeedsThis: 'A member whose sleep she herself said is a problem, or whose sleep has been found to be one.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['sleep', 'energy', 'stress'] } },
      { kind: 'intake_answer', questionKey: INTAKE.sleepQuality, when: { op: 'at_most', value: CONCERNING_QUALITY } },
      { kind: 'finding_tier', domain: 'sleep_circadian_rhythm', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'recovery_energy_regulation', minTier: 'early_indication' },
    ],
    revealSentence: 'You mentioned your sleep has been rough, so I have opened a short sleep check for you.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsStress,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Stress follow-up questions',
    whoNeedsThis: 'A member who reported real stress, or whose stress has been found.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['stress', 'sleep', 'energy'] } },
      { kind: 'intake_answer', questionKey: INTAKE.stressLevel, when: { op: 'at_least', value: CONCERNING_STRESS } },
      { kind: 'finding_tier', domain: 'stress_nervous_system', minTier: 'early_indication' },
      { kind: 'finding_tier', domain: 'emotional_resilience_mood', minTier: 'early_indication' },
    ],
    revealSentence: 'Stress came up in what you told me, so I will ask about it now and then.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsDigestion,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Digestion follow-up questions',
    whoNeedsThis: 'A member who reported digestion trouble, or whose digestion has been found.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['digestion', 'weight'] } },
      { kind: 'intake_answer', questionKey: INTAKE.digestion, when: { op: 'at_most', value: CONCERNING_QUALITY } },
      { kind: 'finding_tier', domain: 'digestion_gut_health', minTier: 'early_indication' },
    ],
    revealSentence: 'You said digestion has been off, so I will check in on it as we go.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsMovement,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Movement follow-up questions',
    whoNeedsThis: 'A member for whom movement is a topic.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['pain', 'weight', 'movement', 'performance', 'healthy_aging'] } },
      { kind: 'intake_answer', questionKey: INTAKE.movementFrequency, when: { op: 'equals', values: ['0', '1-2'] } },
      { kind: 'finding_tier', domain: 'movement_physical_capacity', minTier: 'early_indication' },
    ],
    revealSentence: 'Movement is part of this for you, so I will ask about it now and then.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsMechanics,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Posture and discomfort follow-up questions',
    whoNeedsThis: 'A member with discomfort somewhere.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.painAreas, when: { op: 'includes', values: [...PAIN_AREAS] } },
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['pain'] } },
      { kind: 'finding_tier', domain: 'pain_structural_integrity', minTier: 'early_indication' },
    ],
    revealSentence: 'You told me where it hurts, so I will keep an eye on it with you.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsFuel,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Food and fuel follow-up questions',
    whoNeedsThis: 'A member with a nutrition, energy or weight reason.',
    revealWhen: [
      { kind: 'intake_answer', questionKey: INTAKE.primaryConcern, when: { op: 'equals', values: ['digestion', 'weight', 'energy', 'performance'] } },
      { kind: 'intake_answer', questionKey: INTAKE.energyLevel, when: { op: 'at_most', value: CONCERNING_QUALITY } },
      { kind: 'finding_tier', domain: 'nutrition_metabolic_health', minTier: 'early_indication' },
      { kind: 'behavior', signal: 'food_entries', atLeast: 1 },
    ],
    revealSentence: 'What you eat is part of this, so I will ask about it from time to time.',
    touchedBy: { kind: 'none' },
  },
  {
    key: F.questionsContext,
    kind: 'question_set',
    surface: 'checkin',
    label: 'Everything else follow-up questions',
    whoNeedsThis:
      'Everyone. This is the "what else was going on" set. It belongs to no concern, and hiding it would take away the one place she can tell me something the rules do not know about.',
    revealWhen: [{ kind: 'always' }],
    revealSentence: null,
    touchedBy: { kind: 'none' },
  },
];

const BY_KEY = new Map(VISIBILITY_CATALOG.map((f) => [f.key, f] as const));

export function getFeatureDefinition(key: FeatureKey): FeatureDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function listFeatureKeys(): FeatureKey[] {
  return VISIBILITY_CATALOG.map((f) => f.key);
}

/** Every feature that can never be hidden, whatever anything else says. */
export function safetyCriticalKeys(): Set<FeatureKey> {
  return new Set(VISIBILITY_CATALOG.filter((f) => f.safetyCritical).map((f) => f.key));
}
