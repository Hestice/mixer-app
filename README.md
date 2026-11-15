# Listening room

An Nx workspace with a Next.js music interface and a NestJS API. The working name is temporary.

## Run locally

Use Node 22 and pnpm 12:

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. The API runs on port 3333; Next.js forwards `/api/*` to it. Set `API_URL` when running the API elsewhere.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## The first session

The opening tour introduces controls through five scroll chapters:

1. Listen to one guitar recording on a single record.
2. Reveal the guitar as a layer with an on/off switch.
3. Add rhythm and keys through matching layer switches.
4. Reveal the right deck for a new layer. Try a harmony, then keep it in the song on the left.
5. Record over the song or start with an empty one. A microphone button controls capture; the right record previews the take.

Scroll continuously unfolds layer cards from the record and opens the second deck. GSAP ScrollTrigger smooths the scroll-driven playhead with a 0.3-second scrub. After scrolling stops for 0.4 seconds, it eases to the nearest of five complete scenes over 0.65–1.05 seconds. Snapping has no directional or momentum bias, and new scrolling interrupts it. Reversing scroll folds the setup back to the opening record without changing the mix. Keeping a layer animates its card from the right record into the song without delaying or duplicating the audio.

The tonearm and stylus use one pivot; the playing stylus lands within the groove area. The tour introduces platter, tonearm, stylus and groove using [Audio-Technica terminology](https://www.audio-technica.co.jp/document/AT-LP2022/en/Content/Turntable/AT-LP2022/part-names/names-tonearm.html). Reduced-motion preferences use direct state changes and immediate settling instead of travelling animations.

Scroll changes the scene without changing the mix. New controls appear as they are introduced. A pending preview has a return link when revisiting earlier chapters, and must be kept or removed before recording starts. Hardware callouts are available through Show part names in the opening scene.

In the recording session, Mix controls exposes volume and solo controls. Each kept recording has a download action. A first recording sets the loop length, up to two minutes; later recordings last one loop.

## Project layout

- `apps/web`: Next.js App Router, React, Web Audio and MediaRecorder.
- `apps/api`: NestJS health endpoint and demo metadata.
- `scripts/generate-demo.py`: reproducible synthesis of the four original demo parts and waveform data.
- `PRODUCT_RESEARCH.md` and `LANDING_EXPERIENCE.md`: product research and the earlier storyboard.

The interface works without the API. Audio stays in the browser, and the API has no recording upload endpoint.

## Current limits

Recordings exist only in the open tab. Download each take before closing or refreshing; there is no project storage or combined audio export yet.

Browser and device latency can affect overdub timing. Headphones prevent the accompaniment from bleeding into the microphone. Real microphone recording still needs a device smoke test; automated checks cover audio scheduling, loop position and layer commitment.

The demo instruments are synthesized, including the harmony. They are not extracted stems or generated singing. Source separation, vocal harmonization, lessons and collaboration remain future product work.

## Hosting

This repository can stay separate from the portfolio. A future subdomain can point to its own deployment. Deploy the Next.js app and NestJS API independently, then set the web app's `API_URL`; production recording requires HTTPS.

## Design review

The disc controls, labels and interface copy were reviewed using [deslop](https://github.com/jarrheyd/skills/blob/main/skills/writing/deslop/SKILL.md). The review removed repeated actions, ornamental captions and background effects while preserving the scroll story and turntable controls.
