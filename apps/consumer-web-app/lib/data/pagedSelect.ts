/**
 * READING A WHOLE TABLE WHEN THE WHOLE TABLE IS MORE THAN A THOUSAND ROWS.
 *
 * THE DEFECT THIS EXISTS TO CLOSE, and it is worth writing down because
 * nothing about it looks like a bug at the call site.
 *
 * PostgREST caps an unbounded select at `db-max-rows`, which this project's
 * database sets to 1,000. It does not error, it does not warn, and the
 * client reports success: it simply hands back the first thousand rows and
 * the caller carries on as though that were all of them.
 *
 * That was harmless while every table in this feature was small. The
 * Whole-Body Association Map made three of them large in one build:
 *
 *   cross_system_relationship_components     2,511 rows
 *   cross_system_complaint_lexicon           1,728 rows
 *   cross_system_relationship_considerations 1,435 rows
 *
 * The consequences were silent and severe. The component read is ordered by
 * position, so the cut fell across EVERY map entry at once: each one kept
 * its first few components and lost the rest, and a coach was shown a
 * finding that had checked three areas when the entry named nine. The
 * lexicon read lost seven hundred phrases, so a third of what a member can
 * say stopped being understood. Both were invisible in every test that ran
 * against a fixture, and both were found by counting the areas on a real
 * finding on production.
 *
 * SO A READ THAT WANTS EVERYTHING ASKS FOR EVERYTHING, IN PAGES. This walks
 * `range` until a page comes back short, which is the only answer that does
 * not depend on knowing the table's size in advance.
 *
 * IT IS NOT A LICENCE TO READ BIG TABLES. Use it for reference data a
 * feature genuinely needs in full: a vocabulary, a library of definitions,
 * a lexicon. A member's own rows are scoped by member and paginated by the
 * screen that shows them.
 */

/**
 * The shape this helper needs, and nothing more.
 *
 * WHY NOT PostgrestFilterBuilder. Its generics describe the schema, the
 * table and the row, and pinning all three here would make every call site
 * fight the types for no gain: what this function actually uses is `range`
 * and the awaited result. A structural type says exactly that.
 */
type RangeableQuery<E = QueryError> = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: E | null }>;
};

/**
 * What a failed request reports. PostgREST's own error satisfies it, and
 * naming it here is what lets a caller write `error.message` without every
 * call site restating the client's error type.
 */
export type QueryError = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

/**
 * One page. Deliberately under PostgREST's own cap rather than equal to it,
 * so a database that lowers `db-max-rows` still pages correctly instead of
 * silently returning short pages that look like the end.
 */
export const PAGE_SIZE = 500;

/**
 * The most rows one read may walk before it is refused. A read this large
 * belongs in SQL as an aggregate, not in a page loop, and reaching it is an
 * error the caller sees rather than a shorter list it cannot tell apart.
 */
export const MAX_ROWS = 200_000;

export type SelectAllRowsOptions = {
  /**
   * The most rows the caller wants, when that is more than one page.
   *
   * THE REASON THIS EXISTS. `.limit(2001)` looks like a bound and is not:
   * PostgREST caps it at 1,000 and reports success. The member analytics
   * timeline asked for 2,001 rows so that it could say "truncated" past
   * 2,000, was handed 1,000, and silently dropped every older day for a
   * member with 3,233 events in the range. A read that wants up to N rows,
   * where N can exceed the cap, pages up to N here.
   */
  limit?: number;
};

/**
 * Every row a query matches, in pages.
 *
 * `build` is called once per page and must apply the SAME filters and the
 * SAME order every time: a range is meaningless over a result whose order
 * changes between calls. Passing a builder factory rather than a builder is
 * what makes that structural, because a PostgREST builder is single use.
 */
export async function selectAllRows<T, E = QueryError>(
  build: () => RangeableQuery<E>,
  options: SelectAllRowsOptions = {}
): Promise<{ ok: boolean; rows: T[]; error: E | null }> {
  const rows: T[] = [];
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const width = Math.min(PAGE_SIZE, limit - from);
    if (width <= 0) return { ok: true, rows, error: null };
    const { data, error } = await build().range(from, from + width - 1);
    if (error) return { ok: false, rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    // A short page is the end. An exactly full last page costs one more
    // round trip that comes back empty, which is the correct trade for
    // never guessing.
    if (batch.length < width) return { ok: true, rows, error: null };
    /*
      A STOP, so a mistake cannot become an infinite loop. Nothing this
      helper is used for is anywhere near this size, and a read that hits it
      is a read that should not have been using this helper at all.
    */
    if (rows.length >= MAX_ROWS) {
      // Reported as a failure, never returned as though it were everything:
      // quietly stopping here would be this file's own silent cap.
      return { ok: false, rows, error: { message: `selectAllRows stopped at ${MAX_ROWS} rows` } as unknown as E };
    }
  }
}

