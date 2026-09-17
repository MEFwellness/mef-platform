/**
 * The Rooted Reset Health Appraisal Questionnaire, haq_v1: 21 scored
 * sections, 260 questions. THE WORDING IS LOCKED. Nothing here is rewritten,
 * merged, reordered or shortened, and a change to it is a new question
 * version, never an edit in place.
 *
 * ONE AUTHORED SOURCE. Migration 262's section and question rows are
 * generated from this file by lib/haq/sql.ts
 * (`npx tsx apps/consumer-web-app/scripts/print-haq-sql.mjs`), and
 * tests/haq-content.test.ts regenerates them and asserts the shipped
 * migration still matches character for character.
 *
 * MEMBER SAFE. This file holds words and structure only. The hidden values
 * and the cutoffs live in scoringRules.ts, and tests/haq-member-safety.test.ts
 * fails if this file ever reaches that one.
 */

import type { HaqPart, HaqQuestion, HaqResponseOption, HaqResponseType, HaqSection } from './types';

// The identity lives in ./constants.ts, which carries no question text, so
// the coach's list and the member's shelf can name the HAQ without shipping
// all 260 questions. Re-exported here so every existing import still reads.
export {
  HAQ_KEY,
  HAQ_VERSION,
  HAQ_VERSION_NUMBER,
  HAQ_TITLE,
  HAQ_QUESTION_COUNT,
  HAQ_SECTION_COUNT,
} from './constants';

/** The only answers each response type accepts, in the order they are offered. */
export const HAQ_RESPONSE_OPTIONS: Record<HaqResponseType, readonly HaqResponseOption[]> = {
  frequency: [
    { value: 'never_or_rarely', label: 'Never or rarely' },
    { value: 'sometimes', label: 'Sometimes' },
    { value: 'often', label: 'Often' },
    { value: 'very_often', label: 'Very often' },
  ],
  yes_no: [
    { value: 'no', label: 'No' },
    { value: 'yes', label: 'Yes' },
  ],
};

/**
 * THE TEN PARTS, AND WHAT EACH ONE IS ABOUT.
 *
 * A Part had only a numeral until now, so a member read "Part III" over
 * "Thyroid" and was never told what Part III was. These names say it, and
 * they are the ones she reads: on every question screen, and at a Part
 * boundary ("Gastrointestinal complete", "Next: Liver / Gallbladder").
 *
 * THE NUMERAL IS NOT A NAME. "Part III" stays only inside `label`, which no
 * member screen prints any more. The only numbering she sees is "Part X of
 * 10" over the thin line.
 *
 * Migration 264 seeds haq_parts from this list (lib/haq/sql.ts), the same
 * one-authored-source rule the sections and questions already follow, and
 * tests/haq-content.test.ts asserts the shipped migration still matches it
 * character for character.
 */
export const HAQ_PARTS: readonly HaqPart[] = [
  { id: 'haq_p1', label: 'Part I', name: 'Gastrointestinal', order: 1 },
  { id: 'haq_p2', label: 'Part II', name: 'Liver / Gallbladder', order: 2 },
  { id: 'haq_p3', label: 'Part III', name: 'Endocrine', order: 3 },
  { id: 'haq_p4', label: 'Part IV', name: 'Glucose Regulation', order: 4 },
  { id: 'haq_p5', label: 'Part V', name: 'Cardiovascular', order: 5 },
  { id: 'haq_p6', label: 'Part VI', name: 'Mood', order: 6 },
  { id: 'haq_p7', label: 'Part VII', name: 'Eyes, Ears, Nose, Throat & Lungs', order: 7 },
  { id: 'haq_p8', label: 'Part VIII', name: 'Kidney & Bladder', order: 8 },
  { id: 'haq_p9', label: 'Part IX', name: 'Musculoskeletal', order: 9 },
  { id: 'haq_p10', label: 'Part X', name: 'CNS & Brain', order: 10 },
];

/** The Part a section belongs to. Throws for a section id the bank does not carry. */
export function haqPartOf(partId: string): HaqPart {
  const part = HAQ_PARTS.find((candidate) => candidate.id === partId);
  if (!part) throw new Error(`Unknown HAQ part: ${partId}`);
  return part;
}

