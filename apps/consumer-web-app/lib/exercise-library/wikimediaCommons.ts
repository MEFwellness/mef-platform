/**
 * Wikimedia Commons search + license lookup for Phase 3 open-license
 * images — public, no API key required (unlike Pexels/Unsplash, which do
 * require one; PEXELS_API_KEY/UNSPLASH_ACCESS_KEY aren't configured in
 * this environment, so this is the only Phase 3 source wired up this
 * pass — see the build report).
 *
 * Conservative by construction, same philosophy as
 * lib/your-move/matching.ts: only accepts a candidate whose file title
 * contains every significant token of the exercise name (so "Barbell
 * Squat" cannot match a "Barbell Row" photo just because both are
 * barbell exercises), and only a license explicitly allowing commercial
 * reuse (no "NC" token, no missing/unknown license).
 */

const COMMONS_API_BASE = 'https://commons.wikimedia.org/w/api.php';

const STOPWORDS = new Set(['the', 'a', 'an', 'with', 'and', 'or', 'exercise']);

function significantTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/** Strips the "File:" namespace prefix and file extension Commons titles always carry — neither is descriptive content, and leaving them in would inflate every title's token count, silently lowering every candidate's real token-density score (a "Paul Anderson silver dollar squat.jpg" title should be judged on its 5 descriptive words, not 7 once "file"/"jpg" are counted in). */
function stripCommonsTitleNoise(title: string): string {
  return title.replace(/^file:/i, '').replace(/\.[a-z0-9]{2,4}$/i, '');
}

/**
 * Commons is full of anatomical diagrams/illustrations that share
 * vocabulary with exercise names (muscle names especially) without being
 * a photo of anyone performing the exercise — e.g. "Gray415 - Adductor
 * pollicis" satisfies a token-match against "Adductor" but is a Gray's
 * Anatomy plate, not an exercise photo. Since there is no way to verify
 * "shows the actual exercise" from text alone, per the requirement ("if
 * unverifiable, skip to cues") these are excluded outright rather than
 * risked.
 */
const NON_PHOTO_TITLE_PATTERNS = [
  /\bgray\d+\b/i, // Gray's Anatomy plate numbering (e.g. "Gray415")
  /\banatomy\b/i,
  /\bdiagram\b/i,
  /\billustration\b/i,
  /\bschematic\b/i,
  /\bx-?ray\b/i,
  /\.svg$/i, // vector diagrams are essentially never photos of a person
];

function looksLikeNonPhoto(title: string): boolean {
  return NON_PHOTO_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

/** Our exercise-name tokens must make up at least this fraction of the candidate title's own tokens — see the false-positive this caught, in findCommonsImage's own comment. */
const MIN_TOKEN_DENSITY = 0.4;

export type CommonsCandidate = {
  title: string;
  imageUrl: string;
  descriptionUrl: string;
  licenseShortName: string;
  licenseUrl: string | null;
  attribution: string | null;
};

function isCommerciallyUsableLicense(licenseShortName: string): boolean {
  const lower = licenseShortName.toLowerCase();
  if (!lower) return false;
  if (lower.includes('nc')) return false; // non-commercial, explicitly excluded
  return (
    lower.includes('cc0') ||
    lower.includes('public domain') ||
    lower.includes('pd') ||
    lower.includes('cc by') ||
    lower.includes('cc-by')
  );
}

type CommonsSearchResponse = { query?: { search?: { title: string }[] } };

type CommonsImageInfoResponse = {
  query?: {
    pages?: Record<
      string,
      {
        imageinfo?: {
          url?: string;
          descriptionurl?: string;
          mime?: string;
          extmetadata?: {
            LicenseShortName?: { value?: string };
            LicenseUrl?: { value?: string };
            Artist?: { value?: string };
          };
        }[];
      }
    >;
  };
};

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retries with exponential backoff on 429 — a first, naive version of this hammered Commons with zero throttling and got rate-limited on nearly every request (1928/1934 failures against real production data), which silently masqueraded as "no candidate found." Real backoff turned that into real results. */
async function fetchJson<T>(url: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': 'MEF-Wellness-Exercise-Library/1.0' } });
    if (response.status === 429) {
      if (attempt === MAX_ATTEMPTS) throw new Error('Wikimedia Commons request failed: 429 (retries exhausted)');
      const retryAfterHeader = response.headers.get('Retry-After');
      const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : BASE_BACKOFF_MS * 2 ** (attempt - 1);
      await sleep(waitMs);
      continue;
    }
    if (!response.ok) throw new Error(`Wikimedia Commons request failed: ${response.status}`);
    return (await response.json()) as T;
  }
  throw new Error('Wikimedia Commons request failed: unreachable');
}

