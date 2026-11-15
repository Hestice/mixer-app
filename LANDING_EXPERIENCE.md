# Listening room experience proposal

15 November 2026 / Product storyboard and implementation notes

Marcus wants a minimalist modern interface inspired by Apple, preserving the shape of a retro DJ setup. The opening should use ordinary downward scrolling to reveal an interactive story within a persistent scene. It gradually introduces the decks and hands the same interface to the visitor for their first recording. The proposal below records the intended experience. A first prototype now implements the scroll story, playable demo layers and browser recording. The latest control decision puts capture on a microphone button beside the right disc; the disc previews the candidate and displays recording activity. See README.md for current limits.


Current walkthrough revision: the console starts as one playable record, reveals the guitar layer, then adds keys and rhythm switches. The second deck appears when introducing a new trial layer. Harmony uses the same layer treatment and joins the left song when kept. Recording follows that same pattern with a separate microphone control. Volume and solo controls stay in the recording workspace; the tour keeps short, contextual instructions.

## The two decks

The left deck holds the music so far. The right deck holds the next layer being explored, rehearsed, recorded, or reviewed. Keeping a layer moves it into the composition on the left and makes the right ready for another part. Two decks therefore support many layers rather than imposing a two-track limit.

| Element | Demo exploration | Personal recording |
| --- | --- | --- |
| Left deck, Music so far | The demo's committed layers, with individual on/off, hear-alone, and volume controls. | All layers the person has kept. Initially empty for a new idea. |
| Right deck, Next layer | A prepared example part, such as a harmony, available to preview alone or with the left deck. | The current rehearsal, recording, or uncommitted take, available to review, retry, and keep. |
| Center playback control | Plays or pauses the currently enabled committed layers plus the candidate when its preview is enabled. | Plays the chosen context for rehearsal or review. During recording, a prominent Stop recording action takes priority. |
| Layer strip | Named parts belonging to the left composition; candidate identified separately on the right. | Every kept layer remains individually accessible. Selecting a layer exposes its controls. |

The candidate remains separate until the user chooses Keep layer. Keeping it adds that same take to the left, removes its candidate instance from the right, and preserves existing layers. There must be no duplicate playback, overwriting, or flattening of the earlier parts.

The two sides share a musical time reference. They do not have independent song speeds, scratch gestures, or a crossfader. The left platter focuses the composition; the right focuses the current layer. Clearly labeled controls handle playback, recording, and keeping. During review, Hear alone isolates the candidate; Hear together restores it alongside the selected left-side layers.

When recording over existing music, the left supplies the accompaniment and the right captures the new performance. For an entirely new idea, the left stays quiet until the first take is kept. Afterward, the next recording repeats the same cycle.

## Visual direction

Place one compact sculptural console in an open canvas. Two graphite circular decks and a small center section preserve the DJ silhouette. Satin aluminum, warm pearl surfaces, soft shadows, and restrained rounding provide shallow depth. A small amber accent identifies audible music; red is reserved for recording. Avoid furnished-room props, worn tape textures, full-size instruments, or decorative hardware.

Use recognizable guitar, microphone, and drum symbols next to the layer names. The symbol identifies the source; the name identifies the part, so Lead voice and Harmony can share a microphone symbol while remaining distinct recordings. A microphone symbol for recording does not imply that only vocals can be captured.

