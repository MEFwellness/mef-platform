#!/usr/bin/env node
/**
 * REMOVE THE PHOTOS OF ACCOUNTS THAT NO LONGER EXIST.
 *
 * Migration 239 made deleting an account work and made that account's rows
 * go with it. Its uploaded files are the one thing SQL cannot reach.
 * storage.objects carries no foreign key to auth.users, so the files never
 * blocked a deletion; they were left behind. And they cannot be cleared by
 * a trigger, because storage.objects carries a BEFORE DELETE trigger of its
 * own, `protect_objects_delete`, which refuses any direct delete:
 *
 *     Direct deletion from storage tables is not allowed.
 *     Use the Storage API instead.
 *
 * That guard is right. The row is an index and the bytes live in the
 * storage backend, so deleting the row alone leaves a file nothing can
 * name. This script uses the Storage API, which removes both together.
 *
 * It decides from the data, never from a list. Both private buckets store
 * a member's uploads under a first path segment that is her own account
 * id, so an object whose leading segment is not the id of a live account
 * belongs to nobody. Anything whose leading segment is not a uuid at all is
 * left alone and reported, because that is somebody's deliberate naming
 * (the exercise-media bucket's `open-license/` prefix is the example) and
 * this script is not the place to guess about it.
 *
 * THE WALK GOES ALL THE WAY DOWN, and that is not a detail. These buckets
 * nest THREE deep, `<accountId>/<scanId>/<fileId>.jpg`, not two. A walk that
 * stopped after one folder level collected the middle `<accountId>/<scanId>`
 * FOLDERS and called them objects. The count came out right whenever a scan
 * folder held a single photo, so the report looked correct. But a folder key
 * names no object, and the Storage API answers a remove of a key that does
 * not exist with success and an empty list. The script would have printed
 * `removed 12` and removed nothing at all. So: only an entry carrying an
 * `id` is an object, a folder is recursed into, and every removal is checked
 * against what the API says it actually removed.
 *
 * It is idempotent, and it prints what it would do before it does it.
 *
 * Usage, against production:
 *
 *   PROD_SUPABASE_URL=https://<ref>.supabase.co \
 *   PROD_SERVICE_KEY_FILE=/path/to/service-key.txt \
 *   node apps/consumer-web-app/scripts/sweep-orphaned-storage-objects.mjs --apply
 *
 * Without --apply it only reports. The key is read from a FILE so it never
 * reaches a command line, matching every other live script in this repo.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/** The two buckets that hold member uploads, keyed by the member's own id. */
const MEMBER_BUCKETS = ['body-assessment-media', 'food-lens-media'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

function serviceKey() {
  const file = process.env.PROD_SERVICE_KEY_FILE;
  if (file) return readFileSync(file, 'utf8').trim();
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

const PAGE = 100;

/** One folder's entries, paged, because `list` caps what it will hand back at once. */
async function listFolder(supabase, bucket, folder) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`listing ${bucket}/${folder}: ${error.message}`);
    const page = data ?? [];
    entries.push(...page);
    if (page.length < PAGE) return entries;
  }
}

/**
 * Every OBJECT path in a bucket, at whatever depth it sits.
 * An entry with an `id` is an object; an entry without one is a folder and is
 * walked into. Never assume a depth: see the header.
 */
export async function listBucket(supabase, bucket, folder = '', depth = 0) {
  if (depth > 10) throw new Error(`${bucket}/${folder}: nested deeper than 10, refusing to walk`);
  const paths = [];
  for (const entry of await listFolder(supabase, bucket, folder)) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.id) {
      paths.push({ prefix: path.split('/')[0], path });
    } else {
      paths.push(...(await listBucket(supabase, bucket, path, depth + 1)));
    }
  }
  return paths;
}

async function liveAccountIds(supabase) {
  const ids = new Set();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listing accounts: ${error.message}`);
    for (const user of data.users) ids.add(user.id);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return ids;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const url = process.env.PROD_SUPABASE_URL ?? requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabase = createClient(url, serviceKey(), { auth: { persistSession: false } });

  const live = await liveAccountIds(supabase);
  console.log(`${live.size} live accounts.`);

  let orphans = 0;
  let skipped = 0;
  let scanned = 0;
  let removedTotal = 0;
  for (const bucket of MEMBER_BUCKETS) {
    const objects = await listBucket(supabase, bucket);
    scanned += objects.length;
    const toRemove = [];
    for (const object of objects) {
      if (!UUID.test(object.prefix)) {
        skipped += 1;
        console.log(`  SKIP  ${bucket}/${object.path} (leading segment is not an account id)`);
        continue;
      }
      if (live.has(object.prefix.toLowerCase())) continue;
      toRemove.push(object.path);
    }
    orphans += toRemove.length;
    console.log(
      `${bucket}: ${objects.length} objects, ${toRemove.length} belong to no live account.`
    );
    for (const path of toRemove) console.log(`  ORPHAN ${bucket}/${path}`);

    if (apply && toRemove.length > 0) {
      const { data, error } = await supabase.storage.from(bucket).remove(toRemove);
      if (error) throw new Error(`removing from ${bucket}: ${error.message}`);
      // A remove of a key that names no object succeeds and removes nothing,
      // so the count the API reports back is the only proof anything went.
      const removed = (data ?? []).map((row) => row.name);
      if (removed.length !== toRemove.length) {
        const missed = toRemove.filter((path) => !removed.includes(path));
        throw new Error(
          `removing from ${bucket}: asked for ${toRemove.length}, ` +
            `the API removed ${removed.length}. Untouched: ${missed.join(', ')}`
        );
      }
      removedTotal += removed.length;
      console.log(`  removed ${removed.length} from ${bucket}, confirmed by the API.`);
    }
  }

  if (!apply && orphans > 0) {
    console.log(`\n${orphans} orphaned objects. Re-run with --apply to remove them.`);
  } else if (orphans === 0) {
    console.log('\nNothing orphaned.');
  }
  if (skipped > 0) console.log(`${skipped} objects left alone: their paths are not account-keyed.`);
  console.log(
    `\nSCANNED ${scanned} objects, ORPHANED ${orphans}, REMOVED ${removedTotal}` +
      (apply ? '.' : ' (report only, nothing was touched).')
  );
}

// Only when RUN, not when a test imports `listBucket` to walk a fake bucket.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
