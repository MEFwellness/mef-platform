/**
 * Reading this assessment's content out of the database.
 *
 * THREE BUNDLES, AND EACH ONE ASKS FOR EXACTLY WHAT ITS CALLER MAY SEE.
 * They are not filtered views of one big object: each issues its own
 * select, so a surface that only ever receives the narrow bundle cannot
 * leak what it was never handed.
 *
 *   loadMemberContent      what CROSSES TO THE BROWSER while she answers.
 *                          The question rows carry a prompt, a position
 *                          and whether Prefer not to answer is offered.
 *                          No direction, no Zone, no organ or gland, no
 *                          coach topic. Everything a client component is
 *                          handed is serialised into the page, so a column
 *                          left in here would be in the payload whether a
 *                          component drew it or not.
 *
 *   loadReadingContent     SERVER SIDE ONLY, on her own request. Adds the
 *                          two things her own reading genuinely needs: the
 *                          direction each question scores in, and the
 *                          plain language theme her section card prints.
 *                          It also carries the Zone KEYS, because a Zone
 *                          rollup is arithmetic over question tags, and it
 *                          still carries no Zone NAME, no chakra, no organ
 *                          and no coach topic, because those are words and
 *                          words are what reach a screen.
 *
 *   loadCoachContent       everything, plus the three practitioner tables.
 *                          Only ever called after the caller has been
 *                          established as a coach or an administrator, and
 *                          the database refuses those three tables to
 *                          anybody else anyway (migration 225).
 *
 * READS ONLY. Nothing in this file writes anything.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCoachingTrigger, parsePatternRule } from './trigger';
import { DEFAULT_SETTINGS, resolveSettings, type WbsSettings } from './settings';
import type {
  BranchRule,
  CoachingQuestion,
  CoachingTriggerType,
  MemberQuestion,
  MemberSection,
  PractitionerQuestion,
  ReadingQuestion,
  RoutingOption,
  ScaleOption,
  SignalBand,
  SignalPattern,
  SignalZone,
} from './types';

/** What the answering screens receive. No practitioner column is on it. */
export type MemberContent = {
  sections: MemberSection[];
  questions: MemberQuestion[];
  scale: ScaleOption[];
  routingOptions: RoutingOption[];
  branchRules: BranchRule[];
  /** Only rows whose audience is 'member'. */
  copy: Record<string, string>;
};

/** What her own reading is built from, on the server. */
export type ReadingContent = Omit<MemberContent, 'questions'> & {
  questions: ReadingQuestion[];
  bands: SignalBand[];
  settings: WbsSettings;
  /** Keys and positions only. No Zone name, chakra, organ or gland. */
  zoneOrder: { zoneKey: string; position: number }[];
};

/** What a coach's panel is built from. */
export type CoachContent = Omit<ReadingContent, 'questions'> & {
  questions: PractitionerQuestion[];
  zones: SignalZone[];
  patterns: SignalPattern[];
  coachingLibrary: CoachingQuestion[];
  coachCopy: Record<string, string>;
};

const MEMBER_QUESTION_COLUMNS =
  'question_ref, section_key, position, prompt, allows_pnta, branch_group, is_universal';
const READING_QUESTION_COLUMNS = `${MEMBER_QUESTION_COLUMNS}, direction, primary_zone_key, secondary_zone_key, member_theme`;
const COACH_QUESTION_COLUMNS = `${READING_QUESTION_COLUMNS}, organ_gland, coach_topic, feeds_section_key`;

type RawQuestion = Record<string, unknown>;

function memberQuestionFrom(row: RawQuestion): MemberQuestion {
  return {
    questionRef: row.question_ref as string,
    sectionKey: row.section_key as string,
    position: row.position as number,
    prompt: row.prompt as string,
    allowsPnta: row.allows_pnta === true,
    branchGroup: (row.branch_group as string | null) ?? null,
    isUniversal: row.is_universal === true,
  };
}

function readingQuestionFrom(row: RawQuestion): ReadingQuestion {
  return {
    ...memberQuestionFrom(row),
    direction: row.direction === 'reverse' ? 'reverse' : 'direct',
    primaryZoneKey: row.primary_zone_key as string,
    secondaryZoneKey: (row.secondary_zone_key as string | null) ?? null,
    memberTheme: row.member_theme as string,
  };
}

function practitionerQuestionFrom(row: RawQuestion): PractitionerQuestion {
  return {
    ...readingQuestionFrom(row),
    organGland: row.organ_gland as string,
    coachTopic: row.coach_topic as string,
    feedsSectionKey: (row.feeds_section_key as string | null) ?? null,
  };
}

async function fetchSections(supabase: SupabaseClient): Promise<MemberSection[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_sections')
    .select('section_key, position, display_name, member_transition_line, member_area_phrase, motion_cue')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchSections failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    sectionKey: row.section_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    memberTransitionLine: row.member_transition_line as string,
    memberAreaPhrase: row.member_area_phrase as string,
    motionCue: row.motion_cue as string,
  }));
}

