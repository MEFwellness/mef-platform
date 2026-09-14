/**
 * THE SWEEP HAS TO REACH THE FILE, NOT THE FOLDER ABOVE IT.
 *
 * Production stores a member's uploads three deep,
 * `<accountId>/<scanId>/<fileId>.jpg`. A walk that stopped after one folder
 * level collected the middle `<accountId>/<scanId>` folders and reported them
 * as objects. The COUNT looked right whenever a scan folder held one photo,
 * which is every folder on production today, so the report read as correct.
 *
 * It was not correct, and the consequence is not cosmetic: a folder key names
 * no object, and the Storage API answers a remove of a key that does not
 * exist with success and an empty list. The sweep would have announced a
 * removal it never performed.
 */
import { describe, expect, it } from 'vitest';
import { listBucket } from '../scripts/sweep-orphaned-storage-objects.mjs';
import type { BucketLister } from '../scripts/sweep-orphaned-storage-objects.mjs';

const MEMBER = '847cf143-963b-4bbd-ad0c-9f2383972d11';
const SCAN_A = '297b5de7-a7d1-4f33-b455-e8b1c72c2ff0';
const SCAN_B = '157b56c0-cc19-427b-b1f4-39327f466059';

/** A stand-in for the Storage API, shaped the way it really answers: a folder
 *  comes back with `id: null`, an object comes back carrying an id. */
function fakeStorage(objectPaths: string[]) {
  const calls: string[] = [];
  return {
    calls,
    storage: {
      from() {
        return {
          async list(folder: string, { limit, offset = 0 }: { limit: number; offset?: number }) {
            calls.push(folder);
            const prefix = folder ? `${folder}/` : '';
            const names = new Map<string, boolean>();
            for (const path of objectPaths) {
              if (!path.startsWith(prefix)) continue;
              const rest = path.slice(prefix.length);
              const head = rest.split('/')[0] as string;
              // true when this entry is the object itself, false when a folder
              names.set(head, !rest.includes('/'));
            }
            const entries = [...names.entries()]
              .sort(([a], [b]) => (a < b ? -1 : 1))
              .map(([name, isObject]) => ({ name, id: isObject ? `id-${name}` : null }));
            return { data: entries.slice(offset, offset + limit), error: null };
          },
        };
      },
    },
  };
}

describe('the orphan sweep walks a bucket to the bottom', () => {
  it('reports the FILE at three levels deep, never the folder above it', async () => {
    const paths = [
      `${MEMBER}/${SCAN_A}/399a36cc-db32-4102-b2c1-8657523266ce.jpg`,
      `${MEMBER}/${SCAN_B}/82980cc7-3fc4-4033-9519-66696e87beff.jpg`,
    ];
    const fake = fakeStorage(paths);

    const found = await listBucket(fake as unknown as BucketLister, 'food-lens-media');

    expect(found.map((f) => f.path).sort()).toEqual([...paths].sort());
    // The bug: a one-level walk returned these, and a remove of one is a no-op.
    expect(found.map((f) => f.path)).not.toContain(`${MEMBER}/${SCAN_A}`);
  });

  it('keeps the leading segment as the account id however deep the object sits', async () => {
    const fake = fakeStorage([`${MEMBER}/${SCAN_A}/a/b/c/photo.jpg`]);

    const found = await listBucket(fake as unknown as BucketLister, 'food-lens-media');

    expect(found).toHaveLength(1);
    expect(found[0]?.prefix).toBe(MEMBER);
  });

  it('counts every file when one scan folder holds several, which a one-level walk could not', async () => {
    const paths = [
      `${MEMBER}/${SCAN_A}/one.jpg`,
      `${MEMBER}/${SCAN_A}/two.jpg`,
      `${MEMBER}/${SCAN_A}/three.jpg`,
    ];
    const fake = fakeStorage(paths);

    const found = await listBucket(fake as unknown as BucketLister, 'body-assessment-media');

    expect(found.map((f) => f.path).sort()).toEqual([...paths].sort());
  });

  it('still finds an object sitting at the root of a bucket', async () => {
    const fake = fakeStorage(['stray.jpg']);

    const found = await listBucket(fake as unknown as BucketLister, 'food-lens-media');

    expect(found).toEqual([{ prefix: 'stray.jpg', path: 'stray.jpg' }]);
  });

  it('pages past the list limit instead of stopping at the first page', async () => {
    const paths = Array.from(
      { length: 250 },
      (_, i) => `${MEMBER}/${SCAN_A}/photo-${String(i).padStart(3, '0')}.jpg`
    );
    const fake = fakeStorage(paths);

    const found = await listBucket(fake as unknown as BucketLister, 'food-lens-media');

    expect(found).toHaveLength(250);
  });

  it('refuses to walk forever if a bucket nests without end', async () => {
    const endless = {
      storage: {
        from() {
          return {
            async list(folder: string) {
              return { data: [{ name: 'down', id: null }], error: null, folder };
            },
          };
        },
      },
    };

    await expect(listBucket(endless as unknown as BucketLister, 'food-lens-media')).rejects.toThrow(
      /deeper than 10/
    );
  });
});
