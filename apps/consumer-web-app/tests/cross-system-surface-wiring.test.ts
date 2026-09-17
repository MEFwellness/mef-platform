/**
 * EVERY SURFACE ROOT LISTENS ON, AND THE ONE PIPELINE THEY ALL GO THROUGH.
 *
 * WHY THIS IS A SOURCE GUARD RATHER THAN A BEHAVIOUR TEST. The thing that
 * can go wrong here is not a wrong answer, it is a SECOND ANSWER: a surface
 * that grows its own keyword matcher, its own signal writer or its own
 * copy of the best effort wrapper. None of those is visible in an output,
 * and all of them are visible in the source. So this file reads the call
 * sites.
 *
 * THE THREE RULES IT HOLDS, all of them from the brief:
 *   one shared pipeline, and no per surface classifier;
 *   classification never blocks, delays or fails a member's submission;
 *   every surface records itself on the rows it produces.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  SURFACE_ASSESSMENT_FREE_TEXT,
  SURFACE_CLIENT_COMMENT,
  SURFACE_COACH_NOTE,
  SURFACE_COACH_OBSERVATION,
  SURFACE_CONCERN_FLAG,
  SURFACE_DAILY_CHECKIN_CONCERN,
  SURFACE_DAILY_CHECKIN_DISCOMFORT,
  SURFACE_DAILY_CHECKIN_NOTES,
  SURFACE_EVENING_REFLECTION,
  UNWIRED_COMPLAINT_SURFACES,
  WIRED_COMPLAINT_SURFACES,
} from '@/lib/cross-system-complaints/constants';

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

/**
 * The call sites, one per surface, named one by one so a new surface is a
 * deliberate addition here and cannot arrive unasserted.
 */
const CALL_SITES: Array<{ file: string; surfaces: string[]; author: 'member' | 'coach' }> = [
  {
    file: 'app/actions/checkin.ts',
    surfaces: [
      SURFACE_DAILY_CHECKIN_NOTES,
      SURFACE_DAILY_CHECKIN_CONCERN,
      SURFACE_DAILY_CHECKIN_DISCOMFORT,
    ],
    author: 'member',
  },
  { file: 'app/actions/eveningReflection.ts', surfaces: [SURFACE_EVENING_REFLECTION], author: 'member' },
  { file: 'app/actions/events.ts', surfaces: [SURFACE_CONCERN_FLAG], author: 'member' },
  { file: 'app/actions/conversation-coach.ts', surfaces: [SURFACE_CLIENT_COMMENT], author: 'member' },
  { file: 'app/actions/healthIntake.ts', surfaces: [SURFACE_ASSESSMENT_FREE_TEXT], author: 'member' },
  { file: 'app/actions/coach.ts', surfaces: [SURFACE_COACH_NOTE], author: 'coach' },
  { file: 'app/actions/crossSystemSignals.ts', surfaces: [SURFACE_COACH_OBSERVATION], author: 'coach' },
];

