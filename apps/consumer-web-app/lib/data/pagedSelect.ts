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
type RangeableQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

/**
 * One page. Deliberately under PostgREST's own cap rather than equal to it,
 * so a database that lowers `db-max-rows` still pages correctly instead of
 * silently returning short pages that look like the end.
 */
export const PAGE_SIZE = 500;

/**
 * Every row a query matches, in pages.
 *
 * `build` is called once per page and must apply the SAME filters and the
 * SAME order every time: a range is meaningless over a result whose order
 * changes between calls. Passing a builder factory rather than a builder is
 * what makes that structural, because a PostgREST builder is single use.
 */
export async function selectAllRows<T>(
  build: () => RangeableQuery
): Promise<{ ok: boolean; rows: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let page = 0; ; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build().range(from, from + PAGE_SIZE - 1);
    if (error) return { ok: false, rows, error };
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    // A short page is the end. An exactly full last page costs one more
    // round trip that comes back empty, which is the correct trade for
    // never guessing.
    if (batch.length < PAGE_SIZE) return { ok: true, rows, error: null };
    /*
      A STOP, so a mistake cannot become an infinite loop. Nothing this
      helper is used for is anywhere near this size, and a read that hits it
      is a read that should not have been using this helper at all.
    */
    if (rows.length >= 50_000) return { ok: true, rows, error: null };
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

export async function selectAllRowsInChunks<T>(
  ids: readonly string[],
  build: (chunk: string[]) => RangeableQuery
): Promise<{ ok: boolean; rows: T[]; error: unknown }> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
    const chunk = ids.slice(index, index + ID_CHUNK_SIZE);
    const read = await selectAllRows<T>(() => build(chunk));
    if (!read.ok) return { ok: false, rows, error: read.error };
    rows.push(...read.rows);
  }
  return { ok: true, rows, error: null };
}

