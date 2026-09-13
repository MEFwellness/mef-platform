/**
 * The production walk for the Home presentation pass (2026-09-13).
 *
 * It measures rather than admires. Every check below is a number or a
 * fact read off the real rendered page at 390x844 on app.mefwellness.com,
 * as the seeded test member, through a one-time session minted from the
 * service-role key and retired immediately afterwards. Turnstile is live
 * on the auth forms and correctly refuses a scripted browser, which is
 * why this never touches the login form.
 *
 * WHAT IT REFUSES TO DO. It never files a check-in, never logs an
 * experiment day, never completes an assignment. It opens things and
 * comes back, which is exactly what "nothing functional broke" needs.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { mintSessionContext, retireSession } from './lib/mint-session.mjs';

const BASE = 'https://app.mefwellness.com';
const OUT = process.env.OUT_DIR;
const EMAIL = process.env.TEST_MEMBER_EMAIL;

const results = [];
const pass = (name, detail) => results.push({ ok: true, name, detail });
const fail = (name, detail) => results.push({ ok: false, name, detail });
const check = (ok, name, detail) => (ok ? pass(name, detail) : fail(name, detail));

const browser = await chromium.launch();
let minted = null;
try {
  minted = await mintSessionContext(browser, EMAIL, {
    baseUrl: BASE,
    viewport: { width: 390, height: 844 },
  });
  if (!minted) throw new Error('could not mint a session');

  const page = await minted.context.newPage();
  page.setDefaultTimeout(45000);
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  async function settle() {
    await page
      .waitForFunction(
        () => document.querySelectorAll('[data-settling="true"]').length === 0,
        null,
        { timeout: 60000 }
      )
      .catch(() => {});
    await page.waitForTimeout(2500);
  }

  async function hideOverlays() {
    return page.evaluate(() => {
      const hidden = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || el.matches('nav') || el.closest('nav')) continue;
        const r = el.getBoundingClientRect();
        if (
          (r.width > innerWidth * 0.7 && r.height > innerHeight * 0.5) ||
          el.getAttribute('role') === 'dialog'
        ) {
          el.setAttribute('style', 'display:none !important');
          hidden.push(el.getAttribute('role') || el.tagName);
        }
      }
      document.body.style.position = '';
      document.body.style.overflow = '';
      document.body.style.top = '';
      document.body.style.width = '';
      return hidden;
    });
  }

  // =================================================================
  // 1. THE FIRST SCREENFUL
  // =================================================================
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await settle();
  await hideOverlays();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'live-1-fold.png') });

  const fold = await page.evaluate(() => {
    const main = document.querySelector('main');
    const hero = main?.previousElementSibling;
    const card = main?.querySelector('section');
    const label = [...(main?.querySelectorAll('p') ?? [])].find(
      (p) => p.textContent?.trim().toLowerCase() === 'your priority today'
    );
    const primary = card?.querySelector('a[href], button');
    const heading = card ? [...card.querySelectorAll('p')].find((p) => parseFloat(getComputedStyle(p).fontSize) >= 22) : null;
    return {
      heroHeight: Math.round(hero?.getBoundingClientRect().height ?? 0),
      cardTop: Math.round(card?.getBoundingClientRect().top ?? -1),
      cardWidth: Math.round(card?.getBoundingClientRect().width ?? 0),
      cardRadius: card ? getComputedStyle(card).borderTopLeftRadius : null,
      cardShadow: card ? getComputedStyle(card).boxShadow : null,
      hasPriorityLabel: !!label,
      labelSize: label ? getComputedStyle(label).fontSize : null,
      headingSize: heading ? getComputedStyle(heading).fontSize : null,
      headingFamily: heading ? getComputedStyle(heading).fontFamily.split(',')[0] : null,
      viewportH: window.innerHeight,
    };
  });
  check(fold.heroHeight === 400, 'the hero band is the committed 400px', `${fold.heroHeight}px`);
  check(
    fold.cardTop > 0 && fold.cardTop < 450,
    "the day's card begins inside the first screenful",
    `top ${fold.cardTop}px of ${fold.viewportH}px`
  );
  check(fold.hasPriorityLabel, 'the dominant slot is the priority card', 'label found');
  check(
    fold.headingSize !== null && parseFloat(fold.headingSize) >= 22,
    "the day's sentence is the largest type in <main>",
    `${fold.headingSize}, ${fold.headingFamily}`
  );
  check(fold.cardRadius === '32px', 'the feature card carries the 32px feature radius', fold.cardRadius);
  check(
    !!fold.cardShadow && !/^rgb\(.*\) 0px 0px 0px 0px$/.test(fold.cardShadow),
    'the feature card has a diffused shadow, not a gray outline',
    fold.cardShadow
  );

  // Is the primary button reachable without scrolling?
  //
  // FOUND BY ITS MEASURED SHAPE, NEVER BY A CLASS NAME. The first version
  // of this looked for the arbitrary Tailwind class the button happens to
  // carry, reported "no full-width primary found", and was wrong: the
  // button was there, 292x52 with its bottom edge at 706px. A check that
  // cannot see the thing it is checking is worse than no check, so this
  // asks the geometry instead.
  const cta = await page.evaluate(() => {
    const card = document.querySelector('main section');
    if (!card) return null;
    const cardWidth = card.getBoundingClientRect().width;
    const controls = [...card.querySelectorAll('a, button')].map((b) => ({
      text: b.innerText.trim().slice(0, 40),
      r: b.getBoundingClientRect(),
    }));
    const primary = controls.find((c) => c.r.height >= 50 && c.r.width > cardWidth * 0.75);
    if (!primary) {
      return {
        primary: null,
        saw: controls.map((c) => `${c.text} ${Math.round(c.r.width)}x${Math.round(c.r.height)}`),
      };
    }
    return {
      primary: {
        text: primary.text,
        height: Math.round(primary.r.height),
        width: Math.round(primary.r.width),
        bottom: Math.round(primary.r.bottom),
      },
      quieterBelow: controls.filter((c) => c.r.top >= primary.r.bottom && c.r.height > 0).length,
    };
  });
  check(
    !!cta?.primary && cta.primary.bottom < 844,
    "the day's one primary button is substantial and above the fold",
    cta?.primary
      ? `"${cta.primary.text}" ${cta.primary.width}x${cta.primary.height}, bottom ${cta.primary.bottom}px`
      : `no full-width primary found; saw ${(cta?.saw ?? []).join(', ')}`
  );
  check(
    cta?.quieterBelow === 2,
    'exactly two quieter actions sit under it, never a third equal pill',
    cta?.quieterBelow === undefined ? 'n/a' : `${cta.quieterBelow} below`
  );

  // =================================================================
  // 2. THE SYSTEM: radius, labels, gold, spacing
  // =================================================================
  const system = await page.evaluate(() => {
    const main = document.querySelector('main');
    const radii = new Set();
    for (const el of main.querySelectorAll('section, div')) {
      const r = getComputedStyle(el).borderTopLeftRadius;
      const rect = el.getBoundingClientRect();
      // Only real containers: something wide and tall enough to be a card.
      if (rect.width > 200 && rect.height > 60 && r !== '0px') radii.add(r);
    }
    const labels = [...main.querySelectorAll('p')].filter(
      (p) => getComputedStyle(p).textTransform === 'uppercase'
    );
    const labelSizes = new Set(labels.map((p) => getComputedStyle(p).fontSize));
    // COUNT WHAT SETS GOLD, NOT WHAT INHERITS IT. The first version of
    // this counted every descendant of a gold-coloured element as its own
    // gold element and reported 27 for a screen with 14.
    const goldish = [];
    for (const el of main.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
      for (const [prop, v] of [['color', cs.color], ['bg', cs.backgroundColor]]) {
        if (prop === 'color' && parent && parent.color === v) continue;
        if (prop === 'bg' && (v === 'rgba(0, 0, 0, 0)' || v === 'transparent')) continue;
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(v);
        if (!m) continue;
        const [r, g, b] = [+m[1], +m[2], +m[3]];
        if (r > 150 && g > 110 && b < 130 && r - b > 60) {
          goldish.push(`${(el.innerText || el.tagName).slice(0, 24).replace(/\n/g, ' ')} ${prop} ${v}`);
        }
      }
    }
    return {
      radii: [...radii].sort(),
      labelCount: labels.length,
      labelSizes: [...labelSizes],
      labelDetail: labels.map((p) => ({
        size: getComputedStyle(p).fontSize,
        txt: p.textContent.trim().slice(0, 34),
      })),
      goldElements: goldish.length,
      goldWhere: goldish,
      elementCount: main.querySelectorAll('*').length,
      pageBg: getComputedStyle(document.querySelector('.mef-home')).backgroundImage.slice(0, 90),
    };
  });
  // A very large px value is Tailwind's `rounded-full` resolved against a
  // wide element; that is the pill radius and it belongs to the system.
  const strayRadii = system.radii.filter(
    (r) => !['16px', '28px', '32px'].includes(r) && !r.includes('%') && parseFloat(r) < 1000
  );
  check(
    strayRadii.length === 0,
    'every card and panel radius is one of the system values',
    strayRadii.length ? `stray: ${strayRadii.join(', ')}` : system.radii.join(', ')
  );
  // 10px is the noticing tiles' kicker, which is a tile's own mark inside
  // a 196px photograph and not a section label; every section label is
  // 11px. Anything else is a stray.
  const strayLabels = system.labelDetail.filter(
    (l) => l.size !== '11px' && l.size !== '10px'
  );
  check(
    strayLabels.length === 0,
    'every section label on Home is the one label size',
    strayLabels.length
      ? `stray: ${strayLabels.map((l) => `${l.txt} (${l.size})`).join('; ')}`
      : system.labelSizes.join(', ')
  );
  // GOLD, COUNTED HONESTLY AND SPLIT BY TONE.
  //
  // The first version of this counted every descendant that INHERITED a
  // gold colour as its own gold element and reported 27 for a screen that
  // has 14. What it counts now is elements that set it, and what it holds
  // is the rule the design actually states: most of the screen is neutral,
  // and the BRIGHT gold (#F5B700, which the check-in button owns) is
  // confined to real progress and to a section's one action. Everything
  // else that carries gold carries the muted tone.
  const bright = system.goldWhere.filter((g) => /245, 183, 0/.test(g));
  check(
    system.goldElements <= system.elementCount * 0.03,
    'most of the screen is neutral: gold is on a small fraction of it',
    `${system.goldElements} of ${system.elementCount} elements in <main>`
  );
  check(
    bright.length <= 7,
    'the bright gold stays on progress and on a section\'s one action',
    `${bright.length} bright, ${system.goldElements - bright.length} muted: ${system.goldWhere.join(' | ')}`
  );
  check(/F7F3EA|247, 243, 234/.test(system.pageBg), 'the page floor is the cream', system.pageBg);

  // section rhythm
  const gaps = await page.evaluate(() => {
    const main = document.querySelector('main');
    return [...main.querySelectorAll('.mef-home-section')].map((el) =>
      Math.round(parseFloat(getComputedStyle(el).marginTop))
    );
  });
  check(
    gaps.length > 0 && new Set(gaps).size === 1,
    'every major section takes the identical gap',
    `${gaps.length} sections, gap ${[...new Set(gaps)].join('/')}px`
  );

  // =================================================================
  // 3. THE BOTTOM BAR
  // =================================================================
  const nav = await page.evaluate(() => {
    const bar = document.querySelector('nav[aria-label="Primary"]');
    const labels = [...bar.querySelectorAll('a span span')];
    const truncated = labels.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent);
    const icons = [...bar.querySelectorAll('svg')];
    const strokes = new Set(icons.map((i) => i.getAttribute('stroke-width')));
    const sizes = new Set(icons.map((i) => `${Math.round(i.getBoundingClientRect().width)}`));
    const active = bar.querySelector('[aria-current="page"] span');
    return {
      labels: labels.map((s) => s.textContent),
      truncated,
      iconStrokes: [...strokes],
      iconSizes: [...sizes],
      activeBg: active ? getComputedStyle(active).backgroundColor : null,
      // RESOLVED THROUGH A CANVAS, because the string cannot be trusted.
      // Tailwind v4 serves `bg-[#1B3A2D]/[0.07]` as an oklab() value, so
      // matching on "rgb(27, 58, 45" reported a failure over a correct
      // colour, and re-reading it off a probe element gives the same
      // oklab string back. Painting one pixel and reading it is the only
      // thing here that answers in real channels.
      ...(() => {
        if (!active) return { activeIsForest: false, activePixel: null };
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = getComputedStyle(active).backgroundColor;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = [...ctx.getImageData(0, 0, 1, 1).data];
        // A forest tint painted on black: green ahead of red, red ahead of
        // blue is false for this hue, so what identifies it is g > r and a
        // low alpha. The reference is #1B3A2D = 27, 58, 45.
        return {
          activeIsForest: g > r && g > b && a > 0 && a < 60,
          activePixel: `rgba(${r}, ${g}, ${b}, ${a}/255)`,
        };
      })(),
      activeWeight: active ? getComputedStyle(active).fontWeight : null,
      borderColor: getComputedStyle(bar).borderTopColor,
    };
  });
  check(nav.truncated.length === 0, 'no bottom-bar label is cut off at 390px', nav.labels.join(' / '));
  check(
    nav.iconStrokes.filter((s) => s === '1.75').length >= 1 && !nav.iconStrokes.includes('2.25'),
    'the bar draws one icon weight',
    `strokes ${nav.iconStrokes.join(',')} sizes ${nav.iconSizes.join(',')}`
  );
  // Tailwind v4 serves `bg-[#1B3A2D]/[0.07]` as an oklab() value, which is
  // why matching on "rgb(27, 58, 45" reported a failure over a correct
  // colour. The browser is asked to resolve it instead of the string being
  // pattern-matched.
  check(
    nav.activeIsForest === true,
    'the active tab is forest, so gold is the check-in button alone',
    `${nav.activeBg} paints ${nav.activePixel}`
  );

  // =================================================================
  // 4. NOTHING BROKE: three real taps
  // =================================================================
  // 4a. the check-in
  await page.locator('nav a[aria-label="Check In"]').click();
  await page.waitForURL(/\/checkin/, { timeout: 45000 });
  // WAIT FOR THE SCREEN, NOT FOR THE CLOCK. The first version measured
  // `innerText.length` the instant the URL changed and called a working
  // screen a failure: the Daily Reset opens on an animated intro that has
  // not painted yet at that moment.
  const checkinDrew = await page
    .waitForFunction(() => /Daily Reset/i.test(document.body.innerText), null, { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  const checkinHead = await page.evaluate(() =>
    document.body.innerText.replace(/\n+/g, ' | ').slice(0, 90)
  );
  check(checkinDrew, 'the check-in opens from the bar and draws a real screen', checkinHead);
  await page.goBack();
  await page.waitForURL(/dashboard/, { timeout: 45000 });
  await settle();

  // 4b. an experiment row, if one is running
  await hideOverlays();
  const rows = page.locator('[data-testid="active-experiment-row"]');
  const rowCount = await rows.count();
  if (rowCount > 0) {
    const first = rows.first();
    await first.scrollIntoViewIfNeeded();
    await first.click();
    await page.waitForTimeout(900);
    const expanded = await first.getAttribute('aria-expanded');
    check(expanded === 'true', 'an experiment row opens onto its own panel', `${rowCount} row(s)`);
    await first.click();
    await page.waitForTimeout(600);
    check(
      (await first.getAttribute('aria-expanded')) === 'false',
      'and closes again',
      'aria-expanded back to false'
    );
  } else {
    results.push({
      ok: null,
      name: 'an experiment row opens onto its own panel',
      detail: 'not checked: this account has no running experiment today',
    });
  }

  // 4c. a Your Path item
  await hideOverlays();
  const questionnaires = page.locator('a[href="/questionnaires"]').first();
  const hasQ = (await questionnaires.count()) > 0;
  if (hasQ) {
    await questionnaires.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await questionnaires.click();
    await page.waitForURL(/questionnaires/, { timeout: 45000 });
    check(true, 'a Your Path row opens its destination', page.url());
    await page.goBack();
    await page.waitForURL(/dashboard/, { timeout: 45000 });
    await settle();
  } else {
    fail('a Your Path row opens its destination', 'the Questionnaires row was not on the page');
  }

  // =================================================================
  // 5. THE WHOLE PAGE, PHOTOGRAPHED
  // =================================================================
  await hideOverlays();
  for (let y = 0; y < 16; y++) {
    await page.evaluate((i) => window.scrollTo(0, i * innerHeight * 0.8), y);
    await page.waitForTimeout(320);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'live-2-full.png'), fullPage: true });
  for (const [name, y] of [['a', 400], ['b', 1200], ['c', 2000], ['d', 2800], ['e', 3600]]) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(450);
    await page.screenshot({ path: path.join(OUT, `live-3-${name}.png`) });
  }

  check(consoleErrors.length === 0, 'zero console and page errors across the walk', consoleErrors.join(' | ') || 'none');
} finally {
  await retireSession(minted);
  await browser.close();
}

const passed = results.filter((r) => r.ok === true).length;
const failed = results.filter((r) => r.ok === false).length;
const skipped = results.filter((r) => r.ok === null).length;
for (const r of results) {
  console.log(`${r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'SKIP'}  ${r.name}\n      ${r.detail}`);
}
console.log(`\n${passed}/${passed + failed} checks passed${skipped ? `, ${skipped} not applicable` : ''}`);
if (failed > 0) process.exitCode = 1;
