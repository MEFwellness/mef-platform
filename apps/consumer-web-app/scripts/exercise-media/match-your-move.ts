#!/usr/bin/env npx tsx
/**
 * Phase 1 (both sides): pages through Your Move's ENTIRE catalog in browse
 * mode (includeVideos=false, so this never spends quota — see
 * lib/your-move/apiClient.ts's listExercises), then conservatively
 * matches every one of our ~2200 exercises (docs/exercise-media/
 * our-catalog-audit.json, from audit-our-catalog.ts) against it using
 * lib/your-move/matching.ts.
 *
 * Writes:
 *   - docs/exercise-media/match-report.json — the three full lists
 *     (confident / near_miss / unmatched) for review, per Phase 1's own
 *     "I will review the match list" requirement.
 *   - your_move_exercise_links rows for every confident match, via the
 *     service role client (bypasses RLS, same as every other one-off
 *     admin script in this repo).
 *
 * Usage: EXERCISE_API_KEY=... YMOVE_API_KEY=... \
 *   SEED_SUPABASE_URL=... SEED_SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/exercise-media/match-your-move.ts
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { YourMoveApiClient, YourMoveApiError, type YourMoveExercise } from '../../lib/your-move/apiClient';
import { matchExercise, type MatchCandidate } from '../../lib/your-move/matching';
import { upsertYourMoveLink } from '../../lib/your-move/links';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

const AUDIT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/our-catalog-audit.json');
const REPORT_PATH = path.resolve(__dirname, '../../../../docs/exercise-media/match-report.json');

type OurRow = {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
};

async function fetchAllYourMoveExercises(client: YourMoveApiClient): Promise<YourMoveExercise[]> {
  const all: YourMoveExercise[] = [];
  let page = 1;
  for (;;) {
    const result = await client.listExercises({ page, pageSize: 50 });
    all.push(...result.data);
    console.log(`Your Move browse: fetched ${all.length} (page ${page})`);
    if (result.data.length === 0) break;
    page += 1;
  }
  return all;
}

async function main() {
  if (!existsSync(AUDIT_PATH)) {
    throw new Error(`Run audit-our-catalog.ts first — missing ${AUDIT_PATH}`);
  }
  const { rows: ourRows } = JSON.parse(readFileSync(AUDIT_PATH, 'utf-8')) as { rows: OurRow[] };

  const yourMoveApiKey = requiredEnv('YMOVE_API_KEY');
  const yourMoveClient = new YourMoveApiClient(yourMoveApiKey);

  const supabase = createClient(
    requiredEnv('SEED_SUPABASE_URL'),
    requiredEnv('SEED_SUPABASE_SERVICE_ROLE_KEY')
  );

  const yourMoveExercises = await fetchAllYourMoveExercises(yourMoveClient);
  const candidates: MatchCandidate[] = yourMoveExercises.map((e) => ({
    id: e.id,
    title: e.title,
    muscleGroup: e.muscleGroup,
    secondaryMuscles: e.secondaryMuscles ?? [],
    hasVideo: e.hasVideo,
  }));

  const confident: { ourId: string; ourName: string; yourMoveId: string; yourMoveTitle: string; reasoning: string }[] =
    [];
  const nearMiss: { ourId: string; ourName: string; yourMoveTitle: string; reasoning: string }[] = [];
  const unmatched: { ourId: string; ourName: string; reasoning: string }[] = [];

  for (const row of ourRows) {
    const result = matchExercise(row.name, [...row.primaryMuscles, ...row.secondaryMuscles], candidates);
    if (result.status === 'confident') {
      confident.push({
        ourId: row.id,
        ourName: row.name,
        yourMoveId: result.candidate.id,
        yourMoveTitle: result.candidate.title,
        reasoning: result.reasoning,
      });
    } else if (result.status === 'near_miss') {
      nearMiss.push({
        ourId: row.id,
        ourName: row.name,
        yourMoveTitle: result.candidate.title,
        reasoning: result.reasoning,
      });
    } else {
      unmatched.push({ ourId: row.id, ourName: row.name, reasoning: result.reasoning });
    }
  }

  writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        yourMoveCatalogSize: yourMoveExercises.length,
        yourMoveCatalogWithVideo: candidates.filter((c) => c.hasVideo).length,
        ourCatalogSize: ourRows.length,
        counts: { confident: confident.length, nearMiss: nearMiss.length, unmatched: unmatched.length },
        confident,
        nearMiss,
        unmatched,
      },
      null,
      2
    )
  );

  console.log(
    `\nMatch report written to ${REPORT_PATH}\nconfident=${confident.length} nearMiss=${nearMiss.length} unmatched=${unmatched.length}`
  );

  console.log(`\nWriting ${confident.length} confident matches to your_move_exercise_links...`);
  let written = 0;
  for (const match of confident) {
    const ok = await upsertYourMoveLink(supabase, {
      provider: 'exercise_api_dev',
      externalId: match.ourId,
      yourMoveExerciseId: match.yourMoveId,
      matchReasoning: match.reasoning,
    });
    if (ok) written += 1;
  }
  console.log(`Wrote ${written}/${confident.length} links.`);
}

main().catch((err) => {
  if (err instanceof YourMoveApiError) {
    console.error(`Your Move API error [${err.code}]: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
