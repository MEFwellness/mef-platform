/**
 * The lexicon, loaded once per pass.
 *
 * WHY ONE LOAD AND NOT ONE PER COMPLAINT. A check-in can carry two free
 * text fields and a backfill walks hundreds of them, and the classifier is
 * pure precisely so the rows can be read once and handed in. Same shape and
 * same reason as lib/cross-system-signals/contentData.ts's
 * `loadSignalLibrary`.
 *
 * ORDERING IS DONE HERE, ONCE. The matcher depends on longest-phrase-first
 * and would otherwise re-sort seventeen hundred rows per sentence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllRows } from '@/lib/data/pagedSelect';
import { orderPhrases } from './classify';
import type {
  ComplaintContext,
  ComplaintLexicon,
  ComplaintModifier,
  ComplaintPhrase,
  ComplaintSurface,
} from './types';
import type { SignalSide } from '@/lib/cross-system-signals/types';

type PhraseRow = {
  phrase: string;
  signal_slug: string;
  body_area_key: string | null;
  specificity: number;
};

type ModifierRow = {
  phrase: string;
  kind: string;
  side: string | null;
  body_area_key: string | null;
  context_key: string | null;
  frequency_key: string | null;
  frequency_label: string | null;
  frequency_numeric: number | null;
};

type SurfaceRow = {
  surface_key: string;
  position: number;
  display_name: string;
  default_author_role: string;
};

type ContextRow = { context_key: string; position: number; display_name: string };

export async function loadComplaintLexicon(
  supabase: SupabaseClient
): Promise<ComplaintLexicon> {
  /*
    THE PHRASES ARE PAGED, and that is not a precaution.

    PostgREST caps an unbounded select at a thousand rows and reports
    success. The lexicon holds over seventeen hundred, so this read was
    silently losing seven hundred of them: a third of everything a member
    can say had stopped being understood, with no error anywhere. See
    lib/data/pagedSelect.ts for what found it.

    The modifiers are paged for the same reason even though they are under
    the cap today, because "under the cap today" is exactly the state the
    phrases were in last week.
  */
  const [phrases, modifiers, surfaces, contexts] = await Promise.all([
    selectAllRows<PhraseRow>(() =>
      supabase
        .from('cross_system_complaint_lexicon')
        .select('phrase, signal_slug, body_area_key, specificity')
        .eq('is_active', true)
        .order('phrase', { ascending: true })
        .order('signal_slug', { ascending: true })
    ),
    selectAllRows<ModifierRow>(() =>
      supabase
        .from('cross_system_complaint_modifiers')
        .select(
          'phrase, kind, side, body_area_key, context_key, frequency_key, frequency_label, frequency_numeric'
        )
        .eq('is_active', true)
        .order('phrase', { ascending: true })
        .order('kind', { ascending: true })
    ),
    supabase
      .from('cross_system_complaint_surfaces')
      .select('surface_key, position, display_name, default_author_role')
      .order('position'),
    supabase
      .from('cross_system_complaint_contexts')
      .select('context_key, position, display_name')
      .order('position'),
  ]);

  if (!phrases.ok) console.error('complaint lexicon read failed', phrases.error);
  if (!modifiers.ok) console.error('complaint modifiers read failed', modifiers.error);

  const phraseRows = phrases.rows;
  const modifierRows = modifiers.rows;
  const surfaceRows = (surfaces.data as SurfaceRow[] | null) ?? [];
  const contextRows = (contexts.data as ContextRow[] | null) ?? [];

  const mapped: ComplaintPhrase[] = phraseRows.map((row) => ({
    phrase: row.phrase,
    signalSlug: row.signal_slug,
    bodyAreaKey: row.body_area_key,
    specificity: row.specificity,
  }));

  return {
    phrases: orderPhrases(mapped),
    modifiers: modifierRows.map(
      (row): ComplaintModifier => ({
        phrase: row.phrase,
        kind: row.kind as ComplaintModifier['kind'],
        side: (row.side as SignalSide | null) ?? null,
        bodyAreaKey: row.body_area_key,
        contextKey: row.context_key,
        frequencyKey: row.frequency_key,
        frequencyLabel: row.frequency_label,
        frequencyNumeric: row.frequency_numeric,
      })
    ),
    surfaces: new Map(
      surfaceRows.map((row): [string, ComplaintSurface] => [
        row.surface_key,
        {
          surfaceKey: row.surface_key,
          position: row.position,
          displayName: row.display_name,
          defaultAuthorRole: row.default_author_role as 'member' | 'coach',
        },
      ])
    ),
    contexts: new Map(
      contextRows.map((row): [string, ComplaintContext] => [
        row.context_key,
        {
          contextKey: row.context_key,
          position: row.position,
          displayName: row.display_name,
        },
      ])
    ),
  };
}
