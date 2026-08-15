#!/usr/bin/env node
/**
 * Runs the REAL pose model against a figure drawn from behind and prints
 * what it reports for the face landmarks.
 *
 * This is the audit that confirmed the back-view bug. The back view used
 * to refuse to pass until the average visibility of the nose, eyes and
 * ears fell below 0.5, on the assumption that a turned-away person's face
 * landmarks would stop being reported. They do not. The model predicts all
 * 33 landmarks for any detected person whether or not it can see them, and
 * `visibility` answers "is this point in frame and not behind something
 * else", not "can the camera see this person's face".
 *
 * The input is a drawn figure with NO FACE ON IT AT ALL, seen from behind,
 * committed at tests/fixtures/facing/back-facing-figure.png. The model
 * still reports a nose, two eyes and two ears, all around 0.95 visibility.
 * That is the whole finding: no threshold could have made the old check
 * work, because the face never disappears.
 *
 * One honest limitation, worth stating rather than glossing: a drawn
 * symmetric figure gives the model no cue about which way it faces, so it
 * guesses, and the left/right ORDERING it produces here is not a valid
 * test of the replacement signal. Ordering is validated instead with
 * hand-built landmark sets in tests/facing-detection.test.ts, where the
 * facing is known by construction. What this script establishes is only
 * the face-visibility fact, which is what the old check depended on.
 *
 * Needs network access on first run (the model and WASM come from
 * MediaPipe's CDN, same as the app itself).
 *
 * Run, from apps/consumer-web-app:
 *   node scripts/audit-facing-landmarks.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const files = {
  '/front.png': readFileSync('tests/fixtures/facing/front-facing-figure.png'),
  '/back.png': readFileSync('tests/fixtures/facing/back-facing-figure.png'),
};
const server = http.createServer((req, res) => {
  const body = files[req.url];
  if (body) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(body); }
  else { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><body></body>'); }
});
await new Promise((r) => server.listen(8199, r));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => console.log('[page]', m.text()));
await page.goto('http://localhost:8199/');

const out = await page.evaluate(async () => {
  const { FilesetResolver, PoseLandmarker } = await import(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs'
  );
  const fileset = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
  );
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
      delegate: 'CPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  });
  const NAMES = ['nose','leftEyeInner','leftEye','leftEyeOuter','rightEyeInner','rightEye','rightEyeOuter','leftEar','rightEar','mouthLeft','mouthRight','leftShoulder','rightShoulder','leftElbow','rightElbow','leftWrist','rightWrist','leftPinky','rightPinky','leftIndex','rightIndex','leftThumb','rightThumb','leftHip','rightHip','leftKnee','rightKnee','leftAnkle','rightAnkle','leftHeel','rightHeel','leftFootIndex','rightFootIndex'];
  const results = {};
  for (const name of ['front', 'back']) {
    const img = new Image();
    img.src = `/${name}.png`;
    await img.decode();
    const r = landmarker.detect(img);
    const pts = r.landmarks?.[0];
    if (!pts) { results[name] = { detected: false }; continue; }
    const pick = (n) => { const i = NAMES.indexOf(n); return { x: +pts[i].x.toFixed(4), v: +(pts[i].visibility ?? 1).toFixed(4) }; };
    results[name] = {
      detected: true,
      nose: pick('nose'), leftEye: pick('leftEye'), rightEye: pick('rightEye'),
      leftEar: pick('leftEar'), rightEar: pick('rightEar'),
      leftShoulder: pick('leftShoulder'), rightShoulder: pick('rightShoulder'),
      leftHip: pick('leftHip'), rightHip: pick('rightHip'),
    };
  }
  return results;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