/** Searches Commons' File namespace (6) and returns the first candidate whose title contains every significant token of the exercise name, with a verified commercially-usable license — or null if nothing qualifies (Phase 3 requirement: skip to cues rather than guess). */
export async function findCommonsImage(exerciseName: string): Promise<CommonsCandidate | null> {
  const requiredTokens = significantTokens(exerciseName);
  if (requiredTokens.length === 0) return null;

  const searchUrl = `${COMMONS_API_BASE}?action=query&list=search&srsearch=${encodeURIComponent(
    exerciseName
  )}&srnamespace=6&srlimit=10&format=json&origin=*`;
  const searchResult = await fetchJson<CommonsSearchResponse>(searchUrl);
  const hits = searchResult.query?.search ?? [];

  for (const hit of hits) {
    if (looksLikeNonPhoto(hit.title)) continue;

    const hitTokens = significantTokens(stripCommonsTitleNoise(hit.title));
    const hitTokenSet = new Set(hitTokens);
    const allTokensPresent = requiredTokens.every((t) => hitTokenSet.has(t));
    if (!allTokensPresent) continue;

    // All-tokens-present alone still false-positives on real production
    // data: "Side Bridge" matched a photo titled "...side of Woljeonggyo
    // Bridge illuminated at sunset..." — both words appear, purely by
    // coincidence, buried in an unrelated 12-word title about an actual
    // bridge structure. Requiring our tokens to make up a real fraction
    // of the candidate's own tokens (not just be present somewhere in a
    // long title) rejects that case while still keeping genuine matches
    // like "Anderson Squat" -> "Paul Anderson silver dollar squat" (2 of
    // 5 tokens, 40%) and "Side Crow Pose" -> "...Crow Pose Side Crow" (3
    // of 6, 50%).
    const tokenDensity = requiredTokens.length / hitTokens.length;
    if (tokenDensity < MIN_TOKEN_DENSITY) continue;

    const infoUrl = `${COMMONS_API_BASE}?action=query&titles=${encodeURIComponent(
      hit.title
    )}&prop=imageinfo&iiprop=url|extmetadata|mime&format=json&origin=*`;
    const infoResult = await fetchJson<CommonsImageInfoResponse>(infoUrl);
    const pages = infoResult.query?.pages ?? {};
    const page = Object.values(pages)[0];
    const imageInfo = page?.imageinfo?.[0];
    if (!imageInfo?.url) continue;

    // Real exercise photos are near-universally JPEG. Anatomical
    // diagrams/illustrations — the exact false-positive class this file
    // keeps finding against real production data ("Adductor minimus.gif"
    // wasn't caught by the title-pattern exclusion above) — are
    // overwhelmingly PNG/GIF/SVG. This is a much more general signal than
    // trying to word-list every possible diagram title.
    if (imageInfo.mime !== 'image/jpeg') continue;

    const licenseShortName: string = imageInfo.extmetadata?.LicenseShortName?.value ?? '';
    if (!isCommerciallyUsableLicense(licenseShortName)) continue;

    return {
      title: hit.title,
      imageUrl: imageInfo.url,
      descriptionUrl: imageInfo.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(hit.title)}`,
      licenseShortName,
      licenseUrl: imageInfo.extmetadata?.LicenseUrl?.value ?? null,
      attribution: imageInfo.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, '') ?? null,
    };
  }

  return null;
}

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { 'User-Agent': 'MEF-Wellness-Exercise-Library/1.0' } });
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
