# Lead Capture Agent — Leadpages Embed Snippet

This is the chat widget for capturing prospects on external landing pages. It is
completely separate from the member app — it never touches member accounts,
Root (the member chatbot), or anything behind login.

## The snippet to paste

Copy this exactly and paste it into a **Leadpages HTML/Embed widget** (not a text
widget) anywhere on your page — most people put it right before the closing
`</body>` tag, but Leadpages' HTML widget will work anywhere on the page:

```html
<script src="https://app.mefwellness.com/lead-widget.js" async></script>
```

That's it — one line. It renders a floating chat bubble in the bottom-right
corner automatically. You don't need to add any other HTML, CSS, or JavaScript.

**Why this is "future-proof":** the snippet only points at a file on your own app
domain. Any future update to the agent's questions, styling, or behavior happens
by updating that file on your app — you will never need to touch Leadpages
again after pasting this once.

## What it looks like to a visitor

1. A round chat bubble appears bottom-right, in your forest green with a gold
   outline.
2. Tapping it opens a chat panel with a cream background, asking: **"What's
   been bothering you most lately?"** with four tappable buttons — Pain,
   Energy, Sleep, Stress.
3. The agent asks 3 short follow-up questions (where/how long, what they've
   tried, what their goal is).
4. It offers one short, useful observation connecting their answers, then asks
   for their first name and email so it can "send a summary."
5. Based on their answers, it sends either:
   - A **Discovery Assessment booking link** (for a high-intent lead — pain +
     sounds ready to act), or
   - A **quiz/free guide link** (for every other, softer lead).

Every conversation and every captured name/email is saved automatically, and
you (the coach) get an in-app notification the moment someone gives their
email.

## Before this goes live, you need to set 3 things

These are environment variables in your hosting provider (Vercel → Project
Settings → Environment Variables). None of them are set yet — until they are,
the widget still works, but with a generic/placeholder version:

| Variable | What it is | What happens if it's blank |
|---|---|---|
| `LEAD_WIDGET_ALLOWED_ORIGINS` | The exact Leadpages domain(s) allowed to use the widget (comma-separated if more than one), e.g. `https://your-page.leadpages.net` | The widget will not work on any external page at all — it fails safe, not open, so this **must** be set before you paste the snippet anywhere public |
| `LEAD_DISCOVERY_CALL_URL` | Your real Calendly (or booking) link for the Discovery Assessment | Falls back to a placeholder Calendly-style URL |
| `LEAD_QUIZ_GUIDE_URL` | Your real quiz or free-guide link | Falls back to a placeholder URL |

You do **not** need to touch `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` — the agent
reuses the same ones Root already uses. If you ever want this agent to use a
cheaper/different model than Root, set `LEAD_AGENT_ANTHROPIC_MODEL` instead;
otherwise leave it blank.

## How to find the exact origin for `LEAD_WIDGET_ALLOWED_ORIGINS`

"Origin" means the scheme + domain of the page the widget will live on — not
the whole page URL. For example, if your Leadpages page is at
`https://my-clinic.leadpages.net/discovery-page/`, the origin is:

```
https://my-clinic.leadpages.net
```

If you'll use more than one Leadpages page/domain, separate them with commas,
no spaces: `https://page-one.leadpages.net,https://page-two.leadpages.net`

## Testing before you put it on a real Leadpages page

Once this is deployed, open:

```
https://app.mefwellness.com/lead-widget-test
```

This is a plain test page (not linked from anywhere in the app, not visible to
members) that loads the exact same widget script. Since it's on your own app's
domain, it will work immediately — you don't need `LEAD_WIDGET_ALLOWED_ORIGINS`
set to test here, only when embedding on an actual external Leadpages domain.

Walk through a full conversation there first (see the testing checklist you
were given separately) before pasting the snippet into a real Leadpages page.

## If something looks wrong

- **Bubble doesn't appear at all**: open the browser console (right-click →
  Inspect → Console tab) and look for a red error — most likely the script
  failed to load, which usually means the `src` URL was mistyped.
- **Bubble appears but a message says "Sorry, something went wrong"**: this
  usually means the domain you're testing from isn't in
  `LEAD_WIDGET_ALLOWED_ORIGINS` yet — add it and redeploy.
- **Everything works but replies feel generic/templated rather than
  conversational**: this means `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` aren't set
  (or the call failed) and the agent is using its built-in fallback wording —
  it still works and captures leads correctly, just without the more natural,
  personalized phrasing the real model gives.
