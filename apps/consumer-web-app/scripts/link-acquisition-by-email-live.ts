#!/usr/bin/env npx tsx
/**
 * Runs THE REAL cross device link against production, on one account.
 *
 * WHY THIS EXISTS AS A SEPARATE SCRIPT. Bot protection is live on the
 * signup form by design, so a scripted browser cannot submit it, and
 * working around it is not something this project does. The signup action
 * itself is one line of glue over `attachUserAcquisitionFromLead`; this
 * imports THAT function, the same file the action imports, and calls it
 * with the same three inputs the action passes, against production. So the
 * behaviour being verified live is the shipped code and not a
 * reimplementation of it.
 *
 * WHAT IS THEREFORE NOT PROVEN BY THIS, and is proven elsewhere: that the
 * signup form's hidden field reaches the action and gates the call. The
 * live run checks that field is rendered on the real page with the value
 * `no`, and tests/acquisition-report.test.ts fails the build if the action
 * ever stops gating on it.
 *
 * Env: PROD_SUPABASE_URL, PROD_SERVICE_KEY_FILE, LINK_MEMBER_ID,
 * LINK_EMAIL, LINK_ACCOUNT_CREATED_AT.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { attachUserAcquisitionFromLead } from '../lib/acquisition/data';

const url = process.env.PROD_SUPABASE_URL;
const keyFile = process.env.PROD_SERVICE_KEY_FILE;
const memberId = process.env.LINK_MEMBER_ID;
const email = process.env.LINK_EMAIL;

if (!url || !keyFile || !memberId || !email) {
  console.error('Missing PROD_SUPABASE_URL / PROD_SERVICE_KEY_FILE / LINK_MEMBER_ID / LINK_EMAIL');
  process.exit(2);
}

const service = createClient(url, readFileSync(keyFile, 'utf8').trim(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Wrapped rather than top level, because tsx compiles this to CommonJS
// and top level await is not available there.
async function main(): Promise<void> {
  const result = await attachUserAcquisitionFromLead(service, {
    memberId: memberId as string,
    email: email as string,
    accountCreatedAt: process.env.LINK_ACCOUNT_CREATED_AT || null,
  });
  console.log(JSON.stringify(result));
}

void main();
