/**
 * Root Movement — does the video for a given exercise ACTUALLY PLAY?
 *
 * The lineup refinement introduced four exercises that Root Movement had
 * never used before. "The catalog says has_video = true" and "the screen
 * shows a play button" are both weaker claims than the one that matters,
 * which is that the member taps play and a frame decodes and the playhead
 * moves. This script makes that claim checkable, and re-checkable the
 * next time a lineup changes.
 *
 * It walks a session, and for each exercise whose name is in the watch
 * list it taps play, waits, and reads the <video> element itself:
 *
 *   readyState        4 means HAVE_ENOUGH_DATA, i.e. decoded, not just
 *                     requested
 *   videoWidth/Height a real decoded frame, not a 0x0 placeholder
 *   paused            false
 *   currentTime       measured twice, seconds apart, and it must have
 *                     advanced
 *   currentSrc host   which CDN actually served it
 *
 * Run against production, where YMOVE_API_KEY exists:
 *
 *   SCREENSHOT_TARGET=live node scripts/screenshots/verify-root-movement-videos.mjs
 *
 * QUOTA: every distinct exercise played here spends one play against the
 * Your Move monthly quota. The watch list is deliberately short and is
 * meant to hold only exercises that are NEW to Root Movement, plus one
 * already-proven control so a total failure is distinguishable from a
 * new-exercise failure. Do not widen it casually.
 *
 * Nothing here asserts. It prints what it saw.
 */

import { chromium } from 'playwright';
import { BASE_URL, ACCOUNTS, VIEWPORT, USER_AGENT, TARGET } from './config.mjs';
import { login } from './lib.mjs';

/**
 * Which exercises to actually spend a play on, per session. Names are
 * matched case-insensitively against the exercise heading on screen.
 */
const WATCH = [
  {
    sessionKey: 'morning_mobility',
    names: [
      'Cat cow pose', // control: proven playing in production on 2026-08-13
      'Bridge pose', // new to Root Movement
      'Lateral leg swing', // new to Root Movement
    ],
  },
  {
    sessionKey: 'desk_reset',
    names: ['Hip hinge'], // new to Root Movement
  },
  {
    sessionKey: 'recovery_day',
    names: ['Reclined butterfly'], // new to Root Movement
  },
];

/** How long to let a video run before re-reading currentTime. */
const WATCH_MS = 4000;

const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  ${detail}` : ''}`);
}

async function readVideoState(page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    if (!video) return null;
    let host = '';
    try {
      host = video.currentSrc ? new URL(video.currentSrc).host : '';
    } catch {
      host = '';
    }
    return {
      readyState: video.readyState,
      duration: Number.isFinite(video.duration) ? Math.round(video.duration) : null,
      width: video.videoWidth,
      height: video.videoHeight,
      paused: video.paused,
      currentTime: video.currentTime,
      host,
    };
  });
}

async function walkSession(page, sessionKey, names) {
  const wanted = names.map((n) => n.toLowerCase());
  const seen = [];

  await page.goto(`${BASE_URL}/movement/sessions/${sessionKey}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(1200);

  for (let step = 0; step < 40; step += 1) {
    const heading = (await page.locator('main h1').first().innerText().catch(() => '')).trim();

    if (wanted.includes(heading.toLowerCase())) {
      const play = page.getByRole('button', { name: 'Play exercise video' });
      if ((await play.count()) === 0) {
        record(`${sessionKey} / ${heading}: play control present`, false, 'no play control rendered');
      } else {
        await play.click();
        await page.waitForTimeout(1500);
        const first = await readVideoState(page);
        await page.waitForTimeout(WATCH_MS);
        const second = await readVideoState(page);

        if (!first || !second) {
          record(`${sessionKey} / ${heading}: video element present`, false, 'no <video> element after tapping play');
        } else {
          const advanced = second.currentTime > first.currentTime + 0.5;
          const decoded = second.readyState >= 3 && second.width > 0 && second.height > 0;
          record(
            `${sessionKey} / ${heading}: video genuinely plays`,
            decoded && advanced && !second.paused,
            `readyState ${second.readyState}/4, ${second.width}x${second.height}, ${
              second.duration ?? '?'
            }s, paused=${second.paused}, currentTime ${first.currentTime.toFixed(1)}s -> ${second.currentTime.toFixed(
              1
            )}s, host ${second.host || 'unknown'}`
          );
        }
      }
      seen.push(heading);
    }

    const next = page.getByRole('button', { name: /^(Next|Finish)$/ });
    if ((await next.count()) === 0) break;
    await next.click();
    await page.waitForTimeout(500);
    if ((await page.getByText('That is the session.').count()) > 0) break;
  }

  const missed = names.filter((n) => !seen.some((s) => s.toLowerCase() === n.toLowerCase()));
  record(
    `${sessionKey}: every watched exercise appeared in the lineup`,
    missed.length === 0,
    missed.length ? `never seen: ${missed.join(', ')}` : seen.join(', ')
  );
}

async function main() {
  console.log(`Root Movement video playback against ${TARGET}: ${BASE_URL}\n`);
  if (TARGET !== 'live') {
    console.log(
      'NOTE: YMOVE_API_KEY is a production-only credential. Against a local target the player falls\n' +
        'back to the cues surface and no <video> element is created, so a local run proves nothing\n' +
        'about playback. Run this with SCREENSHOT_TARGET=live.\n'
    );
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({ ...VIEWPORT, userAgent: USER_AGENT });
  const page = await context.newPage();

  try {
    await login(page, BASE_URL, ACCOUNTS.memberPopulated);
    record('logged in', true, ACCOUNTS.memberPopulated.label);

    for (const { sessionKey, names } of WATCH) {
      await walkSession(page, sessionKey, names);
    }
  } catch (error) {
    record('run completed without throwing', false, String(error));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.step} ${f.detail}`);
  }
}

main();
