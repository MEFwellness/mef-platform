/**
 * The Relationship Library's reads and writes.
 *
 * EVERY WRITE GOES THROUGH THE COACH'S OWN SESSION, so migration 243's
 * policies decide. There is no service role path in this folder and there
 * must never be one: a relationship is a thing a coach wrote, and a write
 * that did not come from her session is a relationship nobody wrote.
 *
 * A VERSION IS WRITTEN ONCE. There is no update function for a version,
 * a component, a strength level or a consideration, and no update policy
 * for any of them either. `saveVersion` always appends the next version
 * number and then moves the head record's pointer, which is the only
 * update this feature ever performs on anything.
 *
 * THE POINTER MOVES LAST, ON PURPOSE. If the children fail to write, the
 * head still points at the last whole version rather than at a half
 * written one, so a broken save costs the edit rather than the pattern.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import type { SignalSide } from '@/lib/cross-system-signals/types';
import type { ResolvedRelationshipDraft } from './draft';
import type {
  RelationshipComponent,
  RelationshipComponentRole,
  RelationshipConsideration,
  RelationshipDetail,
  RelationshipHead,
  RelationshipRefKind,
  RelationshipStrengthLevel,
  RelationshipSummary,
  RelationshipVersion,
} from './types';

type HeadRow = {
  id: string;
  pattern_key: string;
  is_active: boolean;
  is_example: boolean;
  is_seeded: boolean;
  current_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  relationship_id: string;
  version_number: number;
  pattern_name: string;
  min_supporting_signals: number;
  possible_association_text: string | null;
  source_type_key: string;
  surfaces_on_complaint: boolean;
  evidence_notes: string | null;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
};

type ComponentRow = {
  id: string;
  version_id: string;
  position: number;
  role: string;
  ref_kind: string;
  ref_key: string;
  ref_label: string;
  side: string | null;
  value_key: string | null;
  value_label: string | null;
  min_value_numeric: number | string | null;
  source_key: string | null;
  source_question_ref: string | null;
  source_question_prompt: string | null;
  note: string | null;
};

type LevelRow = {
  version_id: string;
  level_key: string;
  position: number;
  display_label: string;
  min_supporting_signals: number;
  min_distinct_categories: number | null;
  min_related_signals: number | null;
};

type ConsiderationRow = {
  id: string;
  version_id: string;
  position: number;
  body: string;
};

const HEAD_COLUMNS =
  'id, pattern_key, is_active, is_example, is_seeded, current_version, created_by, created_at, updated_at';
const VERSION_COLUMNS =
  'id, relationship_id, version_number, pattern_name, min_supporting_signals, possible_association_text, source_type_key, surfaces_on_complaint, evidence_notes, change_summary, created_by, created_at';
const COMPONENT_COLUMNS =
  'id, version_id, position, role, ref_kind, ref_key, ref_label, side, value_key, value_label, min_value_numeric, source_key, source_question_ref, source_question_prompt, note';
const LEVEL_COLUMNS =
  'version_id, level_key, position, display_label, min_supporting_signals, min_distinct_categories, min_related_signals';
const CONSIDERATION_COLUMNS = 'id, version_id, position, body';

function headFromRow(row: HeadRow): RelationshipHead {
  return {
    id: row.id,
    patternKey: row.pattern_key,
    isActive: row.is_active,
    isExample: row.is_example,
    isSeeded: row.is_seeded,
    currentVersion: row.current_version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function componentFromRow(row: ComponentRow): RelationshipComponent {
  return {
    id: row.id,
    position: row.position,
    role: row.role as RelationshipComponentRole,
    refKind: row.ref_kind as RelationshipRefKind,
    refKey: row.ref_key,
    refLabel: row.ref_label,
    side: (row.side as SignalSide | null) ?? null,
    valueKey: row.value_key,
    valueLabel: row.value_label,
    // Postgres numeric arrives as a string through PostgREST. Parsed once,
    // here, so no caller has to remember it.
    minValueNumeric:
      row.min_value_numeric === null || row.min_value_numeric === undefined
        ? null
        : Number(row.min_value_numeric),
    sourceKey: row.source_key,
    sourceQuestionRef: row.source_question_ref,
    sourceQuestionPrompt: row.source_question_prompt,
    note: row.note,
  };
}

function levelFromRow(row: LevelRow): RelationshipStrengthLevel {
  return {
    levelKey: row.level_key,
    position: row.position,
    displayLabel: row.display_label,
    minSupportingSignals: row.min_supporting_signals,
    minDistinctCategories: row.min_distinct_categories,
    minRelatedSignals: row.min_related_signals,
  };
}

function considerationFromRow(row: ConsiderationRow): RelationshipConsideration {
  return { id: row.id, position: row.position, body: row.body };
}

/**
 * Hydrates version rows with their three child lists.
 *
 * THREE READS FOR ANY NUMBER OF VERSIONS, not three per version. The
 * library is small, and a version history of a dozen versions must not
 * cost thirty six round trips.
 */
