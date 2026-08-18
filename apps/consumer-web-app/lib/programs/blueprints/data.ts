/**
 * Reading named program blueprints — movement_programs,
 * movement_program_versions and program_blueprint_slots (migration 174).
 *
 * Same convention as every other data layer in this codebase: pure
 * functions taking a SupabaseClient, with RLS as the real authorization
 * boundary. Here that boundary is staff read and admin write, and there is
 * no member policy on any of these tables at all, so a member's session
 * calling any of these gets an empty result rather than a filtered one.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BlueprintStatus,
  BlueprintWithSlots,
  MovementProgram,
  MovementProgramVersion,
  ProgramBlueprintSlot,
} from '@mef/shared-types-contracts';

/** Slots in the order a session is walked: session A before B, then slot order within each. */
export function sortSlots(slots: ProgramBlueprintSlot[]): ProgramBlueprintSlot[] {
  return slots.slice().sort((a, b) => {
    if (a.session_designation !== b.session_designation) {
      return a.session_designation.localeCompare(b.session_designation);
    }
    return a.slot_order - b.slot_order;
  });
}

/** The distinct weekly session letters this blueprint has, in order. */
export function sessionDesignationsOf(slots: ProgramBlueprintSlot[]): string[] {
  return Array.from(new Set(slots.map((s) => s.session_designation))).sort();
}

/** The slots of one weekly session, in slot order. */
export function slotsForSession(
  slots: ProgramBlueprintSlot[],
  session: string
): ProgramBlueprintSlot[] {
  return sortSlots(slots.filter((s) => s.session_designation === session));
}

/**
 * The shortened session: the highest priority `count` slots of one weekly
 * session, back in walking order.
 *
 * Nothing calls this yet — readiness variants are a later prompt. It is
 * here because the ranks are real data from day one and the question "what
 * are the top five" should be answered by the same function everywhere the
 * moment anything asks it, rather than being re-derived per screen.
 */
export function shortenedSession(
  slots: ProgramBlueprintSlot[],
  session: string,
  count: number
): ProgramBlueprintSlot[] {
  const inSession = slotsForSession(slots, session);
  const kept = inSession
    .slice()
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .slice(0, Math.max(0, count));
  const keptIds = new Set(kept.map((s) => s.id));
  return inSession.filter((s) => keptIds.has(s.id));
}

async function hydrate(
  supabase: SupabaseClient,
  program: MovementProgram,
  version: MovementProgramVersion
): Promise<BlueprintWithSlots> {
  const { data: slots, error } = await supabase
    .from('program_blueprint_slots')
    .select('*')
    .eq('program_version_id', version.id);
  if (error) console.error('blueprints hydrate (slots) failed', error);
  return {
    ...version,
    program,
    slots: sortSlots((slots as ProgramBlueprintSlot[]) ?? []),
  };
}

export async function listBlueprintPrograms(
  supabase: SupabaseClient
): Promise<MovementProgram[]> {
  const { data, error } = await supabase
    .from('movement_programs')
    .select('*')
    .order('display_name', { ascending: true });
  if (error) {
    console.error('listBlueprintPrograms failed', error);
    return [];
  }
  return (data as MovementProgram[]) ?? [];
}

export async function listBlueprintVersions(
  supabase: SupabaseClient,
  programId: string
): Promise<MovementProgramVersion[]> {
  const { data, error } = await supabase
    .from('movement_program_versions')
    .select('*')
    .eq('program_id', programId)
    .order('version_number', { ascending: false });
  if (error) {
    console.error('listBlueprintVersions failed', error);
    return [];
  }
  return (data as MovementProgramVersion[]) ?? [];
}

export async function getBlueprintVersion(
  supabase: SupabaseClient,
  versionId: string
): Promise<BlueprintWithSlots | null> {
  const { data: version, error } = await supabase
    .from('movement_program_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();
  if (error || !version) {
    if (error) console.error('getBlueprintVersion failed', error);
    return null;
  }

  const { data: program, error: programError } = await supabase
    .from('movement_programs')
    .select('*')
    .eq('id', (version as MovementProgramVersion).program_id)
    .maybeSingle();
  if (programError || !program) {
    if (programError) console.error('getBlueprintVersion (program) failed', programError);
    return null;
  }

  return hydrate(supabase, program as MovementProgram, version as MovementProgramVersion);
}

/**
 * One named program's version by key. Defaults to the highest version
 * number in the given status, so "the approved Home Dumbbell Foundation"
 * is a single call and never accidentally an archived or draft one.
 */
export async function getBlueprintByKey(
  supabase: SupabaseClient,
  key: string,
  options: { status?: BlueprintStatus; versionNumber?: number } = {}
): Promise<BlueprintWithSlots | null> {
  const { data: program, error: programError } = await supabase
    .from('movement_programs')
    .select('*')
    .eq('key', key)
    .maybeSingle();
  if (programError || !program) {
    if (programError) console.error('getBlueprintByKey (program) failed', programError);
    return null;
  }

  let query = supabase
    .from('movement_program_versions')
    .select('*')
    .eq('program_id', (program as MovementProgram).id);
  if (options.status) query = query.eq('status', options.status);
  if (options.versionNumber) query = query.eq('version_number', options.versionNumber);

  const { data: versions, error: versionError } = await query
    .order('version_number', { ascending: false })
    .limit(1);
  if (versionError) {
    console.error('getBlueprintByKey (version) failed', versionError);
    return null;
  }
  const version = (versions as MovementProgramVersion[] | null)?.[0];
  if (!version) return null;

  return hydrate(supabase, program as MovementProgram, version);
}
