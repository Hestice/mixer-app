# Audio app product research

15 November 2026 · Product research and evolving design hypotheses

The proposed product helps everyday music makers turn a sung or played idea into a composition they perform themselves, one audible layer at a time. Its central reward is hearing their parts come together and understanding what each contributes. The strongest starting hypothesis is a guided recording experience for casual singers and guitarists.

Marcus confirmed the desired first moment: “I sing or play each layer myself, with guidance.” This should guide decisions about automation, teaching, and the interface. Naming remains open. A Next.js and NestJS prototype now implements the listening room; see README.md for its current scope.

The initial product can serve Marcus alone. He is a musician returning after a long break caused by limited time, and wants this for his own recordings. The broader audience remains everyday music makers. The experience should welcome people back to music through small, satisfying sessions, with no pressure to maintain a streak or finish a complete song.

## Audience and purpose

Start with people who already enjoy singing, karaoke, or playing a few guitar chords but lose momentum when recording software asks them to become producers. This is a narrower, more useful initial audience than everyone who likes music. For positioning, “everyday music makers” describes the intended activity more clearly than “audiophiles,” which can suggest listening quality and equipment.

The central user need is: “When I have a musical idea, help me record it, add a part that fits, and hear something I made before the inspiration passes.”

Marcus's experience with BandLab and FL Studio is the initial problem signal. Broader demand and willingness to switch remain research questions; product documentation establishes available capabilities, not how easily beginners use them.

## Existing products and lessons

The observations below come from official product pages and manuals. The implications are design hypotheses, not results from hands-on usability testing.