/**
 * AND A LIST OF IDS THAT IS LONGER THAN A URL MAY BE.
 *
 * THE SECOND SILENT CEILING, found by running Root against a real local
 * database. An `.in('column', ids)` filter travels in the request URL, one
 * id after another. The Association Map's read named all 240 versions in one
 * filter, about nine thousand characters, and the local gateway refused it
 * with "URI too long". Production's gateway accepted that length, which is
 * why nothing had failed there yet, but it has a ceiling too, and a map
 * that keeps growing reaches it: every Root lookup would then read nothing
 * and quietly report nothing to review.
 *
 * So a long id list is sent in chunks, each chunk read in full through
 * `selectAllRows`, and the rows returned together. `build` receives the
 * chunk and must apply the same filters and the same order for every page.
 */
export const ID_CHUNK_SIZE = 100;

export async function selectAllRowsInChunks<T, E = QueryError, I extends string | number = string>(
  ids: readonly I[],
  build: (chunk: I[]) => RangeableQuery<E>
): Promise<{ ok: boolean; rows: T[]; error: E | null }> {
  const rows: T[] = [];
  // One `.in()` returns a row once however often its id is listed. Chunks
  // would return it once per chunk that lists it, so repeats go first.
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += ID_CHUNK_SIZE) {
    const chunk = unique.slice(index, index + ID_CHUNK_SIZE);
    const read = await selectAllRows<T, E>(() => build(chunk));
    if (!read.ok) return { ok: false, rows, error: read.error };
    rows.push(...read.rows);
  }
  return { ok: true, rows, error: null };
}

/**
 * AND A WRITE THAT CARRIES A LIST THAT CAN GROW.
 *
 * The same two ceilings apply to writes. An `.update(...).in('id', ids)` or
 * a `.delete().in('id', ids)` puts every id in the URL, and a bulk
 * `.insert(rows)` puts every row in one request body and one statement that
 * has to finish inside the role's statement timeout. So a write whose list
 * grows with members, with time or with authored content goes out in
 * chunks, and `write` receives each chunk.
 *
 * NOT ATOMIC ACROSS CHUNKS. One request is one statement, so a single write
 * is all-or-nothing and a chunked one is all-or-nothing per chunk. It stops
 * at the first failed chunk and reports it, with the rows the earlier
 * chunks returned. A write whose list is structurally small (the sections
 * of one template, the areas of one finding) is not a reason to give up
 * atomicity: leave it whole and say why with a `scale-exempt` comment.
 */
export const WRITE_CHUNK_SIZE = 100;

export async function writeInChunks<T, R = unknown, E = QueryError>(
  items: readonly T[],
  write: (chunk: T[]) => PromiseLike<{ data?: unknown; error: E | null }>,
  size = WRITE_CHUNK_SIZE
): Promise<{ ok: boolean; rows: R[]; error: E | null }> {
  const rows: R[] = [];
  for (let index = 0; index < items.length; index += size) {
    const chunk = items.slice(index, index + size);
    const { data, error } = await write(chunk);
    if (error) return { ok: false, rows, error };
    if (Array.isArray(data)) rows.push(...(data as R[]));
    else if (data !== null && data !== undefined) rows.push(data as R);
  }
  return { ok: true, rows, error: null };
}

/**
 * EVERY AUTH ACCOUNT, NOT THE FIRST PAGE OF THEM.
 *
 * `auth.admin.listUsers()` is paged by the Auth server, not by PostgREST: 50
 * accounts by default and at most 1,000 per call, with no error when there
 * are more. A lookup that finds an account by email in one page quietly
 * stops finding people once the project outgrows that page. This walks every
 * page and returns the same `{ data: { users }, error }` shape as one call,
 * so a caller swaps the call and changes nothing else.
 */
type AuthAdminLister<U, E> = {
  listUsers: (params: {
    page: number;
    perPage: number;
  }) => PromiseLike<{ data: { users: U[] }; error: E | null }>;
};

export async function listAllAuthUsers<U, E = QueryError>(
  admin: AuthAdminLister<U, E>
): Promise<{ data: { users: U[] }; error: E | null }> {
  const perPage = 1000;
  const users: U[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage });
    if (error) return { data: { users }, error };
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < perPage) return { data: { users }, error: null };
    if (users.length >= MAX_ROWS) {
      return { data: { users }, error: { message: `listAllAuthUsers stopped at ${MAX_ROWS} accounts` } as unknown as E };
    }
  }
}
