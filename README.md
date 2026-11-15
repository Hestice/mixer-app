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

Scroll continuously unfolds layer cards from the record and opens the second deck. Wheel, touch, keyboard, and scrollbar input use native browser scrolling and can cross the entire story in one uninterrupted gesture. Anchors do not cap travel or require another gesture. After 0.1 seconds without active input, GSAP settles the scene at the next anchor in the last scroll direction using the remaining fraction of a 1.5-second transition (2 seconds for the harmony interval). Halfway through an interval leaves half its duration. Landing directly on an anchor keeps it there. New input interrupts settling immediately. Wheel momentum does not restart the active-input timer: the browser's momentum flag is used when available, with a conservative decay estimate otherwise. Inferred release timing is approximate; renewed acceleration, a reversal, or sustained steady input returns control to native scrolling. Only residual momentum is canceled after settling starts. If a browser cannot cancel wheel inertia, settling falls back to waiting for that tail rather than fighting native movement. Touch and scrollbar release and keyboard keyup start their own 0.1-second timers; holding a scroll key keeps scrolling uninterrupted.

Keys and rhythm remain separate resting points when you release between them. While actively scrolling, the story follows your pace, including through the harmony transfer. After release, harmony settling scales with the distance left between its anchors, up to 2 seconds; its upright card moves through the empty fourth-row space. The Keep button uses a 2.2-second transfer. Reversing scroll folds the setup back and restores each scene’s demo mix.

The tonearm and stylus use one pivot; the playing stylus lands within the groove area. The tour introduces platter, tonearm, stylus and groove using [Audio-Technica terminology](https://www.audio-technica.co.jp/document/AT-LP2022/en/Content/Turntable/AT-LP2022/part-names/names-tonearm.html). Reduced-motion preferences use direct state changes and immediate settling instead of travelling animations.

Each scene entry restores its demo preset: guitar in scenes 1–2, guitar/keys/rhythm in scene 3, and all four parts in scenes 4–5. Layer switches can be tried within a scene; re-entering it restores the preset. Scrolling never starts paused audio, so press Play once to hear the tour. This scene control stops in the recording workspace, where the mix and recorded takes stay under your control. Hardware callouts are available through Show part names in the opening scene.

The recording console has a shared waveform timeline, per-layer volume and solo controls, and WAV downloads. All takes record freely until Stop; shorter parts play once and remain silent after their end.

## Project layout

- `apps/web`: Next.js App Router, React, Web Audio and microphone capture through an AudioWorklet.
- `apps/api`: NestJS health endpoint and demo metadata.
- `scripts/generate-demo.py`: reproducible synthesis of the four original demo parts and waveform data.
- `PRODUCT_RESEARCH.md` and `LANDING_EXPERIENCE.md`: product research and the earlier storyboard.

The interface works without the API. Audio stays in the browser, and the API has no recording upload endpoint.

## Current limits

Songs autosave locally in IndexedDB, including WAV recordings, the take under review, title, layer order, mute/volume, tempo and count-in. `/songs` lists saved sessions; `/studio?song=<id>` reopens one without playing audio or requesting microphone access. Audible clicks require headphone confirmation again.

A stopped take saves before Keep; Keep only adds it to the composition. Wait for “Saved on this device” before closing. An active recording is still in memory until Stop, and closing mid-recording can lose that take. Browser storage is specific to the browser profile and site origin, can run out or be cleared, and is not cloud backup. Downloads remain available. There is no combined audio export yet.

Saves serialize per session and commit audio, review state and the library summary together. Revision checks reject stale-tab overwrites. Storage failures leave the previous save intact, show a retry/download message and warn before leaving. A failed or missing-session load never autosaves an empty replacement.

Browser and device latency can affect overdub timing. Headphones reduce acoustic bleed; the app cannot guarantee isolation from speakers or leaking headphones. Browser QA used a synthetic microphone to verify record/review/keep, a longer second take, canceled retry recovery, and silence in the captured take while clicks and backing audio played. Real microphone recording still needs a device smoke test.

The demo instruments are synthesized, including the harmony. They are not extracted stems or generated singing. Source separation, vocal harmonization, lessons and collaboration remain future product work.

## Hosting

This repository can stay separate from the portfolio. A future subdomain can point to its own deployment. Deploy the Next.js app and NestJS API independently, then set the web app's `API_URL`; production recording requires HTTPS.

## Design review

The disc controls, labels and interface copy were reviewed using [deslop](https://github.com/jarrheyd/skills/blob/main/skills/writing/deslop/SKILL.md). The review removed repeated actions, ornamental captions and background effects while preserving the scroll story and turntable controls.

## Recording console

Open `/studio` for an empty session, or enter from either recording action at the end of the tour. The console keeps a compact playable turntable, a shared waveform timeline, and a dedicated recording panel.

- Connect a microphone, check its input meter, name the part, and optionally use a four-beat count-in.
- Every take records freely until Stop. Existing parts play once from the start; they do not loop or limit the new take. Each waveform retains its own length.
- Review the take alone or with the song, keep it as a layer, or try another take. The previous take remains available until its replacement succeeds. Undo last keep moves the layer back into review.
- A visual metronome is enabled by default. Sound requires an explicit headphone confirmation. Clicks route only to the listening output; the AudioWorklet captures only the microphone and outputs silence. Speaker or headphone leakage can still enter a physical microphone, so use wired headphones at a low volume. The app cannot detect the output device or guarantee acoustic isolation.
- Microphone capture and backing-track starts share the AudioContext clock. Hardware input/output latency still depends on the device; hardware latency calibration is not yet implemented.
- Recordings download as individual PCM WAV files. Sessions autosave locally and reopen from My songs. A full-song export is not yet implemented.
