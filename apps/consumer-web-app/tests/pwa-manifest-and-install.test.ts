/**
 * The Home Screen app: what the manifest promises and what the icons can
 * actually survive.
 *
 * All of this is invisible in the browser and only shows up on a phone,
 * after an install, which is the worst possible place to discover a
 * missing size or a cropped logo. So the manifest is executed and read
 * here, and the icon files it names are checked to exist at the exact
 * pixel size it claims.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../app/manifest';

const ROOT = resolve(__dirname, '..');
const built = manifest();

/** The manifest versions every icon URL so browsers pick up a changed file; the file on disk has no query string. */
function iconPath(src: string): string {
  return resolve(ROOT, 'public', src.split('?')[0].replace(/^\//, ''));
}

/** PNG width and height live at a fixed offset in the IHDR chunk. */
function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('the installed app identifies itself', () => {
  it('carries a name, a short name for the Home Screen, and a description', () => {
    expect(built.name).toBe('Rooted Reset | MEF Wellness');
    expect(built.short_name).toBe('Rooted Reset');
    // Anything longer is truncated under the icon on both platforms.
    expect(built.short_name!.length).toBeLessThanOrEqual(12);
    expect(built.description!.length).toBeGreaterThan(0);
  });

  it('opens as an app rather than a browser tab, in the brand colours', () => {
    expect(built.display).toBe('standalone');
    expect(built.theme_color).toBe('#1B3A2D');
    expect(built.background_color).toBe('#FAFAF8');
  });

  it('has a stable identity that does not move when start_url does', () => {
    // With no id, a manifest's identity IS its start_url, so changing
    // start_url later would read as a different app and could leave a
    // member with two icons.
    expect(built.id).toBe('/dashboard');
    expect(built.scope).toBe('/');
  });

  it('starts inside the app rather than on a marketing page', () => {
    expect(built.start_url).toBe('/dashboard');
    expect(built.start_url!.startsWith('/')).toBe(true);
  });
});

describe('the icons', () => {
  const icons = built.icons ?? [];

  it('offers both required sizes for the plain icon', () => {
    const any = icons.filter((icon) => icon.purpose === 'any');
    expect(any.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512']);
  });

  it('offers a separate maskable pair, because a maskable icon is cropped', () => {
    // Declaring one file as both purposes is the common shortcut and it is
    // wrong in one of the two places by definition: an `any` icon is drawn
    // edge to edge, a `maskable` one has its edges cut off.
    const maskable = icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable.map((icon) => icon.sizes).sort()).toEqual(['192x192', '512x512']);

    for (const icon of maskable) {
      const plain = icons.find((other) => other.purpose === 'any' && other.sizes === icon.sizes);
      expect(icon.src).not.toBe(plain!.src);
    }
  });

  it('names files that exist, at exactly the size claimed', () => {
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const file = iconPath(icon.src);
      expect(existsSync(file), `${icon.src} is missing`).toBe(true);

      const [width, height] = icon.sizes!.split('x').map(Number);
      expect(pngSize(file)).toEqual({ width, height });
      expect(icon.type).toBe('image/png');
    }
  });

  it('versions every icon URL, so a changed file is not served from an old cache forever', () => {
    for (const icon of icons) {
      expect(icon.src).toMatch(/\?v=/);
    }
  });

  it('still ships the 180 pixel Apple touch icon iOS uses for the Home Screen', () => {
    // iOS ignores the manifest icons for the Home Screen and uses this one.
    const file = resolve(ROOT, 'public/icons/apple-touch-icon.png');
    expect(existsSync(file)).toBe(true);
    expect(pngSize(file)).toEqual({ width: 180, height: 180 });
  });
});

describe('the service worker is reachable without a session', () => {
  it('is excluded from the middleware matcher', () => {
    // A browser re-checking a registration fetches /sw.js with no session
    // at all. A redirect to /login in its place makes the browser drop the
    // worker, and every push after that silently stops.
    const middleware = readFileSync(resolve(ROOT, 'middleware.ts'), 'utf-8');
    const matcher = middleware.slice(middleware.indexOf('matcher:'));
    expect(matcher).toContain('sw\\\\.js');
  });

  it('is a real file at the path the app registers', () => {
    const client = readFileSync(resolve(ROOT, 'lib/push/client.ts'), 'utf-8');
    expect(client).toContain("PUSH_SERVICE_WORKER_PATH = '/sw.js'");
    expect(existsSync(resolve(ROOT, 'public/sw.js'))).toBe(true);
  });
});