async function fetchQuestions(supabase: SupabaseClient, columns: string): Promise<RawQuestion[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_questions')
    .select(columns)
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchQuestions failed', error);
    return [];
  }
  return (data ?? []) as unknown as RawQuestion[];
}

async function fetchScale(supabase: SupabaseClient): Promise<ScaleOption[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_scale_options')
    .select('value_key, position, label, direct_points, reverse_points')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchScale failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    valueKey: row.value_key as string,
    position: row.position as number,
    label: row.label as string,
    directPoints: row.direct_points as number,
    reversePoints: row.reverse_points as number,
  }));
}

async function fetchBands(supabase: SupabaseClient): Promise<SignalBand[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_bands')
    .select('band_key, position, min_percent, max_percent, member_label, member_line, member_intensity_word, coach_color')
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchBands failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    bandKey: row.band_key as string,
    position: row.position as number,
    minPercent: Number(row.min_percent),
    maxPercent: row.max_percent === null ? null : Number(row.max_percent),
    memberLabel: row.member_label as string,
    memberLine: row.member_line as string,
    memberIntensityWord: row.member_intensity_word as string,
    coachColor: row.coach_color as SignalBand['coachColor'],
  }));
}

async function fetchRoutingOptions(supabase: SupabaseClient): Promise<RoutingOption[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_routing_options')
    .select('option_key, position, label, is_pnta')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchRoutingOptions failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    optionKey: row.option_key as string,
    position: row.position as number,
    label: row.label as string,
    isPnta: row.is_pnta === true,
  }));
}

async function fetchBranchRules(supabase: SupabaseClient): Promise<BranchRule[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_branch_rules')
    .select('option_key, question_refs');
  if (error) {
    console.error('wbs fetchBranchRules failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    optionKey: row.option_key as string,
    questionRefs: Array.isArray(row.question_refs) ? (row.question_refs as string[]) : [],
  }));
}

async function fetchCopy(
  supabase: SupabaseClient,
  audience: 'member' | 'coach'
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('whole_body_signal_copy')
    .select('copy_key, value')
    .eq('audience', audience);
  if (error) {
    console.error('wbs fetchCopy failed', audience, error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.copy_key as string] = row.value as string;
  return out;
}

async function fetchSettings(supabase: SupabaseClient): Promise<WbsSettings> {
  const { data, error } = await supabase
    .from('whole_body_signal_settings')
    .select('setting_key, numeric_value');
  if (error) {
    console.error('wbs fetchSettings failed', error);
    return DEFAULT_SETTINGS;
  }
  const rows: Record<string, number> = {};
  for (const row of data ?? []) rows[row.setting_key as string] = Number(row.numeric_value);
  return resolveSettings(rows);
}

/**
 * The Zone ORDER, and not one Zone word.
 *
 * A member's own reading needs Zones sorted deterministically and nothing
 * else about them, and her session cannot read the Zone table at all
 * (migration 225 gives it no member policy). So the order is derived from
 * the question tags she can read, by the key's own natural order, rather
 * than by asking a table she is not allowed to ask.
 */
function zoneOrderFromQuestions(
  questions: readonly ReadingQuestion[]
): { zoneKey: string; position: number }[] {
  const keys = new Set<string>();
  for (const question of questions) {
    keys.add(question.primaryZoneKey);
    if (question.secondaryZoneKey) keys.add(question.secondaryZoneKey);
  }
  return [...keys]
    .sort((a, b) => a.localeCompare(b))
    .map((zoneKey, index) => ({ zoneKey, position: index + 1 }));
}

async function fetchZones(supabase: SupabaseClient): Promise<SignalZone[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_zones')
    .select('zone_key, position, display_name, spinal_segments, organ_gland_list, chakra_lens')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchZones failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    zoneKey: row.zone_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    spinalSegments: row.spinal_segments as string,
    organGlandList: row.organ_gland_list as string,
    chakraLens: row.chakra_lens as string,
  }));
}

/** A row whose rule does not parse is DROPPED, never guessed at. */
async function fetchPatterns(supabase: SupabaseClient): Promise<SignalPattern[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_patterns')
    .select('pattern_key, position, title, rule, coach_text')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchPatterns failed', error);
    return [];
  }
  const out: SignalPattern[] = [];
  for (const row of data ?? []) {
    const rule = parsePatternRule(row.rule);
    if (!rule) {
      console.error('wbs pattern has an unreadable rule', row.pattern_key);
      continue;
    }
    out.push({
      patternKey: row.pattern_key as string,
      position: row.position as number,
      title: row.title as string,
      rule,
      coachText: row.coach_text as string,
    });
  }
  return out;
}

async function fetchCoachingLibrary(supabase: SupabaseClient): Promise<CoachingQuestion[]> {
  const { data, error } = await supabase
    .from('whole_body_signal_coaching_questions')
    .select('question_key, position, trigger_type, trigger, question, topic')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('wbs fetchCoachingLibrary failed', error);
    return [];
  }
  const out: CoachingQuestion[] = [];
  for (const row of data ?? []) {
    const trigger = parseCoachingTrigger(row.trigger);
    if (!trigger) {
      console.error('wbs coaching question has an unreadable trigger', row.question_key);
      continue;
    }
    out.push({
      questionKey: row.question_key as string,
      position: row.position as number,
      triggerType: row.trigger_type as CoachingTriggerType,
      trigger,
      question: row.question as string,
      topic: row.topic as string,
    });
  }
  return out;
}

