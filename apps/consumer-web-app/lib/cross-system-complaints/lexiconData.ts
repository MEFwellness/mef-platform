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
 * and would otherwise re-sort 339 rows per sentence.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
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
  const [phrases, modifiers, surfaces, contexts] = await Promise.all([
    supabase
      .from('cross_system_complaint_lexicon')
      .select('phrase, signal_slug, body_area_key, specificity')
      .eq('is_active', true),
    supabase
      .from('cross_system_complaint_modifiers')
      .select(
        'phrase, kind, side, body_area_key, context_key, frequency_key, frequency_label, frequency_numeric'
      )
      .eq('is_active', true),
    supabase
      .from('cross_system_complaint_surfaces')
      .select('surface_key, position, display_name, default_author_role')
      .order('position'),
    supabase
      .from('cross_system_complaint_contexts')
      .select('context_key, position, display_name')
      .order('position'),
  ]);

  const phraseRows = (phrases.data as PhraseRow[] | null) ?? [];
  const modifierRows = (modifiers.data as ModifierRow[] | null) ?? [];
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