describe('every wired surface reaches the one shared pipeline', () => {
  it('names nine surfaces, and the call sites cover all nine', () => {
    expect(WIRED_COMPLAINT_SURFACES.length).toBe(9);
    const covered = CALL_SITES.flatMap((site) => site.surfaces).sort();
    expect(covered).toEqual([...WIRED_COMPLAINT_SURFACES].sort());
  });

  it.each(CALL_SITES.map((site) => [site.file, site] as const))(
    '%s calls hearComplaints and names its surfaces',
    (_file, site) => {
      const source = read(site.file);
      expect(source, site.file).toContain("from '@/lib/cross-system-complaints/service'");
      expect(source, site.file).toContain('hearComplaints(');
      for (const surface of site.surfaces) {
        // The constant, not the string, so a rename cannot silently unwire
        // a surface while leaving a literal behind that still reads right.
        const constant = Object.entries({
          SURFACE_DAILY_CHECKIN_NOTES,
          SURFACE_DAILY_CHECKIN_CONCERN,
          SURFACE_DAILY_CHECKIN_DISCOMFORT,
          SURFACE_EVENING_REFLECTION,
          SURFACE_CONCERN_FLAG,
          SURFACE_CLIENT_COMMENT,
          SURFACE_ASSESSMENT_FREE_TEXT,
          SURFACE_COACH_NOTE,
          SURFACE_COACH_OBSERVATION,
        }).find(([, value]) => value === surface)![0];
        expect(source, `${site.file} names ${constant}`).toContain(constant);
      }
    }
  );

  it('a coach surface says so, and a member surface says so', () => {
    for (const site of CALL_SITES) {
      const source = read(site.file);
      expect(source, site.file).toContain(`authorRole: '${site.author}'`);
    }
  });

  it('the two coach surfaces pass the coach through as the author', () => {
    for (const file of ['app/actions/coach.ts', 'app/actions/crossSystemSignals.ts']) {
      expect(read(file), file).toContain('authoredBy: user.id');
    }
  });

  it('every surface the code names is a row the database really holds', () => {
    const sql = [
      '00000000000247_cross_system_complaint_lexicon_seed.sql',
      '00000000000251_cross_system_vocabulary_expansion.sql',
    ]
      .map((file) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'))
      .join('\n');
    for (const surface of WIRED_COMPLAINT_SURFACES) {
      expect(sql, surface).toContain(`'${surface}'`);
    }
    for (const surface of Object.keys(UNWIRED_COMPLAINT_SURFACES)) {
      expect(sql, surface).toContain(`'${surface}'`);
    }
  });

  it('every registered surface is either wired or has a reason written down', () => {
    // Fourteen registered across the two migrations. Nine are wired and
    // five are not, and each of the five says why in one sentence.
    const registered = new Set([
      ...WIRED_COMPLAINT_SURFACES,
      ...Object.keys(UNWIRED_COMPLAINT_SURFACES),
    ]);
    expect(registered.size).toBe(14);
    for (const [surface, reason] of Object.entries(UNWIRED_COMPLAINT_SURFACES)) {
      expect(reason.length, surface).toBeGreaterThan(20);
      // SAY ONLY WHAT IS TRUE TODAY: no undated promise anywhere in it.
      expect(reason.toLowerCase(), surface).not.toContain('coming soon');
      expect(reason.toLowerCase(), surface).not.toContain('will be');
    }
  });
});

describe('the one wired surface that no screen can reach, recorded rather than hidden', () => {
  /**
   * WHY THIS IS A TEST AND NOT A COMMENT. The mid-day concern flag is
   * wired: its action calls the shared pipeline, and it works. Its
   * COMPONENT is imported by nothing, so a member cannot reach it, and the
   * wiring therefore does nothing today. A build that reported nine live
   * surfaces without saying so would be reporting something that is not
   * true, and the next person to look would have to rediscover it.
   *
   * This fails the day somebody mounts the component, which is the right
   * time to come back and delete it.
   */
  it('the ConcernFlag component still exists and still carries its text box', () => {
    const source = read('components/checkin/ConcernFlag.tsx');
    expect(source).toContain('flagConcern');
    expect(source).toContain('<textarea');
  });

  it('and nothing imports it, which is why the surface is unreachable', () => {
    const importers: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const relative = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(relative);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (relative.endsWith('ConcernFlag.tsx')) continue;
        if (read(relative).includes('ConcernFlag')) importers.push(relative);
      }
    };
    walk('app');
    walk('components');
    expect(
      importers,
      `ConcernFlag is mounted again in ${importers.join(', ')}. The surface is reachable now, so this case and the note in lib/cross-system-complaints/constants.ts should both go.`
    ).toHaveLength(0);
  });

  it('the action behind it is wired all the same, so mounting it is all that is left', () => {
    const source = read('app/actions/events.ts');
    expect(source).toContain('SURFACE_CONCERN_FLAG');
    expect(source).toContain('hearComplaints(');
  });
});

describe('there is no second Signals system, classifier or matching engine', () => {
  it('only one file classifies free text', () => {
    // Every call site imports the service, and only the service imports the
    // classifier. A surface that grew its own would show up here.
    const importers: string[] = [];
    for (const site of CALL_SITES) {
      const source = read(site.file);
      if (source.includes("cross-system-complaints/classify")) importers.push(site.file);
    }
    expect(importers, importers.join(', ')).toHaveLength(0);
  });

  it('only the shared service writes a complaint report or its signals', () => {
    for (const site of CALL_SITES) {
      const source = read(site.file);
      expect(source, site.file).not.toContain('cross_system_complaint_reports');
      expect(source, site.file).not.toContain('cross_system_complaint_classifications');
      expect(source, site.file).not.toContain('signalDraftsFor');
    }
  });

  it('the pipeline writes signals through the one insert every adapter uses', () => {
    const service = read('lib/cross-system-complaints/service.ts');
    expect(service).toContain("from '../cross-system-signals/data'");
    expect(service).toContain('insertSignals');
  });

  it('nothing outside the complaints folder builds a second lexicon loader', () => {
    const offenders: string[] = [];
    for (const site of CALL_SITES) {
      if (read(site.file).includes('loadComplaintLexicon')) offenders.push(site.file);
    }
    expect(offenders, offenders.join(', ')).toHaveLength(0);
  });
});