async function hydrateVersions(
  supabase: SupabaseClient,
  versionRows: VersionRow[]
): Promise<RelationshipVersion[]> {
  if (versionRows.length === 0) return [];
  const ids = versionRows.map((row) => row.id);

  /*
    PAGED, AND THE REASON IS A REAL DEFECT THIS LIBRARY'S OWN GROWTH
    EXPOSED.

    PostgREST caps an unbounded select at a thousand rows and says nothing
    about it. While the library held nineteen definitions that was
    invisible. The Whole-Body Association Map is over two hundred, carrying
    2,511 components and 1,435 considerations, and this read is ordered by
    POSITION, so the cut fell across every entry at once: each one kept its
    first few components and lost the rest. A coach was shown a finding
    that had checked three areas when the entry named nine, and nothing
    errored. See lib/data/pagedSelect.ts.
  */
  const [components, levels, considerations] = await Promise.all([
    selectAllRows<ComponentRow>(() =>
      supabase
        .from('cross_system_relationship_components')
        .select(COMPONENT_COLUMNS)
        .in('version_id', ids)
        .order('version_id', { ascending: true })
        .order('position', { ascending: true })
    ),
    selectAllRows<LevelRow>(() =>
      supabase
        .from('cross_system_relationship_strength_levels')
        .select(LEVEL_COLUMNS)
        .in('version_id', ids)
        .order('version_id', { ascending: true })
        .order('position', { ascending: true })
    ),
    selectAllRows<ConsiderationRow>(() =>
      supabase
        .from('cross_system_relationship_considerations')
        .select(CONSIDERATION_COLUMNS)
        .in('version_id', ids)
        .order('version_id', { ascending: true })
        .order('position', { ascending: true })
    ),
  ]);

  if (!components.ok) console.error('relationship components read failed', components.error);
  if (!levels.ok) console.error('relationship strength levels read failed', levels.error);
  if (!considerations.ok) {
    console.error('relationship considerations read failed', considerations.error);
  }

  const byVersion = <T extends { version_id: string }>(rows: T[] | null): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows ?? []) {
      const list = map.get(row.version_id);
      if (list) list.push(row);
      else map.set(row.version_id, [row]);
    }
    return map;
  };

  const componentsByVersion = byVersion(components.rows);
  const levelsByVersion = byVersion(levels.rows);
  const considerationsByVersion = byVersion(considerations.rows);

  return versionRows.map((row) => ({
    id: row.id,
    relationshipId: row.relationship_id,
    versionNumber: row.version_number,
    patternName: row.pattern_name,
    minSupportingSignals: row.min_supporting_signals,
    possibleAssociationText: row.possible_association_text,
    sourceTypeKey: row.source_type_key,
    surfacesOnComplaint: row.surfaces_on_complaint,
    evidenceNotes: row.evidence_notes,
    changeSummary: row.change_summary,
    createdBy: row.created_by,
    createdAt: row.created_at,
    components: (componentsByVersion.get(row.id) ?? []).map(componentFromRow),
    strengthLevels: (levelsByVersion.get(row.id) ?? []).map(levelFromRow),
    considerations: (considerationsByVersion.get(row.id) ?? []).map(considerationFromRow),
  }));
}

/**
 * Every relationship with the version that is current, which is what the
 * list view draws.
 *
 * A head whose current version cannot be read is DROPPED rather than
 * shown half empty, because a row on that list with no name and no
 * composition is a row a coach cannot act on.
 */
export async function listRelationships(
  supabase: SupabaseClient
): Promise<{ ok: boolean; summaries: RelationshipSummary[] }> {
  const heads = await selectAllRows<HeadRow>(() =>
    supabase
      .from('cross_system_relationships')
      .select(HEAD_COLUMNS)
      .order('created_at', { ascending: true })
      .order('pattern_key', { ascending: true })
  );
  if (!heads.ok) {
    console.error('listRelationships failed', heads.error);
    return { ok: false, summaries: [] };
  }
  const headRows = heads.rows;
  if (headRows.length === 0) return { ok: true, summaries: [] };

  /*
    PAGED, BEFORE IT NEEDS TO BE. This returns every version of every
    relationship: 240 today because each one has been written once, and
    1,200 the day the library has been edited five times over. The
    components read below was in exactly this state a week ago, and it was
    already over the cap by the time anybody noticed.
  */
  const versions = await selectAllRows<VersionRow>(() =>
    supabase
      .from('cross_system_relationship_versions')
      .select(VERSION_COLUMNS)
      .in(
        'relationship_id',
        headRows.map((row) => row.id)
      )
      .order('relationship_id', { ascending: true })
      .order('version_number', { ascending: true })
  );
  if (!versions.ok) {
    console.error('listRelationships versions failed', versions.error);
    return { ok: false, summaries: [] };
  }
  const versionRows = versions.rows.filter((row) => {
    const head = headRows.find((candidate) => candidate.id === row.relationship_id);
    return head ? head.current_version === row.version_number : false;
  });

  const hydrated = await hydrateVersions(supabase, versionRows);
  const byRelationship = new Map(hydrated.map((version) => [version.relationshipId, version]));

  const summaries: RelationshipSummary[] = [];
  for (const row of headRows) {
    const current = byRelationship.get(row.id);
    if (!current) continue;
    summaries.push({ head: headFromRow(row), current });
  }
  return { ok: true, summaries };
}

