// Browsers cache favicons by URL indefinitely and largely ignore normal HTTP
// cache-control/ETag revalidation for them, so updating the file in place is
// not enough to make an already-visited browser pick up a new icon. Bump this
// whenever brand imagery changes (e.g. `npm run brand:assets`) so every icon
// URL changes and gets treated as a new resource.
export const BRAND_ASSET_VERSION = '9be5f7f6';

export function withBrandVersion(path: string): string {
  return `${path}?v=${BRAND_ASSET_VERSION}`;
}
