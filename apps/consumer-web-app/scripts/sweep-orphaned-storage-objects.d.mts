/**
 * Types for the one export the orphan sweep shares with its test.
 * The script itself is a CLI and stays plain `.mjs`; only the bucket walk is
 * imported, so only the bucket walk is described here.
 */

/** What `listBucket` hands back: a real object, and the account id it sits under. */
export interface StorageObjectPath {
  /** The leading path segment, which for a member bucket is her account id. */
  prefix: string;
  /** The object's full path, at whatever depth it sits. */
  path: string;
}

/** The slice of a Supabase client the walk touches. */
export interface BucketLister {
  storage: {
    from(bucket: string): {
      list(
        folder: string,
        options: { limit: number; offset?: number }
      ): Promise<{
        data: { name: string; id: string | null }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

export function listBucket(
  supabase: BucketLister,
  bucket: string,
  folder?: string,
  depth?: number
): Promise<StorageObjectPath[]>;