/** One relationship, its current version and its whole trail, newest first. */
export async function getRelationship(
  supabase: SupabaseClient,
  relationshipId: string
): Promise<RelationshipDetail | null> {
  const head = await supabase
    .from('cross_system_relationships')
    .select(HEAD_COLUMNS)
    .eq('id', relationshipId)
    .maybeSingle();
  if (head.error) {
    console.error('getRelationship failed', head.error);
    return null;
  }
  if (!head.data) return null;
  const headRow = head.data as unknown as HeadRow;

  // Paged for the same reason the list read is: this returns the WHOLE
  // trail of one definition, which grows by one every time she edits it.
  const versions = await selectAllRows<VersionRow>(() =>
    supabase
      .from('cross_system_relationship_versions')
      .select(VERSION_COLUMNS)
      .eq('relationship_id', relationshipId)
      .order('version_number', { ascending: false })
  );
  if (!versions.ok) {
    console.error('getRelationship versions failed', versions.error);
    return null;
  }
  const hydrated = await hydrateVersions(
    supabase,
    versions.rows
  );
  const current = hydrated.find((version) => version.versionNumber === headRow.current_version);
  if (!current) return null;

  return { head: headFromRow(headRow), current, history: hydrated };
}

/**
 * Every pattern key already in use, so a new one can be made distinct.
 *
 * PAGED, AND THIS ONE MATTERS MORE THAN ITS SIZE SUGGESTS. A truncated
 * read here does not lose a row a coach can see, it loses the knowledge
 * that a key is taken, and the next duplicate is refused by the unique
 * index with an error she did not cause and cannot read.
 */
export async function listPatternKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { ok, rows, error } = await selectAllRows<{ pattern_key: string }>(() =>
    supabase
      .from('cross_system_relationships')
      .select('pattern_key')
      .order('pattern_key', { ascending: true })
  );
  if (!ok) {
    console.error('listPatternKeys failed', error);
    return new Set();
  }
  return new Set(rows.map((row) => row.pattern_key));
}

async function writeVersionChildren(
  supabase: SupabaseClient,
  versionId: string,
  draft: ResolvedRelationshipDraft
): Promise<boolean> {
  if (draft.components.length > 0) {
    const { error } = await supabase.from('cross_system_relationship_components').insert(
      draft.components.map((component) => ({
        version_id: versionId,
        position: component.position,
        role: component.role,
        ref_kind: component.refKind,
        ref_key: component.refKey,
        ref_label: component.refLabel,
        side: component.side,
        value_key: component.valueKey,
        value_label: component.valueLabel,
        min_value_numeric: component.minValueNumeric,
        source_key: component.sourceKey,
        source_question_ref: component.sourceQuestionRef,
        source_question_prompt: component.sourceQuestionPrompt,
        note: component.note,
      }))
    );
    if (error) {
      console.error('relationship components write failed', error);
      return false;
    }
  }

  if (draft.strengthLevels.length > 0) {
    const { error } = await supabase.from('cross_system_relationship_strength_levels').insert(
      draft.strengthLevels.map((level) => ({
        version_id: versionId,
        level_key: level.levelKey,
        position: level.position,
        display_label: level.displayLabel,
        min_supporting_signals: level.minSupportingSignals,
        min_distinct_categories: level.minDistinctCategories,
        min_related_signals: level.minRelatedSignals,
      }))
    );
    if (error) {
      console.error('relationship strength levels write failed', error);
      return false;
    }
  }

  if (draft.considerations.length > 0) {
    const { error } = await supabase.from('cross_system_relationship_considerations').insert(
      draft.considerations.map((body, index) => ({
        version_id: versionId,
        position: index + 1,
        body,
      }))
    );
    if (error) {
      console.error('relationship considerations write failed', error);
      return false;
    }
  }

  return true;
}