/**
 * HOW LONG A BUNDLE IS HELD, AND WHY HOLDING IT IS SAFE.
 *
 * Every table read here is CONTENT. None of it is scoped to a member, none
 * of it is filtered by who is asking, and none of it is written by the app
 * at runtime. It changes when a migration or a coach's edit changes it.
 * Five minutes is short enough that a content fix applied straight to the
 * database is live almost immediately and long enough that a whole sitting,
 * which takes a member ten to fifteen minutes and writes on every answer,
 * is served from one or two reads instead of a hundred.
 *
 * AND AN EMPTY BUNDLE IS NEVER CACHED. An answer with no sections or no
 * questions is treated as a failed read: it is returned to this one caller
 * and forgotten, rather than handed to everybody for the next five minutes.
 */
const CONTENT_TTL_MS = 300_000;

type Held<T> = { at: number; value: T } | null;
let memberCache: Held<MemberContent> = null;
let readingCache: Held<ReadingContent> = null;

function fresh<T>(held: Held<T>): T | null {
  if (!held) return null;
  return Date.now() - held.at < CONTENT_TTL_MS ? held.value : null;
}

export async function loadMemberContent(supabase: SupabaseClient): Promise<MemberContent> {
  const held = fresh(memberCache);
  if (held) return held;

  const [sections, rows, scale, routingOptions, branchRules, copy] = await Promise.all([
    fetchSections(supabase),
    fetchQuestions(supabase, MEMBER_QUESTION_COLUMNS),
    fetchScale(supabase),
    fetchRoutingOptions(supabase),
    fetchBranchRules(supabase),
    fetchCopy(supabase, 'member'),
  ]);
  const value: MemberContent = {
    sections,
    questions: rows.map(memberQuestionFrom),
    scale,
    routingOptions,
    branchRules,
    copy,
  };
  if (sections.length > 0 && value.questions.length > 0) memberCache = { at: Date.now(), value };
  return value;
}

export async function loadReadingContent(supabase: SupabaseClient): Promise<ReadingContent> {
  const held = fresh(readingCache);
  if (held) return held;

  const [sections, rows, scale, bands, routingOptions, branchRules, copy, settings] =
    await Promise.all([
      fetchSections(supabase),
      fetchQuestions(supabase, READING_QUESTION_COLUMNS),
      fetchScale(supabase),
      fetchBands(supabase),
      fetchRoutingOptions(supabase),
      fetchBranchRules(supabase),
      fetchCopy(supabase, 'member'),
      fetchSettings(supabase),
    ]);
  const questions = rows.map(readingQuestionFrom);
  const value: ReadingContent = {
    sections,
    questions,
    scale,
    bands,
    routingOptions,
    branchRules,
    copy,
    settings,
    zoneOrder: zoneOrderFromQuestions(questions),
  };
  if (sections.length > 0 && questions.length > 0) readingCache = { at: Date.now(), value };
  return value;
}

/**
 * The coach bundle. NOT CACHED, and that is deliberate: it is read once
 * per coach opening one client's card, which is nothing like the hundred
 * and fifty reads a sitting makes, and the three practitioner tables are
 * exactly the content a coach is most likely to be editing when he looks.
 */
export async function loadCoachContent(supabase: SupabaseClient): Promise<CoachContent> {
  const [sections, rows, scale, bands, routingOptions, branchRules, copy, settings, zones, patterns, coachingLibrary, coachCopyRows] =
    await Promise.all([
      fetchSections(supabase),
      fetchQuestions(supabase, COACH_QUESTION_COLUMNS),
      fetchScale(supabase),
      fetchBands(supabase),
      fetchRoutingOptions(supabase),
      fetchBranchRules(supabase),
      fetchCopy(supabase, 'member'),
      fetchSettings(supabase),
      fetchZones(supabase),
      fetchPatterns(supabase),
      fetchCoachingLibrary(supabase),
      fetchCopy(supabase, 'coach'),
    ]);

  const questions = rows.map(practitionerQuestionFrom);
  return {
    sections,
    questions,
    scale,
    bands,
    routingOptions,
    branchRules,
    copy,
    settings,
    // The real stored order, now that the Zone table is genuinely readable.
    zoneOrder: zones.map((zone) => ({ zoneKey: zone.zoneKey, position: zone.position })),
    zones,
    patterns,
    coachingLibrary,
    coachCopy: coachCopyRows,
  };
}

/** Just the member facing copy rows, for Home's card and the pop-up. */
export async function loadMemberCopy(supabase: SupabaseClient): Promise<Record<string, string>> {
  return fetchCopy(supabase, 'member');
}

/** Drops every held bundle. For a test that changes content between cases. */
export function forgetWholeBodySignalContentCache(): void {
  memberCache = null;
  readingCache = null;
}
