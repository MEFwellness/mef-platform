/** Types for ./mint-session.mjs, so a TypeScript verification run can import it. */
import type { Browser, BrowserContext } from 'playwright';
import type { Session, SupabaseClient } from '@supabase/supabase-js';

export type MintedContext = { context: BrowserContext; session: Session; service: SupabaseClient };

export function canMintSessions(): boolean;
export function mintSessionContext(
  browser: Browser,
  email: string,
  options: { baseUrl: string; viewport?: { width: number; height: number }; contextOptions?: Record<string, unknown> }
): Promise<MintedContext | null>;
export function mintSessionCookies(
  email: string,
  options: { baseUrl: string }
): Promise<{ session: Session; service: SupabaseClient; cookies: Array<Record<string, unknown>> } | null>;
export function retireSession(minted: Partial<MintedContext> | null | undefined): Promise<void>;
