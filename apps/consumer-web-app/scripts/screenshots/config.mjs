// Env/target configuration for the screenshot capture tool. Loads
// scripts/screenshots/.env.local (gitignored, optional) the same way
// tests/setup/test-clients.ts loads the app's own .env.local — a plain
// KEY=VALUE parser, no dotenv dependency needed for this few lines.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(relativePath) {
  const envPath = path.resolve(__dirname, relativePath);
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile('.env.local');

export const TARGET = process.env.SCREENSHOT_TARGET === 'live' ? 'live' : 'local';

const LOCAL_BASE_URL = process.env.LOCAL_BASE_URL || 'http://localhost:3000';
const LIVE_BASE_URL = process.env.LIVE_BASE_URL || 'https://app.mefwellness.com';

export const BASE_URL = TARGET === 'live' ? LIVE_BASE_URL : LOCAL_BASE_URL;

/**
 * Credentials are always read from the environment, never hardcoded here.
 * For the `local` target only, we fall back to the fixed dev seed accounts
 * from supabase/seed/02_users.sql — those are not secrets: they're already
 * committed in cleartext in that file (and in tests/setup/test-clients.ts),
 * exist only in a throwaway local Supabase container, and every prior
 * manual QA pass in docs/BUILD_STATUS.md already relies on them by name.
 * For `live`, there is no fallback — a missing var throws, on purpose, so
 * this script can never silently run against production with a guessed or
 * hardcoded password.
 */
/**
 * Priority is per-target, not global, and that is the whole point.
 *
 * `.env.local` in this directory exists to hold the LIVE accounts, because
 * the live target refuses to guess one. It is also loaded on a local run,
 * and it used to win there too — so once anybody had captured against
 * production, every subsequent local run signed in with a production email
 * against localhost, where that account does not exist. The capture then
 * reported "Incorrect email or password" as a timeout on all 60-odd
 * screens, which reads like the app is broken rather than the tool.
 *
 * So: on the local target the committed dev seed account wins, and the env
 * var is only consulted when there is no seed account to fall back to. On
 * the live target there is no fallback at all, so the env var is the only
 * source and a missing one still throws.
 */
function credential(envVar, localFallback) {
  if (TARGET === 'local' && localFallback !== undefined) return localFallback;
  const value = process.env[envVar];
  if (value) return value;
  throw new Error(
    `Missing required env var ${envVar} for SCREENSHOT_TARGET=live. ` +
      'Set it in scripts/screenshots/.env.local (gitignored) — see .env.example. Refusing to guess or hardcode a production credential.'
  );
}

export const ACCOUNTS = {
  memberPopulated: {
    label: 'memberPopulated',
    email: credential('MEMBER_POPULATED_EMAIL', 'member.one@example.test'),
    password: credential('MEMBER_POPULATED_PASSWORD', 'DevPassword123!'),
  },
  memberEmpty: {
    label: 'memberEmpty',
    email: credential('MEMBER_EMPTY_EMAIL', 'member.two@example.test'),
    password: credential('MEMBER_EMPTY_PASSWORD', 'DevPassword123!'),
  },
  coach: {
    label: 'coach',
    email: credential('COACH_EMAIL', 'coach.one@example.test'),
    password: credential('COACH_PASSWORD', 'DevPassword123!'),
  },
};

export const OUTPUT_DIR = path.resolve(__dirname, '../../../../docs/screens');

export const VIEWPORTS = {
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  tablet: { width: 810, height: 1080, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

export const VIEWPORT_NAME = process.env.SCREENSHOT_VIEWPORT === 'tablet' ? 'tablet' : 'mobile';
export const VIEWPORT = VIEWPORTS[VIEWPORT_NAME];

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export const USER_AGENT = VIEWPORT_NAME === 'tablet' ? IPAD_UA : IPHONE_UA;
