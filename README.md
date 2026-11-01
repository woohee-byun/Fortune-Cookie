# Fortune Cookie

Make a fist at your webcam and a fortune cookie cracks open, then a short message appears.
Everything runs locally in the browser. There is no backend, no account, and nothing is uploaded or saved.
Camera frames never leave the page, and the camera stops when the tab is hidden or closed.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173 and allow the camera. Camera access only works on `localhost` or HTTPS.

If the camera is denied or missing, the app falls back to pointer mode: press and hold the cookie
(or hold Space / Enter). Touch screens work too.

### Required local files

These must exist (nothing loads from a CDN, so it works offline):

| Path | What |
| --- | --- |
| `public/models/hand_landmarker.task` | MediaPipe Hand Landmarker model |
| `public/wasm/` | Copied from `node_modules/@mediapipe/tasks-vision/wasm` |
| `public/assets/` | Cookie, halves, crumbs, texture swatch |

Download the model if it is missing:

```bash
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
```

Copy the WASM files (after `npm install`):

```bash
cp node_modules/@mediapipe/tasks-vision/wasm/* public/wasm/
```

## Controls

- Close your hand slowly: the cookie cracks. Fully closed, it breaks and a fortune rises out.
- **Open another** starts a new cookie. **Save fortune** downloads the strip as a PNG.
- `D` toggles the debug overlay (landmarks, raw and smoothed fist value, state). Use it to tune `r_open` and `r_closed`.
- Sound is on by default (browsers only start audio after the first click or key press). Press `M` or use the speaker button (top right) to mute and unmute.

## Tuning

All start values live in `src/config.ts`. Colors are CSS variables at the top of `src/style.css`.
If your fist never breaks the cookie, check the smoothed value with `D` and lower `breakThreshold` or raise `r_closed`.

## Deploy

```bash
npm run build
```

Upload the `dist/` folder to any static host (it must be served over HTTPS for camera access).
Set Vite's `base` in `vite.config.ts` if the site is not served from the domain root.

## Notes

- Reduced motion (`prefers-reduced-motion`): no shake or breathing, shorter fades, fewer crumbs.
- Image licensing: see `CREDITS.md`.
