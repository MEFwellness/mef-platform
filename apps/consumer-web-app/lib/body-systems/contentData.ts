/**
 * Reading the survey's content out of the database.
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller scoped SupabaseClient, RLS decides who may read what, and a
 * failed read returns a safe value rather than throwing, since every
 * caller is on a page somebody is already waiting on.
 *
 * THE MEMBER BUNDLE AND THE COACH BUNDLE ARE TWO FUNCTIONS. The member
 * bundle has no association library and no coach copy in it, and it is not
 * a filtered view of a bigger object: it never asks for those rows at all.
 * A surface that only ever receives the member bundle cannot leak what it
 * was never handed, and the database refuses the request as well
 * (migration 220 gives body_systems_associations no member policy).
 *
 * READS ONLY. Nothing in this file writes anything.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTrigger } from './trigger';
import { DEFAULT_MIN_DELTA_PERCENT } from './retake';
import type {
  BodySystemsAssociation,
  BodySystemsBand,
  BodySystemsQuestion,
  BodySystemsQuestionBranch,
  BodySystemsRedFlag,
  BodySystemsSafetyLevel,
  BodySystemsScaleOption,
  BodySystemsSection,
} from './types';

/** Everything a member's own screens need, and nothing else. */
export type MemberContent = {
  sections: BodySystemsSection[];
  questions: BodySystemsQuestion[];
  scale: BodySystemsScaleOption[];
  bands: BodySystemsBand[];
  redFlags: BodySystemsRedFlag[];
  safetyLevels: BodySystemsSafetyLevel[];
  /** Only rows whose audience is 'member'. */
  copy: Record<string, string>;
  minDeltaPercent: number;
};

/**
 * One section, with every word that names it removed.
 *
 * WHILE SHE IS ANSWERING, SHE ANSWERS BLIND. No screen in the survey names
 * the body system a question belongs to, because a member who can see that
 * she is on the digestion questions answers them differently. The names
 * are hers on the results screen, beside the bars.
 *
 * THE NAMES ARE NOT MERELY UNRENDERED, THEY ARE NOT SENT. Everything the
 * answering component is handed is serialised into the page, so a name
 * left in the bundle would be in the payload whether a component drew it
 * or not. What the answering screens genuinely need from a section is its
 * key and its place in the order, and that is all this carries.
 */
export type BlindSection = {
  sectionKey: string;
  position: number;
};

/** The member bundle as the answering screens receive it: no section names. */
export type AnsweringContent = Omit<MemberContent, 'sections'> & {
  sections: BlindSection[];
};

/**
 * Strip the names off the sections.
 *
 * Her results view is built on the server from the full rows, so nothing
 * downstream of this loses a name it needs: the bars carry their own
 * section names and reach the screen through MemberResultsView.
 */
export function blindContent(content: MemberContent): AnsweringContent {
  /*
    AND NO COPY ROW THAT NAMES ONE EITHER.

    body_systems_copy is one table serving several surfaces, and one of its
    rows is the label on her profile's branch control, which names Hormonal
    Health because that is the set of questions the control changes. That
    row is nothing to do with the answering screens, but the whole copy
    record is handed to them, so the name travelled in the payload.

    The rule is expressed rather than listed: any row that carries a
    section's own words is not sent to a screen she answers on. It fails
    closed, so a row added later that names a system goes missing from
    those screens rather than quietly appearing on one.
  */
  const naming = content.sections.flatMap((section) => [
    section.displayName,
    section.memberIntroLine,
  ]);
  const copy = Object.fromEntries(
    Object.entries(content.copy).filter(
      ([, value]) => !naming.some((name) => name.length > 0 && value.includes(name))
    )
  );

  return {
    ...content,
    copy,
    sections: content.sections.map((section) => ({
      sectionKey: section.sectionKey,
      position: section.position,
    })),
  };
}

/** The member bundle, plus the two things only a coach may read. */
export type CoachContent = MemberContent & {
  library: BodySystemsAssociation[];
  coachCopy: Record<string, string>;
};

function branchOf(value: unknown): BodySystemsQuestionBranch {
  return value === 'a' || value === 'b' ? value : 'all';
}

async function fetchSections(supabase: SupabaseClient): Promise<BodySystemsSection[]> {
  const { data, error } = await supabase
    .from('body_systems_sections')
    .select('section_key, position, display_name, member_intro_line, top_attention_line, registry_domain, registry_code')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchSections failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    sectionKey: row.section_key as string,
    position: row.position as number,
    displayName: row.display_name as string,
    memberIntroLine: row.member_intro_line as string,
    topAttentionLine: row.top_attention_line as string,
    registryDomain: row.registry_domain as string,
    registryCode: row.registry_code as string,
  }));
}

async function fetchQuestions(supabase: SupabaseClient): Promise<BodySystemsQuestion[]> {
  const { data, error } = await supabase
    .from('body_systems_questions')
    .select('question_ref, section_key, position, prompt, branch, allows_dna, dna_label')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchQuestions failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    questionRef: row.question_ref as string,
    sectionKey: row.section_key as string,
    position: row.position as number,
    prompt: row.prompt as string,
    branch: branchOf(row.branch),
    allowsDna: row.allows_dna === true,
    dnaLabel: (row.dna_label as string | null) ?? null,
  }));
}