export const HAQ_SECTIONS: readonly HaqSection[] = [
  { id: 'haq_p1_a', partId: 'haq_p1', partLabel: 'Part I', sectionLetter: 'A', title: 'Gastric Function', intro: null, order: 1 },
  { id: 'haq_p1_b', partId: 'haq_p1', partLabel: 'Part I', sectionLetter: 'B', title: 'GI Inflammation', intro: null, order: 2 },
  { id: 'haq_p1_c', partId: 'haq_p1', partLabel: 'Part I', sectionLetter: 'C', title: 'Small Intestine & Pancreas', intro: null, order: 3 },
  { id: 'haq_p1_d', partId: 'haq_p1', partLabel: 'Part I', sectionLetter: 'D', title: 'Colon', intro: null, order: 4 },
  { id: 'haq_p2', partId: 'haq_p2', partLabel: 'Part II', sectionLetter: null, title: 'Liver / Gallbladder (Hepatobiliary Function)', intro: null, order: 5 },
  { id: 'haq_p3_a', partId: 'haq_p3', partLabel: 'Part III', sectionLetter: 'A', title: 'Thyroid', intro: null, order: 6 },
  { id: 'haq_p3_b', partId: 'haq_p3', partLabel: 'Part III', sectionLetter: 'B', title: 'Adrenal', intro: null, order: 7 },
  {
    id: 'haq_p4_a',
    partId: 'haq_p4',
    partLabel: 'Part IV',
    sectionLetter: 'A',
    title: 'Dysglycemia-L',
    intro: 'When you miss meals or go for extended periods without food, do you experience any of the following?',
    order: 8,
  },
  { id: 'haq_p4_b', partId: 'haq_p4', partLabel: 'Part IV', sectionLetter: 'B', title: 'Dysglycemia-E', intro: null, order: 9 },
  { id: 'haq_p5_a', partId: 'haq_p5', partLabel: 'Part V', sectionLetter: 'A', title: 'Heart', intro: null, order: 10 },
  { id: 'haq_p5_b', partId: 'haq_p5', partLabel: 'Part V', sectionLetter: 'B', title: 'Circulation', intro: null, order: 11 },
  { id: 'haq_p6_a', partId: 'haq_p6', partLabel: 'Part VI', sectionLetter: 'A', title: 'Depression', intro: null, order: 12 },
  { id: 'haq_p6_b', partId: 'haq_p6', partLabel: 'Part VI', sectionLetter: 'B', title: 'Anxiety', intro: null, order: 13 },
  { id: 'haq_p6_c', partId: 'haq_p6', partLabel: 'Part VI', sectionLetter: 'C', title: 'Anger', intro: null, order: 14 },
  { id: 'haq_p7', partId: 'haq_p7', partLabel: 'Part VII', sectionLetter: null, title: 'Eyes, Ears, Nose, Throat & Lungs', intro: null, order: 15 },
  { id: 'haq_p8', partId: 'haq_p8', partLabel: 'Part VIII', sectionLetter: null, title: 'Kidney & Bladder', intro: null, order: 16 },
  { id: 'haq_p9_a', partId: 'haq_p9', partLabel: 'Part IX', sectionLetter: 'A', title: 'Bone Integrity', intro: null, order: 17 },
  { id: 'haq_p9_b', partId: 'haq_p9', partLabel: 'Part IX', sectionLetter: 'B', title: 'Connective Tissue', intro: null, order: 18 },
  { id: 'haq_p9_c', partId: 'haq_p9', partLabel: 'Part IX', sectionLetter: 'C', title: 'Muscle & Nerves', intro: null, order: 19 },
  { id: 'haq_p10_a', partId: 'haq_p10', partLabel: 'Part X', sectionLetter: 'A', title: 'Central Nervous System', intro: null, order: 20 },
  { id: 'haq_p10_b', partId: 'haq_p10', partLabel: 'Part X', sectionLetter: 'B', title: 'Cognition', intro: null, order: 21 },
];

type Authored = [key: string, prompt: string, responseType?: HaqResponseType];

const F: HaqResponseType = 'frequency';
const YN: HaqResponseType = 'yes_no';

