import '@fontsource/newsreader/400.css';
import './style.css';
import { paintPaper } from './background';
import { config } from './config';
import { drawCracks, generateCracks, mulberry32, progressFromAmount } from './cracks';
import { DebugOverlay } from './debug';
import { FistSignal } from './fist';
import { HoldInput } from './input';
import { pickMessage } from './messages';
import { BrokenScene } from './scene';
import { saveFortune } from './save';
import { Sound } from './audio';
import { Tracker, createLandmarker, startCamera, stopCamera } from './tracker';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('cam');
const cookie = $('cookie');
const cookieImg = $<HTMLImageElement>('cookie-img');
const crackCanvas = $<HTMLCanvasElement>('cracks');
const hint = $('hint');
const note = $('note');
const paper = $<HTMLCanvasElement>('paper');

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const debug = new DebugOverlay($<HTMLCanvasElement>('debug'));
const fist = new FistSignal();
const hold = new HoldInput(cookie);
const sound = new Sound();
// browsers only allow audio after a gesture; the context is created on the first one
const soundNote = $('sound-note');
const soundBtn = $<HTMLButtonElement>('sound');
// Sound is on by default and the note always states the current state. Browsers only start audio after
// a gesture, so the context is created on the first click or key press (without toggling anything).
let audioUnlocked = false;
let unlockedAt = 0;
function renderSound() {
  const on = !sound.muted;
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Sound on. Turn sound off' : 'Sound off. Turn sound on');
  soundNote.textContent = !on ? 'Sound off · press M to unmute'
    : sound.blocked ? 'Sound on · your browser needs one click to start it'
    : 'Sound on · press M to mute';
}
for (const ev of ['pointerdown', 'keydown'] as const) {
  addEventListener(ev, () => {
    if (audioUnlocked) return;
    audioUnlocked = true;
    unlockedAt = performance.now();
    sound.unlock();
    renderSound();
  }, { passive: true });
}
sound.init();
void sound.probe().then(renderSound);
setInterval(renderSound, 1000);
const toggleMute = () => { sound.setMuted(!sound.muted); renderSound(); };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) toggleMute();
});
soundBtn.addEventListener('click', () => {
  if (performance.now() - unlockedAt < 800) return; // this very click just turned the sound on
  toggleMute();
});

/** Combined fist amount 0..1: hand tracking and pointer/keyboard hold, whichever is higher. */
export const getAmount = () => Math.max(fist.smoothed, hold.amount);

// idle -> cracking -> broken -> resetting -> idle. New modes can hook into this switch.
type State = 'idle' | 'cracking' | 'broken' | 'resetting';
let state: State = 'idle';
let cracks = generateCracks(1);
let snapped = cracks.map(() => false);   // which pieces have already given way (for the snap sounds)
let cameraOn = false;
let cameraPending = true;   // hint stays hidden until we know which input to describe

const scene = new BrokenScene({
  cookie, cookieImg, swatch: $<HTMLImageElement>('swatch'),
  halfL: $<HTMLImageElement>('half-l'), halfR: $<HTMLImageElement>('half-r'),
  strip: $('strip'), text: $('fortune'), crumbLayer: $('crumbs'), flash: $('flash'), scene: $('scene'),
}, reduceMotion);

let armed = true;          // must see the cookie relaxed once before cracking can start
let peak = 0;              // crack progress is latched: only retreats below crackRetreatBelow
let aboveMs = 0;           // time spent at/above the break threshold
let brokenAt = 0;
let resetAt = 0;

function newCookie() {
  cracks = generateCracks(Math.floor(mulberry32(Date.now())() * 1e9));
  snapped = cracks.map(() => false);
}

function sizeCrackCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  crackCanvas.width = Math.round(cookie.offsetWidth * dpr);
  crackCanvas.height = Math.round(cookie.offsetHeight * dpr);
}

function showNote(text: string) {
  note.textContent = text;
  note.classList.add('show');
  setTimeout(() => note.classList.remove('show'), 5000);
}

function hintText() {
  return cameraOn ? 'Make a fist, or press and hold, to crack' : 'Press and hold to crack';
}

// low-frequency wobble: a few slow sines with random phases/frequencies (not a regular buzz)
const wob = Array.from({ length: 6 }, (_, i) => ({
  f: 0.7 + Math.random() * 1.6 + i * 0.15, p: Math.random() * 6.28,
}));
const wobble = (t: number, k: number) =>
  (Math.sin(t * wob[k].f + wob[k].p) + 0.6 * Math.sin(t * wob[k + 3].f * 1.9 + wob[k + 3].p)) / 1.6;

function triggerBreak(now: number) {
  state = 'broken';
  brokenAt = now;
  scene.start(now, pickMessage());
  sound.crack();
  sound.paper(0.15);
}

function triggerReset(now: number) {
  if (state !== 'broken') return;
  state = 'resetting';
  resetAt = now;
}