describe('classification can never block, delay or fail a submission', () => {
  it('the shared wrapper catches everything and returns a count nobody has to read', () => {
    const service = read('lib/cross-system-complaints/service.ts');
    expect(service).toContain('export async function hearComplaints');
    // It catches, and it skips empty text before it ever builds a client.
    expect(service).toContain('} catch (error) {');
    expect(service).toContain('rawText.trim().length === 0');
  });

  it('ingestComplaint itself never throws', () => {
    const service = read('lib/cross-system-complaints/service.ts');
    const body = service.slice(service.indexOf('export async function ingestComplaint'));
    expect(body).toContain('try {');
    expect(body).toContain('catch (error)');
    expect(body).toContain("console.error('ingestComplaint failed'");
  });

  it('no call site makes its own result depend on what Root heard', () => {
    // A surface that returned an error because classification failed would
    // have turned a missing phrase into a failed check-in.
    for (const site of CALL_SITES) {
      const source = read(site.file);
      const at = source.indexOf('hearComplaints(');
      expect(at, site.file).toBeGreaterThan(-1);
      // From the end of the call to the end of the function it sits in, so
      // the next function's own error handling is not read as this one's.
      const closes = source.indexOf(']);', at);
      expect(closes, site.file).toBeGreaterThan(at);
      const endOfFunction = source.indexOf('\n}', closes);
      const after = source.slice(closes, endOfFunction === -1 ? source.length : endOfFunction);
      expect(after, site.file).not.toContain('return { error:');
      expect(after, site.file).not.toMatch(/if \(!?\s*heard/);
    }
  });

  it('every member call site runs it AFTER the row it is about is saved', () => {
    // The check-in guards on the id the insert handed back, and every other
    // member surface reads an id off its own saved record.
    expect(read('app/actions/checkin.ts')).toMatch(
      /if \(typeof newCheckinId === 'string'\)[\s\S]{0,2000}hearComplaints\(/
    );
    expect(read('app/actions/eveningReflection.ts')).toContain('sourceRecordId: reflection.id');
    expect(read('app/actions/events.ts')).toContain('sourceRecordId: event.id');
    expect(read('app/actions/conversation-coach.ts')).toContain(
      'sourceRecordId: result.memberMessage.id'
    );
    expect(read('app/actions/healthIntake.ts')).toContain('sourceRecordId: record.id');
  });
});

describe('the writes stay batched, which matters more at this scale', () => {
  it('findings, their areas and their rows are batched for the whole cause, never per finding', () => {
    const data = read('lib/cross-system-root/data.ts');
    // The findings in one insert.
    expect(data).toContain("from('cross_system_root_findings')\n    .insert(findingRows)");
    // Areas, row links and survey triggers in batches of a FIXED SIZE, not
    // one per finding. A complaint's handful of areas is one batch, exactly
    // as before; a survey sitting reaching dozens of entries at once is a
    // few, rather than one request carrying thousands of rows.
    expect(data).toContain('for (const batch of chunks(areaRows))');
    expect(data).toContain('for (const batch of chunks(signalRows))');
    expect(data).toContain('for (const batch of chunks(triggerRows))');
    expect(data).toMatch(/export const FINDING_INSERT_CHUNK = \d{3,};/);
    const body = data.slice(data.indexOf('const surfaced ='), data.indexOf('export type StoredFinding'));
    // The only loops that await a write are those batch loops: none walks
    // the findings, the areas or the rows one at a time.
    const loops = [...body.matchAll(/for \(const (\w+) of ([^)]+)\)/g)];
    const awaitingLoops = loops.filter((loop) => {
      const after = body.slice(loop.index!, loop.index! + 500);
      return /await supabase/.test(after.slice(0, after.indexOf('\n    }') + 1 || 500));
    });
    for (const loop of awaitingLoops) {
      expect(loop[1], loop[0]).toBe('batch');
      expect(loop[2]).toMatch(/^chunks\(/);
    }
    expect(awaitingLoops.length).toBeGreaterThanOrEqual(3);
  });

  it('ids come back by a key the caller chose, never by insertion order', () => {
    const data = read('lib/cross-system-root/data.ts');
    expect(data).toContain("select('id, relationship_id')");
    expect(data).toContain("select('id, finding_id, position')");
    expect(data).toContain('PostgREST does not promise insertion order');
  });

  it('the classifier writes its own rows in one insert too', () => {
    const complaints = read('lib/cross-system-complaints/data.ts');
    expect(complaints).toContain(".upsert(rows, { onConflict: 'report_id, position'");
  });
});

describe('every resulting signal records which surface it came from', () => {
  it('the draft carries the surface and the insert writes it', () => {
    expect(read('lib/cross-system-complaints/data.ts')).toContain(
      'complaintSurfaceKey: report.surfaceKey'
    );
    expect(read('lib/cross-system-signals/data.ts')).toContain(
      'complaint_surface_key: draft.complaintSurfaceKey'
    );
  });

  it('the coach reads it back on the row', () => {
    expect(read('lib/cross-system-signals/coachView.ts')).toContain('complaintSurfaceLabel');
    expect(read('app/coach/clients/[id]/CrossSystemSignalsPanel.tsx')).toContain(
      'complaintSurfaceLabel'
    );
  });

  it('a finding prints the surface its complaint arrived on', () => {
    expect(read('lib/cross-system-root/view.ts')).toContain('complaintSurface: report.surfaceLabel');
    expect(read('app/coach/clients/[id]/RootNoticedEvidence.tsx')).toContain('complaintSurface');
  });
});
