/**
 * Primal Pattern Assessment — questionnaire content, transcribed verbatim
 * from the source Primal Pattern Diet Type Questionnaire. Question wording,
 * answer wording, and question order must never change here without an
 * explicit content decision — same discipline as
 * lib/assessments/chek-hlc1/questionnaire.json. Scoring lives separately in
 * scoring.ts.
 *
 * Member-facing framing: this ships to members as a MEF Wellness
 * assessment. No CHEK/HLC branding appears anywhere in this module or the
 * UI that renders it.
 */

import type { PrimalPatternCopy, PrimalPatternQuestionnaire } from './types';

export const PRIMAL_PATTERN_QUESTIONNAIRE_ID = 'primal-pattern-diet-type';

export const PRIMAL_PATTERN_QUESTIONNAIRE: PrimalPatternQuestionnaire = {
  id: PRIMAL_PATTERN_QUESTIONNAIRE_ID,
  version: 1,
  title: 'Primal Pattern Assessment',
  questions: [
    {
      number: 1,
      prompt: 'I sleep best:',
      optionA: 'when I eat 1-2 hours before going to sleep.',
      optionB: 'when I eat as much as 3 or 4 hours before going to sleep.',
    },
    {
      number: 2,
      prompt: 'I sleep best if:',
      optionA: 'my dinner is composed of mainly meat with some vegetables or other carbohydrates.',
      optionB:
        'my dinner is composed mainly of vegetables or other carbohydrates and a comparatively small serving of meat.',
    },
    {
      number: 3,
      prompt: 'I sleep best and wake up feeling most rested if I:',
      optionA:
        "don't eat sweet desserts like cakes, candy or cookies. If I eat a rich dessert that is not overly sweet, such as high quality full fat ice cream, I tend to sleep okay.",
      optionB: 'even if I should eat a sweet dessert now and then.',
    },
    {
      number: 4,
      prompt: 'After vigorous exercise, I tend to crave:',
      optionA:
        "foods or drinks with higher protein and/or fat content such as a bodybuilder's high-protein shake.",
      optionB:
        'foods or drinks higher in carbohydrate (sweeter), such as Gatorade, soda, or fruit juice.',
    },
    {
      number: 5,
      prompt:
        'In order to last 4 hours between meals and maintain mental clarity and a sense of well-being, I prefer to eat:',
      optionA:
        'a meal predominantly meat based, high in protein and fat (such as roast beef, pork, salmon...) with carbohydrate as a supplement to the meal.',
      optionB:
        'a meal predominantly carbohydrate based, such as a salad or vegetables with some bread, and a small amount of protein.',
    },
    {
      number: 6,
      prompt:
        'Which best describes your reaction to sugar or sweet foods such as jelly donuts, candy or sweetened drinks:',
      optionA:
        'I get a rush of energy, may get the jitters or may feel good for a short time but then I am likely to have a blood sugar crash, resulting in the need for more of the same or having to eat some real food to normalize myself.',
      optionB:
        "I can do quite well on sweet things and I don't seem to be negatively affected, even though I know that too much is not good for me.",
    },
    {
      number: 7,
      prompt: 'My body shape is closest to:',
      optionA:
        "Mesomorphic or 'V' shaped, like a typical wrestler, gymnast or weight lifter type or Endomorphic or more naturally round shaped but I am naturally quite strong and respond very well to anaerobic sports or strength training type exercises.",
      optionB:
        'Ectomorphic or long and lean like a rower or triathlete or Endomorphic or more naturally round shaped but I respond better to endurance athletics than to strength training or anaerobic sports.',
    },
    {
      number: 8,
      prompt: 'Which statement best describes your disposition toward food in general:',
      optionA: 'I love food and live to eat!',
      optionB: 'I am not fussed over food in general and I eat to live in general.',
    },
    {
      number: 9,
      prompt: 'In general, I prefer:',
      optionA: 'To salt my foods most of the time.',
      optionB:
        'To taste my foods and apply salt once in a while, but am not particularly attracted to salty foods.',
    },
    {
      number: 10,
      prompt: 'Instinctually, I prefer to eat:',
      optionA:
        'Dark meat, such as the chicken or turkey legs and thighs over the white breast meat.',
      optionB: 'Light meat such as the chicken or turkey breast over the dark leg and thigh meat.',
    },
    {
      number: 11,
      prompt:
        'Which list of fish most appeals to your taste without concern for calories or fat content:',
      optionA:
        'Anchovy, caviar, herring, mussels, sardines, abalone, clams, crab, crayfish, lobster, mackerel, octopus, oyster, salmon, scallops, shrimp, snail, squid, tuna (dark meat)',
      optionB:
        'Light fish, catfish, cod, flounder, haddock, perch, scrod, sole, trout, tuna (white), turbot',
    },
    {
      number: 12,
      prompt: 'When eating dairy products, do you feel best after eating:',
      optionA: 'Richer full fat yogurts and cheeses or desserts.',
      optionB: 'Lighter low fat yogurts and cheeses or desserts.',
    },
    {
      number: 13,
      prompt: 'With regard to snacking, do you:',
      optionA: 'Tend to do better with snacks between meals',
      optionB: 'Tend to last between meals easily in general',
    },
    {
      number: 14,
      prompt: 'Which characteristics best describe you:',
      optionA:
        "Creative, digest food well in general, have a strong immune system and don't get sick often, have an appetite for proteins, feel good when eating fats or fatty foods, more muscular or inclined to gain muscle and/or strength easily",
      optionB:
        "Logical, more lithe of build, tend to be sensitive to temperature changes and flu season and wouldn't really consider your immune system one of your stronger attributes, prefer light meats and lower fat foods, are more inclined toward endurance athletics.",
    },
  ],
};

export const PRIMAL_PATTERN_COPY: PrimalPatternCopy = {
  displayTitle: 'Primal Pattern Assessment',
  listDescription:
    'A MEF Wellness check-in on how your body tends to respond to protein, fat, and carbohydrate, to help fine-tune your nutrition approach.',
  welcomeSubtitle:
    'A short set of questions about how you sleep, eat, and feel, used to find the macronutrient balance (fats, proteins, carbohydrates) your body tends to respond to best.',
  estimatedMinutes: 5,
  practitionerFooter: 'For practitioner reference.',
};
