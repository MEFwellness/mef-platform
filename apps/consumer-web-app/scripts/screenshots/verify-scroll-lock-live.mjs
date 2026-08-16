#!/usr/bin/env node
/**
 * The production twin of scripts/screenshots/verify-scroll-lock.mjs: the
 * identical checks, run against the real site as the real seeded test
 * member, because "the app cannot be scrolled" was reported live and never
 * reproduced from the markup alone.
 *
 * It only ever signs in and reads; it dismisses whatever Root pop-up is
 * waiting for that account today, which is the same thing the member
 * herself would do, and it opens and cancels the sign-out confirmation
 * without ever confirming it.
 *
 * Usage, from apps/consumer-web-app:
 *
 *   SCROLL_PASSWORD_FILE=/path/to/password.txt \
 *   node scripts/screenshots/verify-scroll-lock-live.mjs
 *
 * A file rather than a command line argument on purpose: a password on a
 * command line ends up in the shell history and in every process listing on
 * the machine. SCROLL_PASSWORD is honoured too, for a shell that already
 * has it in the environment.
 */
import { readFileSync } from 'node:fs';

process.env.BASE ??= 'https://app.mefwellness.com';
process.env.SCROLL_EMAIL ??= '8weeks2fab@gmail.com';
process.env.OUT ??= '/tmp/scroll-lock-live-shots';

if (!process.env.SCROLL_PASSWORD && process.env.SCROLL_PASSWORD_FILE) {
  process.env.SCROLL_PASSWORD = readFileSync(process.env.SCROLL_PASSWORD_FILE, 'utf8').trim();
}
if (!process.env.SCROLL_PASSWORD) {
  throw new Error('Set SCROLL_PASSWORD_FILE (preferred) or SCROLL_PASSWORD for the test member.');
}

await import('./verify-scroll-lock.mjs');
