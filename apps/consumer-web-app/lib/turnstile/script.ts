/**
 * The one spelling of Cloudflare's script URL.
 *
 * Two things ask for it and they must ask for the identical string:
 * components/auth/TurnstilePreload.tsx puts it in the server-rendered HTML
 * so the download starts during parse, and
 * components/auth/TurnstileGate.tsx looks for a tag with exactly this src
 * before appending one of its own. A second spelling would mean two
 * downloads of the same 60 kB script and a widget waiting on the wrong
 * one, so neither file carries its own copy of the literal.
 *
 * `render=explicit` is what stops Cloudflare auto-rendering a widget into
 * anything it finds on the page: this app decides where and when, in
 * TurnstileGate's own effect.
 */
export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
