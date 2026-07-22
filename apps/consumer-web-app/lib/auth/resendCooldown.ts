/**
 * Persists the "next allowed resend" timestamp per email so the verify
 * page's countdown survives a refresh or navigating away and back (a plain
 * in-memory timer would reset to zero on every remount). Takes a storage
 * interface rather than reaching for window.localStorage directly so this
 * stays testable under Vitest's node environment (no jsdom/window here).
 */
export interface CooldownStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = 'mef.auth.resendCooldown:';

function cooldownKey(email: string): string {
  return `${STORAGE_PREFIX}${email.trim().toLowerCase()}`;
}

export function readNextAllowedAt(storage: CooldownStorage, email: string): number {
  const raw = storage.getItem(cooldownKey(email));
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function writeNextAllowedAt(storage: CooldownStorage, email: string, whenMs: number): void {
  storage.setItem(cooldownKey(email), String(whenMs));
}

export function clearCooldown(storage: CooldownStorage, email: string): void {
  storage.removeItem(cooldownKey(email));
}

export function secondsRemaining(nextAllowedAtMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((nextAllowedAtMs - nowMs) / 1000));
}
