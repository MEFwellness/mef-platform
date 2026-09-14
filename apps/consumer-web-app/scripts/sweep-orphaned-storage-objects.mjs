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

/** Every object path in a bucket, walking one folder level (how these buckets are shaped). */
async function listBucket(supabase, bucket) {
  const paths = [];
  const { data: folders, error } = await supabase.storage.from(bucket).list('', { limit: 1000 });
  if (error) throw new Error(`listing ${bucket}: ${error.message}`);
  for (const folder of folders ?? []) {
    // A file at the root has an id; a folder does not.
    if (folder.id) {
      paths.push({ prefix: folder.name, path: folder.name });
      continue;
    }
    const { data: files, error: filesError } = await supabase.storage
      .from(bucket)
      .list(folder.name, { limit: 1000 });
    if (filesError) throw new Error(`listing ${bucket}/${folder.name}: ${filesError.message}`);
    for (const file of files ?? []) {
      paths.push({ prefix: folder.name, path: `${folder.name}/${file.name}` });
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
  for (const bucket of MEMBER_BUCKETS) {
    const objects = await listBucket(supabase, bucket);
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
      const { error } = await supabase.storage.from(bucket).remove(toRemove);
      if (error) throw new Error(`removing from ${bucket}: ${error.message}`);
      console.log(`  removed ${toRemove.length} from ${bucket}.`);
    }
  }

  if (!apply && orphans > 0) {
    console.log(`\n${orphans} orphaned objects. Re-run with --apply to remove them.`);
  } else if (orphans === 0) {
    console.log('\nNothing orphaned.');
  }
  if (skipped > 0) console.log(`${skipped} objects left alone: their paths are not account-keyed.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