async function fetchScale(supabase: SupabaseClient): Promise<BodySystemsScaleOption[]> {
  const { data, error } = await supabase
    .from('body_systems_scale_options')
    .select('value_key, position, label, points, is_elevated')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchScale failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    valueKey: row.value_key as string,
    position: row.position as number,
    label: row.label as string,
    points: row.points as number,
    isElevated: row.is_elevated === true,
  }));
}

async function fetchBands(supabase: SupabaseClient): Promise<BodySystemsBand[]> {
  const { data, error } = await supabase
    .from('body_systems_bands')
    .select('band_key, position, min_percent, max_percent, color_key, member_label, member_status_line')
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchBands failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    bandKey: row.band_key as string,
    position: row.position as number,
    minPercent: Number(row.min_percent),
    maxPercent: row.max_percent === null ? null : Number(row.max_percent),
    colorKey: row.color_key as BodySystemsBand['colorKey'],
    memberLabel: row.member_label as string,
    memberStatusLine: row.member_status_line as string,
  }));
}

async function fetchRedFlags(supabase: SupabaseClient): Promise<BodySystemsRedFlag[]> {
  const { data, error } = await supabase
    .from('body_systems_red_flags')
    .select('flag_key, position, prompt, level')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchRedFlags failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    flagKey: row.flag_key as string,
    position: row.position as number,
    prompt: row.prompt as string,
    level: (row.level === 1 ? 1 : 2) as 1 | 2,
  }));
}

async function fetchSafetyLevels(supabase: SupabaseClient): Promise<BodySystemsSafetyLevel[]> {
  const { data, error } = await supabase
    .from('body_systems_safety_levels')
    .select('level, label, member_response')
    .order('level', { ascending: true });
  if (error) {
    console.error('fetchSafetyLevels failed', error);
    return [];
  }
  return (data ?? []).map((row) => ({
    level: (row.level === 1 ? 1 : 2) as 1 | 2,
    label: row.label as string,
    memberResponse: row.member_response as string,
  }));
}

async function fetchCopy(
  supabase: SupabaseClient,
  audience: 'member' | 'coach'
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('body_systems_copy')
    .select('copy_key, value')
    .eq('audience', audience);
  if (error) {
    console.error('fetchCopy failed', audience, error);
    return {};
  }
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.copy_key as string] = row.value as string;
  return out;
}

async function fetchMinDelta(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from('body_systems_settings')
    .select('numeric_value')
    .eq('setting_key', 'compare.min_delta_percent')
    .maybeSingle();
  if (error || !data) return DEFAULT_MIN_DELTA_PERCENT;
  const value = Number(data.numeric_value);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MIN_DELTA_PERCENT;
}

/**
 * The association library.
 *
 * A ROW WHOSE TRIGGER DOES NOT PARSE IS DROPPED, never guessed at. A
 * mistyped edit therefore removes one entry from a coach's library rather
 * than firing it on every member.
 */
async function fetchLibrary(supabase: SupabaseClient): Promise<BodySystemsAssociation[]> {
  const { data, error } = await supabase
    .from('body_systems_associations')
    .select('entry_code, position, section_key, branch, title, trigger, association_text, next_step')
    .eq('is_active', true)
    .order('position', { ascending: true });
  if (error) {
    console.error('fetchLibrary failed', error);
    return [];
  }
  const out: BodySystemsAssociation[] = [];
  for (const row of data ?? []) {
    const trigger = parseTrigger(row.trigger);
    if (!trigger) {
      console.error('body systems association has an unreadable trigger', row.entry_code);
      continue;
    }
    out.push({
      entryCode: row.entry_code as string,
      position: row.position as number,
      sectionKey: (row.section_key as string | null) ?? null,
      branch: branchOf(row.branch),
      title: row.title as string,
      trigger,
      associationText: row.association_text as string,
      nextStep: row.next_step as string,
    });
  }
  return out;
}

/**
 * Just the member facing copy rows.
 *
 * Home's card and the pop-up need words and nothing else, and Home is on
 * the critical path, so they read one small table rather than the whole
 * eight query bundle the survey route needs.
 */
export async function loadMemberCopy(supabase: SupabaseClient): Promise<Record<string, string>> {
  return fetchCopy(supabase, 'member');
}

/** Everything a member's screens need. Never asks for an association row. */
export async function loadMemberContent(supabase: SupabaseClient): Promise<MemberContent> {
  const [sections, questions, scale, bands, redFlags, safetyLevels, copy, minDeltaPercent] =
    await Promise.all([
      fetchSections(supabase),
      fetchQuestions(supabase),
      fetchScale(supabase),
      fetchBands(supabase),
      fetchRedFlags(supabase),
      fetchSafetyLevels(supabase),
      fetchCopy(supabase, 'member'),
      fetchMinDelta(supabase),
    ]);
  return { sections, questions, scale, bands, redFlags, safetyLevels, copy, minDeltaPercent };
}

/** The member bundle plus the library and the coach's own copy. */
export async function loadCoachContent(supabase: SupabaseClient): Promise<CoachContent> {
  const [base, library, coachCopy] = await Promise.all([
    loadMemberContent(supabase),
    fetchLibrary(supabase),
    fetchCopy(supabase, 'coach'),
  ]);
  return { ...base, library, coachCopy };
}