| Reference | Documented capability | Implication for this concept |
| --- | --- | --- |
| [BandLab Splitter](https://help.bandlab.com/hc/en-us/articles/16560236938777-Using-BandLab-Splitter) | Separates a song into stems, provides individual playback and volume controls, and opens results in Studio. Output quality depends on the source. | Isolating song parts already exists. Test whether people can progress from listening to recording their own contribution without getting lost. |
| [FL Studio](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/basics_workflow.htm) | Its main workflow spans the Channel Rack, Piano roll, Mixer, and Playlist; it also offers linked instrument and audio track workflows. | A simpler product should reduce the concepts needed for the first recording. Merely hiding controls may leave the underlying workflow difficult to understand. |
| [Loopy Pro](https://loopypro.com/manual/) | Records and layers repeating sounds to construct musical arrangements, with deeper mixing, sequencing, and customization available. | Layering a personal performance is an established interaction worth studying. Test whether beginners understand when recording starts, ends, and repeats. |
| [Voloco](https://help.voloco.com/hc/en-us/articles/43546441410071-Voloco-App-User-Manual) | Combines vocal tuning, harmony, and effects, including changes after recording. | A vocal focus is already competitive. Explore the value of helping people learn and perform another part themselves. |
| [Moises](https://moises.ai/products/moises-app/) | Offers stem separation, pitch and speed changes, chord detection, section looping, and recording over music. Its [stem generation](https://moises.ai/features/stem-generation/) also creates instrumental parts from a user's musical idea. | Karaoke, practice, and assisted arrangement substantially overlap with this vision. “Simple music creation” alone is not a sufficient distinction. |
| [Hookpad](https://www.hooktheory.com/hookpad) | Offers chord and melody guidance, visual harmonic relationships, audio tracks, and arrangement tools. | Bring theory into decisions about the user's music. Test whether listening to alternatives before seeing labels makes guidance more approachable. |
| [Ableton Note](https://www.ableton.com/en/note/) | Focuses on musical sketches; Capture MIDI keeps an improvisation after it is played and detects tempo and length. | Study how to protect inspiration from setup friction. Its MIDI capture is a workflow reference, not evidence that arbitrary vocal or guitar recordings can be treated identically. |

The opportunity to validate is the combination of personal performance, approachable layering, and useful guidance within the same short session. None of this establishes an uncontested market gap.

## Define the musical actions clearly

Three different actions appear in the original vision:

- **Layering:** recording separate parts that play together, such as guitar, lead vocal, and another vocal.
- **Harmonizing:** creating a complementary pitched part. Another recording is not automatically a harmony; it might double the melody or add percussion.
- **Separating a song:** estimating instrument or vocal parts from an existing mixed recording. These extracted parts are not necessarily the original studio tracks.

For Marcus's preferred experience, “Add a harmony” should offer to teach a part the person can sing and record. Keep “Record my own part” available so guidance never becomes mandatory. Automatic harmony effects and generated accompaniment can be evaluated separately later.

The product should also distinguish adding separate layers from extracting them: a separately recorded guitar can be muted directly; guitar and voice recorded into one microphone together do not automatically become independently controllable parts.

## Proposed first session

Use a short musical phrase as the initial success unit. A complete song introduces arrangement decisions before the first reward.

1. **Capture the idea.** A prominent “Record an idea” action leads to singing, humming, or playing. Request microphone access in context. Avoid requiring a key, tempo, instrument library, or project name before the first take.
2. **Hear and keep it.** Offer playback, “Keep,” and “Try again.” Preserve the previous take when trying another. Make selecting a short section understandable without requiring editing terminology.
3. **Add a part.** Offer “Sing another part,” “Play an instrument,” and optional guidance. Let the person rehearse against the existing recording before committing to a take.
4. **Learn a harmony when wanted.** Preview one or two candidate lines in context, listen to the selected line alone, practice a short phrase, and record it. The guide can fade or stop for the final take. This is a proposed experience whose musical quality and feasibility need validation.
5. **Hear the composition grow.** Play the parts together. Make it easy to hear just one part, remove it temporarily, and bring it back. This comparison makes the contribution of each performance audible.
6. **Keep the result.** Save the session, export a listenable recording, and make returning to the unfinished idea easy.

For guitarists, a count-in and accessible recording controls matter because both hands may be occupied. Test recording with the headphones and devices people actually own. Voloco's [recording guidance](https://help.voloco.com/hc/en-us/articles/43546441410071-Voloco-App-User-Manual) illustrates that monitoring and headphone setup are part of the user experience, not merely background technical details.

## Interface directions to compare

| Direction | What the person sees | Potential strength | Main question |
| --- | --- | --- | --- |
| Layer stack | A card for each part, with a shared playback position and a prominent add-part action. | Makes the composition and individual contributions visible. | Can users understand timing and fix a section without a full editing view? |
| Looper | Large pads or circles that record and replay short phrases. | Makes repeated layering feel immediate and performative. | Do loop boundaries cause mistakes, and does repetition constrain the music they want to make? |
| Guided session | A sequence such as record, listen, rehearse, add, and compare. | Can teach unfamiliar actions when they become relevant. | Does the sequence support inspiration or feel like a compulsory lesson? |

The starting recommendation is a layer stack with optional guidance attached to the current part. Retain a common time reference so users can see when sounds happen together. Introduce a fuller timeline only when arranging sections or correcting placement becomes necessary. Test this against the other directions before selecting a design.

Give each layer a readable name, play-alone control, on/off control, volume, and an obvious way to retry. Use labels alongside icons and color. Keep recording, rehearsing, and listening states visibly distinct. Make undo and take preservation dependable so experimentation feels safe.

Favor actions people intend to perform: “Hear only this,” “Record another take,” or “Practice this phrase.” Introduce musical terms when they become useful rather than concealing them indefinitely.

## Learning through the user's music

An optional explanation should follow something the person just heard: compare two harmony choices, notice the difference, and then learn the relevant interval or chord relationship. Avoid presenting one harmony as universally correct; musical context and taste matter.

A daily exercise could reuse an existing project: “Add a second vocal to this phrase,” “Try a different rhythm under your melody,” or “Listen with the guitar removed, then bring it back.” The result is another musical contribution they can keep. Test whether this feels rewarding before investing in lessons, streaks, or a curriculum.

## Initial scope to validate

Prioritize recording a first idea, keeping separate layers, rehearsing against playback, retrying safely, controlling which parts are heard, basic volume balance, saving, and export. Include one narrow harmony-learning exercise to test the distinctive promise. A human-prepared guide can test that experience before committing to automatic guidance for arbitrary recordings.

Defer a broad instrument curriculum, public community, live collaboration, extensive effects, and full-song generation. Existing-song separation and karaoke remain valuable directions, but introduce a different starting activity from building one's own performance. Revisit them after learning whether the core recording loop brings people back.

The initial commercial question is whether guided creation provides enough value beyond tools these users already have. Explore what they currently use and pay for after observing real behavior; pricing would be premature at this stage.

## Research before implementation

Begin with Marcus's own recording sessions: observe what helps him return, capture an idea, add another part, and resume later. Personal usefulness is the first success criterion. When testing broader appeal becomes relevant, recruit roughly six to eight casual singers, karaoke enthusiasts, and guitarists, including people who tried recording software and abandoned it. This is a small qualitative study, not a representative market estimate.

Ask them to show the last musical idea they captured or lost. Learn what they wanted to add, where they stopped, whether they knew the part they wanted to perform, and what equipment they had nearby. Distinguish difficulty operating software from difficulty inventing or singing the next part; a cleaner interface alone cannot answer both problems.

Observe a comparable short task in familiar existing tools: record a phrase, add another performance, hear each separately, retry one take, and save. Record the decisions that require help and the points where motivation drops.

Then compare paper storyboards of the three interface directions using the same musical scenario. Pair them with a manually facilitated audio demonstration; static screens cannot test the emotional reward of hearing parts combine. Participants should know when a guide is prepared by a person rather than produced automatically.

Measure time to the first kept recording and first combined playback, assistance required, successful retry without losing work, and whether the person can explain what each layer contributes. Ask whether the result feels like their own creation and observe whether they voluntarily add another part or return to the project later.

An initial aspiration is a satisfying two-part performance within five minutes. Treat that as a target to test, not a performance claim. Favor the concept that reduces help while preserving musical ownership, even if another concept looks simpler on screen.

## Open decisions

- Whether the first session starts with guitar, lead vocal, or a short guided vocal exercise.
- Whether beginners need help inventing a harmony, performing it, or both.
- Whether phone or laptop use dominates when inspiration actually arrives.
- Whether a short repeating phrase feels liberating or restrictive.
- How much correction people want before the performance stops feeling like theirs.
- Whether repeat value comes primarily from making new sketches, developing old ones, or guided practice.

The next product decision should follow observed sessions: which experience most reliably helps a person perform a second part they are proud to hear alongside the first.

## Landing experience and discovery

Current visual direction: Marcus found the furnished retro booth too maximalist. Explore a minimalist modern console inspired by Apple, retaining the two-deck DJ silhouette, recognizable instrument symbols, visible layers, and restrained sound visualization. Open space, satin materials, and selective translucency replace room props and aged textures. The [updated storyboard](LANDING_EXPERIENCE.md) and [minimal DJ concept](MINIMAL_DJ_CONCEPT.png) supersede the earlier visual treatment below while preserving the discovery-to-recording journey.

Marcus wants visitors to hear and see the product's value before recording. The intended atmosphere is melancholic, curious, intimate, and gently guided. A proposed listening-room experience lets people explore a short song excerpt, discover its individual parts, and then perform a part themselves. The demo introduces the same layer controls used in their own projects.

Start with one strong acoustic example relevant to Marcus. Later, offer a small selection such as acoustic folk, mellow soul, and ambient electronic, with genre and mood labels. A broad genre catalog is unnecessary for personal validation. Genre variety should reveal different musical relationships, not simply change the background artwork.

The proposed sequence is:

1. **Hear the whole.** A clear “Listen and explore” button starts a short excerpt. Visitors choose when sound begins; playback and volume controls remain visible. “Record my own idea” is available immediately for those who already know what they want.
2. **Reveal the parts.** Show four or five clearly labeled layers, such as guitar, lead vocal, harmony, bass, and percussion. Selecting a part opens explicit “Hear alone” and “Turn off” actions. Keep position and labels stable as parts change.
3. **Offer one small invitation.** For example, “Try listening to the two voices together.” Let visitors explore freely or choose “Guide me.” Instructions should appear when useful and remain dismissible.
4. **Reward discovery with sound.** Removing the lead reveals the backing harmony; bringing both back reveals how they fit. A small optional explanation can identify what changed. Core controls and musical parts should not require solving a hidden puzzle.
5. **Move into performance.** Offer “Try singing this harmony” or “Start with my own idea.” The former leads through listening, rehearsal, and recording; the latter follows the existing guitar-to-vocal first-session proposal. Ask for microphone access only when recording begins.

Potential visual treatment: midnight blue or charcoal, warm cream text, muted amber accents, restrained texture, generous space, and gentle motion tied to audible parts. Use readable contrast, text labels, keyboard access, and a reduced-motion presentation. Atmosphere should not make controls difficult to find. Melancholy can come from timbre, pacing, and musical selection as much as color.

Returning users should land close to their unfinished recordings, with the demo still available. The discovery experience is an entrance into making music, not an obstacle to the next personal session.

## Interaction references for the landing experience

- [Ableton Learning Music](https://learningmusic.ableton.com/) begins with musical boxes that users switch on and off, then transitions toward making their own patterns. It is the strongest reference for an immediate demonstration with light teaching.
- [Incredibox](https://www.incredibox.com/) lets users add musical parts through characters and discover combinations that unlock animated choruses. Borrow the connection between exploration and an audible reward. A quieter visual treatment would better match Marcus's intended mood.
- [Patatap](https://patatap.com/) connects touch to sound and animated shapes. Borrow the immediate response to an action, while keeping controls labeled and the presentation calmer.

These references support interaction choices; the proposed melancholic listening-room aesthetic is a creative direction, not a usability finding.

## Music permissions for a public demo

Music suitable for this use exists, but permission must cover the intended use of the particular composition, recording, and separate parts. Permission for one rights holder's recording does not necessarily clear the underlying song; Creative Commons explains these overlapping rights in its [FAQ](https://creativecommons.org/faq/).

| Source route | Suitability and conditions |
| --- | --- |
| Marcus's original composition and recording | A practical first choice when Marcus controls the composition, lyrics, performances, and recording, and any included samples are cleared for this use. Keep separate recordings of each part. A newly recorded cover is a different rights situation. |
| Direct collaboration or commission | Request written permission covering public playback, interactive isolation and remixing, promotion, and any user export or sharing. Agree on rights to the composition, performances, recording, and supplied stems; payment alone should not be treated as clearance. |
| [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Allows copying, modification, distribution, and performance, including commercially, within the rights dedicated. Confirm provenance and coverage of underlying material; the label is not a warranty. |
| [CC BY](https://creativecommons.org/licenses/by/4.0/) | Allows commercial sharing and adaptation subject to the license terms, including attribution, a license link, and indicating changes. Check the exact license version and any third-party material. |
| Public-domain composition with a cleared recording | An old composition does not establish that a modern recording or arrangement is also public domain. Check the relevant rights and territories rather than relying on the song's age. |

[dig ccMixter's commercial-use collection](https://dig.ccmixter.org/free) is a concrete discovery source. Each candidate still needs a review of its license, contributors, source samples, and available stems. No particular song has been selected or cleared for this app.

Do not treat “free download” or “royalty-free” as blanket permission to expose isolated parts in an interactive product. For example, [TELEFUNKEN's multitrack library](https://www.telefunken-elektroakustik.com/pages/multitracks) expressly restricts its downloads to home studio and educational purposes and prohibits commercial reuse. Its existing download terms are not a suitable basis for a commercial landing demo.

For the first example, prefer a short original recording with separate parts. Label the experience as exploring the original recorded layers. If automatic separation is later demonstrated, show its actual output separately and describe that capability accurately. A polished original-stem demo must not imply that arbitrary uploaded songs will separate with the same quality.

Before publishing a selected demo, retain its source, rights holder, license or written permission, required credit, and the allowed playback, editing, and export uses. This is a selection framework, not clearance of a particular recording.


## Detailed landing storyboard

The [current listening-room storyboard](LANDING_EXPERIENCE.md) defines a five-chapter scroll narrative that progressively reveals the modern minimalist DJ console. The left deck holds the music so far; the right holds the next layer being auditioned, recorded, or reviewed. Keeping a layer moves it into the left composition and readies the right for another part. Both sides share a musical time reference; this is not a two-song DJ mixer.

Scrolling changes the scene and explanation; explicit actions start sound, alter layers, request microphone access, and record. At the handoff, Start my own idea clears the demo context for a personal session, while Sing with this demo retains clearly labeled supplied accompaniment. Choosing either path settles the scene into a stable workspace, so scrolling cannot advance onboarding or interrupt a take.

Marcus refined the visual direction from a furnished retro booth into a modern minimalist interface inspired by Apple, retaining the DJ silhouette and recognizable musical sources. The [minimal DJ concept](MINIMAL_DJ_CONCEPT.png) illustrates that visual direction but predates the deck roles and scroll states. Earlier [dimensionality](LANDING_DIRECTIONS.png) and [retro room](RETRO_LISTENING_ROOM.png) concepts remain as design history. No application code has been built.
