/**
 * A real session for an account whose password we do not have.
 *
 * WHY THIS EXISTS. Bot protection is live on production's auth forms, and
 * that is the point of it: a scripted browser filling in the login form is
 * exactly what Turnstile is there to refuse. So a verification run does
 * not use the login form at all. It asks the Auth Admin API for the
 * one-time magic-link token an email would have carried, redeems it, and
 * writes the resulting session as the app's own cookie, so the app's
 * middleware reads it as an ordinary signed-in visit.
 *
 * No password is read, needed or changed, and the session is retired
 * afterwards with scope 'local' rather than supabase-js's default
 * 'global', which would sign that person out of their own phone.
 *
 * NOTHING SECRET REACHES A COMMAND LINE. The URL and both keys arrive as
 * file PATHS, so no key lands in shell history or a process listing.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChunks } = require('@supabase/ssr/dist/main/utils/chunker.js');
const { stringToBase64URL } = require('@supabase/ssr/dist/main/utils/base64url.js');

/** True when the environment carries everything minting needs. */
export function canMintSessions() {
  return Boolean(
    process.env.PROD_SUPABASE_URL &&
      process.env.PROD_SERVICE_KEY_FILE &&
      process.env.PROD_ANON_KEY_FILE
  );
}

/**
 * Returns { context, session, service } with the cookie already installed
 * on a fresh browser context, or null when minting is unavailable or the
 * account could not be minted.
 */
export async function mintSessionContext(browser, email, { baseUrl, viewport }) {
  if (!canMintSessions()) return null;

  const url = process.env.PROD_SUPABASE_URL;
  const service = createClient(url, readFileSync(process.env.PROD_SERVICE_KEY_FILE, 'utf8').trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: link, error: linkError } = await service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError || !link?.properties?.hashed_token) return null;

  const publicClient = createClient(url, readFileSync(process.env.PROD_ANON_KEY_FILE, 'utf8').trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verified, error: verifyError } = await publicClient.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError || !verified?.session) return null;

  const cookieName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const chunks = createChunks(
    cookieName,
    `base64-${stringToBase64URL(JSON.stringify(verified.session))}`
  );

  const context = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 900 } });
  await context.addCookies(
    chunks.map((chunk) => ({
      name: chunk.name,
      value: chunk.value,
      domain: new URL(baseUrl).hostname,
      path: '/',
      httpOnly: false,
      secure: baseUrl.startsWith('https'),
      sameSite: 'Lax',
    }))
  );

  return { context, session: verified.session, service };
}

/** Retires a minted session without touching that account's other sessions. */
export async function retireSession(minted) {
  if (!minted) return;
  await minted.service.auth.admin.signOut(minted.session.access_token, 'local').catch(() => {});
  await minted.context.close().catch(() => {});
}