// Reset is explicit: the "Open another" button (keyboard-reachable, so Enter/Space work when focused).
const again = $<HTMLButtonElement>('again');
const actions = $('actions');
again.addEventListener('click', () => { again.blur(); triggerReset(performance.now()); });
$('save').addEventListener('click', () => { void saveFortune($('fortune').textContent ?? ''); });

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  hold.update(dt);
  const a = getAmount();
  const t = now / 1000;
  let shown = 0;
  let cookieOpacity = 1, cookieScale = 1, hideCookie = false;

  if (!armed && a < config.crackStart) armed = true;

  if (state === 'idle' || state === 'cracking') {
    if (armed) {
      if (a < config.crackRetreatBelow || a >= peak) peak = a;   // retreat only below 0.3
      shown = state === 'cracking' || a > config.crackStart ? Math.max(a, peak) : a;
      if (a < config.crackRetreatBelow) shown = a;
      if (a >= config.breakThreshold) aboveMs += dt * 1000;
      else if (a < config.crackRetreatBelow) aboveMs = 0;
      state = shown > config.crackStart ? 'cracking' : 'idle';
      if (state === 'cracking') {
        // each piece makes a small snap the moment its crack starts to open; re-arms if the fist relaxes
        const p = progressFromAmount(shown);
        cracks.forEach((f, i) => {
          if (!snapped[i] && p >= f.start + 0.02) { snapped[i] = true; sound.snap(p, Math.random() * 0.05); }
          else if (snapped[i] && p < f.start - 0.08) snapped[i] = false;
        });
      }
      if (state === 'cracking' && aboveMs >= config.breakHoldMs) triggerBreak(now);
    }
  } else if (state === 'broken') {
    const r = scene.update(now);
    hideCookie = r.hideCookie;
    cookieScale = r.pulse;
  } else if (state === 'resetting') {
    const rt = now - resetAt;
    scene.update(now);
    const fadeMs = reduceMotion ? 150 : 400;
    scene.fade(Math.min(1, rt / fadeMs));
    hideCookie = rt < fadeMs;
    if (rt >= fadeMs) {
      if (scene.active) { scene.clear(); newCookie(); peak = 0; aboveMs = 0; armed = false; }
      const p = Math.min(1, (rt - fadeMs) / (reduceMotion ? 150 : 500));
      cookieOpacity = p;
      cookieScale = reduceMotion ? 1 : 0.96 + 0.04 * (1 - Math.pow(1 - p, 3));
      if (p >= 1) state = 'idle';
    }
  }

  const wantHint = (state === 'idle' || state === 'cracking') && !cameraPending;
  const showAgain = state === 'broken' && now - brokenAt > 1100;
  actions.classList.toggle('show', showAgain);
  actions.inert = !showAgain;
  hint.textContent = hintText();
  hint.style.opacity = wantHint ? '0.85' : '0';

  let tx = 0, ty = 0, rot = 0, scale = cookieScale;
  if (!reduceMotion && (state === 'idle' || state === 'cracking')) {
    if (state === 'idle') scale = 1 + 0.005 * (1 + Math.sin((t / 4) * Math.PI * 2)); // 1.00..1.01, 4 s
    const k = shown * shown;
    tx = wobble(t, 0) * k * config.shakeMaxPx;
    ty = wobble(t, 1) * k * config.shakeMaxPx;
    rot = wobble(t, 2) * k * config.shakeMaxDeg;
  }
  cookie.style.visibility = hideCookie ? 'hidden' : 'visible';
  cookie.style.opacity = String(cookieOpacity);
  cookie.style.transform = `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`;

  // keep the fractured cookie on screen until the halves replace it, so it does not snap back to whole
  const drawAmt = state === 'idle' || state === 'cracking' ? shown : state === 'broken' && now - brokenAt < 120 ? 1 : 0;
  const fractured = drawCracks(crackCanvas, cookieImg, cracks, drawAmt);
  cookieImg.style.opacity = fractured ? '0' : '1';
  requestAnimationFrame(frame);
}

async function initTracking() {
  try {
    const lm = await createLandmarker();
    await startCamera(video);
    const tracker = new Tracker(lm, video);
    // Privacy: release the camera when the page is hidden or closed, and take it back when it returns.
    addEventListener('pagehide', () => stopCamera(video));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopCamera(video);
      else startCamera(video).catch(() => { cameraOn = false; });
    });
    cameraOn = true;
    cameraPending = false;
    void sound.probe().then(renderSound); // an active camera may let the browser start audio without a click
    let image: Parameters<DebugOverlay['draw']>[1] = null;
    const loop = (now: number) => {
      const r = tracker.step(now);
      if (r) image = r.image;
      // Only feed real frames while a hand is present; keep relaxing every frame once it's lost.
      if (r) fist.update(r.world, now);
      else if (!fist.handPresent) fist.update(null, now);
      debug.draw(video, image, fist.raw, fist.smoothed, state);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    cameraOn = false;
    cameraPending = false;
    showNote("Couldn't reach the camera, so hold the cookie instead.");
  }
}

paintPaper(paper);
sizeCrackCanvas();
addEventListener('resize', () => { paintPaper(paper); sizeCrackCanvas(); });
cookieImg.addEventListener('load', sizeCrackCanvas);
// exposed for the break/reset flow in the next stage
(window as unknown as { newCookie: () => void }).newCookie = newCookie;
requestAnimationFrame(frame);
scene.preload();
scene.enableDrag();
initTracking();