[Apple's current materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) recommends restrained use of Liquid Glass for controls and navigation, distinct from content. Borrow that hierarchy with a subtle translucent playback control and solid musical content surfaces. Keep one primary playback control, correcting the duplicate shown in the static concept image.

## How scrolling works

The visitor uses familiar wheel, trackpad, touch, or keyboard scrolling. The visual stage stays in view while the composition, emphasis, and short captions change with scroll position. Avoid forcing automatic scroll, stealing direction, timed slide advancement, or requiring a sequence of gestures to proceed.

Use five short chapters: arrive, hear a part, discover the layers, understand the second deck, and make your own. A subtle progress indicator and optional Next/Back actions make position understandable. Keep Skip to recording available from the beginning.

Scroll position controls presentation, not musical time or recording state. It can reveal an instrument symbol, unfold the layer strip, or bring the second deck into emphasis. It does not start recording, request microphone access, scrub the audio, alter the user's selected mix, or discard a take.

An explicit Listen action starts sound. Scrolling alone can tell the story silently; no listening interaction is compulsory. Once audio starts, pause and volume remain available. Reverse scrolling changes the explanation and emphasis without resetting musical choices. If a visitor moves quickly through the story, show the destination scene directly rather than playing a queue of missed animations.

Only use modest camera or layout movement while introducing the console. Keep it still while someone operates the controls. The story is a progressive reveal of a usable instrument, not a prerequisite to access it.

## Chapter 1 Arrival

The site opens on an airy canvas with the console's silhouette present but understated. The left deck is closest to visual focus; the right is visible enough to suggest something to discover.

One short line reads: “A song starts with one idea.” Beneath it: “Scroll to explore.” A small Skip to recording action is visible from the start.

No sound plays. The emotional invitation is quiet curiosity rather than a marketing explanation.

## Chapter 2 Hear one part

The first scroll movement brings the left deck and a Guitar layer into focus. The deck is labeled Music so far, with a small Demo identifier.

The invitation reads: “Start with a little guitar.” A clear Listen action plays the prepared phrase, shows the active state, and moves the waveform's playhead. A subtle platter response reinforces playback, rather than moving continuously while silent.

The visitor can stop here and listen, keep scrolling, or skip into recording. The story never waits for a mandatory interaction.

## Chapter 3 Discover the layers

Continuing to scroll unfolds the compact layer strip attached to the left deck. Guitar, Lead voice, and Rhythm become visible as separate parts. Their state matches what is actually selected and audible.

One invitation reads: “Hear what a voice adds.” Selecting Lead voice adds that part to the current excerpt. A separate Hear alone action lets someone inspect one part, with an explicit route back to the previous combination.

The visitor learns that a song is made of independently controllable performances. The strip offers real actions immediately. Scrolling does not secretly enable or disable parts after the person makes a choice.

## Chapter 4 Meet the second deck

The right deck comes into equal visual emphasis. Its label is Next layer. A prepared Harmony candidate appears there, distinct from the left's committed parts.

The caption reads: “One more part can change the feeling.” Preview actions let the visitor hear the candidate alone or together with their selected demo layers. The candidate follows the same time reference as the demo so the relationship is audible.

Keep layer moves the harmony's named chip into the left strip with a brief transition. The right becomes ready for another part. This demonstrates the exact keep-and-add cycle later used for their own recording. Mark the harmony as a supplied demo part; operating the demo must not imply that the visitor performed it.

Keeping the demo candidate is optional. Visitors who continue scrolling still see a short visual illustration of the relationship, without silently mutating their mix or pretending they clicked Keep.

## Chapter 5 The handoff

Both decks settle into their final stable working positions. The short invitation reads: “What would you add?” Offer two explicit choices:

- Start my own idea creates a personal session with an empty left deck and a ready right deck.
- Sing with this demo retains the supplied context on the left and prepares the right for the person's own performance. Supplied and personal layers remain labeled distinctly.

This is the end of the scroll narrative. Choosing a path enters a workspace state within the same visual environment. Scroll position no longer advances the onboarding scenes. Ordinary scrolling remains usable for content such as a longer layer list; it cannot move the recording controls away through a camera transition.

Keep the demo exploration state so returning to it does not erase the person's choices or personal recordings. Returning to the story should be explicit and should never interrupt an active take.

## Recording the first personal layer

For Start my own idea, demo playback stops and its layer strip is replaced by an empty personal composition. The left reads “Your music starts here.” The right reads “Your first layer.” No demo audio carries over without the user's choice.

The right deck offers Enable microphone and the simple invitation “Sing, hum, or play a little.” Request permission only after that action. A responsive input meter confirms detected sound; make clear that this is a check, not yet a recording. If permission is denied or no sound is detected, offer a concise recovery step and an easy route back to exploration.

Do not require an account, project name, key, tempo, genre, or instrument choice before recording. A guitar performance can use the same microphone input as a voice.

Record offers an optional preparation countdown for getting hands onto an instrument. This is a readiness cue, not an imposed tempo. During the take, keep the scene still and show a red recording indicator, elapsed time, a growing waveform on the right, and a large Stop recording action. Do not grade the performance or interrupt with coaching. Scroll gestures do not scrub, stop, or discard the take.

After stopping, offer Listen, Keep layer, and Try again. Listening requires a deliberate action. Retrying preserves the previous take until a replacement is chosen. Keep layer adds the first performance to the left strip; its waveform and name move with it. The right offers Add another part.

The first phrase can be freely timed. When another part needs a repeating section, offer phrase selection then rather than forcing bars and tempo before the initial idea is captured. For adding a layer, the left supplies the selected existing music while the right records. Avoid unexpected live speaker playback of the microphone; headphone guidance can appear when accompaniment becomes relevant.

## Sound and accessibility

Attach small waveform strips to their layers and use one shared playback marker to make timing understandable. Muted parts keep dim waveform previews and explicit Off labels. An output indicator can fall quiet without making the recording appear empty or deleted.

All controls need readable text, adequate contrast, visible keyboard focus, and usable touch targets. Reduced motion preserves the same chapters with simple state changes and Next/Back navigation. On small screens, adapt the layout so Music so far and Next layer remain identifiable without shrinking an entire desktop console into unreadable controls.

Returning users should be able to resume a recording directly without repeating the story. Save and resume behavior must be represented accurately once the product's storage model is defined. Credits and genre choice can stay accessible at the edge of exploration.

## What to validate

Test the storyboard with Marcus using prepared audio before implementation. The key questions are whether he understands the left as the composition and the right as the next part, whether he can distinguish a supplied harmony from a personal take, and whether Keep clearly adds rather than replaces a recording.

Also test fast scrolling, reverse scrolling, ignoring sound prompts, skipping the story, stopping to explore, and transitioning into a microphone check. During recording, verify that users expect the scene to remain stable. Compare the scroll story with a direct console entry to ensure it earns its time through useful discovery.

The current static image predates the deck labels and scroll narrative. It communicates materials and silhouette, not the finalized states or interaction behavior.

## References and artifacts

- [Patatap](https://patatap.com/) is the interaction reference for immediate sound-and-shape response.
- [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) informs restrained translucency and separation of content from controls.
- Current visual direction: `MINIMAL_DJ_CONCEPT.png`
- Exact image prompt: `MINIMAL_DJ_CONCEPT_PROMPT.txt`
- Earlier explorations: `LANDING_DIRECTIONS.png` and `RETRO_LISTENING_ROOM.png`

The images were created with built-in image generation for exploration. This storyboard is a product proposal; no application code or scroll interaction has been built.
