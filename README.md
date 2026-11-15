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
3. The build has two shorter scroll stops: guitar plus keys, then guitar plus keys and rhythm. Chapter navigation enters at keys; the next scroll or Bring in rhythm button reveals rhythm. Reversing scroll removes rhythm before keys. The switches let you compare their parts.
4. Harmony turns on in the right deck. Keeping it moves its card into the song.
5. Continuing the scroll carries Harmony from the right record into its row on the left. The card follows the scroll in both directions; its sound moves from preview to the song on arrival, and only then does the recording CTA appear, even without a choice in scene 4. Record over all four parts or start empty. A microphone button controls capture; the right record previews the take.

Scroll continuously unfolds layer cards from the record and opens the second deck. One GSAP tween controls both the scroll position and the scene. A native scroll listener observes direct scrollbar movement; GSAP is the sole animation owner. After 0.55 seconds without input, the scene settles into its selected anchor over 1.5 seconds with a gentle sine easing. Harmony receives an additional 2.4 seconds across its travel interval, including large gestures, and its card stays upright and readable. The Keep button uses a 2.2-second transfer. Refreshes preserve pending snap intent. Any new input cancels settling and continues from the visible frame; reversing direction discards queued forward movement. A short downward gesture advances and an upward gesture returns, even before crossing the midpoint. Wheel, touch, keyboard, and native scrollbar movement share a boundary at the next anchor. Both the scroll position and rendered playhead are constrained, so momentum cannot skip the keys-only stop. Momentum from one burst stays bounded at its anchor. A new wheel gesture, touch gesture, or key press can advance beyond a pending anchor immediately; it never waits for the scene animation to finish; reversing direction interrupts settling. Reversing scroll folds the setup back and restores each scene’s demo mix. Keeping a layer animates its card from the right record into the song without delaying or duplicating the audio.

The tonearm and stylus use one pivot; the playing stylus lands within the groove area. The tour introduces platter, tonearm, stylus and groove using [Audio-Technica terminology](https://www.audio-technica.co.jp/document/AT-LP2022/en/Content/Turntable/AT-LP2022/part-names/names-tonearm.html). Reduced-motion preferences use direct state changes and immediate settling instead of travelling animations.

Each scene entry restores its demo preset: guitar in scenes 1–2, guitar/keys/rhythm in scene 3, and all four parts in scenes 4–5. Layer switches can be tried within a scene; re-entering it restores the preset. Scrolling never starts paused audio, so press Play once to hear the tour. This scene control stops in the recording workspace, where the mix and recorded takes stay under your control. Hardware callouts are available through Show part names in the opening scene.

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