const AUTHORED: Record<string, Authored[]> = {
  haq_p1_a: [
    ['haq_p1_a_q1', 'After eating, do you experience indigestion or feel or taste food coming back up?'],
    ['haq_p1_a_q2', 'Do you experience excessive burping, belching, or bloating after meals?'],
    ['haq_p1_a_q3', 'Do you experience stomach spasms or cramping during or after eating?'],
    ['haq_p1_a_q4', 'After eating, does food feel as though it just sits in your stomach, causing uncomfortable fullness, pressure, or bloating?'],
    ['haq_p1_a_q5', 'Do you frequently notice a bad or unpleasant taste in your mouth?'],
    ['haq_p1_a_q6', 'Do you feel full very quickly, even after eating only a small amount?'],
    ['haq_p1_a_q7', 'Do you sometimes skip meals or eat irregularly because you have little or no appetite?'],
  ],
  haq_p1_b: [
    ['haq_p1_b_q1', 'Can strong emotions, or even the thought or smell of food, upset your stomach or cause stomach discomfort?'],
    ['haq_p1_b_q2', 'Do you feel hungry again within about an hour or two after eating a full meal?'],
    ['haq_p1_b_q3', 'Do you experience stomach pain, burning, or aching for one to four hours after eating?'],
    ['haq_p1_b_q4', 'Does stomach pain, burning, or aching improve after eating food, drinking something soothing, or taking antacids?'],
    ['haq_p1_b_q5', 'Do you experience a burning sensation in the lower part of your chest, especially when lying down or bending forward?'],
    ['haq_p1_b_q6', 'Do digestive problems tend to improve when you rest or relax?', YN],
    ['haq_p1_b_q7', 'Do spicy foods, fried or fatty foods, chocolate, coffee, alcohol, citrus, or hot peppers cause stomach burning or aching?'],
    ['haq_p1_b_q8', 'Do you feel nauseated when you eat?'],
    ['haq_p1_b_q9', 'Do you experience difficulty or pain when swallowing food or beverages?'],
  ],
  haq_p1_c: [
    ['haq_p1_c_q1', 'When you press or massage beneath the left side of your rib cage, do you notice pain, tenderness, or soreness?'],
    ['haq_p1_c_q2', 'Do indigestion, fullness, or abdominal tension tend to appear two to four hours after a meal?'],
    ['haq_p1_c_q3', 'Does discomfort in your lower abdomen improve after passing gas or having a bowel movement?'],
    ['haq_p1_c_q4', 'Do certain foods or beverages consistently make your indigestion worse?'],
    ['haq_p1_c_q5', 'Does the consistency or shape of your stool change noticeably within the same day?'],
    ['haq_p1_c_q6', 'Does the odor of your stool seem unusually strong or embarrassing?'],
    ['haq_p1_c_q7', 'Do you notice pieces of undigested food in your stool?'],
    ['haq_p1_c_q8', 'Do you typically have three or more large bowel movements in a day?'],
    ['haq_p1_c_q9', 'Do you experience frequent loose or watery stools?'],
    ['haq_p1_c_q10', 'Do you often need to have a bowel movement within about one hour after eating?'],
  ],
  haq_p1_d: [
    ['haq_p1_d_q1', 'Do you experience discomfort, pain, or cramping in your lower abdomen or colon area?'],
    ['haq_p1_d_q2', 'Do raw fruits or vegetables trigger abdominal bloating, pain, cramping, or gas?'],
    ['haq_p1_d_q3', 'Are you generally constipated or do you often need to strain during a bowel movement?'],
    ['haq_p1_d_q4', 'Is your stool frequently small, hard, or dry?'],
    ['haq_p1_d_q5', 'Do you notice mucus in your stool?'],
    ['haq_p1_d_q6', 'Do you alternate between constipation and diarrhea?'],
    ['haq_p1_d_q7', 'Do you experience rectal pain, itching, or cramping?'],
    ['haq_p1_d_q8', 'Do you feel a sudden or urgent need to have a bowel movement?', YN],
    ['haq_p1_d_q9', 'Do you feel an almost constant need to have a bowel movement?', YN],
  ],
  haq_p2: [
    ['haq_p2_q1', 'When you press or massage beneath the right side of your rib cage, do you notice pain, tenderness, or soreness?'],
    ['haq_p2_q2', 'Does abdominal pain become worse when you take a deep breath?'],
    ['haq_p2_q3', 'Do you experience pain at night that may travel toward your back or right shoulder?'],
    ['haq_p2_q4', 'Do you have a bitter taste or bitter-tasting fluid come back up after eating?'],
    ['haq_p2_q5', 'Do rich, fatty, or fried foods cause abdominal discomfort or nausea?'],
    ['haq_p2_q6', 'Do you experience throbbing at the temples or a dull forehead headache that seems associated with overeating?'],
    ['haq_p2_q7', 'Do you experience unexplained itchy skin that becomes worse at night?'],
    ['haq_p2_q8', 'Does your stool color sometimes change between very pale or clay-colored and normal brown?'],
    ['haq_p2_q9', 'Do you generally feel that your health is poor?'],
    ['haq_p2_q10', 'Do your muscles ache even when the soreness is not related to exercise?'],
    ['haq_p2_q11', 'Do you retain fluid or feel swollen around your abdomen?'],
    ['haq_p2_q12', 'Do you notice unusually red skin, especially on the palms of your hands?'],
    ['haq_p2_q13', 'Do you notice unusually strong body odor?'],
    ['haq_p2_q14', 'Are you concerned or embarrassed by the odor of your breath?'],
    ['haq_p2_q15', 'Do you bruise easily?', YN],
    ['haq_p2_q16', 'Have you noticed a yellowish color or tint in the whites of your eyes?', YN],
  ],
  haq_p3_a: [
    ['haq_p3_a_q1', 'Do you feel unusually cold or chilled in your hands, feet, or throughout your body without an obvious reason?'],
    ['haq_p3_a_q2', 'Do your upper eyelids appear swollen or puffy?'],
    ['haq_p3_a_q3', 'Do your muscles feel weak, cramp, or tremble?'],
    ['haq_p3_a_q4', 'Do you feel unusually forgetful?'],
    ['haq_p3_a_q5', 'Does your heartbeat sometimes feel unusually slow?'],
    ['haq_p3_a_q6', 'Do your reactions or reflexes feel slower than usual?'],
    ['haq_p3_a_q7', 'Has your interest in sex decreased compared with what is normal for you?'],
    ['haq_p3_a_q8', 'Do you often feel physically slow or sluggish?'],
    ['haq_p3_a_q9', 'Do you experience constipation?'],
    ['haq_p3_a_q10', 'Have you noticed unusual dryness or changes in the color of your skin or hair?', YN],
    ['haq_p3_a_q11', 'Have you noticed that your voice has become deeper?', YN],
    ['haq_p3_a_q12', 'Are your nails unusually thick or brittle?', YN],
    ['haq_p3_a_q13', 'Have you gained weight without an obvious reason?', YN],
    ['haq_p3_a_q14', 'Have you noticed thinning or loss of hair along the outer portion of your eyebrows?', YN],
    ['haq_p3_a_q15', 'Have you noticed swelling in your neck?', YN],
  ],
  haq_p3_b: [
    ['haq_p3_b_q1', 'Do you experience lingering fatigue after physical activity or stress?'],
    ['haq_p3_b_q2', 'Do you become tired or exhausted more easily than you would expect?'],
    ['haq_p3_b_q3', 'Do you frequently crave salty foods?'],
    ['haq_p3_b_q4', 'Are you unusually sensitive to small changes in weather or your surroundings?'],
    ['haq_p3_b_q5', 'Do you become dizzy when standing up after sitting, lying down, or kneeling?'],
    ['haq_p3_b_q6', 'Do you have dark bluish or black circles under your eyes?'],
    ['haq_p3_b_q7', 'Do you experience episodes of nausea, with or without vomiting?'],
    ['haq_p3_b_q8', 'Do you seem to catch colds or infections easily?', YN],
    ['haq_p3_b_q9', 'Do cuts or wounds seem to heal slowly?'],
    ['haq_p3_b_q10', 'Do areas of your body feel unusually tender, sore, painful, or sensitive to touch?'],
    ['haq_p3_b_q11', 'Do you feel generally puffy or swollen throughout your body?'],
    ['haq_p3_b_q12', 'Has your skin gradually become darker without increased sun exposure or another obvious reason?', YN],
  ],
  haq_p4_a: [
    ['haq_p4_a_q1', 'A sense of weakness?'],
    ['haq_p4_a_q2', 'A sudden feeling of anxiety when you become hungry?'],
    ['haq_p4_a_q3', 'Tingling in your hands?'],
    ['haq_p4_a_q4', 'A feeling that your heart is beating unusually fast or forcefully?'],
    ['haq_p4_a_q5', 'Shaking, jitteriness, or trembling hands?'],
    ['haq_p4_a_q6', 'Sudden heavy sweating or clammy skin?'],
    ['haq_p4_a_q7', 'Nightmares that seem more likely when you go to bed without eating?'],
    ['haq_p4_a_q8', 'Waking during the night feeling restless?'],
    ['haq_p4_a_q9', 'Feeling agitated, nervous, or easily upset?'],
    ['haq_p4_a_q10', 'Poor memory or unusual forgetfulness?'],
    ['haq_p4_a_q11', 'Feeling confused or disoriented?'],
    ['haq_p4_a_q12', 'Dizziness or feeling faint?'],
    ['haq_p4_a_q13', 'Feeling unusually cold or numb?'],
    ['haq_p4_a_q14', 'Mild headaches or a pounding sensation in your head?'],
    ['haq_p4_a_q15', 'Blurred or double vision?'],
    ['haq_p4_a_q16', 'Feeling clumsy or poorly coordinated?'],
  ],
  haq_p4_b: [
    ['haq_p4_b_q1', 'Do you urinate frequently during both the day and night?'],
    ['haq_p4_b_q2', 'Do you experience unusual thirst or feel that you cannot drink enough water?'],
    ['haq_p4_b_q3', 'Do you feel unusually hungry or feel as though you could eat constantly?'],
    ['haq_p4_b_q4', 'Does your vision become blurry?'],
    ['haq_p4_b_q5', 'Do you experience itching throughout your body?'],
    ['haq_p4_b_q6', 'Do you experience tingling or numbness in your feet?'],
    ['haq_p4_b_q7', 'Do you feel unusually sleepy or sluggish during the day even when it is not related to missed meals or lack of sleep?'],
    ['haq_p4_b_q8', 'Do starchy foods such as rice, corn, beans, whole grains, or oats seem to contribute to weight gain or make weight loss more difficult for you?', YN],
    ['haq_p4_b_q9', 'Do cuts or sores seem to heal slowly?', YN],
    ['haq_p4_b_q10', 'Have you experienced loss of hair on your legs?', YN],
  ],
  haq_p5_a: [
    ['haq_p5_a_q1', 'Do you often feel jittery or physically on edge?'],
    ['haq_p5_a_q2', 'When you first become active for the day, do you experience pain, pressure, tightness, or heaviness around your chest?'],
    ['haq_p5_a_q3', 'Do you become exhausted after only a small amount of physical activity?'],
    ['haq_p5_a_q4', 'Do you experience heavy sweating when you have not been exercising and are not having a hot flash?'],
    ['haq_p5_a_q5', 'Do you have difficulty catching your breath, especially during exercise or physical activity?'],
    ['haq_p5_a_q6', 'Do you notice your heart pounding or feel that it is beating too fast, too slowly, or irregularly?'],
    ['haq_p5_a_q7', 'Do your feet, ankles, or legs swell and then return to normal without an obvious reason?'],
  ],
  haq_p5_b: [
    ['haq_p5_b_q1', 'Do you experience muscle pain while resting?'],
    ['haq_p5_b_q2', 'Do you experience cramp-like pain in your ankles, calves, or legs?'],
    ['haq_p5_b_q3', 'Do you experience numbness, tingling, or a prickling sensation in your hands or feet?'],
    ['haq_p5_b_q4', 'Do your feet or toes become unusually cold or appear bluish?'],
    ['haq_p5_b_q5', 'Do you experience brief moments when your hearing seems reduced or disappears?'],
    ['haq_p5_b_q6', 'Do you experience episodes of nausea that come and go quickly and are not related to eating?'],
    ['haq_p5_b_q7', 'When standing, do your legs feel unusually heavy or tired?'],
    ['haq_p5_b_q8', 'Does leg discomfort or fatigue improve when you raise or elevate your legs?'],
    ['haq_p5_b_q9', 'Do your fingers or toes become numb in cold weather even when they are protected?'],
    ['haq_p5_b_q10', 'Have you noticed a change in your ability to feel pain or tell the difference between hot and cold?', YN],
    ['haq_p5_b_q11', 'Have you noticed body hair on your arms, hands, fingers, legs, or toes becoming thinner or disappearing?', YN],
    ['haq_p5_b_q12', 'Have you noticed a decline in your ability to make decisions, concentrate, focus your attention, or follow directions?', YN],
  ],
  haq_p6_a: [
    ['haq_p6_a_q1', 'Have you lost interest in family, friends, work, hobbies, or activities that used to matter to you?'],
    ['haq_p6_a_q2', 'Do you find yourself crying?'],
    ['haq_p6_a_q3', 'Does life sometimes feel completely hopeless?'],
    ['haq_p6_a_q4', 'Do you feel miserable, sad, unhappy, or blue?'],
    ['haq_p6_a_q5', 'Do you find it difficult to make the best of challenging situations?'],
    ['haq_p6_a_q6', 'Do you have problems sleeping, either sleeping too much or too little?'],
    ['haq_p6_a_q7', 'Have you noticed a change in both your appetite and your weight?', YN],
    ['haq_p6_a_q8', 'Have you recently noticed difficulty thinking clearly or concentrating?', YN],
    ['haq_p6_a_q9', 'Have you had difficulty making decisions, getting clear about what you want, or working toward your goals?', YN],
  ],
  haq_p6_b: [
    ['haq_p6_b_q1', 'Does worrying negatively affect your mood?'],
    ['haq_p6_b_q2', 'Do small things easily get on your nerves or wear you out?'],
    ['haq_p6_b_q3', 'Do you often feel nervous?'],
    ['haq_p6_b_q4', 'Do you become easily agitated?'],
    ['haq_p6_b_q5', 'Do you shake or tremble?'],
    ['haq_p6_b_q6', 'Do you feel keyed up, tense, or jittery?'],
    ['haq_p6_b_q7', 'Do you tremble or feel weak when someone shouts at you?'],
    ['haq_p6_b_q8', 'Do sudden movements or noises at night easily frighten you?'],
    ['haq_p6_b_q9', 'Do you find yourself sighing frequently?'],
    ['haq_p6_b_q10', 'Do frightening dreams wake you from sleep?'],
    ['haq_p6_b_q11', 'Do frightening or disturbing thoughts repeatedly come back into your mind?'],
    ['haq_p6_b_q12', 'Do you suddenly become frightened even when there is no obvious reason?'],
    ['haq_p6_b_q13', 'Do you suddenly break out in a cold sweat?'],
    ['haq_p6_b_q14', 'Do you experience "butterflies" in your stomach, nausea, or diarrhea when you feel nervous or anxious?'],
  ],
  haq_p6_c: [
    ['haq_p6_c_q1', 'Do you feel emotionally bottled up, as though you might suddenly lose your temper?'],
    ['haq_p6_c_q2', 'Are you prone to loud or emotional outbursts?'],
    ['haq_p6_c_q3', 'Do you sometimes act impulsively without thinking things through first?'],
    ['haq_p6_c_q4', 'Are you easily upset or irritated?'],
    ['haq_p6_c_q5', 'Do you feel as though you might fall apart if you cannot control yourself?'],
    ['haq_p6_c_q6', 'Do small annoyances easily get on your nerves or make you angry?'],
    ['haq_p6_c_q7', 'Does being told what to do make you angry?'],
    ['haq_p6_c_q8', 'Do you become angry when you cannot get what you want right away?'],
  ],
  haq_p7: [
    ['haq_p7_q1', 'Do your eyes water or tear frequently?'],
    ['haq_p7_q2', 'Do you experience mucus or discharge from your eyes?'],
    ['haq_p7_q3', 'Do your ears ache, itch, feel congested, or feel sore?'],
    ['haq_p7_q4', 'Do you experience discharge from your ears?'],
    ['haq_p7_q5', 'Does your nose feel continually congested?'],
    ['haq_p7_q6', 'Are you prone to loud snoring?', YN],
    ['haq_p7_q7', 'Does your nose run frequently?'],
    ['haq_p7_q8', 'Do you experience nosebleeds?', YN],
    ['haq_p7_q9', 'Does your voice frequently sound hoarse?'],
    ['haq_p7_q10', 'Do you frequently need to clear your throat?'],
    ['haq_p7_q11', 'Do you feel a choking or tight sensation in your throat?'],
    ['haq_p7_q12', 'Do you tend to have severe colds?', YN],
    ['haq_p7_q13', 'Do frequent colds tend to keep you feeling unwell during the winter?', YN],
    ['haq_p7_q14', 'Do flu-like symptoms tend to last longer than five days for you?', YN],
    ['haq_p7_q15', 'Do respiratory infections tend to settle in your lungs?', YN],
    ['haq_p7_q16', 'Do you experience chest discomfort or pain?'],
    ['haq_p7_q17', 'Do you experience sudden difficulty breathing?'],
    ['haq_p7_q18', 'Do you experience shortness of breath?'],
    ['haq_p7_q19', 'Do you have difficulty breathing out or fully exhaling?'],
    ['haq_p7_q20', 'Does even mild physical activity leave you breathless and coughing?'],
    ['haq_p7_q21', 'Do you have difficulty breathing comfortably while lying down?'],
    ['haq_p7_q22', 'Do you frequently cough up a lot of phlegm?'],
    ['haq_p7_q23', 'Do you hear rattling or noisy sounds when breathing in or out?'],
    ['haq_p7_q24', 'Are you frequently troubled by coughing?'],
    ['haq_p7_q25', 'Do you wheeze when you breathe?'],
    ['haq_p7_q26', 'Do you experience severe soaking sweats at night?'],
    ['haq_p7_q27', 'Do your lips or nails sometimes appear bluish?'],
    ['haq_p7_q28', 'Do you frequently feel sleepy during the day?'],
    ['haq_p7_q29', 'Do you have difficulty concentrating?'],
    ['haq_p7_q30', 'Do symptoms involving your eyes, ears, nose, throat, or lungs seem connected to particular foods such as dairy or wheat products?', YN],
    ['haq_p7_q31', 'Do symptoms involving your eyes, ears, nose, throat, or lungs seem to change with the seasons?', YN],
  ],
  haq_p8: [
    ['haq_p8_q1', 'Do you accidentally leak urine when you cough, lift something, strain, or perform physical activity?'],
    ['haq_p8_q2', 'Do you experience a mild ache or pain in your lower back?'],
    ['haq_p8_q3', 'Do you experience aching or pain in your abdomen?'],
    ['haq_p8_q4', 'Do you experience pain or burning when urinating?'],
    ['haq_p8_q5', 'Do you rarely feel the urge to urinate?'],
    ['haq_p8_q6', 'Do you feel the need to urinate less often than every two hours during the day or night?'],
    ['haq_p8_q7', 'Does your urine have an unusually strong odor?'],
    ['haq_p8_q8', 'Is back or leg pain associated with dripping urine after urination?'],
    ['haq_p8_q9', 'Do you experience soreness or pain in the genital area?'],
    ['haq_p8_q10', 'Does your urine sometimes appear pink or rose-colored?'],
    ['haq_p8_q11', 'Does a sudden urge to urinate sometimes cause accidental urine leakage?'],
    ['haq_p8_q12', 'Do you generally feel as though you are retaining fluid throughout your body?'],
  ],
  haq_p9_a: [
    ['haq_p9_a_q1', 'Do the bones throughout your body feel achy, tender, or sore?'],
    ['haq_p9_a_q2', 'Do you experience pain that feels localized to a specific bone?'],
    ['haq_p9_a_q3', 'Do your hands, feet, or throat become tight, spasm, or feel numb?'],
    ['haq_p9_a_q4', 'Do you have difficulty sitting upright or maintaining a straight posture?'],
    ['haq_p9_a_q5', 'Do you experience upper-back pain?'],
    ['haq_p9_a_q6', 'Do you experience lower-back pain?'],
    ['haq_p9_a_q7', 'Do you experience pain while sitting or walking?'],
    ['haq_p9_a_q8', 'Do you find yourself limping or favoring one leg?'],
    ['haq_p9_a_q9', 'Do your shins hurt during or after exercise?'],
  ],
  haq_p9_b: [
    ['haq_p9_b_q1', 'Do you feel stiff when you wake up in the morning?'],
    ['haq_p9_b_q2', 'Do you have difficulty bending down to pick clothing or other items up from the floor?'],
    ['haq_p9_b_q3', 'Do you experience joint swelling, pain, or stiffness in areas such as the fingers, hands, wrists, elbows, shoulders, toes, feet, ankles, or knees?'],
    ['haq_p9_b_q4', 'Do your joints hurt when you move or carry weight?'],
    ['haq_p9_b_q5', 'Does routine exercise, such as daily walking, cause your knees to hurt or swell?'],
    ['haq_p9_b_q6', 'Do you have difficulty opening jars that used to be easy for you to open?'],
    ['haq_p9_b_q7', 'Do you experience discomfort, numbness, prickling, tingling, or pain in your neck, shoulder, or arm?'],
    ['haq_p9_b_q8', 'Do you experience pain or aching on one side of your head that spreads toward your cheek, temple, lower jaw, ear, neck, or shoulder?'],
    ['haq_p9_b_q9', 'Do you have difficulty chewing food or opening your mouth?'],
    ['haq_p9_b_q10', 'Do you have difficulty standing up from a seated position?'],
    ['haq_p9_b_q11', 'Do you experience shooting, aching, or tingling pain down the back of your leg?'],
    ['haq_p9_b_q12', 'Is it difficult for you to reach overhead and lift an object weighing about five pounds, such as a bag of flour?', YN],
    ['haq_p9_b_q13', 'Do you injure, strain, or sprain yourself easily?', YN],
  ],
  haq_p9_c: [
    ['haq_p9_c_q1', 'Do your muscles feel stiff, sore, tense, or achy?'],
    ['haq_p9_c_q2', 'Do you experience burning, throbbing, shooting, or stabbing muscle pain?'],
    ['haq_p9_c_q3', 'Do you experience muscle cramps or spasms, either unexpectedly or after physical activity?'],
    ['haq_p9_c_q4', 'Is your muscle pain or stiffness worse in the morning than at other times of the day?'],
    ['haq_p9_c_q5', 'Do specific areas of your body feel sore or tender when pressed?'],
    ['haq_p9_c_q6', 'Do you wake up feeling unrefreshed?'],
    ['haq_p9_c_q7', 'Do you experience headaches?'],
    ['haq_p9_c_q8', 'Do you experience pain along the sides of your head or in your face, especially when waking?'],
    ['haq_p9_c_q9', 'Does your jaw click or pop?'],
    ['haq_p9_c_q10', 'Do you experience muscle twitching or tremors, such as around your eyelids, thumb, or calf?'],
    ['haq_p9_c_q11', 'Do you have an irresistible urge to move your legs?'],
    ['haq_p9_c_q12', 'Do your legs move while you are sleeping?'],
    ['haq_p9_c_q13', 'Do you experience an unpleasant crawling sensation inside your calves when lying down?'],
    ['haq_p9_c_q14', 'Do you experience numbness or pain in your hand or wrist that interferes with activities such as writing or buttoning clothing?'],
    ['haq_p9_c_q15', 'Do you experience a pins-and-needles sensation in your thumb and first three fingers?'],
    ['haq_p9_c_q16', 'Do you experience pain in your forearm that sometimes extends into your shoulder?'],
  ],
  haq_p10_a: [
    ['haq_p10_a_q1', 'Does your head sometimes feel unusually heavy?'],
    ['haq_p10_a_q2', 'Do you experience dizziness?'],
    ['haq_p10_a_q3', 'Do you have difficulty bending over, standing up from sitting, rolling over in bed, or turning your head from side to side?'],
    ['haq_p10_a_q4', 'Do your hands tremble, even slightly, without an obvious reason?'],
    ['haq_p10_a_q5', 'When walking, do your feet feel as though heavy weights are attached to them?'],
    ['haq_p10_a_q6', 'Do you bump into things, trip, stumble, or feel clumsy?'],
    ['haq_p10_a_q7', 'Do you have difficulty breathing?'],
    ['haq_p10_a_q8', 'Do you have difficulty swallowing?'],
    ['haq_p10_a_q9', 'Do people ask you to speak louder because they have difficulty hearing you?'],
    ['haq_p10_a_q10', 'Does speaking or forming words sometimes feel less automatic than it should?'],
    ['haq_p10_a_q11', 'Do you need 10-12 hours of sleep to feel rested?'],
    ['haq_p10_a_q12', 'Do you feel weakness in your grip, find it difficult to hold your head up, or find lifting your arms unusually tiring?'],
    ['haq_p10_a_q13', 'Do your hands tire easily when writing, or has your handwriting become noticeably smaller or less clear than it used to be?', YN],
    ['haq_p10_a_q14', 'Do the muscles in your arms or legs seem softer or smaller than they used to?', YN],
    ['haq_p10_a_q15', 'Have your eyesight, sense of smell, taste, or hearing become less sharp than they used to be?', YN],
    ['haq_p10_a_q16', 'Do you find yourself moving more slowly than you used to?', YN],
  ],
  haq_p10_b: [
    ['haq_p10_b_q1', 'Do you have difficulty taking in or understanding new information?'],
    ['haq_p10_b_q2', 'Do you tend to forget things?'],
    ['haq_p10_b_q3', 'Do you have difficulty thinking clearly or concentrating?'],
    ['haq_p10_b_q4', 'Are you easily distracted?'],
    ['haq_p10_b_q5', 'Do you become frustrated quickly?'],
    ['haq_p10_b_q6', 'Do you find it difficult to sit still for any length of time, including during meals?'],
    ['haq_p10_b_q7', 'Do you often find it easier to start tasks than to finish them?'],
    ['haq_p10_b_q8', 'Do you have more difficulty than usual solving problems or managing your time?'],
    ['haq_p10_b_q9', 'Do you have a low tolerance for stress or everyday problems?'],
  ],
};

/** All 260, in section order and then in their printed order inside each section. */
export const HAQ_QUESTIONS: readonly HaqQuestion[] = HAQ_SECTIONS.flatMap((section) =>
  (AUTHORED[section.id] ?? []).map(([key, prompt, responseType = F], index) => ({
    key,
    sectionId: section.id,
    order: index + 1,
    prompt,
    responseType,
  }))
);

export function findHaqSection(sectionId: string): HaqSection | undefined {
  return HAQ_SECTIONS.find((section) => section.id === sectionId);
}