export type SaveVersionResult =
  | { ok: true; relationshipId: string; versionNumber: number }
  | { ok: false; error: string };

/** A brand new relationship, at version 1, inactive until the coach turns it on. */
export async function createRelationship(
  supabase: SupabaseClient,
  input: { patternKey: string; coachId: string; draft: ResolvedRelationshipDraft }
): Promise<SaveVersionResult> {
  const head = await supabase
    .from('cross_system_relationships')
    .insert({
      pattern_key: input.patternKey,
      is_active: false,
      is_example: false,
      current_version: 1,
      created_by: input.coachId,
    })
    .select('id')
    .maybeSingle();
  if (head.error || !head.data) {
    console.error('createRelationship failed', head.error);
    return { ok: false, error: 'Could not save that pattern. Please try again.' };
  }
  const relationshipId = (head.data as { id: string }).id;

  const written = await writeVersion(supabase, {
    relationshipId,
    versionNumber: 1,
    coachId: input.coachId,
    draft: input.draft,
  });
  if (!written.ok) return written;
  return { ok: true, relationshipId, versionNumber: 1 };
}

/**
 * The next version of an existing relationship.
 *
 * THE NUMBER IS READ, NOT SENT. Whatever the client thinks the current
 * version is, the next one is one past what the head record says, so two
 * tabs open on the same pattern cannot both write version 4.
 */
export async function saveNewVersion(
  supabase: SupabaseClient,
  input: { relationshipId: string; coachId: string; draft: ResolvedRelationshipDraft }
): Promise<SaveVersionResult> {
  const head = await supabase
    .from('cross_system_relationships')
    .select('id, current_version')
    .eq('id', input.relationshipId)
    .maybeSingle();
  if (head.error || !head.data) {
    console.error('saveNewVersion head read failed', head.error);
    return { ok: false, error: 'That pattern is no longer in the library.' };
  }
  const versionNumber = (head.data as { current_version: number }).current_version + 1;

  const written = await writeVersion(supabase, {
    relationshipId: input.relationshipId,
    versionNumber,
    coachId: input.coachId,
    draft: input.draft,
  });
  if (!written.ok) return written;
  return { ok: true, relationshipId: input.relationshipId, versionNumber };
}

/** One version row, its children, and then the head's pointer. In that order. */
async function writeVersion(
  supabase: SupabaseClient,
  input: {
    relationshipId: string;
    versionNumber: number;
    coachId: string;
    draft: ResolvedRelationshipDraft;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const version = await supabase
    .from('cross_system_relationship_versions')
    .insert({
      relationship_id: input.relationshipId,
      version_number: input.versionNumber,
      pattern_name: input.draft.patternName,
      min_supporting_signals: input.draft.minSupportingSignals,
      possible_association_text: input.draft.possibleAssociationText,
      // CARRIED FORWARD, NOT DEFAULTED. An edit writes a NEW row, so a
      // field the editor does not post would silently fall back to the
      // column default and a seeded map entry would stop being one the
      // first time the coach reworded it. Both are resolved on the server
      // from the version being replaced.
      source_type_key: input.draft.sourceTypeKey,
      surfaces_on_complaint: input.draft.surfacesOnComplaint,
      evidence_notes: input.draft.evidenceNotes,
      change_summary: input.versionNumber === 1 ? null : input.draft.changeSummary,
      created_by: input.coachId,
    })
    .select('id')
    .maybeSingle();
  if (version.error || !version.data) {
    console.error('relationship version write failed', version.error);
    return { ok: false, error: 'Could not save that version. Please try again.' };
  }
  const versionId = (version.data as { id: string }).id;

  const children = await writeVersionChildren(supabase, versionId, input.draft);
  if (!children) {
    return { ok: false, error: 'Could not save that version. Please try again.' };
  }

  const pointer = await supabase
    .from('cross_system_relationships')
    .update({ current_version: input.versionNumber, updated_at: new Date().toISOString() })
    .eq('id', input.relationshipId);
  if (pointer.error) {
    console.error('relationship pointer move failed', pointer.error);
    return { ok: false, error: 'Could not save that version. Please try again.' };
  }
  return { ok: true };
}

/** The active toggle. The only other thing about a relationship that moves. */
export async function setRelationshipActive(
  supabase: SupabaseClient,
  relationshipId: string,
  isActive: boolean
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_relationships')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', relationshipId);
  if (error) {
    console.error('setRelationshipActive failed', error);
    return false;
  }
  return true;
}

/** Removes a relationship and, by cascade, every version under it. */
export async function deleteRelationship(
  supabase: SupabaseClient,
  relationshipId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('cross_system_relationships')
    .delete()
    .eq('id', relationshipId);
  if (error) {
    console.error('deleteRelationship failed', error);
    return false;
  }
  return true;
}
