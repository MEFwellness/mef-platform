/**
 * The Health & Lifestyle Intake itself: eleven chapters, and every
 * question inside them.
 *
 * THE VOICE. A skilled coach having a thoughtful conversation, not a
 * doctor's clipboard and not a wellness quiz. Every prompt below is
 * written the way a person would ask it out loud: "Have you had any recent
 * lab work or health testing?", never "Laboratory procedures performed".
 * No clinical wording, no em dashes, and no sentence anywhere that
 * describes her, ranks her answers or draws a conclusion from them. This
 * instrument produces no score and no reading, so there is nothing here
 * for a sentence like that to be built out of.
 *
 * WHAT IS NOT ASKED HERE, AND WHY. This is one of four instruments and it
 * deliberately stops where the next one starts. It does not ask the MEF
 * Body Systems Survey's system questions, it does not ask the MEF
 * Whole-Body Signal Assessment's ninety six, and section six is
 * deliberately shorter than the Stress & Load Deep-Dive: two questions,
 * enough for a coach to see the load and decide whether the deep dive is
 * warranted, and never enough to be mistaken for it.
 *
 * PROGRESSIVE DISCLOSURE IS THE DEFAULT, NOT A FEATURE OF ONE SECTION.
 * Every list a member might have nothing to put in opens behind a single
 * Yes or No. Nobody is ever shown six empty rows before they have said
 * there is anything to write in one.
 *
 * NEVER UNDERWEIGHT, OVERWEIGHT OR JUST RIGHT. Section seven asks what
 * changed and whether the change was intended, and says nothing at all
 * about what a body should weigh.
 *
 * A FIELD ID IS PERMANENT. See the header of ./types.ts.
 */

import type { IntakeOption, IntakeSection } from './types';

/** Answered on a lot of screens, so the words are written once. */
const PREFER_NOT: IntakeOption = { value: 'prefer_not', label: 'Prefer not to answer' };
const NOT_SURE: IntakeOption = { value: 'not_sure', label: 'Not sure' };

/** The six parts of a day, offered twice in section nine and identical both times. */
const DAY_PERIODS: IntakeOption[] = [
  { value: 'early_morning', label: 'Early morning' },
  { value: 'morning', label: 'Morning' },
  { value: 'late_morning', label: 'Late morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
  { value: 'late_evening', label: 'Late evening' },
];

/** How long something has been going on. Used by three different follow-ups. */
const DURATION_OPTIONS: IntakeOption[] = [
  { value: 'recently', label: 'Recently' },
  { value: 'several_weeks', label: 'Several weeks' },
  { value: 'several_months', label: 'Several months' },
  { value: 'longer', label: 'Longer' },
  NOT_SURE,
];

/** How often something happens. */
const FREQUENCY_OPTIONS: IntakeOption[] = [
  { value: 'occasionally', label: 'Occasionally' },
  { value: 'often', label: 'Often' },
  { value: 'most_days', label: 'Most days' },
];

const YES_NO_NOT_SURE: IntakeOption[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  NOT_SURE,
];

/**
 * The seventeen things section eleven asks about, in the four groups it
 * asks them in.
 *
 * THE GROUPS ARE THE SCREEN, NOT A HEADING OVER A WALL. Twenty five
 * checkboxes on one screen is the exact thing this instrument exists not
 * to be, so the list is cut into four spacious screens of four or five,
 * each with its own plain framing line, all writing into one answer.
 */
export const SYMPTOM_OPTIONS: IntakeOption[] = [
  { value: 'fatigue', label: 'Fatigue' },
  { value: 'shortness_of_breath', label: 'Shortness of breath' },
  { value: 'sleep_difficulty', label: 'Sleep difficulty' },
  { value: 'headaches', label: 'Headaches' },
  { value: 'dizziness', label: 'Dizziness' },
  { value: 'persistent_pain', label: 'Persistent pain' },
  { value: 'constipation', label: 'Constipation' },
  { value: 'diarrhea', label: 'Diarrhea' },
  { value: 'nausea', label: 'Nausea' },
  { value: 'vomiting', label: 'Vomiting' },
  { value: 'appetite_changes', label: 'Appetite changes' },
  { value: 'urinary_changes', label: 'Urinary changes' },
  { value: 'skin_changes', label: 'Skin changes' },
  { value: 'bleeding', label: 'Bleeding' },
  { value: 'fever', label: 'Fever' },
  { value: 'mood_changes', label: 'Mood changes' },
  { value: 'symptom_other', label: 'Something else' },
];

function symptomOption(value: string): IntakeOption {
  const found = SYMPTOM_OPTIONS.find((option) => option.value === value);
  if (!found) throw new Error(`Unknown symptom option: ${value}`);
  return found;
}

/**
 * WHICH SYMPTOMS ARE ALSO ASKED "IS IT GETTING WORSE".
 *
 * Not all seventeen, because "is your sleep difficulty getting worse" and
 * "is your bleeding getting worse" are not the same question to a coach
 * reading the answer. The nine below are the ones where a direction of
 * travel changes what a coach should do next, and five of them are inputs
 * to a safety rule (./safety.ts), where "getting worse" is part of the
 * trigger rather than a nicety.
 *
 * The eight that are NOT asked it are deliberate and named by their
 * absence: fatigue, sleep difficulty, constipation, diarrhea, nausea,
 * vomiting, appetite changes and something else. Widening this set is one
 * line, and tests/health-intake-questions.test.ts prints the current
 * membership so a change to it is visible in a diff.
 */
export const WORSENING_SYMPTOMS: readonly string[] = [
  'shortness_of_breath',
  'headaches',
  'dizziness',
  'persistent_pain',
  'urinary_changes',
  'skin_changes',
  'bleeding',
  'fever',
  'mood_changes',
];

/** The movement areas, offered once and then followed up per selection. */
const MOVEMENT_OPTIONS: IntakeOption[] = [
  { value: 'walking', label: 'Walking' },
  { value: 'stairs', label: 'Stairs' },
  { value: 'sitting', label: 'Sitting' },
  { value: 'standing', label: 'Standing' },
  { value: 'bending', label: 'Bending' },
  { value: 'lifting', label: 'Lifting' },
  { value: 'reaching', label: 'Reaching' },
  { value: 'turning_head', label: 'Turning your head' },
  { value: 'balance', label: 'Balance' },
  { value: 'exercise', label: 'Exercise' },
  { value: 'movement_other', label: 'Something else' },
  { value: 'movement_none', label: 'No meaningful change', exclusive: true },
];

const SENSE_OPTIONS: IntakeOption[] = [
  { value: 'vision', label: 'Vision' },
  { value: 'hearing', label: 'Hearing' },
  { value: 'taste', label: 'Taste' },
  { value: 'smell', label: 'Smell' },
  { value: 'temperature', label: 'Hot or cold sensitivity' },
  { value: 'sense_other', label: 'Something else' },
];

export const INTAKE_SECTIONS: IntakeSection[] = [
  // -------------------------------------------------------------------
  // 1. About you.
  // -------------------------------------------------------------------
  {
    key: 'about_you',
    number: 1,
    title: 'About you',
    framingLine: 'A few basics, so your coach knows who they are working with.',
    screens: [
      {
        id: 'about_you_name',
        sectionKey: 'about_you',
        title: 'Let us start with your name.',
        note: 'We have filled in what we already have. Change it if it is not right.',
        fields: [
          { kind: 'short_text', id: 'full_name', label: 'Your name', prefillFrom: 'display_name' },
          {
            kind: 'date',
            id: 'date_of_birth',
            label: 'Date of birth',
            help: 'Your age helps your coach set sensible expectations. Nothing else uses it.',
          },
        ],
      },
      {
        id: 'about_you_work',
        sectionKey: 'about_you',
        title: 'What does a normal day look like for you?',
        fields: [
          {
            kind: 'short_text',
            id: 'occupation',
            label: 'What you do',
            optional: true,
            placeholder: 'Teacher, nurse, at home with kids',
          },
          { kind: 'height', id: 'height', label: 'Height', optional: true },
        ],
      },
      {
        id: 'about_you_sex',
        sectionKey: 'about_you',
        title: 'A couple of details that change what we ask you later.',
        fields: [
          {
            kind: 'single_select',
            id: 'sex',
            label: 'Sex',
            optional: true,
            options: [
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
              PREFER_NOT,
            ],
          },
        ],
      },
      {
        id: 'about_you_life',
        sectionKey: 'about_you',
        title: 'And who else is in the picture?',
        note: 'Both of these are optional. They help your coach understand the demands on your time.',
        fields: [
          {
            kind: 'single_select',
            id: 'relationship_status',
            label: 'Relationship status',
            optional: true,
            options: [
              { value: 'single', label: 'Single' },
              { value: 'partnered', label: 'In a relationship' },
              { value: 'married', label: 'Married' },
              { value: 'separated', label: 'Separated or divorced' },
              { value: 'widowed', label: 'Widowed' },
              PREFER_NOT,
            ],
          },
          {
            kind: 'single_select',
            id: 'children',
            label: 'Children at home',
            optional: true,
            options: [
              { value: 'none', label: 'No children at home' },
              { value: 'young', label: 'Yes, young children' },
              { value: 'older', label: 'Yes, older children' },
              { value: 'grown', label: 'Grown and living elsewhere' },
              PREFER_NOT,
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 2. What brings you here.
  // -------------------------------------------------------------------
  {
    key: 'what_brings_you',
    number: 2,
    title: 'What brings you here',
    framingLine: 'The reason you are doing this at all.',
    screens: [
      {
        id: 'brings_you_concerns',
        sectionKey: 'what_brings_you',
        title: 'What would you most like help with right now?',
        note: 'Choose as many as are true.',
        fields: [
          {
            kind: 'multi_select',
            id: 'primary_concerns',
            label: 'What you would like help with',
            options: [
              { value: 'energy', label: 'Energy' },
              { value: 'stress', label: 'Stress' },
              { value: 'sleep', label: 'Sleep' },
              { value: 'digestion', label: 'Digestion' },
              { value: 'pain', label: 'Pain or discomfort' },
              { value: 'strength_movement', label: 'Strength and movement' },
              { value: 'nutrition', label: 'Nutrition' },
              { value: 'hormonal', label: 'Hormonal or life stage changes' },
              { value: 'general', label: 'General wellness' },
              {
                value: 'concern_other',
                label: 'Something else',
                revealsTextFieldId: 'primary_concerns_other',
              },
            ],
          },
          {
            kind: 'short_text',
            id: 'primary_concerns_other',
            label: 'What would you call it?',
            optional: true,
          },
        ],
      },
      {
        id: 'brings_you_onset',
        sectionKey: 'what_brings_you',
        title: 'When did you first begin noticing this?',
        fields: [
          {
            kind: 'single_select',
            id: 'concern_onset',
            label: 'When you first noticed it',
            options: [
              { value: 'recently', label: 'Recently' },
              { value: 'one_to_three', label: '1 to 3 months' },
              { value: 'three_to_six', label: '3 to 6 months' },
              { value: 'six_to_twelve', label: '6 to 12 months' },
              { value: 'over_a_year', label: 'More than a year' },
              NOT_SURE,
            ],
          },
        ],
      },
      {
        id: 'brings_you_context',
        sectionKey: 'what_brings_you',
        title: 'Anything you would like your coach to know about that?',
        note: 'Optional. A sentence is plenty.',
        fields: [
          {
            kind: 'long_text',
            id: 'concern_context',
            label: 'In your own words',
            optional: true,
            placeholder: 'It started after I changed jobs',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 3. Health background.
  // -------------------------------------------------------------------
  {
    key: 'health_background',
    number: 3,
    title: 'Health background',
    framingLine: 'What is already being looked after, and by whom.',
    screens: [
      {
        id: 'background_physical',
        sectionKey: 'health_background',
        title: 'When did you last have a physical exam?',
        fields: [
          {
            kind: 'single_select',
            id: 'last_physical',
            label: 'Last physical exam',
            options: [
              { value: 'within_year', label: 'Within the last year' },
              { value: 'one_to_two', label: '1 to 2 years ago' },
              { value: 'over_two', label: 'More than 2 years ago' },
              { value: 'never', label: 'I have not had one' },
              NOT_SURE,
            ],
          },
        ],
      },
      {
        id: 'background_practitioners_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'practitioners_gate',
            label: 'Are you currently working with any healthcare practitioners?',
          },
        ],
      },
      {
        id: 'background_practitioners',
        sectionKey: 'health_background',
        title: 'Who are you working with?',
        showWhen: { fieldId: 'practitioners_gate', equals: 'yes' },
        openedBy: 'practitioners_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'practitioners',
            label: 'Practitioners',
            addLabel: 'Add a practitioner',
            addAnotherLabel: 'Add another practitioner',
            noun: { one: 'practitioner', many: 'practitioners' },
            summaryFieldIds: ['practitioner_type', 'practitioner_for'],
            entryFields: [
              {
                kind: 'text',
                id: 'practitioner_type',
                label: 'Who they are',
                placeholder: 'Doctor, physical therapist, chiropractor',
              },
              {
                kind: 'text',
                id: 'practitioner_for',
                label: 'What they help with',
                optional: true,
              },
            ],
          },
        ],
      },
      {
        id: 'background_labs_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'labs_gate',
            label: 'Have you had any recent lab work or health testing?',
          },
        ],
      },
      {
        id: 'background_labs',
        sectionKey: 'health_background',
        title: 'Tell us a little about that testing.',
        showWhen: { fieldId: 'labs_gate', equals: 'yes' },
        openedBy: 'labs_gate',
        fields: [
          {
            kind: 'single_select',
            id: 'labs_when',
            label: 'When was it?',
            options: [
              { value: 'within_three', label: 'Within the last 3 months' },
              { value: 'three_to_twelve', label: '3 to 12 months ago' },
              { value: 'over_a_year', label: 'More than a year ago' },
              NOT_SURE,
            ],
          },
          {
            kind: 'long_text',
            id: 'labs_what',
            label: 'What was looked at, if you remember?',
            optional: true,
          },
        ],
      },
      {
        id: 'background_conditions_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'conditions_gate',
            label: 'Are you currently being treated for any health conditions?',
          },
        ],
      },
      {
        id: 'background_conditions',
        sectionKey: 'health_background',
        title: 'What is being treated?',
        showWhen: { fieldId: 'conditions_gate', equals: 'yes' },
        openedBy: 'conditions_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'conditions',
            label: 'Conditions',
            addLabel: 'Add a condition',
            addAnotherLabel: 'Add another condition',
            noun: { one: 'condition', many: 'conditions' },
            summaryFieldIds: ['condition_name', 'condition_since'],
            entryFields: [
              { kind: 'text', id: 'condition_name', label: 'What it is' },
              {
                kind: 'text',
                id: 'condition_since',
                label: 'How long you have had it',
                optional: true,
                placeholder: 'About 3 years',
              },
            ],
          },
        ],
      },
      {
        id: 'background_medications_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'medications_gate',
            label: 'Are you currently taking any prescription medications?',
          },
        ],
      },
      {
        id: 'background_medications',
        sectionKey: 'health_background',
        title: 'What are you taking?',
        note: 'Your coach will not change anything you take. This is so nothing they suggest sits badly beside it.',
        showWhen: { fieldId: 'medications_gate', equals: 'yes' },
        openedBy: 'medications_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'medications',
            label: 'Medications',
            addLabel: 'Add a medication',
            addAnotherLabel: 'Add another medication',
            noun: { one: 'medication', many: 'medications' },
            summaryFieldIds: ['medication_name', 'medication_reason'],
            entryFields: [
              { kind: 'text', id: 'medication_name', label: 'Name' },
              { kind: 'text', id: 'medication_reason', label: 'What it is for', optional: true },
              { kind: 'text', id: 'medication_dose', label: 'Dose', optional: true },
            ],
          },
        ],
      },
      {
        id: 'background_otc_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'otc_gate',
            label: 'Do you regularly take anything over the counter?',
          },
        ],
      },
      {
        id: 'background_otc',
        sectionKey: 'health_background',
        title: 'What do you reach for?',
        showWhen: { fieldId: 'otc_gate', equals: 'yes' },
        openedBy: 'otc_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'otc',
            label: 'Over the counter',
            addLabel: 'Add one',
            addAnotherLabel: 'Add another',
            noun: { one: 'over the counter item', many: 'over the counter items' },
            summaryFieldIds: ['otc_name', 'otc_reason'],
            entryFields: [
              { kind: 'text', id: 'otc_name', label: 'What it is' },
              { kind: 'text', id: 'otc_reason', label: 'What you take it for', optional: true },
            ],
          },
        ],
      },
      {
        id: 'background_supplements_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'supplements_gate',
            label: 'Are you taking any supplements?',
          },
        ],
      },
      {
        id: 'background_supplements',
        sectionKey: 'health_background',
        title: 'Which ones?',
        showWhen: { fieldId: 'supplements_gate', equals: 'yes' },
        openedBy: 'supplements_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'supplements',
            label: 'Supplements',
            addLabel: 'Add a supplement',
            addAnotherLabel: 'Add another supplement',
            noun: { one: 'supplement', many: 'supplements' },
            summaryFieldIds: ['supplement_name', 'supplement_reason'],
            entryFields: [
              { kind: 'text', id: 'supplement_name', label: 'Name' },
              { kind: 'text', id: 'supplement_reason', label: 'What it is for', optional: true },
            ],
          },
        ],
      },
      {
        id: 'background_allergies_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'allergies_gate',
            label: 'Do you have any allergies or sensitivities?',
          },
        ],
      },
      {
        id: 'background_allergies',
        sectionKey: 'health_background',
        title: 'What should your coach know about?',
        showWhen: { fieldId: 'allergies_gate', equals: 'yes' },
        openedBy: 'allergies_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'allergies',
            label: 'Allergies and sensitivities',
            addLabel: 'Add one',
            addAnotherLabel: 'Add another',
            noun: { one: 'allergy or sensitivity', many: 'allergies and sensitivities' },
            summaryFieldIds: ['allergy_name', 'allergy_reaction'],
            entryFields: [
              { kind: 'text', id: 'allergy_name', label: 'What it is' },
              { kind: 'text', id: 'allergy_reaction', label: 'What happens', optional: true },
            ],
          },
        ],
      },
      {
        id: 'background_illness_gate',
        sectionKey: 'health_background',
        fields: [
          {
            kind: 'gate',
            id: 'recent_illness_gate',
            label: 'Have you been unwell in the last few months?',
          },
        ],
      },
      {
        id: 'background_illness',
        sectionKey: 'health_background',
        title: 'What happened?',
        showWhen: { fieldId: 'recent_illness_gate', equals: 'yes' },
        openedBy: 'recent_illness_gate',
        fields: [
          {
            kind: 'long_text',
            id: 'recent_illness',
            label: 'In your own words',
            placeholder: 'A chest infection in March that took a while to clear',
          },
        ],
      },
      {
        id: 'background_pregnancy',
        sectionKey: 'health_background',
        title: 'One more, because it changes what your coach would suggest.',
        showWhen: { fieldId: 'sex', equals: 'female' },
        fields: [
          {
            kind: 'single_select',
            id: 'pregnancy_status',
            label: 'Are you pregnant or nursing right now?',
            options: [
              { value: 'neither', label: 'Neither' },
              { value: 'pregnant', label: 'Pregnant' },
              { value: 'nursing', label: 'Nursing' },
              PREFER_NOT,
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 4. Surgeries, injuries and hospital stays.
  // -------------------------------------------------------------------
  {
    key: 'history',
    number: 4,
    title: 'Surgeries, injuries and hospital stays',
    framingLine: 'Things your body has already been through.',
    transitionLine: 'Thank you. Now a little of your history.',
    screens: [
      {
        id: 'history_gate',
        sectionKey: 'history',
        fields: [
          {
            kind: 'gate',
            id: 'history_gate',
            label: 'Have you had any significant surgeries, injuries, or hospital stays?',
          },
        ],
      },
      {
        id: 'history_events',
        sectionKey: 'history',
        title: 'Tell us about them, one at a time.',
        note: 'An approximate year is fine.',
        showWhen: { fieldId: 'history_gate', equals: 'yes' },
        openedBy: 'history_gate',
        fields: [
          {
            kind: 'entry_list',
            id: 'history_events',
            label: 'Events',
            addLabel: 'Add an event',
            addAnotherLabel: 'Add another event',
            noun: { one: 'event', many: 'events' },
            summaryFieldIds: ['event_year', 'event_what', 'event_status'],
            entryFields: [
              { kind: 'year', id: 'event_year', label: 'Year' },
              {
                kind: 'select',
                id: 'event_type',
                label: 'What kind',
                options: [
                  { value: 'surgery', label: 'Surgery' },
                  { value: 'injury', label: 'Injury' },
                  { value: 'hospitalization', label: 'Hospital stay' },
                  { value: 'event_other', label: 'Something else' },
                ],
              },
              {
                kind: 'text',
                id: 'event_what',
                label: 'What happened',
                placeholder: 'Right knee surgery',
              },
              {
                kind: 'text',
                id: 'event_status',
                label: 'Where it stands now',
                optional: true,
                placeholder: 'Recovered, occasional discomfort',
              },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 5. What you have already tried.
  // -------------------------------------------------------------------
  {
    key: 'already_tried',
    number: 5,
    title: 'What you have already tried',
    framingLine: 'So your coach does not hand you back something that did not work.',
    transitionLine: 'Thank you. Next, let us look at what you have already tried.',
    screens: [
      {
        id: 'tried_list',
        sectionKey: 'already_tried',
        title: 'What have you already tried to help with what you are experiencing?',
        note: 'Choose as many as are true.',
        fields: [
          {
            kind: 'multi_select',
            id: 'tried',
            label: 'What you have tried',
            options: [
              { value: 'diet', label: 'Diet changes' },
              { value: 'exercise', label: 'Exercise or training' },
              { value: 'physical_therapy', label: 'Physical therapy' },
              { value: 'chiropractic', label: 'Chiropractic' },
              { value: 'acupuncture', label: 'Acupuncture' },
              { value: 'medication', label: 'Medication' },
              { value: 'supplements', label: 'Supplements' },
              { value: 'fasting', label: 'Fasting' },
              { value: 'massage', label: 'Massage or bodywork' },
              { value: 'stress_management', label: 'Stress management' },
              { value: 'sleep_changes', label: 'Sleep changes' },
              {
                value: 'tried_other',
                label: 'Something else',
                revealsTextFieldId: 'tried_other_text',
              },
              { value: 'tried_nothing', label: 'Nothing yet', exclusive: true },
            ],
          },
          {
            kind: 'short_text',
            id: 'tried_other_text',
            label: 'What was it?',
            optional: true,
          },
        ],
      },
      {
        id: 'tried_outcome',
        sectionKey: 'already_tried',
        title: 'How did those go?',
        note: 'Both optional. A few words are plenty.',
        showWhen: { fieldId: 'tried', includesAny: [] },
        fields: [
          {
            kind: 'long_text',
            id: 'tried_helped',
            label: 'What seemed to help?',
            optional: true,
          },
          {
            kind: 'long_text',
            id: 'tried_not_helped',
            label: 'What did not seem to help?',
            optional: true,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 6. Stress and life load.
  // -------------------------------------------------------------------
  {
    key: 'stress',
    number: 6,
    title: 'Stress and life load',
    framingLine: 'Two questions, not a deep dive. Just enough to see the weight you are carrying.',
    screens: [
      {
        id: 'stress_level',
        sectionKey: 'stress',
        title: 'How would you describe your current stress load?',
        fields: [
          {
            kind: 'scale_ten',
            id: 'stress_level',
            label: 'Current stress load',
            lowLabel: 'Light',
            highLabel: 'Heavy',
          },
        ],
      },
      {
        id: 'stress_sources',
        sectionKey: 'stress',
        title: 'What is contributing most right now?',
        note: 'Choose as many as are true.',
        fields: [
          {
            kind: 'multi_select',
            id: 'stress_sources',
            label: 'What is contributing',
            // Optional, because a member whose load is a two out of ten may
            // genuinely have nothing to name, and a required field with no
            // "nothing" option is a screen asking her to invent one.
            optional: true,
            options: [
              { value: 'work', label: 'Work' },
              { value: 'family', label: 'Family' },
              { value: 'relationships', label: 'Relationships' },
              { value: 'finances', label: 'Finances' },
              { value: 'health', label: 'Health' },
              { value: 'caregiving', label: 'Caregiving' },
              { value: 'sleep', label: 'Sleep' },
              { value: 'life_change', label: 'A major life change' },
              {
                value: 'stress_other',
                label: 'Something else',
                revealsTextFieldId: 'stress_sources_other',
              },
            ],
          },
          {
            kind: 'short_text',
            id: 'stress_sources_other',
            label: 'What is it?',
            optional: true,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 7. Body and weight changes.
  // -------------------------------------------------------------------
  {
    key: 'body_weight',
    number: 7,
    title: 'Changes in your body',
    framingLine: 'Only what has changed, and whether you meant it to.',
    transitionLine: 'Now let us look at how your body and daily rhythm have been feeling.',
    screens: [
      {
        id: 'weight_change',
        sectionKey: 'body_weight',
        title: 'Have you noticed a meaningful change in your weight recently?',
        fields: [
          {
            kind: 'single_select',
            id: 'weight_change',
            label: 'Change in weight',
            options: [
              { value: 'none', label: 'No meaningful change' },
              { value: 'lost', label: 'Lost weight' },
              { value: 'gained', label: 'Gained weight' },
              { value: 'fluctuating', label: 'It has been going up and down' },
              PREFER_NOT,
            ],
          },
        ],
      },
      {
        id: 'weight_intentional',
        sectionKey: 'body_weight',
        title: 'Was this change intentional?',
        showWhen: { fieldId: 'weight_change', oneOf: ['lost', 'gained', 'fluctuating'] },
        openedBy: 'weight_change',
        fields: [
          {
            kind: 'single_select',
            id: 'weight_intentional',
            label: 'Whether it was intentional',
            options: [
              { value: 'yes', label: 'Yes' },
              { value: 'partly', label: 'Partly' },
              { value: 'no', label: 'No' },
              NOT_SURE,
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 8. Movement and physical function.
  // -------------------------------------------------------------------
  {
    key: 'movement',
    number: 8,
    title: 'Moving through your day',
    framingLine: 'Not how fit you are. Just what has become harder than it was.',
    screens: [
      {
        id: 'movement_areas',
        sectionKey: 'movement',
        title: 'Has anything recently changed in your ability to move comfortably?',
        note: 'Choose as many as are true.',
        fields: [
          {
            kind: 'multi_select',
            id: 'movement_areas',
            label: 'Where moving has changed',
            options: MOVEMENT_OPTIONS,
          },
        ],
      },
      {
        id: 'movement_impact',
        sectionKey: 'movement',
        title: 'How much is each one affecting you?',
        showWhen: { fieldId: 'movement_areas', includesAny: [] },
        openedBy: 'movement_areas',
        fields: [
          {
            kind: 'per_item',
            id: 'movement_impact',
            sourceFieldId: 'movement_areas',
            label: 'How much is this affecting you?',
            skipValues: ['movement_none'],
            noun: { one: 'answer about moving', many: 'answers about moving' },
            options: [
              { value: 'a_little', label: 'A little' },
              { value: 'moderately', label: 'Moderately' },
              { value: 'a_lot', label: 'A lot' },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 9. Sleep and daily rhythm.
  // -------------------------------------------------------------------
  {
    key: 'sleep_rhythm',
    number: 9,
    title: 'Sleep and daily rhythm',
    framingLine: 'When your day works, and when it does not.',
    screens: [
      {
        id: 'sleep_waking',
        sectionKey: 'sleep_rhythm',
        title: 'Do you tend to wake at roughly the same time during the night?',
        fields: [
          {
            kind: 'single_select',
            id: 'night_waking',
            label: 'Waking at the same time',
            options: YES_NO_NOT_SURE,
          },
        ],
      },
      {
        id: 'sleep_waking_time',
        sectionKey: 'sleep_rhythm',
        title: 'What time do you usually notice it?',
        note: 'Roughly is fine.',
        showWhen: { fieldId: 'night_waking', equals: 'yes' },
        openedBy: 'night_waking',
        fields: [
          {
            kind: 'time',
            id: 'night_waking_time',
            label: 'The time you usually wake',
          },
        ],
      },
      {
        id: 'sleep_best',
        sectionKey: 'sleep_rhythm',
        title: 'When do you generally feel your best?',
        fields: [
          {
            kind: 'single_select',
            id: 'best_period',
            label: 'When you feel your best',
            options: DAY_PERIODS,
          },
        ],
      },
      {
        id: 'sleep_worst',
        sectionKey: 'sleep_rhythm',
        title: 'And when do you generally feel at your worst?',
        fields: [
          {
            kind: 'single_select',
            id: 'worst_period',
            label: 'When you feel at your worst',
            options: DAY_PERIODS,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 10. Senses and temperature.
  // -------------------------------------------------------------------
  {
    key: 'senses',
    number: 10,
    title: 'Senses and temperature',
    framingLine: 'Small changes that are easy to stop noticing.',
    screens: [
      {
        id: 'senses_gate',
        sectionKey: 'senses',
        fields: [
          {
            kind: 'gate',
            id: 'senses_gate',
            label:
              'Have you noticed any recent changes in your senses or your tolerance of hot and cold?',
          },
        ],
      },
      {
        id: 'senses_areas',
        sectionKey: 'senses',
        title: 'Which ones?',
        showWhen: { fieldId: 'senses_gate', equals: 'yes' },
        openedBy: 'senses_gate',
        fields: [
          {
            kind: 'multi_select',
            id: 'senses_areas',
            label: 'What has changed',
            options: SENSE_OPTIONS,
          },
        ],
      },
      {
        id: 'senses_duration',
        sectionKey: 'senses',
        title: 'How long has each one been going on?',
        showWhen: { fieldId: 'senses_areas', includesAny: [] },
        openedBy: 'senses_areas',
        fields: [
          {
            kind: 'per_item',
            id: 'senses_duration',
            sourceFieldId: 'senses_areas',
            label: 'How long has this been going on?',
            noun: { one: 'answer about your senses', many: 'answers about your senses' },
            options: DURATION_OPTIONS,
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  // 11. What you have been experiencing.
  // -------------------------------------------------------------------
  {
    key: 'symptoms',
    number: 11,
    title: 'What you have been experiencing',
    framingLine: 'Nothing here is a diagnosis. It is how your coach knows when to point you elsewhere.',
    transitionLine:
      'One last area. These questions help us know when something may deserve additional attention.',
    screens: [
      {
        id: 'symptoms_energy',
        sectionKey: 'symptoms',
        title: 'Have you been regularly experiencing any of these?',
        note: 'Energy and breathing. Choose any that apply, or none.',
        fields: [
          {
            kind: 'multi_select',
            id: 'symptoms',
            label: 'Energy and breathing',
            optional: true,
            options: [
              symptomOption('fatigue'),
              symptomOption('shortness_of_breath'),
              symptomOption('sleep_difficulty'),
            ],
          },
        ],
      },
      {
        id: 'symptoms_head',
        sectionKey: 'symptoms',
        title: 'And any of these?',
        note: 'Head and body.',
        fields: [
          {
            kind: 'multi_select',
            id: 'symptoms',
            label: 'Head and body',
            optional: true,
            options: [
              symptomOption('headaches'),
              symptomOption('dizziness'),
              symptomOption('persistent_pain'),
              symptomOption('skin_changes'),
            ],
          },
        ],
      },
      {
        id: 'symptoms_digestion',
        sectionKey: 'symptoms',
        title: 'And any of these?',
        note: 'Digestion and appetite.',
        fields: [
          {
            kind: 'multi_select',
            id: 'symptoms',
            label: 'Digestion and appetite',
            optional: true,
            options: [
              symptomOption('constipation'),
              symptomOption('diarrhea'),
              symptomOption('nausea'),
              symptomOption('vomiting'),
              symptomOption('appetite_changes'),
            ],
          },
        ],
      },
      {
        id: 'symptoms_other',
        sectionKey: 'symptoms',
        title: 'Last one. Any of these?',
        fields: [
          {
            kind: 'multi_select',
            id: 'symptoms',
            label: 'Anything else',
            optional: true,
            options: [
              symptomOption('urinary_changes'),
              symptomOption('bleeding'),
              symptomOption('fever'),
              symptomOption('mood_changes'),
              symptomOption('symptom_other'),
            ],
          },
        ],
      },
      {
        id: 'symptoms_frequency',
        sectionKey: 'symptoms',
        title: 'How often does each one happen?',
        showWhen: { fieldId: 'symptoms', includesAny: [] },
        openedBy: 'symptoms',
        fields: [
          {
            kind: 'per_item',
            id: 'symptom_frequency',
            sourceFieldId: 'symptoms',
            label: 'How often?',
            noun: { one: 'answer about what you reported', many: 'answers about what you reported' },
            options: FREQUENCY_OPTIONS,
          },
        ],
      },
      {
        id: 'symptoms_duration',
        sectionKey: 'symptoms',
        title: 'And how long has each one been happening?',
        showWhen: { fieldId: 'symptoms', includesAny: [] },
        openedBy: 'symptoms',
        fields: [
          {
            kind: 'per_item',
            id: 'symptom_duration',
            sourceFieldId: 'symptoms',
            label: 'How long has this been happening?',
            noun: { one: 'answer about what you reported', many: 'answers about what you reported' },
            options: DURATION_OPTIONS,
          },
        ],
      },
      {
        id: 'symptoms_worsening',
        sectionKey: 'symptoms',
        title: 'Is any of it getting worse?',
        showWhen: { fieldId: 'symptoms', includesAny: [...WORSENING_SYMPTOMS] },
        openedBy: 'symptoms',
        fields: [
          {
            kind: 'per_item',
            id: 'symptom_worsening',
            sourceFieldId: 'symptoms',
            label: 'Is it getting worse?',
            onlyValues: [...WORSENING_SYMPTOMS],
            noun: { one: 'answer about what you reported', many: 'answers about what you reported' },
            options: YES_NO_NOT_SURE,
          },
        ],
      },
    ],
  },
];

/** How many chapters the counter counts to. Derived, never typed twice. */
export const INTAKE_SECTION_COUNT = INTAKE_SECTIONS.length;

/** Every screen, in order, ignoring visibility. */
export function allScreens() {
  return INTAKE_SECTIONS.flatMap((section) => section.screens);
}

/** Every field, in order, ignoring visibility. */
export function allFields() {
  return allScreens().flatMap((screen) => screen.fields);
}

/** One field by id, or null. The id is the permanent name; see ./types.ts. */
export function fieldById(fieldId: string) {
  return allFields().find((field) => field.id === fieldId) ?? null;
}

/** The label a stored option value prints, for any field that has options. */
export function optionLabel(fieldId: string, value: string): string | null {
  for (const field of allFields()) {
    if (field.id !== fieldId) continue;
    if (field.kind !== 'single_select' && field.kind !== 'multi_select' && field.kind !== 'per_item')
      continue;
    const found = field.options.find((option) => option.value === value);
    if (found) return found.label;
  }
  return null;
}
